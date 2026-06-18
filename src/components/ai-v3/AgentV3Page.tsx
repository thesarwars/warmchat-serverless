import MainLayout from "../MainLayout";
import { AgentV3 } from "./AgentV3";
import "./agentv3.css";

/* Route wrapper for the self-contained V3 AI Agent page. The `.wcv3` wrapper
   scopes agentv3.css so it never collides with the app's Tailwind or the V2
   prototype.css. No dependency on anything in ai-v2. */
export default function AgentV3Page() {
  return (
    <MainLayout>
      <div className="wcv3 min-h-[calc(100vh-4rem)] lg:-mx-4 lg:-mt-4">
        <AgentV3 />
      </div>
    </MainLayout>
  );
}
