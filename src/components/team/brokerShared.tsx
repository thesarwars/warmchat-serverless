import React from "react";
import type { LucideIcon } from "lucide-react";

interface AvatarProps {
  initials: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}
export function Avatar({ initials, size = 32, className = "", style }: AvatarProps) {
  return (
    <div
      className={`b-avatar ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)), ...style }}
    >
      {initials}
    </div>
  );
}

interface BrokerPageProps {
  children: React.ReactNode;
  className?: string;
}
export function BrokerPage({ children, className = "" }: BrokerPageProps) {
  return <div className={`broker ${className}`} style={{ padding: "8px 4px 32px" }}>{children}</div>;
}

interface BrokerHeaderProps {
  title: string;
  subtitle?: string;
  primaryAction?: { label: string; icon?: LucideIcon; onClick?: () => void };
  ghostActions?: { label: string; icon?: LucideIcon; onClick?: () => void; accent?: boolean }[];
}
export function BrokerHeader({ title, subtitle, primaryAction, ghostActions }: BrokerHeaderProps) {
  const PrimaryIcon = primaryAction?.icon;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 18, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ margin: "0 0 3px", fontSize: 24, lineHeight: 1.2, fontWeight: 600, color: "var(--b-ink)", letterSpacing: "-.01em" }}>
          {title}
        </h1>
        {subtitle && <div style={{ fontSize: 13.5, color: "var(--b-muted)" }}>{subtitle}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {ghostActions?.map((a, i) => {
          const I = a.icon;
          return (
            <button key={i} type="button" onClick={a.onClick} className={`b-btn-ghost ${a.accent ? "b-btn-accent" : ""}`}>
              {I && <I size={14} />}
              {a.label}
            </button>
          );
        })}
        {primaryAction && (
          <button type="button" onClick={primaryAction.onClick} className="b-btn-primary">
            {PrimaryIcon && <PrimaryIcon size={14} />}
            {primaryAction.label}
          </button>
        )}
      </div>
    </div>
  );
}

export interface KpiItem {
  label: string;
  value: React.ReactNode;
  delta?: string;
  trend?: "up" | "down" | "neutral";
  icon: LucideIcon;
}
export function KpiStrip({ items, columns = 5 }: { items: KpiItem[]; columns?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: 10,
        marginBottom: 16,
      }}
      className="b-kpi-strip"
    >
      {items.map((k, i) => {
        const Icon = k.icon;
        return (
          <div key={i} className="b-kpi">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="b-kpi-ico"><Icon size={18} /></div>
              <div className="b-kpi-label">{k.label}</div>
            </div>
            <div className="b-kpi-val">{k.value}</div>
            {k.delta && (
              <div className={`b-kpi-delta ${k.trend === "down" ? "down" : ""}`}>
                <b>{k.delta}</b>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
