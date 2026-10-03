import katex from "katex";
import { useMemo } from "react";
import { exprToLatex, identifierToLatex } from "../../domain/expr/toLatex";
import { parseRuleSource } from "../../domain/rules/ruleParser";

function renderLine(latex: string): string {
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode: false });
  } catch {
    return "";
  }
}

/** A model formula as typeset maths, one `name = expression` line per statement (read-only). */
export function FormulaDisplay({ sourceText }: { sourceText: string }) {
  const lines = useMemo(() => {
    const { program } = parseRuleSource(sourceText);
    if (!program) return [];
    return program.statements.flatMap((s) => (s.kind === "assignment" ? [renderLine(`${identifierToLatex(s.name)} = ${exprToLatex(s.expr)}`)] : []));
  }, [sourceText]);

  return (
    <div className="formula-display">
      {lines.map((html, i) => (
        <div key={i} dangerouslySetInnerHTML={{ __html: html }} />
      ))}
    </div>
  );
}
