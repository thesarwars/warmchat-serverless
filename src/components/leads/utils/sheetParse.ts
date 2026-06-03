// Client-side CSV/XLSX parser for the lead import wizard.
//
// Parsing used to run server-side (one request to preview + parse, a second to
// re-upload + re-parse + commit). It now runs in the browser: the preview costs
// no Worker CPU (free-tier 10ms cap - XLSX.read is synchronous and CPU-bound,
// exactly the kind of work that 1102s on a large workbook) and the whole import
// is a single request that POSTs the already-parsed rows as JSON.
//
// XLSX (SheetJS) is lazy-imported so CSV-only users never download it.

import type { WorkBook } from "xlsx";

interface SheetInfo {
  name: string;
  row_count: number;
}

interface SheetMeta {
  sheets?: SheetInfo[];
  sheet_name?: string;
  has_header?: boolean;
  import_profile?: string;
}

export interface SheetData {
  headers: string[];
  rows: Record<string, string>[];
  meta: SheetMeta;
}

export interface ParseOptions {
  sheetName?: string | null;
  hasHeader?: boolean | null;
}

const EMAIL_RE = /[^@\s]+@[^@\s]+\.[^@\s]+/;
const PHONE_RE = /^[\d\s\-()+.]{7,}$/;

// Mirrors the old server-side caps so a too-large file is rejected before the
// browser spends time on it (and so the JSON payload to the import endpoint
// stays bounded).
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB - headroom for a full 10k-row export
const MAX_IMPORT_ROWS = 10000;

/** 0-based column index -> Excel letter (A, B, ..., Z, AA, ...). */
function excelColumnName(index: number): string {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function cellHasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const s = String(value).trim();
  return Boolean(s) && !["nan", "none"].includes(s.toLowerCase());
}

/**
 * Return true when the detected column headers appear to be data values rather
 * than descriptive names - a strong sign the file has no header row.
 */
function looksLikeDataRow(columns: string[]): boolean {
  for (const col of columns) {
    const s = String(col ?? "").trim();
    if (EMAIL_RE.test(s)) return true;
    if (PHONE_RE.test(s)) return true;
    if (s.length > 60) return true;
  }
  return false;
}

function parseCsv(text: string): SheetData {
  const lines: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      /* swallow */
    } else if (ch === "\n") {
      row.push(field);
      lines.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    lines.push(row);
  }

  // Drop trailing empty rows.
  while (lines.length && lines[lines.length - 1]!.every((c) => !c.trim()))
    lines.pop();
  if (!lines.length) return { headers: [], rows: [], meta: { has_header: true } };

  const headers = lines[0]!.map((h) => h.trim());
  const rows = lines.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").toString().trim();
    });
    return obj;
  });
  return { headers, rows, meta: { has_header: true } };
}

/** List every sheet in the workbook with its non-empty data-row count. */
function listSheets(XLSX: typeof import("xlsx"), wb: WorkBook): SheetInfo[] {
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    if (!ws) return { name, row_count: 0 };
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
      raw: false,
    });
    let count = 0;
    for (const r of aoa) {
      if (Array.isArray(r) && r.some((v) => cellHasValue(v))) count++;
    }
    return { name, row_count: count };
  });
}

function rowsFromAoa(aoa: unknown[][]): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const width = aoa.reduce(
    (max, r) => Math.max(max, Array.isArray(r) ? r.length : 0),
    0,
  );
  const headers = Array.from({ length: width }, (_, i) => excelColumnName(i));
  const rows = aoa
    .map((cells) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        const v = Array.isArray(cells) ? cells[idx] : undefined;
        obj[h] = cellHasValue(v) ? String(v).trim() : "";
      });
      return obj;
    })
    .filter((r) => Object.values(r).some((v) => v));
  return { headers, rows };
}

async function parseXlsx(
  buffer: ArrayBuffer,
  opts: ParseOptions,
): Promise<SheetData> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  if (!wb.SheetNames.length) return { headers: [], rows: [], meta: {} };

  const sheets = listSheets(XLSX, wb);
  const meta: SheetMeta = { sheets };

  // Pick the sheet: explicit name -> the one with the most data rows -> first.
  let chosen = opts.sheetName || "";
  if (!chosen || !wb.SheetNames.includes(chosen)) {
    chosen = sheets.length
      ? sheets.reduce((a, b) => (b.row_count > a.row_count ? b : a)).name
      : wb.SheetNames[0]!;
  }
  if (!wb.SheetNames.includes(chosen)) chosen = wb.SheetNames[0]!;
  meta.sheet_name = chosen;

  const ws = wb.Sheets[chosen];
  if (!ws) return { headers: [], rows: [], meta };

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: false,
  });
  if (!aoa.length) return { headers: [], rows: [], meta };

  const firstRow = (aoa[0] || []).map((v) =>
    cellHasValue(v) ? String(v).trim() : "",
  );

  let useHeaderless: boolean;
  if (opts.hasHeader === false) useHeaderless = true;
  else if (opts.hasHeader === true) useHeaderless = false;
  else useHeaderless = looksLikeDataRow(firstRow);

  if (useHeaderless) {
    const { headers, rows } = rowsFromAoa(aoa);
    meta.has_header = false;
    meta.import_profile = "warmchats_sparse";
    return { headers, rows, meta };
  }

  const headers = firstRow.map((h) => String(h ?? "").trim());
  const rows = aoa
    .slice(1)
    .map((cells) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        const v = Array.isArray(cells) ? cells[idx] : undefined;
        obj[h] = cellHasValue(v) ? String(v).trim() : "";
      });
      return obj;
    })
    .filter((r) => Object.values(r).some((v) => v));
  meta.has_header = true;
  return { headers, rows, meta };
}

