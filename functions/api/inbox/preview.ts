/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * POST /api/inbox/preview - render a template with personalization tokens
 * filled in (e.g. {{first_name}}, {{agent_name}}). We implement the
 * common tokens against a lead row.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = (await readJson<{ message?: string; subject?: string; lead_id?: number; contact_id?: number }>(request)) || {};
  const msg = body.message ?? "";
  const subj = body.subject ?? "";
  const leadId = Number(body.lead_id ?? body.contact_id);

  let lead: { first_name: string | null; last_name: string | null; name: string | null; email: string | null; phone: string | null } | null = null;
  if (Number.isInteger(leadId)) {
    lead = await queryFirst(env.D1DB,
      `SELECT first_name, last_name, name, email, phone FROM lead WHERE id = ?`, leadId);
  }

  const replacements: Record<string, string> = {
    first_name: lead?.first_name || lead?.name?.split(" ")[0] || "there",
    last_name: lead?.last_name || "",
    full_name: lead?.name || [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "",
    lead_email: lead?.email || "",
    lead_phone: lead?.phone || "",
    agent_name: user.name || "",
    agent_email: user.email,
  };
  const render = (s: string) => s.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k) => replacements[k.toLowerCase()] ?? "");

  return json({ subject: render(subj), message: render(msg) });
};
