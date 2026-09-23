> **Scope:** project-specific rules only. Process and methodology are owned by
> skills (see the pointer table). Don't duplicate a skill's content here.

## Process is owned by skills — don't restate it here

| Need | Use this skill |
|---|---|
| Test-first discipline (RED-GREEN-REFACTOR) | `superpowers:test-driven-development` |
| Clarifying requirements / designing before building | `superpowers:brainstorming` |
| Confirming work is actually done before claiming so | `superpowers:verification-before-completion` |
| Root-causing a bug or test failure | `superpowers:systematic-debugging` |
| UVM testbench / uvm_v2_1 pipeline failures | `debugging-uvm-testbenches` |
| Writing commit messages | `git-commit-writer` (subject to No AI Attribution below) |
| Reviewing a diff / PR / security | `code-review`, `review`, `security-review` |
| Capturing a recurring mistake or methodology insight | `task-observer` |

**TDD is mandatory.** Follow `superpowers:test-driven-development` for the
discipline; the project-specific test layout and commands live under Testing.

---

## Design Principles

**Single Responsibility**
- One class/function/script = one reason to change.
- A scheduler module schedules; the validator validates; the S3 sync syncs.
  Don't fuse orchestration, I/O, and policy into one unit.
- **Violation metric**: a module >500 lines or a class >10 public methods → split it.

**Function Complexity**
- Functions ≤50 lines, ≤4 nesting levels, cyclomatic complexity ≤10.
- **Refactor signals**: multiple nested loops, >3 conditional branches, >5
  parameters.
- Split a 100-line `process()` into `validate()`, `transform()`, `persist()`.

**Testability First**
- Business logic must be testable without real external services.
- Isolate every external call (S3, SMTP, subprocess/PTY, langsmith, filesystem
  roots) behind a seam that a test can `monkeypatch` or replace with a fake.
- **Good**: a function that takes its dependencies (or reads a patchable
  module-level handle) → fakeable.
- **Bad**: a function that constructs an S3 client / spawns a subprocess inline
  with no seam → hard to test.

**Extensibility**
- Configuration-driven behavior over hard-coded conditionals.
- **Anti-pattern**: `if vendor == "x": ... elif vendor == "y": ...` branching
  scattered across modules.

---

## Code Quality Rules

