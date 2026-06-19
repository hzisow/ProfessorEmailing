import { NextRequest, NextResponse } from "next/server";
import { verifyEmails } from "@/lib/verify";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { emails } = await req.json();
    if (!Array.isArray(emails)) {
      return NextResponse.json(
        { error: "emails must be an array of strings." },
        { status: 400 }
      );
    }
    const clean = emails.filter((e): e is string => typeof e === "string" && !!e);
    const results = await verifyEmails(clean);
    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Verification failed." },
      { status: 500 }
    );
  }
}
