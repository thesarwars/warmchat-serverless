// Keeps AI output limited to the allowed placeholder vocabulary so the CRM's
// merge step never sees a typo.

const ALLOWED_PLACEHOLDER_KEYS = new Set([
  "firstname",
  "lastname",
  "fullname",
  "email",
  "phone",
  "area",
  "sendername",
  "senderfullname",
  "agent_name",
  "agentfirstname",
  "agentfullname",
  "company_name",
]);

const PLACEHOLDER_ALIASES: Record<string, string> = {
  "firstname": "firstname",
  "first_name": "firstname",
  "first name": "firstname",
  "lead_first_name": "firstname",
  "lead firstname": "firstname",
  "lastname": "lastname",
  "last_name": "lastname",
  "last name": "lastname",
  "lead_last_name": "lastname",
  "lead lastname": "lastname",
  "fullname": "fullname",
  "full_name": "fullname",
  "full name": "fullname",
  "lead_full_name": "fullname",
  "lead fullname": "fullname",
  "email": "email",
  "email_address": "email",
  "lead_email": "email",
  "phone": "phone",
  "phone_number": "phone",
  "phone_no": "phone",
  "lead_phone_no": "phone",
  "lead_phone": "phone",
  "area": "area",
  "agent_name": "agent_name",
  "agent name": "agent_name",
  "agentname": "agent_name",
  "agentfirstname": "agentfirstname",
  "agent first name": "agentfirstname",
  "agent_first_name": "agentfirstname",
  "agentfullname": "agentfullname",
  "agent full name": "agentfullname",
  "agent_full_name": "agentfullname",
  "sendername": "sendername",
  "sender name": "sendername",
  "sender_name": "sendername",
  "senderfullname": "senderfullname",
  "sender full name": "senderfullname",
  "sender_full_name": "senderfullname",
  "company_name": "company_name",
  "company name": "company_name",
  "companyname": "company_name",
};

function normalizeKey(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^a-zA-Z0-9_ ]+/g, "").trim().toLowerCase();
  if (!cleaned) return null;
  if (ALLOWED_PLACEHOLDER_KEYS.has(cleaned)) return cleaned;
  return PLACEHOLDER_ALIASES[cleaned] ?? null;
}

export function sanitizePlaceholders(text: string): string {
  if (!text) return text;
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}|\{\s*([^{}]+?)\s*\}/g, (_m, dbl, sgl) => {
    const token = (dbl || sgl || "") as string;
    const original = token.trim();
    const cleaned = original.replace(/[^a-zA-Z0-9_ ]+/g, "").trim().toLowerCase();
    const key = normalizeKey(token);
    if (key) {
      return `{${ALLOWED_PLACEHOLDER_KEYS.has(cleaned) ? original : key}}`;
    }
    return original;
  });
}
