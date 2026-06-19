// Best-effort inference to auto-populate domain (area), university, and
// department when imported data leaves them blank. Pure/client-safe.

interface Fields {
  email: string;
  university: string;
  area: string;
  department: string;
  researchDetail: string;
}

// Common institutions keyed by the label that appears in an email/URL host.
// Business-school subdomains map to their parent university.
const KNOWN_SCHOOLS: Record<string, string> = {
  harvard: "Harvard University",
  hbs: "Harvard Business School",
  mit: "Massachusetts Institute of Technology",
  sloan: "MIT Sloan",
  stanford: "Stanford University",
  upenn: "University of Pennsylvania",
  wharton: "Wharton School, University of Pennsylvania",
  yale: "Yale University",
  princeton: "Princeton University",
  columbia: "Columbia University",
  cornell: "Cornell University",
  johnson: "Cornell (Johnson)",
  berkeley: "UC Berkeley",
  haas: "UC Berkeley (Haas)",
  nyu: "New York University",
  stern: "NYU Stern",
  uchicago: "University of Chicago",
  chicago: "University of Chicago",
  booth: "Chicago Booth",
  northwestern: "Northwestern University",
  kellogg: "Northwestern (Kellogg)",
  duke: "Duke University",
  fuqua: "Duke (Fuqua)",
  dartmouth: "Dartmouth College",
  tuck: "Dartmouth (Tuck)",
  umich: "University of Michigan",
  michigan: "University of Michigan",
  ross: "Michigan Ross",
  ucla: "UCLA",
  anderson: "UCLA Anderson",
  usc: "University of Southern California",
  marshall: "USC Marshall",
  virginia: "University of Virginia",
  uva: "University of Virginia",
  darden: "UVA Darden",
  utexas: "University of Texas at Austin",
  mccombs: "UT Austin (McCombs)",
  emory: "Emory University",
  goizueta: "Emory (Goizueta)",
};

const DOMAIN_KEYWORDS: [RegExp, string][] = [
  [/\b(finance|financial|asset pricing|investment|capital markets|corporate finance|banking|portfolio)\b/i, "Finance"],
  [/\b(machine learning|artificial intelligence|deep learning|neural|nlp|data science|\bai\b|\bml\b)\b/i, "AI & Machine Learning"],
  [/\b(market(ing)?|consumer|advertising|brand)\b/i, "Marketing"],
  [/\b(account(ing|ancy)|audit|taxation|\btax\b)\b/i, "Accounting"],
  [/\b(econom(ics|etrics)|macroeconom|microeconom)\b/i, "Economics"],
  [/\b(operations|supply chain|logistics|optimization)\b/i, "Operations"],
  [/\b(strategy|entrepreneurship|innovation|organizational|management)\b/i, "Management & Strategy"],
  [/\b(information systems|fintech|digital economy|technology|blockchain|crypto|cyber)\b/i, "Information Systems"],
];

function titleCase(s: string): string {
  return s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

export function inferUniversity(email: string): string {
  const host = (email.split("@")[1] || "").toLowerCase().replace(/^www\./, "");
  if (!host) return "";
  const labels = host.split(".").filter(Boolean);
  for (const l of labels) {
    if (KNOWN_SCHOOLS[l]) return KNOWN_SCHOOLS[l];
  }
  // Institution label = closest meaningful label before the TLD.
  let core = labels.slice(0, -1); // drop TLD (.edu/.com/...)
  if (core[core.length - 1] === "edu" || core[core.length - 1] === "ac") {
    core = core.slice(0, -1); // handle .edu.au / .ac.uk
  }
  const label = core[core.length - 1] || host;
  const isAcademic = /\.edu(\.|$)|\.ac\./.test(host);
  const looksNamed = /univ|college|institute|school/i.test(label);
  return titleCase(label) + (isAcademic && !looksNamed ? " University" : "");
}

export function inferDomain(area: string, researchDetail: string): string {
  if (area.trim()) return area.trim();
  const hay = researchDetail || "";
  for (const [re, label] of DOMAIN_KEYWORDS) {
    if (re.test(hay)) return label;
  }
  return "General";
}

function primaryOf(area: string): string {
  const parts = area
    .split(/\s*[,/&;|]\s*|\s+and\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);
  return parts[0] || area.trim();
}

export function inferDepartment(
  department: string,
  area: string,
  researchDetail: string
): string {
  if (department.trim()) return department.trim();
  // Fall back to the primary domain so the column / filter is never blank.
  const domain = inferDomain(area, researchDetail);
  return primaryOf(domain);
}

// Fill any blank of {university, area, department} from inference.
export function enrichFields(f: Fields): {
  university: string;
  area: string;
  department: string;
} {
  const area = inferDomain(f.area, f.researchDetail);
  const university = f.university.trim() || inferUniversity(f.email);
  const department = inferDepartment(f.department, area, f.researchDetail);
  return { university, area, department };
}
