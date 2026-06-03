import type { CSSProperties, ReactElement, ReactNode, SVGProps } from "react";

/**
 * Visual "Add WarmChats to your Home Screen" walkthrough for the iOS install
 * modal. Four phone mockups, each with a numbered caption and a red call-out
 * box around the tap target for that step:
 *   1. Tap the menu (...) button
 *   2. Tap Share
 *   3. Tap Add to Home Screen
 *   4. Tap Add
 *
 * Pure inline-styled markup so it renders identically regardless of the surrounding
 * Tailwind context; the phone shells flex-wrap so the strip stacks on narrow
 * viewports and lines up four-across on wide ones.
 */

const C = {
  bg: "#FBF7F1",
  surf: "#FFFFFF",
  ink: "#14110E",
  ink2: "#3D352E",
  ink3: "#7A6E61",
  line: "#ECE3D2",
  accent: "#FF6A2C",
  accent2: "#E64E0F",
  accentSoft: "#FFEADC",
  gold: "#B68A3E",
  danger: "#FF4747",
};

type Icon = (p: SVGProps<SVGSVGElement>) => ReactElement;

const I: Record<string, Icon> = {
  menu: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  bell: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  cal: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  star: (p) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><polygon points="12 2 15 8.5 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 9 8.5 12 2"/></svg>,
  trend: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>,
  back: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="15 18 9 12 15 6"/></svg>,
  refresh: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  tabs: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>,
  more: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>,
  share: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v13"/><polyline points="7 8 12 3 17 8"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>,
  bookmark: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,
  bookplus: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  plus: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  privtab: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="9" cy="13" r="2.5"/><circle cx="15" cy="13" r="2.5"/><path d="M5 13a4 4 0 0 1 4-4M19 13a4 4 0 0 0-4-4"/></svg>,
  copy: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  glasses: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="6" cy="14" r="4"/><circle cx="18" cy="14" r="4"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
  bookopen: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  find: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  pencil: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  print: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  close: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

// WarmChats home-screen icon tile (the real apple-touch-icon iOS would pin).
const WCIcon = ({ size = 44, radius }: { size?: number; radius?: number }) => (
  <div style={{ width: size, height: size, borderRadius: radius ?? size * 0.235, background: "#FBFAFB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 1px 2px rgba(0,0,0,.08), inset 0 0 0 1px rgba(0,0,0,.06)", position: "relative", overflow: "hidden" }}>
    <img src="/apple-touch-icon.png" alt="WarmChats" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
  </div>
);

const StatusBar = ({ dark = false }: { dark?: boolean }) => {
  const fg = dark ? "#fff" : "#14110E";
  const dim = dark ? "rgba(255,255,255,.55)" : "rgba(20,17,14,.45)";
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 54, padding: "16px 32px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", color: fg, fontWeight: 700, fontSize: 15, zIndex: 5, pointerEvents: "none" }}>
      <div style={{ fontSize: 15, fontWeight: 600 }}>01:54</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={{ position: "relative", width: 26, height: 13, border: `1.5px solid ${dim}`, borderRadius: 4, padding: 1.5 }}>
          <div style={{ width: "100%", height: "100%", background: "#3CE163", borderRadius: 1.5 }} />
        </div>
        <div style={{ width: 2, height: 6, background: dim, borderRadius: 1, marginLeft: -2 }} />
      </div>
    </div>
  );
};

// Red call-out box overlay around the tap target for a step.
type HighlightProps = {
  top?: CSSProperties["top"];
  left?: CSSProperties["left"];
  right?: CSSProperties["right"];
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  glow?: boolean;
};
const Highlight = ({ top, left, right, width, height, glow = true }: HighlightProps) => (
  <div style={{ position: "absolute", top, left, right, width, height, border: `3px solid ${C.danger}`, borderRadius: 8, boxShadow: glow ? "0 0 18px rgba(255,71,71,.55), 0 0 6px rgba(255,71,71,.7) inset" : "none", zIndex: 10, pointerEvents: "none" }} />
);

