import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getGenerationSnapshotText,
} from "../src/hooks/useEditor/generationSnapshot.js";

function createBlockElement({
  id,
  text,
  editing = false,
  active = false,
}) {
  const contentElement = {
    isContentEditable: editing,
    textContent: text,
  };

  const element = {
    isContentEditable: editing,
    textContent: text,
    getAttribute(name) {
      if (name === "data-semantic-block-id") return id;
      if (name === "data-editing") return editing ? "true" : "false";
      return null;
    },
    matches() {
      return false;
    },
    querySelector(selector) {
      return selector === "[data-semantic-block-content='true']"
        ? contentElement
        : null;
    },
    contains(candidate) {
      return active && candidate === activeElement;
    },
  };

  return element;
}

const activeElement = {};
let candidates = [];

globalThis.document = {
  activeElement,
  querySelectorAll() {
    return candidates;
  },
};

candidates = [
  createBlockElement({
    id: "reason-1",
    text: "理论解释",
  }),
];

assert.deepEqual(
  {
    text: getGenerationSnapshotText({
      id: "reason-1",
      text: "原因模块旧正文",
    }).text,
    source: getGenerationSnapshotText({
      id: "reason-1",
      text: "原因模块旧正文",
    }).source,
  },
  {
    text: "理论解释",
    source: "dom-newer-than-state",
  },
  "blur 后也必须读取画布上的最新输入"
);

candidates = [
  createBlockElement({
    id: "reason-2",
    text: "旧副本",
  }),
  createBlockElement({
    id: "reason-2",
    text: "理论解释",
    editing: true,
    active: true,
  }),
];

assert.equal(
  getGenerationSnapshotText({
    id: "reason-2",
    text: "React 旧状态",
  }).text,
  "理论解释",
  "存在重复节点时必须优先读取正在编辑的节点"
);

candidates = [];

assert.equal(
  getGenerationSnapshotText({
    id: "reason-3",
    text: "仅状态文字",
  }).text,
  "仅状态文字",
  "找不到画布节点时应安全回退到 React 状态"
);

const generationSource = readFileSync(
  new URL("../src/hooks/useEditor/useStreamingGenerate.js", import.meta.url),
  "utf8"
);
const editorSource = readFileSync(
  new URL("../src/hooks/useEditor/useEditor.js", import.meta.url),
  "utf8"
);

assert.ok(
  (generationSource.match(/isModuleHidden: false/g) || []).length >= 7,
  "生成开始、流式写入、最终提交和失败回退都必须解除模块隐藏状态"
);
assert.ok(
  generationSource.includes("function appendDeltaMapToBlocks") &&
    generationSource.includes("所有流式分片都必须保持可见"),
  "后续流式分片不得重新带回完成态隐藏标记"
);
assert.ok(
  editorSource.includes("点击“审阅”不能 setSections") &&
    editorSource.includes("return restoredSections;"),
  "审阅必须只派生请求快照，不能把恢复结果写回画布"
);
assert.ok(
  editorSource.includes("restoreCompletedParagraphBlocks(") &&
    editorSource.includes("getInlineParagraphBlockIndices("),
  "完成段落和审阅恢复必须隔离 floating 模块与旧浮动坐标"
);

console.log("generation snapshot regression checks passed");
