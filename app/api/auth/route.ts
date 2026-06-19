import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/gmail";

export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.redirect(getAuthUrl());
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not build the Google consent URL." },
      { status: 500 }
    );
  }
}
