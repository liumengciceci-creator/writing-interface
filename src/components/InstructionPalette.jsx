import {
  useEffect,
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
  };

  const addInstruction = () => {
    const nextLabel =
      label.trim();

    const nextInstruction =
      instructionText.trim() ||
      nextLabel;

    if (!nextLabel) {
      setErrorText(
        "请输入圆形模块名称"
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
        instruction.label || ""
      );
      setInstructionText(
        instruction.instruction ||
          ""
      );
      setSelectedColor(
        instruction.color ||
          INSTRUCTION_COLORS[1]
            .color
      );
      setErrorText("");
      setShowAddPanel(true);
    };

  const beginInstructionDrag =
    (event, instruction) => {
      if (!event.dataTransfer) {
        return;
      }

      const payload =
        createInstructionDragPayload(
          instruction
        );

      setActiveInstructionDragData(
        instruction
      );

      event.dataTransfer.effectAllowed =
        "copy";

      event.dataTransfer.setData(
        WRITING_INSTRUCTION_MIME,
        JSON.stringify(payload)
      );

      event.dataTransfer.setDragImage(
        event.currentTarget,
        event.currentTarget.offsetWidth /
          2,
        event.currentTarget.offsetHeight /
          2
      );
    };

  return (
    <>
      <FloatingPaletteWindow
        storageKey="writing-interface-instruction-palette-position"
        defaultPosition={{
          x: 18,
          y: 560,
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
            指令
          </span>

          <button
            type="button"
            title="添加修改指令"
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
                <button
                  type="button"
                  draggable
                  title={`拖到模块上：${instruction.instruction}`}
                  onDragStart={(
                    event
                  ) =>
                    beginInstructionDrag(
                      event,
                      instruction
                    )
                  }
                  onDragEnd={() => {
                    clearActiveInstructionDragData();
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
                  aria-label={`拖动指令：${instruction.label}`}
                />

                <span
                  title={
                    instruction.instruction
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
                  {instruction.label}
                </span>

                <button
                  type="button"
                  title="编辑指令"
                  aria-label={`编辑指令 ${instruction.label}`}
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
                  title="删除指令"
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
                    ? "编辑修改指令"
                    : "添加修改指令"}
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
                圆形模块名称
              </label>

              <input
                autoFocus
                value={label}
                maxLength={20}
                placeholder="例如：更加有逻辑性"
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
                发送给 AI 的具体指令
              </label>

              <textarea
                value={instructionText}
                placeholder="可选：进一步说明希望 AI 如何修改。留空时直接使用上面的名称。"
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
                  指令颜色
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
                        aria-label={`选择颜色 ${colorConfig.color}`}
                        onClick={() =>
                          setSelectedColor(
                            colorConfig.color
                          )
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

                  <label
                    title="自选颜色"
                    style={{
                      position:
                        "relative",
                      width: 28,
                      height: 28,
                      borderRadius:
                        "50%",
                      background:
                        "conic-gradient(#ef4444, #f59e0b, #facc15, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)",
                      cursor:
                        "pointer",
                      boxShadow:
                        "0 0 0 1px rgba(0,0,0,0.10)",
                    }}
                  >
                    <span
                      style={{
                        position:
                          "absolute",
                        inset: 3,
                        display:
                          "flex",
                        alignItems:
                          "center",
                        justifyContent:
                          "center",
                        borderRadius:
                          "50%",
                        background:
                          "#fff",
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

                    <input
                      type="color"
                      value={
                        selectedColor
                      }
                      aria-label="自选指令颜色"
                      onChange={(
                        event
                      ) =>
                        setSelectedColor(
                          event.target
                            .value
                        )
                      }
                      style={{
                        position:
                          "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        opacity: 0,
                        cursor:
                          "pointer",
                      }}
                    />
                  </label>
                </div>
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
                  取消
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
                    ? "保存"
                    : "添加"}
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
