/**
 * Workspace save/load (DESIGN.md §16/§18 Phase 8): a schema-versioned JSON
 * snapshot of everything a saved workspace needs to reproduce an
 * identical, re-validated session — equations, every rule's own text,
 * parameters (embedded in that text), state initializers (same), colors,
 * and settings (seed/noise/batch/run-target/...). `Dataset` rows are
 * embedded directly (§16: "embedded in the saved workspace JSON by
 * default"), never a reference to the original CSV file.
 *
 * This module only does STRUCTURAL validation — shape and primitive
 * types. It deliberately does not re-run expression/rule compilation;
 * that happens once in `workspaceStore.loadWorkspaceSnapshot`, reusing the
 * exact same parse/compile pipeline every live edit already goes through,
 * so there's exactly one source of truth for "is this equation valid."
 */

import type { SimLimits } from "../simulation/types";
import type { GridBounds } from "../visualization/grid";

/** Bumped to 4 when `surfaceBounds` (DESIGN.md §8's presenter-configurable view bounds) was added — an older file is rejected outright (§17's "unsupported schemaVersion" row) rather than silently defaulted, keeping exactly one shape per version. */
export const WORKSPACE_SCHEMA_VERSION = 4;

export interface RuleSnapshot {
  name: string;
  color: string;
  visible: boolean;
  collapsed: boolean;
  sourceText: string;
}

export interface DatasetSnapshot {
  columns: string[];
  rows: Record<string, number>[];
}

export interface WorkspaceSnapshot {
  schemaVersion: number;
  mode: "surface" | "dataset";
  lossSourceText: string;
  manualGradientEnabled: boolean;
  manualGradientGxSource: string;
  manualGradientGySource: string;
  rules: RuleSnapshot[];
  startPoint: { x: number; y: number };
  cameraMode: "rotate" | "pan";
  seed: number;
  noiseLevel: number;
  datasetPrimaryVariableNames: [string, string];
  dataset: DatasetSnapshot | null;
  datasetFileName: string | null;
  perExampleLossSourceText: string;
  datasetInitialValues: Record<string, number>;
  batchSize: number;
  datasetRunTargetKind: "continuous" | "epochs" | "seconds";
  datasetRunTargetValue: number;
  simLimits: SimLimits;
  stepsPerSecond: number;
  surfaceBounds: GridBounds;
}

export interface SnapshotValidationResult {
  snapshot: WorkspaceSnapshot | null;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function validateRuleSnapshot(value: unknown, index: number, errors: string[]): RuleSnapshot | null {
  if (!isRecord(value)) {
    errors.push(`rules[${index}] must be an object`);
    return null;
  }
  const before = errors.length;
  if (!isString(value.name)) errors.push(`rules[${index}].name must be a string`);
  if (!isString(value.color)) errors.push(`rules[${index}].color must be a string`);
  if (typeof value.visible !== "boolean") errors.push(`rules[${index}].visible must be a boolean`);
  if (typeof value.collapsed !== "boolean") errors.push(`rules[${index}].collapsed must be a boolean`);
  if (!isString(value.sourceText)) errors.push(`rules[${index}].sourceText must be a string`);
  if (errors.length > before) return null;
  return {
    name: value.name as string,
    color: value.color as string,
    visible: value.visible as boolean,
    collapsed: value.collapsed as boolean,
    sourceText: value.sourceText as string,
  };
}

function validateDatasetSnapshot(value: unknown, errors: string[]): DatasetSnapshot | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || !isStringArray(value.columns) || !Array.isArray(value.rows)) {
    errors.push("dataset must be null or { columns: string[], rows: object[] }");
    return null;
  }
  const columns = value.columns;
  for (let i = 0; i < value.rows.length; i++) {
    const row = value.rows[i];
    if (!isRecord(row) || !columns.every((c) => isFiniteNumber(row[c]))) {
      errors.push(`dataset.rows[${i}] must have a finite number for every column`);
      return null;
    }
  }
  return { columns, rows: value.rows as Record<string, number>[] };
}

function validatePoint(value: unknown, field: string, errors: string[]): { x: number; y: number } | null {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    errors.push(`${field} must be { x: number, y: number }`);
    return null;
  }
  return { x: value.x, y: value.y };
}

function validateNumberRecord(value: unknown, field: string, errors: string[]): Record<string, number> | null {
  if (!isRecord(value) || !Object.values(value).every(isFiniteNumber)) {
    errors.push(`${field} must be an object of finite numbers`);
    return null;
  }
  return value as Record<string, number>;
}

/** `maxIterations`/`earlyStopLossThreshold` are the optional `SimLimits` fields (§12) — `undefined` means uncapped/disabled, distinct from a missing/malformed field. */
function validateSimLimits(value: unknown, errors: string[]): SimLimits | null {
  if (!isRecord(value)) {
    errors.push("simLimits must be an object");
    return null;
  }
  const before = errors.length;
  if (value.maxIterations !== undefined && !isFiniteNumber(value.maxIterations)) errors.push("simLimits.maxIterations must be a finite number or omitted");
  if (!isFiniteNumber(value.maxAbsPrimaryVariableValue)) errors.push("simLimits.maxAbsPrimaryVariableValue must be a finite number");
  if (!isFiniteNumber(value.maxAbsLoss)) errors.push("simLimits.maxAbsLoss must be a finite number");
  if (value.earlyStopLossThreshold !== undefined && !isFiniteNumber(value.earlyStopLossThreshold)) {
    errors.push("simLimits.earlyStopLossThreshold must be a finite number or omitted");
  }
  if (errors.length > before) return null;
  return {
    maxIterations: value.maxIterations as number | undefined,
    maxAbsPrimaryVariableValue: value.maxAbsPrimaryVariableValue as number,
    maxAbsLoss: value.maxAbsLoss as number,
    earlyStopLossThreshold: value.earlyStopLossThreshold as number | undefined,
  };
}

