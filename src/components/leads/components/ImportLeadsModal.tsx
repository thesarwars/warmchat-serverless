import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Flag,
  Info,
  Loader2,
  MessageSquare,
  Sparkles,
  Tag,
  Upload,
  Users,
  X,
  Zap,
} from "lucide-react";
import AiOffWarning from "./AiOffWarning";
import { useFetch } from "@/helpers/hooks";
import { fetchOrgAutomations } from "@/helpers/backend";
import {
  DUPLICATE_HANDLING_OPTIONS,
  IMPORT_SMS_CONSENT_OPTIONS,
  IMPORT_STEP_LABELS,
  LEAD_FIELD_LABELS_MAP,
  LEAD_FIELDS,
  STAGE_OPTIONS,
  STAGE_DESCRIPTIONS,
} from "../constants";
import type {
  DuplicateHandling,
  ImportResult,
  ImportSheetMeta,
  ImportSkipReason,
  ImportStep,
  SmsConsentStatus,
} from "../types";

export type ImportLeadsModalProps = {
  open: boolean;
  importStep: ImportStep;
  csvFile: File | null;
  csvTotalRows: number;
  csvHeaders: string[];
  csvPreview: Record<string, string>[];
  mapping: Record<string, string>;
  setMapping: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  duplicateHandling: DuplicateHandling;
  setDuplicateHandling: (value: DuplicateHandling) => void;
  importSmsConsent: SmsConsentStatus;
  setImportSmsConsent: (value: SmsConsentStatus) => void;
  importConsentAttested: boolean;
  setImportConsentAttested: (value: boolean) => void;
  batchTags: string;
  setBatchTags: (value: string) => void;
  importResult: ImportResult | null;
  importSkipReasons: ImportSkipReason[];
  importPreviewLoading: boolean;
  importSheets: ImportSheetMeta[];
  importSheetName: string;
  setImportSheetName: (value: string) => void;
  importDetectionSummary: string[];
  importDetectionMethod: string;
  importDefaultStage: string;
  setImportDefaultStage: (value: string) => void;
  importInboundEnabled: boolean;
  setImportInboundEnabled: (value: boolean) => void;
  importQualificationEnabled: boolean;
  setImportQualificationEnabled: (value: boolean) => void;
  importHumanOnly: boolean;
  setImportHumanOnly: (value: boolean) => void;
  importAutomationId: number | null;
  setImportAutomationId: (value: number | null) => void;
  importAiApplying: boolean;
  message2: string;
  importBusy: boolean;
  importLoadingMessage: string;
  onClose: () => void;
  onDone: () => Promise<void>;
  onBack: () => void;
  onContinue: () => void;
  fetchImportPreview: (
    file: File,
    opts?: { sheetName?: string; hasHeader?: boolean | null },
  ) => Promise<boolean>;
  handleCSVSelect: (file: File) => Promise<void>;
  importMappingHasContact: () => boolean;
  getImportFieldMappingStatus: (field: string) => "none" | "auto" | "manual";
  runAutoMap: () => void;
  aiMapLoading: boolean;
  aiMapUsed: boolean;
  aiMapMessage: string;
};

const TOTAL_STEPS = IMPORT_STEP_LABELS.length;

const getImportedLeadCount = (result?: ImportResult | null) =>
  result?.imported ??
  (result?.created ?? 0) + (result?.updated ?? 0);

const formatNum = (n: number) => n.toLocaleString();

