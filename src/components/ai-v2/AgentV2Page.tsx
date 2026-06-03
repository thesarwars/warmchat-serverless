import { useNavigate } from "react-router-dom";
import MainLayout from "../MainLayout";
import { AgentPage } from "./AssistantV2";
import "./prototype.css";

/* Route wrapper for the AI Agent command center (/ai/agent).

   The page is wired to live backend data. The prototype markup uses the design
   bundle's own `wc-*` class system, loaded from prototype.css and pinned under
   the `.wcv2` wrapper so it can never bleed into the app's Tailwind tokens (see
   prototype.css header). It renders inside the normal app chrome (MainLayout =
   Topbar + Sidebar); the negative margin cancels MainLayout's inner padding so
   the design sits edge-to-edge.

   `go` maps the page's internal nav keys onto real app routes. Inbound/Outbound
   are tabs within this page (switched in-place), not separate routes. */
export default function AgentV2Page() {
  const navigate = useNavigate();

  const go = (key: string) => {
    const routes: Record<string, string> = {
      leads: "/leads",
      inbox: "/inbox",
      calendar: "/appointments",
      calls: "/inbox",
      tasks: "/tasks",
      dashboard: "/dashboard",
      ai: "/ai/agent",
    };
    const to = routes[key];
    if (to) navigate(to);
  };

  return (
    <MainLayout>
      <div className="wcv2 min-h-[calc(100vh-4rem)] lg:-mx-4 lg:-mt-4">
        <AgentPage go={go} />
      </div>
    </MainLayout>
  );
}
