import { INPUT_NAME, TARGET_NAME } from "./modelTemplates";
import type { Dataset } from "./types";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface ColumnMappingResult {
  dataset: Dataset | null;
  error: string | null;
}

/**
 * Builds the dataset a model trains on: the chosen input and target columns
 * become `x` and `y`, whatever they were called in the CSV (so a column like
 * `house size` is usable). With `keepOriginalColumns`, every other column
 * whose name is a valid formula identifier is carried along under its own
 * name too, so a custom formula can reference extra columns directly.
 */
export function mapDatasetColumns(
  source: Dataset,
  inputColumn: string | null,
  targetColumn: string | null,
  keepOriginalColumns: boolean,
): ColumnMappingResult {
  if (inputColumn === null || targetColumn === null) return { dataset: null, error: "Choose an input column and a target column" };
  for (const column of [inputColumn, targetColumn]) {
    if (!source.columns.includes(column)) return { dataset: null, error: `Column '${column}' is not in this dataset` };
  }
  if (inputColumn === targetColumn) return { dataset: null, error: "The input and target must be different columns" };

  const extras = keepOriginalColumns
    ? source.columns.filter((c) => IDENTIFIER_PATTERN.test(c) && c !== INPUT_NAME && c !== TARGET_NAME)
    : [];

  const rows = source.rows.map((row) => {
    const mapped: Record<string, number> = { [INPUT_NAME]: row[inputColumn], [TARGET_NAME]: row[targetColumn] };
    for (const column of extras) mapped[column] = row[column];
    return mapped;
  });

  return { dataset: { columns: [INPUT_NAME, TARGET_NAME, ...extras], rows }, error: null };
}

/**
 * Keeps a previous input/target choice when the new dataset still has those
 * columns; otherwise defaults to the first column as input and the last as
 * target (the usual "features first, label last" CSV layout).
 */
export function defaultColumnsFor(
  columns: readonly string[],
  previousInput: string | null,
  previousTarget: string | null,
): { input: string | null; target: string | null } {
  if (columns.length < 2) return { input: null, target: null };
  const keepPrevious = previousInput !== null && previousTarget !== null && columns.includes(previousInput) && columns.includes(previousTarget);
  if (keepPrevious) return { input: previousInput, target: previousTarget };
  return { input: columns[0], target: columns[columns.length - 1] };
}
