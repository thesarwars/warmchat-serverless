import { Link } from "react-router-dom";
import { Bug, ShieldOff, Eye, ChevronRight } from "lucide-react";
import MainLayout from "@/components/MainLayout";

/**
 * /admin - Site-admin hub. Intentionally NOT linked from the sidebar or
 * anywhere else in the UI: it's reachable only by typing the URL, and the
 * route (like every /admin/* page) is gated on the site-wide is_admin flag
 * via AdminProtectedRoute. Just a launcher for the individual admin tools.
 */

interface AdminLink {
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
}

const ADMIN_LINKS: AdminLink[] = [
  {
    to: "/admin/debug",
    icon: Bug,
    title: "Debug Logs",
    description: "Mock send feed, rate-limiter state, and the mock-send toggle.",
  },
  {
    to: "/admin/blocked",
    icon: ShieldOff,
    title: "Blocked Numbers",
    description: "Site-wide SMS suppression manager across all orgs.",
  },
  {
    to: "/settings?tab=compliance",
    icon: Eye,
    title: "Org Compliance Overview",
    description: "Per-org opt-outs, unsubscribes and manual blocks. Replaces /account/blocked.",
  },
];

export default function AdminHome() {
  return (
    <MainLayout title="Admin">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900">Admin tools</h1>
        <p className="mt-1 text-sm text-gray-500">
          Internal site-admin utilities. Not linked anywhere else in the app.
        </p>

        <div className="mt-6 grid gap-3">
          {ADMIN_LINKS.map(({ to, icon: Icon, title, description }) => (
            <Link
              key={to}
              to={to}
              className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-orange-200 hover:shadow-md"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <Icon size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-gray-900">{title}</span>
                <span className="block text-sm text-gray-500">{description}</span>
              </span>
              <ChevronRight
                size={18}
                className="shrink-0 text-gray-300 transition group-hover:text-orange-500"
              />
            </Link>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
