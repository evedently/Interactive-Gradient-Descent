import { useState, type DragEvent, type ReactNode } from "react";
import { useWorkspaceStore } from "../state/workspaceStore";
import { RULE_DRAG_MIME } from "./ruleDrag";

interface Entry {
  rule: { id: string };
}

interface Props<T extends Entry> {
  entries: T[];
  renderEntry: (entry: T) => ReactNode;
}

interface DropIndicator {
  index: number;
  position: "before" | "after";
}

function dropPosition(e: DragEvent<HTMLDivElement>): DropIndicator["position"] {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

/**
 * Drop zone for reordering rule panels. Drags start on each panel's grip
 * handle (`RulePanelHeader`), which puts the rule id on the drag under
 * `RULE_DRAG_MIME`; dropping on the upper/lower half of another panel
 * inserts before/after it via the store's `moveRule`.
 */
export function ReorderableRuleList<T extends Entry>({ entries, renderEntry }: Props<T>) {
  const moveRule = useWorkspaceStore((s) => s.moveRule);
  const [indicator, setIndicator] = useState<DropIndicator | null>(null);

  const handleDragOver = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(RULE_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const position = dropPosition(e);
    if (indicator?.index !== index || indicator.position !== position) setIndicator({ index, position });
  };

  const handleDrop = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    const id = e.dataTransfer.getData(RULE_DRAG_MIME);
    setIndicator(null);
    if (!id) return;
    e.preventDefault();
    const fromIndex = entries.findIndex((entry) => entry.rule.id === id);
    if (fromIndex === -1) return;
    let insertAt = dropPosition(e) === "after" ? index + 1 : index;
    // Removing the dragged rule first shifts every later slot up by one.
    if (fromIndex < insertAt) insertAt -= 1;
    moveRule(id, insertAt);
  };

  return (
    <div className="rule-list" onDragEnd={() => setIndicator(null)}>
      {entries.map((entry, index) => {
        const dropClass = indicator?.index === index ? `rule-drop-${indicator.position}` : "";
        return (
          <div
            key={entry.rule.id}
            className={`rule-list-item ${dropClass}`}
            onDragOver={handleDragOver(index)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIndicator(null);
            }}
            onDrop={handleDrop(index)}
          >
            {renderEntry(entry)}
          </div>
        );
      })}
    </div>
  );
}
