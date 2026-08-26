import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getInlineParagraphBlockIndices,
  isEditableInlineBlock,
  restoreCompletedParagraphBlocks,
} from "../src/hooks/useEditor/paragraphBlocks.js";

const blocks = [
  { id: "claim", placement: "inline", text: "论点" },
  {
    id: "floating-evidence",
    placement: "floating",
    text: "灰色区域证据",
    floatingX: 680,
    floatingY: 420,
  },
  { id: "reason", placement: "inline", text: "原因" },
];

assert.equal(
  isEditableInlineBlock(blocks[1]),
  false,
  "灰色区域模块不得被当作可完成的正文模块"
);

assert.deepEqual(
  getInlineParagraphBlockIndices(blocks, 2),
  [0, 2],
  "计算正文段落时应忽略夹在数组中的 floating 模块"
);

assert.deepEqual(
  getInlineParagraphBlockIndices(blocks, 1),
  [],
  "floating 模块不能成为完成/隐藏正文段落的目标"
);

const restoredLegacyBlocks = restoreCompletedParagraphBlocks([
  {
    id: "legacy-claim",
    placement: "floating",
    floatingX: 900,
    floatingY: 60,
    floatingWidth: 260,
    floatingHeight: 80,
    text: "旧版本误存的模块",
    isModuleHidden: true,
  },
]);

assert.deepEqual(
  {
    placement: restoredLegacyBlocks[0].placement,
    isModuleHidden: restoredLegacyBlocks[0].isModuleHidden,
    floatingX: restoredLegacyBlocks[0].floatingX,
    floatingY: restoredLegacyBlocks[0].floatingY,
  },
  {
    placement: "inline",
    isModuleHidden: false,
    floatingX: undefined,
    floatingY: undefined,
  },
  "审阅恢复旧完成快照时必须清除旧 floating 坐标，防止模块跳到上方"
);

const editorSource = readFileSync(
  new URL("../src/hooks/useEditor/useEditor.js", import.meta.url),
  "utf8"
);
const appSource = readFileSync(
  new URL("../src/App.jsx", import.meta.url),
  "utf8"
);
const cssSource = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8"
);
const reviewHandlerStart = editorSource.indexOf(
  "const handleRestoreAllCompletedForReview"
);
const reviewHandlerEnd = editorSource.indexOf(
  "/**\n   * 更新 completed section",
  reviewHandlerStart
);
const reviewHandlerSource = editorSource.slice(
  reviewHandlerStart,
  reviewHandlerEnd
);

assert.ok(
  reviewHandlerStart >= 0 && reviewHandlerEnd > reviewHandlerStart,
  "必须能定位审阅快照函数"
);
assert.equal(
  reviewHandlerSource.includes("setSections("),
  false,
  "点击审阅不得写回 sections，否则首个模块可能被旧快照位置覆盖"
);
assert.equal(
  reviewHandlerSource.includes("pushHistorySnapshot("),
  false,
  "只读审阅不得创建编辑历史"
);
assert.ok(
  cssSource.includes(".review-issues-panel {") &&
    cssSource.includes("position: absolute;") &&
    !cssSource.includes("position: fixed;") &&
    cssSource.includes("top: var(--page-canvas-top-inset);") &&
    cssSource.includes("--page-canvas-top-inset: 8px;") &&
    cssSource.includes("overflow-y: auto;") &&
    cssSource.includes(".editor-main") &&
    appSource.includes('className={`page-canvas-shell') &&
    appSource.indexOf("<ReviewIssuesPanel") >
      appSource.indexOf('className={`page-canvas-shell') &&
    appSource.indexOf("<ReviewIssuesPanel") < appSource.indexOf("<PageCanvas"),
  "审阅面板必须脱离 flex 文档流，并在画布外壳内共用顶部基准与根滚动轴"
);
assert.ok(
  appSource.includes("Review Layout Debug") &&
    appSource.includes("captureReviewLayoutSnapshot({") &&
    appSource.includes('label: "01-before-review"'),
  "审阅前后必须保留可对比的数据坐标与 DOM 坐标 Debug"
);

console.log("review floating position regression checks passed");
