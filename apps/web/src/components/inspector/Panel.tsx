import { type ReactNode, useState } from "react";

interface PanelProps {
  title: string;
  defaultOpen?: boolean;
  /** Extra content pinned to the header row (e.g. an enable checkbox). */
  headerRight?: ReactNode;
  children: ReactNode;
}

/**
 * Collapsible inspector section: header row (small-caps title + chevron),
 * body when open, subtle divider between stacked panels.
 */
export function Panel({ title, defaultOpen = true, headerRight, children }: PanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="panel">
      <div
        className="panel-header"
        role="button"
        tabIndex={0}
        onClick={() => {
          setOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
      >
        <span className="panel-title">{title}</span>
        {headerRight && (
          <span
            className="panel-header-right"
            onClick={(e) => {
              e.stopPropagation();
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
            }}
          >
            {headerRight}
          </span>
        )}
        <span className="panel-chevron" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </div>
      {open && <div className="panel-body">{children}</div>}
    </section>
  );
}
