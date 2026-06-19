"use client";

import { useMemo, useState } from "react";
import s from "@/components/dashboard/styles.module.css";
import { useDash } from "@/lib/dash-store";
import FilterMultiSelect from "@/components/dashboard/FilterMultiSelect";
import ImportPanel from "@/components/dashboard/ImportPanel";
import ComposeModal from "@/components/dashboard/ComposeModal";
import type { Professor } from "@/lib/types";

const AVATAR_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#0891b2",
  "#16a34a",
  "#ea580c",
  "#db2777",
  "#4f46e5",
  "#0d9488",
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initial(name: string): string {
  const t = name.trim();
  return t ? t[0].toUpperCase() : "?";
}

// Derive a primary domain + sub-tags from the free-text `area` field.
function splitArea(area: string): { primary: string; tags: string[] } {
  const parts = area
    .split(/\s*[,/&;|]\s*|\s+and\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length === 0) return { primary: "", tags: [] };
  return { primary: parts[0], tags: parts.slice(1, 4) };
}

function passedVerification(p: Professor): "ok" | "bad" | "none" {
  if (!p.verification) return "none";
  if (p.verification.status === "invalid") return "bad";
  if (p.verification.status === "valid" || p.verification.status === "risky") return "ok";
  return "none";
}

function statusPill(p: Professor): { cls: string; label: string; title?: string } {
  if (p.engagement === "responded")
    return { cls: "pill-green", label: "Responded", title: p.engagementInfo };
  if (p.engagement === "bounced")
    return { cls: "pill-red", label: "Bounced", title: p.engagementInfo };
  if (p.engagement === "unknown" && p.status === "sent")
    return { cls: "pill-gray", label: "Sent", title: p.engagementInfo };
  if (p.status === "sent") return { cls: "pill-blue", label: "Sent", title: "Delivered — no reply yet" };
  if (p.status === "sending") return { cls: "pill-amber", label: "Sending…" };
  if (p.status === "error") return { cls: "pill-red", label: "Error", title: p.statusMessage };
  if (p.status === "ready") return { cls: "pill-amber", label: "Ready" };
  if (p.status === "generating") return { cls: "pill-blue", label: "Drafting…" };
  return { cls: "pill-gray", label: "—" };
}

