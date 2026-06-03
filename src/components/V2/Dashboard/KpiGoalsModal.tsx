import React, { useEffect, useState } from "react";
import type { OrgKpiGoals } from "@/helpers/backend";

interface KpiGoalsModalProps {
  open: boolean;
  goals?: OrgKpiGoals | null;
  saving?: boolean;
  onSave: (goals: OrgKpiGoals) => void;
  onCancel: () => void;
}

interface FieldDef {
  key: keyof OrgKpiGoals;
  label: string;
  hint: string;
  step: number;
}

const FIELDS: FieldDef[] = [
  { key: "goal_pipeline_value", label: "Pipeline value", hint: "Target commission pipeline ($)", step: 1000 },
  { key: "goal_hot_leads", label: "Hot leads", hint: "Target hot leads this month", step: 1 },
  { key: "goal_appointments", label: "Appointments", hint: "Target appointments this month", step: 1 },
  { key: "goal_deals_closed", label: "Deals closed", hint: "Target deals closed this month", step: 1 },
];

const toNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const KpiGoalsModal: React.FC<KpiGoalsModalProps> = ({ open, goals, saving, onSave, onCancel }) => {
  const [values, setValues] = useState<Record<keyof OrgKpiGoals, string>>({
    goal_pipeline_value: "",
    goal_hot_leads: "",
    goal_appointments: "",
    goal_deals_closed: "",
  });

  // Seed the inputs from the current goals each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setValues({
      goal_pipeline_value: goals?.goal_pipeline_value ? String(goals.goal_pipeline_value) : "",
      goal_hot_leads: goals?.goal_hot_leads ? String(goals.goal_hot_leads) : "",
      goal_appointments: goals?.goal_appointments ? String(goals.goal_appointments) : "",
      goal_deals_closed: goals?.goal_deals_closed ? String(goals.goal_deals_closed) : "",
    });
  }, [open, goals]);

  if (!open) return null;

  const submit = () => {
    onSave({
      goal_pipeline_value: toNumber(values.goal_pipeline_value),
      goal_hot_leads: toNumber(values.goal_hot_leads),
      goal_appointments: toNumber(values.goal_appointments),
      goal_deals_closed: toNumber(values.goal_deals_closed),
    });
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-2xl border border-[#EBEBF2] bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[15px] font-extrabold text-[#15172B]">Monthly goals</h3>
        <p className="mt-1 text-[13px] leading-snug text-[#6E7191]">
          Set your targets for this month. Leave a field at 0 to hide its progress bar.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-[#3B3D5A]">{f.label}</span>
              <input
                type="number"
                min={0}
                step={f.step}
                inputMode="numeric"
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder="0"
                className="h-9 rounded-lg border border-[#EBEBF2] bg-white px-3 text-[13px] text-[#15172B] outline-none focus:border-[#FB923C]"
              />
              <span className="text-[10.5px] text-[#8c7d6f]">{f.hint}</span>
            </label>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-lg border border-[#EBEBF2] bg-white px-4 text-[13px] font-bold text-[#3B3D5A] transition hover:bg-[#FAFAFD]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="h-9 rounded-lg bg-[#FB923C] px-4 text-[13px] font-bold text-white transition hover:bg-[#EA6D0C] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save goals"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default KpiGoalsModal;
