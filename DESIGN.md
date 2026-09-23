# Gradient Descent Sandbox — Implementation Plan & Architecture

Status: design only, nothing implemented yet. This is revision 3, closing
out the open decisions revision 2 had flagged: auto-restart defaults, the
two-warning differentiability model, the dataset-mode expression language
and its generalized (non-`x`/`y`) primary-variable model, embedded CSV
persistence with size limits, the split divergence-safeguard/rapid-increase-
warning design, the confirmed plain-text-plus-KaTeX equation editor, and
concrete grid-resolution numbers. §20 lists what's still open — all tunable
constants now, nothing structural.

**Note on CLAUDE.md**: the current `CLAUDE.md` in this directory is a generic
Python/`uv`/`pytest` template (S3, SMTP, jrunner, langsmith references) that
doesn't match the stack below. The language-agnostic rules (single
responsibility, function-size limits, no AI attribution, silent
fall-through enumeration) are followed throughout; the **Testing** section's
commands need the JS equivalents (`vitest`, `playwright`) once the stack is
confirmed.

---

## 1. Technology stack

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict mode) | Static types matter for a DSL/AST-heavy app. |
| App shell | React 18 + Vite | Fast dev loop, fits the panel-per-rule UI. |
| Global state | Zustand | Minimal boilerplate; works alongside non-React engine classes. |
| Simulation engine | Plain TS classes, framework-agnostic | Must run independently of React's render cycle (§6). |
| Expression/DSL parsing | **Custom recursive-descent parser, built incrementally** — see §3c for the explicit build-vs-buy decision | Full control over grammar, differentiable AST, error spans, and the security sandbox (§17); the parts an existing library *would* help with (tokenizing arithmetic) are the cheap 20%, not the hard 80% (statement DSL, dependency analysis, differentiation). |
| Loss-equation rendering | KaTeX, rendering the *parsed AST* back to LaTeX for read-only display; plain-text input box for editing | Gets the "Desmos-like readable equation" look without needing a full WYSIWYG math-input engine (MathQuill) in the initial version — see §7. |
| Update-rule editor | CodeMirror 6 with a custom lint extension | Multiline, code-like, and CodeMirror's diagnostic API gives line/character-located error squiggles for free — exactly what's required, autocomplete not required. |
| 3D surface view | Three.js via `react-three-fiber` + `drei` | Needs custom camera-mode toggle (rotate vs. pan) and raycasting to drag the start point on the mesh. |
| 2D contour/heatmap | Canvas 2D + `d3-contour` | Scales to fine grids; same drag interaction as the 3D view via plain 2D pointer coordinates. |
| Line charts (loss/iter/time/epoch) | Recharts for MVP, swappable later | Good enough for live-teaching point counts; see §16 for decimation strategy at scale. |
| CSV parsing (dataset mode, deferred) | PapaParse | Well-tested, streaming-capable CSV parser; parses data only, never executes anything from file contents. |
| Persistence | JSON (schema-versioned) + IndexedDB (`idb`) for autosave/history, File System Access API with download/upload fallback | No backend required. |
| Backend | None (static SPA) | No auth, no multi-user concerns, no server-side compute need. |
| Testing | Vitest (unit/integration), Playwright (interaction/e2e), `fast-check` (property tests for differentiation) | Playwright needed because core interactions are pointer/canvas/WebGL-driven, not just DOM assertions. |

---

## 2. Overall system architecture

```
┌─────────────────────────────────────────────────────────┐
│ Presentation (React components)                         │
└───────────────────────────┬───────────────────────────────┘
┌───────────────────────────▼───────────────────────────────┐
│ Application state (Zustand): AppStore, WorkspaceStore       │
│ — also owns the editing-behavior orchestration (§9):        │
│   "editing loss stops all sims", "editing a rule resets     │
│   just that rule", etc. are implemented here as store       │
│   actions, not scattered across components.                │
└───────────────────────────┬───────────────────────────────┘
┌───────────────────────────▼───────────────────────────────┐
│ Domain engine (plain TS, framework-agnostic)                │
│  ExpressionEngine   UpdateRuleEngine   SimulationRunner     │
│  GradientSource (FullGradientSource | DatasetGradientSource)│
│  Dataset            SeededRng          PersistenceCodec     │
└───────────────────────────┬───────────────────────────────┘
┌───────────────────────────▼───────────────────────────────┐
│ Rendering adapters (Three.js, D3, chart data selectors) —   │
│ read-only consumers of engine snapshots                     │
└─────────────────────────────────────────────────────────┘
```

Unchanged from revision 1: React holds a throttled snapshot of engine state;
the simulation engine itself is not React state (§6).

---

## 3. Expression-language design

### 3a. Loss-function grammar (single expression) — unchanged from rev. 1

```
expr := term (('+' | '-') term)*
term := unary (('*' | '/') unary)*
unary := '-' unary | power
power := atom ('^' unary)?
atom  := number | identifier | identifier '(' expr (',' expr)* ')'
       | '(' expr ')' | atom atom   // implicit multiplication, e.g. 4(y+1)
```

Supported functions: `sqrt abs sin cos tan ln log`, plus `min`/`max`/`pow`/
`exp` as future additions. Function arity is fixed and checked at parse
time. `log` is always binary — `log(x, base)` — there is no implicit-base
single-argument form; natural log is the separate unary `ln(x)`. This
resolves what would otherwise be an ambiguous "which base" question for a
bare `log(x)`.

### 3b. Update-rule DSL grammar — unchanged from rev. 1

