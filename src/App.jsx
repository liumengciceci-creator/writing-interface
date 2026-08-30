import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Sidebar from "./components/Sidebar.jsx";
import Toolbar from "./components/Toolbar.jsx";
import PageCanvas from "./components/PageCanvas/PageCanvas.jsx";
import ActiveReviewCurve from "./components/PageCanvas/ActiveReviewCurve.jsx";
import ReviewIssuesPanel from "./components/ReviewIssuesPanel.jsx";
import GenerationFailureDialog from "./components/GenerationFailureDialog.jsx";
import LanguageMenu from "./components/LanguageMenu.jsx";
import {
  applyReviewInstructionStream,
  generateReviewInsertedBlockStream,
  reviewArgumentFrameworkStream,
} from "./api/reviewBlockCompatibility.js";
import { BLOCK_TYPES } from "./constants.js";

import {
  useEditor,
} from "./hooks/useEditor";
import {
  exportDocumentToWord,
} from "./utils/exportDocumentToWord.js";
import { useI18n } from "./i18n.jsx";
import {
  createResearchActionId,
  finishResearchSession,
  getResearchSessionInfo,
  initializeResearchSession,
  logResearchEvent,
  subscribeResearchSession,
} from "./research/researchLogger.js";
import {
  serializeResearchDocument,
  useResearchDocumentLogger,
} from "./research/useResearchDocumentLogger.js";
import {
  captureReviewLayoutSnapshot,
  logReviewLayoutSnapshot,
} from "./debug/reviewLayoutDebug.js";

const CUSTOM_TEMPLATES_STORAGE_KEY =
  "writing-interface-custom-block-templates";

const waitForReviewBeat = (duration) =>
  new Promise((resolve) => window.setTimeout(resolve, duration));

const REVIEW_GENERATED_COLORS = [
  "#2aa876",
  "#19b5c5",
  "#5b7cfa",
  "#b76cf0",
  "#ef6b6b",
  "#f59a45",
  "#d4a72c",
];

function createReviewTemplateStyle(label = "") {
  const hash = Array.from(String(label)).reduce(
    (value, character) => (value * 31 + character.codePointAt(0)) >>> 0,
    7
  );
  const color = REVIEW_GENERATED_COLORS[hash % REVIEW_GENERATED_COLORS.length];
  const normalized = color.replace("#", "");
  const mix = (offset) => Math.round(
    Number.parseInt(normalized.slice(offset, offset + 2), 16) * 0.14 + 255 * 0.86
  ).toString(16).padStart(2, "0");

  return {
    color,
    fill: `#${mix(0)}${mix(2)}${mix(4)}`,
  };
}

/**
 * 从 localStorage 读取用户创建的自定义模块模板。
 */
function loadCustomTemplates() {
  try {
    const savedValue =
      window.localStorage.getItem(
        CUSTOM_TEMPLATES_STORAGE_KEY
      );

    if (!savedValue) {
      return [];
    }

    const parsedValue =
      JSON.parse(savedValue);

    if (
      !Array.isArray(
        parsedValue
      )
    ) {
      return [];
    }

    return parsedValue.filter(
      (item) =>
        item &&
        typeof item.id ===
          "string" &&
        typeof item.type ===
          "string" &&
        typeof item.color ===
          "string"
    );
  } catch (error) {
    console.error(
      "读取自定义标签失败：",
      error
    );

    return [];
  }
}

/**
 * 创建自定义模块模板 ID。
 */
