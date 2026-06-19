// Shared types for ProfPing.

export type VerificationStatus = "valid" | "risky" | "invalid" | "unknown";

export interface VerificationResult {
  email: string;
  status: VerificationStatus;
  format_valid: boolean;
  mx_found: boolean;
  smtp_check: boolean;
  catch_all: boolean;
  role: boolean;
  disposable: boolean;
  score: number;
}

// Lifecycle of a professor card through the send pipeline.
export type SendStatus =
  | "idle"
  | "generating"
  | "ready"
  | "sending"
  | "sent"
  | "error";

// What happened to a sent email, detected from the sender's own Gmail thread.
// "no_reply" = delivered, awaiting; "responded" = a reply came back;
// "bounced" = a delivery-failure / mailer-daemon message; "unknown" = couldn't check.
export type Engagement = "no_reply" | "responded" | "bounced" | "unknown";

export interface EngagementResult {
  email: string;
  engagement: Engagement;
  info?: string;
}

export interface Professor {
  id: string;
  name: string;
  email: string;
  university: string;
  department: string;
  area: string;
  researchDetail: string;
  hook: string;
  selected: boolean;
  verification?: VerificationResult;
  status: SendStatus;
  statusMessage?: string;
  // Post-send tracking (populated after a successful send + a tracking check).
  threadId?: string;
  sentAt?: number;
  engagement?: Engagement;
  engagementInfo?: string;
  engagementCheckedAt?: number;
}

// The raw fields produced by scraping / CSV import, before we attach a UI id,
// hook, selection state, and status.
export type ProfessorSeed = Pick<
  Professor,
  "name" | "email" | "university" | "department" | "area" | "researchDetail"
>;

// A campaign-level resume attachment (same file on every email).
export interface Attachment {
  filename: string;
  contentBase64: string;
}