export default function DashboardPage() {
  const {
    professors,
    setSelected,
    setManySelected,
    checkResponses,
    checking,
    trackError,
  } = useDash();

  const [search, setSearch] = useState("");
  const [domainSel, setDomainSel] = useState<string[]>([]);
  const [uniSel, setUniSel] = useState<string[]>([]);
  const [deptSel, setDeptSel] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const domainOptions = useMemo(
    () =>
      Array.from(
        new Set(
          professors
            .map((p) => splitArea(p.area).primary)
            .filter((d): d is string => !!d)
        )
      ).sort(),
    [professors]
  );
  const uniOptions = useMemo(
    () => Array.from(new Set(professors.map((p) => p.university).filter(Boolean))).sort(),
    [professors]
  );
  const deptOptions = useMemo(
    () => Array.from(new Set(professors.map((p) => p.department).filter(Boolean))).sort(),
    [professors]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dSet = new Set(domainSel);
    const uSet = new Set(uniSel);
    const deSet = new Set(deptSel);
    return professors.filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.email} ${p.area} ${p.researchDetail}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (dSet.size && !dSet.has(splitArea(p.area).primary)) return false;
      if (uSet.size && !uSet.has(p.university)) return false;
      if (deSet.size && !deSet.has(p.department)) return false;
      return true;
    });
  }, [professors, search, domainSel, uniSel, deptSel]);

  const selectedCount = professors.filter((p) => p.selected).length;
  const sentCount = professors.filter((p) => p.status === "sent" && p.threadId).length;
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => p.selected);

  return (
    <main className={s.page}>
      <div className="container">
        <div className={s.headRow}>
          <div className={s.headLeft}>
            <h1 className={s.h1}>
              Find Professors{" "}
              <span className={s.startupTag}>/ Startup Jobs (NEW)</span>
            </h1>
            <p className={s.subhead}>
              Filter, Select, Connect. Automate your entire outreach workflow!
            </p>
          </div>
          <div className={s.headRight}>
            <button
              className="btn btn-ghost"
              onClick={() => setImportOpen((v) => !v)}
            >
              {importOpen ? "Hide import" : "Import / manage data"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => checkResponses()}
              disabled={checking || sentCount === 0}
              title="Checks your Gmail for replies and bounces on sent emails"
            >
              {checking ? "Checking…" : "Check responses"}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setComposeOpen(true)}
              disabled={selectedCount === 0}
            >
              Draft Emails ({selectedCount})
            </button>
          </div>
        </div>

        {trackError && <div className={s.trackError}>{trackError}</div>}
        {sentCount > 0 && (
          <p className={s.trackNote}>
            Status tracks <strong>replies</strong> and <strong>bounces</strong> detected
            in your Gmail (click “Check responses”). Email <em>opens</em> and{" "}
            <em>deletions</em> can&apos;t be tracked reliably — no provider reports them
            to the sender.
          </p>
        )}

        {importOpen && <ImportPanel onClose={() => setImportOpen(false)} />}

        <div className={s.filterBar}>
          <div className={s.searchWrap}>
            <span className={s.searchIcon} aria-hidden="true">
              ⌕
            </span>
            <input
              type="search"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={s.searchInput}
            />
          </div>
          <FilterMultiSelect
            label="DOMAIN"
            options={domainOptions}
            selected={domainSel}
            onChange={setDomainSel}
          />
          <FilterMultiSelect
            label="UNIVERSITY"
            options={uniOptions}
            selected={uniSel}
            onChange={setUniSel}
          />
          <FilterMultiSelect
            label="DEPARTMENT"
            options={deptOptions}
            selected={deptSel}
            onChange={setDeptSel}
          />
        </div>

        {professors.length === 0 ? (
          <div className={s.emptyState}>
            <div className={s.emptyTitle}>No professors loaded yet</div>
            <p className={s.emptyText}>
              Import a faculty directory by URL or paste a CSV to build your list.
            </p>
            <button className="btn btn-primary" onClick={() => setImportOpen(true)}>
              Import data
            </button>
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.selectCol}>
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allFilteredSelected}
                      onChange={(e) =>
                        setManySelected(
                          filtered.map((p) => p.id),
                          e.target.checked
                        )
                      }
                    />
                  </th>
                  <th>PROFESSOR</th>
                  <th>DOMAIN</th>
                  <th>UNIVERSITY</th>
                  <th>RESEARCH INTERESTS</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const { primary, tags } = splitArea(p.area);
                  const v = passedVerification(p);
                  return (
                    <tr key={p.id} className={p.selected ? s.rowSelected : ""}>
                      <td className={s.selectCol}>
                        <input
                          type="checkbox"
                          checked={p.selected}
                          onChange={(e) => setSelected(p.id, e.target.checked)}
                          aria-label={`Select ${p.name}`}
                        />
                      </td>
                      <td>
                        <div className={s.profCell}>
                          <span
                            className={s.avatar}
                            style={{ background: avatarColor(p.name) }}
                          >
                            {initial(p.name)}
                          </span>
                          <div className={s.profText}>
                            <div className={s.nameRow}>
                              <span className={s.profName}>{p.name}</span>
                              {v === "ok" && (
                                <span className={s.checkOk} title="Email verified">
                                  ✓
                                </span>
                              )}
                              {v === "bad" && (
                                <span className={s.checkBad} title="Invalid email">
                                  ✕
                                </span>
                              )}
                            </div>
                            <div className={s.profEmail}>{p.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {primary ? (
                          <div className={s.domainCell}>
                            <span className="pill pill-blue">{primary}</span>
                            {tags.length > 0 && (
                              <div className={s.subTags}>
                                {tags.map((t) => (
                                  <span key={t} className="pill pill-purple">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className={s.na}>N/A</span>
                        )}
                      </td>
                      <td className={s.uniCell}>{p.university || <span className={s.na}>N/A</span>}</td>
                      <td>
                        <div className={s.interests} title={p.researchDetail}>
                          {p.researchDetail || <span className={s.na}>N/A</span>}
                        </div>
                      </td>
                      <td>
                        {(() => {
                          const sp = statusPill(p);
                          return (
                            <span className={`pill ${sp.cls}`} title={sp.title}>
                              {sp.label}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className={s.noMatch}>
                      No professors match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </main>
  );
}
