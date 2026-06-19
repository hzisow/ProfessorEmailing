import { google } from "googleapis";
import type { Attachment } from "@/lib/types";

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  attachment?: Attachment | null;
}

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const CRLF = "\r\n";

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing Google OAuth env vars (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)."
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(): string {
  return getOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_SEND_SCOPE],
  });
}

export async function exchangeCodeForTokens(code: string) {
  const { tokens } = await getOAuthClient().getToken(code);
  return tokens;
}

// base64url for the full assembled MIME message (Gmail API `raw`).
function base64url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Standard base64, wrapped to 76-char lines per RFC 2045 (used inside parts).
function base64Lines(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
  const b64 = buf.toString("base64");
  return (b64.match(/.{1,76}/g) || []).join(CRLF);
}

// RFC 2047 encode a header value only if it contains non-ASCII.
function encodeHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

// Build a complete RFC 2822 message. Single text/plain part, or multipart/mixed
// with a PDF attachment. Uses CRLF throughout.
export function buildRawMessage(params: SendEmailParams, from: string): string {
  const { to, subject, body, attachment } = params;
  const baseHeaders = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
  ];

  if (attachment && attachment.contentBase64) {
    const boundary = `=_profping_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const cleanAttachment = attachment.contentBase64.replace(/\s+/g, "");
    const attachmentLines = (cleanAttachment.match(/.{1,76}/g) || []).join(CRLF);

    return [
      ...baseHeaders,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(body),
      "",
      `--${boundary}`,
      `Content-Type: application/pdf; name="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "",
      attachmentLines,
      `--${boundary}--`,
      "",
    ].join(CRLF);
  }

  return [
    ...baseHeaders,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(body),
    "",
  ].join(CRLF);
}

export async function sendEmail(params: SendEmailParams): Promise<string> {
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const sender = process.env.SENDER_EMAIL;
  if (!refreshToken) throw new Error("GMAIL_REFRESH_TOKEN is not set.");
  if (!sender) throw new Error("SENDER_EMAIL is not set.");

  const oauth2 = getOAuthClient();
  oauth2.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const raw = base64url(buildRawMessage(params, sender));
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
  return res.data.id || "";
}
