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
const INSTRUCTIONS_DEFAULT_VERSION_KEY =
  "writing-interface-block-instructions-default-version";
const CURRENT_DEFAULT_VERSION = "2";

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
    if (Array.isArray(parsed)) {
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
      INSTRUCTIONS_DEFAULT_VERSION_KEY,
      CURRENT_DEFAULT_VERSION
    );
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
  anchorElement,
  onClose,
  onSubmit,
}) {
  const [value, setValue] = useState("");
  const [instructions, setInstructions] = useState(readInstructions);
  const [selectedInstructionId, setSelectedInstructionId] = useState(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customText, setCustomText] = useState("");
  const [editingInstructionId, setEditingInstructionId] = useState(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const lastAnchorRectRef = useRef(anchorRect || null);
  const { instructionLabel, instructionText, t } = useI18n();

  const initialGeometry = useMemo(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(480, Math.max(300, viewportWidth - 24));
    const estimatedHeight = 134;
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
    const currentRect = anchorElement?.isConnected
      ? anchorElement.getBoundingClientRect()
      : anchorRect;
    if (currentRect) lastAnchorRectRef.current = currentRect;
  }, [anchorElement, anchorRect]);

  useEffect(() => {
    if (!anchorElement) return undefined;
    let frameId = 0;

    const syncWithAnchor = () => {
      frameId = 0;
      if (!anchorElement.isConnected) return;
      const nextRect = anchorElement.getBoundingClientRect();
      const previousRect = lastAnchorRectRef.current;
      lastAnchorRectRef.current = nextRect;
      if (!previousRect || dragRef.current) return;

      // 只响应模块自身换行带来的高度变化。
      // 文本逐字增长、模块横向伸长、画布滚动或其他模块引起的位置变化，
      // 都不应拖着对话框移动。
      const deltaHeight = nextRect.height - previousRect.height;
      if (Math.abs(deltaHeight) < 0.5) return;

      setPosition((current) => {
        const panelHeight = panelRef.current?.offsetHeight || 118;
        return {
          left: current.left,
          top: clamp(
            current.top + deltaHeight,
            12,
            window.innerHeight - panelHeight - 12
          ),
        };
      });
    };

    const requestSync = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(syncWithAnchor);
    };

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(requestSync)
      : null;
    const mutationObserver = typeof MutationObserver !== "undefined"
      ? new MutationObserver(requestSync)
      : null;

    resizeObserver?.observe(anchorElement);
    mutationObserver?.observe(anchorElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    window.addEventListener("resize", requestSync);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", requestSync);
    };
  }, [anchorElement, initialGeometry.width]);

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

  const closeCustomForm = () => {
    setShowCustomForm(false);
    setCustomText("");
    setEditingInstructionId(null);
  };

  const saveCustomInstruction = () => {
    const instruction = customText.trim();
    if (!instruction) return;
    const label =
      Array.from(instruction).length > 14
        ? `${Array.from(instruction).slice(0, 14).join("")}…`
        : instruction;
    const existingInstruction = instructions.find(
      (item) => item.id === editingInstructionId
    );
    const nextInstruction = existingInstruction
      ? {
          ...existingInstruction,
          label,
          instruction,
          isUserEdited: true,
        }
      : {
          id: createInstructionId(),
          label,
          instruction,
          color: "#ef4444",
          fill: "#feecec",
          isUserEdited: true,
        };
    const next = existingInstruction
      ? instructions.map((item) =>
          item.id === existingInstruction.id ? nextInstruction : item
        )
      : [...instructions, nextInstruction];
    setInstructions(next);
    saveInstructions(next);
    closeCustomForm();
    setSelectedInstructionId(nextInstruction.id);
    setValue(instruction);
    inputRef.current?.focus();
  };

  const beginEditInstruction = (instruction) => {
    setEditingInstructionId(instruction.id);
    setCustomText(instructionText(instruction));
    setShowCustomForm(true);
  };

  const deleteInstruction = (instructionId) => {
    const next = instructions.filter((item) => item.id !== instructionId);
    setInstructions(next);
    saveInstructions(next);

    if (selectedInstructionId === instructionId) {
      setSelectedInstructionId(null);
      setValue("");
    }
    if (editingInstructionId === instructionId) closeCustomForm();
    inputRef.current?.focus();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t("quickInstruction.dialog")}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (
          showCustomForm &&
          !event.target.closest("[data-custom-instruction-form='true']") &&
          !event.target.closest("[data-custom-instruction-toggle='true']")
        ) {
          closeCustomForm();
        }
        beginPanelDrag(event);
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={{
        position: "fixed",
        left: position.left,
        top: position.top,
        width: initialGeometry.width,
        zIndex: 5100,
        padding: "11px 13px 11px",
        border: "1px solid rgba(17,24,39,0.08)",
        borderRadius: 18,
        background: "rgba(255,255,255,0.98)",
        boxShadow: "0 10px 28px rgba(15,23,42,0.16)",
        boxSizing: "border-box",
        cursor: "grab",
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
          gap: 6,
          marginTop: 8,
        }}
      >
        {instructions.map((instruction) => {
          const label = instructionLabel(instruction);
          const text = instructionText(instruction);
          const selected = selectedInstructionId === instruction.id;
          return (
            <div
              key={instruction.id}
              style={{
                height: 28,
                flex: "0 0 auto",
                display: "inline-flex",
                alignItems: "center",
                padding: "0 4px 0 10px",
                border: `1px solid ${selected ? "#6b7280" : "rgba(55,65,81,0.38)"}`,
                borderRadius: 999,
                background: selected ? "#f1f3f5" : "#ffffff",
                color: "#5f6670",
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              <button
                type="button"
                title={text}
                onClick={() => {
                  setSelectedInstructionId(instruction.id);
                  setValue(text);
                  inputRef.current?.focus();
                }}
                style={{
                  height: "100%",
                  minWidth: 0,
                  padding: "0 5px 0 0",
                  border: 0,
                  background: "transparent",
                  color: "inherit",
                  font: "inherit",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
              <button
                type="button"
                data-custom-instruction-toggle="true"
                aria-label={t("instruction.editTitle", { label })}
                title={t("instruction.edit")}
                onClick={() => beginEditInstruction(instruction)}
                style={{
                  width: 18,
                  height: 18,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  border: 0,
                  borderRadius: "50%",
                  background: "transparent",
                  color: "#8a9099",
                  cursor: "pointer",
                }}
              >
                <svg aria-hidden="true" width="11" height="11" viewBox="0 0 12 12">
                  <path d="m2 8.8.35-2.05L7.9 1.2l1.9 1.9-5.55 5.55L2 8.8Z" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
                  <path d="m6.9 2.2 1.9 1.9" fill="none" stroke="currentColor" strokeWidth="1.15" />
                </svg>
              </button>
              <button
                type="button"
                data-custom-instruction-toggle="true"
                aria-label={`${t("instruction.delete")} ${label}`}
                title={t("instruction.delete")}
                onClick={() => deleteInstruction(instruction.id)}
                style={{
                  width: 18,
                  height: 18,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  border: 0,
                  borderRadius: "50%",
                  background: "transparent",
                  color: "#8a9099",
                  fontSize: 16,
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          );
        })}

        <button
          type="button"
          data-custom-instruction-toggle="true"
          aria-label={t("instruction.add")}
          title={t("instruction.add")}
          onClick={() => {
            if (showCustomForm && editingInstructionId == null) {
              closeCustomForm();
              return;
            }
            setEditingInstructionId(null);
            setCustomText("");
            setShowCustomForm(true);
          }}
          style={{
            width: 28,
            height: 28,
            flex: "0 0 28px",
            padding: 0,
            border: "1px solid rgba(55,65,81,0.38)",
            borderRadius: "50%",
            background: showCustomForm ? "#f3f4f6" : "#fff",
            color: "#4b5563",
            fontSize: 20,
            lineHeight: "26px",
            cursor: "pointer",
          }}
        >
          +
        </button>
      </div>

      {showCustomForm ? (
        <div
          data-custom-instruction-form="true"
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
                saveCustomInstruction();
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
            onClick={saveCustomInstruction}
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
