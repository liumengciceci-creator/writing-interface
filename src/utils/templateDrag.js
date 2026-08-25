export const WRITING_BLOCK_MIME =
  "application/x-writing-block";

export const SEMANTIC_BLOCK_MIME =
  "application/x-semantic-block";

let activeTemplateDragData = null;

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
