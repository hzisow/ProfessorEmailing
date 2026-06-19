import * as cheerio from "cheerio";
import Anthropic from "@anthropic-ai/sdk";
import type { ProfessorSeed } from "@/lib/types";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

// Strip tags/scripts/styles to readable text. Surfaces mailto: addresses as
// plain text so real emails survive into the text Claude reads.
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, head, iframe").remove();
  $("a").each((_i, el) => {
    const href = $(el).attr("href") || "";
    if (href.toLowerCase().startsWith("mailto:")) {
      const email = href.slice("mailto:".length).split("?")[0].trim();
      if (email) $(el).append(` ${email} `);
    }
  });
  const text = $("body").text() || $.root().text();
  return text.replace(/[ \t\f\v]+/g, " ").replace(/\s*\n\s*\n\s*/g, "\n").trim();
}

export type ScrapeSource = "direct" | "jina" | "scrapingbee";

// Step 1: plain server-side fetch.
// Step 2: Jina AI Reader (r.jina.ai) — free, no key needed, renders JS and
//         often bypasses blocks. Optional JINA_API_KEY raises rate limits.
// Step 3: ScrapingBee — only if a SCRAPINGBEE_API_KEY is set.
export async function fetchReadableText(
  url: string
): Promise<{ text: string; source: ScrapeSource }> {
  let text = "";
  let source: ScrapeSource = "direct";

  // Step 1 — plain fetch.
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      text = htmlToText(await res.text());
    }
  } catch {
    // Network/blocked — fall through to the readers below.
  }

  // Step 2 — Jina Reader (free, no signup). Default markdown output keeps
  // mailto: links, so real emails survive into the text.
  if (text.length < 500) {
    try {
      const headers: Record<string, string> = {
        "User-Agent": BROWSER_UA,
        Accept: "text/plain, text/markdown, */*",
      };
      if (process.env.JINA_API_KEY) {
        headers["Authorization"] = `Bearer ${process.env.JINA_API_KEY}`;
      }
      const res = await fetch(`https://r.jina.ai/${url}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const jt = (await res.text()).replace(/[ \t\f\v]+/g, " ").trim();
        if (jt.length > text.length) {
          text = jt;
          source = "jina";
        }
      }
    } catch {
      // Ignore — try ScrapingBee or use what we have.
    }
  }

  // Step 3 — ScrapingBee (optional, requires a key).
  const key = process.env.SCRAPINGBEE_API_KEY;
  if (text.length < 500 && key) {
    try {
      const beeUrl =
        "https://app.scrapingbee.com/api/v1/?" +
        new URLSearchParams({ api_key: key, url, render_js: "true" }).toString();
      const res = await fetch(beeUrl, { signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const beeText = htmlToText(await res.text());
        if (beeText.length > text.length) {
          text = beeText;
          source = "scrapingbee";
        }
      }
    } catch {
      // Ignore — use whatever we already have.
    }
  }

  return { text, source };
}

// Strip code fences and isolate the JSON array, then parse defensively.
function parseProfessorJson(
  raw: string,
  university: string,
  area: string
): ProfessorSeed[] {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }

  let arr: unknown;
  try {
    arr = JSON.parse(cleaned);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  return (arr as any[])
    .map((r) => ({
      name: String(r?.name ?? "").trim(),
      email: String(r?.email ?? "").trim().toLowerCase(),
      university: String(r?.university ?? "").trim() || university,
      department: String(r?.department ?? "").trim(),
      area: String(r?.area ?? "").trim() || area,
      researchDetail: String(r?.researchDetail ?? "").trim(),
    }))
    // Keep only rows with a name and an email containing "@".
    .filter((r) => r.name && r.email.includes("@"));
}

// Step 3: hand the extracted text to Claude and get structured professors back.
export async function extractProfessors(
  text: string,
  university: string,
  area: string,
  url = ""
): Promise<ProfessorSeed[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  const client = new Anthropic({ apiKey });

  const clipped = text.slice(0, 60000);
  const areaInstruction = area
    ? `Only include professors whose research clearly matches or relates to "${area}". Discard everyone else.`
    : "Include every professor you can find.";
  const universityHint = university
    ? `Use "${university}" as the university for every professor.`
    : `Infer the university from the page text or the page URL host (${
        url || "unknown"
      }) and email domains — for example wharton.upenn.edu means University of Pennsylvania. Always provide a best-effort university; never leave it blank.`;

  const prompt = `You are extracting faculty contact data from the readable text of a university department or faculty web page.

Return ONLY a JSON array (no prose, no markdown, no code fences). Each element is an object with EXACTLY these keys:
"name", "email", "university", "department", "area", "researchDetail".

Hard rules:
- NEVER invent, guess, or construct an email address. If a professor's real email address does not appear verbatim in the text below, SKIP that professor entirely.
- "email" must be copied exactly from the text and must contain "@".
- "university": ${universityHint}
- "department": the department if stated; otherwise infer the single most likely department from their research (e.g. "Finance", "Marketing"). Never leave it blank.
- "area": a short research-domain label of a few words (e.g. "Finance", "AI & Machine Learning"). Always provide one; infer it from the research if not stated.
- "researchDetail": one or two sentences describing that professor's specific research, drawn only from the text.
- ${areaInstruction}

Page text:
"""
${clipped}
"""`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return parseProfessorJson(raw, university, area);
}

// ===========================================================================
// Directory crawl: given a faculty directory URL, follow each professor's
// profile link, fetch the profile page, pull the real email, and structure it.
// ===========================================================================

interface ProfileLink {
  href: string;
  text: string;
}

const MAX_PROFILES = 40;
const CRAWL_CONCURRENCY = 10;
// Stop starting new profile fetches after this long so there's time left to
// structure the results before Vercel's 60s function limit.
const CRAWL_FETCH_BUDGET_MS = 25000;

const EMAIL_GLOBAL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function extractEmails(text: string): string[] {
  const found = (text.match(EMAIL_GLOBAL) || []).map((e) => e.toLowerCase());
  const cleaned = found.filter(
    (e) => !/\.(png|jpe?g|gif|svg|webp|css|js)$/.test(e) && !e.startsWith("//")
  );
  return Array.from(new Set(cleaned));
}

function absolutize(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

function parseMarkdownLinks(md: string, base: string): ProfileLink[] {
  const links: ProfileLink[] = [];
  const re = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const text = m[1].replace(/\s+/g, " ").trim();
    const href = absolutize(base, m[2]);
    if (href) links.push({ href, text });
  }
  return links;
}

// Same registrable domain (last two labels) — profiles often sit on a subdomain.
function sameSite(a: string, b: string): boolean {
  const reg = (h: string) => h.toLowerCase().split(".").slice(-2).join(".");
  return reg(a) === reg(b);
}

// Faculty directories link each professor by their name — a strong signal.
function nameLike(t: string): boolean {
  const s = (t || "").trim();
  if (s.length < 4 || s.length > 40) return false;
  return /^[A-Z][a-zA-Z.'’-]+(?:\s+[A-Z][a-zA-Z.'’-]+){1,3}$/.test(s);
}

async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  deadlineMs?: number
): Promise<R[]> {
  const out: (R | undefined)[] = new Array(items.length);
  let i = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (i < items.length) {
        if (deadlineMs && Date.now() > deadlineMs) break;
        const idx = i++;
        try {
          out[idx] = await fn(items[idx]);
        } catch {
          out[idx] = undefined;
        }
      }
    }
  );
  await Promise.all(workers);
  return out.filter((x): x is R => x !== undefined);
}

// Fetch a directory page and return its outgoing links + readable text.
async function fetchDirectory(
  url: string
): Promise<{ links: ProfileLink[]; text: string; source: ScrapeSource }> {
  let html = "";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) html = await res.text();
  } catch {
    // try Jina below
  }

  if (html && htmlToText(html).length >= 300) {
    const $ = cheerio.load(html);
    const links: ProfileLink[] = [];
    $("a[href]").each((_i, el) => {
      const href = absolutize(url, $(el).attr("href") || "");
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (href) links.push({ href, text });
    });
    return { links, text: htmlToText(html), source: "direct" };
  }

  // Jina Reader fallback (free) — markdown keeps the profile links.
  try {
    const headers: Record<string, string> = {
      "User-Agent": BROWSER_UA,
      Accept: "text/markdown, text/plain, */*",
    };
    if (process.env.JINA_API_KEY) {
      headers["Authorization"] = `Bearer ${process.env.JINA_API_KEY}`;
    }
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers,
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const md = await res.text();
      return {
        links: parseMarkdownLinks(md, url),
        text: md.replace(/[ \t\f\v]+/g, " ").trim(),
        source: "jina",
      };
    }
  } catch {
    // fall through
  }

  return { links: [], text: htmlToText(html), source: "direct" };
}

// From all links on a directory page, choose the ones that look like
// individual professor profiles.
function pickProfileLinks(links: ProfileLink[], baseUrl: string): ProfileLink[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const basePath = base.origin + base.pathname.replace(/\/+$/, "");
  const seen = new Set<string>();
  const named: ProfileLink[] = [];
  const hinted: ProfileLink[] = [];
  const DENY = /(login|sign-?in|register|search|privacy|terms|cookie|apply|admission|give|donate|news|events?|calendar|contact|about|sitemap|careers|alumni|^\/?$)/i;

  for (const l of links) {
    let u: URL;
    try {
      u = new URL(l.href);
    } catch {
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    if (!sameSite(u.hostname, base.hostname)) continue;
    const clean = u.origin + u.pathname.replace(/\/+$/, "");
    if (clean === basePath) continue;
    if (seen.has(clean)) continue;
    const path = u.pathname.toLowerCase();
    if (/\.(pdf|jpe?g|png|gif|svg|zip|docx?|xlsx?|pptx?)$/.test(path)) continue;
    if (path.split("/").filter(Boolean).length < 1) continue;
    if (DENY.test(path)) continue;
    seen.add(clean);
    if (nameLike(l.text)) named.push({ href: clean, text: l.text });
    else if (/faculty|people|profile|bio|member|person|staff|directory|scholar/.test(path)) {
      hinted.push({ href: clean, text: l.text });
    }
  }

  // Prefer name-linked profiles; otherwise fall back to path-hinted ones.
  return named.length >= 3 ? named : named.concat(hinted);
}

// One Claude call to structure all crawled profiles into professor rows.
async function extractProfessorsFromCandidates(
  candidates: { name: string; url: string; emails: string[]; text: string }[],
  university: string,
  area: string
): Promise<ProfessorSeed[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  const client = new Anthropic({ apiKey });

  const universityHint = university
    ? `Use "${university}" as the university for every professor.`
    : `Infer the university from the profile URL host / email domain; never leave it blank.`;
  const areaInstruction = area
    ? `Only include professors whose research clearly relates to "${area}"; skip the rest.`
    : "Include every candidate that has a real email.";

  const blocks = candidates
    .map(
      (c, i) => `=== Candidate ${i + 1} ===
Name hint: ${c.name || "(unknown)"}
Profile URL: ${c.url}
Emails found on page: ${c.emails.join(", ") || "none"}
Page text: ${c.text.slice(0, 1200)}`
    )
    .join("\n\n");

  const prompt = `You are extracting faculty contact data from several professor profile pages.

Return ONLY a JSON array (no prose, no markdown, no code fences). One object per candidate that has a real email, with EXACTLY these keys:
"name", "email", "university", "department", "area", "researchDetail".

Hard rules:
- "email": choose the candidate's own academic email from their "Emails found" list (prefer one on the institution's domain). NEVER invent one. If "Emails found" is "none", SKIP that candidate.
- "name": the professor's full name (use the name hint, corrected from the page text if needed).
- "university": ${universityHint}
- "department": the department if stated; otherwise infer the single most likely one. Never blank.
- "area": a short research-domain label of a few words; infer from the page if not stated. Never blank.
- "researchDetail": one or two sentences on that professor's specific research, from their page text.
- ${areaInstruction}

Candidates:
"""
${blocks}
"""`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 12000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return parseProfessorJson(raw, university, area);
}

// Orchestrator: single page if it already has emails (e.g. a profile), else
// crawl the directory's profile links.
export async function scrapeDirectory(
  url: string,
  university: string,
  area: string
): Promise<{
  professors: ProfessorSeed[];
  source: ScrapeSource;
  textLength: number;
  followed: number;
  profilesWithEmail: number;
}> {
  const dir = await fetchDirectory(url);
  let professors: ProfessorSeed[] = [];

  // If the page itself shows emails, treat it as a single page.
  if (extractEmails(dir.text).length > 0) {
    professors = await extractProfessors(dir.text, university, area, url);
  }

  let followed = 0;
  let profilesWithEmail = 0;

  // Otherwise follow profile links and pull emails from each profile page.
  if (professors.length === 0) {
    const links = pickProfileLinks(dir.links, url).slice(0, MAX_PROFILES);
    if (links.length > 0) {
      const deadline = Date.now() + CRAWL_FETCH_BUDGET_MS;
      const fetched = await pool(
        links,
        CRAWL_CONCURRENCY,
        async (l) => {
          const r = await fetchReadableText(l.href);
          return { link: l, text: r.text };
        },
        deadline
      );
      followed = fetched.length;
      const candidates = fetched
        .map((f) => ({
          name: f.link.text,
          url: f.link.href,
          emails: extractEmails(f.text),
          text: f.text,
        }))
        .filter((c) => c.emails.length > 0);
      profilesWithEmail = candidates.length;
      if (candidates.length > 0) {
        professors = await extractProfessorsFromCandidates(
          candidates,
          university,
          area
        );
      }
    }
  }

  return {
    professors,
    source: dir.source,
    textLength: dir.text.length,
    followed,
    profilesWithEmail,
  };
}
