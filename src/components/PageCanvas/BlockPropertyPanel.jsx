import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useI18n } from "../../i18n.jsx";

/**
 * 预设标签颜色。
 */
const LABEL_COLORS = [
  "#ef7f7f",
  "#f2a55f",
  "#56c7ad",
  "#78c76b",
  "#6b86f0",
  "#7c5dfa",
  "#4b5563",
];

/**
 * 系统模块类型的中文标签。
 *
 * 用户自定义标签没有映射时，
 * 直接显示原始名称。
 */
const BLOCK_TYPE_LABELS = {
  Title: "标题",
  Claim: "论点",
  Evidence: "证据",
  Reason: "原因",
  Counter: "反论",
  Compare: "对比",
  Conclusion: "结论",
  Question: "问题",
  Generated: "生成",
  Transition: "过渡",
  Merged: "融合",
};

/**
 * 文本风格选项。
 */
const STYLE_OPTIONS = [
  {
    id: "logical",
    label: "更加逻辑化",
    icon: "◉",
  },
  {
    id: "explanatory",
    label: "更强调解释",
    icon: "✣",
  },
  {
    id: "causal",
    label: "更强调因果关系",
    icon: "◎",
  },
  {
    id: "evidence",
    label: "更强调证据",
    icon: "◈",
  },
  {
    id: "temporal",
    label: "更强调时间顺序",
    icon: "Ⅱ",
  },
  {
    id: "critical",
    label: "更强调批判性",
    icon: "▮",
  },
  {
    id: "comparison",
    label: "更强调比较",
    icon: "⇄",
  },
  {
    id: "subjective",
    label: "更主观",
    icon: "◒",
  },
  {
    id: "viewpoint",
    label: "更强调观点",
    icon: "●",
  },
  {
    id: "objective",
    label: "更客观",
    icon: "○",
  },
];

/**
 * 双模块关系选项。
 */
const RELATION_OPTIONS = [
  {
    id: "cause",
    label: "因果",
  },
  {
    id: "contrast",
    label: "对比",
  },
  {
    id: "progressive",
    label: "递进",
  },
  {
    id: "transition",
    label: "转折",
  },
];

/**
 * 获取模块的界面显示标签。
 */
function getBlockTypeLabel(type) {
  return (
    BLOCK_TYPE_LABELS[type] ||
    type ||
    ""
  );
}

/**
 * 将十六进制颜色转换为 RGB。
 */
function hexToRgb(hex) {
  const normalizedHex =
    String(hex || "")
      .replace("#", "")
      .trim();

  if (
    normalizedHex.length !== 6
  ) {
    return null;
  }

  const red =
    Number.parseInt(
      normalizedHex.slice(0, 2),
      16
    );

  const green =
    Number.parseInt(
      normalizedHex.slice(2, 4),
      16
    );

  const blue =
    Number.parseInt(
      normalizedHex.slice(4, 6),
      16
    );

  if (
    Number.isNaN(red) ||
    Number.isNaN(green) ||
    Number.isNaN(blue)
  ) {
    return null;
  }

  return {
    red,
    green,
    blue,
  };
}

/**
 * 将数字转换为两位十六进制。
 */
function toHex(value) {
  return Math.round(value)
    .toString(16)
    .padStart(2, "0");
}

/**
 * 根据标签颜色自动生成浅色背景。
 *
 * amount 越大，颜色越接近白色。
 */
function createLightFill(
  color,
  amount = 0.84
) {
  const rgb =
    hexToRgb(color);

  if (!rgb) {
    return "#f3f4f6";
  }

  const red =
    rgb.red +
    (255 - rgb.red) *
      amount;

  const green =
    rgb.green +
    (255 - rgb.green) *
      amount;

  const blue =
    rgb.blue +
    (255 - rgb.blue) *
      amount;

  return `#${toHex(red)}${toHex(
    green
  )}${toHex(blue)}`;
}

