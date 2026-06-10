import { useEffect, useRef, useState } from "react";
import type { NewLeadForm, SmsConsentStatus } from "../types";
import {
  ADD_LEAD_SMS_CONSENT_OPTIONS,
  AI_STATUS_OPTIONS,
  COUNTRY_CODES,
  LEAD_TEXT_LIMITS,
  LEAD_TYPE_OPTIONS,
  PRICE_RANGE_OPTIONS,
  SOURCE_OPTIONS,
  STAGE_OPTIONS,
} from "../constants";
import { TimezonePicker } from "@/components/TimezonePicker";

/**
 * Single source of truth for both ADDING and EDITING a lead. The Leads page
 * uses it via `openEditLeadFromDetails` (edit) and `setShowAddLeadModal(true)`
 * (add); the Inbox routes its "Edit lead" kebab action here too. Mode is
 * controlled by `editingLeadId` - non-null = edit mode (title becomes
 * "Edit Lead", save button becomes "Update Lead").
 *
 * The SMS consent radios + TCPA attestation banner render in BOTH modes so
 * the agent can change the consent state after creation (e.g. they got
 * verbal opt-in later, or need to mark a do-not-text contact).
 */
export type AddLeadModalProps = {
  open: boolean;
  form: NewLeadForm;
  onFormChange: (next: NewLeadForm) => void;
  editingLeadId: number | null;
  leadSmsConsent: SmsConsentStatus;
  onLeadSmsConsentChange: (value: SmsConsentStatus) => void;
  onClose: () => void;
  /**
   * Persist the lead. May return a result so this modal can show a server-side
   * error (e.g. a duplicate) inline instead of the parent swallowing it. The
   * modal validates required fields client-side BEFORE calling this.
   */
  onSave: () => void | Promise<{ ok: boolean; error?: string } | void>;
  /** When true, disables the save button (e.g. while a create request is in flight). */
  saving?: boolean;
  /**
   * Locks the SMS consent radios to "Do not SMS" with an explanatory
   * info banner. Set this when the lead has `sms_opt_out=1` (recipient
   * texted STOP, or an admin/agent/import blocked them). The agent can't
   * unblock from the lead form - they have to either get the contact to
   * text START or contact support with proof of consent for the unblock.
   */
  lockedForOptOut?: boolean;
};