```
program    := statement*
statement  := paramDecl | stateDecl | assignment
paramDecl  := 'parameter' ident '=' number 'range' number 'to' number
              ('step' number)? ('log')?
stateDecl  := 'state' ident '=' expr
assignment := ident '=' expr
```

### 3c. Parser architecture decision (answering §8's explicit question)

**Final answer: a custom parser, not an existing expression-parsing library
plus a bolted-on statement layer** — built incrementally so it doesn't
violate the "don't spend the whole first phase on the parser" sequencing
rule:

- The **spike** and **Phase 1 vertical slice** (§18) use a deliberately
  *minimal* grammar subset: numbers, `+ - * / ^`, parentheses, `x`/`y`,
  and 2–3 functions (`sqrt`, `abs`). This is genuinely small (roughly
  150–250 lines including the tokenizer) and is not "the complete parser and
  symbolic mathematics system" the sequencing decision warns against — it's
  a v0 grammar with no differentiation table, no statement DSL beyond a
  single hard-coded `state`/assignment pair, and no dependency analysis yet.
- Later phases **extend** this same parser (add functions, add the full
  statement grammar, add differentiation rules) rather than replacing it.
- The reason a third-party library (mathjs, expr-eval) isn't adopted even for
  the v0 subset: none of them expose an AST shape usable for (a) symbolic
  differentiation with our own rule table, (b) our own error-span format, or
  (c) a statement-sequencing layer with dependency analysis — we'd still
  write all of that ourselves, so adopting one only saves the tokenizer/
  Pratt-parser boilerplate for pure arithmetic, at the cost of a rewrite
  later when we hit its limits (most likely around differentiation).
  Building the minimal version ourselves from the start avoids that rewrite.

---

## 4. Variable, parameter, and state semantics

This section is normative — it's the contract the DSL compiler, the
`SimulationRunner`, and every recurrence/state test (§15) are built against.

- **`parameter name = value range lo to hi`** — persistent, UI-editable
  scalar. Remains fixed at whatever the slider/numeric control says until the
  presenter changes it through that control; a running step reads its
  *current* value as a constant. Never mutated by rule statements.
- **`state name = initExpr`** — persistent across iterations.
  - `initExpr` may reference parameters and **earlier** `state`
    declarations (evaluated once, in declaration order, at reset time) —
    e.g. `state b = a * 2` is valid if `a` was declared above it; forward
    references between state initializers are an undefined-variable error,
    same as in the statement body.
  - May be updated by **later assignment statements** in the rule body: a
    plain assignment whose LHS matches a declared state name commits a new
    value for that state variable, in effect for the *rest of the current
    step* and carried into the next iteration.
  - The value carried into iteration *t+1* is exactly whatever the state
    identifier equals at the end of iteration *t*'s statement list — last
    write wins, ordinary variable semantics, made "persistent" purely by the
    engine re-seeding the execution scope with it at the start of the next
    step.
- **Plain assignment with no prior `parameter`/`state` declaration** — an
  intermediate variable. Recomputed from scratch every iteration; never
  carried across iterations; not visible to the next step at all.
- **`x`, `y` (position)** — owned by the simulation engine, not declared by
  the rule author. **`x_next`/`y_next` are the required output values**: a
  rule must, by the end of its statement list, define both, or validation
  fails with "rule does not update position." The engine reads them
  automatically as next iteration's `x`/`y` — no extra `x = x_next` line is
  needed (or meaningful) because `x`/`y` aren't assignable targets in the
  grammar at all — they're read-only inputs, symmetrical with `gx`/`gy`.
- **Reset** restores **all** state variables (re-evaluating every `state
  ...` initializer in order) and position (`x, y` ← workspace start point)
  to their initial values, and clears the rule's trajectory/history.
  Parameters are **not** touched by Reset — a slider stays where the
  presenter left it, since Reset is "start this run over," not "undo my
  configuration."

### Primary variables: generalizing beyond x/y (for dataset mode, §7)

`x`/`y` are the concrete, fixed, always-spatial pair used everywhere in
surface mode. To support dataset mode's model parameters (`weight`, `bias`,
or generically `theta_0`, `theta_1`, …) without hardcoding "x/y" as special
strings throughout the engine, `x`/`y` are internally one instance of a
general **primary-variable list**: `{ name: string }[]`, the set of
variables a rule's `${name}_next` outputs are required to supply.

- **Surface mode**: this list is always exactly `[{name: "x"}, {name:
  "y"}]` — fixed, never presenter-renamed, always spatial and draggable on
  the 3D/contour views. This is the only mode Phases 1–6 implement; nothing
  about surface mode changes from earlier sections.
- **Dataset mode** (Phase 7): the presenter declares the primary-variable
  list directly (defaulting to `theta_0, theta_1, …` if left unnamed, per
  the decided internal convention), e.g. `weight, bias`. These are **not**
  spatial, are **not** draggable, and are not the same thing as DSL
  `parameter` declarations (which stay reserved for tunable hyperparameters
  like a learning rate — model parameters are the variables *being
  optimized*, analogous to `x`/`y`, not hyperparameters *controlling* the
  optimization).
- This is the one place this plan pays for generality the current phases
  don't use yet (surface mode's list is always length-2, fixed names) — it's
  a small, already-scoped-in cost because Phase 7 needs it, not speculative
  abstraction: without it, generalizing later would mean threading "x"/"y"
  string literals out of every place they're currently hardcoded.
