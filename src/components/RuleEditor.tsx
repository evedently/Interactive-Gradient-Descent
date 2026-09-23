import { EditorState } from "@codemirror/state";
import { Diagnostic, linter, setDiagnostics } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";
import { offsetToLineColumn } from "../domain/rules/ruleTypes";
import { useWorkspaceStore } from "../state/workspaceStore";

interface Props {
  ruleId: string;
}

/**
 * Multiline update-rule editor (DESIGN.md §11): CodeMirror 6 with lint
 * diagnostics for line/column-located errors. No autocomplete, no language
 * mode beyond plain text — the DSL's own parser/compiler is the source of
 * truth for what's valid, fed into CodeMirror as diagnostics rather than
 * duplicated as a CodeMirror grammar. One instance per rule (Phase 4):
 * each rule's text/errors live at `rules[i]` in the workspace store,
 * addressed by `ruleId`, so every rule's namespace is independent.
 */
export function RuleEditor({ ruleId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const setRuleSourceText = useWorkspaceStore((s) => s.setRuleSourceText);
  const initialSourceText = useWorkspaceStore((s) => s.rules.find((r) => r.id === ruleId)?.sourceText ?? "");
  const ruleSourceText = useWorkspaceStore((s) => s.rules.find((r) => r.id === ruleId)?.sourceText ?? "");
  const ruleErrors = useWorkspaceStore((s) => s.rules.find((r) => r.id === ruleId)?.errors ?? []);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: initialSourceText,
      extensions: [
        basicSetup,
        linter(() => []), // diagnostics are pushed externally, see the effect below
        EditorView.updateListener.of((update) => {
          if (update.docChanged) setRuleSourceText(ruleId, update.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    return () => view.destroy();
    // Intentionally mount-once per ruleId: the editor is the source of truth
    // for its own text after this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleId]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const docLength = view.state.doc.length;
    const diagnostics: Diagnostic[] = ruleErrors.map((e) => {
      const from = Math.max(0, Math.min(e.span.start, docLength));
      const to = Math.max(from, Math.min(Math.max(e.span.end, from + 1), docLength || 1));
      return { from, to, severity: "error", message: e.message };
    });
    view.dispatch(setDiagnostics(view.state, diagnostics));
  }, [ruleErrors]);

  return (
    <>
      <div ref={containerRef} className="rule-editor" />
      {ruleErrors.length > 0 ? (
        <ul className="error-list">
          {ruleErrors.map((e, i) => {
            const loc = offsetToLineColumn(ruleSourceText, e.span.start);
            return (
              <li key={i} className="error-message">
                Line {loc.line}, Col {loc.column}: {e.message}
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}