export async function parseLeadsFile(
  file: File,
  opts: ParseOptions = {},
): Promise<SheetData> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error(
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). ` +
        `Maximum is ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB.`,
    );
  }
  const name = (file.name || "").toLowerCase();
  const data =
    name.endsWith(".xlsx") || name.endsWith(".xls") || file.type.includes("sheet")
      ? await parseXlsx(await file.arrayBuffer(), opts)
      : parseCsv(await file.text());
  if (data.rows.length > MAX_IMPORT_ROWS) {
    throw new Error(
      `Too many rows (${data.rows.length}). Maximum is ${MAX_IMPORT_ROWS} per import - ` +
        `split the file into smaller batches and try again.`,
    );
  }
  return data;
}

/**
 * Heuristic mapping from sheet headers to `lead` columns. Returns
 * `{ csvHeader: leadField }`.
 */
function suggestMapping(headers: string[]): Record<string, string> {
  const rules: Array<{ field: string; patterns: RegExp[] }> = [
    { field: "first_name", patterns: [/^first[_\s-]?name$/i, /^fname$/i, /^given/i] },
    { field: "last_name", patterns: [/^last[_\s-]?name$/i, /^lname$/i, /^surname/i, /^family/i] },
    { field: "name", patterns: [/^name$/i, /^full[_\s-]?name$/i, /^contact[_\s-]?name$/i, /^contact$/i] },
    { field: "email", patterns: [/email/i, /^e-mail$/i, /^primary[_\s-]?email$/i] },
    { field: "phone", patterns: [/phone/i, /^mobile/i, /^cell/i, /^tel/i, /^primary[_\s-]?phone$/i, /^home[_\s-]?phone$/i] },
    { field: "company", patterns: [/company/i, /organi[sz]ation/i, /business/i, /brokerage/i, /agency/i] },
    { field: "source", patterns: [/^source$/i, /^lead[_\s-]?source$/i, /^how[_\s-]?did/i] },
    { field: "status", patterns: [/^status$/i, /^stage$/i] },
    { field: "property_address", patterns: [/address/i, /^property/i, /^street/i] },
    { field: "area", patterns: [/^area$/i, /city/i, /neighbou?rhood/i, /region/i] },
    { field: "price_range", patterns: [/price[_\s-]?range/i, /^budget$/i, /^range$/i] },
    { field: "estimated_price", patterns: [/^price$/i, /estimated[_\s-]?price/i, /list[_\s-]?price/i] },
    { field: "notes", patterns: [/note/i, /comment/i, /detail/i] },
  ];

  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const h of headers) {
    for (const rule of rules) {
      if (used.has(rule.field)) continue;
      if (rule.patterns.some((p) => p.test(h))) {
        mapping[h] = rule.field;
        used.add(rule.field);
        break;
      }
    }
  }
  return mapping;
}

export type ImportPreview = {
  columns: string[];
  rows: Record<string, string>[];
  total: number;
  suggested_mapping: Record<string, string>;
  sheets: SheetInfo[] | null;
  sheet_name: string | null;
  has_header: boolean | null;
  import_profile: string | null;
  warning: string | null;
};

const PREVIEW_LIMIT = 10;

/**
 * Build the import preview the wizard shows (first N rows + suggested mapping +
 * warnings). Mirrors what the old `/api/leads/import-preview` endpoint returned,
 * but computed entirely in the browser. The full `parsed.rows` are kept by the
 * caller for the single commit request.
 */
export function buildImportPreview(parsed: SheetData): ImportPreview {
  // suggestMapping returns { csvHeader: leadField }; the import dialog keys its
  // mapping by lead field ({ leadField: csvHeader }), so invert. This only fires
  // on REAL column names we recognise (email, phone, "first name", ...). A
  // headerless file (columns A, B, C...) matches nothing and is left fully
  // unmapped on purpose - we never guess from cell values; the AI auto-match
  // button is the tool for that.
  const headerToField = suggestMapping(parsed.headers);
  const suggested_mapping: Record<string, string> = {};
  for (const [header, field] of Object.entries(headerToField)) {
    suggested_mapping[field] = header;
  }

  let warning: string | null = null;
  if (parsed.meta.has_header === false) {
    warning =
      "No header row detected - columns are labeled A, B, C, etc. " +
      "Map the columns to the right lead fields in the next step.";
  } else if (looksLikeDataRow(parsed.headers)) {
    warning =
      "Your file may be missing a header row. " +
      "If the preview looks like data instead of column names, " +
      "re-upload or map columns manually in the next step.";
  }

  return {
    columns: parsed.headers,
    rows: parsed.rows.slice(0, PREVIEW_LIMIT),
    total: parsed.rows.length,
    suggested_mapping,
    sheets: parsed.meta.sheets ?? null,
    sheet_name: parsed.meta.sheet_name ?? null,
    has_header: parsed.meta.has_header ?? null,
    import_profile: parsed.meta.import_profile ?? null,
    warning,
  };
}
