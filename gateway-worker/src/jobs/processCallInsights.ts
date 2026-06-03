/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../env.ts";

/**
 * processCallInsights - the async post-call AI pipeline, run from the gateway
 * worker's per-minute cron (NOT inline in the Telnyx webhook, which must stay
 * fast and within the Pages CPU budget). This standalone Worker gets the normal
 * 30s cron CPU budget, and the heavy steps here are all I/O (awaiting Telnyx +
 * OpenAI), so CPU stays low.
 *
 * Per PENDING call_ai_insights row (batched, few per tick):
 *   1. download the recording from Telnyx (recording_source_url, time-limited)
 *   2. store it in R2, point calls.recording_url at the key (or voicemail_url)
 *   3. transcribe via OpenAI Whisper
 *   4. one chat completion -> { summary, sentiment, intent, budget, tasks[] }
 *   5. persist insights + tasks, flip status DONE, ping the agent's socket
 *
 * Retries via `attempts` (capped) so a permanently-bad recording can't loop.
 */

const BATCH = 3;
const MAX_ATTEMPTS = 4;
const OPENAI_MODEL = "gpt-4o-mini";

interface PendingRow {
  call_id: string;
  recording_source_url: string | null;
  attempts: number;
}

export async function runProcessCallInsights(env: Env): Promise<void> {
  if (!env.OPENAI_API_KEY || !env.ATTACHMENTS) {
    // Expected on a gateway without the AI secrets bound - log it so an empty
    // pipeline isn't mistaken for a silent failure.
    console.log("[cron:callInsights] OPENAI_API_KEY/ATTACHMENTS not configured - skipping");
    return;
  }

  const { results } = await env.D1DB.prepare(
    `SELECT call_id, recording_source_url, attempts FROM call_ai_insights
      WHERE status = 'PENDING' AND attempts < ?
      ORDER BY created_at ASC LIMIT ?`,
  ).bind(MAX_ATTEMPTS, BATCH).all<PendingRow>();

  const due = results ?? [];
  if (due.length === 0) {
    console.log("[cron:callInsights] no PENDING insights - nothing to do");
    return;
  }
  console.log(`[cron:callInsights] ${due.length} pending call(s)${due.length === BATCH ? ` (batched ${BATCH}/tick)` : ""}`);

  let done = 0, willRetry = 0, failed = 0, raced = 0;
  for (const row of due) {
    // Atomically claim the row so overlapping ticks don't double-process.
    const claim = await env.D1DB.prepare(
      `UPDATE call_ai_insights SET status = 'PROCESSING', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
        WHERE call_id = ? AND status = 'PENDING'`,
    ).bind(row.call_id).run();
    if (claim.meta.changes === 0) {
      raced++;
      continue;
    }

    try {
      await processOne(env, row);
      done++;
      console.log(`[cron:callInsights] call=${row.call_id} -> done`);
    } catch (err) {
      const giveUp = row.attempts + 1 >= MAX_ATTEMPTS;
      await env.D1DB.prepare(
        `UPDATE call_ai_insights SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE call_id = ?`,
      ).bind(giveUp ? "FAILED" : "PENDING", String((err as Error).message).slice(0, 500), row.call_id).run();
      if (giveUp) failed++; else willRetry++;
      console.error(`[cron:callInsights] call=${row.call_id} -> ${giveUp ? `FAILED (gave up at ${MAX_ATTEMPTS} attempts)` : "will retry"}: ${String((err as Error).message)}`);
    }
  }
  console.log(`[cron:callInsights] summary: done=${done} willRetry=${willRetry} failed=${failed} raced=${raced}`);
}

