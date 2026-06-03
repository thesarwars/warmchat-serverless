import React from "react";
import { useNavigate } from "react-router-dom";

interface QuickActionsProps {
  /** Optional handler for "New message" (e.g. open a composer) - falls back to /inbox. */
  onNewMessage?: () => void;
  /** Optional handler for "Add lead" - falls back to /leads. */
  onAddLead?: () => void;
  /** Optional handler for "Schedule showing" - falls back to /appointments. */
  onScheduleShowing?: () => void;
}

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const MsgIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <path d="M20 12a8 8 0 0 1-12.2 6.8L4 20l1.2-3.8A8 8 0 1 1 20 12z" />
  </svg>
);
const CalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);
const BoltIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);

const QuickActions: React.FC<QuickActionsProps> = ({ onNewMessage, onAddLead, onScheduleShowing }) => {
  const navigate = useNavigate();

  const actions = [
    { label: "New message", icon: <MsgIcon />, onClick: () => (onNewMessage ? onNewMessage() : navigate("/inbox")) },
    { label: "Add lead", icon: <PlusIcon />, onClick: () => (onAddLead ? onAddLead() : navigate("/leads")) },
    {
      label: "Schedule showing",
      icon: <CalIcon />,
      onClick: () => (onScheduleShowing ? onScheduleShowing() : navigate("/appointments")),
    },
    { label: "Launch sequence", icon: <BoltIcon />, onClick: () => navigate("/ai/agent?tab=outbound") },
  ];

  return (
    <div className="rounded-[20px] border border-[#EAEAEA] bg-white p-5 shadow-[0_1px_2px_rgba(50,35,20,0.03)]">
      <div className="mb-3.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#C0530F]">Quick actions</div>
        <div className="mt-1 text-base font-bold tracking-tight text-[#211a14]">Common tasks</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className="flex items-center gap-2.5 rounded-[11px] border border-[#EAEAEA] bg-white px-3.5 py-3 text-[13px] font-medium text-[#463b31] transition hover:bg-[#faf7f2]"
          >
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#fdf4ec] text-[#c0530f]">{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActions;
