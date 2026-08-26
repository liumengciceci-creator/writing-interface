/**
 * 正文段落只由 inline 模块组成。floating 模块虽然和正文模块存放在
 * 同一个 section.blocks 数组里，但不属于任何正文段落。
 */
export function isEditableInlineBlock(block) {
  return Boolean(
    block &&
      block.isCompletedParagraph !== true &&
      block.placement !== "floating"
  );
}

/**
 * 返回目标正文段落对应的真实 blocks 下标。
 *
 * 计算段落边界时忽略 floating 模块，但保留 CompletedParagraph 作为
 * 段落分隔符，避免灰色区域模块被“完成”或“隐藏正文标签”误处理。
 */
export function getInlineParagraphBlockIndices(
  blocks,
  targetBlockIndex
) {
  const sourceBlocks = Array.isArray(blocks) ? blocks : [];
  const targetIndex = Number(targetBlockIndex);

  if (
    !Number.isInteger(targetIndex) ||
    targetIndex < 0 ||
    targetIndex >= sourceBlocks.length ||
    !isEditableInlineBlock(sourceBlocks[targetIndex])
  ) {
    return [];
  }

  const flowIndices = sourceBlocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block?.placement !== "floating")
    .map(({ index }) => index);

  const targetFlowIndex = flowIndices.indexOf(targetIndex);
  if (targetFlowIndex < 0) return [];

  let paragraphStart = targetFlowIndex;
  while (
    paragraphStart > 0 &&
    !sourceBlocks[flowIndices[paragraphStart]]?.forceLineBreakBefore &&
    !sourceBlocks[flowIndices[paragraphStart - 1]]?.isCompletedParagraph
  ) {
    paragraphStart -= 1;
  }

  let paragraphEnd = targetFlowIndex + 1;
  while (
    paragraphEnd < flowIndices.length &&
    !sourceBlocks[flowIndices[paragraphEnd]]?.forceLineBreakBefore &&
    !sourceBlocks[flowIndices[paragraphEnd]]?.isCompletedParagraph
  ) {
    paragraphEnd += 1;
  }

  return flowIndices
    .slice(paragraphStart, paragraphEnd)
    .filter((index) => isEditableInlineBlock(sourceBlocks[index]));
}

/**
 * 兼容旧版本错误生成的完成段落快照：旧逻辑可能把 floating 模块一起
 * 收进 CompletedParagraph。恢复到正文时必须清掉旧浮动坐标，否则点击
 * “审阅”会让模块按旧 floatingY 突然跳到灰色区域上方。
 */
export function restoreCompletedParagraphBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map((block) => {
    const restoredBlock = {
      ...block,
      placement: "inline",
      isModuleHidden: false,
    };

    delete restoredBlock.x;
    delete restoredBlock.y;
    delete restoredBlock.width;
    delete restoredBlock.height;
    delete restoredBlock.floatingX;
    delete restoredBlock.floatingY;
    delete restoredBlock.floatingWidth;
    delete restoredBlock.floatingHeight;

    return restoredBlock;
  });
}