/** Rejects a degenerate or inverted range (`xMin >= xMax`) in addition to the usual finite-number checks — a saved view must still be a valid window to render. */
function validateGridBounds(value: unknown, field: string, errors: string[]): GridBounds | null {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.xMin) ||
    !isFiniteNumber(value.xMax) ||
    !isFiniteNumber(value.yMin) ||
    !isFiniteNumber(value.yMax)
  ) {
    errors.push(`${field} must be { xMin, xMax, yMin, yMax: number }`);
    return null;
  }
  if (value.xMin >= value.xMax || value.yMin >= value.yMax) {
    errors.push(`${field} must have xMin < xMax and yMin < yMax`);
    return null;
  }
  return { xMin: value.xMin, xMax: value.xMax, yMin: value.yMin, yMax: value.yMax };
}

/** Structural validation only (see module doc) — rejects the whole snapshot on any error rather than partially salvaging a malformed file. */
export function validateWorkspaceSnapshot(value: unknown): SnapshotValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { snapshot: null, errors: ["workspace file must be a JSON object"] };

  if (value.schemaVersion !== WORKSPACE_SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion ${JSON.stringify(value.schemaVersion)} (expected ${WORKSPACE_SCHEMA_VERSION})`);
  }
  if (value.mode !== "surface" && value.mode !== "dataset") errors.push("mode must be 'surface' or 'dataset'");
  if (!isString(value.lossSourceText)) errors.push("lossSourceText must be a string");
  if (typeof value.manualGradientEnabled !== "boolean") errors.push("manualGradientEnabled must be a boolean");
  if (!isString(value.manualGradientGxSource)) errors.push("manualGradientGxSource must be a string");
  if (!isString(value.manualGradientGySource)) errors.push("manualGradientGySource must be a string");

  const rules: RuleSnapshot[] = [];
  if (!Array.isArray(value.rules) || value.rules.length === 0) {
    errors.push("rules must be a non-empty array");
  } else {
    value.rules.forEach((r, i) => {
      const rule = validateRuleSnapshot(r, i, errors);
      if (rule) rules.push(rule);
    });
  }

  const startPoint = validatePoint(value.startPoint, "startPoint", errors);
  if (value.cameraMode !== "rotate" && value.cameraMode !== "pan") errors.push("cameraMode must be 'rotate' or 'pan'");
  if (!isFiniteNumber(value.seed)) errors.push("seed must be a finite number");
  if (!isFiniteNumber(value.noiseLevel)) errors.push("noiseLevel must be a finite number");

  const names = value.datasetPrimaryVariableNames;
  if (!Array.isArray(names) || names.length !== 2 || !names.every(isString)) {
    errors.push("datasetPrimaryVariableNames must be a two-element string array");
  }

  const dataset = validateDatasetSnapshot(value.dataset, errors);
  if (value.datasetFileName !== null && !isString(value.datasetFileName)) errors.push("datasetFileName must be a string or null");
  if (!isString(value.perExampleLossSourceText)) errors.push("perExampleLossSourceText must be a string");
  const datasetInitialValues = validateNumberRecord(value.datasetInitialValues, "datasetInitialValues", errors);
  if (!isFiniteNumber(value.batchSize)) errors.push("batchSize must be a finite number");
  if (!["continuous", "epochs", "seconds"].includes(value.datasetRunTargetKind as string)) {
    errors.push("datasetRunTargetKind must be 'continuous', 'epochs', or 'seconds'");
  }
  if (!isFiniteNumber(value.datasetRunTargetValue)) errors.push("datasetRunTargetValue must be a finite number");

  const simLimits = validateSimLimits(value.simLimits, errors);
  if (!isFiniteNumber(value.stepsPerSecond) || (value.stepsPerSecond as number) <= 0) errors.push("stepsPerSecond must be a positive finite number");
  const surfaceBounds = validateGridBounds(value.surfaceBounds, "surfaceBounds", errors);

  if (errors.length > 0) return { snapshot: null, errors };

  return {
    snapshot: {
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      mode: value.mode as "surface" | "dataset",
      lossSourceText: value.lossSourceText as string,
      manualGradientEnabled: value.manualGradientEnabled as boolean,
      manualGradientGxSource: value.manualGradientGxSource as string,
      manualGradientGySource: value.manualGradientGySource as string,
      rules,
      startPoint: startPoint!,
      cameraMode: value.cameraMode as "rotate" | "pan",
      seed: value.seed as number,
      noiseLevel: value.noiseLevel as number,
      datasetPrimaryVariableNames: names as [string, string],
      dataset,
      datasetFileName: (value.datasetFileName ?? null) as string | null,
      perExampleLossSourceText: value.perExampleLossSourceText as string,
      datasetInitialValues: datasetInitialValues!,
      batchSize: value.batchSize as number,
      datasetRunTargetKind: value.datasetRunTargetKind as "continuous" | "epochs" | "seconds",
      datasetRunTargetValue: value.datasetRunTargetValue as number,
      simLimits: simLimits!,
      stepsPerSecond: value.stepsPerSecond as number,
      surfaceBounds: surfaceBounds!,
    },
    errors: [],
  };
}
