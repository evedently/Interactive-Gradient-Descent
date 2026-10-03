import { playVisibleRunners, type VisibleRunnerEntry } from "../domain/simulation/ruleRunControl";
import { useWorkspaceStore } from "../state/workspaceStore";

interface Props {
  entries: readonly VisibleRunnerEntry[];
  onExportCsv: () => void;
}

/** The actions above the rule list, shared by surface and dataset mode. Only the CSV export differs per mode. */
export function RuleListToolbar({ entries, onExportCsv }: Props) {
  const addRule = useWorkspaceStore((s) => s.addRule);

  const resetAll = () => {
    for (const { runner } of entries) runner.reset();
  };

  return (
    <div className="rule-list-toolbar">
      <button onClick={addRule}>+ Add rule</button>
      <button onClick={() => playVisibleRunners(entries)}>Run all</button>
      <button onClick={resetAll}>Reset all</button>
      <button onClick={onExportCsv}>Export CSV</button>
    </div>
  );
}
