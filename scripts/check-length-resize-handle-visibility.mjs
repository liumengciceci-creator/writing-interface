import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const controls = fs.readFileSync(
  path.join(root, "src/components/PageCanvas/LengthResizeControls.jsx"),
  "utf8"
);
const hook = fs.readFileSync(
  path.join(root, "src/components/PageCanvas/useLengthResize.js"),
  "utf8"
);

const assertions = [
  [
    controls.includes("isCurrentDraft &&\n              isLengthResizeDragging"),
    "圆点必须只在当前草稿仍处于拖动状态时被草稿强制显示",
  ],
  [
    controls.includes("setHoveredBlockId(null)") &&
      controls.includes("wasDragging &&") &&
      controls.includes("!isLengthResizeDragging"),
    "pointerup 后必须清除拖动期间人工保留的 hover 状态",
  ],
  [
    !controls.includes("const showHandleDot =\n            isHovered ||\n            isCurrentDraft;"),
    "不能再因为仅存在 lengthResizeDraft 就让圆点常驻",
  ],
  [
    /const LENGTH_PREVIEW_END_GAP = 14;/.test(hook),
    "拉伸预览与后续模块之间必须保留足够安全间距，避免圆点/边框遮挡",
  ],
];

const failed = assertions.filter(([ok]) => !ok);
if (failed.length) {
  for (const [, message] of failed) console.error(`FAIL: ${message}`);
  process.exit(1);
}
for (const [, message] of assertions) console.log(`PASS: ${message}`);
