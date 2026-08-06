export const PAGE_WIDTH = 900;
export const PAGE_HEIGHT = 1273;

export const CONTENT_WIDTH = 800;
export const CONTENT_LEFT =
  (PAGE_WIDTH - CONTENT_WIDTH) / 2;

export const CONTENT_TOP = 70;
export const CONTENT_HEIGHT = 1090;

export const ROW_HEIGHT = 58;
export const BLOCK_HEIGHT = 40;
export const BLOCK_WIDTH = CONTENT_WIDTH;

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;
export const ZOOM_STEP = 0.1;

export const BLOCK_TYPES = [
  {
    type: "Title",
    label: "标题",
    color: "#374151",
    fill: "#f3f4f6",
    width: 220,
  },

  {
    type: "Claim",
    label: "论点",
    color: "#ef7f7f",
    fill: "#fdeaea",
  },

  {
    type: "Evidence",
    label: "证据",
    color: "#f2a55f",
    fill: "#fef1e3",
  },

  {
    type: "Reason",
    label: "推理",
    color: "#56c7ad",
    fill: "#e7f8f3",
  },

  {
    type: "Counter",
    label: "反论",
    color: "#c98af0",
    fill: "#f5eafb",
  },

  {
    type: "Conclusion",
    label: "结论",
    color: "#6b86f0",
    fill: "#e9eeff",
  },

  {
    type: "Question",
    label: "问题",
    color: "#78c76b",
    fill: "#edf8ea",
  },

  {
    type: "Generated",
    label: "生成",
    color: "#4b5563",
    fill: "#f3f4f6",
  },

  {
    type: "Transition",
    label: "过渡",
    color: "#2aa198",
    fill: "#e6f7f5",
  },

  {
    type: "Merged",
    label: "融合",
    color: "#7c5dfa",
    fill: "#f2edff",
  },
];

/**
 * 根据模块类型获取配置。
 */
export function getBlockTypeConfig(type) {
  return (
    BLOCK_TYPES.find(
      (item) =>
        item.type === type
    ) || null
  );
}

/**
 * 根据模块类型获取中文标签。
 */
export function getBlockTypeLabel(type) {
  return (
    getBlockTypeConfig(type)?.label ||
    type ||
    "模块"
  );
}
