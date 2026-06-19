import { promises as dns } from "dns";
import type { VerificationResult, VerificationStatus } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return ["true", "yes", "1"].includes(v.toLowerCase());
  if (typeof v === "number") return v === 1;
  return false;
}

function asNum(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

function deriveStatus(d: {
  format_valid: boolean;
  mx_found: boolean;
  smtp_check: boolean;
  catch_all: boolean;
  disposable: boolean;
  textual: string;
}): VerificationStatus {
  const t = d.textual.toLowerCase().replace(/[\s-]+/g, "_");
  if (t) {
    if (["deliverable", "valid", "ok", "safe"].includes(t)) return "valid";
    if (["undeliverable", "invalid", "bad", "rejected", "failed"].includes(t)) {
      return "invalid";
    }
    if (
      ["risky", "catch_all", "accept_all", "unknown_catch_all", "role"].includes(t)
    ) {
      return "risky";
    }
    if (t === "unknown") return "unknown";
  }
  // Fall back to signals.
  if (!d.format_valid || !d.mx_found || d.disposable) return "invalid";
  if (d.catch_all) return "risky";
  if (d.smtp_check) return "valid";
  return "risky";
}

// Maileroo's free Email Verification API.
async function verifyWithMaileroo(
  email: string,
  key: string
): Promise<VerificationResult> {
  const body = new URLSearchParams({ api_key: key, email });
  const res = await fetch("https://verify.maileroo.net/check", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Maileroo HTTP ${res.status}`);
  const json: any = await res.json();
  // Maileroo wraps detail under `data`; tolerate a flat response too.
  const d = (json && (json.data ?? json)) || {};

  const format_valid = asBool(d.format_valid ?? d.is_format_valid ?? d.valid_format);
  const mx_found = asBool(d.mx_found ?? d.has_mx_records ?? d.mx_records);
  const smtp_check = asBool(
    d.smtp_check ?? d.is_smtp_valid ?? d.mailbox_exists ?? d.mailbox_found
  );
  const catch_all = asBool(d.catch_all ?? d.is_catch_all ?? d.accept_all);
  const role = asBool(d.role ?? d.is_role ?? d.role_account ?? d.is_role_account);
  const disposable = asBool(d.disposable ?? d.is_disposable);
  const score = asNum(d.score ?? d.confidence_score ?? d.mailbox_score);

  const textual = String(d.status ?? d.verdict ?? d.result ?? d.deliverability ?? "");

  return {
    email,
    status: deriveStatus({ format_valid, mx_found, smtp_check, catch_all, disposable, textual }),
    format_valid,
    mx_found,
    smtp_check,
    catch_all,
    role,
    disposable,
    score,
  };
}

// Free fallback: RFC-style syntax check + DNS MX lookup. No SMTP/catch-all.
async function verifyLocally(email: string): Promise<VerificationResult> {
  const format_valid = EMAIL_RE.test(email);
  let mx_found = false;
  if (format_valid) {
    const domain = email.split("@")[1];
    try {
      const records = await dns.resolveMx(domain);
      mx_found = Array.isArray(records) && records.length > 0;
    } catch {
      mx_found = false;
    }
  }
  // Local check can only fail clearly (bad syntax / no MX) or pass; it never
  // produces a "risky" verdict because it has no SMTP/catch-all visibility.
  const status: VerificationStatus = format_valid && mx_found ? "valid" : "invalid";
  return {
    email,
    status,
    format_valid,
    mx_found,
    smtp_check: false,
    catch_all: false,
    role: false,
    disposable: false,
    score: status === "valid" ? 0.5 : 0,
  };
}

export async function verifyEmails(emails: string[]): Promise<VerificationResult[]> {
  const key = process.env.MAILEROO_API_KEY;
  const results: VerificationResult[] = [];
  for (const email of emails) {
    if (key) {
      try {
        results.push(await verifyWithMaileroo(email, key));
        continue;
      } catch {
        // Fall through to the local check if Maileroo errors.
      }
    }
    results.push(await verifyLocally(email));
  }
  return results;
}
