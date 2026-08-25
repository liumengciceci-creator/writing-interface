import {
  useEffect,
  useRef,
} from "react";

import { useI18n } from "../i18n.jsx";

export default function GenerationFailureDialog({
  open,
  count,
  isRetrying,
  onRetry,
  onClose,
}) {
  const { t } = useI18n();
  const retryButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    retryButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isRetrying) {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRetrying, onClose, open]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 5000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgba(15, 23, 42, 0.24)",
        backdropFilter: "blur(2px)",
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="generation-failure-title"
        aria-describedby="generation-failure-description"
        style={{
          width: "min(390px, calc(100vw - 48px))",
          padding: "22px 22px 20px",
          border: "1px solid rgba(218, 224, 234, 0.95)",
          borderRadius: 18,
          background: "#ffffff",
          boxShadow: "0 24px 70px rgba(15, 23, 42, 0.2)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 42,
            height: 42,
            marginBottom: 16,
            borderRadius: "50%",
            background: "#fff1f0",
            color: "#d92d20",
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          !
        </div>

        <h2
          id="generation-failure-title"
          style={{
            margin: 0,
            color: "#182230",
            fontSize: 20,
            fontWeight: 700,
            lineHeight: 1.35,
          }}
        >
          {t("generation.failureTitle")}
        </h2>

        <p
          id="generation-failure-description"
          style={{
            margin: "9px 0 20px",
            color: "#667085",
            fontSize: 14,
            lineHeight: 1.65,
          }}
        >
          {t("generation.failureMessage", { count })}
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isRetrying}
            style={{
              minWidth: 82,
              minHeight: 40,
              padding: "8px 16px",
              border: "1px solid #d0d5dd",
              borderRadius: 10,
              background: "#ffffff",
              color: "#344054",
              fontSize: 14,
              fontWeight: 600,
              cursor: isRetrying ? "default" : "pointer",
            }}
          >
            {t("generation.dismiss")}
          </button>

          <button
            ref={retryButtonRef}
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            style={{
              minWidth: 96,
              minHeight: 40,
              padding: "8px 18px",
              border: "1px solid #3448c5",
              borderRadius: 10,
              background: "#4355d6",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 700,
              cursor: isRetrying ? "default" : "pointer",
              boxShadow: "0 4px 12px rgba(67, 85, 214, 0.22)",
            }}
          >
            {t("generation.retry")}
          </button>
        </div>
      </section>
    </div>
  );
}
