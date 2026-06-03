import React, { useState } from "react";
import { Bot, Loader2, Sparkles, Upload } from "lucide-react";
import AiOffWarning from "./AiOffWarning";
import {
  DUPLICATE_HANDLING_OPTIONS,
  IMPORT_MAPPING_FIELD_STYLES,
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

const getImportedLeadCount = (result?: ImportResult | null) =>
  result?.imported ??
  (result?.created ?? 0) + (result?.updated ?? 0);

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
  importSheets,
  importSheetName,
  setImportSheetName,
  importDetectionSummary,
  importDetectionMethod,
  importDefaultStage,
  setImportDefaultStage,
  importInboundEnabled,
  setImportInboundEnabled,
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-[95%] max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Import Leads</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Step {importStep} of 6 - {IMPORT_STEP_LABELS[importStep - 1]}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={importBusy}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none disabled:opacity-40"
          >
            &times;
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 border-b">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5, 6].map((step) => (
              <React.Fragment key={step}>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    step < importStep
                      ? "bg-orange-500 text-white"
                      : step === importStep
                        ? "bg-orange-100 text-orange-600 border-2 border-orange-500"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {step}
                </div>
                {step < 6 && (
                  <div
                    className={`flex-1 h-0.5 ${step < importStep ? "bg-orange-400" : "bg-gray-200"}`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {importBusy && importLoadingMessage && (
            <div className="mb-4 flex items-center gap-2 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
              <Loader2 size={16} className="animate-spin shrink-0" />
              {importLoadingMessage}
            </div>
          )}

          {/* STEP 1: Upload */}
          {importStep === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Upload any CSV or Excel export (agent spreadsheets, CRM
                exports, etc.). No fixed template - we detect columns
                automatically. Up to 10,000 rows.
              </p>
              {csvTotalRows > 0 && (
                <p className="text-sm font-medium text-orange-700">
                  {csvTotalRows} row{csvTotalRows === 1 ? "" : "s"} detected
                  {importSheetName ? ` on ${importSheetName}` : ""}
                </p>
              )}
              {importSheets.length > 1 && (
                <div>
                  <label className="text-xs font-medium text-gray-700">
                    Worksheet
                  </label>
                  <select
                    className="mt-1 w-full border rounded px-3 py-2 text-sm"
                    value={importSheetName}
                    onChange={async (e) => {
                      const name = e.target.value;
                      setImportSheetName(name);
                      if (csvFile) {
                        await fetchImportPreview(csvFile, { sheetName: name });
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
              <label
                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition ${
                  isDragOver
                    ? "border-orange-400 bg-orange-50 scale-[1.01]"
                    : "border-orange-200 hover:bg-orange-50"
                }`}
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
                <Upload size={36} className={`mb-2 ${isDragOver ? "text-orange-500" : "text-orange-400"}`} />
                <p className="font-medium text-gray-700">
                  {csvFile ? csvFile.name : isDragOver ? "Drop to upload" : "Click to upload or drag & drop"}
                </p>
                <p className="text-xs text-gray-400 mt-1">CSV · XLS · XLSX</p>
                <input
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  className="hidden"
                  onChange={(e) =>
                    e.target.files && handleCSVSelect(e.target.files[0])
                  }
                />
              </label>
              {message2 && (
                <p className="text-sm text-red-600">{message2}</p>
              )}
              <p className="text-xs text-gray-400">
                Client sample format:{" "}
                <a
                  href="/samples/Leads.xlsx"
                  download="Leads.xlsx"
                  className="text-orange-500 underline"
                >
                  Download Leads.xlsx
                </a>
              </p>
            </div>
          )}

          {/* STEP 2: Column Mapping */}
          {importStep === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Match your file columns to lead fields. Map at least one
                contact field (Email, Phone, or Phone or Email). Unmapped
                columns are ignored.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={runAutoMap}
                  disabled={aiMapLoading || csvHeaders.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Use AI to match your columns to lead fields (uses 1 AI request)"
                >
                  {aiMapLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {aiMapLoading
                    ? "Matching columns..."
                    : aiMapUsed
                      ? "Re-run AI match"
                      : "AI auto-match columns"}
                </button>
                <span className="text-xs text-gray-400">Uses 1 AI request</span>
              </div>
              {aiMapMessage && (
                <p className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
                  {aiMapMessage}
                </p>
              )}
              {importDetectionSummary.length > 0 && (
                <div className="text-xs text-gray-500 bg-gray-50 border rounded-lg px-3 py-2 space-y-0.5">
                  {importDetectionMethod && (
                    <p className="font-medium text-gray-600">
                      Detection: {importDetectionMethod}
                    </p>
                  )}
                  {importDetectionSummary.map((s, i) => (
                    <p key={i}>{s}</p>
                  ))}
                </div>
              )}
              {!importMappingHasContact() && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                  Map Email, Phone, or &quot;Phone or Email&quot; before continuing.
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {LEAD_FIELDS.map((field) => {
                  const status = getImportFieldMappingStatus(field);
                  return (
                    <div key={field} className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-700">
                        {LEAD_FIELD_LABELS_MAP[field]}
                        {status === "auto" && (
                          <span className="ml-1 text-green-600 font-normal">(auto)</span>
                        )}
                      </label>
                      <select
                        className={`border rounded px-3 py-2 text-sm ${IMPORT_MAPPING_FIELD_STYLES[status]}`}
                        value={mapping[field] || ""}
                        onChange={(e) =>
                          setMapping({ ...mapping, [field]: e.target.value })
                        }
                      >
                        <option value="">- Ignore -</option>
                        {csvHeaders.map((h) => (
                          <option
                            key={h}
                            value={h}
                            disabled={
                              Object.values(mapping).includes(h) &&
                              mapping[field] !== h
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
              {csvPreview.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    Preview (first {csvPreview.length} rows)
                  </p>
                  <div className="overflow-auto border rounded max-h-44">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          {csvHeaders.map((h) => (
                            <th
                              key={h}
                              className="px-2 py-1 text-left font-medium text-gray-600 whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {csvPreview.map((row, i) => (
                          <tr key={i}>
                            {csvHeaders.map((h) => (
                              <td
                                key={h}
                                className="px-2 py-1 text-gray-700 whitespace-nowrap"
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

          {/* STEP 3: Duplicate Handling */}
          {importStep === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                What should happen when an imported lead&apos;s email or phone
                already exists?
              </p>
              <div className="space-y-3">
                {DUPLICATE_HANDLING_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition ${
                      duplicateHandling === opt.value
                        ? "border-orange-400 bg-orange-50"
                        : "border-gray-200 hover:border-orange-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="dup-handling"
                      value={opt.value}
                      checked={duplicateHandling === opt.value}
                      onChange={() => setDuplicateHandling(opt.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-semibold text-sm text-gray-800">
                        {opt.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: Inbound AI replies only. Outbound automation enrollment is
              intentionally NOT offered on import - a lead joins an outbound
              workflow only when they opt in (intake form / integration), never
              by mass-enrolling an imported list. This switch is the reactive
              inbound reply (fires only after the lead messages first). */}
          {importStep === 4 && (
            <div className="space-y-5">
              <AiOffWarning enrollAutomation={false} inboundEnabled={importInboundEnabled} />
              <section className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Bot className="text-orange-500 shrink-0" size={22} />
                    <div>
                      <p className="text-base font-semibold text-gray-900">AI follow-up replies (inbound)</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        When ON, AI automatically replies to these leads when
                        THEY message you first - it never sends unsolicited
                        outbound. Imported leads are never auto-enrolled into an
                        outbound workflow; enroll a lead only once they have
                        opted in.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setImportInboundEnabled(!importInboundEnabled)}
                    aria-label="Toggle inbound AI replies"
                    className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition ${
                      importInboundEnabled ? "bg-orange-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                        importInboundEnabled ? "translate-x-7" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </section>
            </div>
          )}

          {/* STEP 5: SMS Consent + Tags */}
          {importStep === 5 && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-1">
                  SMS Consent Status
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  How do these contacts relate to your SMS opt-in policy?
                  {mapping.sms_consent && (
                    <>
                      {" "}
                      Your CSV column <strong className="font-semibold">{mapping.sms_consent}</strong>{" "}
                      is mapped to per-row consent and will override this for
                      individual rows.
                    </>
                  )}
                </p>
                <div className="space-y-3">
                  {IMPORT_SMS_CONSENT_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition ${
                        importSmsConsent === opt.value
                          ? "border-orange-400 bg-orange-50"
                          : "border-gray-200 hover:border-orange-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name="import-consent"
                        value={opt.value}
                        checked={importSmsConsent === opt.value}
                        onChange={() => setImportSmsConsent(opt.value)}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="font-semibold text-sm text-gray-800">
                          {opt.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {opt.desc}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
                {(importSmsConsent === "opted_in" || mapping.sms_consent) && (
                  <div className="mt-4 rounded-lg border border-amber-400 bg-amber-50 p-2.5 shadow-xs">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="inline-flex items-center rounded-full bg-amber-200 px-1.5 py-px text-[9px] font-bold uppercase text-amber-900">
                        Action required
                      </span>
                      <span className="text-[11px] font-semibold text-amber-900">
                        TCPA consent attestation
                      </span>
                    </div>
                    <label className="flex items-start gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={importConsentAttested}
                        onChange={(e) => setImportConsentAttested(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-amber-500 text-amber-600 focus:ring-2 focus:ring-amber-400 focus:ring-offset-1"
                        aria-label="I confirm I have prior express written consent for these contacts"
                      />
                      <span className="text-[11px] leading-snug text-amber-950">
                        I confirm I have <strong className="font-bold">prior express written consent</strong> (TCPA 47 U.S.C. 227 / FCC rules) to send SMS to <strong className="font-bold">each contact</strong> in this import. Disputes and liability for unauthorized contacts are <strong className="font-bold">my responsibility</strong>, not WarmChats.
                      </span>
                    </label>
                    {!importConsentAttested && (
                      <p className="mt-1.5 ml-6 text-[10px] font-medium text-amber-700">
                        You must check this box to continue.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-1">
                  Assign Tags{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </p>
                <p className="text-xs text-gray-500 mb-2">
                  Comma-separated tags applied to all imported leads.
                </p>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="e.g. cold-outreach, q2-batch"
                  value={batchTags}
                  onChange={(e) => setBatchTags(e.target.value)}
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-1">
                  Default pipeline stage
                </p>
                <p className="text-xs text-gray-500 mb-2">
                  The pipeline stage is where a lead sits in your sales funnel. It
                  shows as the <strong className="font-semibold">Stage</strong> on
                  the Leads page, groups your leads board, and feeds the dashboard
                  funnel and Hot Leads widgets. Pick the stage every imported lead
                  starts in. If a row in your file already has a Stage value, that
                  wins - this only fills in the blanks.
                </p>
                <select
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={importDefaultStage}
                  onChange={(e) => setImportDefaultStage(e.target.value)}
                >
                  {STAGE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {STAGE_DESCRIPTIONS[importDefaultStage] && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    <strong className="font-semibold text-gray-700">{importDefaultStage}:</strong>{" "}
                    {STAGE_DESCRIPTIONS[importDefaultStage]}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 6: Review & Import */}
          {importStep === 6 && !importResult && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Review your import settings, then import leads.
              </p>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2 text-sm">
                <p>
                  <span className="font-medium text-gray-800">Rows:</span>{" "}
                  {csvTotalRows} in file
                </p>
                <p>
                  <span className="font-medium text-gray-800">Inbound AI replies:</span>{" "}
                  {importInboundEnabled
                    ? "ON - AI replies when a lead messages first"
                    : "OFF"}
                </p>
                <p>
                  <span className="font-medium text-gray-800">SMS:</span>{" "}
                  {importSmsConsent}
                </p>
                {batchTags && (
                  <p>
                    <span className="font-medium text-gray-800">Tags:</span>{" "}
                    {batchTags}
                  </p>
                )}
                <p>
                  <span className="font-medium text-gray-800">Stage:</span>{" "}
                  {importDefaultStage}
                </p>
              </div>
            </div>
          )}

          {importStep === 6 && importResult && (
            <div className="space-y-4">
              <div className="rounded-xl bg-green-50 border border-green-200 p-6 text-center">
                <p className="text-3xl font-bold text-green-700">
                  {getImportedLeadCount(importResult)}
                </p>
                <p className="text-sm text-green-600 mt-1">
                  leads saved successfully
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xl font-bold text-gray-800">
                    {importResult?.total_rows ?? 0}
                  </p>
                  <p className="text-xs text-gray-500">Total rows</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xl font-bold text-amber-600">
                    {importResult?.skipped ?? 0}
                  </p>
                  <p className="text-xs text-gray-500">Skipped</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xl font-bold text-red-500">
                    {importResult?.errors ?? 0}
                  </p>
                  <p className="text-xs text-gray-500">Errors</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xl font-bold text-green-700">
                    {importResult?.created ?? 0}
                  </p>
                  <p className="text-xs text-gray-500">Inserted</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xl font-bold text-blue-700">
                    {importResult?.updated ?? 0}
                  </p>
                  <p className="text-xs text-gray-500">Updated</p>
                </div>
              </div>
              {importSkipReasons.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-700 mb-1">
                    {importResult.skipped && importResult.skipped > importSkipReasons.length
                      ? `Skipped rows (showing ${importSkipReasons.length} of ${importResult.skipped})`
                      : `Skipped rows (${importSkipReasons.length})`}
                  </p>
                  <div className="max-h-36 overflow-auto space-y-0.5 text-xs text-amber-800">
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
              )}
              {importInboundEnabled && (
                <p className="text-xs text-center text-gray-600">
                  Inbound AI replies were enabled for these leads (they fire only
                  when a lead messages first; global AI Agent unchanged).
                </p>
              )}
              {message2 && (
                <p className="text-sm text-center text-gray-700">{message2}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-between items-center gap-3">
          {importStep === 6 && importResult ? (
            <button
              onClick={onDone}
              className="ml-auto px-6 py-2 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 transition text-sm"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onBack}
                disabled={importBusy}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm disabled:opacity-50"
              >
                {importStep === 1 ? "Cancel" : "Back"}
              </button>
              {importStep === 6 && !importResult && csvTotalRows > 0 && (
                <span className="text-xs text-gray-500 flex-1 text-center hidden sm:block">
                  {csvTotalRows} row{csvTotalRows === 1 ? "" : "s"} in file
                  {importInboundEnabled ? " · Inbound AI ON" : " · Inbound AI OFF"}
                </span>
              )}
              <button
                disabled={
                  (importStep === 1 && !csvFile) ||
                  (importStep === 2 && !importMappingHasContact()) ||
                  // TCPA attestation: when the agent claims "Already opted in"
                  // (either globally or via a per-row CSV column), they must
                  // explicitly check the consent attestation box before
                  // continuing. The server trusts the attestation; the friction
                  // lives here so the claim is conscious.
                  (importStep === 5 &&
                    (importSmsConsent === "opted_in" || !!mapping.sms_consent) &&
                    !importConsentAttested) ||
                  importBusy ||
                  (importStep === 6 && !!importResult)
                }
                onClick={onContinue}
                className="inline-flex items-center gap-2 px-6 py-2 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 transition text-sm disabled:opacity-50"
              >
                {importBusy && (
                  <Loader2 size={14} className="animate-spin" />
                )}
                {importStep === 6 && !importResult
                  ? `Import ${csvTotalRows} leads`
                  : "Continue"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
