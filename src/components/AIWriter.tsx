import { useState } from "react";
import MainLayout from "../components/MainLayout";
import {
  Brain,
  Sparkles,
  CheckCircle2,
  Loader2,
  Wand2,
  Bot,
  TrendingUp,
  BarChart3,
  Star,
  MailCheck,
  ThumbsUp,
  ThumbsDown,
  Activity,
  RefreshCw,
  User,
  Mic2,
  Edit3,
  Target,
  MessageCircle,
  Flame,
} from "lucide-react";

export default function AIWriter() {
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState("Friendly");
  const [persona, setPersona] = useState("Sales Representative");
  const token = localStorage.getItem("token") || "";
  const [response, setResponse] = useState({
  messageText: "",
  reply_suggestions: [],
  intent: "",
});

  const [loading, setLoading] = useState(false);
  const API_BASE = import.meta.env.VITE_API_BASE;

  const handleGenerate = async () => {
  setLoading(true);
  setResponse({ messageText: "", reply_suggestions: [], intent: "" });

  try {
    const res = await fetch(`${API_BASE}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json",Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt, tone, persona }),
    });
   

    const data = await res.json();
    const ai = data.response;
    const messageText =
    Array.isArray(ai.message)
    ? ai.message.join("\n")
    : typeof ai.message === "string"
      ? ai.message
      : "";

    // // Normalize message (array → string)
    // const messageText = Array.isArray(ai.message)
    //   ? ai.message.join("\n")
    //   : ai.message || "";

    setResponse({
      messageText,
      reply_suggestions: ai.reply_suggestions || [],
      intent: ai.intent || "Unknown",
    });
  } catch (err) {
    console.error(err);
    setResponse({ messageText: "Error generating AI response.", reply_suggestions: [], intent: "" });
  }

  setLoading(false);
};


  return (
    <MainLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
              <Brain className="w-7 h-7 text-orange-500" /> AI Outreach Intelligence
            </h1>
            <p className="text-gray-600 mt-1">
              Understand tone, generate 2-way replies, score leads, sync with CRMs, and analyze engagement - all in one place.
            </p>
          </div>
          {/* <button
           disabled={!prompt.trim() }
            onClick={handleGenerate}
            className={`flex items-center gap-2 px-5 py-2 bg-linear-to-r from-orange-500 to-orange-600 text-white rounded-lg shadow hover:shadow-md font-semibold transition${
    !prompt.trim() ? "opacity-50 cursor-not-allowed" : ""} `}
          >
            <Sparkles size={18} /> Generate Smart Copy
          </button> */}
        </div>

        {/* Persona & Tone Selectors */}
        <div className="bg-white rounded-2xl shadow-xs p-6 mb-6">
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label className="text-gray-700 font-medium mb-2 flex items-center gap-2">
                <User className="w-4 h-4 text-orange-500" /> Choose Persona
              </label>
              <select
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-400 outline-hidden"
              >
                <option>Sales Representative</option>
                <option>Marketing Specialist</option>
                <option>Recruiter</option>
                <option>Founder / CEO</option>
                <option>Customer Success Manager</option>
              </select>
            </div>

            <div>
              <label className="text-gray-700 font-medium mb-2 flex items-center gap-2">
                <Mic2 className="w-4 h-4 text-orange-500" /> Select Tone
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-400 outline-hidden"
              >
                <option>Friendly</option>
                <option>Professional</option>
                <option>Confident</option>
                <option>Empathetic</option>
                <option>Playful</option>
              </select>
            </div>
          </div>

          {/* Prompt Input */}
          <div className="mt-6">
            <label className="text-gray-700 font-medium mb-2 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-orange-500" /> Message Idea or Context
            </label>
            <textarea
              rows={4}
              placeholder="e.g. Follow up after demo, handle objection, or re-engage old lead..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-orange-400 outline-hidden resize-none text-gray-800"
            ></textarea>
          </div>

          <div className="flex justify-end mt-4">
             <button
  onClick={handleGenerate}
  disabled={!prompt.trim() || loading}
  className={`px-4 py-2 bg-linear-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:shadow-sm flex items-center gap-2 ${
    !prompt.trim() ? "opacity-50 cursor-not-allowed" : ""
  }`}
>
  {loading ? (
    <>
      <Loader2 className="animate-spin w-5 h-5" /> Thinking...
    </>
  ) : (
    <>
      <Wand2 size={18} /> Generate Copy
    </>
  )}
 
              </button>
            
          </div>
        </div>

        {/* AI Response + Insights */}
        {response && response.messageText && (
          <>
            <div className="grid md:grid-cols-3 gap-6 mt-6">
              {/* Main AI Response */}
              <div className="md:col-span-2 bg-white rounded-2xl shadow-xs p-6 border border-orange-100">
                <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Bot className="text-orange-500 w-5 h-5" /> AI Draft
                </h2>
                <div className="whitespace-pre-line text-gray-700 leading-relaxed mb-4">
  {response.messageText}
</div>

{/* Reply Suggestions as Pills */}
{/* {response.reply_suggestions?.length > 0 && (
  <div className="mt-3 flex flex-wrap gap-2">
    {response.reply_suggestions.map((s, idx) => (
      <span
        key={idx}
        className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm cursor-pointer hover:bg-orange-200 transition"
      >
        {s}
      </span>
    ))}
  </div>
)} */}

<div className="mt-4 text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Target className="w-4 h-4 text-orange-500" />
                  Intent: <span className="text-orange-600">{response.intent}</span>
                </div>
              </div>

              {/* Insights */}
              <div className="bg-orange-50 rounded-2xl p-6 border border-orange-100 shadow-xs">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="text-orange-500 w-5 h-5" /> Smart Insights
                </h3>
                <ul className="space-y-3 text-gray-700 text-sm">
                  <li className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-orange-500 mt-1" />
                    <span>Understands tone & drafts natural responses.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <MessageCircle className="w-4 h-4 text-orange-500 mt-1" />
                    <span>Turns "Not interested" into engagement opportunities.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <BarChart3 className="w-4 h-4 text-orange-500 mt-1" />
                    <span>Tracks tone-based reply outcomes.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Flame className="w-4 h-4 text-red-500 mt-1" />
                    <span>WarmScore™: AI ranks every lead 0-100.</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* WarmAnalytics Dashboard */}
            <div className="mt-8 bg-white rounded-2xl shadow-xs p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <BarChart3 className="text-orange-500 w-5 h-5" /> WarmAnalytics™ Dashboard
              </h3>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-orange-50 rounded-lg border border-orange-100 flex flex-col items-center">
                  <ThumbsUp className="text-green-500 w-6 h-6 mb-1" />
                  <span className="font-bold text-lg text-gray-800">64%</span>
                  <p className="text-sm text-gray-600">Positive Replies</p>
                </div>
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-100 flex flex-col items-center">
                  <Activity className="text-yellow-500 w-6 h-6 mb-1" />
                  <span className="font-bold text-lg text-gray-800">23%</span>
                  <p className="text-sm text-gray-600">Neutral Replies</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg border border-red-100 flex flex-col items-center">
                  <ThumbsDown className="text-red-500 w-6 h-6 mb-1" />
                  <span className="font-bold text-lg text-gray-800">13%</span>
                  <p className="text-sm text-gray-600">Negative Replies</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 flex flex-col items-center">
                  <Star className="text-blue-500 w-6 h-6 mb-1" />
                  <span className="font-bold text-lg text-gray-800">WarmScore™ 86</span>
                  <p className="text-sm text-gray-600">Lead Engagement Index</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2 text-sm text-gray-600">
                <span className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 rounded-full">
                  <RefreshCw className="w-4 h-4 text-orange-500" /> CRM Sync: Active
                </span>
                <span className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 rounded-full">
                  <MailCheck className="w-4 h-4 text-green-500" /> Brand Tone: Learned
                </span>
                <span className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 rounded-full">
                  <TrendingUp className="w-4 h-4 text-blue-500" /> Engagement Rising
                </span>
              </div>
            </div>
          </>
        )}

        {!response && !loading && (
          <div className="flex flex-col items-center justify-center mt-16 text-center text-gray-500">
            <Brain className="w-12 h-12 text-orange-400 mb-3" />
            <p className="text-lg font-medium">
              Start by entering a message idea - your AI Agent will write, analyze, and score your outreach.
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
