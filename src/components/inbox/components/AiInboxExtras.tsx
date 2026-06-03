import {
  getAiStatus,
  getStageValue,
  getLeadType,
  aiStatusPillClass,
  stagePillClass,
  leadTypePillClass,
} from "@/components/leads/utils/leadDisplay";

export type AiInboxContact = {
  id: number;
  lead_type?: string | null;
  intent?: string | null;
  ai_status?: string | null;
  status?: string | null;
  qualification_status?: string | null;
  qualification_step?: number | null;
  price_range?: string | null;
  area?: string | null;
  property_address?: string | null;
  timeline?: string | null;
  pre_approved?: boolean | null;
  motivation?: string | null;
  occupancy_status?: string | null;
  financing_status?: string | null;
  interest_level?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  property_type?: string | null;
  seller_price_expectations?: string | null;
  ai_summary?: string | null;
  lead_score?: number | null;
  next_best_action?: string | null;
  sms_opt_out?: boolean | null;
  email_opt_out?: boolean | null;
  sms_consent_status?: string | null;
};

const DASH = "-";

function formatPreApproved(value: boolean | null | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return DASH;
}

function valueOrDash(raw: string | number | null | undefined): string {
  if (raw == null) return DASH;
  const str = String(raw).trim();
  return str === "" ? DASH : str;
}

function hasValue(raw: unknown): boolean {
  if (raw == null) return false;
  if (typeof raw === "string") return raw.trim() !== "";
  if (typeof raw === "number") return Number.isFinite(raw) && raw !== 0;
  return true;
}

export function AiContactBadges({
  contact,
  className,
}: {
  contact: AiInboxContact;
  className?: string;
}) {
  const leadType = getLeadType(contact as Record<string, unknown>);
  const stage = getStageValue(contact as Record<string, unknown>);
  const aiStatus = getAiStatus(contact as Record<string, unknown>);

  return (
    <div className={className ?? "flex flex-wrap items-center gap-1.5"}>
      <span
        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${leadTypePillClass(leadType)}`}
      >
        {leadType}
      </span>
      {stage ? (
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${stagePillClass(stage)}`}
        >
          {stage}
        </span>
      ) : null}
      {aiStatus ? (
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${aiStatusPillClass(aiStatus)}`}
        >
          {aiStatus}
        </span>
      ) : null}
      {contact.sms_opt_out ? (
        <span
          title="This lead replied STOP - SMS is suppressed. They must text START to re-subscribe."
          className="inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700"
        >
          SMS opted out
        </span>
      ) : null}
      {contact.email_opt_out ? (
        <span
          title="This lead unsubscribed from email."
          className="inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700"
        >
          Email opted out
        </span>
      ) : null}
    </div>
  );
}

export function AiCapturedFieldsPanel({ contact }: { contact: AiInboxContact }) {
  const property =
    contact.property_address && String(contact.property_address).trim() !== ""
      ? String(contact.property_address)
      : contact.area && String(contact.area).trim() !== ""
        ? String(contact.area)
        : null;

  const fields: { label: string; value: string }[] = [
    { label: "Next step", value: valueOrDash(contact.next_best_action) },
    { label: "Timeline", value: valueOrDash(contact.timeline) },
    { label: "Budget", value: valueOrDash(contact.price_range) },
    { label: "Pre-approved", value: formatPreApproved(contact.pre_approved) },
    { label: "Property", value: valueOrDash(property) },
    { label: "Property type", value: valueOrDash(contact.property_type) },
    { label: "Bedrooms", value: valueOrDash(contact.bedrooms) },
    { label: "Bathrooms", value: valueOrDash(contact.bathrooms) },
    { label: "Occupancy", value: valueOrDash(contact.occupancy_status) },
    { label: "Motivation", value: valueOrDash(contact.motivation) },
    { label: "Seller price exp.", value: valueOrDash(contact.seller_price_expectations) },
    { label: "Financing", value: valueOrDash(contact.financing_status) },
    { label: "Interest", value: valueOrDash(contact.interest_level) },
  ];

  const anyValue =
    hasValue(contact.ai_summary) ||
    hasValue(contact.lead_score) ||
    hasValue(contact.next_best_action) ||
    hasValue(contact.timeline) ||
    hasValue(contact.price_range) ||
    contact.pre_approved != null ||
    hasValue(property) ||
    hasValue(contact.occupancy_status) ||
    hasValue(contact.motivation) ||
    hasValue(contact.financing_status) ||
    hasValue(contact.interest_level) ||
    hasValue(contact.property_type) ||
    hasValue(contact.bedrooms) ||
    hasValue(contact.bathrooms) ||
    hasValue(contact.seller_price_expectations) ||
    hasValue(contact.qualification_step);

  if (!anyValue) return null;

  const step = Number(contact.qualification_step || 0);
  const stepLabel = step > 0 ? `${step} of 8` : null;
  const summary = contact.ai_summary && String(contact.ai_summary).trim() !== "" ? String(contact.ai_summary) : null;

  return (
    <div className="overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-xs">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="text-[1.05rem] font-semibold text-gray-900">
          AI Captured Fields
        </div>
        <div className="flex items-center gap-2">
          {contact.lead_score != null ? (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              Score {contact.lead_score}
            </span>
          ) : null}
          {stepLabel ? (
            <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
              Step {stepLabel}
            </span>
          ) : null}
        </div>
      </div>
      {summary ? (
        <div className="border-b border-gray-100 px-5 py-3 text-sm leading-relaxed text-gray-600">
          {summary}
        </div>
      ) : null}
      <dl className="divide-y divide-gray-100 text-sm">
        {fields.map(({ label, value }) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 px-5 py-2.5"
          >
            <dt className="text-gray-500">{label}</dt>
            <dd className="max-w-[60%] truncate text-right font-medium text-gray-800">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
