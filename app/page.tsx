"use client";

import { useMemo, useState } from "react";
import s from "./page.module.css";
import type {
  Professor,
  ProfessorSeed,
  VerificationResult,
  Attachment,
  SendStatus,
} from "@/lib/types";
import {
  DEFAULT_SUBJECT,
  DEFAULT_BODY,
  DEFAULT_SIGNATURE,
  DEFAULT_SENDER,
  DEFAULT_THROTTLE_SECONDS,
  MIN_THROTTLE_SECONDS,
} from "@/lib/template";
import { buildEmail, type SenderInfo } from "@/lib/merge";

// ~4MB of base64 characters ≈ 3MB of binary; beyond this a Vercel serverless
// request body is at risk of rejection.
const MAX_BASE64_LEN = 4 * 1024 * 1024;

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Minimal RFC-4180-ish CSV parser (handles quoted fields and embedded commas).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignore
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function csvToSeeds(text: string): ProfessorSeed[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  let start = 0;
  const first = rows[0].map((c) => c.trim().toLowerCase());
  if (first.includes("email") && first.includes("name")) start = 1; // optional header
  const seeds: ProfessorSeed[] = [];
  for (let i = start; i < rows.length; i++) {
    const cells = rows[i].map((c) => c.trim());
    const [name = "", email = "", university = "", department = "", area = "", researchDetail = ""] =
      cells;
    if (!name || !email.includes("@")) continue;
    seeds.push({ name, email, university, department, area, researchDetail });
  }
  return seeds;
}

