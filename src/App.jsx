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

const CUSTOM_TEMPLATES_STORAGE_KEY =
  "writing-interface-custom-block-templates";

const waitForReviewBeat = (duration) =>
  new Promise((resolve) => window.setTimeout(resolve, duration));

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

  (Array.isArray(sourceSections) ? sourceSections : []).forEach((section) => {
    (Array.isArray(section?.blocks) ? section.blocks : []).forEach((block) => {
      if (block?.isCompletedParagraph) {
        (Array.isArray(block.completedBlocks) ? block.completedBlocks : [])
          .filter(
            (sourceBlock) =>
              sourceBlock?.placement !== "floating" &&
              String(sourceBlock?.text || "").trim()
          )
          .forEach((sourceBlock) => blocks.push(sourceBlock));
        return;
      }

      if (
        block?.placement !== "floating" &&
        String(block?.text || "").trim()
      ) {
        blocks.push(block);
      }
    });
  });

  return blocks;
}

export default function App() {
  const { blockTypeLabel, t } = useI18n();
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [reviewState, setReviewState] = useState({
    running: false,
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
      .filter(
        (template, index, templates) =>
          template?.type &&
          (
            template.isCustom === true ||
            !["Title", "Generated", "Merged"].includes(template.type)
          ) &&
          templates.findIndex((candidate) => candidate?.type === template.type) === index
      ),
    [customTemplates]
  );


  /**
   * 编辑器状态与操作。
   */
  const {
    sections,
    zoom,
    selectedIds,
    selectionRect,

    /**
     * AI 生成状态。
     */
    isGenerating,
    generatingBlockIds,
    generatingBlinkOn,
    generationStatus,
    webSearchEnabled,
    toggleWebSearch,

    /**
     * 调整长度状态。
     */
    isAdjustingLength,
    adjustingLengthBlockId,

    isAdjustingStyle,
    adjustingStyleBlockId,

    /**
     * 页面与布局状态。
     */
    statusText,
    showTemporaryStatus,
    stageRef,
    pageRef,
    contentRef,

    draggingBlockId,
    endBlockDrag,

    editableBlockCount,
    sectionLayouts,
    totalContentHeight,

    /**
     * 浮动模块和外观操作。
     */
    handleUpdateFloatingBlockText,
    handleUpdateFloatingBlockWidth,

    /**
     * 模块拖入与放置。
     */
    handleTemplateMouseDown,
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
  duplicateSelectedBlocks,
    beginDuplicateDrag,
} = useEditor();

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

    return false;
  };

  const handleToolbarGenerate = () => {
    if (showBusyActionReason()) return;

    if (selectedIds.length === 0) {
      showTemporaryStatus(t("app.selectToGenerate"), 2800);
      return;
    }

    showTemporaryStatus("", 0);
    generateFromSelectedBlocks();
  };

  const handleToolbarReview = () => {
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
    handleReview();
  };

  const handleToolbarComplete = () => {
    if (showBusyActionReason()) return;

    if (editableBlockCount === 0) {
      showTemporaryStatus(t("app.nothingToComplete"), 2600);
      return;
    }

    showTemporaryStatus("", 0);
    handleComplete();
  };

  const handleExportWord = () => {
    exportDocumentToWord(
      sections
    );
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

    setReviewPanelOpen(false);
    setReviewState({
      running: true,
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
      overallSummary: "",
      summaryHighlights: [],
    });

    const blockById = new Map(blocks.map((block) => [String(block.id), block]));
    const summaries = new Map();
    const relationByPair = new Map();
    const getRelationPairKey = (sourceId, targetId) =>
      [String(sourceId), String(targetId)].sort().join("::");
    const blinkTimer = window.setInterval(() => {
      setReviewState((state) => state.running && state.activeGraphId
        ? { ...state, blinkOn: !state.blinkOn }
        : state);
    }, 420);

    try {
      await reviewArgumentFrameworkStream({
        blocks,
        templates: reviewTemplates,
        onEvent: async (event) => {
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

          if (event.type === "phase" && event.phase === "enhancements") {
            setReviewState((state) => ({
              ...state,
              activeIds: [],
              activeGraphId: null,
              activeIssue: null,
              blinkOn: false,
              status: t("app.reviewSuggestions"),
            }));
            return;
          }

          if (event.type === "final") {
            const results = (Array.isArray(event.enhancements) ? event.enhancements : []).map((item, index) => {
              const action = item.action === "insert" ? "insert" : "revise";
              const sourceBlock = blockById.get(String(item.sourceId));
              const targetBlock = blockById.get(String(item.targetId));
              if (!sourceBlock || !targetBlock) return null;
              const suggestedTemplate = action === "insert"
                ? reviewTemplates.find((template) => template.type === String(item.insertType || ""))
                : null;
              if (action === "insert" && !suggestedTemplate) return null;
              const relation = relationByPair.get(getRelationPairKey(item.sourceId, item.targetId));
              const sourceType = blockTypeLabel(sourceBlock.type, sourceBlock.type || t("app.module"));
              const targetType = blockTypeLabel(targetBlock.type, targetBlock.type || t("app.module"));
              const originalText = String(sourceBlock.text || "").trim();
              const modificationInstruction = String(item.suggestion || "").trim();
              if (!modificationInstruction) return null;
              return {
                id: `${relation?.id || `enhancement-${sourceBlock.id}-${targetBlock.id}`}-${index}`,
                action,
                relationLabel: relation?.relationLabel || `${sourceType} → ${targetType}`,
                category: String(item.category || t("app.contentReview")),
                criterion: String(item.criterion || relation?.criterion || t("app.modelRelation")),
                relationSourceId: String(sourceBlock.id),
                relationTargetId: String(targetBlock.id),
                targetBlockId: sourceBlock.id,
                insertAfterId: action === "insert" ? String(sourceBlock.id) : null,
                insertBeforeId: action === "insert" ? String(targetBlock.id) : null,
                insertType: action === "insert" ? suggestedTemplate.type : null,
                suggestedModule: action === "insert"
                  ? {
                      type: suggestedTemplate.type,
                      label: blockTypeLabel(
                        suggestedTemplate.type,
                        suggestedTemplate.label || suggestedTemplate.type
                      ),
                      color: suggestedTemplate.color || "#64748b",
                      fill: suggestedTemplate.fill || "#f8fafc",
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
                originalText,
                summary: String(item.summary || t("app.canStrengthen")),
                comment: String(item.summary || t("app.canStrengthen")),
                suggestion: modificationInstruction,
                modificationInstruction,
                decision: null,
              };
            }).filter(Boolean);
            setReviewState((state) => ({
              ...state,
              activeIds: [],
              activeGraphId: null,
              activeIssue: null,
              blinkOn: false,
              results,
              overallSummary: String(event.overallSummary || "").trim(),
              summaryHighlights: Array.isArray(event.summaryHighlights)
                ? event.summaryHighlights.map((value) => String(value || "").trim()).filter(Boolean)
                : [],
              status: t("app.reviewOrganizing"),
            }));
          }
        },
      });

      setReviewState((state) => ({
        ...state,
        running: false,
        activeIds: [],
        activeGraphId: null,
        activeIssue: null,
        blinkOn: false,
        status: state.results.length > 0
          ? t("app.reviewDoneIssues", { count: state.results.length })
          : t("app.reviewDoneModules", { count: state.notes.length }),
      }));
      setReviewPanelOpen(true);
    } catch (error) {
      console.error("整体审阅失败：", error);
      setReviewState((state) => ({
        ...state,
        running: false,
        activeIds: [],
        activeGraphId: null,
        activeIssue: null,
        blinkOn: false,
        status: t("app.reviewFailed"),
      }));
      setReviewPanelOpen(false);
    } finally {
      window.clearInterval(blinkTimer);
    }
  };

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

  const handleReviewAccept = async (item) => {
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
        },
        beforeIndex
      );
      const insertedBlockId = String(insertedBlock?.id || "");
      if (!insertedBlockId) throw new Error(t("review.insertFailed"));

      const applyGraphId = `apply-review-insert-${item.id}`;
      let streamedText = "";
      let textStarted = false;

      setReviewState((state) => ({
        ...state,
        activeIds: [insertedBlockId],
        activeGraphId: applyGraphId,
        blinkOn: true,
      }));

      const blinkTimer = window.setInterval(() => {
        setReviewState((state) =>
          state.activeGraphId === applyGraphId && !textStarted
            ? { ...state, blinkOn: !state.blinkOn }
            : state
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
              textStarted = true;
              window.clearInterval(blinkTimer);
              handleChangeText(insertedBlockId, "");
              setReviewState((state) => ({ ...state, blinkOn: false }));
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
        setReviewState((state) => ({
          ...state,
          results: state.results.map((result) =>
            result.id === item.id ? { ...result, decision: "accepted" } : result
          ),
        }));
        clearReviewIssueFocus();
        return;
      } catch (error) {
        handleDeleteInlineBlock(insertedBlockId);
        throw error;
      } finally {
        window.clearInterval(blinkTimer);
        setReviewState((state) =>
          state.activeGraphId === applyGraphId
            ? {
                ...state,
                activeIds: [],
                activeGraphId: null,
                blinkOn: false,
              }
            : state
        );
      }
    }

    const liveSourceBlock = getBlockById(item.targetBlockId) || item.sourceBlock;
    const liveTargetBlock = getBlockById(item.relationTargetId) || item.targetBlock;
    const targetBlockId = String(item.targetBlockId);
    const originalText = String(liveSourceBlock?.text || "");
    const applyGraphId = `apply-review-${item.id}`;
    let streamedText = "";
    let finalText = "";
    let textStarted = false;
    let historyCaptured = false;

    const captureRevisionHistory = () => {
      if (historyCaptured) return;
      historyCaptured = true;
      pushHistorySnapshot(sections);
    };

    setReviewState((state) => ({
      ...state,
      activeIds: [targetBlockId],
      activeGraphId: applyGraphId,
      blinkOn: true,
    }));

    const blinkTimer = window.setInterval(() => {
      setReviewState((state) =>
        state.activeGraphId === applyGraphId && !textStarted
          ? { ...state, blinkOn: !state.blinkOn }
          : state
      );
    }, 320);

    try {
      await applyReviewInstructionStream({
        instruction: item.modificationInstruction || item.suggestion,
        sourceBlock: liveSourceBlock,
        targetBlock: liveTargetBlock,
        contextBlocks: item.contextBlocks,
        onEvent: async (event) => {
          if (event.type === "text_start") {
            captureRevisionHistory();
            textStarted = true;
            window.clearInterval(blinkTimer);
            setReviewState((state) => ({ ...state, blinkOn: false }));
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
            handleChangeText(targetBlockId, finalText);
          }
        },
      });

      setReviewState((state) => ({
        ...state,
        results: state.results.map((result) =>
          result.id === item.id ? { ...result, decision: "accepted" } : result
        ),
      }));
      clearReviewIssueFocus();
    } catch (error) {
      handleChangeText(targetBlockId, originalText);
      throw error;
    } finally {
      window.clearInterval(blinkTimer);
      setReviewState((state) =>
        state.activeGraphId === applyGraphId
          ? {
              ...state,
              activeIds: [],
              activeGraphId: null,
              blinkOn: false,
            }
          : state
      );
    }
  };

  const handleReviewReject = (item) => {
    setReviewState((state) => ({ ...state, results: state.results.map((result) => result.id === item.id ? { ...result, decision: "rejected" } : result) }));
    clearReviewIssueFocus();
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
      <LanguageMenu />
      <div
        style={{
          display:
            "grid",

          /**
           * 审阅完成后仅展开紧凑的潜在修改点面板，不再显示关系树。
           */
          gridTemplateColumns:
            "164px minmax(0, 1fr)",

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
            customTemplates={
              customTemplates
            }
            onTemplateMouseDown={
              handleTemplateMouseDown
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

          <ReviewIssuesPanel
            open={reviewPanelOpen}
            results={reviewState.results}
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
                reviewState.activeIds.length > 0
                  ? reviewState.activeIds
                  : generatingBlockIds
              }

              generatingBlinkOn={
                reviewState.activeIds.length > 0
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
