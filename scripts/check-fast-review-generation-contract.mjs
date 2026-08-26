import fs from "node:fs";
import path from "node:path";
import {
  shouldShowInlineLengthResizeHandle,
} from "../src/components/PageCanvas/semanticEditorUtils.js";

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
const lengthResize = fs.readFileSync(
  path.join(root, "src/components/PageCanvas/useLengthResize.js"),
  "utf8"
);
const generationFailureDialog = fs.readFileSync(
  path.join(root, "src/components/GenerationFailureDialog.jsx"),
  "utf8"
);
const reviewApi = fs.readFileSync(
  path.join(root, "src/api/reviewBlockCompatibility.js"),
  "utf8"
);

const firstPassPromptStart = server.indexOf("const firstPassPrompt");
const firstPassPromptEnd = server.indexOf("const reviewUsesCjk", firstPassPromptStart);
const firstPassPromptSource = server.slice(firstPassPromptStart, firstPassPromptEnd);
const quickInstructionComposer = fs.readFileSync(
  path.join(root, "src/components/PageCanvas/QuickInstructionComposer.jsx"),
  "utf8"
);
const styles = fs.readFileSync(path.join(root, "src/index.css"), "utf8");
const sidebar = fs.readFileSync(path.join(root, "src/components/Sidebar.jsx"), "utf8");
const aiActions = fs.readFileSync(
  path.join(root, "src/hooks/useEditor/useAIActions.js"),
  "utf8"
);
const toolbar = fs.readFileSync(
  path.join(root, "src/components/Toolbar.jsx"),
  "utf8"
);
const i18n = fs.readFileSync(path.join(root, "src/i18n.jsx"), "utf8");

