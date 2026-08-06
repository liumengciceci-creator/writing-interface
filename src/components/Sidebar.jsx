import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createPortal,
} from "react-dom";

import {
  BLOCK_TYPES,
} from "../constants";

import InstructionPalette from "./InstructionPalette.jsx";
import FloatingPaletteWindow from "./FloatingPaletteWindow.jsx";

const BLOCK_TYPE_LABELS = {
  Title: "标题",
  Claim: "论点",
  Evidence: "证据",
  Reason: "推理",
  Counter: "反论",
  Conclusion: "结论",
  Question: "问题",
  Generated: "生成",
  Transition: "过渡",
  Merged: "融合",
};

function getTypeLabel(type) {
  return (
    BLOCK_TYPE_LABELS[
      type
    ] ||
    type ||
    "标签"
  );
}

const CUSTOM_COLORS = [
  "#ef6b6b",
  "#f59a45",
  "#f2c94c",
  "#67c65c",
  "#42c7b5",
  "#5b7cfa",
  "#b76cf0",
];

const HIDDEN_DEFAULT_TEMPLATES_STORAGE_KEY =
  "writing-interface-hidden-default-block-templates";

const DEFAULT_TEMPLATE_OVERRIDES_STORAGE_KEY =
  "writing-interface-default-block-template-overrides";

const LEGACY_PALETTE_WIDTH_STORAGE_KEY =
  "writing-interface-palette-width";

const LABEL_PALETTE_WIDTH_STORAGE_KEY =
  "writing-interface-label-palette-width";

const INSTRUCTION_PALETTE_WIDTH_STORAGE_KEY =
  "writing-interface-instruction-palette-width";

const TEMPLATE_ORDER_STORAGE_KEY =
  "writing-interface-label-template-order";

function loadTemplateOrder() {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(
        TEMPLATE_ORDER_STORAGE_KEY
      ) || "[]"
    );
    return Array.isArray(parsed)
      ? parsed.map(String)
      : [];
  } catch {
    return [];
  }
}

function getTemplateOrderKey(item) {
  return item?.isCustom
    ? `custom:${item.id}`
    : `default:${item.type}`;
}

function loadPaletteWidth(storageKey) {
  try {
    const storedValue =
      window.localStorage.getItem(
        storageKey
      ) ??
      window.localStorage.getItem(
        LEGACY_PALETTE_WIDTH_STORAGE_KEY
      );

    const savedWidth =
      Number(storedValue);

    if (Number.isFinite(savedWidth)) {
      return Math.min(
        360,
        Math.max(
          128,
          savedWidth
        )
      );
    }
  } catch {
    // 使用默认宽度。
  }

  return 152;
}

function loadDefaultTemplateOverrides() {
  try {
    const savedValue =
      window.localStorage.getItem(
        DEFAULT_TEMPLATE_OVERRIDES_STORAGE_KEY
      );

    if (!savedValue) {
      return {};
    }

    const parsedValue =
      JSON.parse(savedValue);

    return parsedValue &&
      typeof parsedValue ===
        "object" &&
      !Array.isArray(parsedValue)
      ? parsedValue
      : {};
  } catch {
    return {};
  }
}

/**
 * 这三类不再显示在默认标签栏中。
 * 仍保留 constants.js 中的类型配置，
 * 避免影响画布上已经存在的旧模块。
 */
const DEFAULT_SIDEBAR_EXCLUDED_TYPES =
  new Set([
    "Generated",
    "Reason",
    "Question",
    "Merged",
  ]);

/**
 * 标题是系统内置的固定默认模块。
 * 在这里直接声明，避免旧版 localStorage 的隐藏列表或模板覆盖
 * 导致升级后看不到新加入的标题模块。
 */
const DEFAULT_TITLE_TEMPLATE = {
  type: "Title",
  label: "标题",
  color: "#374151",
  fill: "#f3f4f6",
  width: 220,
};

function loadHiddenDefaultTypes() {
  try {
    const savedValue =
      window.localStorage.getItem(
        HIDDEN_DEFAULT_TEMPLATES_STORAGE_KEY
      );

    if (!savedValue) {
      return [];
    }

    const parsedValue =
      JSON.parse(savedValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter(
      (type) =>
        typeof type ===
          "string" &&
        type !== "Title"
    );
  } catch (error) {
    console.error(
      "读取已删除的默认标签失败：",
      error
    );

    return [];
  }
}

function clampColorValue(
  value,
  minimum,
  maximum
) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value
    )
  );
}

