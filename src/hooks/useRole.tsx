// src/hooks/useRole.js
// Mirrors sql/100.seed.sql role insertion order:
//   ('Owner'), ('Manager'), ('Representative'), ('Guest')
const ROLE_ID_MAP: Record<string, string> = {
  "1": "Owner",
  "2": "Manager",
  "3": "Representative",
  "4": "Guest",
};

const canonicalizeRole = (value?: string | null) => {
  if (!value) return "";
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return "";
  if (cleaned == "admin" || cleaned == "owner") return "Owner";
  if (cleaned == "manager") return "Manager";
  if (cleaned == "representative" || cleaned == "rep") return "Representative";
  if (cleaned == "guest") return "Guest";
  return value.trim();
};

export const useRole = () => {
  const roleIdRaw = localStorage.getItem("role_id");
  const roleId = roleIdRaw ? parseInt(roleIdRaw, 10) : NaN;
  const roleNameRaw = localStorage.getItem("role_name");
  const roleNameFromId = roleIdRaw ? ROLE_ID_MAP[roleIdRaw] : "";
  const roleName = canonicalizeRole(roleNameRaw || roleNameFromId);
  const roleKey = roleName ? roleName.toLowerCase() : "";

  const isAdmin = roleKey == "owner";
  const isManager = roleKey == "manager";
  const isAgent = roleKey == "representative";
  const isGuest = roleKey == "guest";

  return { roleId, roleName, roleKey, isAdmin, isManager, isAgent, isGuest };
};
