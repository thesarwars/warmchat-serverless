export type PersonalizationToken = {
  token: string;
  label: string;
  description: string;
};

export const PERSONALIZATION_TOKENS: PersonalizationToken[] = [
  { token: "{firstname}", label: "First name", description: "Uses the contact's first name" },
  { token: "{lastname}", label: "Last name", description: "Uses the contact's last name" },
  { token: "{fullname}", label: "Full name", description: "Uses the contact's full name" },
  { token: "{email}", label: "Email", description: "Uses the contact's email address" },
  { token: "{phone}", label: "Phone", description: "Uses the contact's phone number" },
  {
    token: "{senderfullname}",
    label: "Sender full name",
    description: "Uses your full name as shown in WarmChats",
  },
  {
    token: "{sendername}",
    label: "Sender first name",
    description: "Uses your first name for a short sign-off",
  },
  {
    token: "{area}",
    label: "Area",
    description: "Uses property address or area when available on the lead",
  },
];

const TOKEN_ALIASES: Record<string, string> = {
  firstname: "firstname",
  first_name: "firstname",
  lead_first_name: "firstname",
  lastname: "lastname",
  last_name: "lastname",
  lead_last_name: "lastname",
  fullname: "fullname",
  full_name: "fullname",
  lead_full_name: "fullname",
  lead_name: "fullname",
  email: "email",
  lead_email: "email",
  phone: "phone",
  phone_no: "phone",
  lead_phone: "phone",
  lead_phone_no: "phone",
  agent_name: "agent_name",
  sender_name: "agent_name",
  senderfullname: "senderfullname",
  sender_full_name: "senderfullname",
  your_full_name: "senderfullname",
  sendername: "sendername",
  sender_name_short: "sendername",
  area: "area",
  neighborhood: "area",
  company_name: "company_name",
  your_company: "company_name",
  lead_company: "lead_company",
  lead_status: "lead_status",
  property_address: "property_address",
};

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}|\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}/g;

type ContactLike = {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  stage?: string | null;
  status?: string | null;
  company?: string | null;
  property_address?: string | null;
  price_range?: string | null;
};

type SenderLike = {
  name?: string | null;
  orgName?: string | null;
};

function splitName(name?: string | null) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  return {
    first: parts[0] || "",
    last: parts.length > 1 ? parts.slice(1).join(" ") : "",
  };
}

function canonicalToken(token: string) {
  return TOKEN_ALIASES[token.trim().toLowerCase()] || null;
}

export function validatePersonalization(...texts: Array<string | undefined | null>) {
  const unknown = new Set<string>();
  texts.forEach((text) => {
    if (!text) return;
    for (const match of text.matchAll(TOKEN_PATTERN)) {
      const token = (match[1] || match[2] || "").toLowerCase();
      if (!token) continue;
      if (!canonicalToken(token)) unknown.add(token);
    }
  });

  if (!unknown.size) return null;
  const [first] = Array.from(unknown);
  return `Unknown personalization field: {${first}}`;
}

export function renderPersonalizedText(
  template: string,
  contact?: ContactLike | null,
  sender?: SenderLike | null,
) {
  const fallbackName = "there";
  const nameParts = splitName(contact?.name);
  const firstName = (contact?.first_name || nameParts.first || fallbackName).trim() || fallbackName;
  const lastName = (contact?.last_name || nameParts.last || "").trim();
  const fullName = (contact?.name || [firstName, lastName].filter(Boolean).join(" ") || fallbackName).trim();
  const senderFull = String(sender?.name || "WarmChats").trim() || "WarmChats";
  const senderShort =
    senderFull.split(/\s+/).filter(Boolean)[0] || senderFull || "WarmChats";
  const areaValue = [contact?.property_address, contact?.price_range]
    .map((v) => String(v || "").trim())
    .filter(Boolean)[0] || "";

  const values: Record<string, string> = {
    firstname: firstName || fallbackName,
    lastname: lastName,
    fullname: fullName || fallbackName,
    email: String(contact?.email || ""),
    phone: String(contact?.phone || ""),
    agent_name: senderFull,
    senderfullname: senderFull,
    sendername: senderShort,
    company_name: String(sender?.orgName || ""),
    lead_company: String(contact?.company || ""),
    lead_status: String(contact?.stage || contact?.status || "Active"),
    property_address: String(contact?.property_address || ""),
    area: areaValue,
  };

  return template.replace(TOKEN_PATTERN, (_, doubleToken, singleToken) => {
    const token = canonicalToken(doubleToken || singleToken || "");
    if (!token) return _;
    return values[token] ?? "";
  });
}

export function insertTokenAtCursor(
  currentValue: string,
  token: string,
  selectionStart?: number | null,
  selectionEnd?: number | null,
) {
  const start = selectionStart ?? currentValue.length;
  const end = selectionEnd ?? currentValue.length;
  return `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`;
}
