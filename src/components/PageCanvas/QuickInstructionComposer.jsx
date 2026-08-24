import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n.jsx";

const INSTRUCTIONS_STORAGE_KEY = "writing-interface-block-instructions";
const INSTRUCTIONS_UPDATED_EVENT = "writing-interface-instructions-updated";

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

function saveInstructions(instructions) {
  try {
    window.localStorage.setItem(
      INSTRUCTIONS_STORAGE_KEY,
      JSON.stringify(instructions)
    );
    window.dispatchEvent(
      new CustomEvent(INSTRUCTIONS_UPDATED_EVENT, { detail: instructions })
    );
  } catch (error) {
    console.error("保存快速修改指令失败：", error);
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function createInstructionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `instruction-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function QuickInstructionComposer({
  anchorRect,
  onClose,
  onSubmit,
}) {
  const [value, setValue] = useState("");
  const [instructions, setInstructions] = useState(readInstructions);
  const [selectedInstructionId, setSelectedInstructionId] = useState(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customText, setCustomText] = useState("");
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const { instructionLabel, instructionText, t } = useI18n();

  const initialGeometry = useMemo(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(430, Math.max(280, viewportWidth - 24));
    const estimatedHeight = 118;
    const moduleLeft = anchorRect?.left ?? viewportWidth / 2 - width / 2;
    const moduleRight = anchorRect?.right ?? moduleLeft + width;
    const moduleTop = anchorRect?.top ?? viewportHeight / 2;
    const moduleBottom = anchorRect?.bottom ?? moduleTop;
    const preferredLeft = moduleRight - width;
    const belowTop = moduleBottom + 6;
    const preferredTop =
      belowTop + estimatedHeight <= viewportHeight - 10
        ? belowTop
        : moduleTop - estimatedHeight - 6;

    return {
      left: clamp(preferredLeft, 12, viewportWidth - width - 12),
      top: clamp(preferredTop, 12, viewportHeight - estimatedHeight - 12),
      width,
    };
  }, [anchorRect]);

  const [position, setPosition] = useState(() => ({
    left: initialGeometry.left,
    top: initialGeometry.top,
  }));

  useEffect(() => {
    const syncInstructions = (event) => {
      const next = Array.isArray(event?.detail) ? event.detail : readInstructions();
      setInstructions(next);
    };
    window.addEventListener(INSTRUCTIONS_UPDATED_EVENT, syncInstructions);
    return () => window.removeEventListener(INSTRUCTIONS_UPDATED_EVENT, syncInstructions);
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

  useEffect(() => {
    const handlePointerMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      const panelHeight = panelRef.current?.offsetHeight || 118;
      setPosition({
        left: clamp(
          event.clientX - drag.offsetX,
          12,
          window.innerWidth - initialGeometry.width - 12
        ),
        top: clamp(
          event.clientY - drag.offsetY,
          12,
          window.innerHeight - panelHeight - 12
        ),
      });
    };
    const stopDragging = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [initialGeometry.width]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const nextLeft = clamp(rect.left, 12, window.innerWidth - rect.width - 12);
    const nextTop = clamp(rect.top, 12, window.innerHeight - rect.height - 12);
    if (nextLeft !== rect.left || nextTop !== rect.top) {
      setPosition({ left: nextLeft, top: nextTop });
    }
  }, [instructions.length, showCustomForm]);

  const beginPanelDrag = (event) => {
    if (event.button !== 0) return;
    if (
      event.target.closest(
        "input, textarea, button, select, [contenteditable='true'], [data-no-dialog-drag='true']"
      )
    ) {
      return;
    }
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    dragRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
  };

  const submit = () => {
    const instruction = value.trim();
    if (!instruction) return;
    const selected = instructions.find(
      (item) => item.id === selectedInstructionId
    );
    onSubmit?.(instruction, {
      id: selected?.id || `quick-instruction-${Date.now()}`,
      label: selected ? instructionLabel(selected) : instruction,
    });
  };

  const addCustomInstruction = () => {
    const instruction = customText.trim();
    if (!instruction) return;
    const label =
      Array.from(instruction).length > 14
        ? `${Array.from(instruction).slice(0, 14).join("")}…`
        : instruction;
    const nextInstruction = {
      id: createInstructionId(),
      label,
      instruction,
      color: "#ef4444",
      fill: "#feecec",
    };
    const next = [...instructions, nextInstruction];
    setInstructions(next);
    saveInstructions(next);
    setShowCustomForm(false);
    setCustomText("");
    setSelectedInstructionId(nextInstruction.id);
    setValue(instruction);
    inputRef.current?.focus();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t("quickInstruction.dialog")}
      onPointerDown={beginPanelDrag}
      style={{
        position: "fixed",
        left: position.left,
        top: position.top,
        width: initialGeometry.width,
        zIndex: 5100,
        padding: "9px 11px 9px",
        border: "1px solid rgba(17,24,39,0.08)",
        borderRadius: 16,
        background: "rgba(255,255,255,0.98)",
        boxShadow: "0 10px 28px rgba(15,23,42,0.16)",
        boxSizing: "border-box",
        cursor: "move",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setSelectedInstructionId(null);
          }}
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
            outline: 0,
            background: "transparent",
            color: "#1f2937",
            fontFamily: "inherit",
            fontSize: 13.5,
            cursor: "text",
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
          flexWrap: "wrap",
          alignItems: "center",
          gap: 5,
          marginTop: 7,
        }}
      >
        {instructions.map((instruction) => {
          const label = instructionLabel(instruction);
          const text = instructionText(instruction);
          const selected = selectedInstructionId === instruction.id;
          return (
            <button
              key={instruction.id}
              type="button"
              title={text}
              onClick={() => {
                setSelectedInstructionId(instruction.id);
                setValue(text);
                inputRef.current?.focus();
              }}
              style={{
                height: 23,
                flex: "0 0 auto",
                display: "inline-flex",
                alignItems: "center",
                padding: "0 9px",
                border: `1px solid ${selected ? "#6b7280" : "rgba(55,65,81,0.38)"}`,
                borderRadius: 999,
                background: selected ? "#f1f3f5" : "#ffffff",
                color: "#5f6670",
                fontSize: 10,
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}

        <button
          type="button"
          aria-label={t("instruction.add")}
          title={t("instruction.add")}
          onClick={() => setShowCustomForm((current) => !current)}
          style={{
            width: 23,
            height: 23,
            flex: "0 0 23px",
            padding: 0,
            border: "1px solid rgba(55,65,81,0.38)",
            borderRadius: "50%",
            background: showCustomForm ? "#f3f4f6" : "#fff",
            color: "#4b5563",
            fontSize: 17,
            lineHeight: "21px",
            cursor: "pointer",
          }}
        >
          +
        </button>
      </div>

      {showCustomForm ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: 6,
            alignItems: "center",
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid #eef0f3",
          }}
        >
          <input
            value={customText}
            placeholder={t("quickInstruction.customPlaceholder")}
            onChange={(event) => setCustomText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustomInstruction();
              }
            }}
            style={{
              minWidth: 0,
              height: 29,
              padding: "0 8px",
              border: "1px solid #d7dbe2",
              borderRadius: 7,
              outline: 0,
              fontFamily: "inherit",
              fontSize: 11,
            }}
          />
          <button
            type="button"
            disabled={!customText.trim()}
            onClick={addCustomInstruction}
            style={{
              width: 29,
              height: 29,
              padding: 0,
              border: 0,
              borderRadius: "50%",
              background: customText.trim() ? "#111827" : "#d1d5db",
              color: "#fff",
              cursor: customText.trim() ? "pointer" : "default",
            }}
          >
            ✓
          </button>
        </div>
      ) : null}
    </div>,
    document.body
  );
}