**Prohibited Anti-Patterns**
- [❌](https://fonts.gstatic.com/s/e/notoemoji/17.0/274c/72.png) Magic numbers/strings → named constants.
- [❌](https://fonts.gstatic.com/s/e/notoemoji/17.0/274c/72.png) Deeply nested conditionals (>3 levels) → extract functions.
- [❌](https://fonts.gstatic.com/s/e/notoemoji/17.0/274c/72.png) Mutable default arguments → `field(default_factory=...)`.
- [❌](https://fonts.gstatic.com/s/e/notoemoji/17.0/274c/72.png) Bare `except:` / broad `except Exception:` → catch specific exceptions.
- [❌](https://fonts.gstatic.com/s/e/notoemoji/17.0/274c/72.png) God modules/classes (>500 lines) / long functions (>50 lines).
- [❌](https://fonts.gstatic.com/s/e/notoemoji/17.0/274c/72.png) Copy-paste code → extract shared logic.
- [❌](https://fonts.gstatic.com/s/e/notoemoji/17.0/274c/72.png) Side effects in `get_*` methods → keep them pure.
- [❌](https://fonts.gstatic.com/s/e/notoemoji/17.0/274c/72.png) `import *` → explicit imports only.
- [❌](https://fonts.gstatic.com/s/e/notoemoji/17.0/274c/72.png) Function-level imports → import at module top.
  - **Exception**: only to break a circular dependency (document why).
- [❌](https://fonts.gstatic.com/s/e/notoemoji/17.0/274c/72.png) Modifying the loop variable → use comprehensions or `enumerate()`.
- [❌](https://fonts.gstatic.com/s/e/notoemoji/17.0/274c/72.png) `eval()` / `exec()` → security risk, find alternatives.
- [❌](https://fonts.gstatic.com/s/e/notoemoji/17.0/274c/72.png) `type()` for type checks → use `isinstance()`.
- [❌](https://fonts.gstatic.com/s/e/notoemoji/17.0/274c/72.png) Obvious comments that just restate the code.

**Type Safety**
- Type hints on public functions/methods.
- `@dataclass` for structured data (config, records, results) — used widely in
  `automation/scripts/`.
- Validate external input at boundaries (parsed YAML, env vars, CLI args,
  subprocess output).
- Python 3.13 syntax for unions/optionals: `str | int | None`.
- **Avoid `Any`** unless truly necessary; document why.

**Interface Design**
- `_` prefix for private helpers (the codebase uses `_control.py`,
  `_cli_base.py`, `_notify.py` for internal modules).
- ≤5 parameters; use a dataclass beyond that.
- Prefer explicit return objects (dataclass) over wide tuples.
- Document assumptions, preconditions, side effects.

**Comments & Docstrings**
- Self-documenting code first: clear names > comments.
- Comment WHY, not WHAT (non-obvious business logic, workarounds for tool/CLI
  quirks, jrunner/PTY edge cases, security rules).
- **TODO/FIXME** must carry context: `# TODO(#123): …`.
- Google-style docstrings for public APIs; skip for obvious one-liners.

**Error Handling**
- Fail fast: validate inputs, raise specific exceptions.
- Fail gracefully for recoverable I/O (network, subprocess, S3) — provide
  fallbacks and surface actionable messages.
- Never swallow: log before re-raising or returning an error state.
- Include context (workspace, aug, job id) in exceptions and logs.
- **Anti-pattern**: `try: ... except: pass`.

**Logging**
- Levels: ERROR (operation-blocking), WARNING (recoverable/degraded),
  INFO (key events: scaffold started, validation passed, upload done),
  DEBUG (troubleshooting flow).
- **Never log** secrets, API keys, or full credential values (see Secrets).

**Dependency Management**
- Depend on abstractions; isolate external calls behind seams tests can fake.
- No circular dependencies between modules.
- **Anti-pattern**: scripts shelling out / calling S3 / sending mail inline with
  no fakeable boundary.

**Code Reuse**
- Extract shared logic at ≥3 uses; <3 uses, duplication is acceptable if
  contexts differ. Avoid premature abstraction for 2 similar functions.

**Idiomatic Python**
- Context managers (`with`) for files, locks, subprocess/PTY handles.
- `pathlib.Path` over `os.path`.
- f-strings over `%`/`.format()`.
- Comprehensions for simple transforms; loops for complex logic.
- Truthiness: `if items:` not `if len(items) > 0:`.
- EAFP over LBYL where it reads cleaner.

**Performance**
- Prefer built-ins (`map`, `filter`, `any`, `all`); `"".join(parts)` over `+=`
  in loops; set/dict membership over list scans in loops.
- Profile before optimizing; optimize bottlenecks only.

**Refactor immediately when** a function >50 lines, module/class >500 lines,
nesting >3 levels, complexity >10, copy-pasted blocks, or tests fail from tight
coupling.

---

## Testing

**Layout** (`testpaths = ["tests"]`, `pythonpath = [".", "tools"]`)
- `tests/unit/` — mirrors the source tree (`tests/unit/automation/`,
  `tests/unit/tools/`).
- `tests/integration/` — multi-component flows with all external boundaries
  faked (scheduler batch, scaffold→validate, sync roundtrip, doctor, PTY).
- `tests/live/` — hits real external services; deselected by default.
- `tests/fakes/` — reusable fakes (langsmith, pexpect/PTY, S3 http, SMTP,
  subprocess); `tests/conftest.py` wires shared fixtures.

**Markers** (declared in `pyproject.toml`)
- `integration` — multi-component test with external boundaries faked.
- `live` — hits real services; deselected by default (`addopts = "-ra -m 'not live'"`).
- `slow` — long-running.

**Faking & isolation**
- This repo fakes external boundaries with `monkeypatch` + the `tests/fakes/`
  doubles — the dominant pattern (not `unittest.mock`/`@patch`).
- Use `monkeypatch.setattr` to redirect a module's external seam to a fake.
- Each test must pass independently; no global state leaking across tests.
- Never call real S3/SMTP/jrunner/langsmith from a non-`live` test.

**Zero tolerance for failing tests** — never commit failing tests; never skip or
xfail to hide a failure. On a failure: stop, fix it (code or test), re-run, then
continue.

**Commands**
```bash
make test              # full suite (unit + integration; live deselected)
make test-unit         # tests/unit only
make test-integration  # tests/integration only
make test-cov          # suite + coverage report (source: automation, tools)
uv run pytest tests/unit/automation/test_<x>.py   # iterate on one file
```

Naming: `test_<unit>_<scenario>_<expected>`. Arrange-Act-Assert. Coverage
expectation per change: happy path + edge cases + error cases.

---

## Continuous Integration

`.github/workflows/tests.yml` runs on every push and pull request:
`uv sync --group dev` then `uv run pytest --cov --cov-report=term-missing` on
Python 3.13. Keep the suite green — CI blocks on test failure. There is no
lint/type-check gate configured; don't reference one.

---

## Configuration & Secrets

- Runtime config comes from `.env` (S3 bucket, SMTP, jrunner endpoint) and
  `~/.env.jrunner`, loaded via `python-dotenv`. `make setup` / `make doctor`
  bootstrap and health-check these.
- **Never log secrets or API keys** — `LANGSMITH_API_KEY`, S3/SMTP credentials,
  jrunner tokens. Log presence/absence ("configured" / "not configured"), never
  the value.
- **Never commit** `.env`, `~/.env.jrunner`, or any real credential. Tests must
  not depend on real secrets (use fakes).

---

## No AI Attribution (commits, PRs, all outward text)

**Outward-facing text contains only human-authored content — no AI attribution
of any kind.** This overrides the Claude Code harness defaults (commit
`Co-Authored-By: Claude ...` trailer and `[🤖](https://fonts.gstatic.com/s/e/notoemoji/17.0/1f916/72.png) Generated with Claude Code` PR
footer) and any trailer convention from `git-commit-writer` /
`pr-description-writer`.

- [❌](https://fonts.gstatic.com/s/e/notoemoji/17.0/274c/72.png) No `Generated with Claude Code` or similar tool-branding footers.
- [❌](https://fonts.gstatic.com/s/e/notoemoji/17.0/274c/72.png) No `Co-Authored-By: Claude ...` trailer (human co-authors are fine).
- [❌](https://fonts.gstatic.com/s/e/notoemoji/17.0/274c/72.png) No AI attribution/metadata anywhere — commits, PRs, issues, docs.
- [✅](https://fonts.gstatic.com/s/e/notoemoji/17.0/2705/72.png) Commits: subject + body only, Conventional Commits style.

**Backstop**: a local `commit-msg` hook at `.git/hooks/commit-msg` strips AI
attribution from every commit regardless of what wrote it. It's not version
controlled (`.git/hooks` is local) — re-create it after a fresh clone. PR
descriptions have no hook; rely on the rule above.

---

## Silent Fall-Through in Type-Based Branching

When an `if/elif` chain dispatches on a **discrete field** (status, event kind,
vendor, job state), unhandled values silently fall through — no error, no log,
data quietly lost.

**Enumerate first, then code.** Before the first branch, list every value the
field can hold and decide explicitly what each does (including
other/unexpected → log, raise, or document why skipping is safe).

```python
# [✅](https://fonts.gstatic.com/s/e/notoemoji/17.0/2705/72.png) Every case is a deliberate decision
if state == "pending":
    handle_pending(job)
elif state == "uploaded":
    handle_uploaded(job)
else:
    logger.warning("Unhandled job state %s — skipping", state)
```

If skipping is intentional, document why. For any function branching on a
status/state field, include at least one test per distinct value the field can
realistically hold at runtime, including intermediate states.
