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
