import type { Professor } from "@/lib/types";

export interface SenderInfo {
  senderName: string;
  senderSchool: string;
  senderGradYear: string;
}

// "Maria Del Carmen Rivera" -> "Rivera". Falls back to the whole name.
export function lastNameOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : name.trim();
}

export function buildMergeContext(
  p: Professor,
  sender: SenderInfo
): Record<string, string> {
  return {
    name: p.name,
    lastName: lastNameOf(p.name),
    area: p.area,
    university: p.university,
    department: p.department,
    hook: p.hook,
    senderName: sender.senderName,
    senderSchool: sender.senderSchool,
    senderGradYear: sender.senderGradYear,
  };
}

// Replace {{field}} tokens. Unknown tokens are left intact so they're visible
// in the preview rather than silently dropped.
export function mergeTemplate(
  template: string,
  ctx: Record<string, string>
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    return key in ctx ? ctx[key] ?? "" : `{{${key}}}`;
  });
}

// The full plain-text email body = merged body + blank line + merged signature.
export function buildEmail(
  p: Professor,
  sender: SenderInfo,
  subjectTemplate: string,
  bodyTemplate: string,
  signatureTemplate: string
): { subject: string; body: string } {
  const ctx = buildMergeContext(p, sender);
  return {
    subject: mergeTemplate(subjectTemplate, ctx),
    body: `${mergeTemplate(bodyTemplate, ctx)}\n\n${mergeTemplate(
      signatureTemplate,
      ctx
    )}`,
  };
}