const BrowserTop = () => (
  <div style={{ padding: "8px 16px 10px", display: "flex", alignItems: "center", gap: 14, background: "#fff" }}>
    <I.menu style={{ width: 20, height: 20, color: C.ink }} />
    <div style={{ flex: 1 }} />
    <I.bell style={{ width: 18, height: 18, color: C.ink2 }} />
    <div style={{ width: 30, height: 30, borderRadius: 99, background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>J</div>
  </div>
);

const BrowserBottom = ({ domain = "warmchats.com" }: { domain?: string }) => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 14px 18px", display: "flex", alignItems: "center", gap: 12, background: "#fff", borderTop: "1px solid #E5E5E7", zIndex: 8 }}>
    <I.back style={{ width: 22, height: 22, color: "#B1A595" }} />
    <I.tabs style={{ width: 20, height: 20, color: C.ink2 }} />
    <div style={{ flex: 1, fontSize: 14, color: C.ink2, textAlign: "center", fontWeight: 500 }}>{domain}</div>
    <I.refresh style={{ width: 18, height: 18, color: C.ink2 }} />
    <div style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <I.more style={{ width: 22, height: 22, color: C.ink }} />
    </div>
  </div>
);

// The WarmChats dashboard content shown behind the browser chrome.
const PageContent = () => (
  <div style={{ flex: 1, overflow: "hidden", background: C.bg, padding: "2px 14px 0", display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: C.surf, border: `1px solid ${C.line}`, borderRadius: 10, alignSelf: "flex-start" }}>
      <I.cal style={{ width: 13, height: 13, color: C.accent }} />
      <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>May 27, 2026</span>
    </div>

    <div style={{ padding: "12px 14px", borderRadius: 14, background: C.accentSoft, border: `1px solid ${C.gold}`, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <I.star style={{ width: 11, height: 11, color: C.accent }} />
        <div style={{ fontSize: 10, fontWeight: 800, color: C.accent, letterSpacing: 0.6, textTransform: "uppercase" }}>AI Insight</div>
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.4, color: C.ink }}>
        <b>1 lead</b> waiting on a reply right now - best time to engage is within 15 min.
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginTop: 2 }}>Review them</div>
    </div>

    <div style={{ padding: "14px 16px", borderRadius: 14, background: `linear-gradient(135deg, ${C.accent} 0%, ${C.accent2} 100%)`, color: "#fff", position: "relative", overflow: "hidden", minHeight: 120 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, position: "relative" }}>
        <I.trend style={{ width: 13, height: 13, color: "#fff" }} />
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase" }}>Pipeline Value</div>
      </div>
      <div style={{ fontSize: 32, fontWeight: 600, color: "#fff", letterSpacing: -0.6, lineHeight: 1, position: "relative" }}>$10K</div>
      <svg viewBox="0 0 220 60" preserveAspectRatio="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: 60, opacity: 0.9 }}>
        <path d="M0 50 C 20 50, 30 38, 50 38 S 80 26, 100 24 S 130 22, 150 16 S 180 8, 220 4" stroke="rgba(255,255,255,.85)" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  </div>
);

