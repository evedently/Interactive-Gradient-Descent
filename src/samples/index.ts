import type { ModelKind } from "../domain/dataset/modelTemplates";
import iceCreamSalesCsv from "./ice-cream-sales.csv?raw";
import linearRegressionCsv from "./linear-regression.csv?raw";
import studyHoursPassCsv from "./study-hours-pass.csv?raw";

export interface SampleDataset {
  id: string;
  label: string;
  /** What the sample is good for demonstrating — shown under the picker. */
  description: string;
  fileName: string;
  csvText: string;
  modelKind: ModelKind;
  inputColumn: string;
  targetColumn: string;
}

/**
 * Built-in datasets, loaded through the same `loadCsv` path as an upload.
 * Each was generated from a fixed seed, so its best fit is known in advance.
 */
export const SAMPLE_DATASETS: readonly SampleDataset[] = [
  {
    id: "linear-regression",
    label: "Noisy line",
    description: "target = 2.5·feature − 1 plus noise (100 rows). Best fit: w ≈ 2.52, b ≈ −0.91.",
    fileName: "linear-regression.csv",
    csvText: linearRegressionCsv,
    modelKind: "linear",
    inputColumn: "feature",
    targetColumn: "target",
  },
  {
    id: "study-hours-pass",
    label: "Hours studied → passed",
    description: "Pass/fail (0/1) against hours studied (80 rows). The chance of passing rises around 5 hours.",
    fileName: "study-hours-pass.csv",
    csvText: studyHoursPassCsv,
    modelKind: "logistic",
    inputColumn: "hours_studied",
    targetColumn: "passed",
  },
  {
    id: "ice-cream-sales",
    label: "Temperature → ice cream sales",
    description:
      "Temperatures sit far from zero (15–35 °C), so the loss surface is a long, narrow valley. A learning rate above about 0.0016 diverges, and plain gradient descent crawls along the valley, so it's a good case for comparing it with momentum.",
    fileName: "ice-cream-sales.csv",
    csvText: iceCreamSalesCsv,
    modelKind: "linear",
    inputColumn: "temperature_c",
    targetColumn: "sales",
  },
];