export default function Page() {
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [verifyingIds, setVerifyingIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<1 | 2 | 3>(1);

  // ---- SOURCE state -----------------------------------------------------
  const [url, setUrl] = useState("");
  const [scrapeUni, setScrapeUni] = useState("");
  const [scrapeArea, setScrapeArea] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const [scrapeMsg, setScrapeMsg] = useState("");

  const [csvText, setCsvText] = useState("");
  const [csvError, setCsvError] = useState("");
  const [csvMsg, setCsvMsg] = useState("");

  // ---- REVIEW state -----------------------------------------------------
  const [filterUni, setFilterUni] = useState("all");
  const [filterArea, setFilterArea] = useState("all");
  const [search, setSearch] = useState("");
  const [genAll, setGenAll] = useState(false);

  // ---- COMPOSE state ----------------------------------------------------
  const [subjectTpl, setSubjectTpl] = useState(DEFAULT_SUBJECT);
  const [bodyTpl, setBodyTpl] = useState(DEFAULT_BODY);
  const [sigTpl, setSigTpl] = useState(DEFAULT_SIGNATURE);
  const [sender, setSender] = useState<SenderInfo>({ ...DEFAULT_SENDER });
  const [previewId, setPreviewId] = useState<string>("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [attachError, setAttachError] = useState("");
  const [confirmNoResume, setConfirmNoResume] = useState(false);
  const [throttle, setThrottle] = useState(DEFAULT_THROTTLE_SECONDS);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  // ---- Derived ----------------------------------------------------------
  const counts = useMemo(() => {
    let selected = 0;
    let ready = 0;
    let sent = 0;
    for (const p of professors) {
      if (p.selected) selected++;
      if (p.selected && p.status === "ready") ready++;
      if (p.status === "sent") sent++;
    }
    return { loaded: professors.length, selected, ready, sent };
  }, [professors]);

  const universities = useMemo(
    () => Array.from(new Set(professors.map((p) => p.university).filter(Boolean))).sort(),
    [professors]
  );
  const areas = useMemo(
    () => Array.from(new Set(professors.map((p) => p.area).filter(Boolean))).sort(),
    [professors]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return professors.filter((p) => {
      if (filterUni !== "all" && p.university !== filterUni) return false;
      if (filterArea !== "all" && p.area !== filterArea) return false;
      if (q) {
        const hay = `${p.name} ${p.email} ${p.area} ${p.university} ${p.department} ${p.researchDetail}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [professors, filterUni, filterArea, search]);

  const previewProf =
    professors.find((p) => p.id === previewId) ||
    professors.find((p) => p.selected) ||
    professors[0] ||
    null;

  const preview = previewProf
    ? buildEmail(previewProf, sender, subjectTpl, bodyTpl, sigTpl)
    : null;

  const attachmentTooLarge =
    !!attachment && attachment.contentBase64.length > MAX_BASE64_LEN;

  // ---- Helpers ----------------------------------------------------------
  function updateProf(id: string, partial: Partial<Professor>) {
    setProfessors((prev) => prev.map((p) => (p.id === id ? { ...p, ...partial } : p)));
  }

  async function runVerification(targets: Professor[]) {
    if (targets.length === 0) return;
    const ids = targets.map((p) => p.id);
    setVerifyingIds((prev) => new Set([...Array.from(prev), ...ids]));
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: targets.map((p) => p.email) }),
      });
      const data = await res.json();
      const byEmail = new Map<string, VerificationResult>();
      if (Array.isArray(data.results)) {
        for (const r of data.results as VerificationResult[]) byEmail.set(r.email, r);
      }
      setProfessors((prev) =>
        prev.map((p) => {
          if (!ids.includes(p.id)) return p;
          const v = byEmail.get(p.email);
          if (!v) return p;
          // Only a clearly invalid result auto-deselects. Amber (risky /
          // catch-all) is a caution, never a blocker.
          const selected = v.status === "invalid" ? false : p.selected;
          return { ...p, verification: v, selected };
        })
      );
    } catch {
      // Leave them unverified on network failure.
    } finally {
      setVerifyingIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  }

  // Dedupe by email against existing + within the batch, then auto-verify.
  function addSeeds(seeds: ProfessorSeed[]): number {
    const existing = new Set(professors.map((p) => p.email));
    const seen = new Set<string>();
    const fresh: Professor[] = [];
    for (const seed of seeds) {
      const email = seed.email.trim().toLowerCase();
      if (!email.includes("@")) continue;
      if (existing.has(email) || seen.has(email)) continue;
      seen.add(email);
      fresh.push({
        id: uid(),
        name: seed.name.trim(),
        email,
        university: seed.university.trim(),
        department: seed.department.trim(),
        area: seed.area.trim(),
        researchDetail: seed.researchDetail.trim(),
        hook: "",
        selected: true,
        status: "idle",
      });
    }
    if (fresh.length > 0) {
      setProfessors((prev) => [...prev, ...fresh]);
      void runVerification(fresh);
    }
    return fresh.length;
  }

  async function handleScrape() {
    if (!url.trim()) {
      setScrapeError("Enter a faculty directory URL first.");
      return;
    }
    setScraping(true);
    setScrapeError("");
    setScrapeMsg("");
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, university: scrapeUni, area: scrapeArea }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scrape failed.");
      const seeds: ProfessorSeed[] = data.professors || [];
      const added = addSeeds(seeds);
      const via = data.usedScrapingBee ? " via ScrapingBee fallback" : "";
      setScrapeMsg(
        `Found ${seeds.length} professor(s) with real emails${via}; added ${added} new (deduped by email).`
      );
      if (added > 0) setActiveTab(2);
    } catch (e: any) {
      setScrapeError(e?.message || "Scrape failed.");
    } finally {
      setScraping(false);
    }
  }

  function handleCsv() {
    setCsvError("");
    setCsvMsg("");
    const seeds = csvToSeeds(csvText);
    if (seeds.length === 0) {
      setCsvError(
        "No valid rows found. Expected columns: name,email,university,department,area,researchDetail (header row optional)."
      );
      return;
    }
    const added = addSeeds(seeds);
    setCsvMsg(`Parsed ${seeds.length} valid row(s); added ${added} new (deduped by email).`);
    if (added > 0) setActiveTab(2);
  }

  async function generateHook(id: string) {
    const p = professors.find((x) => x.id === id);
    if (!p) return;
    updateProf(id, { status: "generating", statusMessage: undefined });
    try {
      const res = await fetch("/api/generate-hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: p.name,
          university: p.university,
          area: p.area,
          researchDetail: p.researchDetail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hook generation failed.");
      const hook = (data.hook || "").trim();
      updateProf(id, { hook, status: hook ? "ready" : "idle" });
    } catch (e: any) {
      updateProf(id, { status: "error", statusMessage: e?.message || "Failed." });
    }
  }

  async function generateSelectedHooks() {
    const targets = professors.filter(
      (p) => p.selected && !p.hook.trim() && p.status !== "sent" && p.status !== "sending"
    );
    if (targets.length === 0) return;
    setGenAll(true);
    for (const t of targets) {
      // eslint-disable-next-line no-await-in-loop
      await generateHook(t.id);
    }
    setGenAll(false);
  }

  function editHook(id: string, value: string) {
    setProfessors((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (p.status === "sent" || p.status === "sending") return { ...p, hook: value };
        return { ...p, hook: value, status: value.trim() ? "ready" : "idle" };
      })
    );
  }

  function setSelected(id: string, selected: boolean) {
    updateProf(id, { selected });
  }

  function setAllFilteredSelected(selected: boolean) {
    const ids = new Set(filtered.map((p) => p.id));
    setProfessors((prev) =>
      prev.map((p) => (ids.has(p.id) ? { ...p, selected } : p))
    );
  }

  function removeProfessor(id: string) {
    setProfessors((prev) => prev.filter((p) => p.id !== id));
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setAttachError("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setAttachError("Please choose a PDF file.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : "";
      if (!base64) {
        setAttachError("Could not read that PDF. Try a different file.");
        return;
      }
      if (base64.length > MAX_BASE64_LEN) {
        setAttachError(
          "This PDF is large (over ~3MB) and may exceed the serverless request limit — sends could fail. Compress it before sending."
        );
      }
      setAttachment({ filename: file.name, contentBase64: base64 });
    };
    reader.onerror = () => setAttachError("Could not read that file.");
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function sendAll() {
    setSendError("");
    if (attachmentTooLarge) {
      setSendError(
        "The attached resume is too large to send reliably. Compress it under ~3MB and re-attach."
      );
      return;
    }
    const targets = professors.filter((p) => p.selected && p.status === "ready");
    if (targets.length === 0) {
      setSendError(
        "No selected professors are marked ready. Generate hooks in tab 02 first."
      );
      return;
    }
    if (!attachment && !confirmNoResume) {
      setSendError(
        "No resume attached — every email references an attached resume. Attach a PDF above, or tick “send without a resume” to proceed."
      );
      return;
    }

    const delayMs = Math.max(MIN_THROTTLE_SECONDS, throttle || MIN_THROTTLE_SECONDS) * 1000;
    setSending(true);
    try {
      for (let i = 0; i < targets.length; i++) {
        const p = targets[i];
        updateProf(p.id, { status: "sending", statusMessage: undefined });
        const { subject, body } = buildEmail(p, sender, subjectTpl, bodyTpl, sigTpl);
        try {
          const res = await fetch("/api/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: p.email,
              subject,
              body,
              attachment: attachment || null,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Send failed.");
          updateProf(p.id, { status: "sent", statusMessage: undefined });
        } catch (e: any) {
          updateProf(p.id, { status: "error", statusMessage: e?.message || "Send failed." });
        }
        if (i < targets.length - 1) {
          // eslint-disable-next-line no-await-in-loop
          await sleep(delayMs);
        }
      }
    } finally {
      setSending(false);
    }
  }

  // ---- Render -----------------------------------------------------------
  return (
    <div className={s.app}>
      <header className={s.header}>
        <div className={s.brandBlock}>
          <div className={s.brand}>
            Prof<span className={s.ping}>Ping</span>
          </div>
          <div className={s.tagline}>research outreach console</div>
        </div>
        <div className={s.stats}>
          <Stat label="loaded" value={counts.loaded} />
          <Stat label="selected" value={counts.selected} variant="selected" />
          <Stat label="ready" value={counts.ready} variant="ready" />
          <Stat label="sent" value={counts.sent} variant="sent" />
        </div>
      </header>

      <nav className={s.tabs}>
        <TabButton
          n="01"
          label="Source"
          active={activeTab === 1}
          onClick={() => setActiveTab(1)}
        />
        <TabButton
          n="02"
          label="Review & Hooks"
          active={activeTab === 2}
          onClick={() => setActiveTab(2)}
        />
        <TabButton
          n="03"
          label="Compose & Send"
          active={activeTab === 3}
          onClick={() => setActiveTab(3)}
        />
      </nav>

      {activeTab === 1 && (
        <div className={s.panel}>
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Scrape a faculty directory</h2>
            <p className={s.sectionHint}>
              Fetched server-side and read with Claude. Emails are never invented — a
              professor is skipped unless their real address appears on the page.
            </p>
            <div className={s.field}>
              <label className={s.fieldLabel}>Directory URL</label>
              <input
                type="url"
                placeholder="https://www.school.edu/faculty"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className={s.grid2}>
              <div className={s.field}>
                <label className={s.fieldLabel}>University (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Boston University"
                  value={scrapeUni}
                  onChange={(e) => setScrapeUni(e.target.value)}
                />
              </div>
              <div className={s.field}>
                <label className={s.fieldLabel}>Area filter (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. finance, machine learning"
                  value={scrapeArea}
                  onChange={(e) => setScrapeArea(e.target.value)}
                />
              </div>
            </div>
            <div className={s.actionsRow}>
              <button
                className={`${s.button} ${s.buttonPrimary}`}
                onClick={handleScrape}
                disabled={scraping}
              >
                {scraping ? "Scraping…" : "Scrape & add"}
              </button>
              {scrapeMsg && <span className={s.statusLine}>{scrapeMsg}</span>}
            </div>
            {scrapeError && <div className={s.error} style={{ marginTop: 12 }}>{scrapeError}</div>}
          </section>

          <div className={s.orRule}>or</div>

          <section className={s.section}>
            <h2 className={s.sectionTitle}>Paste a CSV</h2>
            <p className={s.sectionHint}>
              Columns:{" "}
              <span className={s.codeInline}>
                name,email,university,department,area,researchDetail
              </span>
              . A header row is optional.
            </p>
            <textarea
              rows={8}
              className={s.mono}
              placeholder={
                "Jane Smith,jsmith@school.edu,Some University,Finance,Asset Pricing,Studies ML for portfolio risk\n..."
              }
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              style={{ fontFamily: "var(--mono)", fontSize: 13 }}
            />
            <div className={s.actionsRow} style={{ marginTop: 12 }}>
              <button className={`${s.button} ${s.buttonPrimary}`} onClick={handleCsv}>
                Parse & add
              </button>
              {csvMsg && <span className={s.statusLine}>{csvMsg}</span>}
            </div>
            {csvError && <div className={s.error} style={{ marginTop: 12 }}>{csvError}</div>}
          </section>
        </div>
      )}

      {activeTab === 2 && (
        <div className={s.panel}>
          <section className={s.section}>
            <div className={s.note}>
              <span className={s.noteMark}>i</span>
              <span>
                University mail servers are often <strong>catch-all</strong>, so they
                can&apos;t confirm a specific mailbox. An amber{" "}
                <span className={s.mono}>risky / catch-all</span> badge is expected for
                .edu addresses and is fine to send to — only a red{" "}
                <span className={s.mono}>invalid</span> result (bad syntax or no MX
                record) auto-deselects a professor.
              </span>
            </div>

            <div className={s.filters} style={{ marginTop: 16 }}>
              <div className={s.field} style={{ marginBottom: 0 }}>
                <label className={s.fieldLabel}>University</label>
                <select value={filterUni} onChange={(e) => setFilterUni(e.target.value)}>
                  <option value="all">All universities</option>
                  {universities.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div className={s.field} style={{ marginBottom: 0 }}>
                <label className={s.fieldLabel}>Area</label>
                <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)}>
                  <option value="all">All areas</option>
                  {areas.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className={s.field} style={{ marginBottom: 0 }}>
                <label className={s.fieldLabel}>Search</label>
                <input
                  type="text"
                  placeholder="name, email, research…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className={s.actionsRow} style={{ marginTop: 16 }}>
              <button
                className={`${s.button} ${s.buttonAmber}`}
                onClick={generateSelectedHooks}
                disabled={genAll || counts.selected === 0}
              >
                {genAll ? "Generating hooks…" : "Generate hooks for selected"}
              </button>
              <button
                className={`${s.button} ${s.buttonSmall}`}
                onClick={() => setAllFilteredSelected(true)}
              >
                Select all (filtered)
              </button>
              <button
                className={`${s.button} ${s.buttonSmall}`}
                onClick={() => setAllFilteredSelected(false)}
              >
                Deselect all (filtered)
              </button>
              <span className={s.statusLine}>
                {filtered.length} shown · {counts.selected} selected · {counts.ready} ready
              </span>
            </div>
          </section>

          <div className={s.cards}>
            {filtered.length === 0 && (
              <div className={s.empty}>
                {professors.length === 0
                  ? "No professors yet — add some in tab 01."
                  : "No professors match the current filters."}
              </div>
            )}
            {filtered.map((p) => (
              <ProfessorCard
                key={p.id}
                p={p}
                checking={verifyingIds.has(p.id)}
                onToggle={(sel) => setSelected(p.id, sel)}
                onHookChange={(v) => editHook(p.id, v)}
                onGenerate={() => generateHook(p.id)}
                onRemove={() => removeProfessor(p.id)}
              />
            ))}
          </div>
        </div>
      )}

      {activeTab === 3 && (
        <div className={s.panel}>
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Sender</h2>
            <div className={s.grid2}>
              <div className={s.field}>
                <label className={s.fieldLabel}>Your name</label>
                <input
                  type="text"
                  value={sender.senderName}
                  onChange={(e) => setSender({ ...sender, senderName: e.target.value })}
                />
              </div>
              <div className={s.field}>
                <label className={s.fieldLabel}>School</label>
                <input
                  type="text"
                  value={sender.senderSchool}
                  onChange={(e) => setSender({ ...sender, senderSchool: e.target.value })}
                />
              </div>
            </div>
            <div className={s.field} style={{ maxWidth: 240 }}>
              <label className={s.fieldLabel}>Graduation year</label>
              <input
                type="text"
                value={sender.senderGradYear}
                onChange={(e) => setSender({ ...sender, senderGradYear: e.target.value })}
              />
            </div>
          </section>

          <div className={s.composeGrid}>
            <section className={s.section}>
              <h2 className={s.sectionTitle}>Template</h2>
              <p className={s.sectionHint}>
                Merge fields:{" "}
                <span className={s.codeInline}>
                  {"{{lastName}} {{name}} {{area}} {{university}} {{department}} {{hook}} {{senderName}} {{senderSchool}} {{senderGradYear}}"}
                </span>
              </p>
              <div className={s.field}>
                <label className={s.fieldLabel}>Subject</label>
                <input
                  type="text"
                  value={subjectTpl}
                  onChange={(e) => setSubjectTpl(e.target.value)}
                />
              </div>
              <div className={s.field}>
                <label className={s.fieldLabel}>Body</label>
                <textarea
                  rows={14}
                  value={bodyTpl}
                  onChange={(e) => setBodyTpl(e.target.value)}
                />
              </div>
              <div className={s.field}>
                <label className={s.fieldLabel}>Signature</label>
                <textarea
                  rows={3}
                  value={sigTpl}
                  onChange={(e) => setSigTpl(e.target.value)}
                />
              </div>
            </section>

            <section className={s.section}>
              <h2 className={s.sectionTitle}>Live preview</h2>
              <div className={s.field}>
                <label className={s.fieldLabel}>Preview for</label>
                <select
                  value={previewProf?.id || ""}
                  onChange={(e) => setPreviewId(e.target.value)}
                >
                  {professors.length === 0 && <option value="">No professors yet</option>}
                  {professors.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.email}
                    </option>
                  ))}
                </select>
              </div>
              {preview ? (
                <div className={s.previewBox}>
                  <div className={s.previewSubject}>
                    <span className={s.subjLabel}>Subject</span>
                    {preview.subject}
                  </div>
                  <div className={s.previewBody}>{preview.body}</div>
                </div>
              ) : (
                <div className={s.empty}>Add professors to preview a merged email.</div>
              )}
            </section>
          </div>

          <section className={s.section}>
            <h2 className={s.sectionTitle}>Resume attachment</h2>
            <p className={s.sectionHint}>
              A PDF is attached to <strong>every</strong> email in the batch as a real
              downloadable file.
            </p>
            <div className={s.actionsRow}>
              <label className={`${s.button} ${s.fileLabel}`}>
                {attachment ? "Replace PDF" : "Choose PDF"}
                <input
                  type="file"
                  accept="application/pdf"
                  className={s.fileInput}
                  onChange={handleFile}
                />
              </label>
              {attachment && (
                <span className={s.attachChip}>
                  Attached: {attachment.filename}
                  <button
                    className={s.chipRemove}
                    onClick={() => setAttachment(null)}
                    aria-label="Remove attachment"
                    title="Remove"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
            {attachError && (
              <div className={s.warn} style={{ marginTop: 12 }}>
                <span className={s.noteMark}>!</span>
                <span>{attachError}</span>
              </div>
            )}
            {!attachment && (
              <div className={s.warn} style={{ marginTop: 12 }}>
                <span className={s.noteMark}>!</span>
                <span>
                  No resume attached — every email references an attached resume.{" "}
                  <label style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={confirmNoResume}
                      onChange={(e) => setConfirmNoResume(e.target.checked)}
                      style={{ marginRight: 6, accentColor: "var(--amber)" }}
                    />
                    Send without a resume anyway
                  </label>
                </span>
              </div>
            )}
          </section>

          <section className={s.section}>
            <h2 className={s.sectionTitle}>Send</h2>
            <p className={s.sectionHint}>
              Sends selected, ready professors one at a time, pausing the throttle delay
              between each. First connect Gmail once (below) to mint{" "}
              <span className={s.codeInline}>GMAIL_REFRESH_TOKEN</span>.
            </p>
            <div className={s.throttleRow}>
              <div className={`${s.field} ${s.throttleField}`} style={{ marginBottom: 0 }}>
                <label className={s.fieldLabel}>Throttle (seconds, min {MIN_THROTTLE_SECONDS})</label>
                <input
                  type="number"
                  min={MIN_THROTTLE_SECONDS}
                  value={throttle}
                  onChange={(e) => setThrottle(Number(e.target.value))}
                />
              </div>
              <a
                className={`${s.button} ${s.buttonSmall}`}
                href="/api/auth"
                target="_blank"
                rel="noreferrer"
              >
                Connect Gmail (one-time)
              </a>
            </div>

            <div className={s.sendBar} style={{ marginTop: 16 }}>
              <button
                className={`${s.button} ${s.buttonAmber}`}
                onClick={sendAll}
                disabled={sending || counts.ready === 0}
              >
                {sending
                  ? "Sending…"
                  : `Send ${counts.ready} ready email${counts.ready === 1 ? "" : "s"}`}
              </button>
              <span className={s.progressText}>
                {counts.sent} sent · {counts.ready} ready · {counts.selected} selected
              </span>
            </div>
            {sendError && <div className={s.error} style={{ marginTop: 12 }}>{sendError}</div>}

            {professors.some((p) => p.selected) && (
              <div className={s.sendList}>
                {professors
                  .filter((p) => p.selected)
                  .map((p) => (
                    <div className={s.sendItem} key={p.id}>
                      <div className={s.sendItemMain}>
                        <div className={s.sendItemName}>{p.name}</div>
                        <div className={s.sendItemEmail}>{p.email}</div>
                        {p.status === "error" && p.statusMessage && (
                          <div className={s.sendItemMsg}>{p.statusMessage}</div>
                        )}
                      </div>
                      <StatusPill status={p.status} />
                    </div>
                  ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// ---- Small presentational components ------------------------------------

function Stat({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: "selected" | "ready" | "sent";
}) {
  const cls =
    variant === "sent"
      ? s.statSent
      : variant === "ready"
      ? s.statReady
      : variant === "selected"
      ? s.statSelected
      : "";
  return (
    <div className={`${s.stat} ${cls}`}>
      <div className={s.statNum}>{value}</div>
      <div className={s.statLabel}>{label}</div>
    </div>
  );
}

function TabButton({
  n,
  label,
  active,
  onClick,
}: {
  n: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`${s.tab} ${active ? s.tabActive : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className={s.tabNum}>{n}</span>
      <span className={s.tabLabel}>{label}</span>
    </button>
  );
}

function VerificationBadge({
  p,
  checking,
}: {
  p: Professor;
  checking: boolean;
}) {
  if (checking) {
    return <span className={`${s.badge} ${s.badgeChecking}`}>checking…</span>;
  }
  const v = p.verification;
  if (!v) {
    return <span className={`${s.badge} ${s.badgeUnknown}`}>unverified</span>;
  }
  const cls =
    v.status === "valid"
      ? s.badgeValid
      : v.status === "invalid"
      ? s.badgeInvalid
      : v.status === "risky"
      ? s.badgeRisky
      : s.badgeUnknown;
  const label =
    v.status === "risky" ? (v.catch_all ? "catch-all" : "risky") : v.status;
  const title = `format:${v.format_valid} mx:${v.mx_found} smtp:${v.smtp_check} catch_all:${v.catch_all} role:${v.role} disposable:${v.disposable} score:${v.score}`;
  return (
    <span className={`${s.badge} ${cls}`} title={title}>
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: SendStatus }) {
  const map: Record<SendStatus, string> = {
    idle: s.pillIdle,
    generating: s.pillGenerating,
    ready: s.pillReady,
    sending: s.pillSending,
    sent: s.pillSent,
    error: s.pillError,
  };
  const label: Record<SendStatus, string> = {
    idle: "idle",
    generating: "generating…",
    ready: "ready",
    sending: "sending…",
    sent: "sent",
    error: "error",
  };
  return <span className={`${s.pill} ${map[status]}`}>{label[status]}</span>;
}

function ProfessorCard({
  p,
  checking,
  onToggle,
  onHookChange,
  onGenerate,
  onRemove,
}: {
  p: Professor;
  checking: boolean;
  onToggle: (selected: boolean) => void;
  onHookChange: (value: string) => void;
  onGenerate: () => void;
  onRemove: () => void;
}) {
  return (
    <article className={`${s.card} ${p.selected ? s.cardSelected : ""}`}>
      <div className={s.cardHead}>
        <input
          type="checkbox"
          className={s.checkbox}
          checked={p.selected}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Select ${p.name}`}
        />
        <div className={s.cardHeadMain}>
          <div className={s.cardName}>{p.name}</div>
          <div className={s.cardMeta}>
            <span className={s.email}>{p.email}</span>
            {p.university && <span>{p.university}</span>}
            {p.department && <span>{p.department}</span>}
          </div>
        </div>
        <div className={s.cardBadges}>
          <VerificationBadge p={p} checking={checking} />
          <StatusPill status={p.status} />
        </div>
      </div>

      {p.area && <span className={s.areaTag}>{p.area}</span>}
      {p.researchDetail && <p className={s.research}>{p.researchDetail}</p>}

      <div className={s.hookBlock}>
        <label className={s.fieldLabel}>Hook</label>
        <textarea
          className={s.hookInput}
          rows={2}
          placeholder="Generate or write a one-sentence hook…"
          value={p.hook}
          onChange={(e) => onHookChange(e.target.value)}
        />
      </div>

      <div className={s.cardActions}>
        <button
          className={`${s.button} ${s.buttonSmall}`}
          onClick={onGenerate}
          disabled={p.status === "generating"}
        >
          {p.status === "generating"
            ? "Generating…"
            : p.hook
            ? "Regenerate hook"
            : "Generate hook"}
        </button>
        <button
          className={`${s.button} ${s.buttonSmall} ${s.buttonDanger}`}
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
    </article>
  );
}
