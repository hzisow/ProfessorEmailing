import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { name, university, area, researchDetail } = await req.json();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not set." },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

    const prompt = `You are helping a 10th-grade high school student write ONE sentence for a cold email to a business school professor. The student is genuinely interested in finance and artificial intelligence.

Professor: ${name || "(unknown)"}
University: ${university || "(unknown)"}
Research area: ${area || "(unknown)"}
Specific research detail: ${researchDetail || "(none provided)"}

Write ONE single sentence that:
- Names something SPECIFIC about this professor's work (draw on the research detail above).
- Ties it to the student's interest in finance and AI.
- Begins with "I came across your work on" (or a very close variant).
- Sounds like a sincere, curious sophomore — NOT a marketer or salesperson.
- Does NOT use flattery words such as "groundbreaking", "fascinating", "impressive", "amazing", "incredible", or "honored".
- Is plain, concrete, and specific — never gushing.

Return ONLY the sentence. No quotation marks, no preamble, no extra text.`;

    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    let hook = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    // Strip stray wrapping quotes and collapse whitespace.
    hook = hook.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").trim();

    return NextResponse.json({ hook });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Hook generation failed." },
      { status: 500 }
    );
  }
}
