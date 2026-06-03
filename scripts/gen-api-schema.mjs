// Generates an OpenAPI 3.0 schema from the Cloudflare Pages Functions in
// functions/api, for upload to Cloudflare API Shield (Endpoint Management >
// Upload Schema). Run: node scripts/gen-api-schema.mjs
//
// File-routing rules mirrored here (Cloudflare Pages Functions):
//   functions/api/foo.ts            -> /api/foo
//   functions/api/foo/index.ts      -> /api/foo
//   functions/api/foo/[id].ts       -> /api/foo/{id}
//   functions/api/foo/[[rest]].ts   -> /api/foo/{rest}   (catch-all, see note)
//   export const onRequestGet/Post/Put/Patch/Delete/Head  -> that method
//   export const onRequest (bare)   -> all methods (we emit GET)

import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const API_DIR = join(ROOT, "functions", "api");
const SERVER = "https://www.warmchats.com";

// Cloudflare API Shield (non-Enterprise) caps a zone at 100 operations, but the
// full API has 274. INCLUDE_GROUPS is the prioritized "balanced top ~88" subset:
// security-critical groups plus core data routes. Set to null to emit everything.
const INCLUDE_GROUPS = new Set([
  // security-critical
  "auth", "admin", "webhooks", "billing", "sms", "public", "support", "health",
  // core data
  "leads", "orgs", "conversations", "profile", "messages", "deals",
  // dashboard aggregator (bundles 5 user-scoped reads to save round-trips)
  "bootstrap",
]);
const OUT = join(
  ROOT,
  INCLUDE_GROUPS ? "api-shield-schema.json" : "api-shield-schema.full.json",
);

/** Second path segment after /api, e.g. /api/auth/login -> "auth". */
const groupOf = (p) => p.split("/")[2] || "";

const METHOD_RE =
  /export\s+(?:const|async\s+function|function)\s+onRequest(Get|Post|Put|Patch|Delete|Head)?\b/g;

/** Recursively list .ts files, skipping anything that starts with "_". */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith("_")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** functions/api/foo/[id].ts -> { path: "/api/foo/{id}", params: ["id"] } */
function toRoute(file) {
  let p = relative(ROOT, file).split(sep).join("/");
  p = p.replace(/^functions/, "").replace(/\.ts$/, "");
  p = p.replace(/\/index$/, "");
  // [[rest]] catch-all and [id] dynamic segment both become {name}
  p = p.replace(/\[\[(\w+)\]\]/g, "{$1}").replace(/\[(\w+)\]/g, "{$1}");
  const params = [...p.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  return { path: p, params };
}

function methodsIn(content) {
  const found = new Set();
  for (const m of content.matchAll(METHOD_RE)) {
    found.add((m[1] || "Get").toLowerCase()); // bare onRequest -> get
  }
  return [...found];
}

const paths = {};
for (const file of walk(API_DIR).sort()) {
  const content = readFileSync(file, "utf8");
  const methods = methodsIn(content);
  if (methods.length === 0) continue;
  const { path, params } = toRoute(file);
  if (INCLUDE_GROUPS && !INCLUDE_GROUPS.has(groupOf(path))) continue;
  paths[path] ??= {};
  const parameters = params.map((name) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
  for (const method of methods) {
    paths[path][method] = {
      operationId: `${method}_${path.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
      ...(parameters.length ? { parameters } : {}),
      responses: { default: { description: "Response" } },
    };
  }
}

const schema = {
  openapi: "3.0.3",
  info: {
    title: "WarmChats API",
    version: "1.0.0",
    description:
      "Generated from Cloudflare Pages Functions in functions/api. For Cloudflare API Shield endpoint validation.",
  },
  servers: [{ url: SERVER }],
  paths: Object.fromEntries(Object.entries(paths).sort()),
};

writeFileSync(OUT, JSON.stringify(schema, null, 2) + "\n");
const opCount = Object.values(paths).reduce(
  (n, ops) => n + Object.keys(ops).length,
  0,
);
console.log(
  `Wrote ${OUT}\n  ${Object.keys(paths).length} paths, ${opCount} operations`,
);
