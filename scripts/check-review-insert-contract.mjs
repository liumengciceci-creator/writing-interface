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
    server.includes('"action":"revise或insert"') &&
      server.includes("建议数量没有上下限") &&
      server.includes("suggestion 不设字数限制"),
    "review prompt must allow revise/insert without fixed suggestion or word counts",
  ],
  [
    server.includes("你先写了……，提出……") &&
      server.includes("这里只概括现有内容及关系") &&
      server.includes("不评价不足、不提出建议"),
    "overall review must remain a concise narrative of the author's argument",
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
    server.includes("relationshipPrompt") &&
      server.includes("diagnosticPrompt") &&
      server.includes('reasoning: { effort: "low" }') &&
      server.includes('collectResponseText(diagnosticPrompt, "medium")'),
    "review must separate fast relationship feedback from deeper diagnosis",
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
