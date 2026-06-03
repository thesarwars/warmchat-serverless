/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env.ts";

/**
 * CallActorDO - one DO per live call (addressed by `idFromName("call:" + callId)`).
 *
 * The DO is a pure state coordinator: it holds the in-flight call's anchor +
 * fork leg ids in storage and gates the parallel-ring race. It does NOT make
 * Telnyx HTTPS calls itself - those happen in the Pages Function webhook
 * handlers, which call into this DO to ask "what should I do next?" and then
 * issue the Telnyx command. Keeping side effects out of the DO means we
 * don't have to ship the Telnyx client + secrets here.
 *
 * Methods (all POST, JSON body, JSON response):
 *   /set         - initial state on call.initiated (anchor sid + fork sids).
 *   /claim-winner- atomic claim of `answered_via`. Returns { won: bool, loserSid? }.
 *   /get         - read current state.
 *   /terminate   - clear state once the call hits a terminal status (the DO
 *                  becomes garbage-collectable; storage cleared explicitly).
 */
export class CallActorDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/get") {
      const state = (await this.ctx.storage.get("state")) ?? null;
      return this.json({ state });
    }

    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    let body: Record<string, unknown>;
    try { body = (await request.json()) as Record<string, unknown>; }
    catch { return new Response("Bad JSON", { status: 400 }); }

    switch (url.pathname) {
      case "/set":
        return this.handleSet(body);
      case "/claim-winner":
        return this.handleClaimWinner(body);
      case "/leg-down":
        return this.handleLegDown(body);
      case "/terminate":
        return this.handleTerminate();
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  private async handleSet(body: Record<string, unknown>): Promise<Response> {
    const callId = String(body.callId || "");
    if (!callId) return new Response("callId required", { status: 400 });
    const prev = (await this.ctx.storage.get<CallState>("state")) ?? {} as Partial<CallState>;
    const next: CallState = {
      callId,
      anchorCallControlId: String(body.anchorCallControlId ?? prev.anchorCallControlId ?? ""),
      webLegSid: (body.webLegSid as string | null) ?? prev.webLegSid ?? null,
      phoneLegSid: (body.phoneLegSid as string | null) ?? prev.phoneLegSid ?? null,
      answeredVia: prev.answeredVia ?? null,
      stage: String(body.stage ?? prev.stage ?? "INITIATED"),
    };
    await this.ctx.storage.put("state", next);
    return this.json({ state: next });
  }

  /**
   * Atomic fork-leg claim. The first caller wins; subsequent callers with a
   * different `leg` get { won: false }. Pinning the decision to this single
   * Durable Object serializes the claim, since D1 has no row locks.
   */
  private async handleClaimWinner(body: Record<string, unknown>): Promise<Response> {
    const leg = body.leg === "web" || body.leg === "phone" ? body.leg : null;
    if (!leg) return new Response("leg must be 'web' or 'phone'", { status: 400 });
    const state = (await this.ctx.storage.get<CallState>("state")) ?? null;
    if (!state) return this.json({ won: false, reason: "no_state" });

    if (state.answeredVia) {
      const loserSid = leg === "web" ? state.webLegSid : state.phoneLegSid;
      return this.json({ won: false, alreadyAnswered: state.answeredVia, loserSid });
    }

    const next: CallState = { ...state, answeredVia: leg, stage: "BRIDGING" };
    await this.ctx.storage.put("state", next);
    const loserSid = leg === "web" ? state.phoneLegSid : state.webLegSid;
    return this.json({ won: true, anchorSid: state.anchorCallControlId, loserSid });
  }

  /**
   * Record a fork leg hanging up. Returns `{ exhausted: true, anchorSid }` exactly
   * once - when the last dialed leg goes down with no winner claimed - so the
   * caller can divert the still-live anchor to voicemail. Idempotent: a second
   * call after exhaustion returns `{ exhausted: false }`.
   */
  private async handleLegDown(body: Record<string, unknown>): Promise<Response> {
    const sid = String(body.sid || "");
    const state = (await this.ctx.storage.get<CallState>("state")) ?? null;
    if (!state || !sid) return this.json({ exhausted: false });
    if (state.answeredVia) return this.json({ exhausted: false, hasWinner: true });
    if (state.stage === "VOICEMAIL") return this.json({ exhausted: false });

    const down = new Set(state.downLegs ?? []);
    if (sid === state.webLegSid) down.add("web");
    if (sid === state.phoneLegSid) down.add("phone");

    const dialed: Array<"web" | "phone"> = [];
    if (state.webLegSid) dialed.push("web");
    if (state.phoneLegSid) dialed.push("phone");
    const exhausted = dialed.length > 0 && dialed.every((l) => down.has(l));

    await this.ctx.storage.put("state", {
      ...state,
      downLegs: [...down],
      stage: exhausted ? "VOICEMAIL" : state.stage,
    });
    return exhausted
      ? this.json({ exhausted: true, anchorSid: state.anchorCallControlId })
      : this.json({ exhausted: false });
  }

  private async handleTerminate(): Promise<Response> {
    await this.ctx.storage.deleteAll();
    return this.json({ ok: true });
  }

  private json(body: unknown): Response {
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  }
}

type CallState = {
  callId: string;
  anchorCallControlId: string;
  webLegSid: string | null;
  phoneLegSid: string | null;
  answeredVia: "web" | "phone" | null;
  stage: string;
  downLegs?: Array<"web" | "phone">;
};
