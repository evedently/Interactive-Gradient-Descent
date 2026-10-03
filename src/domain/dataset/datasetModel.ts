import type { PrimaryVariable } from "../rules/ruleCompiler";
import type { RuleError } from "../rules/ruleTypes";
import { mapDatasetColumns } from "./columnMapping";
import { definesPrediction } from "./evaluatePerExampleLoss";
import { isTemplateKind, MODEL_TEMPLATES, TARGET_NAME, TEMPLATE_PARAMETER_NAMES, type ModelKind } from "./modelTemplates";
import { compilePerExampleLoss } from "./perExampleLoss";
import type { CompiledPerExampleLoss, Dataset } from "./types";

export interface DatasetModelConfig {
  /** The CSV as loaded, before column mapping. */
  sourceDataset: Dataset | null;
  modelKind: ModelKind;
  inputColumn: string | null;
  targetColumn: string | null;
  customSourceText: string;
  customParameterNames: [string, string];
}

export interface ResolvedDatasetModel {
  primaryVariables: readonly PrimaryVariable[];
  /** The formula actually compiled: the template's text, or the custom text. */
  sourceText: string;
  /** The dataset training sees (`x`, `y`, plus extras for custom formulas), or `null` if there's none yet or the mapping failed. */
  dataset: Dataset | null;
  compiled: CompiledPerExampleLoss | null;
  formulaErrors: RuleError[];
  /** Why the data can't be used with this model (missing columns, non-binary target, ...). */
  dataError: string | null;
  definesPrediction: boolean;
}

export function modelParameterNames(kind: ModelKind, customParameterNames: [string, string]): [string, string] {
  return isTemplateKind(kind) ? TEMPLATE_PARAMETER_NAMES : customParameterNames;
}

/**
 * Turns the dataset-mode configuration into what training needs: the model's
 * parameters, the column-mapped dataset, and the compiled formula. Templates
 * see only `x`/`y`; custom formulas also see any other identifier-named
 * column, so older or richer formulas still compile.
 */
export function resolveDatasetModel(config: DatasetModelConfig): ResolvedDatasetModel {
  const { sourceDataset, modelKind, inputColumn, targetColumn, customSourceText, customParameterNames } = config;
  const primaryVariables = modelParameterNames(modelKind, customParameterNames).map((name) => ({ name }));
  const template = isTemplateKind(modelKind) ? MODEL_TEMPLATES[modelKind] : null;
  const sourceText = template ? template.sourceText : customSourceText;
  const base = { primaryVariables, sourceText, dataset: null, compiled: null, formulaErrors: [], dataError: null, definesPrediction: false };

  if (!sourceDataset) return base;

  const mapping = mapDatasetColumns(sourceDataset, inputColumn, targetColumn, template === null);
  if (!mapping.dataset) return { ...base, dataError: mapping.error };
  const dataset = mapping.dataset;

  const targetProblem = template?.validateTargets(dataset.rows.map((r) => r[TARGET_NAME])) ?? null;
  if (targetProblem) return { ...base, dataset, dataError: targetProblem };

  const { compiled, errors } = compilePerExampleLoss(sourceText, primaryVariables, dataset.columns);
  return { ...base, dataset, compiled, formulaErrors: errors, definesPrediction: compiled ? definesPrediction(compiled) : false };
}
