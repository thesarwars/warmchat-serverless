import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { fetchAiSettings } from "@/helpers/backend";

interface AgentState { key: string; name: string; enabled: boolean }
interface AiSettings { master_enabled?: boolean; agents?: AgentState[] }

/**
 * Surfaces a non-blocking warning when a user is about to enroll leads into an
 * automation / turn on inbound replies while the relevant AI controls are OFF.
 * Enrollment still happens (the leads are queued), but the cron HOLDS each
 * queued message until the switch that governs it is turned on - so this
 * explains why nothing will go out yet, not that it's blocked permanently.
 *
 * Shared by the import wizard (step 4) and the Add-Lead campaign step.
 */
export default function AiOffWarning({
  enrollAutomation,
  inboundEnabled,
}: {
  enrollAutomation: boolean;
  inboundEnabled: boolean;
}) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = (await fetchAiSettings()) as AiSettings;
        if (!cancelled) setSettings(data);
      } catch {
        /* leave null - no warning rather than a false one */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!loaded || !settings) return null;

  const masterOn = settings.master_enabled === true;
  const agent = (k: string) => settings.agents?.find((a) => a.key === k)?.enabled === true;
  const inboundAgentOn = agent("inbound");
  const outboundAgentOn = agent("outbound");

  const lines: string[] = [];
  if (!masterOn) {
    lines.push(
      "AI is turned OFF globally (master switch). Leads are still enrolled, but no messages will go out until you turn the master switch on - they are held, not sent.",
    );
  }
  if (enrollAutomation && (!masterOn || !outboundAgentOn)) {
    lines.push(
      "The Outbound agent is off, so enrolled automation messages are held and will NOT send until you turn Outbound on.",
    );
  }
  if (inboundEnabled && (!masterOn || !inboundAgentOn)) {
    lines.push(
      "Inbound AI is off, so the AI will NOT auto-reply when these leads message back - replies wait until you enable the Inbound agent.",
    );
  }

  if (lines.length === 0) return null;

  return (
    <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="font-semibold">Heads up - AI is partly off</p>
        <ul className="list-disc pl-4 space-y-1">
          {lines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
        <p>
          Turn it on under AI Agent &rarr; AI Settings whenever you are ready.
        </p>
      </div>
    </div>
  );
}
