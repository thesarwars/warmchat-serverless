/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { isOrgMember, orgRole } from "../../_shared/orgAccess.ts";
import { setDealAssignees } from "../../_shared/deals.ts";

const VALID_STATUS = new Set(["open", "won", "lost", "archived"]);
const BROKER_ROLES = new Set(["Owner", "Manager"]);

/**
 * PATCH /api/deals/:id - edit a deal: status + pipeline fields (stage, value,
 * probability) and the editable details (name, deal_type, commission,
 * close_date, description). Brokers (Owner/Manager) may also replace the
 * assigned team via assignee_ids. status_source becomes 'manual' when status is
 * set; closed_at is stamped when status moves off 'open' and cleared on return.
 */
interface PatchBody {
  status?: string; stage?: string | null; value?: number | null; probability?: number | null;
  name?: string | null; deal_type?: string | null; commission?: number | null;
  close_date?: string | null; description?: string | null; assignee_ids?: number[];
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid deal id", 400);

  const deal = await queryFirst<{ org_id: number }>(env.D1DB, `SELECT org_id FROM deal WHERE id=?`, id);
  if (!deal) return error("Deal not found", 404);
  if (!(await isOrgMember(env, user.id, deal.org_id))) return error("Forbidden", 403);

  const body = (await readJson<PatchBody>(request)) || {};
  const sets: string[] = [];
  const args: unknown[] = [];

  if (body.status !== undefined) {
    const status = (body.status || "").toLowerCase();
    if (!VALID_STATUS.has(status)) return error("Invalid status", 400);
    sets.push("status = ?", "status_source = 'manual'", "closed_at = ?");
    args.push(status, status === "open" ? null : nowIso());
  }
  if (body.stage !== undefined) { sets.push("stage = ?"); args.push(body.stage); }
  if (body.value !== undefined) { sets.push("value = ?"); args.push(num(body.value)); }
  if (body.probability !== undefined) { sets.push("probability = ?"); args.push(num(body.probability)); }
  if (body.name !== undefined) { sets.push("name = ?"); args.push(body.name ? String(body.name) : null); }
  if (body.deal_type !== undefined) { sets.push("deal_type = ?"); args.push(body.deal_type ? String(body.deal_type) : null); }
  if (body.commission !== undefined) { sets.push("commission = ?"); args.push(num(body.commission)); }
  if (body.close_date !== undefined) { sets.push("close_date = ?"); args.push(body.close_date ? String(body.close_date) : null); }
  if (body.description !== undefined) { sets.push("description = ?"); args.push(body.description ? String(body.description) : null); }

  if (sets.length) {
    await execute(env.D1DB, `UPDATE deal SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...args, id);
  }

  // Team assignees: brokers only.
  if (Array.isArray(body.assignee_ids)) {
    const role = await orgRole(env, user.id, deal.org_id);
    if (role && BROKER_ROLES.has(role)) {
      await setDealAssignees(env, id, body.assignee_ids.map(Number));
    }
  }

  if (!sets.length && !Array.isArray(body.assignee_ids)) return error("Nothing to update", 400);
  const updated = await queryFirst(env.D1DB, `SELECT * FROM deal WHERE id = ?`, id);
  return json({ deal: updated });
};

/** DELETE /api/deals/:id - remove a deal (its assignees cascade). */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid deal id", 400);
  const deal = await queryFirst<{ org_id: number }>(env.D1DB, `SELECT org_id FROM deal WHERE id=?`, id);
  if (!deal) return error("Deal not found", 404);
  if (!(await isOrgMember(env, user.id, deal.org_id))) return error("Forbidden", 403);
  await execute(env.D1DB, `DELETE FROM deal WHERE id = ?`, id);
  return new Response(null, { status: 204 });
};
