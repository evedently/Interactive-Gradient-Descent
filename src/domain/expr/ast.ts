/** Source-span of a token or AST node, as character offsets into the source text it was parsed from. */
export interface Span {
  start: number;
  end: number;
}

export type ExprNode =
  | { type: "Number"; value: number; span: Span }
  | { type: "Identifier"; name: string; span: Span }
  | { type: "Unary"; op: "-"; operand: ExprNode; span: Span }
  | { type: "Binary"; op: "+" | "-" | "*" | "/" | "^"; left: ExprNode; right: ExprNode; span: Span }
  | { type: "Call"; name: string; args: ExprNode[]; span: Span };

/**
 * Returns a copy of `node` with every span (including nested children's)
 * shifted by `delta`. Used when an expression was parsed from a substring
 * of a larger document (e.g. the right-hand side of one line of a
 * multi-line rule) and its spans need to be translated back to that
 * document's own coordinates.
 */
export function shiftSpans(node: ExprNode, delta: number): ExprNode {
  const span: Span = { start: node.span.start + delta, end: node.span.end + delta };
  switch (node.type) {
    case "Number":
    case "Identifier":
      return { ...node, span };
    case "Unary":
      return { ...node, span, operand: shiftSpans(node.operand, delta) };
    case "Binary":
      return { ...node, span, left: shiftSpans(node.left, delta), right: shiftSpans(node.right, delta) };
    case "Call":
      return { ...node, span, args: node.args.map((a) => shiftSpans(a, delta)) };
  }
}

/** Every identifier referenced anywhere in the AST, each with its own span (duplicates included). */
export function collectIdentifiers(node: ExprNode): { name: string; span: Span }[] {
  switch (node.type) {
    case "Number":
      return [];
    case "Identifier":
      return [{ name: node.name, span: node.span }];
    case "Unary":
      return collectIdentifiers(node.operand);
    case "Binary":
      return [...collectIdentifiers(node.left), ...collectIdentifiers(node.right)];
    case "Call":
      return node.args.flatMap(collectIdentifiers);
  }
}
