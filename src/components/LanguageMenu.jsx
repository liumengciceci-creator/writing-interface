import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n.jsx";

export default function LanguageMenu({
  researchSession = null,
  onFinishResearchSession,
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const { isEnglish, t, toggleLanguage } = useI18n();

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: 5,
        left: 18,
        zIndex: 5200,
      }}
    >
      <button
        type="button"
        aria-label={open ? t("language.closeMenu") : t("language.openMenu")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        style={{
          width: 28,
          height: 24,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "flex-start",
          padding: 0,
          border: 0,
          borderRadius: 6,
          background: "transparent",
          boxShadow: "none",
          color: "#111827",
          cursor: "pointer",
        }}
      >
        <svg
          aria-hidden="true"
          width="24"
          height="12"
          viewBox="0 0 24 12"
          style={{ display: "block" }}
        >
          <circle cx="4" cy="6" r="2.15" fill="currentColor" />
          <circle cx="12" cy="6" r="2.15" fill="currentColor" />
          <circle cx="20" cy="6" r="2.15" fill="currentColor" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: 30,
            left: 0,
            width: 174,
            padding: 6,
            border: "1px solid rgba(17,24,39,0.10)",
            borderRadius: 10,
            background: "rgba(255,255,255,0.98)",
            boxShadow: "0 10px 28px rgba(15,23,42,0.14)",
            boxSizing: "border-box",
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              toggleLanguage();
              setOpen(false);
            }}
            style={{
              width: "100%",
              minHeight: 34,
              padding: "7px 10px",
              border: 0,
              borderRadius: 7,
              background: "#f5f7fb",
              color: "#374151",
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.45,
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            {isEnglish
              ? t("language.switchToChinese")
              : t("language.switchToEnglish")}
          </button>

          {researchSession?.enabled ? (
            <>
              <div
                style={{
                  margin: "6px 4px 4px",
                  padding: "7px 7px 5px",
                  borderTop: "1px solid rgba(17,24,39,0.08)",
                  color: "#6b7280",
                  fontSize: 11,
                  lineHeight: 1.45,
                }}
              >
                {t("research.recording")} · {researchSession.participantId}
              </div>
              <button
                type="button"
                role="menuitem"
                disabled={researchSession.ended}
                onClick={async () => {
                  await onFinishResearchSession?.();
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  minHeight: 34,
                  padding: "7px 10px",
                  border: 0,
                  borderRadius: 7,
                  background: researchSession.ended ? "#f3f4f6" : "#eef4ff",
                  color: researchSession.ended ? "#9ca3af" : "#3659a8",
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1.45,
                  textAlign: "left",
                  cursor: researchSession.ended ? "default" : "pointer",
                }}
              >
                {researchSession.ended
                  ? t("research.ended")
                  : t("research.finishAndExport")}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
