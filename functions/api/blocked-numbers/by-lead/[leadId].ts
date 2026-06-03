/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { suppressPhone } from "../../../_shared/suppression.ts";

/**
 * POST /api/blocked-numbers/by-lead/:leadId - agent-initiated SMS suppression.
 *
 * Backs the "Block Contact" button on the lead profile (inbox right panel).
 * The agent's org-membership is checked, then we resolve the lead's phone and
 * route through the canonical `suppressPhone` helper with
 * `reason: "manual_agent"` so the Compliance settings tab + the admin
 * Blocked Numbers page show who triggered the block.
 *
 * Unblock is intentionally NOT exposed here - only site admins can lift a
 * block (via /admin/blocked) so there's a central audit trail of "why was
 * this contact unblocked". Agents who think a STOP was a mistake go through
 * support, who either asks the lead to text START or unblocks via admin.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const leadId = Number(params.leadId);
  if (!Number.isInteger(leadId) || leadId <= 0) return error("Invalid lead id", 400);

  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  if (!m) return error("User not part of organization", 403);

  const lead = await queryFirst<{ id: number; phone: string | null; org_id: number | null }>(
    env.D1DB, `SELECT id, phone, org_id FROM lead WHERE id = ?`, leadId,
  );
  if (!lead) return error("Lead not found", 404);
  if (lead.org_id !== m.org_id) return error("Lead is not in your organization", 403);
  if (!(lead.phone || "").trim()) {
    return error("This lead has no phone number to block.", 400, {
      code: "NO_PHONE",
    });
  }

  await suppressPhone(env, m.org_id, lead.phone!, {
    reason: "manual_agent",
    blockedByUserId: user.id,
  });
  return json({ blocked: true, lead_id: leadId, phone: lead.phone });
};
