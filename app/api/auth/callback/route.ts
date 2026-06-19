import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/gmail";

export const maxDuration = 60;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page(title: string, inner: string): NextResponse {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · ProfPing</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; background: #fbfaf7; color: #14213d;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 24px;
  }
  .card {
    background: #fff; border: 1px solid #e7e3d8; border-left: 4px solid #1d3a8a;
    border-radius: 10px; max-width: 680px; width: 100%; padding: 28px 32px;
    box-shadow: 0 1px 2px rgba(20,33,61,.05);
  }
  h1 { font-family: Georgia, "Times New Roman", serif; font-size: 22px; margin: 0 0 6px; }
  p { line-height: 1.5; font-size: 15px; }
  code, pre {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  pre {
    background: #f3f1ea; border: 1px solid #e7e3d8; border-radius: 8px;
    padding: 14px 16px; overflow-x: auto; font-size: 13px; user-select: all;
    white-space: pre-wrap; word-break: break-all;
  }
  .label { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #6b6857; }
  .err { border-left-color: #a33a3a; }
  .err h1 { color: #a33a3a; }
</style>
</head>
<body><div class="card${title.toLowerCase().includes("fail") ? " err" : ""}">${inner}</div></body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError) {
    return page(
      "Authorization failed",
      `<h1>Authorization failed</h1><p>Google returned: <code>${escapeHtml(
        oauthError
      )}</code></p><p>Make sure your email is added as a test user on the OAuth consent screen, then try <a href="/api/auth">connecting again</a>.</p>`
    );
  }

  if (!code) {
    return page(
      "Authorization failed",
      `<h1>No code returned</h1><p>No authorization code was present in the callback. Start over at <a href="/api/auth">/api/auth</a>.</p>`
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const refresh = tokens.refresh_token;

    if (!refresh) {
      return page(
        "Authorization failed",
        `<h1>No refresh token</h1><p>Google did not return a refresh token. This usually means you've already authorized this app. Revoke ProfPing's access at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>, then visit <a href="/api/auth">/api/auth</a> again (the app requests <code>prompt=consent</code> so a fresh token should be issued).</p>`
      );
    }

    return page(
      "Connected",
      `<h1>Gmail connected</h1>
       <p>Copy this refresh token into your environment as <code>GMAIL_REFRESH_TOKEN</code> (in <code>.env.local</code> for local dev, or your Vercel project settings for production), then restart / redeploy.</p>
       <p class="label">GMAIL_REFRESH_TOKEN</p>
       <pre>${escapeHtml(refresh)}</pre>
       <p>Keep this secret — it lets the app send mail as you. You can revoke it anytime at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>.</p>`
    );
  } catch (err: any) {
    return page(
      "Authorization failed",
      `<h1>Token exchange failed</h1><p><code>${escapeHtml(
        err?.message || "Unknown error"
      )}</code></p><p>Confirm <code>GOOGLE_REDIRECT_URI</code> exactly matches the Authorized redirect URI on your OAuth client, then retry <a href="/api/auth">/api/auth</a>.</p>`
    );
  }
}
