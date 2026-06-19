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
      const via = data.usedScrapingBee ? " via ScrapingBee" : "";
      const chars = data.textLength ?? 0;
      if (seeds.length === 0) {
        setScrapeError(
          `Read ${chars} characters${via} but found no email addresses on that page. Two common reasons: (1) big school sites (e.g. Wharton, HBS) block automated requests or load faculty via JavaScript, so a plain fetch can't see them; (2) a directory index page only lists names that link to separate profile pages where the emails actually live. Fixes: paste a CSV instead (always works), point the scraper at a page that shows emails directly (a department "people" page or an individual profile), or add a free SCRAPINGBEE_API_KEY for JS-heavy / blocked sites.`
        );
        return;
      }
      const added = addSeeds(seeds);
      setScrapeMsg(
        `Found ${seeds.length} professor(s) with real emails${via}; added ${added} new (deduped by email); read ${chars} chars.`
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
            Fetched server-side and read with Claude. Emails are never invented — a
            professor is skipped unless their real address is on the page.
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
            {scraping ? "Scraping…" : "Scrape & add"}
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
