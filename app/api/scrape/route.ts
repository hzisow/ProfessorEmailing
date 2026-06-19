import { NextRequest, NextResponse } from "next/server";
import { fetchReadableText, extractProfessors } from "@/lib/scrape";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { url, university, area } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "A URL is required." }, { status: 400 });
    }

    const { text, usedScrapingBee } = await fetchReadableText(url);
    if (!text || text.length < 50) {
      return NextResponse.json(
        {
          error:
            "Could not read meaningful text from that URL. Try a more specific faculty page, or set SCRAPINGBEE_API_KEY for JavaScript-heavy directories.",
        },
        { status: 422 }
      );
    }

    const professors = await extractProfessors(
      text,
      typeof university === "string" ? university : "",
      typeof area === "string" ? area : "",
      url
    );

    return NextResponse.json({
      professors,
      usedScrapingBee,
      textLength: text.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Scrape failed." },
      { status: 500 }
    );
  }
}
