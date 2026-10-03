import type { ExprNode } from "../domain/expr/ast";
import { parseLossFunction, type LossFunctionParseResult, type ResolvedLoss } from "../domain/lossFunction";

export const DEFAULT_LOSS_SOURCE = "(x - 3)^2 + 4*(y + 1)^2";

type ParsedLoss = Extract<LossFunctionParseResult, { ok: true }>;

/** The loss-derived part of a `ResolvedLoss` from a successful parse — no manual gradient override yet. */
export function baseLossFrom(parsed: ParsedLoss): ResolvedLoss {
  return {
    ast: parsed.ast,
    mayBeNondifferentiable: parsed.mayBeNondifferentiable,
    mayBeUndefinedForSomeInputs: parsed.mayBeUndefinedForSomeInputs,
    symbolicGradient: parsed.symbolicGradient,
    manualGradient: null,
  };
}

/** Recombines the current loss-derived fields with the current manual-override fields into one `ResolvedLoss`. */
export function recomputeActiveLoss(base: ResolvedLoss, manualGradientEnabled: boolean, gxAst: ExprNode | null, gyAst: ExprNode | null): ResolvedLoss {
  const manualGradient = manualGradientEnabled && gxAst && gyAst ? { gx: gxAst, gy: gyAst } : null;
  return { ...base, manualGradient };
}

const parsedDefault = parseLossFunction(DEFAULT_LOSS_SOURCE);
if (!parsedDefault.ok) throw new Error("DEFAULT_LOSS_SOURCE must parse — this is a build-time invariant");

export const INITIAL_LOSS_PARSE: LossFunctionParseResult = parsedDefault;
export const INITIAL_ACTIVE_LOSS: ResolvedLoss = baseLossFrom(parsedDefault);
