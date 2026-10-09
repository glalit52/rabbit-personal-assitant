"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

/* ---------- Icons (single consistent set, inline SVG) ---------- */
export function Icon({ d, size = 17 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
export const ICONS = {
  brief: "M4 5h16v14H4z M4 10h16 M9 3v4 M15 3v4",
  approvals: "M9 12l2 2 4-5 M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  policy: "M12 3v18 M5 7l7-4 7 4 M5 7v6c0 4 3.5 6.5 7 8 3.5-1.5 7-4 7-8V7",
  connectors: "M9 2v6 M15 2v6 M7 8h10v4a5 5 0 0 1-10 0z M12 17v5",
  menu: "M4 7h16 M4 12h16 M4 17h16",
  check: "M4 12.5l5 5L20 6.5",
  chevron: "M6 9l6 6 6-6",
  refresh: "M20 11a8 8 0 1 0-2.3 6.3 M20 5v6h-6",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
};

/* ---------- Page header ---------- */
export function PageHeader({ title, desc, actions }: { title: string; desc: string; actions?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div className="page-head-row">
        <div>
          <h2>{title}</h2>
          <p>{desc}</p>
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </div>
  );
}

/* ---------- Badge ---------- */
export function Badge({ status, label }: { status: string; label?: string }) {
  const cls = ["pending_approval", "executed", "rejected", "failed", "connected", "pending", "denied"].includes(status) ? status : "neutral";
  return <span className={`badge ${cls}`}>{label ?? status.replaceAll("_", " ")}</span>;
}

/* ---------- Buttons ---------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
};
export function Btn({ variant = "secondary", size = "md", loading, children, disabled, ...rest }: BtnProps) {
  const cls = `btn ${variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : variant === "ghost" ? "btn-ghost" : ""} ${size === "sm" ? "btn-sm" : ""}`;
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

/* ---------- Accessible custom Select (replaces native <select>) ---------- */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
export function Select({
  value,
  options,
  onChange,
  label,
  searchable,
  placeholder = "Select…",
  minWidth,
}: {
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  label: string;
  searchable?: boolean;
  placeholder?: string;
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open ]);

  useEffect(() => setHighlight(0), [query, open]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt && !opt.disabled) pick(opt.value);
    }
  }

  return (
    <div className="cselect" ref={rootRef} style={minWidth ? { minWidth } : undefined} onKeyDown={onKey}>
      <button
        type="button"
        className="cselect-trigger"
        data-open={open}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current?.label ?? placeholder}</span>
        <Icon d={ICONS.chevron} size={14} />
      </button>
      {open && (
        <div className="cselect-pop" role="listbox" id={listId} aria-label={label}>
          {searchable && (
            <input
              autoFocus
              className="cselect-search"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={`Search ${label}`}
            />
          )}
          {filtered.length === 0 && <div className="cselect-empty">No matches</div>}
          {filtered.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              data-selected={o.value === value}
              data-highlight={i === highlight}
              className="cselect-opt"
              disabled={o.disabled}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(o.value)}
            >
              <span>{o.label}</span>
              {o.value === value && <Icon d={ICONS.check} size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} data-active={value === o.value} className="seg-btn" onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Skeletons ---------- */
export function Skel({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skel ${className}`} style={style} aria-hidden="true" />;
}
export function MetricSkeleton() {
  return (
    <div className="card metric" aria-label="Loading metric">
      <Skel className="skel-line" style={{ width: "52%", height: 26 }} />
      <div style={{ height: 8 }} />
      <Skel className="skel-line" style={{ width: "78%" }} />
    </div>
  );
}
export function CardSkeleton() {
  return (
    <div className="card" aria-label="Loading">
      <Skel className="skel-title" />
      <div style={{ height: 10 }} />
      <Skel className="skel-line" style={{ width: "90%" }} />
      <div style={{ height: 6 }} />
      <Skel className="skel-line" style={{ width: "70%" }} />
    </div>
  );
}

/* ---------- Empty / error states ---------- */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card" role="status">
      <h3>{title}</h3>
      {hint && <p className="muted" style={{ margin: "4px 0 0" }}>{hint}</p>}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert-err" role="alert">
      <span>{message}</span>
      {onRetry && (
        <div className="row">
          <Btn size="sm" onClick={onRetry}>
            Try again
          </Btn>
        </div>
      )}
    </div>
  );
}
