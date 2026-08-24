import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n.jsx";

const INSTRUCTIONS_STORAGE_KEY = "writing-interface-block-instructions";

const FALLBACK_INSTRUCTIONS = [
  {
    id: "instruction-more-logical",
    label: "更加有逻辑性",
    instruction: "请让这段文字更加有逻辑性，强化句子之间的因果关系、论证顺序和衔接。",
    color: "#ef4444",
    fill: "#feecec",
  },
  {
    id: "instruction-more-causal",
    label: "更注重因果关系",
    instruction: "请让这段文字更注重因果关系，明确原因、过程和结果之间的联系。",
    color: "#f59e0b",
    fill: "#fff4dc",
  },
  {
    id: "instruction-emphasize-viewpoint",
    label: "更强调观点",
    instruction: "请更突出这段文字的核心观点，使立场清晰、重点明确。",
    color: "#8b5cf6",
    fill: "#f3eeff",
  },
  {
    id: "instruction-emphasize-explanation",
    label: "更强调解释",
    instruction: "请加强这段文字的解释，补充必要的说明，使含义更清楚。",
    color: "#0ea5a4",
    fill: "#e7f8f6",
  },
];

function readInstructions() {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(INSTRUCTIONS_STORAGE_KEY) || "null"
    );
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.filter((item) => item?.id && item?.label && item?.instruction);
    }
  } catch {
    // Fall back to the built-in instruction library.
  }
  return FALLBACK_INSTRUCTIONS;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export default function QuickInstructionComposer({
  anchorRect,
  blockColor = "#7c83fd",
  onClose,
  onSubmit,
}) {
  const [value, setValue] = useState("");
  const [instructions, setInstructions] = useState(readInstructions);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const { instructionLabel, instructionText, t } = useI18n();

  useEffect(() => {
    setInstructions(readInstructions());
    const frameId = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!panelRef.current?.contains(event.target)) onClose?.();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const panelPosition = useMemo(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(460, Math.max(286, viewportWidth - 24));
    const estimatedHeight = 88;
    const anchorCenterX = anchorRect
      ? (anchorRect.left + anchorRect.right) / 2
      : viewportWidth / 2;
    const left = clamp(anchorCenterX - width / 2, 12, viewportWidth - width - 12);
    const above = (anchorRect?.top ?? viewportHeight / 2) - estimatedHeight - 10;
    const top = above >= 12
      ? above
      : Math.min(viewportHeight - estimatedHeight - 12, (anchorRect?.bottom ?? 30) + 10);
    return { left, top, width };
  }, [anchorRect]);

  const submit = () => {
    const instruction = value.trim();
    if (!instruction) return;
    onSubmit?.(instruction);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t("quickInstruction.dialog")}
      style={{
        position: "fixed",
        left: panelPosition.left,
        top: panelPosition.top,
        width: panelPosition.width,
        zIndex: 5100,
        padding: "9px 11px 8px",
        border: "1px solid rgba(17,24,39,0.08)",
        borderRadius: 16,
        background: "rgba(255,255,255,0.98)",
        boxShadow: "0 10px 28px rgba(15,23,42,0.16)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={t("quickInstruction.placeholder")}
          style={{
            minWidth: 0,
            flex: 1,
            height: 32,
            padding: "0 3px",
            border: 0,
            borderBottom: `1.5px solid ${blockColor}55`,
            outline: 0,
            background: "transparent",
            color: "#1f2937",
            fontFamily: "inherit",
            fontSize: 13.5,
          }}
        />
        <button
          type="button"
          aria-label={t("quickInstruction.send")}
          title={t("quickInstruction.send")}
          disabled={!value.trim()}
          onClick={submit}
          style={{
            width: 31,
            height: 31,
            flex: "0 0 31px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            border: 0,
            borderRadius: "50%",
            background: value.trim() ? "#111111" : "#d1d5db",
            color: "#ffffff",
            cursor: value.trim() ? "pointer" : "default",
          }}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
            <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div
        aria-label={t("quickInstruction.presets")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          marginTop: 7,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {instructions.map((instruction) => {
          const label = instructionLabel(instruction);
          const text = instructionText(instruction);
          return (
            <button
              key={instruction.id}
              type="button"
              title={text}
              onClick={() => {
                setValue(text);
                inputRef.current?.focus();
              }}
              style={{
                height: 23,
                flex: "0 0 auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "0 8px 0 5px",
                border: "1px solid rgba(55,65,81,0.42)",
                borderRadius: 999,
                background: "#ffffff",
                color: "#6b7280",
                fontSize: 10,
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: instruction.color || blockColor,
                }}
              />
              {label}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
