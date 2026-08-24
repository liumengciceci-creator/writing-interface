import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createPortal,
} from "react-dom";

import {
  WRITING_INSTRUCTION_MIME,
  clearActiveInstructionDragData,
  createInstructionDragPayload,
  setActiveInstructionDragData,
} from "../utils/instructionDrag";

import FloatingPaletteWindow from "./FloatingPaletteWindow.jsx";
import {
  ColorSpectrumPicker,
} from "./Sidebar.jsx";
import { useI18n } from "../i18n.jsx";

const INSTRUCTIONS_STORAGE_KEY =
  "writing-interface-block-instructions";

const INSTRUCTIONS_DEFAULT_VERSION_KEY =
  "writing-interface-block-instructions-default-version";

const CURRENT_DEFAULT_VERSION =
  "2";

const INSTRUCTION_COLORS = [
  {
    color: "#ef4444",
    fill: "#feecec",
  },
  {
    color: "#8b5cf6",
    fill: "#f3eeff",
  },
  {
    color: "#0ea5a4",
    fill: "#e7f8f6",
  },
  {
    color: "#f59e0b",
    fill: "#fff4dc",
  },
  {
    color: "#3b82f6",
    fill: "#eaf2ff",
  },
];

const DEFAULT_INSTRUCTIONS = [
  {
    id: "instruction-more-logical",
    label: "更加有逻辑性",
    instruction:
      "请让这段文字更加有逻辑性，强化句子之间的因果关系、论证顺序和衔接。",
    color: "#ef4444",
    fill: "#feecec",
  },
  {
    id: "instruction-more-causal",
    label: "更注重因果关系",
    instruction:
      "请让这段文字更注重因果关系，明确原因、过程和结果之间的联系。",
    color: "#f59e0b",
    fill: "#fff4dc",
  },
  {
    id: "instruction-emphasize-viewpoint",
    label: "更强调观点",
    instruction:
      "请更突出这段文字的核心观点，使立场清晰、重点明确。",
    color: "#8b5cf6",
    fill: "#f3eeff",
  },
  {
    id: "instruction-emphasize-explanation",
    label: "更强调解释",
    instruction:
      "请加强这段文字的解释，补充必要的说明，使含义更清楚。",
    color: "#0ea5a4",
    fill: "#e7f8f6",
  },
];

function createInstructionFill(
  color
) {
  const normalized =
    String(color || "")
      .replace("#", "");

  if (
    !/^[0-9a-f]{6}$/i.test(
      normalized
    )
  ) {
    return "rgba(124,131,253,0.14)";
  }

  const red = parseInt(
    normalized.slice(0, 2),
    16
  );

  const green = parseInt(
    normalized.slice(2, 4),
    16
  );

  const blue = parseInt(
    normalized.slice(4, 6),
    16
  );

  return `rgba(${red}, ${green}, ${blue}, 0.14)`;
}

function loadInstructions() {
  try {
    const savedValue =
      window.localStorage.getItem(
        INSTRUCTIONS_STORAGE_KEY
      );

    if (savedValue == null) {
      window.localStorage.setItem(
        INSTRUCTIONS_DEFAULT_VERSION_KEY,
        CURRENT_DEFAULT_VERSION
      );

      return DEFAULT_INSTRUCTIONS;
    }

    const parsedValue =
      JSON.parse(savedValue);

    if (!Array.isArray(parsedValue)) {
      window.localStorage.setItem(
        INSTRUCTIONS_DEFAULT_VERSION_KEY,
        CURRENT_DEFAULT_VERSION
      );

      return DEFAULT_INSTRUCTIONS;
    }

    const validInstructions =
      parsedValue
      .filter(
        (item) =>
          item &&
          typeof item.id ===
            "string" &&
          typeof item.label ===
            "string" &&
          typeof item.instruction ===
            "string"
      )
      .map((item) => ({
        ...item,
        color:
          item.color ||
          "#8b5cf6",
        fill:
          item.fill ||
          createInstructionFill(
            item.color
          ),
      }));

    const defaultVersion =
      window.localStorage.getItem(
        INSTRUCTIONS_DEFAULT_VERSION_KEY
      );

    if (
      defaultVersion ===
      CURRENT_DEFAULT_VERSION
    ) {
      return validInstructions;
    }

    const existingIds =
      new Set(
        validInstructions.map(
          (item) => item.id
        )
      );

    const migratedInstructions = [
      ...validInstructions,
      ...DEFAULT_INSTRUCTIONS.filter(
        (item) =>
          !existingIds.has(
            item.id
          )
      ),
    ];

    window.localStorage.setItem(
      INSTRUCTIONS_DEFAULT_VERSION_KEY,
      CURRENT_DEFAULT_VERSION
    );

    return migratedInstructions;
  } catch (error) {
    console.error(
      "读取指令模块失败：",
      error
    );

    return DEFAULT_INSTRUCTIONS;
  }
}

