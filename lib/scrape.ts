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
      const res = await fetch(`https://r.jina.ai/${url}`, { headers });
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
      const res = await fetch(beeUrl);
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
