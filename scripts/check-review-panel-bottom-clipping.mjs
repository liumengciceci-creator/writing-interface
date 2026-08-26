import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cssSource = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/components/ReviewIssuesPanel.jsx", import.meta.url), "utf8");

const panelRuleStart = cssSource.indexOf(".review-issues-panel {");
const panelRuleEnd = cssSource.indexOf("}", panelRuleStart);
const panelRule = cssSource.slice(panelRuleStart, panelRuleEnd + 1);

assert.ok(panelRuleStart >= 0, "必须存在审阅面板 CSS");
assert.ok(panelRule.includes("max-height: none;"), "审阅面板不能再用视口 max-height 裁切底部建议卡");
assert.ok(panelRule.includes("overflow: visible;"), "审阅面板外层必须允许建议卡完整显示");
assert.ok(!panelRule.includes("overflow-y: auto;"), "审阅面板外层不得建立第二条纵向滚动轴");
assert.ok(panelSource.includes('overflowY: "visible"'), "ReviewIssuesPanel 的 aside 不得纵向裁切内容");
assert.ok(panelSource.includes('padding: "0 14px 48px 2px"'), "面板底部需保留足够安全区避免按钮/阴影贴边");

console.log("review panel bottom clipping regression checks passed");
