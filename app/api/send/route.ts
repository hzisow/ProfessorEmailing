import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/gmail";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { to, subject, body, attachment } = await req.json();
    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: "Fields 'to', 'subject', and 'body' are required." },
        { status: 400 }
      );
    }

    let normalizedAttachment = null;
    if (
      attachment &&
      typeof attachment.filename === "string" &&
      typeof attachment.contentBase64 === "string" &&
      attachment.contentBase64.length > 0
    ) {
      normalizedAttachment = {
        filename: attachment.filename,
        contentBase64: attachment.contentBase64,
      };
    }

    const { id, threadId } = await sendEmail({
      to,
      subject,
      body,
      attachment: normalizedAttachment,
    });
    return NextResponse.json({ ok: true, id, threadId });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Send failed." },
      { status: 500 }
    );
  }
}