function normalizeHexColor(value) {
  const normalized =
    String(value || "")
      .trim()
      .replace(/^#/, "");

  if (
    /^[0-9a-fA-F]{3}$/.test(
      normalized
    )
  ) {
    return `#${normalized
      .split("")
      .map(
        (character) =>
          `${character}${character}`
      )
      .join("")}`.toUpperCase();
  }

  if (
    /^[0-9a-fA-F]{6}$/.test(
      normalized
    )
  ) {
    return `#${normalized}`.toUpperCase();
  }

  return null;
}

/**
 * 将标签边框色与白色混合，生成同色系浅底色。
 * 既能看出颜色，又不会影响文字可读性。
 */
function createSoftFillColor(
  color
) {
  const normalized =
    normalizeHexColor(color) ||
    "#7C83FD";

  const colorRatio = 0.14;
  const whiteRatio =
    1 - colorRatio;

  const mixChannel =
    (startIndex) => {
      const channel =
        Number.parseInt(
          normalized.slice(
            startIndex,
            startIndex + 2
          ),
          16
        );

      return Math.round(
        channel * colorRatio +
          255 * whiteRatio
      )
        .toString(16)
        .padStart(2, "0")
        .toUpperCase();
    };

  return `#${mixChannel(
    1
  )}${mixChannel(3)}${mixChannel(
    5
  )}`;
}

function hexToHsv(hexColor) {
  const normalized =
    normalizeHexColor(
      hexColor
    ) || "#42C7B5";

  const red =
    Number.parseInt(
      normalized.slice(1, 3),
      16
    ) / 255;

  const green =
    Number.parseInt(
      normalized.slice(3, 5),
      16
    ) / 255;

  const blue =
    Number.parseInt(
      normalized.slice(5, 7),
      16
    ) / 255;

  const maximum =
    Math.max(
      red,
      green,
      blue
    );

  const minimum =
    Math.min(
      red,
      green,
      blue
    );

  const difference =
    maximum - minimum;

  let hue = 0;

  if (difference !== 0) {
    if (maximum === red) {
      hue =
        60 *
        (
          (
            green - blue
          ) /
            difference
        );
    } else if (
      maximum === green
    ) {
      hue =
        60 *
        (
          2 +
          (
            blue - red
          ) /
            difference
        );
    } else {
      hue =
        60 *
        (
          4 +
          (
            red - green
          ) /
            difference
        );
    }
  }

  if (hue < 0) {
    hue += 360;
  }

  return {
    hue,
    saturation:
      maximum === 0
        ? 0
        : (
            difference /
            maximum
          ) * 100,
    value:
      maximum * 100,
  };
}

function hsvToHex(
  hue,
  saturation,
  value
) {
  const safeHue =
    (
      hue % 360 +
      360
    ) % 360;

  const safeSaturation =
    clampColorValue(
      saturation,
      0,
      100
    ) / 100;

  const safeValue =
    clampColorValue(
      value,
      0,
      100
    ) / 100;

  const chroma =
    safeValue *
    safeSaturation;

  const section =
    safeHue / 60;

  const secondary =
    chroma *
    (
      1 -
      Math.abs(
        section % 2 -
          1
      )
    );

  const offset =
    safeValue - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (section < 1) {
    red = chroma;
    green = secondary;
  } else if (section < 2) {
    red = secondary;
    green = chroma;
  } else if (section < 3) {
    green = chroma;
    blue = secondary;
  } else if (section < 4) {
    green = secondary;
    blue = chroma;
  } else if (section < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }

  const toHex =
    (channel) =>
      Math.round(
        (
          channel + offset
        ) * 255
      )
        .toString(16)
        .padStart(2, "0")
        .toUpperCase();

  return `#${toHex(red)}${toHex(
    green
  )}${toHex(blue)}`;
}

export function ColorSpectrumPicker({
  color,
  onChange,
}) {
  const initialColor =
    hexToHsv(color);

  const [hue, setHue] =
    useState(
      initialColor.hue
    );

  const [
    saturation,
    setSaturation,
  ] = useState(
    initialColor.saturation
  );

  const [value, setValue] =
    useState(
      initialColor.value
    );

  const [
    hexDraft,
    setHexDraft,
  ] = useState(
    normalizeHexColor(color) ||
      "#42C7B5"
  );

  useEffect(() => {
    const localColor =
      hsvToHex(
        hue,
        saturation,
        value
      );

    const normalizedColor =
      normalizeHexColor(color);

    if (normalizedColor) {
      setHexDraft(
        normalizedColor
      );
    }

    if (
      !normalizedColor ||
      normalizedColor ===
        localColor
    ) {
      return;
    }

    const nextColor =
      hexToHsv(
        normalizedColor
      );

    setHue(nextColor.hue);
    setSaturation(
      nextColor.saturation
    );
    setValue(nextColor.value);
  }, [color]);

  const updateSaturationAndValue =
    (event) => {
      const rect =
        event.currentTarget
          .getBoundingClientRect();

      const nextSaturation =
        clampColorValue(
          (
            (
              event.clientX -
              rect.left
            ) /
            rect.width
          ) * 100,
          0,
          100
        );

      const nextValue =
        clampColorValue(
          100 -
            (
              (
                event.clientY -
                rect.top
              ) /
              rect.height
            ) * 100,
          0,
          100
        );

      setSaturation(
        nextSaturation
      );

      setValue(nextValue);

      onChange?.(
        hsvToHex(
          hue,
          nextSaturation,
          nextValue
        )
      );
    };

  const updateHue =
    (event) => {
      const rect =
        event.currentTarget
          .getBoundingClientRect();

      const nextHue =
        clampColorValue(
          (
            (
              event.clientX -
              rect.left
            ) /
            rect.width
          ) * 360,
          0,
          359.999
        );

      setHue(nextHue);

      onChange?.(
        hsvToHex(
          nextHue,
          saturation,
          value
        )
      );
    };

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        border:
          "1px solid #e2e2e2",
        borderRadius: 10,
        background: "#fafafa",
      }}
    >
      <div
        onPointerDown={(
          event
        ) => {
          event.currentTarget
            .setPointerCapture?.(
              event.pointerId
            );

          updateSaturationAndValue(
            event
          );
        }}
        onPointerMove={(
          event
        ) => {
          if (
            event.buttons === 0
          ) {
            return;
          }

          updateSaturationAndValue(
            event
          );
        }}
        style={{
          position: "relative",
          width: "100%",
          height: 132,
          borderRadius: 8,
          background:
            `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue}, 100%, 50%))`,
          cursor: "crosshair",
          touchAction: "none",
          boxShadow:
            "inset 0 0 0 1px rgba(0,0,0,0.12)",
        }}
      >
        <span
          style={{
            position: "absolute",
            left:
              `${saturation}%`,
            top:
              `${100 - value}%`,
            width: 14,
            height: 14,
            borderRadius: "50%",
            border:
              "2px solid #fff",
            boxShadow:
              "0 0 0 1px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.35)",
            transform:
              "translate(-50%, -50%)",
            pointerEvents: "none",
            boxSizing:
              "border-box",
          }}
        />
      </div>

      <div
        onPointerDown={(
          event
        ) => {
          event.currentTarget
            .setPointerCapture?.(
              event.pointerId
            );

          updateHue(event);
        }}
        onPointerMove={(
          event
        ) => {
          if (
            event.buttons === 0
          ) {
            return;
          }

          updateHue(event);
        }}
        style={{
          position: "relative",
          height: 14,
          marginTop: 12,
          borderRadius: 999,
          background:
            "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
          cursor: "crosshair",
          touchAction: "none",
          boxShadow:
            "inset 0 0 0 1px rgba(0,0,0,0.12)",
        }}
      >
        <span
          style={{
            position: "absolute",
            left:
              `${(hue / 360) * 100}%`,
            top: "50%",
            width: 12,
            height: 20,
            borderRadius: 5,
            border:
              "2px solid #fff",
            background:
              `hsl(${hue}, 100%, 50%)`,
            boxShadow:
              "0 0 0 1px rgba(0,0,0,0.35)",
            transform:
              "translate(-50%, -50%)",
            pointerEvents: "none",
            boxSizing:
              "border-box",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginTop: 12,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 30,
            height: 30,
            flex: "0 0 auto",
            borderRadius: 7,
            background: color,
            boxShadow:
              "inset 0 0 0 1px rgba(0,0,0,0.12)",
          }}
        />

        <input
          value={
            hexDraft
          }
          aria-label="十六进制颜色"
          onChange={(event) => {
            const draftValue =
              event.target.value;

            setHexDraft(
              draftValue
            );

            const nextColor =
              normalizeHexColor(
                draftValue
              );

            if (nextColor) {
              onChange?.(
                nextColor
              );
            }
          }}
          onBlur={() => {
            setHexDraft(
              normalizeHexColor(
                color
              ) || "#42C7B5"
            );
          }}
          style={{
            minWidth: 0,
            flex: 1,
            height: 32,
            padding: "0 9px",
            border:
              "1px solid #d5d5d5",
            borderRadius: 7,
            background: "#fff",
            color: "#333",
            fontSize: 13,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, monospace",
            boxSizing:
              "border-box",
            outline: "none",
          }}
        />
      </div>
    </div>
  );
}

