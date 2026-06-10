import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type {
  CsvRow,
  DuplicateHandling,
  ImportResult,
  ImportSheetMeta,
  ImportSkipReason,
  ImportStep,
  SmsConsentStatus,
} from "../types";
import {
  buildImportPreview,
  parseLeadsFile,
  type ImportPreview,
  type SheetData,
} from "../utils/sheetParse";

type UseLeadImportOptions = {
  fetchLeads: () => Promise<void>;
  refreshSummary?: () => void;
};

// Large imports are POSTed in sequential chunks of this many rows. The server
// processes each row in-memory (phone/timezone normalization, field capping,
// bind-array building) which is CPU that counts toward the free-tier 10ms cap
// (Error 1102) - chunking keeps every request well under it. Sequential, not
// parallel, so each chunk's duplicate check sees the prior chunk's committed
// leads. The whole file is still capped (MAX_IMPORT_ROWS in sheetParse).
const IMPORT_CHUNK_SIZE = 1500;

export function useLeadImport({ fetchLeads, refreshSummary }: UseLeadImportOptions) {
  const location = useLocation();
  const navigate = useNavigate();

  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep>(1);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvTotalRows, setCsvTotalRows] = useState(0);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<CsvRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [duplicateHandling, setDuplicateHandling] =
    useState<DuplicateHandling>("skip");
  // Default to "unknown" (NOT opted-in). TCPA risk: defaulting to opted-in
  // would let an agent silently start texting a purchased / scraped list. The
  // agent must affirmatively check "Already opted in" + acknowledge the
  // attestation banner (TCPA prior-consent claim is theirs to make - we
  // surface the friction at the checkbox, not the radio default, so the
  // attestation feels real). A per-row "sms_consent" CSV mapping overrides
  // this default. Default is "opted_in" because most import sources are
  // agents' existing client lists where they already have written consent;
  // the attestation checkbox + audit log carries the legal weight.
  const [importSmsConsent, setImportSmsConsent] =
    useState<SmsConsentStatus>("opted_in");
  // Required when importSmsConsent === 'opted_in' (or any per-row value
  // resolves to opted_in) - the agent must acknowledge they have prior
  // express written consent for each contact. Server is permissive (it
  // trusts the agent's attestation); we surface the friction here so the
  // claim is conscious.
  const [importConsentAttested, setImportConsentAttested] = useState(false);
  const [batchTags, setBatchTags] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importSkipReasons, setImportSkipReasons] = useState<ImportSkipReason[]>(
    [],
  );
  const [importing, setImporting] = useState(false);
  const [importPreviewLoading, setImportPreviewLoading] = useState(false);
  const [importSheets, setImportSheets] = useState<ImportSheetMeta[]>([]);
  const [importSheetName, setImportSheetName] = useState<string>("");
  const [importHasHeader, setImportHasHeader] = useState<boolean | null>(null);
  const [importDetectionSummary, setImportDetectionSummary] = useState<
    string[]
  >([]);
  const [importDetectionMethod, setImportDetectionMethod] = useState<string>("");
  const [autoDetectedMapping, setAutoDetectedMapping] = useState<
    Record<string, string>
  >({});
  // AI auto-map (function-calling column matcher). The button can be clicked any
  // number of times - the ONLY thing that blocks a click is an in-flight request
  // (`aiMapLoading`), so the agent can re-run the match after a success OR a
  // failure but can't fire two overlapping calls. `aiMapUsed` is tracked only so
  // the automatic step 1 -> step 2 kickoff runs once (manual re-runs ignore it).
  const [aiMapLoading, setAiMapLoading] = useState(false);
  const [aiMapUsed, setAiMapUsed] = useState(false);
  const [aiMapMessage, setAiMapMessage] = useState("");
  const [importDefaultStage, setImportDefaultStage] = useState("New Lead");
  // Whether AI auto-replies to these leads when they message back (inbound).
  // Importing NEVER enrolls leads into an outbound workflow / sends proactively
  // - a lead joins an outbound workflow only when they opt in (intake form /
  // integration). The import wizard therefore offers ONLY this reactive
  // inbound-reply switch, no automation picker.
  const [importInboundEnabled, setImportInboundEnabled] = useState(true);
  // "AI Qualification" - AI asks the qualifying questions when it replies. Runs
  // as part of the inbound flow, so either AI checkbox turns inbound on.
  const [importQualificationEnabled, setImportQualificationEnabled] = useState(true);
  // "Human Only" - no AI replies and no automation; sets ai_status='off'.
  const [importHumanOnly, setImportHumanOnly] = useState(false);
  // Optional workflow/automation to enroll the imported leads into (apply-ai
  // bulk-enrolls via bulkEnrollAutomation; "Do not SMS" rows are skipped there).
  const [importAutomationId, setImportAutomationId] = useState<number | null>(null);
  const [importAiApplying, setImportAiApplying] = useState(false);
  // "Batch N of M" shown during a chunked large import (empty for single-shot).
  const [importProgress, setImportProgress] = useState("");
  const [message2, setMessage2] = useState("");

  const token = localStorage.getItem("token");
  const API_BASE = import.meta.env.VITE_API_BASE;
  const org_id = localStorage.getItem("org_id");
  const smsConsentVersion =
    import.meta.env.VITE_SMS_CONSENT_TEXT_VERSION || "v1";

  // The full parsed file (all rows, not just the 10-row preview). Parsing now
  // runs in the browser, so we keep the result here and POST it as JSON on
  // commit - no second upload, no server-side re-parse (free-tier 10ms CPU).
  const parsedRef = useRef<SheetData | null>(null);

  const applyImportPreview = (data: ImportPreview) => {
    setCsvHeaders(data.columns);
    setCsvPreview(data.rows as CsvRow[]);
    setCsvTotalRows(data.total);
    setMapping(data.suggested_mapping);
    setAutoDetectedMapping(data.suggested_mapping);
    // Detection summary/method were never populated by the old endpoint; the
    // file profile drives the warning banner instead.
    setImportDetectionSummary([]);
    setImportDetectionMethod("");
    if (data.sheets) setImportSheets(data.sheets);
    if (data.sheet_name) setImportSheetName(data.sheet_name);
    if (typeof data.has_header === "boolean") setImportHasHeader(data.has_header);
    setMessage2(data.warning ? `${data.warning}` : "");
  };

  // Parse the file in the browser and populate the preview. Re-run on sheet /
  // header-override changes the same way the old server preview endpoint was.
  const fetchImportPreview = async (
    file: File,
    opts?: { sheetName?: string; hasHeader?: boolean | null },
  ) => {
    setImportPreviewLoading(true);
    try {
      const sheet = opts?.sheetName ?? importSheetName;
      const headerFlag = opts?.hasHeader ?? importHasHeader;
      const parsed = await parseLeadsFile(file, {
        sheetName: sheet || null,
        hasHeader: headerFlag,
      });
      parsedRef.current = parsed;
      if (!parsed.headers.length) {
        setCsvHeaders([]);
        setCsvPreview([]);
        setMapping({});
        setAutoDetectedMapping({});
        setCsvTotalRows(0);
        setMessage2("File appears to be empty or missing a header row.");
        return false;
      }
      applyImportPreview(buildImportPreview(parsed));
      return true;
    } catch (e) {
      parsedRef.current = null;
      setCsvHeaders([]);
      setCsvPreview([]);
      setMapping({});
      setAutoDetectedMapping({});
      setCsvTotalRows(0);
      setMessage2(
        `Error: ${(e as Error).message || "Could not parse file preview"}`,
      );
      return false;
    } finally {
      setImportPreviewLoading(false);
    }
  };

  const handleCSVSelect = async (file: File) => {
    setCsvFile(file);
    setMessage2("");
    setImportSkipReasons([]);
    setImportSheets([]);
    setImportSheetName("");
    setImportHasHeader(null);
    setImportDetectionSummary([]);
    setImportDetectionMethod("");
    setAutoDetectedMapping({});
    setAiMapUsed(false);
    setAiMapMessage("");

    try {
      await fetchImportPreview(file, { sheetName: "", hasHeader: null });
    } catch {
      setCsvHeaders([]);
      setCsvPreview([]);
      setMapping({});
      setMessage2("Could not read import preview");
    }
  };

  const importMappingHasContact = () => {
    const m = mapping;
    return Boolean(m.email || m.phone || m.contact);
  };

  // Ask the AI (server-side, function calling) to match file columns to lead
  // fields. Sends only the headers + first 2 sample rows as JSON; the server
  // validates the model's output before returning it, meters one AI request,
  // and we apply it on top of the current mapping (freeing any column the AI
  // reassigns so no two fields share a column). Clickable once per import.
  const runAutoMap = async () => {
    // Block only while a request is in flight - re-runs (after success or
    // failure) are allowed; the auto-kickoff is gated separately by aiMapUsed.
    if (aiMapLoading) return;
    if (!csvHeaders.length) return;
    setAiMapLoading(true);
    setAiMapMessage("");
    try {
      const res = await fetch(`${API_BASE}/leads/import-automap/${org_id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          columns: csvHeaders,
          // Send the full preview (up to 10 rows). The server samples non-empty
          // values per column, so a column blank in the first rows but filled
          // later (e.g. an email only on row 5) still gives the model real data.
          rows: csvPreview,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // A failed run leaves the button enabled (aiMapUsed is NOT set) so the
        // agent can immediately try again - the in-flight guard alone prevents
        // double-firing.
        setAiMapMessage(
          data.message ||
            "AI mapping failed. Try again or map the columns manually below.",
        );
        return;
      }
      const aiMapping = (data.mapping || {}) as Record<string, string>;
      // Merge the AI result ON TOP of the header heuristic instead of replacing
      // it. The AI is authoritative where it maps a field, but it must never
      // DROP a field the header heuristic already matched correctly (the bug:
      // the AI run wiped out a correct source/email match it happened to miss).
      // AI assignments win on conflicts; we then backfill any field the AI left
      // unmapped from the heuristic, skipping columns already claimed so no two
      // fields share a column.
      const merged: Record<string, string> = {};
      const usedColumns = new Set<string>();
      for (const [field, col] of Object.entries(aiMapping)) {
        if (!col || usedColumns.has(col) || !csvHeaders.includes(col)) continue;
        merged[field] = col;
        usedColumns.add(col);
      }
      for (const [field, col] of Object.entries(autoDetectedMapping)) {
        if (merged[field] || !col || usedColumns.has(col)) continue;
        if (!csvHeaders.includes(col)) continue;
        merged[field] = col;
        usedColumns.add(col);
      }
      setMapping(merged);
      setAutoDetectedMapping(merged);
      const mapped = Object.keys(merged).length;
      setAiMapMessage(
        mapped > 0
          ? `AI matched ${mapped} field${mapped === 1 ? "" : "s"}. Review and adjust below.`
          : "AI could not confidently match any columns. Map them manually below.",
      );
      // One auto-map per import.
      setAiMapUsed(true);
    } catch {
      // Same as the non-OK branch: leave the button enabled for a retry.
      setAiMapMessage(
        "AI mapping failed. Try again or map the columns manually below.",
      );
    } finally {
      setAiMapLoading(false);
    }
  };

  const getImportFieldMappingStatus = (
    field: string,
  ): "none" | "auto" | "manual" => {
    const value = mapping[field];
    if (!value) return "none";
    const autoValue = autoDetectedMapping[field];
    if (autoValue && autoValue === value) return "auto";
    return "manual";
  };

  // Configure AI for the imported leads via apply-ai:
  //  - inbound replies on when either AI checkbox is checked (qualification runs
  //    inside the inbound flow) and Human Only is off,
  //  - optional workflow enrollment (automation_id -> bulkEnrollAutomation),
  //  - Human Only -> inbound off + no automation -> ai_status='off' explicitly.
  const applyImportAi = async (leadIds: number[]) => {
    const inbound =
      (importInboundEnabled || importQualificationEnabled) && !importHumanOnly;
    const automationId = !importHumanOnly && importAutomationId ? importAutomationId : null;
    // Nothing to set: AI checkboxes off without an explicit Human Only choice.
    if ((!inbound && !automationId && !importHumanOnly) || !leadIds.length) {
      return { ok: true, enrolled: 0 };
    }
    setImportAiApplying(true);
    try {
      const res = await fetch(`${API_BASE}/leads/import/${org_id}/apply-ai`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lead_ids: leadIds,
          enabled: true,
          channel: "sms",
          inbound_enabled: inbound,
          ...(automationId ? { automation_id: automationId } : {}),
        }),
      });
      const data = await res.json();
      return { ok: res.ok, data, enrolled: data.enrolled ?? 0 };
    } catch {
      return { ok: false, data: null, enrolled: 0 };
    } finally {
      setImportAiApplying(false);
    }
  };

  const handleImportWizardContinue = () => {
    if (importStep >= 4) return;
    setImportResult(null);
    setImportSkipReasons([]);
    setMessage2("");
    setImportStep((s) => (s + 1) as ImportStep);
  };

  const handleImportConfirm = async () => {
    const parsed = parsedRef.current;
    if (!csvFile || !parsed || importStep !== 4 || importResult) return;
    setImporting(true);
    setImportProgress("");

    const allRows = parsed.rows;
    // Shared on every chunk. has_header drives the reported row numbers in skip
    // reasons; we re-base them per chunk below so they map to the source file.
    const basePayload = {
      has_header: parsed.meta.has_header ?? true,
      mapping,
      sms_consent_status: importSmsConsent,
      duplicate_handling: duplicateHandling,
      batch_tags: batchTags,
      defer_auto_enrollment: true,
      default_stage: importDefaultStage,
      opt_in_source: "uploaded_lead_attested",
      consent_text_version: smsConsentVersion,
      consent_page_url: `${window.location.origin}/leads`,
    };
    const chunkCount = Math.max(1, Math.ceil(allRows.length / IMPORT_CHUNK_SIZE));

    // Accumulate the per-chunk responses into one aggregate result.
    let created = 0, updated = 0, skipped = 0, errors = 0;
    const importedLeadIds: number[] = [];
    const skipReasons: ImportSkipReason[] = [];

    try {
      for (let c = 0; c < chunkCount; c++) {
        const base = c * IMPORT_CHUNK_SIZE;
        const slice = allRows.slice(base, base + IMPORT_CHUNK_SIZE);
        if (chunkCount > 1) setImportProgress(`batch ${c + 1} of ${chunkCount}`);
        // Sequential await: each chunk commits before the next, so cross-chunk
        // duplicates are caught by the server's existing-lead dedup query.
        const res = await fetch(`${API_BASE}/leads/import/${org_id}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...basePayload, rows: slice }),
        });
        const data = await res.json();
        if (!res.ok) {
          // Surface the failure with whatever completed so far is not lost.
          setImportResult(data);
          setImportSkipReasons(
            Array.isArray(data.skip_reasons) ? data.skip_reasons : [],
          );
          setMessage2(`Error: ${data.message || "Import failed"}`);
          setImporting(false);
          return;
        }
        created += Number(data.created ?? 0);
        updated += Number(data.updated ?? 0);
        skipped += Number(data.skipped ?? 0);
        errors += Number(data.errors ?? 0);
        if (Array.isArray(data.imported_lead_ids)) {
          importedLeadIds.push(...(data.imported_lead_ids as number[]));
        }
        if (Array.isArray(data.skip_reasons)) {
          for (const sr of data.skip_reasons as ImportSkipReason[]) {
            // Re-base the chunk-local row number onto the source file.
            skipReasons.push(
              typeof sr.row_number === "number"
                ? { ...sr, row_number: sr.row_number + base }
                : sr,
            );
          }
        }
      }
    } catch {
      setMessage2("Import failed. Please try again.");
      setImporting(false);
      return;
    } finally {
      // Clear the per-chunk progress label on every exit. `importing` stays true
      // on the success path so the AI follow-up step below keeps the modal busy;
      // it is cleared in that block's finally (and explicitly on the error paths
      // above, which return before reaching the AI step).
      setImportProgress("");
    }

    const result: ImportResult = {
      total_rows: allRows.length,
      created,
      updated,
      skipped,
      errors,
      imported_lead_ids: importedLeadIds,
      skip_reasons: skipReasons.slice(0, 100),
    };
    console.log("[Leads] import response", result);
    setImportResult(result);
    setImportSkipReasons(result.skip_reasons ?? []);

    const importedCount = created + updated;
    const aiWanted =
      (importInboundEnabled || importQualificationEnabled) && !importHumanOnly;
    const workflowWanted = !importHumanOnly && !!importAutomationId;
    try {
      if ((aiWanted || workflowWanted || importHumanOnly) && importedLeadIds.length) {
        const ai = await applyImportAi(importedLeadIds);
        if (ai.ok) {
          const bits: string[] = [];
          if (workflowWanted) bits.push(`${ai.enrolled} lead(s) enrolled in the workflow`);
          else if (aiWanted) bits.push(`Inbound AI replies enabled for ${ai.enrolled} lead(s)`);
          else bits.push("AI set to Human Only for this batch");
          setMessage2(`Imported ${importedCount} leads. ${bits.join(" · ")}.`);
        } else {
          const reason =
            (ai.data as { message?: string } | null)?.message ||
            "Please check your AI settings.";
          setMessage2(
            `Imported ${importedCount} leads, but applying the AI settings failed. ${reason}`,
          );
        }
      } else {
        setMessage2(`Imported ${importedCount} leads.`);
      }
    } finally {
      setImporting(false);
    }
  };

  const resetImportModal = () => {
    parsedRef.current = null;
    setCsvFile(null);
    setCsvHeaders([]);
    setCsvPreview([]);
    setCsvTotalRows(0);
    setMapping({});
    setImportSmsConsent("opted_in");
    setImportConsentAttested(false);
    setDuplicateHandling("skip");
    setBatchTags("");
    setImportResult(null);
    setImportSkipReasons([]);
    setImportStep(1);
    setMessage2("");
    setImportSheets([]);
    setImportSheetName("");
    setImportHasHeader(null);
    setImportDetectionSummary([]);
    setImportDetectionMethod("");
    setAutoDetectedMapping({});
    setImportDefaultStage("New Lead");
    setImportInboundEnabled(true);
    setImportQualificationEnabled(true);
    setImportHumanOnly(false);
    setImportAutomationId(null);
    setImportAiApplying(false);
    setImportProgress("");
    setImportPreviewLoading(false);
    setAiMapLoading(false);
    setAiMapUsed(false);
    setAiMapMessage("");
  };

  const importBusy =
    importPreviewLoading || importing || importAiApplying || aiMapLoading;

  const importLoadingMessage = importPreviewLoading
    ? "Reading file and detecting columns..."
    : importAiApplying
      ? "Applying AI follow-up to imported leads..."
      : importing
        ? importProgress
          ? `Importing ${csvTotalRows.toLocaleString()} leads - ${importProgress}...`
          : `Importing ${csvTotalRows.toLocaleString()} lead${csvTotalRows === 1 ? "" : "s"}...`
        : "";

  const openImportModal = () => {
    resetImportModal();
    setShowImportModal(true);
  };

  const closeImportModal = () => {
    if (importBusy) return;
    setShowImportModal(false);
    resetImportModal();
  };

  const handleImportDone = async () => {
    setShowImportModal(false);
    resetImportModal();
    await fetchLeads();
    refreshSummary?.();
  };

  const handleImportBack = () => {
    if (importBusy) return;
    if (importStep === 1) {
      closeImportModal();
    } else {
      if (importStep === 4) {
        setImportResult(null);
        setImportSkipReasons([]);
      }
      setImportStep((s) => (s - 1) as ImportStep);
    }
  };

  const handleImportContinue = () => {
    if (importStep === 4 && !importResult) {
      void handleImportConfirm();
      return;
    }
    // Advancing from step 1 (upload) to step 2 (column mapping): kick off the
    // AI auto-map automatically so the agent lands on a pre-matched mapping
    // instead of having to click the button. The runAutoMap guards
    // (aiMapUsed / aiMapLoading / no headers) keep it to one successful run per
    // import and a no-op when there's nothing to map.
    if (importStep === 1 && csvHeaders.length && !aiMapUsed) {
      void runAutoMap();
    }
    handleImportWizardContinue();
  };

  useEffect(() => {
    const state = location.state as { openImportModal?: boolean } | null;
    if (!state?.openImportModal) return;
    resetImportModal();
    setShowImportModal(true);
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: null,
    });
  }, [location.pathname, location.search, location.state, navigate]);


  return {
    showImportModal,
    setShowImportModal,
    importStep,
    setImportStep,
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
    importing,
    importPreviewLoading,
    importSheets,
    importSheetName,
    setImportSheetName,
    importHasHeader,
    importDetectionSummary,
    importDetectionMethod,
    autoDetectedMapping,
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
    importAiApplying,
    message2,
    importBusy,
    importLoadingMessage,
    openImportModal,
    closeImportModal,
    resetImportModal,
    fetchImportPreview,
    handleCSVSelect,
    importMappingHasContact,
    getImportFieldMappingStatus,
    runAutoMap,
    aiMapLoading,
    aiMapUsed,
    aiMapMessage,
    handleImportConfirm,
    handleImportWizardContinue,
    handleImportDone,
    handleImportBack,
    handleImportContinue,
  };
}

// type UseLeadImportReturn = ReturnType<typeof useLeadImport>;