export default function BlockPropertyPanel({
  block,
  selectedBlocks = [],

  // 单模块：标签与颜色
  onUpdateBlockAppearance,

  // 单模块：调整长度
  onAdjustLength,
  isAdjustingLength = false,
  adjustLengthError = "",

  // 单模块：调整文本风格
  onApplyBlockStyle,
  isAdjustingStyle = false,
  adjustStyleError = "",
  showTextStyleControls = false,

  // 多模块操作
  onJoinBlocks,
  onMergeBlocks,
  onImitateBlock,
  onRelateBlocks,

  isApplyingMultiAction = false,
  multiActionError = "",
}) {
  const { blockTypeLabel, t } = useI18n();
  /**
   * 标签名称。
   */
  const [
    selectedBlockType,
    setSelectedBlockType,
  ] = useState("");

  /**
   * 标签与边框颜色。
   */
  const [
    selectedColor,
    setSelectedColor,
  ] = useState(
    LABEL_COLORS[0]
  );

  /**
   * 标签修改错误。
   */
  const [
    appearanceError,
    setAppearanceError,
  ] = useState("");

  /**
   * 调整长度参数。
   */
  const [
    lengthValue,
    setLengthValue,
  ] = useState(0);

  /**
   * 文本风格参数。
   */
  const [
    selectedStyle,
    setSelectedStyle,
  ] = useState(null);

  const [
    customStyleOpen,
    setCustomStyleOpen,
  ] = useState(false);

  const [
    customStyleText,
    setCustomStyleText,
  ] = useState("");

  /**
   * 多模块操作参数。
   */
  const [
    selectedMultiAction,
    setSelectedMultiAction,
  ] = useState(null);

  const [
    mergeLength,
    setMergeLength,
  ] = useState(0);

  const [
    relationType,
    setRelationType,
  ] = useState("cause");

  /**
   * 当前实际参与操作的模块。
   */
  const activeBlocks =
    useMemo(() => {
      if (
        Array.isArray(
          selectedBlocks
        ) &&
        selectedBlocks.length > 0
      ) {
        return selectedBlocks.filter(
          Boolean
        );
      }

      return block
        ? [block]
        : [];
    }, [
      selectedBlocks,
      block,
    ]);

  /**
   * 当前单模块。
   */
  const currentBlock =
    block ||
    activeBlocks[0] ||
    null;

  /**
   * 是否正好选择了两个模块。
   */
  const isMultipleSelection =
    activeBlocks.length === 2;

  /**
   * 用于监听多选模块变化。
   */
  const activeBlockIds =
    activeBlocks
      .map(
        (item) =>
          item?.id
      )
      .filter(
        (id) =>
          id !== null &&
          id !== undefined
      )
      .join(",");

  /**
   * 当前模块发生变化时，
   * 同步标签和颜色。
   */
  useEffect(() => {
    if (!currentBlock) {
      return;
    }

    setSelectedBlockType(
      blockTypeLabel(currentBlock.type, getBlockTypeLabel(currentBlock.type))
    );

    setSelectedColor(
      currentBlock.color ||
        LABEL_COLORS[0]
    );

    setAppearanceError("");
  }, [
    currentBlock?.id,
    currentBlock?.type,
    currentBlock?.color,
    blockTypeLabel,
  ]);

  /**
   * 切换单模块时，
   * 重置长度和文本风格参数。
   */
  useEffect(() => {
    setLengthValue(0);
    setSelectedStyle(null);
    setCustomStyleOpen(false);
    setCustomStyleText("");
  }, [
    currentBlock?.id,
  ]);

  /**
   * 多选模块变化时，
   * 重置双模块参数。
   */
  useEffect(() => {
    setSelectedMultiAction(
      null
    );

    setMergeLength(0);
    setRelationType(
      "cause"
    );
  }, [
    isMultipleSelection,
    activeBlockIds,
  ]);

  if (
    !currentBlock &&
    activeBlocks.length === 0
  ) {
    return null;
  }

  /**
   * 自动生成当前模块背景颜色。
   */
  const selectedFill =
    createLightFill(
      selectedColor
    );

  /**
   * 通用样式。
   */
  const dividerStyle = {
    height: 1,
    margin: "18px 0",
    background: "#eeeeee",
  };

  const sectionTitleStyle = {
    margin: 0,
    fontSize: 12,
    lineHeight: "18px",
    fontWeight: 600,
    color: "#222",
  };

  const sectionDescriptionStyle = {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 10,
    lineHeight: "15px",
    color: "#888",
  };

  const fieldLabelStyle = {
    marginBottom: 5,
    fontSize: 11,
    lineHeight: "15px",
    color: "#555",
  };

  const primaryButtonStyle = {
    height: 36,
    padding: "0 14px",

    border: "none",
    borderRadius: 7,

    background: "#536ff5",
    color: "#fff",

    fontSize: 12,
    fontWeight: 500,
    fontFamily: "inherit",

    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const optionButtonStyle = (
    isActive
  ) => ({
    width: "100%",
    height: 36,
    padding: "0 8px",

    border: isActive
      ? "1px solid #7088f6"
      : "1px solid #e0e3eb",

    borderRadius: 7,

    background: isActive
      ? "#f2f5ff"
      : "#fff",

    color: isActive
      ? "#405bc9"
      : "#333",

    display: "flex",
    alignItems: "center",
    gap: 7,

    boxSizing: "border-box",

    cursor: "pointer",
    textAlign: "left",

    fontSize: 11,
    fontFamily: "inherit",

    transition:
      "background 0.15s ease, border-color 0.15s ease",
  });

  const optionIconStyle = {
    width: 19,
    height: 19,
    flex: "0 0 19px",

    borderRadius: 5,
    background: "#edf1ff",
    color: "#526ee0",

    display: "flex",
    alignItems: "center",
    justifyContent: "center",

    fontSize: 11,
    fontWeight: 500,
  };

  const relationButtonStyle = (
    isActive
  ) => ({
    height: 30,
    padding: "0 10px",

    border: isActive
      ? "1px solid #7188ee"
      : "1px solid #dfe2e9",

    borderRadius: 7,

    background: isActive
      ? "#eef2ff"
      : "#fff",

    color: isActive
      ? "#405ecf"
      : "#333",

    fontSize: 12,
    fontFamily: "inherit",

    cursor: isApplyingMultiAction
      ? "not-allowed"
      : "pointer",

    opacity:
      isApplyingMultiAction
        ? 0.55
        : 1,
  });

  const errorMessageStyle = {
    marginTop: 8,
    padding: "8px 10px",

    border:
      "1px solid #ffd7d7",

    borderRadius: 7,

    background: "#fff7f7",
    color: "#d14343",

    fontSize: 11,
    lineHeight: "17px",

    wordBreak: "break-word",
  };

  /**
   * 按钮可用状态。
   */
  const canApplyAppearance =
    Boolean(
      currentBlock
    ) &&
    Boolean(
      selectedBlockType.trim()
    ) &&
    Boolean(
      selectedColor
    );

  const canApplyLength =
    Boolean(
      currentBlock
    ) &&
    lengthValue !== 0 &&
    !isAdjustingLength;

  const canApplyPresetStyle =
    Boolean(
      currentBlock
    ) &&
    Boolean(
      selectedStyle
    ) &&
    !isAdjustingStyle;

  const canApplyCustomStyle =
    Boolean(
      currentBlock
    ) &&
    Boolean(
      customStyleText.trim()
    ) &&
    !isAdjustingStyle;

  const canApplyMultiAction =
    isMultipleSelection &&
    Boolean(
      selectedMultiAction
    ) &&
    !isApplyingMultiAction;

  /**
   * 应用标签和颜色。
   */
  const handleApplyAppearance =
    async () => {
      if (
        !canApplyAppearance
      ) {
        return;
      }

      setAppearanceError("");

      try {
        await onUpdateBlockAppearance?.({
          blockId:
            currentBlock.id,

          type:
            selectedBlockType.trim(),

          color:
            selectedColor,

          fill:
            selectedFill,
        });
      } catch (error) {
        console.error(
          "[BlockPropertyPanel] 修改标签失败：",
          error
        );

        setAppearanceError(
          error?.message ||
            "修改标签失败"
        );
      }
    };

  /**
   * 应用长度调整。
   */
  const handleApplyLength =
    async () => {
      if (!canApplyLength) {
        return;
      }

      try {
        const result =
          await onAdjustLength?.(
            currentBlock,
            lengthValue
          );

        if (result) {
          setLengthValue(0);
        }
      } catch (error) {
        console.error(
          "[BlockPropertyPanel] 调整长度失败：",
          error
        );
      }
    };

  /**
   * 应用预设文本风格。
   */
  const handleApplyStyle =
    async () => {
      if (
        !canApplyPresetStyle
      ) {
        return;
      }

      const selectedOption =
        STYLE_OPTIONS.find(
          (option) =>
            option.id ===
            selectedStyle
        );

      if (!selectedOption) {
        return;
      }

      try {
        const result =
          await onApplyBlockStyle?.({
            block:
              currentBlock,

            style:
              selectedOption.id,

            styleLabel:
              t(`style.${selectedOption.id}`),

            isCustom:
              false,
          });

        if (result) {
          setSelectedStyle(
            null
          );
        }
      } catch (error) {
        console.error(
          "[BlockPropertyPanel] 调整文本风格失败：",
          error
        );
      }
    };

  /**
   * 应用自定义文本风格。
   */
  const handleApplyCustomStyle =
    async () => {
      if (
        !canApplyCustomStyle
      ) {
        return;
      }

      const instruction =
        customStyleText.trim();

      try {
        const result =
          await onApplyBlockStyle?.({
            block:
              currentBlock,

            style:
              instruction,

            styleLabel:
              t("property.customStyle"),

            isCustom:
              true,
          });

        if (result) {
          setCustomStyleText(
            ""
          );

          setCustomStyleOpen(
            false
          );
        }
      } catch (error) {
        console.error(
          "[BlockPropertyPanel] 应用自定义风格失败：",
          error
        );
      }
    };

  /**
   * 应用双模块操作。
   */
  const handleApplyMultiAction =
    async () => {
      if (
        !canApplyMultiAction
      ) {
        return;
      }

      try {
        if (
          selectedMultiAction ===
          "connect"
        ) {
          await onJoinBlocks?.();
          return;
        }

        if (
          selectedMultiAction ===
          "merge"
        ) {
          await onMergeBlocks?.({
            length:
              mergeLength,
          });

          return;
        }

        if (
          selectedMultiAction ===
          "imitate"
        ) {
          await onImitateBlock?.();
          return;
        }

        if (
          selectedMultiAction ===
          "relation"
        ) {
          await onRelateBlocks?.({
            relationType,
          });
        }
      } catch (error) {
        console.error(
          "[BlockPropertyPanel] 双模块操作失败：",
          error
        );
      }
    };

  return (
    <aside
      style={{
        width: "100%",
        height: "100%",

        padding: "16px 14px",

background: "rgba(255,255,255,0.82)",
        boxSizing: "border-box",

        overflowY: "auto",
        overflowX: "hidden",

        textAlign: "left",
      }}
    >
      {/* 单模块设置 */}
      {!isMultipleSelection &&
        currentBlock && (
          <>
            {/* 1. 标签 */}
            <section>
              <h3
                style={
                  sectionTitleStyle
                }
              >
                1. {t("property.label")}
              </h3>

              <div
                style={
                  sectionDescriptionStyle
                }
              >
                {t("property.editLabel")}
              </div>

              <div
                style={{
                  marginBottom: 14,
                }}
              >
                <div
                  style={
                    fieldLabelStyle
                  }
                >
                  {t("sidebar.labelName")}
                </div>

                <input
                  type="text"
                  value={
                    selectedBlockType
                  }
                  placeholder={t("property.labelPlaceholder")}
                  onChange={(
                    event
                  ) => {
                    setSelectedBlockType(
                      event.target.value
                    );
                  }}
                  style={{
                    width: "100%",
                    height: 36,
                    padding:
                      "0 10px",

                    border:
                      "1px solid #dfe2e8",

                    borderRadius: 8,
                    background: "#fff",

                    boxSizing:
                      "border-box",

                    color: "#333",
                    fontSize: 11,
                    fontFamily:
                      "inherit",

                    outline: "none",
                  }}
                />
              </div>

              <div
                style={
                  fieldLabelStyle
                }
              >
                {t("sidebar.labelColor")}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems:
                    "center",

                  flexWrap:
                    "wrap",

                  gap: 8,
                }}
              >
                {LABEL_COLORS.map(
                  (color) => {
                    const isActive =
                      selectedColor.toLowerCase() ===
                      color.toLowerCase();

                    return (
                      <button
                        key={color}
                        type="button"
                        title={color}
                        aria-label={t("property.chooseColor", { color })}
                        onClick={() => {
                          setSelectedColor(
                            color
                          );
                        }}
                        style={{
                          width: 26,
                          height: 26,
                          padding: 0,

                          border:
                            isActive
                              ? "3px solid #ffffff"
                              : "3px solid transparent",

                          borderRadius:
                            "50%",

                          background:
                            color,

                          boxShadow:
                            isActive
                              ? `0 0 0 2px ${color}`
                              : "0 0 0 1px rgba(0,0,0,0.08)",

                          cursor:
                            "pointer",

                          boxSizing:
                            "border-box",

                          transition:
                            "transform 0.15s ease, box-shadow 0.15s ease",

                          transform:
                            isActive
                              ? "scale(1.06)"
                              : "scale(1)",
                        }}
                      />
                    );
                  }
                )}
              </div>

              <button
                type="button"
                onClick={
                  handleApplyAppearance
                }
                disabled={
                  !canApplyAppearance
                }
                style={{
                  ...primaryButtonStyle,

                  width: "100%",
                  marginTop: 14,

                  opacity:
                    canApplyAppearance
                      ? 1
                      : 0.45,

                  cursor:
                    canApplyAppearance
                      ? "pointer"
                      : "not-allowed",
                }}
              >
                {t("common.apply")}
              </button>

              {appearanceError && (
                <div
                  style={
                    errorMessageStyle
                  }
                >
                  {
                    appearanceError
                  }
                </div>
              )}
            </section>

            <div
              style={
                dividerStyle
              }
            />

            {/* 2. 调整长度 */}
            <section>
              <h3
                style={
                  sectionTitleStyle
                }
              >
                2. {t("property.length")}
              </h3>

              <div
                style={
                  sectionDescriptionStyle
                }
              >
                {t("property.lengthHelp")}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems:
                    "center",

                  justifyContent:
                    "space-between",

                  marginBottom: 4,

                  fontSize: 11,
                  color: "#555",
                }}
              >
                <span>{t("property.shorter")}</span>
                <span>{t("property.medium")}</span>
                <span>{t("property.longer")}</span>
              </div>

              <input
                type="range"
                min="-100"
                max="100"
                step="10"
                value={
                  lengthValue
                }
                disabled={
                  isAdjustingLength
                }
                onChange={(
                  event
                ) => {
                  setLengthValue(
                    Number(
                      event.target.value
                    )
                  );
                }}
                style={{
                  width: "100%",

                  cursor:
                    isAdjustingLength
                      ? "not-allowed"
                      : "pointer",

                  accentColor:
                    "#536ff5",

                  opacity:
                    isAdjustingLength
                      ? 0.55
                      : 1,
                }}
              />

              <div
                style={{
                  marginTop: 12,

                  display: "grid",

                  gridTemplateColumns:
                    "1fr auto",

                  gap: 8,
                }}
              >
                <div
                  style={{
                    height: 38,

                    border:
                      "1px solid #dfe2e8",

                    borderRadius: 8,

                    display: "flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "center",

                    color: "#333",
                    fontSize: 13,
                  }}
                >
                  {lengthValue > 0
                    ? "+"
                    : ""}

                  {lengthValue}%
                </div>

                <button
                  type="button"
                  onClick={
                    handleApplyLength
                  }
                  disabled={
                    !canApplyLength
                  }
                  style={{
                    ...primaryButtonStyle,

                    minWidth: 74,

                    opacity:
                      canApplyLength
                        ? 1
                        : 0.45,

                    cursor:
                      canApplyLength
                        ? "pointer"
                        : "not-allowed",
                  }}
                >
                  {isAdjustingLength
                    ? t("common.processing")
                    : t("common.apply")}
                </button>
              </div>

              {adjustLengthError && (
                <div
                  style={
                    errorMessageStyle
                  }
                >
                  {
                    adjustLengthError
                  }
                </div>
              )}
            </section>

            {showTextStyleControls && (
              <>
                <div
                  style={
                    dividerStyle
                  }
                />

                {/* 3. 文本风格调整 */}
                <section>
              <h3
                style={
                  sectionTitleStyle
                }
              >
                3. {t("property.style")}
              </h3>

              <div
                style={
                  sectionDescriptionStyle
                }
              >
                {t("property.styleHelp")}
              </div>

              <div
                style={{
                  display: "grid",

                  gridTemplateColumns:
                    "1fr 1fr",

                  gap: 8,
                }}
              >
                {STYLE_OPTIONS.map(
                  (option) => {
                    const isActive =
                      selectedStyle ===
                      option.id;

                    return (
                      <button
                        key={
                          option.id
                        }
                        type="button"
                        disabled={
                          isAdjustingStyle
                        }
                        style={{
                          ...optionButtonStyle(
                            isActive
                          ),

                          opacity:
                            isAdjustingStyle
                              ? 0.55
                              : 1,

                          cursor:
                            isAdjustingStyle
                              ? "not-allowed"
                              : "pointer",
                        }}
                        onClick={() => {
                          if (
                            isAdjustingStyle
                          ) {
                            return;
                          }

                          setSelectedStyle(
                            option.id
                          );

                          setCustomStyleOpen(
                            false
                          );
                        }}
                      >
                        <span
                          style={
                            optionIconStyle
                          }
                        >
                          {
                            option.icon
                          }
                        </span>

                        <span>
                          {
                            t(`style.${option.id}`)
                          }
                        </span>
                      </button>
                    );
                  }
                )}
              </div>

              <button
                type="button"
                disabled={
                  isAdjustingStyle
                }
                onClick={() => {
                  if (
                    isAdjustingStyle
                  ) {
                    return;
                  }

                  setCustomStyleOpen(
                    (current) =>
                      !current
                  );

                  setSelectedStyle(
                    null
                  );
                }}
                style={{
                  ...optionButtonStyle(
                    customStyleOpen
                  ),

                  marginTop: 8,

                  justifyContent:
                    "space-between",

                  opacity:
                    isAdjustingStyle
                      ? 0.55
                      : 1,

                  cursor:
                    isAdjustingStyle
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems:
                      "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={
                      optionIconStyle
                    }
                  >
                    ✎
                  </span>

                  <span>
                    {t("property.customStyle")}
                  </span>
                </span>

                <span>
                  {customStyleOpen
                    ? "⌃"
                    : "›"}
                </span>
              </button>

              {customStyleOpen && (
                <div
                  style={{
                    marginTop: 8,
                  }}
                >
                  <textarea
                    value={
                      customStyleText
                    }
                    disabled={
                      isAdjustingStyle
                    }
                    onChange={(
                      event
                    ) => {
                      setCustomStyleText(
                        event.target.value
                      );
                    }}
                    placeholder={t("property.customStylePlaceholder")}
                    style={{
                      width: "100%",
                      minHeight: 90,

                      padding: 10,

                      border:
                        "1px solid #dfe2e8",

                      borderRadius: 8,

                      outline: "none",
                      resize: "vertical",

                      boxSizing:
                        "border-box",

                      fontFamily:
                        "inherit",

                      fontSize: 11,
                      lineHeight:
                        "18px",

                      opacity:
                        isAdjustingStyle
                          ? 0.6
                          : 1,

                      cursor:
                        isAdjustingStyle
                          ? "not-allowed"
                          : "text",
                    }}
                  />

                  <button
                    type="button"
                    onClick={
                      handleApplyCustomStyle
                    }
                    disabled={
                      !canApplyCustomStyle
                    }
                    style={{
                      ...primaryButtonStyle,

                      width: "100%",
                      marginTop: 8,

                      opacity:
                        canApplyCustomStyle
                          ? 1
                          : 0.45,

                      cursor:
                        canApplyCustomStyle
                          ? "pointer"
                          : "not-allowed",
                    }}
                  >
                    {isAdjustingStyle
                      ? t("common.processing")
                      : t("property.applyCustomStyle")}
                  </button>
                </div>
              )}

              {!customStyleOpen && (
                <button
                  type="button"
                  onClick={
                    handleApplyStyle
                  }
                  disabled={
                    !canApplyPresetStyle
                  }
                  style={{
                    ...primaryButtonStyle,

                    width: "100%",
                    marginTop: 12,

                    opacity:
                      canApplyPresetStyle
                        ? 1
                        : 0.45,

                    cursor:
                      canApplyPresetStyle
                        ? "pointer"
                        : "not-allowed",
                  }}
                >
                  {isAdjustingStyle
                    ? t("common.processing")
                    : t("property.applyStyle")}
                </button>
              )}

              {adjustStyleError && (
                <div
                  style={
                    errorMessageStyle
                  }
                >
                  {
                    adjustStyleError
                  }
                </div>
              )}
                </section>
              </>
            )}
          </>
        )}

      {/* 双模块操作 */}
      {isMultipleSelection && (
        <section>
          <h3
            style={
              sectionTitleStyle
            }
          >
            {t("property.multiTitle")}
          </h3>

          <div
            style={
              sectionDescriptionStyle
            }
          >
            {t("property.twoSelected")}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "1fr 1fr",
              gap: 8,
            }}
          >
            <button
              type="button"
              disabled={
                isApplyingMultiAction
              }
              style={{
                ...optionButtonStyle(
                  selectedMultiAction ===
                    "connect"
                ),

                opacity:
                  isApplyingMultiAction
                    ? 0.55
                    : 1,
              }}
              onClick={() => {
                setSelectedMultiAction(
                  "connect"
                );
              }}
            >
              <span
                style={
                  optionIconStyle
                }
              >
                ↗
              </span>

              <span>{t("property.concatenate")}</span>
            </button>

            <button
              type="button"
              disabled={
                isApplyingMultiAction
              }
              style={{
                ...optionButtonStyle(
                  selectedMultiAction ===
                    "merge"
                ),

                opacity:
                  isApplyingMultiAction
                    ? 0.55
                    : 1,
              }}
              onClick={() => {
                setSelectedMultiAction(
                  "merge"
                );
              }}
            >
              <span
                style={
                  optionIconStyle
                }
              >
                ▣
              </span>

              <span>{t("property.merge")}</span>
            </button>

            <button
              type="button"
              disabled={
                isApplyingMultiAction
              }
              style={{
                ...optionButtonStyle(
                  selectedMultiAction ===
                    "imitate"
                ),

                opacity:
                  isApplyingMultiAction
                    ? 0.55
                    : 1,
              }}
              onClick={() => {
                setSelectedMultiAction(
                  "imitate"
                );
              }}
            >
              <span
                style={
                  optionIconStyle
                }
              >
                Aa
              </span>

              <span>{t("property.imitate")}</span>
            </button>

            <button
              type="button"
              disabled={
                isApplyingMultiAction
              }
              style={{
                ...optionButtonStyle(
                  selectedMultiAction ===
                    "relation"
                ),

                opacity:
                  isApplyingMultiAction
                    ? 0.55
                    : 1,
              }}
              onClick={() => {
                setSelectedMultiAction(
                  "relation"
                );
              }}
            >
              <span
                style={
                  optionIconStyle
                }
              >
                ⌘
              </span>

              <span>
                {t("property.relate")}
              </span>
            </button>
          </div>

          {/* 融合长度 */}
          {selectedMultiAction ===
            "merge" && (
            <div
              style={{
                marginTop: 10,
                padding: 12,

                border:
                  "1px solid #e1e4eb",

                borderRadius: 9,

                background:
                  "#fafafa",
              }}
            >
              <div
                style={{
                  marginBottom: 4,

                  display: "flex",
                  justifyContent:
                    "space-between",

                  fontSize: 11,
                  color: "#666",
                }}
              >
                <span>{t("property.shorter")}</span>
                <span>{t("property.medium")}</span>
                <span>{t("property.longer")}</span>
              </div>

              <input
                type="range"
                min="-100"
                max="100"
                step="10"
                value={
                  mergeLength
                }
                disabled={
                  isApplyingMultiAction
                }
                onChange={(
                  event
                ) => {
                  setMergeLength(
                    Number(
                      event.target.value
                    )
                  );
                }}
                style={{
                  width: "100%",

                  accentColor:
                    "#536ff5",

                  cursor:
                    isApplyingMultiAction
                      ? "not-allowed"
                      : "pointer",
                }}
              />

              <div
                style={{
                  marginTop: 8,

                  textAlign:
                    "center",

                  fontSize: 12,
                  color: "#555",
                }}
              >
                {mergeLength > 0
                  ? "+"
                  : ""}

                {mergeLength}%
              </div>
            </div>
          )}

          {/* 关系类型 */}
          {selectedMultiAction ===
            "relation" && (
            <div
              style={{
                marginTop: 10,
                padding: 12,

                border:
                  "1px solid #e1e4eb",

                borderRadius: 9,

                background:
                  "#fafafa",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr 1fr",
                  gap: 8,
                }}
              >
                {RELATION_OPTIONS.map(
                  (option) => (
                    <button
                      key={
                        option.id
                      }
                      type="button"
                      disabled={
                        isApplyingMultiAction
                      }
                      style={relationButtonStyle(
                        relationType ===
                          option.id
                      )}
                      onClick={() => {
                        setRelationType(
                          option.id
                        );
                      }}
                    >
                      {
                        t(`relation.${option.id}`)
                      }
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={
              !canApplyMultiAction
            }
            onClick={
              handleApplyMultiAction
            }
            style={{
              ...primaryButtonStyle,

              width: "100%",
              marginTop: 12,

              opacity:
                canApplyMultiAction
                  ? 1
                  : 0.45,

              cursor:
                canApplyMultiAction
                  ? "pointer"
                  : "not-allowed",
            }}
          >
            {isApplyingMultiAction
              ? t("common.processing")
              : t("property.applySelected")}
          </button>

          {multiActionError && (
            <div
              style={
                errorMessageStyle
              }
            >
              {
                multiActionError
              }
            </div>
          )}
        </section>
      )}

      {activeBlocks.length > 2 && (
        <div
          style={{
            padding: 12,

            border:
              "1px solid #e4e7ef",

            borderRadius: 8,

            background:
              "#fafbff",

            color: "#666",

            fontSize: 12,
            lineHeight: "18px",
          }}
        >
          {t("property.tooMany")}
        </div>
      )}
    </aside>
  );
}
