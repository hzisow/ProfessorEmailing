"use client";

import { useEffect, useRef, useState } from "react";
import s from "./styles.module.css";

export default function FilterMultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selectedSet = new Set(selected);
  const shown = options.filter((o) =>
    o.toLowerCase().includes(query.trim().toLowerCase())
  );

  function toggle(opt: string) {
    const next = new Set(selectedSet);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onChange(Array.from(next));
  }

  return (
    <div className={s.msWrap} ref={wrapRef}>
      <button
        type="button"
        className={`${s.msButton} ${open ? s.msButtonOpen : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={s.msLabel}>{label}</span>
        {selected.length > 0 && <span className={s.msCount}>{selected.length}</span>}
        <span className={s.msCaret} aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className={s.msPanel}>
          <input
            type="search"
            className={s.msSearch}
            placeholder={`Search ${label}...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className={s.msActions}>
            <button
              type="button"
              className={s.msActionLink}
              onClick={() => onChange(Array.from(new Set([...selected, ...shown])))}
            >
              Select All
            </button>
            <button
              type="button"
              className={s.msActionLink}
              onClick={() =>
                onChange(selected.filter((v) => !shown.includes(v)))
              }
            >
              Clear All
            </button>
          </div>
          <div className={s.msList}>
            {shown.length === 0 && <div className={s.msEmpty}>No options</div>}
            {shown.map((opt) => (
              <label key={opt} className={s.msItem}>
                <input
                  type="checkbox"
                  checked={selectedSet.has(opt)}
                  onChange={() => toggle(opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
          <div className={s.msFooter}>
            <button
              type="button"
              className="btn btn-dark btn-sm"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