function createInstructionId() {
  if (
    typeof crypto !==
      "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }

  return `instruction-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export default function InstructionPalette({
  width = 152,
  onWidthChange,
}) {
  const {
    instructionLabel,
    instructionText: getInstructionText,
    t,
  } = useI18n();
  const [
    instructions,
    setInstructions,
  ] = useState(
    loadInstructions
  );

  const [
    showAddPanel,
    setShowAddPanel,
  ] = useState(false);

  const [
    editingInstruction,
    setEditingInstruction,
  ] = useState(null);

  const [label, setLabel] =
    useState("");

  const [
    instructionText,
    setInstructionText,
  ] = useState("");

  const [
    selectedColor,
    setSelectedColor,
  ] = useState(
    INSTRUCTION_COLORS[1].color
  );

  const [errorText, setErrorText] =
    useState("");

  const [
    showColorSpectrum,
    setShowColorSpectrum,
  ] = useState(false);

  const [
    reorderingInstructionId,
    setReorderingInstructionId,
  ] = useState(null);

  const [
    instructionDropIndicatorId,
    setInstructionDropIndicatorId,
  ] = useState(null);

  const [
    instructionDropIndicatorPlacement,
    setInstructionDropIndicatorPlacement,
  ] = useState("before");

  const instructionDragGestureRef =
    useRef(null);

  const reorderInstructionAt =
    (
      targetId,
      placeAfter = false
    ) => {
      if (
        !reorderingInstructionId ||
        reorderingInstructionId ===
          targetId
      ) {
        return;
      }

      setInstructions((current) => {
        const next = [...current];
        const fromIndex =
          next.findIndex(
            (item) =>
              item.id ===
              reorderingInstructionId
          );
        const targetIndex =
          next.findIndex(
            (item) =>
              item.id === targetId
          );

        if (
          fromIndex < 0 ||
          targetIndex < 0
        ) {
          return current;
        }

        const [moving] =
          next.splice(fromIndex, 1);

        const remainingTargetIndex =
          next.findIndex(
            (item) =>
              item.id === targetId
          );

        next.splice(
          Math.max(
            0,
            remainingTargetIndex +
              (placeAfter ? 1 : 0)
          ),
          0,
          moving
        );
        return next;
      });
    };

  useEffect(() => {
    try {
      window.localStorage.setItem(
        INSTRUCTIONS_STORAGE_KEY,
        JSON.stringify(
          instructions
        )
      );
    } catch (error) {
      console.error(
        "保存指令模块失败：",
        error
      );
    }
  }, [instructions]);

  const closeAddPanel = () => {
    setShowAddPanel(false);
    setEditingInstruction(null);
    setLabel("");
    setInstructionText("");
    setSelectedColor(
      INSTRUCTION_COLORS[1].color
    );
    setErrorText("");
    setShowColorSpectrum(false);
  };

  const addInstruction = () => {
    const nextLabel =
      label.trim();

    const nextInstruction =
      instructionText.trim() ||
      nextLabel;

    if (!nextLabel) {
      setErrorText(
        t("instruction.nameRequired")
      );

      return;
    }

    setInstructions((current) => {
      const nextInstructionData = {
          id:
            editingInstruction?.id ||
            createInstructionId(),
          label: nextLabel,
          instruction:
            nextInstruction,
            color:
              selectedColor,
            fill:
              createInstructionFill(
                selectedColor
              ),
      };

      if (editingInstruction) {
        return current.map(
          (item) =>
            item.id ===
            editingInstruction.id
              ? nextInstructionData
              : item
        );
      }

      return [
        ...current,
        nextInstructionData,
      ];
    });

    closeAddPanel();
  };

  const openEditInstruction =
    (instruction) => {
      setEditingInstruction(
        instruction
      );
      setLabel(
        instructionLabel(instruction)
      );
      setInstructionText(
        getInstructionText(instruction)
      );
      setSelectedColor(
        instruction.color ||
          INSTRUCTION_COLORS[1]
            .color
      );
      setShowColorSpectrum(false);
      setErrorText("");
      setShowAddPanel(true);
    };

  const beginInstructionDrag =
    (event, instruction) => {
      if (!event.dataTransfer) {
        return;
      }

      setReorderingInstructionId(
        instruction.id
      );

      instructionDragGestureRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        intent: "pending",
      };

      const localizedInstruction = {
        ...instruction,
        label: instructionLabel(instruction),
        instruction: getInstructionText(instruction),
      };

      const payload =
        createInstructionDragPayload(
          localizedInstruction
        );

      setActiveInstructionDragData(
        localizedInstruction
      );

      event.dataTransfer.effectAllowed =
        "copy";

      event.dataTransfer.setData(
        WRITING_INSTRUCTION_MIME,
        JSON.stringify(payload)
      );

      const dragClone =
        event.currentTarget.cloneNode(
          true
        );

      dragClone.style.position =
        "fixed";
      dragClone.style.left =
        "-10000px";
      dragClone.style.top =
        "-10000px";
      dragClone.style.opacity =
        "0.92";
      dragClone.style.boxShadow =
        "0 6px 14px rgba(15,23,42,0.18)";
      dragClone.style.pointerEvents =
        "none";

      document.body.appendChild(
        dragClone
      );

      event.dataTransfer.setDragImage(
        dragClone,
        event.currentTarget.offsetWidth /
          2,
        event.currentTarget.offsetHeight /
          2
      );

      window.requestAnimationFrame(
        () => dragClone.remove()
      );
    };

  return (
    <>
      <FloatingPaletteWindow
        storageKey="writing-interface-instruction-palette-position-v5"
        defaultPosition={{
          x: 18,
          y: 438,
        }}
        width={width}
        onWidthChange={
          onWidthChange
        }
      >
      <div
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 14,
          background: "#f8f8f8",
          boxShadow:
            "0 2px 10px rgba(0,0,0,0.08)",
          boxSizing:
            "border-box",
        }}
      >
        <div
          data-palette-drag-handle="true"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
            marginBottom: 10,
            cursor: "grab",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#555",
            }}
          >
            {t("instruction.title")}
          </span>

          <button
            type="button"
            title={t("instruction.add")}
            onClick={() => {
              setEditingInstruction(
                null
              );
              setLabel("");
              setInstructionText("");
              setSelectedColor(
                INSTRUCTION_COLORS[1]
                  .color
              );
              setShowAddPanel(true);
              setErrorText("");
            }}
            style={{
              width: 26,
              height: 26,
              padding: 0,
              borderRadius: 7,
              border:
                "1px solid #d7d7d7",
              background: "#fff",
              color: "#333",
              fontSize: 20,
              lineHeight: "22px",
              cursor: "pointer",
            }}
          >
            +
          </button>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
          }}
        >
          {instructions.map(
            (instruction) => (
              <div
                key={instruction.id}
                onDragOver={(event) => {
                  if (
                    !reorderingInstructionId
                  ) {
                    return;
                  }

                  const gesture =
                    instructionDragGestureRef.current;

                  if (!gesture) {
                    return;
                  }

                  const horizontalDistance =
                    event.clientX -
                    gesture.startX;
                  const verticalDistance =
                    Math.abs(
                      event.clientY -
                      gesture.startY
                    );

                  if (
                    gesture.intent ===
                      "canvas" ||
                    horizontalDistance > 24
                  ) {
                    gesture.intent =
                      "canvas";
                    setInstructionDropIndicatorId(
                      null
                    );
                    return;
                  }

                  if (
                    gesture.intent ===
                      "pending" &&
                    verticalDistance < 8
                  ) {
                    return;
                  }

                  gesture.intent =
                    "reorder";
                  event.preventDefault();
                  event.stopPropagation();

                  const targetRect =
                    event.currentTarget
                      .getBoundingClientRect();
                  const placeAfter =
                    event.clientY >=
                    targetRect.top +
                      targetRect.height / 2;

                  setInstructionDropIndicatorId(
                    instruction.id
                  );
                  setInstructionDropIndicatorPlacement(
                    placeAfter
                      ? "after"
                      : "before"
                  );
                }}
                onDrop={(event) => {
                  const gesture =
                    instructionDragGestureRef.current;

                  if (
                    !gesture ||
                    gesture.intent !==
                      "reorder"
                  ) {
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();

                  const targetRect =
                    event.currentTarget
                      .getBoundingClientRect();

                  reorderInstructionAt(
                    instruction.id,
                    event.clientY >=
                      targetRect.top +
                        targetRect.height / 2
                  );
                  setInstructionDropIndicatorId(
                    null
                  );
                }}
                style={{
                  position: "relative",
                  width: "100%",
                  minHeight: 32,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  paddingRight: 48,
                  boxSizing:
                    "border-box",
                }}
              >
                {instructionDropIndicatorId ===
                  instruction.id && (
                  <span
                    aria-hidden="true"
                    style={{
                      position:
                        "absolute",
                      left: 0,
                      right: 0,
                      top:
                        instructionDropIndicatorPlacement ===
                          "after"
                          ? "auto"
                          : -2,
                      bottom:
                        instructionDropIndicatorPlacement ===
                          "after"
                          ? -2
                          : "auto",
                      zIndex: 8,
                      height: 2,
                      borderRadius: 2,
                      background:
                        "#9ca3af",
                      boxShadow:
                        "none",
                      pointerEvents:
                        "none",
                    }}
                  />
                )}

                <button
                  type="button"
                  draggable
                  title={t("instruction.drag", {
                    instruction: getInstructionText(instruction),
                  })}
                  onDragStart={(
                    event
                  ) =>
                    beginInstructionDrag(
                      event,
                      instruction
                    )
                  }
                  onDrag={(event) => {
                    const gesture =
                      instructionDragGestureRef.current;

                    if (
                      !gesture ||
                      gesture.intent ===
                        "canvas" ||
                      event.clientX <= 0
                    ) {
                      return;
                    }

                    if (
                      event.clientX -
                        gesture.startX >
                      24
                    ) {
                      gesture.intent =
                        "canvas";
                      setInstructionDropIndicatorId(
                        null
                      );
                    }
                  }}
                  onDragEnd={() => {
                    clearActiveInstructionDragData();
                    setReorderingInstructionId(
                      null
                    );
                    setInstructionDropIndicatorId(
                      null
                    );
                    instructionDragGestureRef.current =
                      null;
                  }}
                  style={{
                    width: 26,
                    height: 26,
                    flex: "0 0 26px",
                    padding: 0,
                    borderRadius: "50%",
                    border:
                      "3px solid #eef1f4",
                    background:
                      instruction.color,
                    cursor: "grab",
                    boxSizing:
                      "border-box",
                    userSelect: "none",
                    WebkitUserSelect:
                      "none",
                  }}
                  aria-label={t("instruction.dragLabel", {
                    label: instructionLabel(instruction),
                  })}
                />

                <span
                  title={
                    getInstructionText(instruction)
                  }
                  style={{
                    minWidth: 0,
                    flex: 1,
                    color: "#333",
                    fontSize: 12,
                    lineHeight: "16px",
                    whiteSpace:
                      "nowrap",
                    overflow:
                      "hidden",
                    textOverflow:
                      "clip",
                    userSelect: "none",
                    WebkitUserSelect:
                      "none",
                  }}
                >
                  {instructionLabel(instruction)}
                </span>

                <button
                  type="button"
                  title={t("instruction.edit")}
                  aria-label={t("instruction.editTitle", {
                    label: instructionLabel(instruction),
                  })}
                  onMouseDown={(
                    event
                  ) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openEditInstruction(
                      instruction
                    );
                  }}
                  style={{
                    position: "absolute",
                    right: 21,
                    top: "50%",
                    width: 18,
                    height: 18,
                    padding: 0,
                    border:
                      "1px solid #ddd",
                    borderRadius: 5,
                    background:
                      "transparent",
                    color: "#777",
                    fontSize: 13,
                    lineHeight: "16px",
                    cursor: "pointer",
                    transform:
                      "translateY(-50%)",
                  }}
                >
                  ✎
                </button>

                <button
                  type="button"
                  title={t("instruction.delete")}
                  onMouseDown={(
                    event
                  ) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(
                    event
                  ) => {
                    event.preventDefault();
                    event.stopPropagation();

                    setInstructions(
                      (current) =>
                        current.filter(
                          (item) =>
                            item.id !==
                            instruction.id
                        )
                    );
                  }}
                  style={{
                    position: "absolute",
                    right: -2,
                    top: "50%",
                    width: 18,
                    height: 18,
                    padding: 0,
                    border:
                      "1px solid #ddd",
                    borderRadius: 5,
                    background:
                      "transparent",
                    color: "#777",
                    fontSize: 14,
                    lineHeight: "16px",
                    cursor: "pointer",
                    transform:
                      "translateY(-50%)",
                  }}
                >
                  ×
                </button>
              </div>
            )
          )}
        </div>
      </div>
      </FloatingPaletteWindow>

      {showAddPanel &&
        typeof document !==
          "undefined" &&
        createPortal(
          <>
            <div
              onMouseDown={
                closeAddPanel
              }
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 2099,
                background:
                  "rgba(0,0,0,0.14)",
              }}
            />

            <div
              onMouseDown={(
                event
              ) =>
                event.stopPropagation()
              }
              style={{
                position: "fixed",
                left: "50%",
                top: "50%",
                zIndex: 2100,
                width: 360,
                padding: 22,
                borderRadius: 14,
                background: "#fff",
                boxShadow:
                  "0 12px 40px rgba(0,0,0,0.20)",
                transform:
                  "translate(-50%, -50%)",
                boxSizing:
                  "border-box",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent:
                    "space-between",
                  marginBottom: 18,
                }}
              >
                <strong
                  style={{
                    color: "#333",
                    fontSize: 16,
                  }}
                >
                  {editingInstruction
                    ? t("instruction.edit")
                    : t("instruction.add")}
                </strong>

                <button
                  type="button"
                  onClick={
                    closeAddPanel
                  }
                  style={{
                    border: "none",
                    background:
                      "transparent",
                    color: "#666",
                    fontSize: 22,
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>

              <label
                style={{
                  display: "block",
                  marginBottom: 7,
                  color: "#555",
                  fontSize: 13,
                }}
              >
                {t("instruction.name")}
              </label>

              <input
                autoFocus
                value={label}
                maxLength={20}
                placeholder={t("instruction.namePlaceholder")}
                onChange={(event) => {
                  setLabel(
                    event.target.value
                  );
                  setErrorText("");
                }}
                style={{
                  width: "100%",
                  height: 38,
                  padding: "0 11px",
                  border:
                    "1px solid #d7d7d7",
                  borderRadius: 8,
                  outline: "none",
                  fontSize: 14,
                  boxSizing:
                    "border-box",
                }}
              />

              <label
                style={{
                  display: "block",
                  marginTop: 16,
                  marginBottom: 7,
                  color: "#555",
                  fontSize: 13,
                }}
              >
                {t("instruction.sendToAI")}
              </label>

              <textarea
                value={instructionText}
                placeholder={t("instruction.detailPlaceholder")}
                onChange={(event) => {
                  setInstructionText(
                    event.target.value
                  );
                  setErrorText("");
                }}
                style={{
                  width: "100%",
                  minHeight: 100,
                  padding: 11,
                  border:
                    "1px solid #d7d7d7",
                  borderRadius: 8,
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                  fontSize: 13,
                  lineHeight: "20px",
                  boxSizing:
                    "border-box",
                }}
              />

              <div
                style={{
                  marginTop: 16,
                }}
              >
                <div
                  style={{
                    marginBottom: 9,
                    color: "#555",
                    fontSize: 13,
                  }}
                >
                  {t("instruction.color")}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  {INSTRUCTION_COLORS.map(
                    (colorConfig) => (
                      <button
                        key={
                          colorConfig.color
                        }
                        type="button"
                        title={
                          colorConfig.color
                        }
                        aria-label={t("instruction.chooseColor", {
                          color: colorConfig.color,
                        })}
                        onClick={() =>
                          {
                            setSelectedColor(
                              colorConfig.color
                            );
                            setShowColorSpectrum(
                              false
                            );
                          }
                        }
                        style={{
                          width: 28,
                          height: 28,
                          padding: 0,
                          borderRadius:
                            "50%",
                          border:
                            selectedColor ===
                            colorConfig.color
                              ? "3px solid #333"
                              : "2px solid transparent",
                          background:
                            colorConfig.color,
                          boxShadow:
                            "0 0 0 1px rgba(0,0,0,0.08)",
                          cursor:
                            "pointer",
                          boxSizing:
                            "border-box",
                        }}
                      />
                    )
                  )}

                  <button
                    type="button"
                    title={t("sidebar.customColor")}
                    aria-label={t("instruction.customColor")}
                    onClick={() => {
                      setShowColorSpectrum(
                        (current) =>
                          !current
                      );
                    }}
                    style={{
                      position:
                        "relative",
                      width: 28,
                      height: 28,
                      borderRadius:
                        "50%",
                      background:
                        "#fff",
                      cursor:
                        "pointer",
                      boxShadow: "none",
                      border:
                        showColorSpectrum
                          ? "2px solid #333"
                          : "2px solid #a8a8a8",
                      padding: 0,
                      boxSizing:
                        "border-box",
                    }}
                  >
                    <span
                      style={{
                        position:
                          "absolute",
                        inset: 0,
                        display:
                          "flex",
                        alignItems:
                          "center",
                        justifyContent:
                          "center",
                        borderRadius:
                          "50%",
                        background:
                          "transparent",
                        color:
                          "#333",
                        fontSize: 18,
                        fontWeight: 500,
                        lineHeight: "20px",
                        pointerEvents:
                          "none",
                      }}
                    >
                      +
                    </span>

                  </button>
                </div>

                {showColorSpectrum && (
                  <ColorSpectrumPicker
                    color={
                      selectedColor
                    }
                    onChange={
                      setSelectedColor
                    }
                  />
                )}
              </div>

              {errorText && (
                <div
                  style={{
                    marginTop: 7,
                    color: "#d84f4f",
                    fontSize: 12,
                  }}
                >
                  {errorText}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "flex-end",
                  gap: 10,
                  marginTop: 20,
                }}
              >
                <button
                  type="button"
                  onClick={
                    closeAddPanel
                  }
                  style={{
                    height: 36,
                    padding: "0 18px",
                    border:
                      "1px solid #d7d7d7",
                    borderRadius: 8,
                    background: "#fff",
                    color: "#555",
                    cursor: "pointer",
                  }}
                >
                  {t("common.cancel")}
                </button>

                <button
                  type="button"
                  onClick={
                    addInstruction
                  }
                  style={{
                    height: 36,
                    padding: "0 18px",
                    border: "none",
                    borderRadius: 8,
                    background: "#333",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  {editingInstruction
                    ? t("common.save")
                    : t("common.add")}
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
