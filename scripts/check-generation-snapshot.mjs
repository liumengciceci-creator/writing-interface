import assert from "node:assert/strict";

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

console.log("generation snapshot regression checks passed");
