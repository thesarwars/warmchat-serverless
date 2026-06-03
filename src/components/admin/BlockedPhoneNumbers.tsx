import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import MainLayout from "@/components/MainLayout";
import { ShieldOff, Loader2, Search } from "lucide-react";

/**
 * /admin/blocked - Site-admin manager for opted-out phone numbers across
 * every org. Backs the application-level SMS suppression that every send
 * path now hard-checks before hitting Telnyx. STOPs from recipients land
 * here automatically; admins can also manually block / unblock from this
 * page. Agents see a read-only view of their own org's blocks under
 * /account/blocked.
 */

interface BlockedRow {
  contact_id: number;
  org_id: number;
  org_name: string | null;
  phone: string;
  opted_out_at: string | null;
  opt_in_status: string;
  opt_out_reason: string | null;
  blocked_by_user_id: number | null;
  blocked_by_name: string | null;
  lead_id: number | null;
  lead_name: string | null;
  agent_name: string | null;
}

interface Counts {
  total: number;
  by_reason: { keyword: number; manual_admin: number; other: number };
}

interface ListResponse {
  rows: BlockedRow[];
  counts: Counts;
  limit: number;
  offset: number;
}

const EMPTY_COUNTS: Counts = { total: 0, by_reason: { keyword: 0, manual_admin: 0, other: 0 } };

function formatReason(r: string | null): string {
  if (r === "keyword") return "STOP keyword";
  if (r === "manual_admin") return "Manual admin block";
  if (r === "manual_agent") return "Agent blocked";
  if (r === "manual_import") return "Marked opted-out at import";
  return "Other";
}

function formatTs(ts: string | null): string {
  if (!ts) return "-";
  try { return new Date(ts).toLocaleString(); }
  catch { return ts; }
}

export default function BlockedPhoneNumbers() {
  const [rows, setRows] = useState<BlockedRow[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("");

  const [blockOrgId, setBlockOrgId] = useState("");
  const [blockPhone, setBlockPhone] = useState("");
  const [blocking, setBlocking] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (orgFilter.trim()) params.set("org_id", orgFilter.trim());
      const res = await axios.get<ListResponse>(
        `/api/admin/blocked-numbers?${params.toString()}`,
        { withCredentials: true },
      );
      setRows(res.data.rows || []);
      setCounts(res.data.counts || EMPTY_COUNTS);
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax?.response?.data?.message || "Failed to load blocked numbers");
    } finally {
      setLoading(false);
    }
  }, [search, orgFilter]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleBlock = async () => {
    if (!blockOrgId.trim() || !blockPhone.trim()) {
      toast.error("Both org ID and phone number are required");
      return;
    }
    setBlocking(true);
    try {
      await axios.post(
        `/api/admin/blocked-numbers`,
        { org_id: Number(blockOrgId), phone: blockPhone.trim() },
        { withCredentials: true },
      );
      toast.success("Number blocked");
      setBlockPhone("");
      await fetchRows();
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax?.response?.data?.message || "Failed to block number");
    } finally {
      setBlocking(false);
    }
  };

  const handleUnblock = async (row: BlockedRow) => {
    if (!window.confirm(`Unblock ${row.phone} for org ${row.org_id}? They will be able to receive SMS again.`)) {
      return;
    }
    try {
      await axios.delete(
        `/api/admin/blocked-numbers?org_id=${row.org_id}&phone=${encodeURIComponent(row.phone)}`,
        { withCredentials: true },
      );
      toast.success("Number unblocked");
      await fetchRows();
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax?.response?.data?.message || "Failed to unblock");
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex items-center gap-3">
          <ShieldOff className="h-6 w-6 text-rose-500" />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Blocked Numbers (Admin Mode)</h1>
            <p className="text-sm text-gray-500">
              Application-level SMS suppression across every account. Numbers here are hard-blocked before any send hits Telnyx, regardless of which agent or automation triggers it.
            </p>
          </div>
        </div>

        {/* Counter pills */}
        <div className="mb-6 flex flex-wrap gap-3">
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <div className="text-xs text-gray-500">Total blocked</div>
            <div className="text-2xl font-semibold text-gray-900">{counts.total}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <div className="text-xs text-gray-500">From STOP keyword</div>
            <div className="text-2xl font-semibold text-gray-900">{counts.by_reason.keyword}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <div className="text-xs text-gray-500">Manual admin blocks</div>
            <div className="text-2xl font-semibold text-gray-900">{counts.by_reason.manual_admin}</div>
          </div>
        </div>

        {/* Manual block form */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Block a number manually</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-gray-500">Org ID</label>
              <input
                className="mt-1 block w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                value={blockOrgId}
                onChange={(e) => setBlockOrgId(e.target.value)}
                placeholder="123"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Phone (E.164)</label>
              <input
                className="mt-1 block w-56 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                value={blockPhone}
                onChange={(e) => setBlockPhone(e.target.value)}
                placeholder="+15551234567"
              />
            </div>
            <button
              type="button"
              onClick={handleBlock}
              disabled={blocking}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-rose-700 disabled:opacity-70"
            >
              {blocking && <Loader2 className="h-4 w-4 animate-spin" />}
              Block
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-gray-500">Search phone or lead name</label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                className="block w-72 rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. +1555 or Jane"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Org filter (optional)</label>
            <input
              className="mt-1 block w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              placeholder="Org ID"
            />
          </div>
          <button
            type="button"
            onClick={fetchRows}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Lead / Contact</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Org</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Blocked at</th>
                <th className="px-3 py-2">Blocked by</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No blocked numbers.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.contact_id} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2 font-mono">{r.phone}</td>
                  <td className="px-3 py-2">{r.lead_name || "-"}</td>
                  <td className="px-3 py-2">{r.agent_name || "-"}</td>
                  <td className="px-3 py-2">{r.org_name || r.org_id}</td>
                  <td className="px-3 py-2">{formatReason(r.opt_out_reason)}</td>
                  <td className="px-3 py-2 text-gray-500">{formatTs(r.opted_out_at)}</td>
                  <td className="px-3 py-2 text-gray-500">{r.blocked_by_name || (r.blocked_by_user_id ? `user ${r.blocked_by_user_id}` : "-")}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleUnblock(r)}
                      className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Unblock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
