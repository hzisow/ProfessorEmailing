import { google } from "googleapis";
import type { Attachment, Engagement, EngagementResult } from "@/lib/types";

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  attachment?: Attachment | null;
}

// gmail.send to send; gmail.metadata to detect replies/bounces in your own
// threads (headers only — never reads message bodies).
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.metadata",
];
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
    scope: GMAIL_SCOPES,
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

export async function sendEmail(
  params: SendEmailParams
): Promise<{ id: string; threadId: string }> {
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
  return { id: res.data.id || "", threadId: res.data.threadId || "" };
}

export interface EngagementCheckItem {
  email: string;
  threadId: string;
}

// Inspect each sent thread (metadata only) to detect a reply from the professor
// or a delivery-failure bounce. Cannot detect opens or deletions — no email
// provider exposes those signals to the sender.
export async function checkEngagement(
  items: EngagementCheckItem[]
): Promise<EngagementResult[]> {
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const sender = (process.env.SENDER_EMAIL || "").toLowerCase();
  if (!refreshToken) throw new Error("GMAIL_REFRESH_TOKEN is not set.");

  const oauth2 = getOAuthClient();
  oauth2.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const results: EngagementResult[] = [];
  for (const item of items) {
    if (!item.threadId) {
      results.push({ email: item.email, engagement: "unknown", info: "Not sent yet" });
      continue;
    }
    try {
      const res = await gmail.users.threads.get({
        userId: "me",
        id: item.threadId,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });
      const messages = res.data.messages || [];
      let engagement: Engagement = "no_reply";
      let info: string | undefined;
      const prof = item.email.toLowerCase();

      for (const m of messages) {
        const headers = m.payload?.headers || [];
        const get = (n: string) =>
          headers.find((h) => (h.name || "").toLowerCase() === n)?.value || "";
        const from = get("from").toLowerCase();
        const subject = get("subject");
        const date = get("date");

        // Skip our own outgoing message(s).
        if (sender && from.includes(sender)) continue;

        if (
          from.includes("mailer-daemon") ||
          from.includes("postmaster") ||
          /delivery status notification|undeliverable|delivery (has )?failed|mail delivery failed/i.test(
            subject
          )
        ) {
          engagement = "bounced";
          info = "Delivery failed / bounced";
          break;
        }

        // Any non-sender message in the thread is a reply.
        engagement = "responded";
        info = from.includes(prof)
          ? date
            ? `Replied ${date}`
            : "Replied"
          : "Reply in thread";
        break;
      }

      results.push({ email: item.email, engagement, info });
    } catch (e: any) {
      const msg = String(e?.message || "");
      const needsAuth =
        e?.code === 403 ||
        e?.code === 401 ||
        /insufficient|scope|permission|metadata|forbidden|unauthor/i.test(msg);
      results.push({
        email: item.email,
        engagement: "unknown",
        info: needsAuth
          ? "Reconnect Gmail to enable tracking (needs read access)"
          : "Could not check this thread",
      });
    }
  }
  return results;
}
