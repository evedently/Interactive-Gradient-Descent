import Papa from "papaparse";
import type { Dataset } from "./types";

/** Above this, embedding the CSV in the saved workspace is still fine but worth flagging (DESIGN.md §16). */
export const CSV_EMBED_WARN_BYTES = 2 * 1024 * 1024;
/** Above this, embedding is refused outright with a message suggesting a smaller sample (DESIGN.md §16). */
export const CSV_EMBED_REFUSE_BYTES = 25 * 1024 * 1024;

export interface CsvLoadResult {
  dataset: Dataset | null;
  error: string | null;
  warning: string | null;
}

function formatMegabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * Loads a CSV's text into a `Dataset` (DESIGN.md §7/§16, Phase 7): a header
 * row of column names, then one numeric row per data line. Every column is
 * required to be numeric — this is a gradient-descent teaching tool, not a
 * general data-wrangling one, so a non-numeric cell is a load-time error
 * with the specific row/column, not a silently-dropped or NaN-filled row.
 */
export function loadCsv(fileText: string, fileSizeBytes: number): CsvLoadResult {
  if (fileSizeBytes > CSV_EMBED_REFUSE_BYTES) {
    return {
      dataset: null,
      error: `CSV file is ${formatMegabytes(fileSizeBytes)} MB, which exceeds the 25 MB embed limit — use a smaller sample.`,
      warning: null,
    };
  }
  const warning =
    fileSizeBytes > CSV_EMBED_WARN_BYTES
      ? `CSV file is ${formatMegabytes(fileSizeBytes)} MB — the saved workspace will embed it in full.`
      : null;

  const parsed = Papa.parse<Record<string, string>>(fileText, { header: true, skipEmptyLines: true, delimiter: "," });

  const columns = parsed.meta.fields ?? [];
  if (columns.length === 0) {
    return { dataset: null, error: "CSV file has no columns (expected a header row)", warning: null };
  }

  const fatalError = parsed.errors.find((e) => e.code !== "TooFewFields" && e.code !== "TooManyFields");
  if (fatalError) {
    return { dataset: null, error: `CSV parse error: ${fatalError.message}`, warning: null };
  }

  const rows: Record<string, number>[] = [];
  for (let i = 0; i < parsed.data.length; i++) {
    const rawRow = parsed.data[i];
    const row: Record<string, number> = {};
    for (const column of columns) {
      const rawValue = rawRow[column];
      const value = Number(rawValue);
      if (rawValue === undefined || rawValue === "" || !Number.isFinite(value)) {
        return {
          dataset: null,
          error: `Row ${i + 1}, column '${column}': expected a number, got '${rawValue ?? ""}'`,
          warning: null,
        };
      }
      row[column] = value;
    }
    rows.push(row);
  }

  if (rows.length === 0) {
    return { dataset: null, error: "CSV file has a header row but no data rows", warning: null };
  }

  return { dataset: { columns, rows }, error: null, warning };
}
