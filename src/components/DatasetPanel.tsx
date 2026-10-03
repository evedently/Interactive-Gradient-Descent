import { CollapsiblePanel } from "./CollapsiblePanel";
import { DataSourceSection } from "./dataset/DataSourceSection";
import { ModelSection } from "./dataset/ModelSection";
import { TrainingSection } from "./dataset/TrainingSection";

/**
 * Dataset mode's left-panel setup, in the order a model is built: the data
 * (sample or CSV, plus which columns are x and y), the model (template or
 * custom formula), then training settings. Hidden entirely in surface mode.
 */
export function DatasetPanel() {
  return (
    <CollapsiblePanel title="Dataset">
      <DataSourceSection />
      <ModelSection />
      <TrainingSection />
    </CollapsiblePanel>
  );
}