export default function AddLeadModal({
  open,
  form,
  onFormChange,
  editingLeadId,
  leadSmsConsent,
  onLeadSmsConsentChange,
  onClose,
  onSave,
  saving = false,
  lockedForOptOut = false,
}: AddLeadModalProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // AI Qualification section is collapsed by default. In edit mode we open
  // it automatically when the lead has any captured field set, so the agent
  // sees the AI's extracted data without an extra click.
  const [aiQualOpen, setAiQualOpen] = useState(false);
  // TCPA consent attestation - required when the agent ASSERTS "Already opted
  // in" (claims prior express written consent). Matches the import wizard's
  // attestation: the agent's claim is theirs to make, not ours to assume.
  // Editing a lead that was already opted in does NOT re-require it (see
  // `needsAttestation` below) - only a fresh promotion to opted-in does.
  const [consentAttested, setConsentAttested] = useState(false);
  // The consent state captured when the modal opened. It lets us tell apart
  // EDITING a lead that was ALREADY opted in (the agent attested at creation -
  // an unrelated edit must not be blocked, so we pre-check the box) from
  // PROMOTING a lead to opted-in during this session (fresh attestation still
  // required). Reset to null on close so the next open re-captures.
  const [initialConsent, setInitialConsent] = useState<SmsConsentStatus | null>(null);
  useEffect(() => {
    if (!open) {
      setInitialConsent(null);
      setConsentAttested(false);
      return;
    }
    if (initialConsent === null) {
      setInitialConsent(leadSmsConsent);
      if (editingLeadId != null && leadSmsConsent === "opted_in") {
        setConsentAttested(true);
      }
    }
  }, [open, editingLeadId, leadSmsConsent, initialConsent]);
  // Only require the attestation when the agent is asserting opted-in consent
  // that wasn't already on the lead when this edit started.
  const alreadyOptedIn = editingLeadId != null && initialConsent === "opted_in";
  const needsAttestation = leadSmsConsent === "opted_in" && !alreadyOptedIn;
  // When the agent tries to save but the attestation is unchecked, we scroll
  // the action-required box into view and flash it so they can see WHAT is
  // blocking the save - a bare disabled button gives no explanation, and the
  // box sits near the top while the Save button is at the bottom.
  const attestationRef = useRef<HTMLDivElement>(null);
  const [flashAttestation, setFlashAttestation] = useState(false);

  if (!open) return null;

  const set = (patch: Partial<NewLeadForm>) => onFormChange({ ...form, ...patch });

  // The digits the agent typed after the country code (so a bare "+1" with no
  // number does not count as a phone). Strip the literal country-code prefix
  // first - a greedy /^\+\d+/ would eat the whole number and leave nothing.
  const countryCode = form.countryCode || "+1";
  const phoneDigits = String(form.phone || "").replace(countryCode, "").replace(/\D/g, "");
  const hasContact = phoneDigits.length > 0 || Boolean(form.email?.trim());

  const handleSubmit = async () => {
    setFormError(null);
    const name = form.name?.trim() || "";
    if (!name) {
      setFormError("Enter the lead's name.");
      return;
    }
    // Hard length cap mirrors the import auto-cap and the DB intake limit so a
    // name can never exceed LEAD_TEXT_LIMITS.name once stored. The input's
    // maxLength prevents typing past it; this is the defensive backstop for
    // values prefilled from the lead row (edit mode).
    if (name.length > LEAD_TEXT_LIMITS.name) {
      setFormError(`Name must be ${LEAD_TEXT_LIMITS.name} characters or fewer.`);
      return;
    }
    const email = form.email?.trim() || "";
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (email.length > LEAD_TEXT_LIMITS.email) {
      setFormError(`Email must be ${LEAD_TEXT_LIMITS.email} characters or fewer.`);
      return;
    }
    if (!hasContact) {
      setFormError("Enter a phone number or an email address.");
      return;
    }
    // TCPA attestation gate: matches the import wizard. The server doesn't
    // verify the claim, so the friction lives here to keep the agent's
    // "Already opted in" assertion a conscious one.
    if (needsAttestation && !consentAttested) {
      setFormError("Confirm the TCPA consent attestation before saving.");
      // Take the agent to the blocker: scroll the action-required box into
      // view and flash it so they know exactly what to do.
      attestationRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashAttestation(true);
      window.setTimeout(() => setFlashAttestation(false), 1600);
      return;
    }
    setSubmitting(true);
    try {
      const res = await onSave();
      if (res && res.ok === false) setFormError(res.error || "Could not save lead.");
    } finally {
      setSubmitting(false);
    }
  };
  const busy = submitting || saving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-lead-title"
        className="flex max-h-[min(85vh,calc(100dvh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2
            id="add-lead-title"
            className="text-lg font-semibold text-gray-900"
          >
            {editingLeadId != null ? "Edit Lead" : "Add New Lead"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            x
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <input
            className="w-full border rounded px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Full Name"
            maxLength={LEAD_TEXT_LIMITS.name}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          <input
            className="w-full border rounded px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Email"
            maxLength={LEAD_TEXT_LIMITS.email}
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
          />
          {/* PHONE - kept above Email so the consent choice sits right under it */}
          <div className="flex gap-2 mb-3">
            <select
              className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 w-37.5"
              value={form.countryCode || "+1"}
              onChange={(e) =>
                set({
                  countryCode: e.target.value,
                  phone: `${e.target.value}${String(form.phone || "").replace(/^\+\d*/, "")}`,
                })
              }
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} {c.name}
                </option>
              ))}
            </select>
            <input
              type="tel"
              className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Phone number"
              maxLength={LEAD_TEXT_LIMITS.phone}
              value={String(form.phone || "").replace(form.countryCode || "+1", "")}
              onChange={(e) =>
                set({ phone: `${form.countryCode || "+1"}${e.target.value}` })
              }
            />
          </div>

          {/* SMS opt-in status renders in BOTH add and edit modes so the agent
              can correct the consent state after creation. Promoting to
              `opted_in` requires the TCPA attestation either way. */}
          <div>
            <div className="mb-3 space-y-2">
              <p className="text-xs font-medium text-gray-600">SMS opt-in status</p>
              {lockedForOptOut && (
                <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center rounded-full bg-rose-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-900">
                      Locked
                    </span>
                    <span className="text-xs font-semibold text-rose-900">
                      SMS blocked - cannot edit consent from here
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-rose-950">
                    This contact opted out of SMS (texted STOP or was blocked
                    in the Compliance tab). All SMS sends to them are
                    automatically refused. To unblock:
                  </p>
                  <ul className="mt-2 ml-4 list-disc space-y-1 text-sm text-rose-950">
                    <li>
                      <strong className="font-semibold">Ask them to text START</strong>
                      {" "}back to your number. The platform re-subscribes them
                      automatically. This is the cleanest path - it produces a
                      fresh, audit-proof opt-in.
                    </li>
                    <li>
                      Or <strong className="font-semibold">contact support</strong>
                      {" "}with proof of consent (a signed waiver, the original
                      web-form record, etc.) and a reason for the unblock; an
                      admin can lift it manually and the action is logged in
                      the compliance audit trail.
                    </li>
                  </ul>
                </div>
              )}
              {ADD_LEAD_SMS_CONSENT_OPTIONS.map((opt) => {
                const isLocked = lockedForOptOut;
                const isActive = isLocked
                  ? opt.value === "no_sms"
                  : leadSmsConsent === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 transition ${
                      isLocked
                        ? "cursor-not-allowed opacity-60"
                        : "cursor-pointer"
                    } ${
                      isActive
                        ? "border-orange-400 bg-orange-50"
                        : "border-gray-200 hover:border-orange-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="lead-consent"
                      value={opt.value}
                      checked={isActive}
                      disabled={isLocked}
                      onChange={() => {
                        if (!isLocked) onLeadSmsConsentChange(opt.value);
                      }}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-semibold text-sm text-gray-800">{opt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                );
              })}
              {needsAttestation && (
                <div
                  ref={attestationRef}
                  className={`rounded-lg border bg-amber-50 p-2.5 shadow-xs transition ${
                    flashAttestation
                      ? "border-amber-500 ring-2 ring-amber-400 ring-offset-1"
                      : "border-amber-400"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="inline-flex items-center rounded-full border border-amber-300 bg-white px-1.5 py-px text-[9px] font-bold uppercase text-amber-800">
                      Action required
                    </span>
                    <span className="text-[11px] font-semibold text-amber-900">
                      TCPA consent attestation
                    </span>
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={consentAttested}
                      onChange={(e) => setConsentAttested(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-amber-500 text-amber-600 focus:ring-2 focus:ring-amber-400 focus:ring-offset-1"
                      aria-label="I confirm I have prior express written consent for this contact"
                    />
                    <span className="text-[11px] leading-snug text-amber-950">
                      I confirm I have <strong className="font-bold">prior express written consent</strong> (TCPA 47 U.S.C. 227 / FCC rules) to send SMS to <strong className="font-bold">this contact</strong>. Disputes and liability for unauthorized contacts are <strong className="font-bold">my responsibility</strong>, not WarmChats.
                    </span>
                  </label>
                  {!consentAttested && (
                    <p className="mt-1.5 ml-6 text-[10px] font-medium text-amber-700">
                      You must check this box to save.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <input
            className="w-full border rounded px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Company"
            maxLength={LEAD_TEXT_LIMITS.company}
            value={form.company}
            onChange={(e) => set({ company: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block mb-1 text-xs font-medium text-gray-600">
                Lead Type
              </label>
              <select
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.lead_type}
                onChange={(e) => set({ lead_type: e.target.value })}
              >
                {LEAD_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium text-gray-600">
                Stage
              </label>
              {/* Stage is the lead's pipeline position (status). It drives the
                  Score and "hot" everywhere. Defaults to New Lead when the
                  stored value is empty/unrecognized. */}
              <select
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={
                  STAGE_OPTIONS.find(
                    (s) => s.toLowerCase() === String(form.status || "").toLowerCase(),
                  ) ?? "New Lead"
                }
                onChange={(e) => set({ status: e.target.value })}
              >
                {STAGE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block mb-1 text-xs font-medium text-gray-600">
                AI Status
              </label>
              <select
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.ai_status}
                onChange={(e) => set({ ai_status: e.target.value })}
              >
                {AI_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium text-gray-600">
                Source
              </label>
              <select
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.source}
                onChange={(e) => set({ source: e.target.value })}
              >
                <option value="">-</option>
                {SOURCE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block mb-1 text-xs font-medium text-gray-600">
                Area
              </label>
              <input
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="e.g. Brooklyn"
                maxLength={LEAD_TEXT_LIMITS.area}
                value={form.area}
                onChange={(e) => set({ area: e.target.value })}
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium text-gray-600">
                Budget
              </label>
              <select
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.price_range}
                onChange={(e) => set({ price_range: e.target.value })}
              >
                <option value="">-</option>
                {PRICE_RANGE_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-3">
            <label className="block mb-1 text-xs font-medium text-gray-600">
              Timezone
            </label>
            <TimezonePicker
              value={form.timezone}
              onChange={(tz) => set({ timezone: tz })}
              inputClassName="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Auto-detect from phone area code"
            />
            <p className="mt-1 text-xs text-gray-400">
              Used for quiet-hours and the lead&apos;s local time. Leave blank to auto-detect from the phone area code (falls back to your account timezone).
            </p>
          </div>

          <textarea
            rows={4}
            className="w-full border rounded px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Notes"
            maxLength={LEAD_TEXT_LIMITS.notes}
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />

          {/* Property address - the AI agent's extracted address for the lead.
              Surfaced here so it can be corrected during a manual edit. */}
          <input
            className="w-full border rounded px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Property address (optional)"
            maxLength={LEAD_TEXT_LIMITS.property_address}
            value={String(form.property_address || "")}
            onChange={(e) => set({ property_address: e.target.value })}
          />

          {/* AI Qualification capture - ported from the old EditLeadModal so
              every field the AI agent populates is editable here too. The
              section is collapsed by default to keep the modal tidy on add. */}
          <div className="mb-3 rounded border border-gray-200">
            <button
              type="button"
              onClick={() => setAiQualOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold text-gray-800"
              aria-expanded={aiQualOpen}
            >
              <span>AI Qualification</span>
              <span className="text-gray-500" aria-hidden>{aiQualOpen ? "-" : "+"}</span>
            </button>
            {aiQualOpen ? (
              <div className="border-t border-gray-100 px-3 py-3 space-y-3">
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-600">Timeline</label>
                  <input
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="e.g. 3 months, ASAP"
                    maxLength={LEAD_TEXT_LIMITS.timeline}
                    value={String(form.timeline || "")}
                    onChange={(e) => set({ timeline: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-600">Pre-approved</label>
                  <div className="flex flex-wrap gap-3 text-sm text-gray-700">
                    {(["yes", "no", "unset"] as const).map((choice) => {
                      const current = form.pre_approved === true ? "yes" : form.pre_approved === false ? "no" : "unset";
                      return (
                        <label key={choice} className="inline-flex items-center gap-1.5">
                          <input
                            type="radio"
                            name="add-lead-pre-approved"
                            value={choice}
                            checked={current === choice}
                            onChange={() => set({
                              pre_approved: choice === "yes" ? true : choice === "no" ? false : null,
                            })}
                          />
                          <span className="capitalize">{choice === "unset" ? "-" : choice}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-600">Motivation</label>
                  <input
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="What's driving the move?"
                    maxLength={LEAD_TEXT_LIMITS.motivation}
                    value={String(form.motivation || "")}
                    onChange={(e) => set({ motivation: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-1 text-xs font-medium text-gray-600">Occupancy</label>
                    <select
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={String(form.occupancy_status || "")}
                      onChange={(e) => set({ occupancy_status: e.target.value })}
                    >
                      <option value="">-</option>
                      <option value="Owner-occupied">Owner-occupied</option>
                      <option value="Rented">Rented</option>
                      <option value="Vacant">Vacant</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-medium text-gray-600">Interest Level</label>
                    <select
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={String(form.interest_level || "")}
                      onChange={(e) => set({ interest_level: e.target.value })}
                    >
                      <option value="">-</option>
                      {["1", "2", "3", "4", "5"].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-600">Financing</label>
                  <input
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Cash, conventional, FHA..."
                    maxLength={LEAD_TEXT_LIMITS.financing_status}
                    value={String(form.financing_status || "")}
                    onChange={(e) => set({ financing_status: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-1 text-xs font-medium text-gray-600">Bedrooms</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="e.g. 3"
                      value={String(form.bedrooms ?? "")}
                      onChange={(e) => set({ bedrooms: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-medium text-gray-600">Bathrooms</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="e.g. 2"
                      value={String(form.bathrooms ?? "")}
                      onChange={(e) => set({ bathrooms: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-600">Property Type</label>
                  <input
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Single family, condo, townhouse..."
                    maxLength={LEAD_TEXT_LIMITS.property_type}
                    value={String(form.property_type || "")}
                    onChange={(e) => set({ property_type: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-600">Seller Price Expectations</label>
                  <input
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="e.g. $650k"
                    maxLength={LEAD_TEXT_LIMITS.seller_price_expectations}
                    value={String(form.seller_price_expectations || "")}
                    onChange={(e) => set({ seller_price_expectations: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-1 text-xs font-medium text-gray-600">Qualification Step</label>
                    <input
                      readOnly
                      className="w-full border rounded bg-gray-50 px-3 py-2 text-gray-700"
                      value={String(form.qualification_step ?? 0)}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-medium text-gray-600">Qualification Status</label>
                    <select
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={String(form.qualification_status || "")}
                      onChange={(e) => set({ qualification_status: e.target.value })}
                    >
                      <option value="">-</option>
                      {["Engaged", "Not Engaged", "Booking-ready", "Done"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 mb-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-900">Email Notifications</div>
                <div className="text-xs text-gray-500">Unread email alerts for this lead</div>
              </div>
              <button
                type="button"
                onClick={() => set({ email_notifications_enabled: !form.email_notifications_enabled })}
                className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold transition ${
                  form.email_notifications_enabled ? "bg-orange-50 text-orange-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {form.email_notifications_enabled ? "On" : "Off"}
              </button>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-900">SMS Notifications</div>
                <div className="text-xs text-gray-500">Unread SMS alerts for this lead</div>
              </div>
              <button
                type="button"
                onClick={() => set({ sms_notifications_enabled: !form.sms_notifications_enabled })}
                className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold transition ${
                  form.sms_notifications_enabled ? "bg-orange-50 text-orange-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {form.sms_notifications_enabled ? "On" : "Off"}
              </button>
            </div>
          </div>

        </div>

        <div className="shrink-0 border-t border-gray-100 bg-white px-5 py-4">
          {formError && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={busy}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Saving..." : editingLeadId != null ? "Update Lead" : "Add Lead"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