export default function ImportLeadsModal({
  open,
  importStep,
  csvFile,
  csvTotalRows,
  csvHeaders,
  csvPreview,
  mapping,
  setMapping,
  duplicateHandling,
  setDuplicateHandling,
  importSmsConsent,
  setImportSmsConsent,
  importConsentAttested,
  setImportConsentAttested,
  batchTags,
  setBatchTags,
  importResult,
  importSkipReasons,
  importPreviewLoading,
  importSheets,
  importSheetName,
  setImportSheetName,
  importDetectionSummary,
  importDetectionMethod,
  importDefaultStage,
  setImportDefaultStage,
  importInboundEnabled,
  setImportInboundEnabled,
  importQualificationEnabled,
  setImportQualificationEnabled,
  importHumanOnly,
  setImportHumanOnly,
  importAutomationId,
  setImportAutomationId,
  // importAiApplying is part of the prop contract but not surfaced in this
  // redesigned wizard; intentionally not destructured to satisfy noUnusedLocals.
  message2,
  importBusy,
  importLoadingMessage,
  onClose,
  onDone,
  onBack,
  onContinue,
  fetchImportPreview,
  handleCSVSelect,
  importMappingHasContact,
  getImportFieldMappingStatus,
  runAutoMap,
  aiMapLoading,
  aiMapUsed,
  aiMapMessage,
}: ImportLeadsModalProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  // Tags input draft (committed tags render as chips). Must stay above the
  // early `if (!open) return null` so hook order is stable (React #310).
  const [tagDraft, setTagDraft] = useState("");
  // Workflows the imported leads can be enrolled into (step 3, card 4). Hook
  // must also stay above the early return.
  const importOrgId = localStorage.getItem("org_id");
  const { data: orgAutomations } = useFetch<
    Array<{ id: number; name: string; status?: string | null }>
  >(
    ["org_automations_import"],
    () =>
      fetchOrgAutomations(importOrgId || "") as Promise<
        Array<{ id: number; name: string; status?: string | null }>
      >,
    {},
    { enabled: open && Boolean(importOrgId) },
  );
  const workflowOptions = Array.isArray(orgAutomations) ? orgAutomations : [];

  // Each step starts scrolled to the TOP - without this, a long step (e.g. the
  // mapping grid) leaves the next step opened at the bottom.
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bodyScrollRef.current?.scrollTo({ top: 0 });
  }, [importStep]);

  // Success screen auto-dismiss: after the import completes, return to the
  // Leads page automatically after 3s (onDone closes + refreshes the list).
  // The ✕ on the success screen offers an immediate exit. Hook stays above the
  // early return so hook order is stable.
  useEffect(() => {
    if (!open) return;
    if (!(importStep === TOTAL_STEPS && importResult)) return;
    const t = window.setTimeout(() => {
      void onDone();
    }, 3000);
    return () => window.clearTimeout(t);
  }, [open, importStep, importResult, onDone]);

  if (!open) return null;

  const stepLabel = IMPORT_STEP_LABELS[importStep - 1] ?? "";
  const hasContact = importMappingHasContact();

  // Fields the user explicitly mapped (auto or manual) - these power the
  // "mapped automatically / by you" disclosure list in step 2.
  const mappedEntries = LEAD_FIELDS
    .map((field) => ({ field, source: mapping[field] }))
    .filter((e) => e.source);
  const autoMappedCount = LEAD_FIELDS.filter(
    (f) => getImportFieldMappingStatus(f) === "auto",
  ).length;

  const usedHeaders = new Set(Object.values(mapping).filter(Boolean));

  const consentNeedsAttest =
    (importSmsConsent === "opted_in" || !!mapping.sms_consent) &&
    !importConsentAttested;

  const continueDisabled =
    (importStep === 1 && !csvFile) ||
    (importStep === 2 && !hasContact) ||
    // TCPA attestation gate: when the agent claims "Already opted in" (globally
    // or via a per-row CSV column) the attestation checkbox must be ticked
    // before continuing. The SMS consent + attestation now live on the merged
    // Import Settings step (step 3), so the gate blocks Continue there.
    (importStep === 3 && consentNeedsAttest) ||
    importBusy ||
    (importStep === TOTAL_STEPS && !!importResult);

  const ctaLabel =
    importStep === TOTAL_STEPS
      ? `Import ${formatNum(csvTotalRows)} Lead${csvTotalRows === 1 ? "" : "s"}`
      : importStep === TOTAL_STEPS - 1
        ? "Continue to Review"
        : "Continue";

  const stepNote = (() => {
    if (importStep === 1) {
      return csvFile
        ? `${formatNum(csvTotalRows)} row${csvTotalRows === 1 ? "" : "s"} detected`
        : "Select a CSV or XLSX file to begin";
    }
    if (importStep === 2) {
      return hasContact
        ? `${mappedEntries.length} column${mappedEntries.length === 1 ? "" : "s"} mapped`
        : "Map a contact field to continue";
    }
    if (importStep === TOTAL_STEPS) {
      return `${formatNum(csvTotalRows)} row${csvTotalRows === 1 ? "" : "s"} in file · Inbound AI ${importInboundEnabled ? "ON" : "OFF"}`;
    }
    return `Step ${importStep} of ${TOTAL_STEPS}`;
  })();

  const dupLabel =
    DUPLICATE_HANDLING_OPTIONS.find((o) => o.value === duplicateHandling)
      ?.label ?? duplicateHandling;
  const consentLabel =
    IMPORT_SMS_CONSENT_OPTIONS.find((o) => o.value === importSmsConsent)
      ?.label ?? importSmsConsent;
  const tagList = batchTags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  // The input holds only the in-progress text; committed tags render as chips.
  // (tagDraft state is declared above, before the early return.)
  const commitTags = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const seen = new Set(tagList.map((t) => t.toLowerCase()));
    const merged = [...tagList];
    for (const p of parts) {
      if (!seen.has(p.toLowerCase())) {
        merged.push(p);
        seen.add(p.toLowerCase());
      }
    }
    setBatchTags(merged.join(", "));
  };

  const isSuccess = importStep === TOTAL_STEPS && !!importResult;

  return (
    <div className="wcv2">
      <div
        className="wc-modal-scrim"
        onClick={
          importBusy ? undefined : isSuccess ? () => void onDone() : onClose
        }
      >
        <div
          className="wc-wz wc-imp-wz"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Import Leads"
        >
          {isSuccess ? (
            <SuccessScreen
              importResult={importResult}
              importSkipReasons={importSkipReasons}
              importInboundEnabled={importInboundEnabled}
              importDefaultStage={importDefaultStage}
              message2={message2}
              onDone={onDone}
            />
          ) : (
            <>
              {/* ===== Top bar ===== */}
              <div className="wc-imp-top">
                <div className="wc-imp-brand">
                  <div className="wc-imp-brand-ic">
                    <Upload size={22} />
                  </div>
                  <div>
                    <div className="wc-imp-brand-t">Import Leads</div>
                    <div className="wc-imp-brand-s">
                      Step {importStep} of {TOTAL_STEPS} — {stepLabel}
                    </div>
                  </div>
                </div>

                <div className="wc-imp-stepper">
                  {IMPORT_STEP_LABELS.map((label, idx) => {
                    const node = idx + 1;
                    const isCur = node === importStep;
                    const isDone = node < importStep;
                    return (
                      <React.Fragment key={label}>
                        <div
                          className={`wc-imp-snode${isCur ? " is-cur" : ""}${isDone ? " is-done" : ""}`}
                        >
                          <div className="wc-imp-scirc">
                            {isDone ? <Check size={15} /> : node}
                          </div>
                          <div className="wc-imp-slabel">{label}</div>
                        </div>
                        {node < TOTAL_STEPS && (
                          <div
                            className={`wc-imp-sline${isDone ? " is-done" : ""}`}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="wc-imp-close"
                  onClick={onClose}
                  disabled={importBusy}
                  aria-label="Close import"
                >
                  <X size={20} />
                </button>
              </div>

              {/* ===== Body ===== */}
              <div className="wc-imp-bodywrap" ref={bodyScrollRef}>
                {importBusy && importLoadingMessage && (
                  <div className="wc-imp-narrow" style={{ marginBottom: 16 }}>
                    <div className="wc-imp-ready" style={{ marginTop: 0 }}>
                      <Loader2 size={16} className="animate-spin" />
                      {importLoadingMessage}
                    </div>
                  </div>
                )}

                {/* STEP 1 — Upload File */}
                {importStep === 1 && (
                  <div className="wc-imp-narrow">
                    <p className="wc-imp-lead">
                      Upload any CSV or Excel export (agent spreadsheets, CRM
                      exports, etc.). No fixed template — we detect columns
                      automatically. Up to 10,000 rows.
                    </p>

                    {importSheets.length > 1 && (
                      <div style={{ marginBottom: 16 }}>
                        <label
                          className="wc-imp-stat-l"
                          style={{ display: "block", marginBottom: 6 }}
                        >
                          Worksheet
                        </label>
                        <select
                          className="wc-modal-input"
                          value={importSheetName}
                          onChange={async (e) => {
                            const name = e.target.value;
                            setImportSheetName(name);
                            if (csvFile) {
                              await fetchImportPreview(csvFile, {
                                sheetName: name,
                              });
                            }
                          }}
                        >
                          {importSheets.map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.name} ({s.row_count} rows)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {!csvFile ? (
                      <label
                        className={`wc-imp-drop${isDragOver ? " is-drag" : ""}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDragOver(true);
                        }}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDragOver(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDragOver(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDragOver(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file) handleCSVSelect(file);
                        }}
                      >
                        <div className="wc-imp-drop-ic">
                          <Upload size={28} />
                        </div>
                        <div className="wc-imp-drop-t">
                          {isDragOver
                            ? "Drop to upload"
                            : "Drag & drop your file here"}
                        </div>
                        <p className="wc-band-d" style={{ marginBottom: 14 }}>
                          or <span className="wc-accent-text">browse</span> —
                          CSV or XLSX, up to 10,000 rows
                        </p>
                        <span className="wc-primary wc-sm">
                          <Upload size={15} />
                          Browse files
                        </span>
                        <input
                          type="file"
                          accept=".csv,.xls,.xlsx"
                          className="hidden"
                          style={{ display: "none" }}
                          onChange={(e) =>
                            e.target.files &&
                            handleCSVSelect(e.target.files[0])
                          }
                        />
                      </label>
                    ) : (
                      <>
                        <div className="wc-imp-file">
                          <div className="wc-imp-file-ic">
                            <Upload size={18} />
                          </div>
                          <div className="wc-imp-file-b">
                            <div className="wc-imp-file-n">{csvFile.name}</div>
                            <div className="wc-band-d">
                              {(csvFile.size / 1024).toFixed(0)} KB
                              {importSheetName ? ` · ${importSheetName}` : ""}
                            </div>
                          </div>
                          <label
                            className="wc-iconbtn-sm"
                            aria-label="Replace file"
                            style={{ cursor: "pointer" }}
                          >
                            <Upload size={15} />
                            <input
                              type="file"
                              accept=".csv,.xls,.xlsx"
                              style={{ display: "none" }}
                              onChange={(e) =>
                                e.target.files &&
                                handleCSVSelect(e.target.files[0])
                              }
                            />
                          </label>
                        </div>

                        <div className="wc-imp-stats">
                          <div className="wc-imp-stat found">
                            <div className="wc-imp-stat-n">
                              {formatNum(csvTotalRows)}
                            </div>
                            <div className="wc-imp-stat-l">Rows found</div>
                          </div>
                          <div className="wc-imp-stat ok">
                            <div className="wc-imp-stat-n">
                              {csvHeaders.length}
                            </div>
                            <div className="wc-imp-stat-l">
                              Columns detected
                            </div>
                          </div>
                          <div className="wc-imp-stat warn">
                            <div className="wc-imp-stat-n">
                              {csvPreview.length}
                            </div>
                            <div className="wc-imp-stat-l">Preview rows</div>
                          </div>
                        </div>
                      </>
                    )}

                    {message2 && (
                      <p
                        className="wc-band-d"
                        style={{ color: "#DC2626", marginTop: 12 }}
                      >
                        {message2}
                      </p>
                    )}

                    <p className="wc-band-d" style={{ marginTop: 14 }}>
                      Sample format:{" "}
                      <a
                        href="/samples/Leads.xlsx"
                        download="Leads.xlsx"
                        className="wc-accent-text"
                      >
                        Download Leads.xlsx
                      </a>
                    </p>
                  </div>
                )}

                {/* STEP 2 — Map Columns */}
                {importStep === 2 && (
                  <div className="wc-imp-narrow">
                    <p className="wc-imp-lead">
                      Match your file columns to lead fields. Map at least one
                      contact field (Email, Phone, or Phone or Email). Unmapped
                      columns are ignored.
                    </p>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 9,
                        marginBottom: 14,
                      }}
                    >
                      <button
                        type="button"
                        onClick={runAutoMap}
                        disabled={aiMapLoading || csvHeaders.length === 0}
                        className="wc-imp-chip"
                        title="Use AI to match your columns to lead fields (uses 1 AI request)"
                      >
                        {aiMapLoading ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Sparkles size={14} />
                        )}
                        {aiMapLoading
                          ? "Matching columns…"
                          : aiMapUsed
                            ? "Re-run AI match"
                            : "AI auto-match columns"}
                      </button>
                      <span className="wc-band-d">Uses 1 AI request</span>
                    </div>

                    {aiMapMessage && (
                      <div className="wc-imp-next" style={{ marginTop: 0 }}>
                        <Sparkles size={16} />
                        <p>{aiMapMessage}</p>
                      </div>
                    )}

                    {/* Auto-mapped disclosure */}
                    {mappedEntries.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="wc-imp-mapsummary"
                          onClick={() => setMapOpen((v) => !v)}
                        >
                          <span className="wc-imp-mapok">
                            <Check size={18} />
                            {mappedEntries.length} field
                            {mappedEntries.length === 1 ? "" : "s"} mapped
                            {autoMappedCount > 0
                              ? ` (${autoMappedCount} automatically)`
                              : ""}
                          </span>
                          <ChevronDown
                            size={18}
                            style={{
                              transform: mapOpen ? "rotate(180deg)" : "none",
                              transition: ".15s",
                            }}
                          />
                        </button>
                        {mapOpen && (
                          <div className="wc-imp-maplist">
                            {mappedEntries.map(({ field, source }) => (
                              <div className="wc-imp-maprow" key={field}>
                                <ArrowRight size={15} />
                                <span className="wc-imp-mapcol">{source}</span>
                                <span className="wc-imp-mapfield">
                                  {LEAD_FIELD_LABELS_MAP[field] ?? field}
                                </span>
                                <span className="wc-imp-mapcheck">
                                  <Check size={13} />
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {/* Needs attention — contact requirement */}
                    {!hasContact && (
                      <>
                        <div className="wc-imp-attn-h">
                          <Info size={15} />
                          Needs your attention
                          <span className="wc-imp-attn-n">1</span>
                        </div>
                        <div className="wc-imp-attn">
                          <Info size={18} />
                          <div className="wc-imp-attn-col">
                            <div className="wc-imp-attn-name">
                              No contact field mapped
                            </div>
                            <div className="wc-imp-attn-sub">
                              Map Email, Phone, or “Phone or Email” before
                              continuing.
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Full field mapping grid */}
                    <div className="wc-imp-attn-h">
                      <Info size={15} />
                      All lead fields
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 12,
                      }}
                    >
                      {LEAD_FIELDS.map((field) => {
                        const status = getImportFieldMappingStatus(field);
                        return (
                          <div key={field}>
                            <label
                              className="wc-imp-stat-l"
                              style={{ display: "block", marginBottom: 5 }}
                            >
                              {LEAD_FIELD_LABELS_MAP[field]}
                              {status === "auto" && (
                                <span
                                  className="wc-imp-recpill"
                                  style={{ marginLeft: 6 }}
                                >
                                  auto
                                </span>
                              )}
                            </label>
                            <select
                              className="wc-modal-input"
                              style={
                                status === "manual"
                                  ? {
                                      borderColor: "var(--accent)",
                                      background: "var(--accent-soft)",
                                    }
                                  : status === "auto"
                                    ? {
                                        borderColor: "#BFE6CC",
                                        background: "#EFFAF2",
                                      }
                                    : undefined
                              }
                              value={mapping[field] || ""}
                              onChange={(e) =>
                                setMapping({
                                  ...mapping,
                                  [field]: e.target.value,
                                })
                              }
                            >
                              <option value="">— Ignore —</option>
                              {csvHeaders.map((h) => (
                                <option
                                  key={h}
                                  value={h}
                                  disabled={
                                    usedHeaders.has(h) && mapping[field] !== h
                                  }
                                >
                                  {h}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>

                    {importDetectionSummary.length > 0 && (
                      <div className="wc-imp-next" style={{ marginTop: 16 }}>
                        <Info size={16} />
                        <div>
                          {importDetectionMethod && (
                            <strong>Detection: {importDetectionMethod}</strong>
                          )}
                          {importDetectionSummary.map((s, i) => (
                            <p key={i}>{s}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {csvPreview.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div className="wc-imp-stat-l" style={{ marginBottom: 6 }}>
                          Preview (first {csvPreview.length} rows)
                          {importPreviewLoading ? " · loading…" : ""}
                        </div>
                        <div
                          style={{
                            overflow: "auto",
                            border: "1px solid var(--line)",
                            borderRadius: 10,
                            maxHeight: 180,
                          }}
                        >
                          <table
                            style={{
                              minWidth: "100%",
                              fontSize: 12,
                              borderCollapse: "collapse",
                            }}
                          >
                            <thead>
                              <tr>
                                {csvHeaders.map((h) => (
                                  <th
                                    key={h}
                                    style={{
                                      padding: "6px 8px",
                                      textAlign: "left",
                                      fontWeight: 700,
                                      color: "var(--ink-3)",
                                      whiteSpace: "nowrap",
                                      background: "var(--line-soft)",
                                    }}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {csvPreview.map((row, i) => (
                                <tr key={i}>
                                  {csvHeaders.map((h) => (
                                    <td
                                      key={h}
                                      style={{
                                        padding: "6px 8px",
                                        color: "var(--ink-2)",
                                        whiteSpace: "nowrap",
                                        borderTop: "1px solid var(--line-soft)",
                                      }}
                                    >
                                      {row[h]}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 3 — Import Settings (merged: Duplicate Handling +
                    AI & Automation + Pipeline Stage on the left; Tags +
                    SMS Consent on the right) */}
                {importStep === 3 && (
                  <div className="wc-imp-cols">
                    {/* LEFT column */}
                    <div className="wc-imp-col">
                      {/* Duplicate Handling */}
                      <div className="wc-imp-card">
                        <div className="wc-imp-card-h">
                          <div
                            className="wc-imp-card-ic"
                            style={{ background: "#EAF4FF", color: "#2563EB" }}
                          >
                            <Users size={17} />
                          </div>
                          <div>
                            <div className="wc-imp-card-t">
                              1. Duplicate Handling
                            </div>
                            <div className="wc-imp-card-sub">
                              What should happen when an imported lead’s email or
                              phone already exists?
                            </div>
                          </div>
                        </div>
                        {DUPLICATE_HANDLING_OPTIONS.map((opt) => {
                          const on = duplicateHandling === opt.value;
                          return (
                            <button
                              type="button"
                              key={opt.value}
                              className={`wc-imp-radio${on ? " is-on" : ""}`}
                              onClick={() => setDuplicateHandling(opt.value)}
                            >
                              <span
                                className={`wc-radio${on ? " is-on" : ""}`}
                              />
                              <div className="wc-imp-attn-col">
                                <div className="wc-imp-radio-t">
                                  {opt.label}
                                  {opt.value === "skip" && (
                                    <span className="wc-imp-recsm">
                                      (Recommended)
                                    </span>
                                  )}
                                </div>
                                <div className="wc-imp-radio-d">{opt.desc}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* AI & Automation Settings (inbound only) */}
                      <div className="wc-imp-card">
                        <div className="wc-imp-card-h">
                          <div
                            className="wc-imp-card-ic"
                            style={{ background: "#E8F8ED", color: "#16A34A" }}
                          >
                            <Sparkles size={17} />
                          </div>
                          <div>
                            <div className="wc-imp-card-t">
                              2. AI &amp; Automation Settings
                            </div>
                            <div className="wc-imp-card-sub">
                              How should AI handle these leads?
                            </div>
                          </div>
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <AiOffWarning
                            enrollAutomation={!importHumanOnly && !!importAutomationId}
                            inboundEnabled={
                              (importInboundEnabled || importQualificationEnabled) &&
                              !importHumanOnly
                            }
                          />
                        </div>
                        <label
                          className={`wc-imp-check${importHumanOnly ? " is-dim" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={importInboundEnabled && !importHumanOnly}
                            disabled={importHumanOnly}
                            onChange={(e) =>
                              setImportInboundEnabled(e.target.checked)
                            }
                          />
                          <div className="wc-imp-check-b">
                            <div className="wc-imp-check-t">
                              AI Responds When Lead Replies
                              <span className="wc-imp-recpill">Recommended</span>
                            </div>
                            <div className="wc-imp-check-d">
                              AI will reply automatically when leads message you
                              first. It never sends unsolicited outbound.
                            </div>
                          </div>
                        </label>
                        <label
                          className={`wc-imp-check${importHumanOnly ? " is-dim" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={importQualificationEnabled && !importHumanOnly}
                            disabled={importHumanOnly}
                            onChange={(e) =>
                              setImportQualificationEnabled(e.target.checked)
                            }
                          />
                          <div className="wc-imp-check-b">
                            <div className="wc-imp-check-t">AI Qualification</div>
                            <div className="wc-imp-check-d">
                              Let AI ask qualifying questions and capture lead
                              details when it replies.
                            </div>
                          </div>
                        </label>
                        <label className="wc-imp-check">
                          <input
                            type="checkbox"
                            checked={importHumanOnly}
                            onChange={(e) => setImportHumanOnly(e.target.checked)}
                          />
                          <div className="wc-imp-check-b">
                            <div className="wc-imp-check-t">Human Only</div>
                            <div className="wc-imp-check-d">
                              No AI replies or automation. Manual follow-up only.
                            </div>
                          </div>
                        </label>
                      </div>

                      {/* Default Pipeline Stage */}
                      <div className="wc-imp-card">
                        <div className="wc-imp-card-h">
                          <div
                            className="wc-imp-card-ic"
                            style={{ background: "#FFE8EE", color: "#E11D48" }}
                          >
                            <Flag size={17} />
                          </div>
                          <div>
                            <div className="wc-imp-card-t">
                              3. Default Pipeline Stage
                            </div>
                            <div className="wc-imp-card-sub">
                              Where each imported lead starts. A Stage value in
                              the file wins; this only fills blanks.
                            </div>
                          </div>
                        </div>
                        <select
                          className="wc-modal-input"
                          value={importDefaultStage}
                          onChange={(e) =>
                            setImportDefaultStage(e.target.value)
                          }
                        >
                          {STAGE_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        {STAGE_DESCRIPTIONS[importDefaultStage] && (
                          <div
                            className="wc-imp-radio-d"
                            style={{ marginTop: 8 }}
                          >
                            <strong style={{ color: "var(--ink)" }}>
                              {importDefaultStage}:
                            </strong>{" "}
                            {STAGE_DESCRIPTIONS[importDefaultStage]}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* RIGHT column */}
                    <div className="wc-imp-col">
                      {/* Workflow / Automation */}
                      <div className={`wc-imp-card${importHumanOnly ? " is-dim" : ""}`}>
                        <div className="wc-imp-card-h">
                          <div
                            className="wc-imp-card-ic"
                            style={{ background: "#FFEDE3", color: "#EA580C" }}
                          >
                            <Zap size={17} />
                          </div>
                          <div>
                            <div className="wc-imp-card-t">
                              4. Workflow / Automation
                            </div>
                            <div className="wc-imp-card-sub">
                              Choose a workflow to enroll these leads in.
                            </div>
                          </div>
                        </div>
                        <select
                          className="wc-modal-input"
                          value={importAutomationId ?? ""}
                          disabled={importHumanOnly}
                          onChange={(e) =>
                            setImportAutomationId(
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                        >
                          <option value="">None</option>
                          {workflowOptions.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name || `Workflow #${w.id}`}
                            </option>
                          ))}
                        </select>
                        {importAutomationId && !importHumanOnly ? (
                          <div className="wc-imp-next">
                            <Info size={16} />
                            <div>
                              <strong>What happens next?</strong>
                              <p>
                                Imported leads are enrolled in{" "}
                                {workflowOptions.find((w) => w.id === importAutomationId)
                                  ?.name || "the selected workflow"}{" "}
                                and its messages are queued on the workflow’s
                                schedule. “Do not SMS” rows are skipped.
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {/* Tags */}
                      <div className="wc-imp-card">
                        <div className="wc-imp-card-h">
                          <div
                            className="wc-imp-card-ic"
                            style={{ background: "#EAF4FF", color: "#2563EB" }}
                          >
                            <Tag size={17} />
                          </div>
                          <div>
                            <div className="wc-imp-card-t">
                              5. Tags{" "}
                              <span className="wc-imp-opt">(Optional)</span>
                            </div>
                            <div className="wc-imp-card-sub">
                              Comma-separated tags applied to all imported
                              leads.
                            </div>
                          </div>
                        </div>
                        <div className="wc-imp-tagbox">
                          {tagList.map((t, i) => (
                            <span className="wc-imp-tag" key={`${t}-${i}`}>
                              {t}
                              <button
                                type="button"
                                aria-label={`Remove ${t}`}
                                onClick={() =>
                                  setBatchTags(
                                    tagList
                                      .filter((_, idx) => idx !== i)
                                      .join(", "),
                                  )
                                }
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                          <input
                            className="wc-imp-taginput"
                            placeholder={
                              tagList.length
                                ? "Add tag…"
                                : "e.g. cold-outreach, q2-batch"
                            }
                            value={tagDraft}
                            onChange={(e) => {
                              const v = e.target.value;
                              // A comma commits everything before it and keeps
                              // the trailing partial in the input.
                              if (v.includes(",")) {
                                const cut = v.lastIndexOf(",");
                                commitTags(v.slice(0, cut));
                                setTagDraft(v.slice(cut + 1));
                              } else {
                                setTagDraft(v);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitTags(tagDraft);
                                setTagDraft("");
                              } else if (
                                e.key === "Backspace" &&
                                !tagDraft &&
                                tagList.length
                              ) {
                                e.preventDefault();
                                setBatchTags(tagList.slice(0, -1).join(", "));
                              }
                            }}
                            onBlur={() => {
                              if (tagDraft.trim()) {
                                commitTags(tagDraft);
                                setTagDraft("");
                              }
                            }}
                          />
                        </div>
                      </div>

                      {/* SMS Consent Status (incl. TCPA attestation) */}
                      <div className="wc-imp-card">
                        <div className="wc-imp-card-h">
                          <div
                            className="wc-imp-card-ic"
                            style={{ background: "#E8F8ED", color: "#16A34A" }}
                          >
                            <MessageSquare size={17} />
                          </div>
                          <div>
                            <div className="wc-imp-card-t">
                              6. SMS Consent Status
                            </div>
                            <div className="wc-imp-card-sub">
                              How do these contacts relate to your SMS opt-in
                              policy?
                              {mapping.sms_consent && (
                                <>
                                  {" "}
                                  Column{" "}
                                  <strong>{mapping.sms_consent}</strong> is
                                  mapped to per-row consent and overrides this
                                  for individual rows.
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        {IMPORT_SMS_CONSENT_OPTIONS.map((opt) => {
                          const on = importSmsConsent === opt.value;
                          return (
                            <button
                              type="button"
                              key={opt.value}
                              className={`wc-imp-radio plain${on ? " is-on" : ""}`}
                              onClick={() => setImportSmsConsent(opt.value)}
                            >
                              <span
                                className={`wc-radio${on ? " is-on" : ""}`}
                              />
                              <div className="wc-imp-attn-col">
                                <div className="wc-imp-radio-t">
                                  {opt.label}
                                  {opt.value === "opted_in" && (
                                    <span className="wc-imp-recsm">
                                      (Recommended)
                                    </span>
                                  )}
                                </div>
                                <div className="wc-imp-radio-d">{opt.desc}</div>
                              </div>
                            </button>
                          );
                        })}

                        {(importSmsConsent === "opted_in" ||
                          mapping.sms_consent) && (
                          <div
                            className="wc-imp-attn"
                            style={{ marginTop: 12 }}
                          >
                            <Info size={18} />
                            <div className="wc-imp-attn-col">
                              <div className="wc-imp-attn-name">
                                TCPA consent attestation
                              </div>
                              <label
                                className="wc-imp-check"
                                style={{ border: "none", padding: "8px 0 0" }}
                              >
                                <input
                                  type="checkbox"
                                  checked={importConsentAttested}
                                  onChange={(e) =>
                                    setImportConsentAttested(e.target.checked)
                                  }
                                />
                                <div className="wc-imp-check-d">
                                  I confirm I have{" "}
                                  <strong>prior express written consent</strong>{" "}
                                  (TCPA 47 U.S.C. 227 / FCC rules) to send SMS to
                                  each contact in this import. Disputes and
                                  liability for unauthorized contacts are my
                                  responsibility, not WarmChats.
                                </div>
                              </label>
                              {!importConsentAttested && (
                                <div
                                  className="wc-imp-radio-d"
                                  style={{ color: "#C2740B", marginLeft: 30 }}
                                >
                                  You must check this box to continue.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 4 — Review & Import */}
                {importStep === TOTAL_STEPS && !importResult && (
                  <div className="wc-imp-narrow">
                    <p className="wc-imp-lead">
                      Review your import settings, then import leads.
                    </p>
                    <div className="wc-imp-review">
                      <div className="wc-imp-revrow">
                        <span className="wc-imp-revk">
                          <Users size={15} />
                          Leads
                        </span>
                        <span className="wc-imp-revv">
                          {formatNum(csvTotalRows)} in file
                        </span>
                      </div>
                      <div className="wc-imp-revrow">
                        <span className="wc-imp-revk">
                          <Users size={15} />
                          Duplicate Handling
                        </span>
                        <span className="wc-imp-revv">{dupLabel}</span>
                      </div>
                      <div className="wc-imp-revrow">
                        <span className="wc-imp-revk">
                          <Sparkles size={15} />
                          Inbound AI replies
                        </span>
                        <span className="wc-imp-revv">
                          {importInboundEnabled
                            ? "Active — replies when a lead messages first"
                            : "Off"}
                        </span>
                      </div>
                      <div className="wc-imp-revrow">
                        <span className="wc-imp-revk">
                          <MessageSquare size={15} />
                          SMS Consent
                        </span>
                        <span className="wc-imp-revv">{consentLabel}</span>
                      </div>
                      <div className="wc-imp-revrow">
                        <span className="wc-imp-revk">
                          <Flag size={15} />
                          Stage
                        </span>
                        <span className="wc-imp-revv">
                          {importDefaultStage}
                        </span>
                      </div>
                      {tagList.length > 0 && (
                        <div className="wc-imp-revrow">
                          <span className="wc-imp-revk">
                            <Tag size={15} />
                            Tags
                          </span>
                          <span className="wc-imp-revv">
                            {tagList.join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="wc-imp-ready">
                      <CheckCircle2 size={16} />
                      Ready to import.
                      {importInboundEnabled
                        ? " AI begins working new leads immediately when they reply."
                        : ""}
                    </div>
                    {message2 && (
                      <p
                        className="wc-band-d"
                        style={{ color: "#DC2626", marginTop: 10 }}
                      >
                        {message2}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* ===== Footer summary bar ===== */}
              <div className="wc-imp-sumbar">
                <button
                  type="button"
                  className="wc-ghostbtn"
                  onClick={onBack}
                  disabled={importBusy}
                >
                  <ChevronDown
                    size={16}
                    style={{ transform: "rotate(90deg)" }}
                  />
                  {importStep === 1 ? "Cancel" : "Back"}
                </button>
                <div className="wc-imp-sum" />
                <div className="wc-imp-cta">
                  <button
                    type="button"
                    className="wc-primary"
                    disabled={continueDisabled}
                    onClick={onContinue}
                  >
                    {importBusy ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : importStep === TOTAL_STEPS ? (
                      <Upload size={16} />
                    ) : (
                      <ArrowRight size={16} />
                    )}
                    {ctaLabel}
                  </button>
                  <span className="wc-imp-stepnote">{stepNote}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SuccessScreen({
  importResult,
  importSkipReasons,
  importInboundEnabled,
  importDefaultStage,
  message2,
  onDone,
}: {
  importResult: ImportResult | null;
  importSkipReasons: ImportSkipReason[];
  importInboundEnabled: boolean;
  importDefaultStage: string;
  message2: string;
  onDone: () => Promise<void>;
}) {
  const imported = getImportedLeadCount(importResult);
  return (
    <div className="wc-imp-done" style={{ position: "relative" }}>
      <button
        type="button"
        className="wc-imp-close"
        style={{ position: "absolute", top: 14, right: 14 }}
        aria-label="Close"
        title="Close"
        onClick={() => void onDone()}
      >
        <X size={18} />
      </button>
      <div className="wc-imp-done-ic">
        <CheckCircle2 size={40} />
      </div>
      <h2 className="wc-wz-title">Import Complete</h2>
      <p className="wc-imp-lead" style={{ margin: "6px 0 0" }}>
        {formatNum(imported)} lead{imported === 1 ? "" : "s"} saved
        successfully.
      </p>

      <div className="wc-imp-donegrid">
        <div className="wc-imp-stat ok">
          <div className="wc-imp-stat-n">{formatNum(imported)}</div>
          <div className="wc-imp-stat-l">Imported</div>
        </div>
        <div className="wc-imp-stat muted">
          <div className="wc-imp-stat-n">
            {formatNum(importResult?.skipped ?? 0)}
          </div>
          <div className="wc-imp-stat-l">Skipped</div>
        </div>
        <div className="wc-imp-stat ai">
          <div className="wc-imp-stat-n">
            {importInboundEnabled ? "On" : "Off"}
          </div>
          <div className="wc-imp-stat-l">Inbound AI</div>
        </div>
        <div className="wc-imp-stat wf">
          <div
            className="wc-imp-stat-n"
            style={{ fontSize: 18, lineHeight: 1.2 }}
          >
            {importDefaultStage}
          </div>
          <div className="wc-imp-stat-l">Default stage</div>
        </div>
      </div>

      {/* Created / updated / errors detail */}
      <div
        className="wc-imp-donegrid"
        style={{ gridTemplateColumns: "repeat(3,1fr)", marginTop: 0 }}
      >
        <div className="wc-imp-stat">
          <div className="wc-imp-stat-n" style={{ fontSize: 20 }}>
            {formatNum(importResult?.created ?? 0)}
          </div>
          <div className="wc-imp-stat-l">Inserted</div>
        </div>
        <div className="wc-imp-stat">
          <div className="wc-imp-stat-n" style={{ fontSize: 20 }}>
            {formatNum(importResult?.updated ?? 0)}
          </div>
          <div className="wc-imp-stat-l">Updated</div>
        </div>
        <div className="wc-imp-stat warn">
          <div className="wc-imp-stat-n" style={{ fontSize: 20 }}>
            {formatNum(importResult?.errors ?? 0)}
          </div>
          <div className="wc-imp-stat-l">Errors</div>
        </div>
      </div>

      {importSkipReasons.length > 0 && (
        <div
          className="wc-imp-attn"
          style={{ marginTop: 16, width: "100%", textAlign: "left" }}
        >
          <Info size={18} />
          <div className="wc-imp-attn-col">
            <div className="wc-imp-attn-name">
              {importResult?.skipped &&
              importResult.skipped > importSkipReasons.length
                ? `Skipped rows (showing ${importSkipReasons.length} of ${importResult.skipped})`
                : `Skipped rows (${importSkipReasons.length})`}
            </div>
            <div
              style={{ maxHeight: 144, overflow: "auto", marginTop: 6 }}
              className="wc-imp-radio-d"
            >
              {importSkipReasons.slice(0, 100).map((item, idx) => (
                <p key={`${item.row_number ?? "r"}-${idx}`}>
                  Row {item.row_number ?? "?"}:{" "}
                  {item.message || item.reason || "Skipped"}{" "}
                  {item.email
                    ? `(${item.email})`
                    : item.phone
                      ? `(${item.phone})`
                      : ""}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {importInboundEnabled && (
        <p className="wc-band-d" style={{ marginTop: 14 }}>
          Inbound AI replies were enabled for these leads (they fire only when a
          lead messages first; global AI Agent unchanged).
        </p>
      )}
      {message2 && (
        <p className="wc-band-d" style={{ marginTop: 8 }}>
          {message2}
        </p>
      )}

      <div className="wc-imp-doneacts" style={{ marginTop: 22 }}>
        <button type="button" className="wc-primary" onClick={onDone}>
          <Check size={16} />
          Done
        </button>
      </div>
    </div>
  );
}
