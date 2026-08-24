import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n.jsx";

export default function LanguageMenu({ embedded = false }) {
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
        position: embedded ? "relative" : "fixed",
        top: embedded ? "auto" : 10,
        left: embedded ? "auto" : 12,
        zIndex: 5200,
        flex: "0 0 auto",
      }}
    >
      <button
        type="button"
        aria-label={open ? t("language.closeMenu") : t("language.openMenu")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        style={{
          width: embedded ? 27 : 34,
          height: embedded ? 24 : 30,
          padding: "0 0 5px",
          border: "1px solid rgba(17,24,39,0.12)",
          borderRadius: 8,
          background: "rgba(248,248,248,0.96)",
          boxShadow: "0 2px 8px rgba(15,23,42,0.10)",
          color: "#4b5563",
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: 1.5,
          cursor: "pointer",
        }}
      >
        ···
      </button>

      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: embedded ? 30 : 38,
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
        </div>
      ) : null}
    </div>
  );
}