/**
 * 生成拖拽时提供给编辑器的模块数据。
 */
function createDraggedModuleData(
  item
) {
  return {
    id: null,

    type:
      item.type,

    label:
      item.label ||
      getTypeLabel(
        item.type
      ),

    color:
      item.color ||
      "#7c83fd",

    fill:
      item.fill ||
      "#ffffff",

    text:
      item.text ||
      item.label ||
      getTypeLabel(
        item.type
      ),

    placement:
      "inline",

    isCustom:
      item.isCustom ===
      true,
  };
}

export default function Sidebar({
  customTemplates = [],

  onTemplateMouseDown,

  onAddCustomTemplate,
  onDeleteCustomTemplate,
  onUpdateCustomTemplate,
}) {
  const [
    showAddPanel,
    setShowAddPanel,
  ] = useState(false);

  const [
    newTypeName,
    setNewTypeName,
  ] = useState("");

  const [
    newColor,
    setNewColor,
  ] = useState(
    CUSTOM_COLORS[4]
  );

  const [
    showColorSpectrum,
    setShowColorSpectrum,
  ] = useState(false);

  const [
    errorText,
    setErrorText,
  ] = useState("");

  const [
    editingTemplate,
    setEditingTemplate,
  ] = useState(null);

  const [
    defaultTemplateOverrides,
    setDefaultTemplateOverrides,
  ] = useState(
    loadDefaultTemplateOverrides
  );

  const [
    hiddenDefaultTypes,
    setHiddenDefaultTypes,
  ] = useState(
    loadHiddenDefaultTypes
  );

  const [
    labelPaletteWidth,
    setLabelPaletteWidth,
  ] = useState(() =>
    loadPaletteWidth(
      LABEL_PALETTE_WIDTH_STORAGE_KEY
    )
  );

  const [
    instructionPaletteWidth,
    setInstructionPaletteWidth,
  ] = useState(() =>
    loadPaletteWidth(
      INSTRUCTION_PALETTE_WIDTH_STORAGE_KEY
    )
  );

  const [
    templateOrder,
    setTemplateOrder,
  ] = useState(
    loadTemplateOrder
  );

  const [
    reorderingTemplateKey,
    setReorderingTemplateKey,
  ] = useState(null);

  const [
    templateDropIndicatorKey,
    setTemplateDropIndicatorKey,
  ] = useState(null);

  const [
    templateDropIndicatorPlacement,
    setTemplateDropIndicatorPlacement,
  ] = useState("before");

  /**
   * pending：刚开始拖拽，尚未判断意图；
   * reorder：在 Sidebar 内纵向调整；
   * canvas：向右拖往画布，一旦进入就不会再误触排序。
   */
  const templateDragGestureRef =
    useRef(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        TEMPLATE_ORDER_STORAGE_KEY,
        JSON.stringify(
          templateOrder
        )
      );
    } catch {
      // 浏览器禁止存储时继续保留当前会话顺序。
    }
  }, [templateOrder]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LABEL_PALETTE_WIDTH_STORAGE_KEY,
        String(labelPaletteWidth)
      );
    } catch {
      // 浏览器禁止存储时继续使用当前宽度。
    }
  }, [labelPaletteWidth]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        INSTRUCTION_PALETTE_WIDTH_STORAGE_KEY,
        String(instructionPaletteWidth)
      );
    } catch {
      // 浏览器禁止存储时继续使用当前宽度。
    }
  }, [instructionPaletteWidth]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        HIDDEN_DEFAULT_TEMPLATES_STORAGE_KEY,
        JSON.stringify(
          hiddenDefaultTypes
        )
      );
    } catch (error) {
      console.error(
        "保存已删除的默认标签失败：",
        error
      );
    }
  }, [hiddenDefaultTypes]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        DEFAULT_TEMPLATE_OVERRIDES_STORAGE_KEY,
        JSON.stringify(
          defaultTemplateOverrides
        )
      );
    } catch {
      // 浏览器禁止存储时继续使用当前会话的修改。
    }
  }, [defaultTemplateOverrides]);

  const hiddenDefaultTypeSet =
    new Set(
      hiddenDefaultTypes
    );

  const defaultTemplates = [
    DEFAULT_TITLE_TEMPLATE,
    ...BLOCK_TYPES.filter(
      (item) =>
        item.type !== "Title" &&
        !DEFAULT_SIDEBAR_EXCLUDED_TYPES.has(
          item.type
        ) &&
        !hiddenDefaultTypeSet.has(
          item.type
        )
    ),
  ].map((item) => {
      const override =
        defaultTemplateOverrides[
          item.type
        ];

      return override
        ? {
            ...item,
            ...override,
          }
        : item;
    });

  const unsortedTemplates = [
    ...defaultTemplates.map(
      (item) => ({
        ...item,
        isCustom: false,
      })
    ),

    ...customTemplates.map(
      (item) => {
        const savedFill =
          typeof item.fill ===
          "string"
            ? item.fill.toLowerCase()
            : "";

        return {
          ...item,
          fill:
            !savedFill ||
            savedFill ===
              "#ffffff" ||
            savedFill ===
              "#fff"
              ? createSoftFillColor(
                  item.color
                )
              : item.fill,
          isCustom: true,
        };
      }
    ),
  ];

  const templateOrderIndex =
    new Map(
      templateOrder.map(
        (key, index) => [
          key,
          index,
        ]
      )
    );

  const allTemplates = [
    ...unsortedTemplates,
  ].sort((a, b) => {
    const aIndex =
      templateOrderIndex.has(
        getTemplateOrderKey(a)
      )
        ? templateOrderIndex.get(
            getTemplateOrderKey(a)
          )
        : a.type === "Title"
          ? -1
          : Number.MAX_SAFE_INTEGER;
    const bIndex =
      templateOrderIndex.has(
        getTemplateOrderKey(b)
      )
        ? templateOrderIndex.get(
            getTemplateOrderKey(b)
          )
        : b.type === "Title"
          ? -1
          : Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex;
  });

  const reorderTemplateAt =
    (
      targetItem,
      placeAfter = false
    ) => {
      if (!reorderingTemplateKey) {
        return;
      }

      const targetKey =
        getTemplateOrderKey(
          targetItem
        );

      if (
        !targetKey ||
        targetKey ===
          reorderingTemplateKey
      ) {
        return;
      }

      const visibleKeys =
        allTemplates.map(
          getTemplateOrderKey
        );
      const fromIndex =
        visibleKeys.indexOf(
          reorderingTemplateKey
        );
      const targetIndex =
        visibleKeys.indexOf(
          targetKey
        );

      if (
        fromIndex < 0 ||
        targetIndex < 0
      ) {
        return;
      }

      visibleKeys.splice(
        fromIndex,
        1
      );

      const remainingTargetIndex =
        visibleKeys.indexOf(
          targetKey
        );

      visibleKeys.splice(
        Math.max(
          0,
          remainingTargetIndex +
            (placeAfter ? 1 : 0)
        ),
        0,
        reorderingTemplateKey
      );
      setTemplateOrder(
        visibleKeys
      );
    };

  const closeAddPanel =
    () => {
      setShowAddPanel(
        false
      );

      setEditingTemplate(
        null
      );

      setNewTypeName("");

      setNewColor(
        CUSTOM_COLORS[4]
      );

      setShowColorSpectrum(
        false
      );

      setErrorText("");
    };

  const handleDeleteTemplate =
    (item) => {
      if (item?.type === "Title") {
        return;
      }

      if (item.isCustom) {
        onDeleteCustomTemplate?.(
          item.id
        );

        return;
      }

      setHiddenDefaultTypes(
        (currentTypes) =>
          currentTypes.includes(
            item.type
          )
            ? currentTypes
            : [
                ...currentTypes,
                item.type,
              ]
      );
    };

  const handleAddTemplate =
    () => {
      const trimmedName =
        newTypeName.trim();

      if (!trimmedName) {
        setErrorText(
          "请输入标签名称"
        );

        return;
      }

      const duplicated =
        allTemplates.some(
          (item) =>
            !(
              editingTemplate &&
              (item.isCustom
                ? item.id ===
                  editingTemplate.id
                : item.type ===
                  editingTemplate.type)
            ) &&
            String(
              item.label ||
                getTypeLabel(
                  item.type
                )
            ).toLowerCase() ===
            trimmedName.toLowerCase()
        );

      if (duplicated) {
        setErrorText(
          "这个标签名称已经存在"
        );

        return;
      }

      const nextTemplate = {
        type: trimmedName,

        label:
          trimmedName,

        color:
          newColor,

        fill:
          createSoftFillColor(
            newColor
          ),

        width:
          160,

        text:
          "",

        isCustom:
          true,
      };

      if (editingTemplate) {
        if (
          editingTemplate.isCustom
        ) {
          onUpdateCustomTemplate?.({
            ...nextTemplate,
            id:
              editingTemplate.id,
          });
        } else {
          setDefaultTemplateOverrides(
            (current) => ({
              ...current,
              [editingTemplate.type]: {
                label:
                  trimmedName,
                color:
                  newColor,
                fill:
                  createSoftFillColor(
                    newColor
                  ),
              },
            })
          );
        }
      } else {
        onAddCustomTemplate?.(
          nextTemplate
        );
      }

      closeAddPanel();
    };

  const openEditTemplate =
    (item) => {
      setEditingTemplate(item);
      setNewTypeName(
        item.label ||
          getTypeLabel(item.type)
      );
      setNewColor(
        item.color ||
          CUSTOM_COLORS[4]
      );
      setShowColorSpectrum(false);
      setErrorText("");
      setShowAddPanel(true);
    };

  /**
   * 开始原生 HTML 拖拽。
   *
   * SingleSemanticEditor 会读取这里写入的模块数据。
   */
  const handleNativeDragStart =
    (
      event,
      item
    ) => {
      if (
        !event.dataTransfer
      ) {
        return;
      }

      const moduleData =
        createDraggedModuleData(
          item
        );

      const serializedData =
        JSON.stringify(
          moduleData
        );

      event.dataTransfer.effectAllowed =
        "copy";

      templateDragGestureRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        intent: "pending",
      };

      event.dataTransfer.setData(
        "application/x-writing-block",
        serializedData
      );

      event.dataTransfer.setData(
        "application/x-semantic-block",
        serializedData
      );

      event.dataTransfer.setData(
        "application/json",
        serializedData
      );

      event.dataTransfer.setData(
        "text/plain",
        moduleData.label ||
          moduleData.type
      );

      /**
       * 使用原按钮的视觉副本作为拖拽分身。
       * 原模块不会移动，只有松手后才提交 Sidebar 排序。
       */
      const sourceElement =
        event.currentTarget;

      if (
        sourceElement instanceof
          HTMLElement
      ) {
        const sourceRect =
          sourceElement.getBoundingClientRect();

        const dragClone =
          sourceElement.cloneNode(true);

        dragClone.removeAttribute(
          "id"
        );
        dragClone.style.position =
          "fixed";
        dragClone.style.left =
          "-10000px";
        dragClone.style.top =
          "-10000px";
        dragClone.style.width =
          `${sourceRect.width}px`;
        dragClone.style.height =
          `${sourceRect.height}px`;
        dragClone.style.margin = "0";
        dragClone.style.opacity =
          "0.92";
        dragClone.style.boxShadow =
          "0 8px 18px rgba(15,23,42,0.18)";
        dragClone.style.pointerEvents =
          "none";
        dragClone.style.zIndex =
          "99999";

        document.body.appendChild(
          dragClone
        );

        event.dataTransfer.setDragImage(
          dragClone,
          Math.max(
            0,
            event.clientX -
              sourceRect.left
          ),
          Math.max(
            0,
            event.clientY -
              sourceRect.top
          )
        );

        window.requestAnimationFrame(
          () => {
            dragClone.remove();
          }
        );
      }
    };

  return (
    <div
      style={{
        padding:
          "24px 18px",

        position:
          "relative",
      }}
    >
      <FloatingPaletteWindow
        storageKey="writing-interface-label-palette-position"
        defaultPosition={{
          x: 18,
          y: 32,
        }}
        width={labelPaletteWidth}
        onWidthChange={
          setLabelPaletteWidth
        }
      >
      <div
        style={{
          width: "100%",

          background:
            "#f8f8f8",

          borderRadius:
            14,

          boxShadow:
            "0 2px 10px rgba(0,0,0,0.08)",

          padding:
            10,

          display:
            "flex",

          flexDirection:
            "column",

          gap:
            10,

          boxSizing:
            "border-box",
        }}
      >
        {/* 顶部标题和新增按钮 */}
        <div
          data-palette-drag-handle="true"
          style={{
            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "space-between",

            marginBottom:
              2,

            cursor:
              "grab",
          }}
        >
          <span
            style={{
              fontSize:
                11,

              fontWeight:
                600,

              color:
                "#555",
            }}
          >
            标签
          </span>

          <button
            type="button"

            title="添加自定义标签"

            onClick={() => {
              setEditingTemplate(
                null
              );

              setNewTypeName("");

              setNewColor(
                CUSTOM_COLORS[4]
              );

              setShowAddPanel(
                true
              );

              setErrorText("");
            }}

            style={{
              width: 26,
              height: 26,

              padding: 0,

              borderRadius:
                7,

              border:
                "1px solid #d7d7d7",

              background:
                "#fff",

              color:
                "#333",

              fontSize:
                20,

              lineHeight:
                "22px",

              cursor:
                "pointer",
            }}
          >
            +
          </button>
        </div>

        {/* 标签列表 */}
        {allTemplates.map(
          (item) => (
            <div
              key={`${
                item.isCustom
                  ? "custom"
                  : "default"
              }-${item.type}`}

              style={{
                position:
                  "relative",

                display:
                  "flex",

                alignItems:
                  "center",

                gap:
                  4,
              }}

              onDragOver={(event) => {
                if (
                  !reorderingTemplateKey
                ) {
                  return;
                }

                const gesture =
                  templateDragGestureRef.current;

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

                /**
                 * 明显向右移动说明目标是画布。一旦锁定为 canvas，
                 * 即使指针短暂经过其他 Sidebar 项也不再触发排序。
                 */
                if (
                  gesture.intent ===
                    "canvas" ||
                  horizontalDistance > 24
                ) {
                  gesture.intent =
                    "canvas";
                  setTemplateDropIndicatorKey(
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

                setTemplateDropIndicatorKey(
                  getTemplateOrderKey(
                    item
                  )
                );
                setTemplateDropIndicatorPlacement(
                  placeAfter
                    ? "after"
                    : "before"
                );
              }}

              onDrop={(event) => {
                const gesture =
                  templateDragGestureRef.current;

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

                reorderTemplateAt(
                  item,
                  event.clientY >=
                    targetRect.top +
                      targetRect.height / 2
                );

                setTemplateDropIndicatorKey(
                  null
                );
              }}
            >
              {templateDropIndicatorKey ===
                getTemplateOrderKey(
                  item
                ) && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: 2,
                    right: 2,
                    top:
                      templateDropIndicatorPlacement ===
                        "after"
                        ? "auto"
                        : -2,
                    bottom:
                      templateDropIndicatorPlacement ===
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

                /**
                 * 开启浏览器原生拖拽。
                 */
                draggable

                /**
                 * 保留旧的画布拖拽状态，
                 * 继续支持 preview 和 floating。
                 */
                onMouseDown={(
                  event
                ) => {
                  if (
                    event.button !==
                    0
                  ) {
                    return;
                  }

                  onTemplateMouseDown?.(
                    item
                  );
                }}

                /**
                 * 向新的 SingleSemanticEditor
                 * 提供模块数据。
                 */
                onDragStart={(
                  event
                ) => {
                  setReorderingTemplateKey(
                    getTemplateOrderKey(
                      item
                    )
                  );
                  handleNativeDragStart(
                    event,
                    item
                  );
                }}

                onDrag={(event) => {
                  const gesture =
                    templateDragGestureRef.current;

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
                    setTemplateDropIndicatorKey(
                      null
                    );
                  }
                }}

                title="拖动到画布"

                style={{
                  flex: 1,

                  minWidth:
                    0,

                  height:
                    item.type === "Title"
                      ? 40
                      : 32,

                  padding:
                    item.type === "Title"
                      ? "0 10px"
                      : "0 50px 0 7px",

                  borderRadius:
                    8,

                  border:
                    `1.5px solid ${item.color}`,

                  background:
                    item.fill ||
                    createSoftFillColor(
                      item.color
                    ),

                  color:
                    "#333",

                  fontSize:
                    item.type === "Title"
                      ? 16
                      : 13,

                  fontWeight:
                    item.type === "Title"
                      ? 700
                      : 400,

                  cursor:
                    "grab",

                  overflow:
                    "hidden",

                  textOverflow:
                    "ellipsis",

                  whiteSpace:
                    "nowrap",

                  boxSizing:
                    "border-box",

                  userSelect:
                    "none",

                  WebkitUserSelect:
                    "none",
                }}

                onDragEnd={(
                  event
                ) => {
                  setReorderingTemplateKey(
                    null
                  );
                  setTemplateDropIndicatorKey(
                    null
                  );
                  templateDragGestureRef.current =
                    null;
                  event.currentTarget.style.cursor =
                    "grab";
                }}
              >
                {getTypeLabel(
                  item.label ||
                    item.type
                )}
              </button>

              <button
                type="button"
                title="编辑标签"
                aria-label={`编辑标签 ${
                  item.label ||
                  getTypeLabel(item.type)
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openEditTemplate(item);
                }}
                style={{
                  display:
                    item.type === "Title"
                      ? "none"
                      : "block",
                  position: "absolute",
                  right: 27,
                  top: "50%",
                  width: 20,
                  height: 20,
                  padding: 0,
                  border: "none",
                  borderRadius: 5,
                  background:
                    "transparent",
                  color: "#777",
                  fontSize: 14,
                  lineHeight: "20px",
                  cursor: "pointer",
                  transform:
                    "translateY(-50%)",
                }}
              >
                ✎
              </button>

              {/* 默认标签和自定义标签都允许删除 */}
              {item.type !== "Title" && (
                <button
                  type="button"

                  title="删除标签"

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

                    const confirmed =
                      window.confirm(
                        `确定删除标签“${getTypeLabel(
                          item.type
                        )}”吗？\n已经放在画布上的模块不会被删除。`
                      );

                    if (
                      confirmed
                    ) {
                      handleDeleteTemplate(
                        item
                      );
                    }
                  }}

                  style={{
                    position:
                      "absolute",

                    right:
                      4,

                    top:
                      "50%",

                    transform:
                      "translateY(-50%)",

                    width:
                      20,

                    height:
                      20,

                    padding:
                      0,

                    border:
                      "none",

                    borderRadius:
                      5,

                    background:
                      "transparent",

                    color:
                      "#777",

                    fontSize:
                      15,

                    lineHeight:
                      "20px",

                    cursor:
                      "pointer",
                  }}
                >
                  ×
                </button>
              )}
            </div>
          )
        )}
      </div>

      </FloatingPaletteWindow>

      <InstructionPalette
        width={instructionPaletteWidth}
        onWidthChange={
          setInstructionPaletteWidth
        }
      />

      {/* 新增标签面板 */}
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
              position:
                "fixed",

              inset:
                0,

              zIndex:
                1999,

              background:
                "rgba(0,0,0,0.12)",
            }}
          />

          <div
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }

            style={{
              position:
                "fixed",

              zIndex:
                2000,

              left:
                "50%",

              top:
                "50%",

              transform:
                "translate(-50%, -50%)",

              width:
                320,

              padding:
                22,

              background:
                "#fff",

              borderRadius:
                14,

              boxShadow:
                "0 12px 40px rgba(0,0,0,0.18)",

              boxSizing:
                "border-box",
            }}
          >
            <div
              style={{
                display:
                  "flex",

                alignItems:
                  "center",

                justifyContent:
                  "space-between",

                marginBottom:
                  20,
              }}
            >
              <strong
                style={{
                  fontSize:
                    16,

                  color:
                    "#333",
                }}
              >
                {editingTemplate
                  ? "编辑标签"
                  : "添加自定义标签"}
              </strong>

              <button
                type="button"

                onClick={
                  closeAddPanel
                }

                style={{
                  border:
                    "none",

                  background:
                    "transparent",

                  color:
                    "#666",

                  fontSize:
                    22,

                  cursor:
                    "pointer",
                }}
              >
                ×
              </button>
            </div>

            <label
              style={{
                display:
                  "block",

                marginBottom:
                  8,

                fontSize:
                  13,

                color:
                  "#555",
              }}
            >
              标签名称
            </label>

            <input
              autoFocus

              value={
                newTypeName
              }

              maxLength={
                30
              }

              placeholder="例如：示例"

              onChange={(
                event
              ) => {
                setNewTypeName(
                  event.target
                    .value
                );

                setErrorText("");
              }}

              onKeyDown={(
                event
              ) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  event.preventDefault();

                  handleAddTemplate();
                }

                if (
                  event.key ===
                  "Escape"
                ) {
                  event.preventDefault();

                  closeAddPanel();
                }
              }}

              style={{
                width:
                  "100%",

                height:
                  38,

                padding:
                  "0 11px",

                borderRadius:
                  8,

                border:
                  errorText
                    ? "1.5px solid #e65d5d"
                    : "1px solid #d7d7d7",

                outline:
                  "none",

                fontSize:
                  14,

                boxSizing:
                  "border-box",
              }}
            />

            {errorText && (
              <div
                style={{
                  marginTop:
                    6,

                  fontSize:
                    12,

                  color:
                    "#e05252",
                }}
              >
                {errorText}
              </div>
            )}

            <div
              style={{
                marginTop:
                  18,

                marginBottom:
                  9,

                fontSize:
                  13,

                color:
                  "#555",
              }}
            >
              标签颜色
            </div>

            <div
              style={{
                display:
                  "flex",

                flexWrap:
                  "wrap",

                gap:
                  10,
              }}
            >
              {CUSTOM_COLORS.map(
                (color) => {
                  const selected =
                    color ===
                    newColor;

                  return (
                    <button
                      key={
                        color
                      }

                      type="button"

                      title={
                        color
                      }

                      onClick={() => {
                        setNewColor(
                          color
                        );

                        setShowColorSpectrum(
                          false
                        );
                      }}

                      style={{
                        width:
                          28,

                        height:
                          28,

                        padding:
                          0,

                        borderRadius:
                          8,

                        border:
                          selected
                            ? "3px solid #333"
                            : "2px solid transparent",

                        background:
                          color,

                        cursor:
                          "pointer",

                        boxSizing:
                          "border-box",
                      }}
                    />
                  );
                }
              )}

              <button
                type="button"
                title="打开自选色谱"

                onClick={() =>
                  setShowColorSpectrum(
                    (current) =>
                      !current
                  )
                }

                style={{
                  width:
                    28,

                  height:
                    28,

                  borderRadius:
                    "50%",

                  border:
                    showColorSpectrum
                      ? "2px solid #333"
                      : "2px solid #a8a8a8",

                  background:
                    "#fff",

                  color:
                    "#555",

                  fontSize:
                    22,

                  fontWeight:
                    400,

                  lineHeight:
                    "22px",

                  padding:
                    0,

                  cursor:
                    "pointer",

                  boxSizing:
                    "border-box",

                  display:
                    "flex",

                  alignItems:
                    "center",

                  justifyContent:
                    "center",
                }}
              >
                +
              </button>
            </div>

            {showColorSpectrum && (
              <ColorSpectrumPicker
                color={newColor}
                onChange={
                  setNewColor
                }
              />
            )}

            <div
              style={{
                display:
                  "flex",

                justifyContent:
                  "flex-end",

                gap:
                  10,

                marginTop:
                  24,
              }}
            >
              <button
                type="button"

                onClick={
                  closeAddPanel
                }

                style={{
                  height:
                    36,

                  padding:
                    "0 18px",

                  borderRadius:
                    8,

                  border:
                    "1px solid #d7d7d7",

                  background:
                    "#fff",

                  color:
                    "#555",

                  cursor:
                    "pointer",
                }}
              >
                取消
              </button>

              <button
                type="button"

                onClick={
                  handleAddTemplate
                }

                style={{
                  height:
                    36,

                  padding:
                    "0 18px",

                  borderRadius:
                    8,

                  border:
                    "none",

                  background:
                    "#333",

                  color:
                    "#fff",

                  cursor:
                    "pointer",
                }}
              >
                {editingTemplate
                  ? "保存"
                  : "添加"}
              </button>
            </div>
          </div>
          </>,
          document.body
        )}
    </div>
  );
}
