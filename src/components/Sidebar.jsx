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

import FloatingPaletteWindow from "./FloatingPaletteWindow.jsx";
import { useI18n } from "../i18n.jsx";
import {
  SEMANTIC_BLOCK_MIME,
  WRITING_BLOCK_MIME,
  clearActiveTemplateDragData,
  setActiveTemplateDragData,
} from "../utils/templateDrag.js";

const BLOCK_TYPE_LABELS = {
  Title: "标题",
  Claim: "论点",
  Evidence: "证据",
  Reason: "解释",
  Counter: "反论",
  Compare: "对比",
  Conclusion: "总结",
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
  "writing-interface-default-block-template-overrides-v2";

const LEGACY_PALETTE_WIDTH_STORAGE_KEY =
  "writing-interface-palette-width";

const LABEL_PALETTE_WIDTH_STORAGE_KEY =
  "writing-interface-label-palette-width-v2";

const TEMPLATE_ORDER_STORAGE_KEY =
  "writing-interface-label-template-order";

const TEMPLATE_ORDER_VERSION_STORAGE_KEY =
  "writing-interface-label-template-order-version";

const CURRENT_TEMPLATE_ORDER_VERSION =
  "eight-default-modules-v1";

function loadTemplateOrder() {
  try {
    const savedVersion =
      window.localStorage.getItem(
        TEMPLATE_ORDER_VERSION_STORAGE_KEY
      );

    if (
      savedVersion !==
      CURRENT_TEMPLATE_ORDER_VERSION
    ) {
      window.localStorage.setItem(
        TEMPLATE_ORDER_VERSION_STORAGE_KEY,
        CURRENT_TEMPLATE_ORDER_VERSION
      );
      window.localStorage.removeItem(
        TEMPLATE_ORDER_STORAGE_KEY
      );
      return [];
    }

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

  return 136;
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
 * 左侧标签栏只展示标题及五个论证模块。
 * constants.js 仍保留其余历史类型的配置，
 * 避免影响画布上已经存在的旧模块。
 */
const DEFAULT_SIDEBAR_TYPES =
  new Set([
    "Title",
    "Claim",
    "Reason",
    "Evidence",
    "Counter",
    "Conclusion",
  ]);

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
          "string"
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
  item,
  displayLabel
) {
  return {
    id: null,

    type:
      item.type,

    label:
      displayLabel || item.label || getTypeLabel(item.type),

    color:
      item.color ||
      "#7c83fd",

    fill:
      item.fill ||
      "#ffffff",

    text:
      item.text ||
      displayLabel || item.label || getTypeLabel(item.type),

    placement:
      "inline",

    isCustom:
      item.isCustom ===
      true,
  };
}

function setTransparentNativeDragImage(
  event
) {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer || typeof document === "undefined") return;

  const transparentCanvas = document.createElement("canvas");
  transparentCanvas.width = 1;
  transparentCanvas.height = 1;
  Object.assign(transparentCanvas.style, {
    position: "fixed",
    left: "-10000px",
    top: "-10000px",
    pointerEvents: "none",
  });
  document.body.appendChild(transparentCanvas);
  dataTransfer.setDragImage(transparentCanvas, 0, 0);
  window.setTimeout(() => transparentCanvas.remove(), 0);
}

/**
 * Chrome/macOS 会自行缩放原生 drag image，因此即便 Canvas 数值与
 * 落地模块相同，屏幕上仍会大一圈。这里隐藏原生影像，改用页面内 DOM
 * 跟随鼠标。预览先使用白色画布 inline 模块的真实排版参数
 * 进行一次 DOM 布局，再读取 offsetWidth/offsetHeight 作为最终尺寸。
 * 这样宽高始终由文字包裹决定，不再继承标签栏或灰色 floating 模块的最小宽高。
 */
function createTemplateDragPreview(
  event,
  item,
  displayLabel,
  zoom = 1
) {
  const sourceElement =
    event.currentTarget;

  if (
    !sourceElement ||
    typeof document === "undefined"
  ) {
    return null;
  }

  const sourceRect =
    sourceElement.getBoundingClientRect();

  const sourceStyle =
    window.getComputedStyle(
      sourceElement
    );

  const labelText =
    String(
      displayLabel ||
        item.label ||
        item.type ||
        ""
    );

  const isTitleBlock =
    item.type === "Title";
  const visualScale =
    Number.isFinite(Number(zoom)) && Number(zoom) > 0
      ? Number(zoom)
      : 1;

  const sourcePointerRatioX =
    Math.max(
      0,
      Math.min(
        1,
        (event.clientX - sourceRect.left) /
          Math.max(1, sourceRect.width)
      )
    );
  const sourcePointerRatioY =
    Math.max(
      0,
      Math.min(
        1,
        (event.clientY - sourceRect.top) /
          Math.max(1, sourceRect.height)
      )
    );
  const previewElement = document.createElement("div");
  previewElement.dataset.templateDragPreview = "true";
  previewElement.textContent = labelText;
  Object.assign(previewElement.style, {
    position: "fixed",
    left: "-10000px",
    top: "-10000px",
    display: "inline-block",
    width: "max-content",
    minWidth: "0",
    minHeight: "0",
    maxWidth: "280px",
    padding: isTitleBlock
      ? "1px 12px 3px"
      : "2px 8px",
    boxSizing: "border-box",
    border: `1px solid color-mix(in srgb, ${item.color || "#7c83fd"} 52%, white)`,
    borderRadius: "8px",
    background: item.fill || createSoftFillColor(item.color),
    boxShadow: "none",
    color: "#202124",
    fontFamily: sourceStyle.fontFamily || "sans-serif",
    fontSize: isTitleBlock
      ? "20px"
      : "16px",
    fontWeight: isTitleBlock
      ? "700"
      : "400",
    lineHeight: isTitleBlock
      ? "26px"
      : "24px",
    whiteSpace: "pre",
    pointerEvents: "none",
    userSelect: "none",
    zIndex: "2147483647",
    opacity: "1",
    visibility: "hidden",
    transform: "none",
    transformOrigin: "top left",
  });

  const badgeElement = document.createElement("div");
  badgeElement.textContent = labelText;
  Object.assign(badgeElement.style, {
    position: "absolute",
    left: "7px",
    top: isTitleBlock
      ? "-14px"
      : "-12px",
    height: isTitleBlock
      ? "18px"
      : "16px",
    maxWidth: "calc(100% - 8px)",
    padding: isTitleBlock
      ? "0 8px"
      : "0 6px",
    boxSizing: "border-box",
    borderRadius: "5px",
    background: item.color || "#7c83fd",
    color: "#fff",
    fontSize: isTitleBlock
      ? "10px"
      : "9px",
    fontWeight: isTitleBlock
      ? "700"
      : "600",
    lineHeight: isTitleBlock
      ? "18px"
      : "16px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    pointerEvents: "none",
  });
  previewElement.appendChild(badgeElement);
  document.body.appendChild(previewElement);

  // 浏览器完成文字排版后再取尺寸，确保预览框紧贴实际文字。
  const bodyWidth = previewElement.offsetWidth;
  const bodyHeight = previewElement.offsetHeight;
  const hotspotX =
    sourcePointerRatioX *
    bodyWidth *
    visualScale;
  const hotspotY =
    sourcePointerRatioY *
    bodyHeight *
    visualScale;

  previewElement.style.transform =
    `scale(${visualScale})`;
  previewElement.style.visibility =
    "visible";

  const update = (clientX, clientY) => {
    if (clientX <= 0 || clientY <= 0) return;
    previewElement.style.left = `${clientX - hotspotX}px`;
    previewElement.style.top = `${clientY - hotspotY}px`;
  };
  update(event.clientX, event.clientY);

  return {
    update,
    remove() {
      previewElement.remove();
    },
  };
}

export default function Sidebar({
  zoom = 1,
  customTemplates = [],

  onTemplateMouseDown,
  onTemplateDragEnd,

  onAddCustomTemplate,
  onDeleteCustomTemplate,
  onUpdateCustomTemplate,
}) {
  const { blockTypeLabel, t } = useI18n();
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

  const getDisplayTypeLabel = (item) => {
    if (!item) return t("app.module");
    const hasUserLabel = item.isCustom === true || Boolean(
      defaultTemplateOverrides[item.type]?.label
    );
    return hasUserLabel
      ? item.label || item.type
      : blockTypeLabel(item.type, item.label || item.type);
  };

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

  const handleSharedPaletteWidthChange =
    (nextWidth) => {
      setLabelPaletteWidth(
        nextWidth
      );
    };

  /**
   * pending：刚开始拖拽，尚未判断意图；
   * reorder：在 Sidebar 内纵向调整；
   * canvas：向右拖往画布，一旦进入就不会再误触排序。
   */
  const templateDragGestureRef =
    useRef(null);

  /** 高频拖拽坐标不进入 React state，避免每一帧重渲染整列标签。 */
  const templateDragPreviewRef =
    useRef(null);

  const clearTemplateDragPreview = () => {
    templateDragPreviewRef.current?.remove?.();
    templateDragPreviewRef.current = null;
  };

  useEffect(() => {
    return clearTemplateDragPreview;
  }, []);

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

  const defaultTemplates = BLOCK_TYPES.filter(
    (item) =>
      DEFAULT_SIDEBAR_TYPES.has(
        item.type
      ) &&
      !hiddenDefaultTypeSet.has(
        item.type
      )
  ).map((item) => {
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

    ...customTemplates.filter(
      (item) => {
        const normalizedLabel = String(
          item?.label || item?.type || ""
        ).trim();

        return ![
          "标题",
          "论点",
          "原因",
          "解释",
          "证据",
          "反论",
          "对比",
          "过渡",
          "结论",
          "总结",
        ].includes(normalizedLabel);
      }
    ).map(
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
          t("sidebar.nameRequired")
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
              getDisplayTypeLabel(item)
            ).toLowerCase() ===
            trimmedName.toLowerCase()
        );

      if (duplicated) {
        setErrorText(
          t("sidebar.nameExists")
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
        getDisplayTypeLabel(item)
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
          item,
          getDisplayTypeLabel(item)
        );

      const serializedData =
        JSON.stringify(
          moduleData
        );

      event.dataTransfer.effectAllowed =
        "copy";

      setActiveTemplateDragData(
        moduleData
      );

      templateDragGestureRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        intent: "pending",
      };

      event.dataTransfer.setData(
        WRITING_BLOCK_MIME,
        serializedData
      );

      event.dataTransfer.setData(
        SEMANTIC_BLOCK_MIME,
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
       * 原生拖拽影像保持透明，只保留系统 copy 加号；页面内跟随预览
       * 使用与落地模块相同的 CSS，绕开 macOS 对 drag image 的缩放。
       */
      clearTemplateDragPreview();
      setTransparentNativeDragImage(
        event
      );
      templateDragPreviewRef.current =
        createTemplateDragPreview(
        event,
        item,
        moduleData.label ||
          moduleData.type,
        zoom
      );

      /**
       * 必须等原生 dragstart 真正发生后再写 React 状态。
       * mouseDown 阶段更新会让拖拽源提前重渲染，删除过画布模块后尤其
       * 容易导致浏览器丢失拖拽源或回弹。
       */
      onTemplateMouseDown?.(
        item
      );
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
        storageKey="writing-interface-label-palette-position-v2"
        defaultPosition={{
          x: 18,
          y: 44,
        }}
        width={labelPaletteWidth}
        onWidthChange={
          handleSharedPaletteWidthChange
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
              fontSize: 11,
              fontWeight: 600,
              color: "#555",
            }}
          >
            {t("sidebar.labels")}
          </span>

          <button
            type="button"

            title={t("sidebar.addLabel")}

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
                 * 明显横向移出标签列说明目标是画布。左右两侧灰色区域
                 * 都是合法放置区，因此不能只识别向右移动。一旦锁定为 canvas，
                 * 即使指针短暂经过其他 Sidebar 项也不再触发排序。
                 */
                if (
                  gesture.intent ===
                    "canvas" ||
                  Math.abs(
                    horizontalDistance
                  ) > 24
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
                  templateDragPreviewRef.current?.update?.(
                    event.clientX,
                    event.clientY
                  );

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
                    Math.abs(
                      event.clientX -
                        gesture.startX
                    ) > 24
                  ) {
                    gesture.intent =
                      "canvas";
                    setTemplateDropIndicatorKey(
                      null
                    );
                  }
                }}

                title={t("sidebar.dragToCanvas")}

                style={{
                  flex: 1,

                  minWidth:
                    0,

                  height:
                    32,

                  padding:
                    "0 50px 0 7px",

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
                    13,

                  fontWeight:
                    400,

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
                  clearTemplateDragPreview();
                  onTemplateDragEnd?.();

                  /**
                   * 某些浏览器会在 drop 的收尾阶段先派发 dragend。
                   * 延迟一帧清理，保证 drop 仍可读取同步备份。
                   */
                  window.setTimeout(
                    clearActiveTemplateDragData,
                    0
                  );
                  event.currentTarget.style.cursor =
                    "grab";
                }}
              >
                {getDisplayTypeLabel(item)}
              </button>

              <button
                type="button"
                title={t("sidebar.editLabel")}
                aria-label={t("sidebar.editLabelTitle", {
                  label: getDisplayTypeLabel(item),
                })}
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
              {(
                <button
                  type="button"

                  title={t("sidebar.deleteLabel")}

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
                      window.confirm(t("sidebar.deleteConfirm", {
                        label: getDisplayTypeLabel(item),
                      }));

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
                  ? t("sidebar.editLabel")
                  : t("sidebar.addLabel")}
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
              {t("sidebar.labelName")}
            </label>

            <input
              autoFocus

              value={
                newTypeName
              }

              maxLength={
                30
              }

              placeholder={t("sidebar.labelNamePlaceholder")}

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
              {t("sidebar.labelColor")}
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
                title={t("sidebar.customColor")}

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
                {t("common.cancel")}
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
                  ? t("common.save")
                  : t("common.add")}
              </button>
            </div>
          </div>
          </>,
          document.body
        )}
    </div>
  );
}