async function processOne(env: Env, row: PendingRow): Promise<void> {
  if (!row.recording_source_url) throw new Error("no recording_source_url");

  // 1. Download from Telnyx.
  const dl = await fetch(row.recording_source_url, {
    headers: env.TELNYX_API_KEY ? { Authorization: `Bearer ${env.TELNYX_API_KEY}` } : {},
  });
  if (!dl.ok) throw new Error(`recording download ${dl.status}`);
  const audio = await dl.arrayBuffer();
  if (audio.byteLength > 24 * 1024 * 1024) {
    // Whisper caps at 25MB. Skip transcription but still finish with a stub
    // summary rather than looping. (Chunking is future work.)
    await finish(env, row.call_id, {
      transcript: null,
      summary: "Recording too long to transcribe automatically.",
      sentiment: "neutral", intent: null, budget_min: null, budget_max: null, tasks: [],
    });
    return;
  }

  // 2. Store in R2; point the call at the key (voicemail vs conversation).
  const call = await env.D1DB.prepare(
    `SELECT id, agent_id, is_voicemail FROM calls WHERE id = ?`,
  ).bind(row.call_id).first<{ id: string; agent_id: number; is_voicemail: number }>();
  if (!call) throw new Error("call gone");
  const isVoicemail = call.is_voicemail === 1;
  const key = `calls/${row.call_id}/${isVoicemail ? "voicemail" : "recording"}.mp3`;
  await env.ATTACHMENTS!.put(key, audio, { httpMetadata: { contentType: "audio/mpeg" } });
  await env.D1DB.prepare(
    `UPDATE calls SET ${isVoicemail ? "voicemail_url" : "recording_url"} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).bind(key, row.call_id).run();

  // 3. Transcribe (Whisper).
  const transcript = await transcribe(env, audio);
  await env.D1DB.prepare(
    `UPDATE call_ai_insights SET transcript = ?, updated_at = CURRENT_TIMESTAMP WHERE call_id = ?`,
  ).bind(transcript, row.call_id).run();

  // 4. Extract structured fields + next steps in one completion.
  const extracted = await extract(env, transcript);

  // 5. Persist + notify.
  await finish(env, row.call_id, extracted);
  await pingAgent(env, call.agent_id, row.call_id);
}

interface Extracted {
  transcript?: string | null;
  summary: string | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  intent: string | null;
  budget_min: number | null;
  budget_max: number | null;
  tasks: Array<{ type: string; label: string }>;
}

async function finish(env: Env, callId: string, e: Extracted): Promise<void> {
  // The insights UPDATE + each call_tasks INSERT are all DB-bound (no network),
  // so flush them in one atomic batch round-trip instead of one statement each.
  const stmts: D1PreparedStatement[] = [
    env.D1DB.prepare(
      `UPDATE call_ai_insights
          SET summary = ?, sentiment = ?, intent = ?, budget_min = ?, budget_max = ?,
              status = 'DONE', error_message = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE call_id = ?`,
    ).bind(e.summary, e.sentiment, e.intent, e.budget_min, e.budget_max, callId),
  ];

  const allowed = new Set(["email", "calendar", "task", "automation"]);
  const taskInsert = env.D1DB.prepare(
    `INSERT INTO call_tasks (id, call_id, type, label) VALUES (?, ?, ?, ?)`,
  );
  for (const t of e.tasks ?? []) {
    if (!t?.label || !allowed.has(t.type)) continue;
    stmts.push(taskInsert.bind(crypto.randomUUID(), callId, t.type, String(t.label).slice(0, 300)));
  }
  await env.D1DB.batch(stmts);
}

async function transcribe(env: Env, audio: ArrayBuffer): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/mpeg" }), "recording.mp3");
  form.append("model", "whisper-1");
  form.append("response_format", "text");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`whisper ${res.status}`);
  return (await res.text()).trim();
}

async function extract(env: Env, transcript: string): Promise<Extracted> {
  if (!transcript) {
    return { summary: null, sentiment: "neutral", intent: null, budget_min: null, budget_max: null, tasks: [] };
  }
  const system =
    "You analyze a real-estate sales call transcript. Return STRICT JSON with keys: " +
    "summary (2-3 sentence string), sentiment ('positive'|'neutral'|'negative'), " +
    "intent (short phrase or null), budget_min (number USD or null), budget_max (number USD or null), " +
    "tasks (array of {type:'email'|'calendar'|'task'|'automation', label:string} next steps, max 5). " +
    "Infer budget only if the caller mentions a price/range. Use null when unknown.";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: transcript.slice(0, 12_000) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(raw); } catch { /* leave empty */ }

  const sentiment = parsed.sentiment;
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : null,
    sentiment: sentiment === "positive" || sentiment === "negative" ? sentiment : "neutral",
    intent: typeof parsed.intent === "string" ? parsed.intent : null,
    budget_min: typeof parsed.budget_min === "number" ? parsed.budget_min : null,
    budget_max: typeof parsed.budget_max === "number" ? parsed.budget_max : null,
    tasks: Array.isArray(parsed.tasks)
      ? (parsed.tasks as Array<{ type?: string; label?: string }>)
          .filter((t) => t && typeof t.label === "string" && typeof t.type === "string")
          .map((t) => ({ type: t.type as string, label: t.label as string }))
      : [],
  };
}

/** Ping the agent's UserSocketDO so the detail panel live-refreshes. */
async function pingAgent(env: Env, agentId: number, callId: string): Promise<void> {
  try {
    const id = env.USER_SOCKET.idFromName(`user:${agentId}`);
    await env.USER_SOCKET.get(id).fetch("http://do/emit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "call_insights_ready", data: { callId } }),
    });
  } catch {
    /* non-fatal */
  }
}
