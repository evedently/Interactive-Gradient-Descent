import type { DragEvent } from "react";
import type { RunnerStatus } from "../domain/simulation/types";
import type { RuleWorkspaceEntry } from "../state/workspaceStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import { RULE_DRAG_MIME } from "./ruleDrag";

interface Props {
  rule: RuleWorkspaceEntry;
  status: RunnerStatus;
  canRemove: boolean;
}

/** Shared by `RulePanel` (surface mode) and `DatasetRulePanel` (dataset mode, DESIGN.md §18 Phase 7) — identical name/color/visibility/collapse/remove controls regardless of which mode's runner backs the panel. */
export function RulePanelHeader({ rule, status, canRemove }: Props) {
  const setRuleName = useWorkspaceStore((s) => s.setRuleName);
  const setRuleColor = useWorkspaceStore((s) => s.setRuleColor);
  const setRuleVisible = useWorkspaceStore((s) => s.setRuleVisible);
  const setRuleCollapsed = useWorkspaceStore((s) => s.setRuleCollapsed);
  const removeRule = useWorkspaceStore((s) => s.removeRule);

  const startDrag = (e: DragEvent<HTMLSpanElement>) => {
    e.dataTransfer.setData(RULE_DRAG_MIME, rule.id);
    e.dataTransfer.effectAllowed = "move";
    // Show the whole panel as the drag ghost, not just the small grip.
    const panel = e.currentTarget.closest(".rule-panel");
    if (panel) e.dataTransfer.setDragImage(panel, 12, 12);
  };

  return (
    <div className="rule-panel-header">
      <span className="rule-drag-handle" draggable onDragStart={startDrag} title="Drag to reorder" aria-label="Drag to reorder">
        ⠿
      </span>
      <input
        type="checkbox"
        checked={rule.visible}
        onChange={(e) => setRuleVisible(rule.id, e.target.checked)}
        title="Show/hide this rule's trajectory"
      />
      <input
        type="color"
        className="rule-color-input"
        value={rule.color}
        onChange={(e) => setRuleColor(rule.id, e.target.value)}
        title="Trajectory color"
      />
      <input type="text" className="rule-name-input" value={rule.name} onChange={(e) => setRuleName(rule.id, e.target.value)} />
      <span className={`status-badge status-${status}`}>{status}</span>
      <button
        className="rule-collapse-button"
        onClick={() => setRuleCollapsed(rule.id, !rule.collapsed)}
        title={rule.collapsed ? "Expand" : "Collapse"}
      >
        {rule.collapsed ? "▸" : "▾"}
      </button>
      {canRemove ? (
        <button className="rule-remove-button" onClick={() => removeRule(rule.id)} title="Remove this rule">
          ✕
        </button>
      ) : null}
    </div>
  );
}
