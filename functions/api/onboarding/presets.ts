/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryAll } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/** GET /api/onboarding/presets - predefined sequence templates. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  if (!(await requireUser(env, request))) return error("Unauthorized", 401);
  const rows = await queryAll<{
    id: number; name: string; description: string | null; avg_replies: string;
    no_of_messages: number; days: string | null;
  }>(
    env.D1DB,
    `SELECT id, name, description, avg_replies, no_of_messages, days
       FROM preset ORDER BY id ASC`,
  );
  // Front-end (Onboarding.tsx, OnboardingForAgentsManager.tsx) reads
  // {id,title,description,avgReplies,messages,recommended}.
  return json(rows.map((r) => ({
    id: r.id,
    title: r.name,
    description: r.description,
    avgReplies: r.avg_replies,
    messages: `${r.no_of_messages} over ${r.days ?? ""}`,
    recommended: false,
  })));
};
