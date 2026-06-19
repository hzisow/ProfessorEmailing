"use client";

import { useState } from "react";
import s from "./styles.module.css";
import { useDash } from "@/lib/dash-store";
import type { ProfessorSeed } from "@/lib/types";

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
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // skip
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
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
  if (first.includes("email") && first.includes("name")) start = 1;
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

export default function ImportPanel({ onClose }: { onClose: () => void }) {
  const { addSeeds, professors, clearAll } = useDash();

  const [url, setUrl] = useState("");
  const [scrapeUni, setScrapeUni] = useState("");
  const [scrapeArea, setScrapeArea] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const [scrapeMsg, setScrapeMsg] = useState("");

  const [csvText, setCsvText] = useState("");
  const [csvError, setCsvError] = useState("");
  const [csvMsg, setCsvMsg] = useState("");

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
      const via =
        data.source === "jina"
          ? " via Jina Reader"
          : data.source === "scrapingbee"
          ? " via ScrapingBee"
          : "";
      const chars = data.textLength ?? 0;
      const followed: number = data.followed || 0;
      const withEmail: number = data.profilesWithEmail || 0;
      const followNote = followed
        ? ` Followed ${followed} profile link(s); ${withEmail} had emails.`
        : "";

      if (seeds.length === 0) {
        setScrapeError(
          followed
            ? `Read ${chars} characters${via}.${followNote} Couldn't pull emails — those profile pages likely hide/obfuscate addresses or block automated access. Try a specific professor's profile URL, or paste a CSV (most reliable).`
            : `Read ${chars} characters${via} but found no professor profile links or emails. Try the school's faculty directory URL, an individual profile page, or paste a CSV.`
        );
        return;
      }
      const added = addSeeds(seeds);
      setScrapeMsg(
        `Found ${seeds.length} professor(s) with real emails${via}.${followNote} Added ${added} new (deduped by email).`
      );
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
        "No valid rows found. Expected: name,email,university,department,area,researchDetail (header optional)."
      );
      return;
    }
    const added = addSeeds(seeds);
    setCsvMsg(`Parsed ${seeds.length} valid row(s); added ${added} new (deduped by email).`);
  }

  return (
    <div className={s.importPanel}>
      <div className={s.importHead}>
        <h2 className={s.importTitle}>Import &amp; manage data</h2>
        <div className={s.importHeadRight}>
          <span className={s.importCount}>{professors.length} loaded</span>
          {professors.length > 0 && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (confirm("Remove all loaded professors?")) clearAll();
              }}
            >
              Clear all
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div className={s.importGrid}>
        <section className={s.importSection}>
          <h3 className={s.importSectionTitle}>Scrape a faculty directory</h3>
          <p className={s.importHint}>
            Paste a directory URL. If the page only lists names, the app follows
            each professor&apos;s profile link and pulls their real email
            automatically (free, renders JavaScript). Emails are never invented.
          </p>
          <div className={s.field}>
            <label className={s.label}>Directory URL</label>
            <input
              type="url"
              placeholder="https://www.school.edu/faculty"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className={s.grid2}>
            <div className={s.field}>
              <label className={s.label}>University (optional)</label>
              <input
                type="text"
                placeholder="e.g. Wharton"
                value={scrapeUni}
                onChange={(e) => setScrapeUni(e.target.value)}
              />
            </div>
            <div className={s.field}>
              <label className={s.label}>Area filter (optional)</label>
              <input
                type="text"
                placeholder="e.g. finance, ML"
                value={scrapeArea}
                onChange={(e) => setScrapeArea(e.target.value)}
              />
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleScrape}
            disabled={scraping}
          >
            {scraping ? "Scraping directory…" : "Scrape directory & add"}
          </button>
          {scrapeMsg && <p className={s.statusLine}>{scrapeMsg}</p>}
          {scrapeError && <div className={s.error}>{scrapeError}</div>}
        </section>

        <section className={s.importSection}>
          <h3 className={s.importSectionTitle}>Paste a CSV</h3>
          <p className={s.importHint}>
            Columns:{" "}
            <code className={s.code}>
              name,email,university,department,area,researchDetail
            </code>{" "}
            (header optional).
          </p>
          <textarea
            rows={7}
            placeholder={"Jane Smith,jsmith@school.edu,Wharton,Finance,Asset Pricing,Studies ML for portfolio risk"}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            style={{ fontFamily: "var(--mono)", fontSize: 13 }}
          />
          <button className="btn btn-primary" onClick={handleCsv} style={{ marginTop: 12 }}>
            Parse &amp; add
          </button>
          {csvMsg && <p className={s.statusLine}>{csvMsg}</p>}
          {csvError && <div className={s.error}>{csvError}</div>}
        </section>
      </div>
    </div>
  );
}
