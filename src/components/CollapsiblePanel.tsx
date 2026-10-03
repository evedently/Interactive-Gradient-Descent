import { useState, type ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
  /** Extra class on the outer `<section>` (e.g. `settings-group` for the umbrella panel). */
  className?: string;
  defaultCollapsed?: boolean;
}

/**
 * A left-panel section whose header toggles its body, using the same ▾/▸
 * chevron as rule panels. Collapse state is a purely local view preference
 * — every setting these panels edit lives in the workspace store, so
 * unmounting the body on collapse loses nothing.
 */
export function CollapsiblePanel({ title, children, className = "panel", defaultCollapsed = false }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section className={`${className} ${collapsed ? "collapsible-collapsed" : ""}`}>
      <button type="button" className="collapsible-header" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
        <h2>{title}</h2>
        <span className="collapsible-chevron">{collapsed ? "▸" : "▾"}</span>
      </button>
      {collapsed ? null : <div className="collapsible-body">{children}</div>}
    </section>
  );
}
