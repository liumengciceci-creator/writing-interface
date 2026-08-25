import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const generationHook = fs.readFileSync(
  path.join(root, "src/hooks/useEditor/useStreamingGenerate.js"),
  "utf8"
);
const semanticEditor = fs.readFileSync(
  path.join(root, "src/components/PageCanvas/SingleSemanticEditor.jsx"),
  "utf8"
);
const inlineEditing = fs.readFileSync(
  path.join(root, "src/components/PageCanvas/useInlineEditing.js"),
  "utf8"
);
const app = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const reviewPanel = fs.readFileSync(
  path.join(root, "src/components/ReviewIssuesPanel.jsx"),
  "utf8"
);
const reviewApi = fs.readFileSync(
  path.join(root, "src/api/reviewBlockCompatibility.js"),
  "utf8"
);
const quickInstructionComposer = fs.readFileSync(
  path.join(root, "src/components/PageCanvas/QuickInstructionComposer.jsx"),
  "utf8"
);
const styles = fs.readFileSync(path.join(root, "src/index.css"), "utf8");
const sidebar = fs.readFileSync(path.join(root, "src/components/Sidebar.jsx"), "utf8");

const checks = [
  {
    name: "generation uses a strict structured block response",
    pass:
      server.includes('name: "generated_blocks"') &&
      server.includes('type: "json_schema"') &&
	      server.includes('type: "string"') &&
	      server.includes("enum: targetBlocks.map((block) => String(block.id))") &&
	      !server.includes("enum: targetBlocks.map((block) => Number(block.id))") &&
      server.includes("parseBufferedBlockOutput"),
  },
	{
	  name: "review-insert string ids remain valid structured-output enum values",
	  pass:
	    server.includes('String(block?.id ?? "").trim()') &&
	    server.includes("Every target block must have a non-empty id") &&
	    server.includes("Target block ids must be unique") &&
	    reviewApi.includes('const targetId = "review-insert-target"'),
	},
  {
    name: "unchanged generated text is rejected",
    pass:
      server.includes("normalizeGeneratedComparison(text)") &&
      server.includes("unchanged") &&
      generationHook.includes("consideredIdentical"),
  },
  {
    name: "failed generation restores the original block and stays retryable",
    pass:
      generationHook.includes("originalBlockByRealId") &&
      generationHook.includes("setSelectedIds?.(failedTargetIds)") &&
      generationHook.includes("generationError: error?.message"),
  },
  {
    name: "generation remounts contentEditable DOM flattened by manual editing",
    pass:
      generationHook.includes("generationRenderRevision") &&
      semanticEditor.includes("block.generationRenderRevision") &&
      semanticEditor.includes("restoredWithoutContentMarker"),
  },
  {
    name: "inline undo preserves the semantic content element",
    pass:
      inlineEditing.includes("const editableTextElement") &&
      inlineEditing.includes("data-semantic-block-content='true'") &&
      !inlineEditing.includes("event.currentTarget.textContent =\n              previousText"),
  },
  {
    name: "overall evaluation and relationship judgments share one model pass",
    pass:
      server.includes("const firstPassPrompt") &&
      server.includes("const firstPassStream = await openai.responses.create") &&
      server.includes("<relation_map>") &&
      server.includes("它是本次审阅唯一一次关系识别") &&
      server.includes('const criterionMetaOpenTag = "<criterion_meta>"') &&
      server.includes('const criterionSummaryOpenTag = "<criterion_summary>"') &&
      server.includes('const summaryOpenTag = "<overall_summary>"') &&
      server.includes("只通读一次全文，同时完成整体评价和全部模块关系判断") &&
      server.includes("对每一项关系直接完成判断，不要只列计划") &&
      server.includes("plannedCriterionResults.forEach") &&
      !server.includes("diagnosticStream") &&
      !server.includes("criteriaPlanPromise") &&
      !server.includes("collectResponseText"),
  },
  {
    name: "overall summary is second-person and criterion results stay concise",
    pass:
      server.includes('第一句必须以“你先”开头') &&
      server.includes("summary 只用一句容易理解的关系概括") &&
      server.includes("softLimit"),
  },
  {
    name: "second-phase review checks real module dependencies by paragraph",
    pass:
      server.includes("模块关系审阅任务") &&
      server.includes("论点与原因") &&
      server.includes("论点与证据") &&
      server.includes("前置论证组与结论") &&
      server.includes("过渡与前后核心模块"),
  },
	{
	  name: "single-module first paragraph cannot be swallowed by title or later paragraphs",
	  pass:
	    server.includes("标题检查不能代替正文第一段检查") &&
	    server.includes("即使该段只有一个模块") &&
	    server.includes("relatedParagraphs.includes(requestedParagraph)") &&
	    server.includes("Math.min(...relatedParagraphs)") &&
	    !server.includes("? Math.max(...relatedParagraphs)"),
	},
  {
    name: "review UI groups streamed checks by paragraph",
    pass:
      app.includes('status: "checking"') &&
      app.includes('event.type === "criteria_ready"') &&
      app.includes('event.type === "criterion_summary_delta"') &&
      app.includes("await waitForReviewBeat(28)") &&
      reviewPanel.includes("paragraphGroups.map") &&
      reviewPanel.includes('t("review.checking")'),
  },
  {
    name: "first relationship does not absorb model reasoning latency",
    pass:
      server.indexOf('type: "criterion_start",\n              ...activeCriterionMeta') <
        server.indexOf("emitCriterionSummaryText(firstPassBuffer.slice(0, safeLength))") &&
      server.indexOf("emitCriterionSummaryText(firstPassBuffer.slice(0, safeLength))") <
        server.indexOf('type: "criterion_result",\n            ...rawResult') &&
      server.includes("整体评价关闭后，必须立刻按 relation_map 的既定顺序逐项输出关系") &&
      app.includes("meta 一到就开始闪烁"),
  },
  {
    name: "relationship review appears immediately and starts from the title",
    pass:
      server.indexOf('type: "summary_done"') < server.indexOf('type: "criteria_ready"') &&
      server.includes('key = includesTitle') &&
      server.includes('"relation-title-core"') &&
      server.includes("first.paragraph - second.paragraph") &&
      server.includes('type: "criteria_ready"') &&
      reviewPanel.includes("first.paragraph - second.paragraph"),
  },
  {
    name: "review issues use compact solid sequential markers",
    pass:
      reviewPanel.includes("issueNumberById") &&
      reviewPanel.includes("nextIssueNumber += 1") &&
      reviewPanel.includes("width: 18") &&
      reviewPanel.includes("height: 18") &&
      reviewPanel.includes("background: itemColor") &&
      reviewPanel.includes("{issueNumber}"),
  },
  {
    name: "canvas and toolbar share the viewport center without shifting for review",
    pass:
      styles.includes("position: absolute") &&
      styles.includes("--workspace-sidebar-width: 156px") &&
      styles.includes("--workspace-center-offset: 78px") &&
      styles.includes("padding-right: var(--workspace-sidebar-width)") &&
      styles.includes("calc(50% - var(--workspace-center-offset))") &&
      styles.includes(".page-canvas-shell.review-panel-open") &&
      !styles.includes("var(--review-panel-width) +"),
  },
  {
    name: "label palette starts at a compact width",
    pass:
      sidebar.includes('"writing-interface-label-palette-width-v2"') &&
      sidebar.includes("return 136"),
  },
  {
    name: "review panel can be repositioned with a grab handle",
    pass:
      reviewPanel.includes("panelDragRef") &&
      reviewPanel.includes("beginPanelDrag") &&
      reviewPanel.includes('cursor: panelDragging ? "grabbing" : "grab"') &&
      reviewPanel.includes("translate3d(${panelOffset.x}px, ${panelOffset.y}px, 0)"),
  },
  {
    name: "quick instruction dialog follows a growing module",
    pass:
      semanticEditor.includes("anchorElement: event.currentTarget") &&
      semanticEditor.includes("anchorElement={quickInstructionTarget.anchorElement}") &&
      quickInstructionComposer.includes("lastAnchorRectRef") &&
      quickInstructionComposer.includes("new ResizeObserver(requestSync)") &&
      quickInstructionComposer.includes("new MutationObserver(requestSync)") &&
      quickInstructionComposer.includes("nextRect.height - previousRect.height") &&
      quickInstructionComposer.includes("current.top + deltaHeight") &&
      !quickInstructionComposer.includes('addEventListener("scroll", requestSync'),
  },
  {
    name: "overall review is concise and supports streamed emphasis",
    pass:
      server.includes("summaryCharacterLimit") &&
      server.includes("用成对的 ** 标记 3—5 个最重要") &&
      reviewPanel.includes("markdownHighlights"),
  },
];

const failed = checks.filter((check) => !check.pass);
if (failed.length) {
  failed.forEach((check) => console.error(`FAIL: ${check.name}`));
  process.exit(1);
}

console.log("fast review and generation regression checks passed");
