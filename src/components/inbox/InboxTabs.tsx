import { Icon } from "../ai-v2/Icon";

export type InboxTab = "messages" | "calls";

const TABS: { key: InboxTab; label: string; icon: string }[] = [
  { key: "messages", label: "Messages", icon: "message" },
  { key: "calls", label: "Calls", icon: "phone" },
];

/**
 * Top-level Messages | Calls switcher for the Inbox. The Calls tab renders the
 * embedded CallsPage; the active tab is reflected in the `?tab=` query param so
 * it's linkable and the old /calls URL can redirect into it.
 *
 * Styled with the design's compact, underline-on-active `wc-inbox-tab` look.
 */
export function InboxTabs({
  active,
  onChange,
}: {
  active: InboxTab;
  onChange: (tab: InboxTab) => void;
}) {
  return (
    <div className="wc-inbox-tabs">
      {TABS.map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`wc-inbox-tab${active === key ? " is-on" : ""}`}
        >
          <Icon name={icon} size={16} />
          {label}
        </button>
      ))}
    </div>
  );
}
