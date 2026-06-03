/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";
import { requireOrgRole } from "../../../_shared/roleRequired.ts";

/**
 * GET   /api/orgs/:id/quiet-hours - returns the org's sending-hours window
 *                                   { start, end } as 0..24 integers. Members
 *                                   can read so AutoResponsePage can show the
 *                                   current values for non-Owner viewers.
 * PATCH /api/orgs/:id/quiet-hours - body { start, end }, Owner/Manager only.
 *                                   Validates 0 <= start < end <= 24 so the
 *                                   window is non-empty and clamped to a day.
 *
 * Quiet-hours are evaluated per-recipient-timezone by
 * functions/_shared/quietHours.ts:checkQuietHours on every send. That helper
 * reads `organization.quiet_hours_start` / `_end` dynamically, so a save here
 * takes effect on the next outbound message - no cache to invalidate.
 */

interface QuietHoursRow {
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, id))) return error("Forbidden", 403);

  const row = await queryFirst<QuietHoursRow>(
    env.D1DB,
    `SELECT quiet_hours_start, quiet_hours_end FROM organization WHERE id = ?`,
    id,
  );
  if (!row) return error("Not found", 404);
  return json({
    start: row.quiet_hours_start ?? 8,
    end: row.quiet_hours_end ?? 21,
  });
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid org id", 400);
  if (!(await requireOrgRole(env, user.id, id, "Owner", "Manager"))) {
    return error("Access forbidden: insufficient role", 403);
  }

  const body = (await readJson<{ start?: unknown; end?: unknown }>(request)) || {};
  const startNum = Number(body.start);
  const endNum = Number(body.end);
  if (!Number.isInteger(startNum) || !Number.isInteger(endNum)) {
    return error("start and end must be integers", 400);
  }
  if (!(startNum >= 0 && startNum < endNum && endNum <= 24)) {
    return error("0 <= start < end <= 24", 400);
  }

  await execute(
    env.D1DB,
    `UPDATE organization SET quiet_hours_start = ?, quiet_hours_end = ? WHERE id = ?`,
    startNum,
    endNum,
    id,
  );
  return json({ start: startNum, end: endNum });
};
