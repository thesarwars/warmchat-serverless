import { useState, type CSSProperties } from "react";
import { Flame, X, ArrowRight } from "lucide-react";
import { NimbusHead } from "./NimbusHead";

interface Props {
  title: string;
  message?: string | null;
  urgent?: boolean;
  /** Primary action label (e.g. "Open"). Hidden when `onCta` is omitted. */
  ctaLabel?: string;
  onCta?: () => void;
  onDismiss: () => void;
}

const NIMBUS_BLUE = "#1c2330";

/**
 * In-app notification toast styled as the Nimbus companion: the mascot head
 * peeks out of the top-left, on a soft light-blue card with the same palette as
 * the AI Command Center hero. Fully self-contained (inline styles + literal
 * colors) so it renders correctly in the Sonner toast portal, which is mounted
 * outside the `.wcv2` design subtree (where the `--accent`/`--line` tokens and
 * `.wc-*` rules are not available).
 */
export function NimbusToast({ title, message, urgent, ctaLabel = "Open", onCta, onDismiss }: Props) {
  const [hoverGo, setHoverGo] = useState(false);
  const [hoverDismiss, setHoverDismiss] = useState(false);

  const ghostBtn: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    fontWeight: 700,
    color: "#4a647a",
    background: hoverDismiss ? "#f1f8fd" : "#ffffff",
    border: "1px solid #cfe2ef",
    borderRadius: 10,
    padding: "8px 14px",
    cursor: "pointer",
  };
  const goBtn: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    fontSize: 12.5,
    fontWeight: 800,
    color: "#ffffff",
    background: hoverGo ? "linear-gradient(180deg,#FB8332,#EC5F12)" : "linear-gradient(180deg,#FB8A3B,#F26A1F)",
    border: "none",
    borderRadius: 10,
    padding: "8px 16px",
    cursor: "pointer",
    boxShadow: "0 8px 18px -8px rgba(242,106,31,.6)",
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        marginTop: 30,
        background: "linear-gradient(150deg,#e7f5fe 0%,#f5fbff 58%,#ffffff 100%)",
        border: "1px solid #c8e4f6",
        borderRadius: 18,
        boxShadow: "0 20px 44px -20px rgba(40,90,130,.5)",
        padding: "46px 16px 14px",
      }}
    >
      {/* Head peeks out above the card. */}
      <span style={{ position: "absolute", top: -30, left: 16 }}>
        <NimbusHead size={74} />
      </span>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          position: "absolute",
          top: 14,
          right: 12,
            display: "inline-flex",
            color: "#7e98ab",
            background: "none",
            border: "none",
            borderRadius: 8,
            padding: 4,
            cursor: "pointer",
          }}
        >
          <X width={15} height={15} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: NIMBUS_BLUE, letterSpacing: "-.01em" }}>Nimbus</span>
          {urgent && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: ".08em",
                color: "#E0641C",
                background: "#FFEDE0",
                border: "1px solid #FBD9C2",
                borderRadius: 99,
                padding: "2px 8px",
              }}
            >
              <Flame width={11} height={11} />
              Urgent
            </span>
          )}
        </div>

        <div style={{ fontSize: 14.5, fontWeight: 700, color: "#16314a", lineHeight: 1.35 }}>{title}</div>
        {message && (
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#566e80", lineHeight: 1.5 }}>{message}</p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 13 }}>
          <button
            type="button"
            onClick={onDismiss}
            style={ghostBtn}
            onMouseEnter={() => setHoverDismiss(true)}
            onMouseLeave={() => setHoverDismiss(false)}
          >
            Dismiss
          </button>
          {onCta && (
            <button
              type="button"
              onClick={onCta}
              style={goBtn}
              onMouseEnter={() => setHoverGo(true)}
              onMouseLeave={() => setHoverGo(false)}
            >
              {ctaLabel}
              <ArrowRight width={14} height={14} />
            </button>
          )}
        </div>
    </div>
  );
}