const checks = [
  {
    name: "generation uses true tagged streaming instead of replaying buffered JSON",
    pass:
      server.includes("buildStreamingWritingRequestOptions") &&
      server.includes('event.type === "response.output_text.delta"') &&
      server.includes("parser.push(String(event.delta || \"\"))") &&
      server.includes("[[BLOCK:id]]final block prose[[/BLOCK]]") &&
      server.includes("generateValidatedStreamingBlocks") &&
      !server.includes("emitBufferedBlocks") &&
      !server.includes("parseBufferedBlockOutput"),
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
      server.includes("getBlockEchoCandidates") &&
      server.includes("canReleaseGuardedText") &&
      server.includes('reason: "unchanged_user_input"') &&
      server.includes("Only regenerate target ids") &&
      generationHook.includes("consideredIdentical"),
  },
  {
    name: "failed generation restores content and retries the saved selection from one dialog",
    pass:
      generationHook.includes("originalBlockByRealId") &&
      generationHook.includes("setGenerationFailure({") &&
      generationHook.includes("targetIds,") &&
      generationHook.includes("generateFromSelectedBlocks(retryTargetIds)") &&
      generationHook.includes("generationError: null") &&
      !generationHook.includes("generationError: error?.message") &&
      !semanticEditor.includes('data-generation-error="true"') &&
      app.includes("<GenerationFailureDialog") &&
      generationFailureDialog.includes('role="alertdialog"') &&
      generationFailureDialog.includes('t("generation.retry")'),
  },
  {
    name: "generation and review buttons pause the real network streams",
    pass:
      generationHook.includes("const stopGenerating = useCallback") &&
      generationHook.includes("controllerRef.current?.abort()") &&
      generationHook.includes("flushPendingDeltas();") &&
      app.includes("if (isGenerating) {") &&
      app.includes("stopGenerating();") &&
      app.includes("const stopReview = () =>") &&
      app.includes("activeController.abort();") &&
      app.includes("signal: reviewController.signal") &&
      app.includes('error?.name === "AbortError"') &&
      reviewApi.includes("signal,") &&
      toolbar.includes('t("toolbar.pauseGenerate")') &&
      toolbar.includes('t("toolbar.pauseReview")') &&
      toolbar.includes('background: isGenerating ? "#f3f4f6"') &&
      toolbar.includes('background: isReviewing ? "#f3f4f6"') &&
      toolbar.includes('background: "currentColor"') &&
      toolbar.includes("width: 8") &&
      (toolbar.match(/border: toolbarWideButton\.border/g) || []).length === 2 &&
      !toolbar.includes("aria-pressed={isGenerating}") &&
      !toolbar.includes("aria-pressed={isReviewing}") &&
      !toolbar.includes("borderColor: isGenerating") &&
      !toolbar.includes("borderColor: isReviewing") &&
      !toolbar.includes("#b93832") &&
      !toolbar.includes("#fff1f0"),
  },
  {
    name: "generation remounts contentEditable DOM flattened by manual editing",
    pass:
      generationHook.includes("generationRenderRevision") &&
      semanticEditor.includes("block.generationRenderRevision") &&
      semanticEditor.includes("restoredWithoutContentMarker"),
  },
  {
    name: "every editable inline module keeps its end length handle after generation clears selection",
    pass:
      lengthResize.includes("blockById.keys()") &&
      !lengthResize.includes("selectedIdSet") &&
      !lengthResize.includes("block.hideFloatingResizeHandle === true") &&
      lengthResize.includes("shouldShowInlineLengthResizeHandle") &&
      shouldShowInlineLengthResizeHandle({
        text: "AI generated duplicated module",
        isGenerated: true,
        hideResizeHandle: true,
      }) === true &&
      shouldShowInlineLengthResizeHandle({
        text: "Ungenerated duplicated module",
        isGenerated: false,
        hideResizeHandle: true,
      }) === false &&
      lengthResize.includes("!blockById?.has(") &&
      !semanticEditor.includes("lineExtensions,\n        selectedIdSet,\n        blockById"),
  },
  {
    name: "review panel preserves a scroll-safe lower-right content area",
    pass:
      reviewPanel.includes('overflowX: "hidden"') &&
      reviewPanel.includes('padding: "0 12px 32px 2px"') &&
      reviewPanel.includes('scrollbarGutter: "stable"') &&
      reviewPanel.includes("marginRight: 2") &&
      reviewPanel.includes("marginBottom: 4"),
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
      server.includes("这是本次审阅唯一一次关系识别") &&
      server.includes('const criterionMetaOpenTag = "<criterion_meta>"') &&
      server.includes('const criterionSummaryOpenTag = "<criterion_summary>"') &&
      server.includes('const summaryOpenTag = "<overall_summary>"') &&
      server.includes("只通读一次全文，同时完成整体评价和全部模块关系判断") &&
      server.includes("对每一项关系直接完成判断，不要只列计划") &&
      server.includes("processRelationMapBuffer") &&
      server.includes("sameCriterionMeta") &&
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
	  name: "top status distinguishes overall review and instruction-driven revision",
	  pass:
	    app.includes('status: t("app.reviewWhole")') &&
	    styles.length > 0 &&
	    !generationHook.includes('instructionDrivenGeneration') &&
	    !generationHook.includes('"正在根据指令内容修改"') &&
	    generationHook.includes('"正在根据所选模块内容生成"') &&
	    !generationHook.includes('`正在整体分析 ${targets.length} 个模块及其上下文…`') &&
	    generationHook.includes('setGenerationStatus("")') &&
	    !generationHook.includes('setGenerationStatus(`生成完成 ${targets.length}/${targets.length}`)') &&
	    aiActions.includes('"正在根据指令内容修改"') &&
	    aiActions.includes('setStatusText("")') &&
      toolbar.indexOf("isReviewing") < toolbar.indexOf("normalizedStatusText ||") &&
      toolbar.includes("wasReviewingRef") &&
      toolbar.includes("recentReviewCompletion") &&
      toolbar.includes("!wasReviewing || !normalizedReviewStatus") &&
      !toolbar.includes("normalizedGenerationStatus ||\n              normalizedReviewStatus"),
	},
	{
	  name: "every AI entry point publishes a matching top status",
	  pass:
	    generationHook.includes('setGenerationStatus("正在根据所选模块内容生成")') &&
	    generationHook.includes('"正在搜索网页并核对资料…"') &&
	    aiActions.includes('"正在调整模块长度..."') &&
	    aiActions.includes('"正在根据指令内容修改"') &&
	    app.includes('status: t("app.reviewWhole")') &&
	    app.includes('setStatusText(t("review.inserting"))') &&
	    app.includes('setStatusText(t("review.applying"))') &&
	    app.includes("isApplyingReviewSuggestion") &&
	    app.includes("isApplyingMultiAction={isApplyingMultiAction}") &&
	    toolbar.includes("isApplyingReviewSuggestion") &&
	    toolbar.includes("isApplyingMultiAction"),
	},
	{
	  name: "quick instructions are editable, deletable, and persist an empty library",
	  pass:
	    quickInstructionComposer.includes("if (Array.isArray(parsed))") &&
	    quickInstructionComposer.includes("editingInstructionId") &&
	    quickInstructionComposer.includes("beginEditInstruction") &&
	    quickInstructionComposer.includes("deleteInstruction") &&
	    quickInstructionComposer.includes("isUserEdited: true") &&
	    quickInstructionComposer.includes("INSTRUCTIONS_DEFAULT_VERSION_KEY") &&
	    quickInstructionComposer.includes("const width = Math.min(480") &&
	    quickInstructionComposer.includes("fontSize: 12") &&
	    quickInstructionComposer.includes("width: 18") &&
	    i18n.includes("instruction?.isUserEdited === true"),
	},
  {
    name: "second-phase review checks real module dependencies by paragraph",
    pass:
      server.includes("关系审阅：根据文章真实结构") &&
      server.includes("原因应解释论点") &&
      server.includes("证据／例子应支持论点") &&
      server.includes("结论概括多个前置模块") &&
      server.includes("过渡必须与前后核心模块共同检查"),
  },
	{
	  name: "single-module first paragraph cannot be swallowed by title or later paragraphs",
	  pass:
	    server.includes("每个非空正文段落至少属于一项检查") &&
	    server.includes("单模块段落也要联系它实际支撑") &&
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
    name: "review panel waits for concrete overall judgment content",
    pass:
      app.includes("let streamedOverallSummary =") &&
      app.includes("const revealReviewPanelWhenSummaryReady =") &&
      app.includes("revealReviewPanelWhenSummaryReady(streamedOverallSummary)") &&
      app.includes("setReviewPanelOpen(false)") &&
      !app.includes("第一阶段的总结从第一个字开始就在右侧显示"),
  },
  {
    name: "accepted suggestion uses a dedicated pulse that detail closing cannot clear",
    pass:
      app.includes("const notifyReviewApplyStart =") &&
      app.includes("lifecycle.onApplyStart?.()") &&
      app.includes("const [reviewApplyPulse, setReviewApplyPulse]") &&
      app.includes("setReviewApplyPulse({\n        activeIds: [insertedBlockId]") &&
      app.includes("setReviewApplyPulse({\n      activeIds: [targetBlockId]") &&
      app.includes("reviewApplyPulse.activeIds.length > 0") &&
      app.includes("? reviewApplyPulse.blinkOn") &&
      reviewPanel.includes("onApplyStart:") &&
      reviewPanel.includes("closeIssue"),
  },
  {
    name: "accepted suggestion keeps blinking until the whole revision finishes",
    pass:
      app.includes("pulse.operationId === applyGraphId\n            ? { ...pulse, blinkOn: !pulse.blinkOn }") &&
      !app.includes("state.activeGraphId === applyGraphId && !textStarted") &&
      !app.includes("textStarted = true") &&
      !app.includes('event.type === "text_start") {\n            captureRevisionHistory();\n            window.clearInterval(blinkTimer)') &&
      !app.includes('event.type === "block_start") {\n              window.clearInterval(blinkTimer)') &&
      app.includes("window.clearInterval(blinkTimer);\n      setStatusText(\"\")"),
  },
  {
    name: "first relationship does not absorb model reasoning latency",
    pass:
      server.indexOf('type: "criterion_start",\n              ...activeCriterionMeta') <
        server.indexOf("emitCriterionSummaryText(firstPassBuffer.slice(0, safeLength))") &&
      server.indexOf("emitCriterionSummaryText(firstPassBuffer.slice(0, safeLength))") <
        server.indexOf('type: "criterion_result",\n            ...rawResult') &&
      server.includes("严格按 relation_map 顺序逐项输出") &&
      server.includes("逐项审阅未严格复用已锁定的关系表") &&
      app.includes("meta 一到就开始闪烁"),
  },
  {
    name: "relationship review appears immediately and starts from the title",
    pass:
      firstPassPromptSource.indexOf("<overall_summary>") <
        firstPassPromptSource.indexOf("<relation_map>") &&
      server.includes("const isTitleCriterion = includesTitle && index === 0") &&
      server.includes('key = isTitleCriterion') &&
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
    name: "review panel top shares the exact canvas inset and scroll container",
    pass:
      styles.includes("--page-canvas-top-inset: 8px") &&
      styles.includes("top: var(--page-canvas-top-inset)") &&
      app.indexOf("<ReviewIssuesPanel") > app.indexOf('className={`page-canvas-shell') &&
      app.indexOf("<ReviewIssuesPanel") < app.indexOf("<PageCanvas") &&
      semanticEditor.includes("height: 16") &&
      semanticEditor.includes('"16px"'),
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
      server.includes("用成对 ** 标记 3—5 个关键短语") &&
      reviewPanel.includes("markdownHighlights"),
  },
  {
    name: "review input is compact, non-duplicated, and streams visible content first",
    pass:
      server.includes("const compactReviewBlocks = JSON.stringify(blocks)") &&
      (firstPassPromptSource.match(/\$\{compactReviewBlocks\}/g) || []).length === 1 &&
      !firstPassPromptSource.includes("JSON.stringify(blocks, null, 2)") &&
      firstPassPromptSource.indexOf("<overall_summary>") <
        firstPassPromptSource.indexOf("<relation_map>") &&
      server.includes("relationMapClosed = true") &&
      server.includes("plannedRelationMap.length"),
  },
];

const failed = checks.filter((check) => !check.pass);
if (failed.length) {
  failed.forEach((check) => console.error(`FAIL: ${check.name}`));
  process.exit(1);
}

console.log("fast review and generation regression checks passed");
