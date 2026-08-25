import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [server, app, reviewApi, reviewCurve, reviewPanel, i18n] = await Promise.all([
  read("server.js"),
  read("src/App.jsx"),
  read("src/api/reviewBlockCompatibility.js"),
  read("src/components/PageCanvas/ActiveReviewCurve.jsx"),
  read("src/components/ReviewIssuesPanel.jsx"),
  read("src/i18n.jsx"),
]);

const checks = [
  [
    server.includes('"type":"criterion_result"') &&
      server.includes("问题数量没有上下限") &&
      server.includes("suggestion 不设字数限制"),
    "dynamic criterion review must allow revise/insert without fixed issue or word counts",
  ],
  [
    server.includes("你先写了……；随后从……角度说明") &&
      server.includes("只概括现有内容与关系") &&
      server.includes('type: "summary_delta"'),
    "overall review must remain a concise, genuinely streamed narrative",
  ],
  [
    server.includes("2—4 个以“• ”开头的完整要点") &&
      server.includes("不要虚构原文没有的理论、数据、研究、来源或事实"),
    "revision advice must use readable bullet points without fabricating support",
  ],
  [
    server.includes('"rewriteScope":"local、full或空字符串"') &&
      server.includes('action="revise", rewriteScope="full"：证据、理由或反论方向错误') &&
      app.includes("rewriteScope: item.rewriteScope") &&
      reviewApi.includes('rewriteScope === "full" ? "full" : "local"'),
    "evidence-direction errors must trigger a full rewrite through the complete request path",
  ],
  [
    server.includes("它不要求每个主张都配实证数据") &&
      server.includes("不得建议新增 Evidence/数据模块") &&
      reviewApi.includes("方括号材料槽"),
    "review must avoid evidence bias while preserving safe external-material handling",
  ],
  [
    server.includes("当前已有标签（可以复用，但不是白名单）") &&
      server.includes("新增模块采用开放类型") &&
      server.includes("targetIndex !== sourceIndex + 1") &&
      !server.includes("typeAllowed = templates.some"),
    "server must allow new review-defined labels while validating the adjacent insertion gap",
  ],
  [
    server.includes("overallSummaryPrompt") &&
      server.includes("criteriaPlanPrompt") &&
      server.includes("diagnosticPrompt") &&
      server.includes('type: "criterion_start"') &&
      server.includes('type: "criterion_result"'),
    "review must separate streamed overall assessment from dynamic criterion diagnosis",
  ],
  [
    server.includes("找出必须核对的模块依赖关系") &&
      server.includes("不要检查所有两两组合") &&
      server.includes("若第 2 个模块是过渡") &&
      app.includes('event.type === "criterion_start"') &&
      app.includes('event.type === "criterion_result"') &&
      reviewPanel.includes("paragraphGroups.map"),
    "criteria must be selected from actual content and rendered progressively",
  ],
  [
    app.includes("createReviewTemplateStyle") &&
      app.includes("isReviewGenerated") &&
      app.includes("setCustomTemplates((currentTemplates)"),
    "accepted review inserts must persist newly defined labels",
  ],
  [
    app.includes("generateReviewInsertedBlockStream") &&
      app.includes('if (item.action === "insert")') &&
      app.includes("handleInsertInlineBlock"),
    "accepting an insert review must create and generate a real block",
  ],
  [
    reviewApi.includes("generateBlocksStream") &&
      reviewApi.includes("review-insert-target"),
    "inserted review blocks must reuse the validated streaming generation path",
  ],
  [
    reviewCurve.includes("createGapAnchorRect") &&
      reviewCurve.includes("issue?.insertAfterId") &&
      reviewCurve.includes("issue?.insertBeforeId"),
    "insert review curve must originate from the gap between adjacent blocks",
  ],
  [
    reviewPanel.includes('whiteSpace: "pre-wrap"') &&
      reviewPanel.includes('selectedItem.action === "insert"'),
    "review panel must preserve bullet layout and render insert suggestions",
  ],
  [
    i18n.includes('"review.insertInstruction"') &&
      i18n.includes('"review.insertPositionChanged"'),
    "insert-review UI messages must be translated",
  ],
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);

if (failures.length) {
  console.error("Review insert contract checks failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("review insert contract checks passed");