- Scope limit: both modes target **exactly two** primary variables for
  every phase in §18 (matching the spec's 2D loss-surface starting point).
  The data model doesn't hardcode that count to 2, but no phase here builds
  UI or tests for N > 2 — that's a future extension the architecture
  doesn't block, not a current deliverable.

### Worked recurrence example (validates the mechanism against the user's own test case)

```
state t = 2
t_next = t^2
t = t_next
```

Trace: iteration 0 seeds `t = 2` (from the initializer). Step 1: `t_next =
t^2 = 4`, then `t = t_next` commits `t = 4` for the next iteration. Step 2:
`t_next = 4^2 = 16`, commit `t = 16`. Step 3: `t_next = 16^2 = 256`, commit
`t = 256`. This reproduces `t_0=2, t_1=4, t_2=16, t_3=256` exactly, and the
mechanism is identical for velocity/momentum accumulators, moving averages,
and moment estimates — arbitrarily many `state` declarations, no
special-casing per optimizer. This example becomes a literal unit test (§15).

### Parameter edits mid-run

Unchanged from rev. 1: a parameter change takes effect on the next step
evaluation for a *running* rule; it is never retroactive. Past trajectory
points, loss history, and state history are not recomputed. This matches
decision §5's "editing a parameter changes its value for future steps but
does not rewrite previous history," and is tested directly (§15).

---

## 5. Differentiation strategy (revised)

- **Symbolic differentiation is used only for a documented, closed set of
  smooth operations**: `+ - * /`, unary minus, `^`/`pow` with the standard
  power rule, and the chain rule through `sqrt exp log sin cos`. Each has one
  differentiation rule, unconditionally correct within their real-valued
  domain.
- **Any expression containing `abs`, `min`, or `max`** (or, in the future,
  any function not on the smooth list) **is not symbolically
  differentiated at all**. The whole gradient for that expression falls back
  to **numerical differentiation** (central difference) instead of a mixed
  symbolic/numeric tree — this is simpler to implement and reason about than
  partial differentiation, and per decision §2, custom subgradient rules for
  `abs`/`min`/`max` are explicitly **not** built in the initial version.
- **Two separate, conservative, static warnings** — confirmed as two
  distinct messages rather than one combined one, since they mean different
  things to a presenter:
  - **"This function may be nondifferentiable."** — triggered purely by the
    AST containing `abs`, `min`, or `max` anywhere (kinks in the loss
    surface).
  - **"This function may be undefined for some inputs."** — triggered by
    the AST containing `log`, `sqrt`, or `/` whose argument/denominator
    isn't syntactically guaranteed positive/nonzero (domain risk, e.g.
    `log(x)`, `1/x`, `sqrt(y)`).
  - Both checks are a single AST walk, purely syntactic (no interval/domain
    analysis of the actual expression's range) — deliberately not "complex
    domain analysis," per the decision to keep this simple. They will
    over-warn on functions that are smooth/defined almost everywhere (e.g.
    `abs(x - x)` is always `0` and perfectly smooth, but still triggers the
    nondifferentiability warning) — an accepted, documented trade-off, not a
    bug to fix later.
  - **Informational only**: displayed as badges next to the gradient
    display (§7); they never block editing, running, or simulating the
    function. Independent of whether numeric or symbolic differentiation is
    actually used underneath — they describe the *function*, not the
    *method*.
- **Numerical differentiation** (central difference, configurable step size
  with a sane default) is the automatic fallback described above, and
  remains separately available as an explicit user-selectable mode.
- **Manual override**: unchanged from rev. 1 — presenter-supplied `gx =
  ...`/`gy = ...` expressions replace the computed gradient entirely, parsed
  and validated the same way, with a clear "using custom gradient" indicator.

---

## 6. Simulation-loop design (unchanged core, phase note added)

Core design (per-rule `SimulationRunner`, app-level `requestAnimationFrame`
scheduler ticking active runners, throttled React snapshot) is unchanged
from rev. 1 — see the architecture diagram in §2 and the runner interface:

```
class SimulationRunner {
  status: 'idle' | 'running' | 'paused' | 'error' | 'stale'
  step(): StepResult
  run(mode: RunMode): void
  pause(): void
  reset(): void
}
```

`'stale'` is a new status (added per §9 editing-behavior rules): a rule
whose loss function was just edited out from under it sits in `'stale'`
rather than `'idle'` or `'error'` — same "not running" behavior, but the UI
renders it distinctly (dimmed/disconnected trajectory) so the presenter
isn't confused about *why* it stopped. `reset()` clears `'stale'` back to
`'idle'` against the new loss function.

**Phase note**: Phase 1 (§18) uses *numerical* gradient computation
exclusively — symbolic differentiation is deliberately introduced in a later
phase, per the development-sequencing decision (§8).

---

## 7. Batch and dataset mode (redesigned)

**Surface mode is the permanent default**, not a placeholder:
- Loss is a user-defined `f(x, y)`.
- `gx`/`gy` come from symbolic or numerical differentiation of that single
  function (§5).
- No dataset concepts (`epoch`, `batch_index`, etc.) are computed, stored, or
  displayed anywhere in the UI unless dataset mode is explicitly turned on
  for that workspace.

**Dataset mode is deferred (Phase 7, §18) and does not synthesize a dataset
from the surface.** A generic `f(x, y) = (x-3)^2 + 4(y+1)^2` has no inherent
notion of examples or per-example loss, and the architecture doesn't pretend
otherwise. Instead:

**Per-example loss reuses the §3a expression grammar unchanged**, extended
only so CSV column names resolve as additional read-only identifiers
alongside the primary variables (§4) — no separate mini-language:

```
prediction = weight * feature + bias
error = prediction - target
loss = error^2
```

Here `feature` and `target` are CSV columns (read-only per-row inputs);
`weight` and `bias` are this workspace's primary variables (§4) — the
things being optimized, entered here as an ordinary multi-statement
expression sequence (this per-example loss definition is itself a small
DSL-like sequence of named assignments ending in `loss = ...`, reusing the
same parser as the update-rule body, just without `parameter`/`state`
declarations, which aren't meaningful for a per-example loss).

```ts
interface Dataset {
  columns: string[];
  rows: Record<string, number>[];   // loaded from CSV via PapaParse
}

interface PerExampleLossDef {
  sourceText: string; ast: StatementList;  // reuses §3b's statement grammar
                                            // minus parameter/state decls
}

interface GradientSource {
  sample(coords: Record<string, number>, rng: SeededRng, ctx: IterContext): {
    batchGradient: Record<string, number>;  // one entry per primary variable
    batchLoss: number;
    fullGradient?: Record<string, number>;
    fullLoss?: number;
    epoch?: number; batchIndex?: number; examplesProcessed?: number;
  };
}
```

- `FullGradientSource` (surface mode): `batchGradient === fullGradient`,
  computed from `f`'s symbolic/numeric gradient over the fixed `x`/`y` pair;
  no dataset fields populated.
- `DatasetGradientSource` (Phase 7): wraps a `Dataset` + `PerExampleLossDef`
  + this workspace's primary-variable list (§4, e.g. `weight, bias`).
  Per-example gradient is computed by differentiating the per-example loss
  with respect to each primary variable (same differentiation engine as §5,
  evaluated once per row, with each CSV column bound as a constant for that
  row), averaged over a sampled mini-batch (size = the batch-size
  *simulation setting*) for `batchGradient`, or over every row for
  `fullGradient`. Tracks `epoch`/`batch_index`/`examples_processed`
  internally. Never infers examples by sampling an arbitrary surface — the
  dataset and per-example loss are always explicit, user-provided inputs.

The DSL itself never special-cases which `GradientSource` is active — a
rule referencing `batch_gradient_x` (surface mode) or the analogous
per-variable batch-gradient binding (dataset mode) works identically in
structure regardless of source.

### Dataset mode's UI differs from surface mode, not just its data model

Per the model-parameter decision: dataset mode has **no spatial position
and no draggable starting point** — `weight`/`bias` (or `theta_0`/`theta_1`
if left unnamed) are edited via plain numeric inputs, not a 3D/contour drag
target. The 3D surface and contour views are **disabled** in dataset mode
(there's no 2-input scalar field to plot — the "surface" would be loss vs.
two model parameters averaged over the whole dataset, which is a valid but
different and more expensive visualization, explicitly out of scope for the
phases in §18). In their place, dataset mode shows per-primary-variable
value-vs-iteration plots alongside the existing loss-vs-iteration/epoch
charts, reusing `MetricCharts` (§14) rather than building a new chart type.

---

## 8. Visualization-domain settings (new section)

Explicitly **not** built: sliders for curvature, ravine width, or any other
built-in-landscape property — the loss function itself is the only thing
that shapes the surface.

**What *is* user-controlled**, as workspace-level `VisualizationState`
fields (shared across all rules in a workspace, since the surface is
shared):

```ts
interface VisualizationState {
  xMin: number; xMax: number; yMin: number; yMax: number;
  gridResolution: number;            // e.g. 40–200 samples per axis
  zClip?: { min?: number; max?: number };
  boundsMode: 'auto-fit' | 'fixed';
  camera: { /* position, rotate-vs-pan mode, ... — unchanged from rev. 1 */ };
}
```

- **Auto-fit**: bounds are recomputed from the trajectory extent (with
  margin) whenever a run is reset or bounds mode is switched to auto-fit;
  they do *not* continuously rescale during a run (that would make the
  surface visually swim while a presenter is mid-explanation).
- **Fixed**: presenter sets exact `xMin/xMax/yMin/yMax` via numeric inputs;
  never recomputed automatically.
- **Grid resolution** (confirmed concrete limits): a single presenter-facing
  numeric control, **default 80**, **minimum 30**, **maximum 200** samples
  per axis. Editing it **debounces** the actual mesh/contour recompute
  (§16) — the control itself updates instantly, the expensive regeneration
  fires after the presenter stops typing/dragging the control for a short
  delay. Entering or dragging past 200 shows the control in a disabled/
  warning state and clamps to 200 rather than silently accepting an
  arbitrary number (protects against an accidental typo like `2000`
  freezing the tab).
- **Interaction-time downsampling**: while the camera is actively being
  rotated/panned/zoomed (§14) or the start point is being dragged, the
  surface/contour temporarily renders at a lower resolution than the
  configured setting (e.g. capped around 30–40, independent of the
  presenter's chosen default) for responsiveness, then re-renders once at
  the full configured resolution the moment interaction ends. This is a
  rendering-only optimization — it never changes the stored
  `gridResolution` setting, only what's drawn mid-gesture.
- **Invalid-value handling** (`log(x)`, `sqrt(x)` for `x<0`, `1/x` at
  `x=0`, etc.): the surface/contour evaluator computes `f` at every grid
  cell; any cell producing `NaN` or `±Infinity` is marked **masked**, not
  clamped or substituted. `Surface3D` skips mesh faces with any masked
  corner (rendering a visible gap/hole); `ContourPlot2D` skips masked cells
  before running `d3-contour` and paints them with a distinct "invalid
  region" hatch/fill so it's visibly different from "outside the plotted
  bounds." This is a rendering-layer concern, deliberately separate from the
  runtime NaN/Inf *simulation* guard in §12 — a point can be perfectly valid
  to simulate while sitting next to a masked region of the surface (e.g. the
  trajectory approaches but never reaches `x=0` for a `1/x` term).

---

## 9. Editing behavior and invalidation rules (new section)

Each rule below maps directly to a store action, so the behavior is a single
well-tested code path rather than something re-derived ad hoc in components:

| Action | Effect |
|---|---|
| Edit loss-function text | All rules' runners → paused (if running) then `'stale'`. Loss/rule **source text is preserved** exactly as typed (never cleared on error or on stop). Existing trajectories remain visible but rendered in a visually distinct "stale" style (per rule status, §6) since they belong to the old surface. Presenter must press Reset on a rule to re-seed it against the new loss and clear the stale trajectory. |
| Edit one rule's DSL text | Only **that** rule stops and resets (state/position re-initialize, trajectory clears); other rules and their runners are untouched. |
| Drag the start point | All **active** (running) rules pause the moment a drag begins (a trajectory mid-flight shouldn't visually jump when the shared start point moves). On pointer release, the shared `Workspace.startPoint` updates. The presenter then either presses Run manually, or — if the workspace-level "auto-restart after drag" toggle is on — all rules that were running before the drag automatically reset and resume against the new start point. Default: **off** (manual Run) — confirmed, so a presenter doesn't lose control mid-explanation unless they've deliberately opted in. Applies only in surface mode; dataset mode has no draggable start point (§7). |
| Edit a parameter (slider or numeric box) | Value changes take effect on that rule's *next* step; already-recorded trajectory/loss/state history is untouched — no retroactive rewrite (§4). |
| Change the random seed | The affected rule(s) must be reset before the new seed takes effect — running mid-stream on a changed seed would produce a trajectory that's neither the old nor the new seed's sequence, which is exactly the kind of ambiguity §5 (rev. 1) already ruled out for parameters; seed gets the same treatment. |
| Change visualization bounds/grid resolution/z-clip | **Does not** stop or reset any simulation — these are purely rendering-domain settings, orthogonal to simulation state. |

All of the above are surfaced in the UI, not just implemented silently: a
stale rule's panel shows a "stale — reset to apply new loss" badge; a
running-then-auto-paused-by-drag rule shows "paused (start point moved)" in
its status chip; the auto-restart toggle lives next to the start-point drag
affordance itself so its effect is discoverable at the point of use.

---

## 10. Reproducibility (revised)

- Default seed: **42**, editable per workspace.
- **No byte-identical cross-browser/cross-machine guarantee.** The
  requirement is: identical settings + seed ⇒ deterministic trajectory
  *within a single runtime*, and cross-runtime comparisons in tests use a
  numerical tolerance (e.g. `Math.abs(a - b) < 1e-9` relative, not `===`),
  acknowledging that floating-point transcendental functions (`exp`, `sin`,
  …) can differ in their last bit across JS engines.
- Each rule instance gets an independently **derived** RNG sub-stream
  (`deriveSeed(workspaceSeed, ruleId)`), so rule A's stochastic trajectory is
  identical whether it runs alone or concurrently with rule B — tested
  directly (§15).
- Every saved `ExperimentRecord` embeds the seed and noise level, unchanged
  from rev. 1.

---

## 11. Equation editor (revised)

**Loss-function editor**: plain-text input (validated live by the parser
from §3a) with a **read-only KaTeX-rendered preview** directly below it,
generated by walking the parsed AST and emitting LaTeX (not by asking the
user to type LaTeX). This gets the "looks like a real equation" Desmos
quality without building or integrating a full WYSIWYG math-input widget
(MathQuill) in the initial version. If a restricted LaTeX-*input* mode is
pursued later, it would support only a fixed subset (fractions, superscripts,
`\sqrt{}`, named functions) mapped onto the same §3a grammar — not arbitrary
LaTeX, which is a typesetting language with far more surface area than this
app needs. Syntax errors render inline under the plain-text box with the
offending span underlined (using the parser's error spans, §3a); the
KaTeX preview simply doesn't update (keeps showing the last valid render)
while the text is invalid, so the presenter never sees a broken equation
render.

**Update-rule editor**: a multiline CodeMirror 6 instance per rule panel.
Errors (undefined variable, circular reference, invalid parameter range,
etc. — §12) are reported as `{ line, column, message }` triples and rendered
as CodeMirror diagnostics (squiggle + hover message), which is exactly the
"line and character locations" requirement — no custom error-widget code
needed beyond feeding CodeMirror's lint extension. Autocomplete is
explicitly out of scope, confirmed.

---

## 12. Data structures (core types, updated)

```ts
interface Workspace {
  id: string; name: string;
  primaryVariables: { name: string }[];   // §4; fixed [x,y] in surface mode
  lossFunction: LossFunctionDef;          // surface mode only
  startPoint: { x: number; y: number };   // surface mode only
  seed: number;
  noiseLevel: number;
  simLimits: SimLimits;                   // §17, decision 6
  visualization: VisualizationState;      // §8, surface mode only
  autoRestartAfterDrag: boolean;          // §9, default false, surface mode only
  datasetMode?: {
    dataset: Dataset;
    perExampleLoss: PerExampleLossDef;
    initialValues: Record<string, number>;  // one per primary variable, numeric-entry only (§7)
  };
  rules: RuleInstance[];
  history: ExperimentRecord[];
}

interface LossFunctionDef {
  sourceText: string; ast: ExprNode;
  gradientMode: 'symbolic' | 'numeric' | 'manual';
  manualGradient?: { gx: string; gy: string };
  mayBeNondifferentiable: boolean;   // §5: abs/min/max present
  mayBeUndefinedForSomeInputs: boolean; // §5: unguarded log/sqrt/division present
}

interface SimLimits {
  maxIterations?: number;
  maxAbsPrimaryVariableValue: number;   // decision 6 default: 1_000_000
  maxAbsLoss: number;                   // decision 6 default: 1_000_000_000_000
  rapidIncreaseWarningFactor: number;   // non-fatal warning only, e.g. 2.0 (§17)
}

interface RuleInstance {
  id: string; name: string; color: string; visible: boolean;
  sourceText: string; compiled: CompiledRule;
  parameters: ParameterDef[];
  stateVars: Record<string, number>;      // live values, §4
  coords: Record<string, number>;         // keyed by primaryVariables names;
                                           // {x, y} in surface mode
  status: 'idle' | 'running' | 'paused' | 'error' | 'stale';   // §6
  trajectory: TrajectoryPoint[];
  runHistory: ExperimentRecord[];
}
```

`TrajectoryPoint`, `ExperimentRecord`, `Dataset`, `PerExampleLossDef` as
defined in §7; unchanged fields not repeated here. `SimLimits` replaces the
single `divergenceLossThreshold` from earlier drafts with the split
absolute-parameter-bound / absolute-loss-bound / warn-only-factor design in
§17.

---

## 13. UI component hierarchy (updated)

Same top-level structure as rev. 1 (`TabBar → Workspace → LeftPanel /
CenterView / SecondaryVizPanel / StatusHUD`), with additions:

- `<LeftPanel>` gains a `<VisualizationSettingsPanel>` (bounds, grid
  resolution with its debounced control and max-resolution warning state,
  z-clip, auto-fit/fixed toggle — §8) and, only when dataset mode is on, a
  `<DatasetPanel>` (CSV upload with a file-size warning per §16, column
  mapping, per-example loss editor, and numeric — not draggable — initial
  value inputs for each primary variable, §7) — collapsed/hidden entirely
  in surface mode, per §7. When dataset mode is active, `<CenterView>`'s
  `<Surface3D>` is disabled and `<SecondaryVizPanel>`'s `<ContourPlot2D>` is
  hidden; `<MetricCharts>` gains a per-primary-variable value-vs-iteration
  view in their place.
- `<LossFunctionEditor>` now contains the plain-text input, its KaTeX
  preview, the gradient display, and the differentiability warning badge
  (§5, §11).
- `<RuleEquationEditor>` is the CodeMirror 6 instance (§11) rather than a
  generic text box.
- Rule panels gain a status-driven badge reflecting `'stale'` vs `'error'`
  vs normal statuses (§6, §9).

---

## 14. Visualization approach

Unchanged from rev. 1 for camera/drag mechanics, with the masked-region
rendering from §8 added to both `Surface3D` (skip faces with a masked
corner) and `ContourPlot2D` (skip cells before `d3-contour`, distinct fill
for masked area). Drag-to-set-start-point now also triggers the pause
behavior from §9 (pause active rules on drag start, commit start point on
release, optionally auto-restart).

---

## 15. State-management approach

Unchanged from rev. 1: Zustand for reactive UI/metadata state; hot
per-frame simulation state and trajectory arrays live outside Zustand,
pushed into a throttled snapshot slice. The new `'stale'` status and
`autoRestartAfterDrag` flag are ordinary Zustand-held metadata, not
performance-sensitive.

---

## 16. Persistence and file format

Unchanged core design (JSON, schema-versioned, IndexedDB + File System
Access API) from rev. 1, with:
- `Dataset` rows are **embedded in the saved workspace JSON by default**
  (confirmed) — a saved workspace reopens standalone, with no dependency on
  re-locating the original CSV. A file-size check runs at CSV upload time:
  **warn** above roughly 2&nbsp;MB (a save file that large is still fine but
  worth flagging), **refuse to embed** above roughly 25&nbsp;MB with a clear
  message suggesting a smaller sample — both thresholds are workspace-
  agnostic constants, easy to raise later, not settings a presenter tunes
  per workspace. An external-file-reference mode (store a filename/hash and
  prompt for re-upload instead of embedding) is an explicitly deferred
  future option for datasets that outgrow embedding, not built now.
- Experiment CSV export gains dataset-mode columns (`epoch, batch_index,
  batch_loss, full_loss, ...`) when applicable, hidden otherwise — consistent
  with §7's "batch concepts aren't displayed unless dataset mode is active."

---

## 17. Error-handling strategy (updated matrix, incl. divergence safeguards)

### Divergence safeguards (decision 6 — supersedes rev. 1/2's "rapidly
increasing loss ⇒ stop" row)

A temporary loss increase is normal and expected (momentum overshoot, noisy
gradients) and **must not** stop a run by itself. `SimulationRunner.step()`'s
post-step guard now runs exactly these checks, in order, each a deliberate
decision rather than a fallthrough:

| Check | Trigger | Outcome |
|---|---|---|
| Non-finite value | Any of loss, `gx`/`gy` (or the dataset-mode gradient), or any primary variable's new value is `NaN` or `±Infinity` | **Stop.** Runner → `'error'`, last valid state preserved. |
| Primary-variable safety bound | `\|value\| > simLimits.maxAbsPrimaryVariableValue` for any primary variable, **default 1,000,000**, configurable per workspace | **Stop.** Same as above. |
| Loss safety bound | `loss > simLimits.maxAbsLoss`, **default 1,000,000,000,000**, configurable per workspace | **Stop.** Same as above. |
| Rapid loss increase | `loss > previousLoss * simLimits.rapidIncreaseWarningFactor` (a simple, tunable ratio, not a trend/slope model) | **Non-fatal warning only** — surfaced in the Status HUD and on the rule panel, run **continues**, no state preserved/reverted because nothing was lost. |

Only the first three enter `'error'` status; the fourth is purely
informational, matching the decision that "enter an error state only when
numerical safety limits are crossed."

### Remaining rows (unchanged from rev. 1/2 unless noted)

| Condition | Detection point | Handling |
|---|---|---|
| Invalid surface region (`log`, `sqrt`, `1/x` domain violations) at **render** time | Grid evaluation in `Surface3D`/`ContourPlot2D` | Cell marked masked, rendered as a gap/hatch — **not** a crash, **not** the same code path as the simulation-time guards above |
| Editing loss/rule text while a rule is running | Store action (§9) | Not an error at all — a deliberate `'stale'`/reset transition, distinguished from `'error'` status precisely so presenters don't mistake "I edited the equation" for "something broke" |
| Dataset CSV fails to parse / missing required columns (Phase 7) | `Dataset` load step | Rejected at load with a specific message ("column 'y_true' not found"); dataset mode UI stays disabled until a valid file is loaded |
| Dataset CSV exceeds the embed size limit (§16) | CSV upload step | Warned above ~2 MB, refused above ~25 MB with a message suggesting a smaller sample |
| Grid-resolution control set above 200 (§8) | `VisualizationSettingsPanel` input handling | Clamped to 200, control shown in a disabled/warning visual state, not silently accepted |

---

## 18. Development sequencing and phases (rewritten per decision §8)

### Spike (time-boxed, before Phase 1 is "done")

Not a shippable phase — a proof of concept to validate the parser-and-
architecture decision in §3c before committing further. Demonstrates, in the
smallest possible code: parsing a loss equation, computing/approximating its
gradient (numeric only), rendering the surface, parsing one stateful update
rule, running several iterations, generating one parameter slider, and
reporting a syntax error with a location. If this spike reveals the custom-
parser approach is materially harder than expected, this is the point to
reconsider §3c — not after Phase 3.

### Phase 1 — Vertical slice

Scope: one loss equation (minimal grammar, §3c), **numerical** gradient
only, one update rule written and compiled through the **real** DSL
pathway (§3b/§3c) — a restricted grammar subset (fewer statement types,
fewer functions) is fine, but it must be the actual user-editable
parser/compiler, never a bespoke hard-coded gradient-descent
implementation that bypasses the DSL — one starting point,
**drag-to-set-start-point on both the 3D surface and 2D contour** (moved
into this phase rather than deferred, since it's core interaction per the
spec, not a later polish item), 3D surface + 2D contour, play/pause/reset/
step, one animated trajectory, basic syntax validation.
Acceptance: user types a loss equation, sees the surface and contour
render; a rule *typed into the DSL editor* runs and visibly converges;
dragging the start point on either view updates it and pauses any active
run per §9; pause/reset/step all work; a syntax error shows inline.

### Phase 2 — Intermediate variables + persistent recurrence state

Scope: generalize the DSL to arbitrary `state`/intermediate/parameter
declarations per §4, dependency analysis (undefined/circular detection),
the `x_next`/`y_next` position contract.
Acceptance: the `t_next = t^2` recurrence (§4) produces `2, 4, 16, 256`
exactly in a unit test; an arbitrary number of user-named state variables
(not just `vx`/`vy`) works; Reset restores all state and position (§4, unit
tested).

### Phase 3 — Parameters and generated sliders

Scope: `parameter ... range ... to ...` → auto slider + numeric control,
log-scale option, reset-to-default, live editing while paused/running per
§4's future-only semantics.
Acceptance: changing a slider mid-run affects the next step only; past
history is provably unchanged (unit tested, §15).

### Phase 4 — Multiple update rules and comparison

Scope: N rule panels, independent namespaces, per-rule
color/visibility/reset, concurrent running, comparison summary table.
Acceptance: two independently-configured rules run concurrently with
independent state and independent play/pause/reset; two *identically*
configured rules (same seed) produce identical trajectories (unit tested).

### Phase 5 — Symbolic differentiation

Scope: full smooth-function differentiation table (§5), automatic numeric
fallback for `abs`/`min`/`max`, both differentiability warning badges (§5),
manual override.
Acceptance: symbolic gradient matches hand-computed values for the smooth
set within tight numerical tolerance (not required to be bit-exact, per
§10/decision 6's tolerance-based-testing rule); property-based tests
confirm symbolic ≈ numeric within tolerance across random smooth
expressions; a loss containing `abs` automatically uses numeric
differentiation and shows the "may be nondifferentiable" warning; a loss
containing an unguarded `log`/`sqrt`/division shows the "may be undefined
for some inputs" warning; neither warning blocks running.

### Phase 6 — Noise and reproducibility

Scope: `SeededRng`, derived per-rule sub-streams, noise slider, true-vs-noisy
gradient display.
Acceptance: identical seed+settings reproduce the same trajectory within a
runtime; rule A alone vs. A-with-B produces the same trajectory for A (both
unit tested, §15).

### Phase 7 — Dataset and CSV support

Scope: CSV loading (PapaParse) with the embed-by-default persistence and
size warning/limit (§16), `Dataset`/`PerExampleLossDef`/
`DatasetGradientSource` (§7), the generalized primary-variable list (§4)
driving named model parameters (`weight`/`bias` or default `theta_0`/
`theta_1`) instead of `x`/`y`, numeric-only initial-value entry (no
draggable start point, no 3D surface — replaced by per-primary-variable
value-vs-iteration plots, §7), epoch/batch UI, `epochs`/`seconds` run modes.
Acceptance: loading a CSV and defining a per-example loss (e.g. `prediction
= weight*feature + bias; error = prediction - target; loss = error^2`)
produces correct full- and mini-batch gradients (checked against a
hand-computed small dataset, within tolerance); the model-parameter names
the presenter chose appear throughout the UI in place of `x`/`y`; surface
mode is completely unaffected (dataset UI, including the disabled 3D/
contour views, stays hidden when the mode is off).

### Phase 8 — Persistence and export

Scope: workspace save/load, experiment export (JSON+CSV), replay mode.
Acceptance: save → reload reproduces an identical, re-validated workspace
(equations, parameters, state init, colors, settings — unit tested, §15).

### Phase 9 — Performance and hardening

Scope: decimation for long runs, masked-region rendering polish (§8),
completing the full error-handling matrix (§17), profiling under several
concurrent long-running rules.
Acceptance: a rule configured to genuinely diverge is caught by the
`maxAbsLoss`/`maxAbsPrimaryVariableValue` safety bounds (§17) and recovers
cleanly on Reset, while a rule that merely oscillates upward for a few
steps (e.g. high-momentum overshoot) keeps running and only shows the
non-fatal rapid-increase warning; UI stays responsive with 5+ rules running
continuously; surface renders correctly around a `log(x)`/`1/x` domain gap
without crashing (unit + visual test, §15).

---

## 19. Testing strategy and acceptance tests (expanded)

Approach (unit/property/integration/e2e split) unchanged from rev. 1 (§15).
The following acceptance tests are now explicit requirements, each mapped to
the phase that introduces the capability it checks:

1. **One-step gradient descent vs. hand-computed result** (Phase 1/5) — a
   known loss + known `eta` produces a position matching a manually
   calculated value within tolerance.
2. **One-step momentum vs. hand-computed result** (Phase 2) — same idea with
   the `vx`/`vy` recurrence from the spec's original example.
3. **Persistent recurrence across multiple iterations** (Phase 2) — the
   `t_next = t^2` case, asserting the exact sequence `2, 4, 16, 256`.
4. **Reset restores all state and position** (Phase 2) — run several steps,
   reset, assert every `state` var and `x`/`y` match their initializers.
5. **Multiple rules maintain independent state** (Phase 4) — two rules with
   differently-named state variables, or the same names, don't leak into
   each other's scope.
6. **Two identical rules produce identical trajectories** (Phase 4/6) — same
   config + same seed ⇒ same trajectory, within tolerance (§10).
7. **Parameter changes affect future steps, not past history** (Phase 3) —
   change a slider mid-run, assert prior trajectory points are byte-for-byte
   unchanged.
8. **Invalid equations produce localized errors** (Phase 1/11) — a malformed
   loss or rule string produces an error with a specific line/column, not
   just "something's wrong."
9. **Divergence preserves the last valid state, and a merely-oscillating
   loss does not stop the run** (Phase 9) — a rule configured to blow up
   (huge learning rate, hitting `maxAbsLoss`/`maxAbsPrimaryVariableValue`)
   stops with the last pre-divergence state intact, not `NaN`; a separate
   test asserts a rule whose loss increases for a few steps (e.g. momentum
   overshoot, below the safety bounds) keeps running and only raises the
   non-fatal rapid-increase warning (§17).
10. **Dragging the starting point stops active simulations** (Phase 9,
    depends on §9's orchestration) — running rules transition to paused the
    moment a drag begins.
11. **Save/reload round-trips equations, parameters, state init, colors, and
    settings** (Phase 8) — deep-equality (within float tolerance) between a
    workspace before save and after reload.
12. **Deterministic seeded noise within numerical tolerance** (Phase 6) —
    same seed twice ⇒ matching noisy-gradient sequences within tolerance,
    not exact equality (§10).
13. **Surface rendering with invalid regions (`log(x)`, `1/x`)** (Phase 9) —
    grid evaluation correctly marks/masks the invalid cells rather than
    throwing or rendering garbage.

---

## 20. Remaining design decisions requiring confirmation

Revision 2's eight open items are now resolved by the decisions folded into
this revision: auto-restart default/scope (§9, decision 1), the
differentiability-warning trade-off (§5, decision 2, now two separate
informational-only warnings), the per-example loss language (§7, decision
3), what the optimized variables mean in dataset mode (§4/§7, decision 4 —
generalized primary variables, not a reinterpreted `x`/`y`), dataset
storage (§16, decision 5 — embedded by default with size thresholds), the
divergence-safeguard defaults (§17, decision 6), the equation-editor
approach (§11, decision 7), and the grid-resolution bounds (§8, decision
8).

What's left, all minor/tunable rather than structural:

1. **Exact `rapidIncreaseWarningFactor` default** (§17): a ratio like `2.0`
   (loss more than doubling step-over-step triggers the non-fatal warning)
   is used as a placeholder in this plan; the right default is better
   chosen empirically once real optimizer rules are being tested in Phase
   4+, not guessed now.
2. **Default `maxIterations`** (§12's `SimLimits`): decision 6 fixed the
   absolute-value and absolute-loss safety bounds but not a default
   iteration cap; a generous default (e.g. in the low hundreds of
   thousands) should be picked during Phase 9 hardening alongside the
   performance profiling that phase already does.
3. **Interaction-time downsampling resolution** (§8): "around 30–40" during
   active drag/camera interaction is a reasonable placeholder; the exact
   number is a Phase 9 performance-profiling output, not a design decision
   to lock in now.
4. **Exact CSV embed thresholds** (§16): ~2 MB warn / ~25 MB refuse are
   reasonable placeholders for a teaching-tool CSV; revisit once Phase 7
   is underway and real dataset sizes are in hand.

None of these block starting Phase 1 or the spike.
