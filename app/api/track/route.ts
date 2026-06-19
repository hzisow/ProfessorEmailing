import { NextRequest, NextResponse } from "next/server";
import { checkEngagement, type EngagementCheckItem } from "@/lib/gmail";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { items } = await req.json();
    if (!Array.isArray(items)) {
      return NextResponse.json(
        { error: "items must be an array of { email, threadId }." },
        { status: 400 }
      );
    }
    const clean: EngagementCheckItem[] = items
      .filter(
        (i: any) =>
          i && typeof i.email === "string" && typeof i.threadId === "string"
      )
      .map((i: any) => ({ email: i.email, threadId: i.threadId }));

    const results = await checkEngagement(clean);
    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Tracking check failed." },
      { status: 500 }
    );
  }
}
