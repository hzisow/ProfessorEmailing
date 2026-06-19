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

    const prompt = `You are helping a sincere 10th-grade high school student write ONE opening sentence for a cold email to a business school professor. The student is genuinely interested in finance and artificial intelligence and wants a research position.

Professor: ${name || "(unknown)"}
University: ${university || "(unknown)"}
Research area: ${area || "(unknown)"}
Specific research detail: ${researchDetail || "(none provided)"}

Write ONE single sentence that:
- Names something CONCRETE and specific about THIS professor's work — pull a real topic, method, or focus from the research detail above, not a vague summary.
- Ties that specific topic to the student's interest in finance and AI.
- Begins with "I came across your work on" or a close, natural variant (e.g. "I came across your research on", "I recently read about your work on", "I came across your work studying").
- Sounds like a curious, sincere high school sophomore — plain and direct, NOT a marketer or salesperson.
- Does NOT use flattery or filler words such as "groundbreaking", "fascinating", "impressive", "amazing", "incredible", "honored", or "pioneering".
- Is specific enough that it could only have been written about this professor — name the actual subject, not "your research" in the abstract.

Here is the level of specificity to match (this exact style secured a research position): "I came across the CAMS webpage and was drawn to the topics at the intersection of cybersecurity and business." Match how concrete and grounded that is, but write your own sentence about THIS professor and do not reuse its wording.

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

    hook = hook.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").trim();

    return NextResponse.json({ hook });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Hook generation failed." },
      { status: 500 }
    );
  }
}