// Dimmed background of other browser tabs, sits behind the share sheet.
const TabsBehind = () => (
  <div style={{ position: "absolute", inset: 0, background: "#1a1a1f", overflow: "hidden" }}>
    <div style={{ position: "absolute", top: "18%", left: "6%", width: "40%", height: "42%", borderRadius: 18, background: "#2a2a30", opacity: 0.6, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#fff", opacity: 0.7 }}>ClearMoney</div>
    </div>
    <div style={{ position: "absolute", top: "18%", left: "54%", width: "40%", height: "42%", borderRadius: 18, background: "#2a2a30", opacity: 0.6, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#fff", opacity: 0.7 }}>Coach Sammie</div>
    </div>
    <div style={{ position: "absolute", top: "62%", left: "30%", width: "40%", height: "30%", borderRadius: 18, background: "#2a2a30", opacity: 0.5, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#fff", opacity: 0.7 }}>The Companion App</div>
    </div>
  </div>
);

const CtxItem = ({ icon: IconCmp, label }: { icon: Icon; label: string }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: "#fff", color: C.ink, fontSize: 13.5, fontWeight: 500 }}>
    <IconCmp style={{ width: 16, height: 16, color: C.ink2 }} />
    <span style={{ flex: 1 }}>{label}</span>
  </div>
);
const CtxDivider = () => <div style={{ height: 1, background: "#EFEFEF", margin: "0 12px" }} />;

const AppIcon = ({ name, color, children }: { name: string; color: string; children: ReactNode }) => (
  <div style={{ flexShrink: 0, width: 74, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
    <div style={{ width: 54, height: 54, borderRadius: 13, background: color, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </div>
    <div style={{ fontSize: 10.5, color: C.ink, fontWeight: 500, textAlign: "center" }}>{name}</div>
  </div>
);
const ActionTile = ({ icon: IconCmp, label }: { icon: Icon; label: string }) => (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
    <div style={{ width: 54, height: 54, borderRadius: 13, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: C.ink }}>
      <IconCmp style={{ width: 22, height: 22 }} />
    </div>
    <div style={{ fontSize: 9.5, color: C.ink2, fontWeight: 500, textAlign: "center", lineHeight: 1.15, marginTop: 2 }}>{label}</div>
  </div>
);
const ListRow = ({ icon: IconCmp, label, last }: { icon: Icon; label: string; last?: boolean }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 14px", borderBottom: last ? "none" : "1px solid #F0EBE3", color: C.ink, fontSize: 14, fontWeight: 500, background: "#fff" }}>
    <IconCmp style={{ width: 18, height: 18, color: C.ink2 }} />
    <span>{label}</span>
  </div>
);

// Phone shell - simple device frame with island + home indicator.
const PhoneShell = ({ children, bg = "#fff" }: { children: ReactNode; bg?: string }) => (
  <div style={{ width: 320, height: 678, borderRadius: 44, overflow: "hidden", position: "relative", background: bg, boxShadow: "0 24px 50px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.1)", fontFamily: "-apple-system, system-ui, sans-serif", flexShrink: 0 }}>
    <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", width: 102, height: 30, borderRadius: 22, background: "#000", zIndex: 50 }} />
    {children}
    <div style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", width: 112, height: 4, borderRadius: 99, background: "rgba(0,0,0,.25)", zIndex: 60, pointerEvents: "none" }} />
  </div>
);

// PHONE 1 - Tap the "..." menu button
const Phone1 = () => (
  <div style={{ position: "relative", width: "100%", height: "100%", background: C.surf, display: "flex", flexDirection: "column" }}>
    <StatusBar />
    <div style={{ height: 54, flexShrink: 0 }} />
    <BrowserTop />
    <PageContent />
    <BrowserBottom />
    <Highlight top="calc(100% - 50px)" left="calc(100% - 44px)" width={36} height={36} />
  </div>
);

// PHONE 2 - Context menu over "..." with Share highlighted
const Phone2 = () => (
  <div style={{ position: "relative", width: "100%", height: "100%", background: C.surf, display: "flex", flexDirection: "column" }}>
    <StatusBar />
    <div style={{ height: 54, flexShrink: 0 }} />
    <BrowserTop />
    <PageContent />
    <BrowserBottom />

    <div style={{ position: "absolute", right: 14, bottom: 80, width: 210, background: "#fff", borderRadius: 16, boxShadow: "0 18px 40px rgba(0,0,0,.25), 0 0 0 1px rgba(0,0,0,.06)", overflow: "hidden", zIndex: 9 }}>
      <CtxItem icon={I.share} label="Share" />
      <CtxItem icon={I.star} label="Add to Favourites" />
      <CtxItem icon={I.bookplus} label="Add Bookmark to..." />
      <CtxDivider />
      <CtxItem icon={I.plus} label="New Tab" />
      <CtxItem icon={I.privtab} label="New Private Tab" />
      <CtxDivider />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", padding: "10px 4px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: C.ink }}>
          <I.bookopen style={{ width: 18, height: 18 }} />
          <span style={{ fontSize: 10.5, fontWeight: 500 }}>Bookmarks</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: C.ink }}>
          <I.tabs style={{ width: 18, height: 18 }} />
          <span style={{ fontSize: 10.5, fontWeight: 500 }}>All Tabs</span>
        </div>
      </div>
    </div>

    <Highlight top="calc(100% - 348px)" left="calc(100% - 221px)" width={202} height={40} />
  </div>
);

// PHONE 3 - iOS Share Sheet with "Add to Home Screen" highlighted
const Phone3 = () => (
  <div style={{ position: "relative", width: "100%", height: "100%", background: "#0d0d10", display: "flex", flexDirection: "column" }}>
    <StatusBar dark />
    <TabsBehind />

    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 2 }} />

    <div style={{ position: "absolute", left: 8, right: 8, top: 74, bottom: 8, background: "#F3EFE8", borderRadius: 22, zIndex: 3, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 18px 14px", display: "flex", alignItems: "flex-start", gap: 14 }}>
        <WCIcon size={44} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>WarmChats</div>
          <div style={{ fontSize: 12.5, color: C.ink3, marginTop: 2 }}>Options</div>
        </div>
        <div style={{ width: 30, height: 30, borderRadius: 99, background: "rgba(0,0,0,.06)", display: "flex", alignItems: "center", justifyContent: "center", color: C.ink2 }}>
          <I.close style={{ width: 15, height: 15 }} />
        </div>
      </div>

      <div style={{ padding: "4px 12px 14px", display: "flex", gap: 6, overflowX: "auto" }}>
        <AppIcon name="Freeform" color="#2a2a2a">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF8A3D" strokeWidth="2" strokeLinecap="round"><path d="M4 18 C 8 6, 14 22, 20 8" /><circle cx="4" cy="18" r="2" fill="#FF8A3D" stroke="none" /><circle cx="20" cy="8" r="2" fill="#FF8A3D" stroke="none" /></svg>
        </AppIcon>
        <AppIcon name="More" color="#E7E2D5">
          <I.more style={{ width: 18, height: 18, color: C.ink2 }} />
        </AppIcon>
      </div>

      <div style={{ padding: "12px 16px 8px", display: "flex", gap: 14 }}>
        <ActionTile icon={I.copy} label="Copy" />
        <ActionTile icon={I.star} label="Add to Favourites" />
        <ActionTile icon={I.glasses} label="Add to Reading List" />
        <ActionTile icon={I.bookmark} label="Add Bookmark to..." />
      </div>

      <div style={{ margin: "10px 14px 14px", background: "#fff", borderRadius: 14, overflow: "hidden", flex: 1, overflowY: "auto" }}>
        <ListRow icon={I.star} label="Add to Favourites" />
        <ListRow icon={I.pencil} label="Add to Quick Note" />
        <ListRow icon={I.find} label="Find on Page" />
        <ListRow icon={I.plus} label="Add to Home Screen" />
        <ListRow icon={I.pencil} label="Markup" />
        <ListRow icon={I.print} label="Print" last />
      </div>
    </div>

    <Highlight top="calc(50% + 175px)" left={28} width="calc(100% - 56px)" height={48} />
  </div>
);

// PHONE 4 - "Add to Home Screen" preview with "Add" highlighted
const Phone4 = () => (
  <div style={{ position: "relative", width: "100%", height: "100%", background: "#F2EEE6", display: "flex", flexDirection: "column" }}>
    <StatusBar />
    <div style={{ height: 54, flexShrink: 0 }} />

    <div style={{ position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)", width: 36, height: 4, background: "rgba(0,0,0,.18)", borderRadius: 99, zIndex: 6 }} />

    <div style={{ padding: "16px 16px 18px", display: "flex", alignItems: "center", gap: 8, background: "#F2EEE6" }}>
      <div style={{ width: 32, height: 32, borderRadius: 99, background: "rgba(0,0,0,.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <I.close style={{ width: 14, height: 14, color: C.ink }} />
      </div>
      <div style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: 700, color: C.ink }}>Add to Home Screen</div>
      <button type="button" style={{ padding: "6px 16px", borderRadius: 99, background: "#9CC8FF", color: "#1668DC", fontSize: 14, fontWeight: 700, border: "none", fontFamily: "inherit" }}>Add</button>
    </div>

    <div style={{ margin: "2px 14px", padding: "14px 16px", background: "#fff", borderRadius: 14, display: "flex", alignItems: "center", gap: 14 }}>
      <WCIcon size={48} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>WarmChats</div>
      </div>
      <div style={{ width: 20, height: 20, borderRadius: 99, background: "rgba(0,0,0,.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
        <I.close style={{ width: 10, height: 10 }} />
      </div>
    </div>

    <div style={{ margin: "16px 14px 6px", padding: "14px 16px", background: "#fff", borderRadius: 14, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, fontSize: 14.5, color: C.ink, fontWeight: 500 }}>Open as Web App</div>
      <div style={{ width: 48, height: 28, borderRadius: 99, background: "#34C759", position: "relative" }}>
        <div style={{ position: "absolute", top: 2, right: 2, width: 24, height: 24, borderRadius: 99, background: "#fff", boxShadow: "0 2px 4px rgba(0,0,0,.15)" }} />
      </div>
    </div>

    <div style={{ padding: "8px 18px 0", fontSize: 12.5, color: C.ink3, lineHeight: 1.5 }}>
      An icon will be added to your Home Screen so you can quickly access this website.
    </div>

    <Highlight top={65} right={10} width={71} height={43} />
  </div>
);

const StepCol = ({ n, caption, children }: { n: string; caption: ReactNode; children: ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 99, background: C.ink, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>{n}</div>
      <div style={{ fontSize: 14, color: C.ink2, fontWeight: 500, lineHeight: 1.3, maxWidth: 200 }}>{caption}</div>
    </div>
    {children}
  </div>
);

export function IosInstallGuide() {
  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center" }}>
      <StepCol n="1" caption={<>Tap the <b>menu</b> button.</>}>
        <PhoneShell><Phone1 /></PhoneShell>
      </StepCol>
      <StepCol n="2" caption={<>Tap <b>Share</b>.</>}>
        <PhoneShell><Phone2 /></PhoneShell>
      </StepCol>
      <StepCol n="3" caption={<>Tap <b>Add to Home Screen</b>.</>}>
        <PhoneShell bg="#0d0d10"><Phone3 /></PhoneShell>
      </StepCol>
      <StepCol n="4" caption={<>Tap <b>Add</b>. You're done.</>}>
        <PhoneShell bg="#F2EEE6"><Phone4 /></PhoneShell>
      </StepCol>
    </div>
  );
}
