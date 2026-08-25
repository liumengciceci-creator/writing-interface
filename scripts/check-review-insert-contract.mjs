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
      server.includes('"relationStrength":0到100的整数') &&
      server.includes('relationStrength<90 时 status 必须是 "issue"') &&
      server.includes("const relationStrength = Math.max(") &&
      app.includes("relationStrength: Number.isFinite") &&
      !reviewPanel.includes("criterion.relationStrength") &&
      !i18n.includes('"review.relationStrength"'),
    "every relationship must use an internal strength threshold without exposing the score in the UI",
  ],
  [
    app.includes('“暂时不改”只关闭当前建议') &&
      !app.includes('{ ...result, decision: "rejected" }'),
    "temporarily skipped review points must remain available for later reopening",
  ],
  [
    server.includes("你先写了……；随后从……角度说明") &&
      server.includes("只概括现有内容与关系") &&
      server.includes('type: "summary_delta"'),
    "overall review must remain a concise, genuinely streamed narrative",
  ],
  [
    server.includes("通常排版成 3 个以“• ”开头的完整要点") &&
      server.includes("不要虚构原文没有的理论、数据、研究、来源或事实"),
    "revision advice must use readable bullet points without fabricating support",
  ],
  [
    server.includes("必须先定位“缺口属于哪一侧”") &&
      server.includes("不得为了省事直接把 sourceId 指向结论") &&
      server.includes("sourceIsConclusion") &&
      server.includes("ownershipCorrected") &&
      server.includes("当前${relationText") &&
      server.includes("这样可以补上从现有材料到后续判断的中间推理"),
    "missing support before a conclusion must be assigned to analysis, reasoning, or evidence rather than the conclusion wording",
  ],
  [
      server.includes("审阅对象是模块之间的论证关系") &&
      server.includes("sourceIsEvidence") &&
      server.includes("targetNeedsSupport") &&
	      server.includes('insertType = "Analysis"') &&
	      server.includes('insertLabel = interfaceLanguage === "en" ? "Analysis" : "分析"') &&
      server.includes("不得把这种关系缺口改判为“让证据更严谨”"),
    "relevant evidence with a missing inferential link must create or strengthen analysis instead of receiving a rigor edit",
  ],
  [
    server.includes('"action":"revise、insert或replace"') &&
      server.includes('action="replace"：sourceId 模块的材料方向或论证功能本身错误') &&
      server.includes("replaceType") &&
      app.includes('item.action === "replace"') &&
      app.includes("replaceType: replacementTemplate?.type") &&
      reviewApi.includes('action: action === "replace" ? "replace" : "revise"'),
    "direction errors must use a true replace action through the complete request path",
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
      server.includes("plannedCriterionResults.forEach") &&
      !server.includes("diagnosticStream") &&
      server.includes('type: "criterion_start"') &&
      server.includes('type: "criterion_summary_delta"') &&
      server.includes('type: "criterion_result"'),
    "one model pass must stream the overall assessment and reuse its relationship judgments",
  ],
  [
    reviewPanel.includes("issueNumberById") &&
      reviewPanel.includes("width: 18") &&
      reviewPanel.includes("background: itemColor") &&
      reviewPanel.includes("{issueNumber}"),
    "review issues must use compact solid top-to-bottom numbered markers",
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
    "accepted review inserts or replacements must persist newly defined labels",
  ],
  [
    app.includes("handleUpdateBlockAppearance({") &&
      app.includes("type: replacementTemplate.type") &&
      app.includes("recordHistory: false") &&
      server.includes("不再受原模块类型约束") &&
      server.includes("不得仅因数据看起来更正式就用数据替换例子"),
    "accepted replacements must change the real module type without treating data as inherently superior",
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
	  reviewApi.includes('interfaceLanguage = "zh"') &&
	    reviewApi.includes('interfaceLanguage: interfaceLanguage === "en" ? "en" : "zh"') &&
	    app.includes("interfaceLanguage: language") &&
	    server.includes("insertLabel 和 replaceLabel 必须使用中文界面标签") &&
	    i18n.includes('Analysis: "分析"') &&
	    i18n.includes('分析: "Analysis"'),
	  "review-generated module labels must follow the interface language",
	],
  [
    reviewCurve.includes("createGapAnchorRect") &&
      reviewCurve.includes("issue?.insertAfterId") &&
      reviewCurve.includes("issue?.insertBeforeId"),
    "insert review curve must originate from the gap between adjacent blocks",
  ],
  [
    reviewPanel.includes('whiteSpace: "pre-wrap"') &&
      reviewPanel.includes('selectedItem.action === "insert"') &&
      reviewPanel.includes('selectedItem.action === "replace"'),
    "review panel must preserve bullet layout and render insert or replace suggestions",
  ],
  [
    i18n.includes('"review.insertInstruction"') &&
      i18n.includes('"review.replaceInstruction"') &&
      i18n.includes('"review.insertPositionChanged"'),
    "insert and replace review UI messages must be translated",
  ],
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);

if (failures.length) {
  console.error("Review insert contract checks failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("review insert contract checks passed");