function createTemplateId() {
  if (
    typeof crypto !==
      "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }

  return `custom-template-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

/**
 * 统计当前文档的总体字数。
 * 空格和换行不计入；completed section 只统计合并后的完整文字，
 * 避免它保存的原始模块被重复计算。
 */
function countDocumentCharacters(
  sections
) {
  const texts = [];

  (
    Array.isArray(sections)
      ? sections
      : []
  ).forEach((section) => {
    if (
      section?.mode ===
      "completed"
    ) {
      texts.push(
        String(
          section.completedText ??
            ""
        )
      );
      return;
    }

    (
      Array.isArray(
        section?.blocks
      )
        ? section.blocks
        : []
    ).forEach((block) => {
      texts.push(
        String(
          block?.text ?? ""
        )
      );
    });
  });

  return texts
    .join("")
    .replace(/\s/g, "")
    .length;
}

function getReviewableBlocksFromSections(sourceSections) {
  const blocks = [];
  let paragraphIndex = 1;
  let paragraphHasBody = false;

  const appendReviewBlock = (block) => {
    if (
      !block ||
      block.placement === "floating" ||
      !String(block.text || "").trim()
    ) {
      return;
    }

    const isTitle = block.type === "Title";

    // forceLineBreakBefore 是编辑器与 Word 导出共同使用的真实段落边界。
    // 先按这个边界编号，再让模型判断段内哪些关系值得检查。
    if (!isTitle && block.forceLineBreakBefore && paragraphHasBody) {
      paragraphIndex += 1;
      paragraphHasBody = false;
    }

    const reviewParagraphIndex = isTitle ? 0 : paragraphIndex;

    blocks.push({
      ...block,
      reviewParagraphIndex,
      reviewDocumentIndex: blocks.length,
    });

    if (!isTitle) paragraphHasBody = true;

  };

  (Array.isArray(sourceSections) ? sourceSections : []).forEach((section) => {
    (Array.isArray(section?.blocks) ? section.blocks : []).forEach((block) => {
      if (block?.isCompletedParagraph) {
        (Array.isArray(block.completedBlocks) ? block.completedBlocks : [])
          .forEach(appendReviewBlock);
        return;
      }

      appendReviewBlock(block);
    });
  });

  return blocks;
}

export default function App() {
  const { blockTypeLabel, language, t } = useI18n();
  const [researchSession, setResearchSession] = useState(
    getResearchSessionInfo
  );
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const reviewLayoutDebugBaselineRef = useRef(null);
  const reviewAbortControllerRef = useRef(null);
  const [isApplyingReviewSuggestion, setIsApplyingReviewSuggestion] =
    useState(false);
  const [reviewApplyPulse, setReviewApplyPulse] = useState(() => ({
    activeIds: [],
    operationId: null,
    blinkOn: false,
  }));
  const [reviewState, setReviewState] = useState({
    running: false,
    phase: "idle",
    current: 0,
    total: 0,
    activeIds: [],
    blinkOn: false,
    status: "",
    graph: [],
    notes: [],
    activeGraphId: null,
    activeIssue: null,
    results: [],
    criteria: [],
    overallSummary: "",
    summaryHighlights: [],
  });
  /**
   * 用户创建的自定义标签。
   */
  const [
    customTemplates,
    setCustomTemplates,
  ] = useState(
    loadCustomTemplates
  );

  const reviewTemplates = useMemo(
    () => [...BLOCK_TYPES, ...customTemplates]
      .map((template) => ({
        ...template,
        label: blockTypeLabel(
          template.type,
          template.label || template.type
        ),
      }))
      .filter(
        (template, index, templates) =>
          template?.type &&
          (
            template.isCustom === true ||
            !["Title", "Generated", "Merged"].includes(template.type)
          ) &&
          templates.findIndex((candidate) => candidate?.type === template.type) === index
      ),
    [blockTypeLabel, customTemplates, language]
  );


  /**
   * 编辑器状态与操作。
   */
  const {
    sections,
    zoom,
    selectedIds,
    selectionRect,
    selectBlocksForContextMenu,

    /**
     * AI 生成状态。
     */
    isGenerating,
    generatingBlockIds,
    generatingBlinkOn,
    generationStatus,
    generationFailure,
    webSearchEnabled,
    toggleWebSearch,
    retryFailedGeneration,
    dismissGenerationFailure,
    stopGenerating,

    /**
     * 调整长度状态。
     */
    isAdjustingLength,
    adjustingLengthBlockId,

    isAdjustingStyle,
    adjustingStyleBlockId,

    isApplyingMultiAction,

    /**
     * 页面与布局状态。
     */
    statusText,
    setStatusText,
    showTemporaryStatus,
    stageRef,
    pageRef,
    contentRef,

    draggingBlockId,
    isDraggingTemplate,
    endBlockDrag,

    editableBlockCount,
    sectionLayouts,
    totalContentHeight,

    /**
     * 浮动模块和外观操作。
     */
    handleUpdateFloatingBlockText,
    handleUpdateFloatingBlockWidth,
    handleUpdateBlockAppearance,

    /**
     * 模块拖入与放置。
     */
    handleTemplateMouseDown,
    cancelTemplateDrag,
    handleCanvasMouseUp,
    handleExternalDrop,

    /**
     * 文本编辑。
     */
    handleChangeText,
    handleBatchChangeText,
    handleTextBlur,
    /**
     * 连续编辑器操作。
     */
    handleInsertInlineBlock,
    handleDeleteInlineBlock,
    handleReorderInlineBlocks,

    /**
     * 模块选择与拖动。
     */
    handleBlockMouseDown,
    handleBlockDragStart,

    getBlockById,
    updateBlockPlacement,

    /**
     * 框选。
     */
    handleSelectionStart,
    handleSelectionMove,
    handleSelectionEnd,
    clearSelection,

    /**
     * Section 操作。
     */
    handleComplete,
    handleRestoreCompletedParagraph,
    handleRestoreCompletedSection,
    handleRestoreAllCompletedForReview,
    handleUpdateCompletedSectionText,

    /**
     * 单模块 AI 操作。
     */
    handleApplyBlockLength,
    handleApplyBlockStyle,
    stopAdjustingStyle,

    /**
     * 页面控制。
     */
    zoomIn,
    zoomOut,
    resetZoom,
    undoLastAction,
    redoLastAction,
    canUndo,
    canRedo,
    pushHistorySnapshot,

    /**
     * AI 初次生成。
     */
    generateFromSelectedBlocks,
    regenerateBlocksFromLastPrompt,
    deleteBlocksByIds,
    restoreBlocksPreviousContent,
  duplicateSelectedBlocks,
    beginDuplicateDrag,
} = useEditor();

  useEffect(() => {
    initializeResearchSession({ language });
    return subscribeResearchSession(setResearchSession);
  }, []);

  useResearchDocumentLogger(sections);

  useEffect(() => {
    if (!researchSession.enabled) return;
    logResearchEvent("interface_language_changed", { language });
  }, [language, researchSession.enabled]);

  useEffect(() => {
    if (!researchSession.enabled) return;
    logResearchEvent(
      "selection_changed",
      { selected_block_ids: selectedIds.map(String) },
      { targetBlockIds: selectedIds }
    );
  }, [selectedIds, researchSession.enabled]);

  const totalCharacterCount =
    useMemo(
      () =>
        countDocumentCharacters(
          sections
        ),
      [sections]
    );

  const reviewableBlockCount = useMemo(
    () => getReviewableBlocksFromSections(sections).length,
    [sections]
  );

  useEffect(() => () => {
    reviewAbortControllerRef.current?.abort();
    reviewAbortControllerRef.current = null;
  }, []);

  const stopReview = () => {
    const activeController = reviewAbortControllerRef.current;
    if (!activeController) return;

    activeController.abort();
    reviewAbortControllerRef.current = null;
    setReviewState((state) => ({
      ...state,
      running: false,
      phase:
        state.overallSummary || state.criteria.length > 0
          ? state.phase
          : "idle",
      activeIds: [],
      activeGraphId: null,
      activeIssue: null,
      blinkOn: false,
      status: t("app.reviewPaused"),
    }));
  };

  const showBusyActionReason = () => {
    if (isGenerating) {
      showTemporaryStatus(t("app.busyGenerating"), 2600);
      return true;
    }

    if (reviewState.running) {
      showTemporaryStatus(t("app.busyReviewing"), 2600);
      return true;
    }

    if (isAdjustingLength) {
      showTemporaryStatus(t("app.busyResizing"), 2600);
      return true;
    }

    if (isAdjustingStyle) {
      showTemporaryStatus(t("app.busyStyling"), 2600);
      return true;
    }

    if (isApplyingMultiAction || isApplyingReviewSuggestion) {
      showTemporaryStatus(t("app.busyRevising"), 2600);
      return true;
    }

    return false;
  };

  const handleToolbarGenerate = () => {
    if (isGenerating) {
      stopGenerating();
      showTemporaryStatus(t("app.generationPaused"), 3200);
      return;
    }

    if (showBusyActionReason()) return;

    if (selectedIds.length === 0) {
      showTemporaryStatus(t("app.selectToGenerate"), 2800);
      return;
    }

    showTemporaryStatus("", 0);
    logResearchEvent(
      "ai_generation_requested",
      { web_search_enabled: webSearchEnabled },
      { targetBlockIds: selectedIds }
    );
    generateFromSelectedBlocks();
  };

  const handleToolbarReview = () => {
    if (reviewState.running) {
      stopReview();
      showTemporaryStatus(t("app.reviewPaused"), 3200);
      return;
    }

    if (showBusyActionReason()) return;

    if (reviewableBlockCount < 2) {
      showTemporaryStatus(t("app.needTwoReview"), 2800);
      return;
    }

    if (selectedIds.length === 1) {
      showTemporaryStatus(t("app.selectTwoReview"), 3000);
      return;
    }

    showTemporaryStatus("", 0);
    logResearchEvent("review_requested", {
      scope: selectedIds.length >= 2 ? "selection" : "document",
      selected_block_ids: selectedIds.map(String),
    }, {
      targetBlockIds: selectedIds,
    });
    handleReview();
  };

  const handleToolbarComplete = () => {
    if (showBusyActionReason()) return;

    if (editableBlockCount === 0) {
      showTemporaryStatus(t("app.nothingToComplete"), 2600);
      return;
    }

    showTemporaryStatus("", 0);
    logResearchEvent("paragraph_completed", {
      editable_block_count: editableBlockCount,
    });
    handleComplete();
  };

  const handleExportWord = () => {
    logResearchEvent("word_exported", {
      character_count: totalCharacterCount,
      document: serializeResearchDocument(sections),
    });
    exportDocumentToWord(
      sections
    );
  };

  const handleFinishResearchSession = async () => {
    const documentSnapshot = serializeResearchDocument(sections);
    await finishResearchSession({ documentSnapshot });
    showTemporaryStatus(t("research.exported"), 4000);
  };

  const buildReviewRelations = (blocks) => {
    const relations = [];
    const claims = blocks.filter((block) => block.type === "Claim");
    const findClaimFor = (sourceIndex) =>
      blocks.slice(0, sourceIndex).filter((block) => block.type === "Claim").at(-1) || claims[0] || null;

    blocks.forEach((block, index) => {
      const claim = findClaimFor(index);
      const addClaimRelation = (relationType, relationLabel, criterion) => {
        if (!claim) return;
        relations.push({ relationType, relationLabel, criterion, sourceBlock: block, targetBlock: claim, contextBlocks: [claim, block] });
      };

      if (block.type === "Reason") addClaimRelation("reasonExplainsClaim", t("relation.reasonClaim"), t("relation.reasonCriterion"));
      if (block.type === "Evidence") addClaimRelation("evidenceSupportsClaim", t("relation.evidenceClaim"), t("relation.evidenceCriterion"));
      if (block.type === "Counter") addClaimRelation("counterChallengesClaim", t("relation.counterClaim"), t("relation.counterCriterion"));
      if (block.type === "Compare") addClaimRelation("compareClarifiesClaim", t("relation.compareClaim"), t("relation.compareCriterion"));

      if (block.type === "Conclusion") {
        const documentBlocks = blocks.slice(0, index).filter((item) => item.type !== "Title");
        if (documentBlocks.length > 0) {
          relations.push({
            relationType: "conclusionSummarizesDocument",
            relationLabel: t("relation.conclusionDocument"),
            criterion: t("relation.conclusionCriterion"),
            sourceBlock: block,
            targetBlock: { id: "selected-document", type: t("app.document"), text: documentBlocks.map((item) => item.text || "").join("\n") },
            contextBlocks: documentBlocks,
            activeIds: [block.id, ...documentBlocks.map((item) => item.id)],
          });
        }
      }
    });

    return relations;
  };

  const handleReview = async () => {
    if (reviewState.running) return;

    const reviewLayoutBaseline = captureReviewLayoutSnapshot({
      label: "01-before-review",
      sections,
      stage: stageRef.current,
      page: pageRef.current,
      content: contentRef.current,
    });
    reviewLayoutDebugBaselineRef.current = reviewLayoutBaseline;
    logReviewLayoutSnapshot(reviewLayoutBaseline);

    const selectedBeforeRestore = selectedIds.map(String);
    const reviewSections = handleRestoreAllCompletedForReview();
    const allReviewableBlocks = getReviewableBlocksFromSections(reviewSections);
    const selectedSet = new Set(selectedBeforeRestore);
    const selectedBlocks = allReviewableBlocks.filter((block) =>
      selectedSet.has(String(block.id))
    );
    const blocks = selectedBeforeRestore.length === 0
      ? allReviewableBlocks
      : selectedBlocks.length >= 2
        ? selectedBlocks
        : allReviewableBlocks;

    if (blocks.length < 2) return;

    reviewAbortControllerRef.current?.abort();
    const reviewController = new AbortController();
    reviewAbortControllerRef.current = reviewController;

    const reviewActionId = createResearchActionId("review");
    const reviewStartedAt = performance.now();
    logResearchEvent(
      "review_started",
      {
        scope: selectedBeforeRestore.length >= 2 ? "selection" : "document",
        blocks: blocks.map((block) => ({
          id: String(block.id),
          type: block.type,
          text: String(block.text || ""),
        })),
      },
      { actionId: reviewActionId, targetBlockIds: blocks.map((block) => block.id) }
    );

    // 请求发出后先保持画布完整；等整体判断真正返回内容时再显示窗口。
    setReviewPanelOpen(false);
    setReviewState({
      running: true,
      phase: "summary",
      current: 0,
      total: blocks.length,
      activeIds: blocks.map((block) => String(block.id)),
      blinkOn: true,
      status: t("app.reviewWhole"),
      graph: [],
      notes: [],
      activeGraphId: "overall-review",
      activeIssue: null,
      results: [],
      criteria: [],
      overallSummary: "",
      summaryHighlights: [],
    });

    let streamedOverallSummary = "";
    let reviewPanelRevealed = false;
    const revealReviewPanelWhenSummaryReady = (value) => {
      if (
        reviewPanelRevealed ||
        !String(value || "").trim()
      ) {
        return;
      }

      reviewPanelRevealed = true;
      setReviewPanelOpen(true);
    };

    const blockById = new Map(blocks.map((block) => [String(block.id), block]));
    const summaries = new Map();
    const relationByPair = new Map();
    const getRelationPairKey = (sourceId, targetId) =>
      [String(sourceId), String(targetId)].sort().join("::");
    const createReviewResult = (item, index = 0) => {
      if (!item) return null;
      const action = item.action === "insert"
        ? "insert"
        : item.action === "replace" || item.rewriteScope === "full"
          ? "replace"
          : "revise";
      const sourceBlock = blockById.get(String(item.sourceId));
      const targetBlock = blockById.get(String(item.targetId));
      if (!sourceBlock || !targetBlock) return null;

      const requestedModuleType = String(
        action === "insert"
          ? item.insertType || item.insertLabel || ""
          : action === "replace"
            ? item.replaceType || item.replaceLabel || sourceBlock.type || ""
            : ""
      ).trim();
      const requestedModuleLabel = String(
        action === "insert"
          ? item.insertLabel || item.insertType || ""
          : action === "replace"
            ? item.replaceLabel || item.replaceType || sourceBlock.label || sourceBlock.type || ""
            : ""
      ).trim();
      const existingSuggestedTemplate = action === "insert" || action === "replace"
        ? reviewTemplates.find((template) =>
            String(template.type || "").toLocaleLowerCase() === requestedModuleType.toLocaleLowerCase() ||
            String(template.label || "").toLocaleLowerCase() === requestedModuleLabel.toLocaleLowerCase()
          )
        : null;
      const dynamicStyle = createReviewTemplateStyle(
        requestedModuleLabel || requestedModuleType
      );
      const suggestedTemplate = action === "insert" || action === "replace"
        ? existingSuggestedTemplate || (requestedModuleType && requestedModuleLabel
            ? {
                type: requestedModuleType,
                label: requestedModuleLabel,
                ...dynamicStyle,
                width: 160,
                isCustom: true,
                isReviewGenerated: true,
              }
            : null)
        : null;
      if ((action === "insert" || action === "replace") && !suggestedTemplate) return null;

      const relation = relationByPair.get(getRelationPairKey(item.sourceId, item.targetId));
      const sourceType = blockTypeLabel(sourceBlock.type, sourceBlock.type || t("app.module"));
      const targetType = blockTypeLabel(targetBlock.type, targetBlock.type || t("app.module"));
      const modificationInstruction = String(item.suggestion || "").trim();
      if (!modificationInstruction) return null;

      return {
        id: String(
          item.rootIssueKey ||
          `${relation?.id || `enhancement-${sourceBlock.id}-${targetBlock.id}`}-${index}`
        ),
        action,
        rewriteScope: action === "revise" ? "local" : action === "replace" ? "full" : "",
        relationLabel: relation?.relationLabel || `${sourceType} → ${targetType}`,
        category: String(item.category || t("app.contentReview")),
        criterion: String(item.criterion || relation?.criterion || t("app.modelRelation")),
        criterionKey: String(item.criterionKey || ""),
        relationSourceId: String(sourceBlock.id),
        relationTargetId: String(targetBlock.id),
        targetBlockId: sourceBlock.id,
        insertAfterId: action === "insert" ? String(sourceBlock.id) : null,
        insertBeforeId: action === "insert" ? String(targetBlock.id) : null,
        insertType: action === "insert" ? suggestedTemplate.type : null,
        insertPlacement: action === "insert"
          ? String(item.insertPlacement || "between_modules")
          : null,
        replaceType: action === "replace" ? suggestedTemplate.type : null,
        replaceLabel: action === "replace" ? suggestedTemplate.label : null,
        suggestedModule: action === "insert" || action === "replace"
          ? {
              type: suggestedTemplate.type,
              label: blockTypeLabel(
                suggestedTemplate.type,
                suggestedTemplate.label || suggestedTemplate.type
              ),
              color: suggestedTemplate.color || "#64748b",
              fill: suggestedTemplate.fill || "#f8fafc",
              isReviewGenerated: suggestedTemplate.isReviewGenerated === true,
            }
          : null,
        sourceBlock: {
          id: sourceBlock.id,
          type: sourceBlock.type,
          label: sourceType,
          text: String(sourceBlock.text || ""),
          color: sourceBlock.color || "#64748b",
          fill: sourceBlock.fill || "#f8fafc",
        },
        targetBlock: {
          id: targetBlock.id,
          type: targetBlock.type,
          label: targetType,
          text: String(targetBlock.text || ""),
          color: targetBlock.color || "#64748b",
          fill: targetBlock.fill || "#f8fafc",
        },
        contextBlocks: blocks.map((block) => ({
          id: block.id,
          type: block.type,
          text: String(block.text || ""),
        })),
        originalText: String(sourceBlock.text || "").trim(),
        summary: String(item.summary || t("app.canStrengthen")),
        comment: String(item.summary || t("app.canStrengthen")),
        suggestion: modificationInstruction,
        modificationInstruction,
        decision: null,
      };
    };
    const blinkTimer = window.setInterval(() => {
      setReviewState((state) => state.running && state.activeGraphId
        ? { ...state, blinkOn: !state.blinkOn }
        : state);
    }, 420);

    try {
      await reviewArgumentFrameworkStream({
        blocks,
        templates: reviewTemplates,
        interfaceLanguage: language,
        signal: reviewController.signal,
        onEvent: async (event) => {
          // abort 后 reader 可能已经交付了一条排队事件；不得让它继续改 UI。
          if (reviewController.signal.aborted) return;

          if (event.type === "summary_delta") {
            const summaryDelta = String(event.delta || "");
            streamedOverallSummary += summaryDelta;
            revealReviewPanelWhenSummaryReady(streamedOverallSummary);
            setReviewState((state) => ({
              ...state,
              phase: "summary",
              overallSummary: `${state.overallSummary}${summaryDelta}`,
              activeIds: blocks.map((block) => String(block.id)),
              activeGraphId: "overall-review",
              status: t("app.reviewWhole"),
            }));
            return;
          }

          if (event.type === "summary_done") {
            const completedOverallSummary = String(
              event.overallSummary || streamedOverallSummary
            ).trim();
            if (completedOverallSummary) {
              streamedOverallSummary = completedOverallSummary;
            }
            revealReviewPanelWhenSummaryReady(completedOverallSummary);
            logResearchEvent(
              "review_overall_evaluation_completed",
              {
                overall_summary: String(event.overallSummary || "").trim(),
                highlights: Array.isArray(event.summaryHighlights)
                  ? event.summaryHighlights
                  : [],
              },
              {
                actionId: reviewActionId,
                targetBlockIds: blocks.map((block) => block.id),
              }
            );
            setReviewState((state) => ({
              ...state,
              phase: "summary",
              overallSummary: completedOverallSummary || state.overallSummary,
              summaryHighlights: Array.isArray(event.summaryHighlights)
                ? event.summaryHighlights.map((value) => String(value || "").trim()).filter(Boolean)
                : [],
            }));
            return;
          }

          if (event.type === "phase" && event.phase === "criteria") {
            setReviewState((state) => ({
              ...state,
              phase: "criteria",
              activeIds: [],
              activeGraphId: null,
              blinkOn: false,
              current: 0,
              total: Number(event.total) || 0,
              status: t("app.reviewPreparingCriteria"),
            }));
            return;
          }

          if (event.type === "criteria_ready") {
            setReviewState((state) => ({
              ...state,
              total: Math.max(0, Number(event.total) || 0),
            }));
            return;
          }

          if (event.type === "criterion_start") {
            const relatedIds = (Array.isArray(event.relatedIds) ? event.relatedIds : [])
              .map(String)
              .filter((id) => blockById.has(id));
            const checkingCriterion = {
              key: String(event.key || `criterion-${event.index || Date.now()}`),
              criterion: String(event.criterion || ""),
              paragraph: Math.max(0, Number(event.paragraph) || 0),
              summary: "",
              status: "checking",
              relationStrength: null,
              relatedIds,
              issueId: null,
            };
            setReviewState((state) => ({
              ...state,
              activeIds: relatedIds,
              activeGraphId: `criterion-${String(event.key || event.index || "active")}`,
              blinkOn: true,
              criteria: state.criteria.some((item) => item.key === checkingCriterion.key)
                ? state.criteria.map((item) => item.key === checkingCriterion.key
                    ? { ...item, ...checkingCriterion }
                    : item)
                : [...state.criteria, checkingCriterion],
              current: Number(event.index) || 0,
              total: Number(event.total) || state.total,
              status: t("app.reviewCheckingCriterion", {
                criterion: String(event.criterion || "").trim(),
              }),
            }));
            // meta 一到就开始闪烁；关系结论随后由同一模型流实时写入。
            await waitForReviewBeat(220);
            return;
          }

          if (event.type === "criterion_summary_delta") {
            const criterionKey = String(event.key || "");
            const delta = String(event.delta || "");
            if (!criterionKey || !delta) return;
            setReviewState((state) => ({
              ...state,
              criteria: state.criteria.map((item) =>
                item.key === criterionKey
                  ? { ...item, summary: `${item.summary || ""}${delta}` }
                  : item
              ),
            }));
            // 保留真实流式感，但避免一句判断瞬间全部跳出。
            await waitForReviewBeat(28);
            return;
          }

          if (event.type === "criterion_result") {
            const issue = event.status === "issue"
              ? createReviewResult({
                  ...event.issue,
                  criterionKey: event.key,
                  criterion: event.criterion,
                  summary: event.summary,
                }, 0)
              : null;
            const criterionResult = {
              key: String(event.key || `criterion-${Date.now()}`),
              criterion: String(event.criterion || ""),
              paragraph: Math.max(0, Number(event.paragraph) || 0),
              summary: String(event.summary || "").trim(),
              status: issue ? "issue" : "pass",
              relationStrength: Number.isFinite(Number(event.relationStrength))
                ? Math.max(0, Math.min(100, Math.round(Number(event.relationStrength))))
                : null,
              relatedIds: (Array.isArray(event.relatedIds) ? event.relatedIds : []).map(String),
              issueId: issue?.id || null,
            };
            logResearchEvent(
              "review_relation_checked",
              {
                criterion_key: criterionResult.key,
                criterion: criterionResult.criterion,
                paragraph: criterionResult.paragraph,
                summary: criterionResult.summary,
                status: criterionResult.status,
                relation_strength: criterionResult.relationStrength,
                issue: issue
                  ? {
                      id: issue.id,
                      action: issue.action,
                      suggestion: issue.modificationInstruction,
                    }
                  : null,
              },
              {
                actionId: reviewActionId,
                targetBlockIds: criterionResult.relatedIds,
              }
            );
            setReviewState((state) => ({
              ...state,
              current: Math.min(state.total || Infinity, state.criteria.length + 1),
              criteria: state.criteria.some((item) => item.key === criterionResult.key)
                ? state.criteria.map((item) => item.key === criterionResult.key ? criterionResult : item)
                : [...state.criteria, criterionResult],
              results: issue && !state.results.some((item) => item.id === issue.id)
                ? [...state.results, issue]
                : state.results,
            }));
            await waitForReviewBeat(120);
            return;
          }

          if (event.type === "criteria_final") {
            const finalizedResults = [];
            const finalizedCriteria = (Array.isArray(event.criteria) ? event.criteria : [])
              .map((criterion, index) => {
                const issue = criterion?.status === "issue" && criterion?.issue
                  ? createReviewResult({
                      ...criterion.issue,
                      criterionKey: criterion.key,
                      criterion: criterion.criterion,
                      summary: criterion.summary,
                    }, index)
                  : null;
                if (issue) finalizedResults.push(issue);
                return {
                  key: String(criterion?.key || `criterion-${index}`),
                  criterion: String(criterion?.criterion || ""),
                  paragraph: Math.max(0, Number(criterion?.paragraph) || 0),
                  summary: String(criterion?.summary || "").trim(),
                  status: issue ? "issue" : "pass",
                  relationStrength: Number.isFinite(Number(criterion?.relationStrength))
                    ? Math.max(0, Math.min(100, Math.round(Number(criterion.relationStrength))))
                    : null,
                  relatedIds: (Array.isArray(criterion?.relatedIds) ? criterion.relatedIds : [])
                    .map(String),
                  issueId: issue?.id || null,
                };
              });
            setReviewState((state) => ({
              ...state,
              total: finalizedCriteria.length,
              current: finalizedCriteria.length,
              criteria: finalizedCriteria,
              results: finalizedResults,
            }));
            return;
          }

          if (event.type === "module") {
            summaries.set(String(event.id), String(event.focus || ""));
            const block = blockById.get(String(event.id));
            if (!block) return;
            const note = {
              id: String(event.id),
              blockId: String(event.id),
              type: blockTypeLabel(block.type, block.type || t("app.module")),
              text: String(event.focus || ""),
              color: block.color || "#64748b",
              fill: block.fill || "#f8fafc",
            };
            setReviewState((state) => ({
              ...state,
              current: state.notes.some((item) => item.id === note.id) ? state.current : state.current + 1,
              total: blocks.length,
              notes: state.notes.some((item) => item.id === note.id)
                ? state.notes.map((item) => item.id === note.id ? note : item)
                : [...state.notes, note],
              activeIds: [block.id],
              activeGraphId: `note-${block.id}`,
              blinkOn: true,
              status: note.text
                ? t("relation.checkingModule", { type: note.type, text: note.text })
                : t("relation.checkingRole", { type: note.type }),
            }));
            await waitForReviewBeat(560);
            return;
          }

          if (event.type === "relation") {
            const sourceBlock = blockById.get(String(event.sourceId));
            const targetBlock = blockById.get(String(event.targetId));
            if (!sourceBlock || !targetBlock) return;
            const pairKey = getRelationPairKey(sourceBlock.id, targetBlock.id);
            if (relationByPair.has(pairKey)) return;
            const sourceType = blockTypeLabel(sourceBlock.type, sourceBlock.type || t("app.module"));
            const targetType = blockTypeLabel(targetBlock.type, targetBlock.type || t("app.module"));
            const relation = String(event.relation || t("app.related"));
            const id = `inferred-${sourceBlock.id}-${targetBlock.id}-${relationByPair.size}`;
            const relationInfo = {
              id,
              sourceId: String(sourceBlock.id),
              targetId: String(targetBlock.id),
              relation,
              importance: Math.max(1, Math.min(5, Number(event.importance) || 3)),
              color: sourceBlock.color || targetBlock.color || "#9aa3af",
              relationLabel: `${sourceType} → ${targetType}`,
              criterion: t("relation.pairCriterion", { relation }),
              sourceBlock,
              targetBlock,
            };
            relationByPair.set(pairKey, relationInfo);
            setReviewState((state) => ({
              ...state,
              graph: state.graph.some((item) => item.id === relationInfo.id)
                ? state.graph
                : [...state.graph, relationInfo],
              activeIds: [sourceBlock.id, targetBlock.id],
              activeGraphId: relationInfo.id,
              blinkOn: true,
              status: t("relation.judging", { source: sourceType, target: targetType, relation }),
            }));
            await waitForReviewBeat(760);
            return;
          }

          if (event.type === "final") {
            const finalOverallSummary = String(
              event.overallSummary || streamedOverallSummary
            ).trim();
            if (finalOverallSummary) {
              streamedOverallSummary = finalOverallSummary;
            }
            revealReviewPanelWhenSummaryReady(finalOverallSummary);
            setReviewState((state) => ({
              ...state,
              phase: "done",
              activeIds: [],
              activeGraphId: null,
              activeIssue: null,
              blinkOn: false,
              overallSummary: finalOverallSummary || state.overallSummary,
              summaryHighlights: Array.isArray(event.summaryHighlights)
                ? event.summaryHighlights.map((value) => String(value || "").trim()).filter(Boolean)
                : state.summaryHighlights,
              status: t("app.reviewOrganizing"),
            }));
            return;
          }
        },
      });

      setReviewState((state) => ({
        ...state,
        running: false,
        phase: "done",
        activeIds: [],
        activeGraphId: null,
        activeIssue: null,
        blinkOn: false,
        status: state.results.length > 0
          ? t("app.reviewDoneIssues", { count: state.results.length })
          : t("app.reviewDoneChecks", { count: state.criteria.length }),
      }));
      revealReviewPanelWhenSummaryReady(streamedOverallSummary);
      logResearchEvent(
        "review_completed",
        { duration_ms: Math.round(performance.now() - reviewStartedAt) },
        { actionId: reviewActionId, targetBlockIds: blocks.map((block) => block.id) }
      );
    } catch (error) {
      if (
        error?.name === "AbortError" ||
        reviewController.signal.aborted
      ) {
        setReviewState((state) => ({
          ...state,
          running: false,
          phase:
            state.overallSummary || state.criteria.length > 0
              ? state.phase
              : "idle",
          activeIds: [],
          activeGraphId: null,
          activeIssue: null,
          blinkOn: false,
          status: t("app.reviewPaused"),
        }));
        logResearchEvent(
          "review_paused",
          { duration_ms: Math.round(performance.now() - reviewStartedAt) },
          { actionId: reviewActionId, targetBlockIds: blocks.map((block) => block.id) }
        );
        return;
      }

      console.error("整体审阅失败：", error);
      setReviewState((state) => ({
        ...state,
        running: false,
        phase: "idle",
        activeIds: [],
        activeGraphId: null,
        activeIssue: null,
        blinkOn: false,
        status: t("app.reviewFailed"),
      }));
      setReviewPanelOpen(false);
      logResearchEvent(
        "review_failed",
        {
          duration_ms: Math.round(performance.now() - reviewStartedAt),
          error: error?.message || "review failed",
        },
        { actionId: reviewActionId, targetBlockIds: blocks.map((block) => block.id) }
      );
    } finally {
      window.clearInterval(blinkTimer);
      if (reviewAbortControllerRef.current === reviewController) {
        reviewAbortControllerRef.current = null;
      }
    }
  };

  /**
   * 面板显示、阶段切换和新段落结果到达后，在浏览器完成两帧布局后采样。
   * 控制台搜索 “Review Layout Debug” 即可获得相对审阅前的坐标变化。
   */
  useEffect(() => {
    if (!reviewPanelOpen && !reviewState.running) return undefined;

    let secondFrameId = null;
    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        const snapshot = captureReviewLayoutSnapshot({
          label: [
            "02-review-layout",
            reviewState.phase,
            `criteria-${reviewState.criteria.length}`,
            `results-${reviewState.results.length}`,
          ].join("/"),
          sections,
          stage: stageRef.current,
          page: pageRef.current,
          content: contentRef.current,
          baseline: reviewLayoutDebugBaselineRef.current,
        });
        logReviewLayoutSnapshot(snapshot);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      if (secondFrameId != null) {
        window.cancelAnimationFrame(secondFrameId);
      }
    };
  }, [
    reviewPanelOpen,
    reviewState.running,
    reviewState.phase,
    reviewState.criteria.length,
    reviewState.results.length,
    sections,
    stageRef,
    pageRef,
    contentRef,
  ]);

  const clearReviewIssueFocus = () => {
    setReviewState((state) => ({
      ...state,
      activeIds: [],
      activeGraphId: null,
      activeIssue: null,
      blinkOn: false,
    }));
  };

  const handleFocusReviewIssue = (item) => {
    if (!item) {
      clearReviewIssueFocus();
      return;
    }

    logResearchEvent(
      "review_suggestion_opened",
      {
        issue_id: item.id,
        action: item.action,
        summary: item.summary,
        suggestion: item.modificationInstruction || item.suggestion,
      },
      {
        targetBlockIds: [item.targetBlockId, item.relationTargetId].filter(Boolean),
      }
    );

    setReviewState((state) => ({
      ...state,
      // 展开建议时只显示“来源模块 → 建议卡片”的曲线，
      // 不再重新触发相关模块的闪烁。
      activeIds: [],
      activeGraphId: null,
      activeIssue: item,
      blinkOn: false,
    }));
  };

  const handleReviewAccept = async (item, lifecycle = {}) => {
    const suggestionActionId = createResearchActionId("review-suggestion");
    const suggestionStartedAt = performance.now();
    let reviewApplyStarted = false;
    const notifyReviewApplyStart = () => {
      if (reviewApplyStarted) return;
      reviewApplyStarted = true;
      lifecycle.onApplyStart?.();
    };
    logResearchEvent(
      "review_suggestion_accept_started",
      {
        issue_id: item.id,
        action: item.action,
        instruction: item.modificationInstruction || item.suggestion,
      },
      {
        actionId: suggestionActionId,
        targetBlockIds: [item.targetBlockId, item.relationTargetId].filter(Boolean),
      }
    );
    if (item.action === "insert") {
      const currentBlocks = getReviewableBlocksFromSections(sections);
      const afterIndex = currentBlocks.findIndex(
        (block) => String(block.id) === String(item.insertAfterId)
      );
      const beforeIndex = currentBlocks.findIndex(
        (block) => String(block.id) === String(item.insertBeforeId)
      );

      if (afterIndex < 0 || beforeIndex !== afterIndex + 1) {
        throw new Error(t("review.insertPositionChanged"));
      }

      const moduleTemplate = item.suggestedModule;
      if (!moduleTemplate?.type) {
        throw new Error(t("review.insertTypeMissing"));
      }

      const insertedBlock = handleInsertInlineBlock(
        {
          type: moduleTemplate.type,
          label: moduleTemplate.label,
          color: moduleTemplate.color,
          fill: moduleTemplate.fill,
          text: moduleTemplate.label,
          isGenerated: false,
          forceLineBreakBefore:
            item.insertPlacement ===
            "current_paragraph_start",
        },
        beforeIndex
      );
      const insertedBlockId = String(insertedBlock?.id || "");
      if (!insertedBlockId) throw new Error(t("review.insertFailed"));

      setIsApplyingReviewSuggestion(true);
      setStatusText(t("review.inserting"));
      const applyGraphId = `apply-review-insert-${item.id}`;
      let streamedText = "";

      // 详细意见与关系曲线属于 reviewState；应用中的闪烁使用独立状态，
      // 避免 closeIssue -> clearReviewIssueFocus 误清理正在修改的模块。
      notifyReviewApplyStart();
      setReviewApplyPulse({
        activeIds: [insertedBlockId],
        operationId: applyGraphId,
        blinkOn: true,
      });

      const blinkTimer = window.setInterval(() => {
        setReviewApplyPulse((pulse) =>
          pulse.operationId === applyGraphId
            ? { ...pulse, blinkOn: !pulse.blinkOn }
            : pulse
        );
      }, 320);

      try {
        await generateReviewInsertedBlockStream({
          instruction: item.modificationInstruction || item.suggestion,
          insertType: moduleTemplate.type,
          insertLabel: moduleTemplate.label,
          sourceBlock: item.sourceBlock,
          targetBlock: item.targetBlock,
          contextBlocks: item.contextBlocks,
          onEvent: (event) => {
            if (event.type === "error") {
              throw new Error(event.error || t("review.insertFailed"));
            }
            if (event.type === "block_start") {
              handleChangeText(insertedBlockId, "");
              return;
            }
            if (event.type === "chunk") {
              streamedText += String(event.delta || "");
              handleChangeText(insertedBlockId, streamedText);
              return;
            }
            if (event.type === "block_done") {
              const finalText = streamedText.trim();
              if (!finalText) throw new Error(t("review.insertFailed"));
              handleChangeText(insertedBlockId, finalText, { isGenerated: true });
            }
          },
        });

        if (!streamedText.trim()) throw new Error(t("review.insertFailed"));
        if (moduleTemplate.isReviewGenerated) {
          setCustomTemplates((currentTemplates) => {
            const alreadyExists = [...BLOCK_TYPES, ...currentTemplates].some(
              (template) =>
                String(template?.type || "").toLocaleLowerCase() ===
                  String(moduleTemplate.type).toLocaleLowerCase() ||
                String(template?.label || "").toLocaleLowerCase() ===
                  String(moduleTemplate.label || moduleTemplate.type).toLocaleLowerCase()
            );
            if (alreadyExists) return currentTemplates;

            return [
              ...currentTemplates,
              {
                id: createTemplateId(),
                type: moduleTemplate.type,
                label: moduleTemplate.label || moduleTemplate.type,
                color: moduleTemplate.color,
                fill: moduleTemplate.fill,
                width: 160,
                text: "",
                isCustom: true,
              },
            ];
          });
        }
        setReviewState((state) => ({
          ...state,
          results: state.results.map((result) =>
            result.id === item.id ? { ...result, decision: "accepted" } : result
          ),
        }));
        clearReviewIssueFocus();
        logResearchEvent(
          "review_suggestion_applied",
          {
            issue_id: item.id,
            action: "insert",
            inserted_block_id: insertedBlockId,
            inserted_type: moduleTemplate.type,
            generated_text: streamedText.trim(),
            duration_ms: Math.round(performance.now() - suggestionStartedAt),
          },
          {
            actionId: suggestionActionId,
            targetBlockIds: [insertedBlockId, item.insertAfterId, item.insertBeforeId],
          }
        );
        return;
      } catch (error) {
        handleDeleteInlineBlock(insertedBlockId);
        logResearchEvent(
          "review_suggestion_apply_failed",
          {
            issue_id: item.id,
            action: "insert",
            error: error?.message || "insert failed",
          },
          { actionId: suggestionActionId, targetBlockIds: [insertedBlockId] }
        );
        throw error;
      } finally {
        window.clearInterval(blinkTimer);
        setStatusText("");
        setIsApplyingReviewSuggestion(false);
        setReviewApplyPulse((pulse) =>
          pulse.operationId === applyGraphId
            ? {
                ...pulse,
                activeIds: [],
                operationId: null,
                blinkOn: false,
              }
            : pulse
        );
      }
    }

    const liveSourceBlock = getBlockById(item.targetBlockId) || item.sourceBlock;
    const liveTargetBlock = getBlockById(item.relationTargetId) || item.targetBlock;
    const targetBlockId = String(item.targetBlockId);
    const originalText = String(liveSourceBlock?.text || "");
    const originalAppearance = {
      type: liveSourceBlock?.type,
      label: liveSourceBlock?.label || liveSourceBlock?.type,
      color: liveSourceBlock?.color || "#64748b",
      fill: liveSourceBlock?.fill || "#f8fafc",
    };
    const replacementTemplate = item.action === "replace" ? item.suggestedModule : null;
    const applyGraphId = `apply-review-${item.id}`;
    let streamedText = "";
    let finalText = "";
    let historyCaptured = false;

    const captureRevisionHistory = () => {
      if (historyCaptured) return;
      historyCaptured = true;
      pushHistorySnapshot(sections);
    };

    setIsApplyingReviewSuggestion(true);
    setStatusText(t("review.applying"));
    // 与插入流程相同：详情框关闭不会再触碰独立的应用闪烁状态。
    notifyReviewApplyStart();
    setReviewApplyPulse({
      activeIds: [targetBlockId],
      operationId: applyGraphId,
      blinkOn: true,
    });

    const blinkTimer = window.setInterval(() => {
      setReviewApplyPulse((pulse) =>
        pulse.operationId === applyGraphId
          ? { ...pulse, blinkOn: !pulse.blinkOn }
          : pulse
      );
    }, 320);

    try {
      await applyReviewInstructionStream({
        instruction: item.modificationInstruction || item.suggestion,
        rewriteScope: item.rewriteScope,
        action: item.action,
        replaceType: replacementTemplate?.type,
        replaceLabel: replacementTemplate?.label,
        sourceBlock: liveSourceBlock,
        targetBlock: liveTargetBlock,
        contextBlocks: item.contextBlocks,
        onEvent: async (event) => {
          if (event.type === "text_start") {
            captureRevisionHistory();
            if (replacementTemplate?.type) {
              handleUpdateBlockAppearance({
                blockId: targetBlockId,
                type: replacementTemplate.type,
                label: replacementTemplate.label || replacementTemplate.type,
                color: replacementTemplate.color,
                fill: replacementTemplate.fill,
                recordHistory: false,
              });
            }
            return;
          }

          if (event.type === "delta") {
            captureRevisionHistory();
            streamedText += String(event.delta || "");
            handleChangeText(targetBlockId, streamedText);
            return;
          }

          if (event.type === "done") {
            finalText = String(event.text || streamedText).trim();
            if (!finalText) throw new Error(t("review.applyFailed"));
            handleChangeText(targetBlockId, finalText, { isGenerated: true });
          }
        },
      });

      if (replacementTemplate?.isReviewGenerated) {
        setCustomTemplates((currentTemplates) => {
          const alreadyExists = [...BLOCK_TYPES, ...currentTemplates].some(
            (template) =>
              String(template?.type || "").toLocaleLowerCase() ===
                String(replacementTemplate.type).toLocaleLowerCase() ||
              String(template?.label || "").toLocaleLowerCase() ===
                String(replacementTemplate.label || replacementTemplate.type).toLocaleLowerCase()
          );
          if (alreadyExists) return currentTemplates;
          return [
            ...currentTemplates,
            {
              id: createTemplateId(),
              type: replacementTemplate.type,
              label: replacementTemplate.label || replacementTemplate.type,
              color: replacementTemplate.color,
              fill: replacementTemplate.fill,
              width: 160,
              text: "",
              isCustom: true,
            },
          ];
        });
      }

      setReviewState((state) => ({
        ...state,
        results: state.results.map((result) =>
          result.id === item.id ? { ...result, decision: "accepted" } : result
        ),
      }));
      clearReviewIssueFocus();
      logResearchEvent(
        "review_suggestion_applied",
        {
          issue_id: item.id,
          action: item.action,
          before_text: originalText,
          after_text: finalText || streamedText,
          duration_ms: Math.round(performance.now() - suggestionStartedAt),
        },
        { actionId: suggestionActionId, targetBlockIds: [targetBlockId] }
      );
    } catch (error) {
      handleChangeText(targetBlockId, originalText);
      if (replacementTemplate?.type) {
        handleUpdateBlockAppearance({
          blockId: targetBlockId,
          ...originalAppearance,
          recordHistory: false,
        });
      }
      logResearchEvent(
        "review_suggestion_apply_failed",
        {
          issue_id: item.id,
          action: item.action,
          error: error?.message || "revision failed",
        },
        { actionId: suggestionActionId, targetBlockIds: [targetBlockId] }
      );
      throw error;
    } finally {
      window.clearInterval(blinkTimer);
      setStatusText("");
      setIsApplyingReviewSuggestion(false);
      setReviewApplyPulse((pulse) =>
        pulse.operationId === applyGraphId
          ? {
              ...pulse,
              activeIds: [],
              operationId: null,
              blinkOn: false,
            }
          : pulse
      );
    }
  };

  const handleReviewReject = (item) => {
    // “暂时不改”只关闭当前建议，不把它标记为已处理。
    // 修改点圆圈会继续保留，用户之后仍可再次打开并接受。
    clearReviewIssueFocus();
    logResearchEvent(
      "review_suggestion_deferred",
      {
        issue_id: item?.id || "",
        action: item?.action || "",
      },
      {
        targetBlockIds: [item?.targetBlockId, item?.relationTargetId].filter(Boolean),
      }
    );
  };

  /**
   * 保存自定义标签。
   */
  useEffect(() => {
    try {
      window.localStorage.setItem(
        CUSTOM_TEMPLATES_STORAGE_KEY,
        JSON.stringify(
          customTemplates
        )
      );
    } catch (error) {
      console.error(
        "保存自定义标签失败：",
        error
      );
    }
  }, [
    customTemplates,
  ]);



  /**
   * 新增自定义标签。
   */
  const handleAddCustomTemplate =
    (template) => {
      if (
        !template?.type ||
        !template?.color
      ) {
        return;
      }

      const newTemplate = {
        id:
          createTemplateId(),

        type:
          template.type,

        color:
          template.color,

        fill:
          template.fill ||
          "#ffffff",

        width:
          template.width ||
          160,

        isCustom:
          true,
      };

      setCustomTemplates(
        (
          currentTemplates
        ) => [
          ...currentTemplates,
          newTemplate,
        ]
      );
    };

  /**
   * 删除自定义标签。
   */
  const handleDeleteCustomTemplate =
    (templateId) => {
      setCustomTemplates(
        (
          currentTemplates
        ) =>
          currentTemplates.filter(
            (template) =>
              template.id !==
              templateId
          )
      );
    };

  /**
   * 修改用户创建的标签模板。
   */
  const handleUpdateCustomTemplate =
    (nextTemplate) => {
      if (
        !nextTemplate?.id ||
        !nextTemplate?.type ||
        !nextTemplate?.color
      ) {
        return;
      }

      setCustomTemplates(
        (currentTemplates) =>
          currentTemplates.map(
            (template) =>
              template.id ===
              nextTemplate.id
                ? {
                    ...template,
                    ...nextTemplate,
                    fill:
                      nextTemplate.fill ||
                      template.fill,
                    isCustom: true,
                  }
                : template
          )
      );
    };

  const reviewPanelStacked =
    reviewPanelOpen && Number(zoom) > 1.001;

  return (
    <div
      style={{
        width:
          "100%",

        minHeight:
          "100vh",

        background:
          "#f2f2f2",

        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',

        overflowX:
          "auto",
      }}
    >
      <LanguageMenu
        researchSession={researchSession}
        onFinishResearchSession={handleFinishResearchSession}
      />
      <div
        style={{
          display:
            "grid",

          /**
           * 审阅完成后仅展开紧凑的潜在修改点面板，不再显示关系树。
           */
          gridTemplateColumns:
            "156px minmax(0, 1fr)",

          width:
            "100%",

          minHeight:
            "100vh",

          boxSizing:
            "border-box",

          transition:
            "grid-template-columns 0.2s ease",
        }}
      >
        {/* 左侧标签栏 */}
        <div
          data-workspace-drop-zone="left-gutter"
          style={{
            position:
              "relative",

            minWidth:
              0,

            minHeight:
              "100vh",

            zIndex:
              20,

            background:
              "#e7e7e7",
          }}
        >
          <Sidebar
            zoom={zoom}
            customTemplates={
              customTemplates
            }
            onTemplateMouseDown={
              handleTemplateMouseDown
            }
            onTemplateDragEnd={
              cancelTemplateDrag
            }
            onAddCustomTemplate={
              handleAddCustomTemplate
            }
            onDeleteCustomTemplate={
              handleDeleteCustomTemplate
            }
            onUpdateCustomTemplate={
              handleUpdateCustomTemplate
            }
          />

          <div
            aria-live="polite"
            data-workspace-drop-ignore="true"
            title={t("app.noSpaces")}
            style={{
              position: "fixed",
              left: 18,
              bottom: 18,
              zIndex: 100,
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 8,
              minWidth: 118,
              padding: 10,
              boxSizing:
                "border-box",
              border:
                "1px solid rgba(17,24,39,0.08)",
              borderRadius: 10,
              background:
                "rgba(255,255,255,0.88)",
              boxShadow:
                "0 4px 14px rgba(15,23,42,0.08)",
              backdropFilter:
                "blur(8px)",
              WebkitBackdropFilter:
                "blur(8px)",
              color: "#4b5563",
              fontSize: 12,
              lineHeight: "18px",
              textAlign: "center",
              userSelect: "none",
              WebkitUserSelect:
                "none",
            }}
          >
            <div
              style={{
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              {t("app.totalCharacters")}　
              <span
                style={{
                  color: "#111827",
                  fontWeight: 600,
                  fontVariantNumeric:
                    "tabular-nums",
                }}
              >
                {totalCharacterCount}
              </span>
            </div>

            <button
              type="button"
              onClick={handleExportWord}
              disabled={
                totalCharacterCount === 0 ||
                isGenerating ||
                isAdjustingLength
              }
              title={t("app.exportWordTitle")}
              style={{
                width: "100%",
                height: 30,
                padding: "0 10px",
                border:
                  "1px solid rgba(17,24,39,0.12)",
                borderRadius: 7,
                background:
                  totalCharacterCount === 0 ||
                  isGenerating ||
                  isAdjustingLength
                    ? "#f3f4f6"
                    : "#ffffff",
                color:
                  totalCharacterCount === 0 ||
                  isGenerating ||
                  isAdjustingLength
                    ? "#9ca3af"
                    : "#374151",
                fontSize: 12,
                fontWeight: 500,
                cursor:
                  totalCharacterCount === 0 ||
                  isGenerating ||
                  isAdjustingLength
                    ? "default"
                    : "pointer",
              }}
            >
              {t("app.exportWord")}
            </button>
          </div>
        </div>

        {/* 中间编辑区 */}
        <main
          className={`editor-main${
            reviewPanelStacked
              ? " review-panel-stacked"
              : ""
          }`}
          style={{
            minWidth:
              0,

            minHeight:
              "100vh",

            background:
              "#e7e7e7",

            display:
              "flex",

            flexDirection:
              "column",

            alignItems:
              "center",

            padding:
              "32px 18px 32px",

            boxSizing:
              "border-box",

            gap:
              14,

            /**
             * 允许浮动模块拖出画布后继续显示，
             * 不再被中间编辑区裁切。
             */
            overflow:
              "visible",

            position:
              "relative",
          }}
        >
          {/* 顶部工具栏 */}
          <div
            style={{
              position:
                "relative",

              width:
                "100%",

              minHeight:
                100,

              zIndex:
                30,

              flex:
                "0 0 auto",
            }}
          >
           <Toolbar
  zoom={
    zoom
  }

  onZoomIn={
    zoomIn
  }

  onZoomOut={
    zoomOut
  }

  onResetZoom={
    resetZoom
  }

  onUndo={
    undoLastAction
  }

  onRedo={
    redoLastAction
  }

  canUndo={canUndo}
  canRedo={canRedo}

  onGenerate={
    handleToolbarGenerate
  }

  onReview={handleToolbarReview}
  isReviewing={reviewState.running}
  reviewStatus={reviewState.status}

  onComplete={
    handleToolbarComplete
  }

  selectedIds={
    selectedIds
  }


  /* AI 初次生成 */
  isGenerating={
    isGenerating
  }


  /* 新增：模块长度调整 */
  isAdjustingLength={
    isAdjustingLength
  }

  isAdjustingStyle={
    isAdjustingStyle
  }

  isApplyingMultiAction={isApplyingMultiAction}
  isApplyingReviewSuggestion={isApplyingReviewSuggestion}


  generatingBlockIds={
    generatingBlockIds
  }

  generatingBlinkOn={
    generatingBlinkOn
  }


  /* 状态文字 */
  statusText={
    statusText
  }

  generationStatus={
    generationStatus
  }


  webSearchEnabled={
    webSearchEnabled
  }

  onToggleWebSearch={
    toggleWebSearch
  }

  reviewPanelOpen={reviewPanelOpen}
  reviewPanelStacked={reviewPanelStacked}

/>
          </div>

          <GenerationFailureDialog
            open={Boolean(generationFailure)}
            count={generationFailure?.targetIds?.length || 0}
            isRetrying={isGenerating}
            onRetry={retryFailedGeneration}
            onClose={dismissGenerationFailure}
          />

          {/* 页面画布 */}
          <div
            className={`page-canvas-shell${
              reviewPanelOpen
                ? " review-panel-open"
                : ""
            }`}
            style={{
              width:
                "100%",

              minWidth:
                0,

              flex:
                1,

              display:
                "flex",

              justifyContent:
                "center",

              alignItems:
                "flex-start",

              /**
               * 允许浮动模块越过画布边界，
               * 显示在画布右侧区域。
               */
              overflow:
                "visible",

              position:
                "relative",
            }}
          >
            <ReviewIssuesPanel
              open={reviewPanelOpen}
              results={reviewState.results}
              criteria={reviewState.criteria}
              phase={reviewState.phase}
              overallSummary={reviewState.overallSummary}
              summaryHighlights={reviewState.summaryHighlights}
              onFocusIssue={handleFocusReviewIssue}
              onAccept={handleReviewAccept}
              onReject={handleReviewReject}
              onClose={() => {
                clearReviewIssueFocus();
                setReviewPanelOpen(false);
              }}
            />

            <PageCanvas
              zoom={
                zoom
              }

              pageRef={
                pageRef
              }

              contentRef={
                contentRef
              }

              stageRef={
                stageRef
              }

              draggingBlockId={
                draggingBlockId
              }

              isDraggingTemplate={
                isDraggingTemplate
              }

              onDragEnd={
                endBlockDrag
              }

              sectionLayouts={
                sectionLayouts
              }

              totalContentHeight={
                totalContentHeight
              }

              selectedIds={
                selectedIds
              }

              selectionRect={
                selectionRect
              }

              isGenerating={
                isGenerating
              }

              generatingBlockIds={
                reviewApplyPulse.activeIds.length > 0
                  ? reviewApplyPulse.activeIds
                  : reviewState.activeIds.length > 0
                  ? reviewState.activeIds
                  : generatingBlockIds
              }

              generatingBlinkOn={
                reviewApplyPulse.activeIds.length > 0
                  ? reviewApplyPulse.blinkOn
                  : reviewState.activeIds.length > 0
                  ? reviewState.blinkOn
                  : generatingBlinkOn
              }

              isAdjustingLength={
                isAdjustingLength
              }

              adjustingLengthBlockId={
                adjustingLengthBlockId
              }

              isAdjustingStyle={
                isAdjustingStyle
              }

              adjustingStyleBlockId={
                adjustingStyleBlockId
              }

              onStopAdjustingStyle={
                stopAdjustingStyle
              }

              onStopGenerating={
                stopGenerating
              }

              onCanvasMouseUp={
                handleCanvasMouseUp
              }

              onExternalDrop={
                handleExternalDrop
              }

              onSelectionMove={
                handleSelectionMove
              }

              onSelectionStart={
                handleSelectionStart
              }

              onSelectionEnd={
                handleSelectionEnd
              }

              onBlockMouseDown={
                handleBlockMouseDown
              }

              onContextSelectBlocks={
                selectBlocksForContextMenu
              }

              onDeleteContextBlocks={
                deleteBlocksByIds
              }

              onRegenerateContextBlocks={
                regenerateBlocksFromLastPrompt
              }

              onRestoreContextBlocks={
                restoreBlocksPreviousContent
              }

              onBlockDragStart={
                handleBlockDragStart
              }

              getBlockById={
                getBlockById
              }

              updateBlockPlacement={
                updateBlockPlacement
              }

              onChangeText={
                handleChangeText
              }

              onCommitBlocks={
                handleBatchChangeText
              }

              onTextBlur={
                handleTextBlur
              }

              onInsertInlineBlock={
                handleInsertInlineBlock
              }

              onDeleteInlineBlock={
                handleDeleteInlineBlock
              }

              onReorderInlineBlocks={
                handleReorderInlineBlocks
              }

              onClearSelection={
                clearSelection
              }

              onRestoreCompletedSection={
                handleRestoreCompletedSection
              }

              onRestoreCompletedParagraph={
                handleRestoreCompletedParagraph
              }

              onUpdateCompletedSectionText={
                handleUpdateCompletedSectionText
              }

              onUpdateFloatingBlockText={
                handleUpdateFloatingBlockText
              }

              onUpdateFloatingBlockWidth={
                handleUpdateFloatingBlockWidth
              }

              onApplyBlockInstruction={
    handleApplyBlockStyle
}

onAdjustBlockLength={
    handleApplyBlockLength
}

duplicateSelectedBlocks={
    duplicateSelectedBlocks
}

beginDuplicateDrag={
    beginDuplicateDrag
}
            />
          </div>

          {/* 底部操作提示 */}
          <div
            style={{
              flex:
                "0 0 auto",

              fontSize:
                12,

              color:
                "#666",

              textAlign:
                "center",
            }}
          >
            {t("app.bottomHelp")}
          </div>
        </main>

        <ActiveReviewCurve
          stageRef={stageRef}
          issue={reviewState.activeIssue}
        />

      </div>
    </div>
  );
}
