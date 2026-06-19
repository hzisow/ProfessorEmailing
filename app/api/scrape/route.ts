import { NextRequest, NextResponse } from "next/server";
import { scrapeDirectory } from "@/lib/scrape";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { url, university, area } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "A URL is required." }, { status: 400 });
    }

    const result = await scrapeDirectory(
      url,
      typeof university === "string" ? university : "",
      typeof area === "string" ? area : ""
    );

    if (result.textLength < 50 && result.followed === 0) {
      return NextResponse.json(
        {
          error:
            "Could not read that URL — the site likely blocks automated access entirely. Try an individual professor's profile page, or paste a CSV.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      professors: result.professors,
      source: result.source,
      textLength: result.textLength,
      followed: result.followed,
      profilesWithEmail: result.profilesWithEmail,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Scrape failed." },
      { status: 500 }
    );
  }
}
