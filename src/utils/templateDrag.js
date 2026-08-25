export const WRITING_BLOCK_MIME =
  "application/x-writing-block";

export const SEMANTIC_BLOCK_MIME =
  "application/x-semantic-block";

let activeTemplateDragData = null;

/**
 * Sidebar 拖拽预览和灰色工作区落地模块必须共用同一宽度算法，
 * 否则松手前后会发生尺寸跳变。
 */
export function getTemplateFloatingWidth(
  text
) {
  const value = String(text || "");
  let estimatedTextWidth = 0;

  for (const character of value) {
    estimatedTextWidth +=
      /[\u4e00-\u9fff]/.test(character)
        ? 16
        : 8;
  }

  return Math.min(
    280,
    Math.max(
      72,
      estimatedTextWidth + 32
    )
  );
}

/**
 * DataTransfer 在部分浏览器中会在 drop / dragend 的交界处提前失效。
 * 同步保留本次标签拖拽的数据，使删除最后一个画布模块后的下一次拖拽
 * 仍然可以可靠创建新模块。
 */
export function setActiveTemplateDragData(
  template
) {
  activeTemplateDragData =
    template
      ? {
          ...template,
        }
      : null;
}

export function getActiveTemplateDragData() {
  return activeTemplateDragData
    ? {
        ...activeTemplateDragData,
      }
    : null;
}

export function clearActiveTemplateDragData() {
  activeTemplateDragData = null;
}
