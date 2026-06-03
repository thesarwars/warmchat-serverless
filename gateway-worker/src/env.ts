/// <reference types="@cloudflare/workers-types" />

export interface Env {
  ENV: string;
  D1DB: D1Database;
  USER_SOCKET: DurableObjectNamespace;
  CALL_ACTOR: DurableObjectNamespace;
  // Calls-page AI pipeline (processCallInsights cron job). R2 for recording
  // storage; OpenAI for transcription + extraction; Telnyx to fetch the source
  // recording. Optional so the worker still boots if calling AI isn't set up.
  ATTACHMENTS?: R2Bucket;
  OPENAI_API_KEY?: string;
  TELNYX_API_KEY?: string;
}
