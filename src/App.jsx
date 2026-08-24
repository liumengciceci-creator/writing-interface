import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Sidebar from "./components/Sidebar.jsx";
import Toolbar from "./components/Toolbar.jsx";
import PageCanvas from "./components/PageCanvas/PageCanvas.jsx";
import ReviewIssuesPanel from "./components/ReviewIssuesPanel.jsx";
import { reviewArgumentFrameworkStream } from "./api/reviewBlockCompatibility.js";

import {
  useEditor,
} from "./hooks/useEditor";
import {
  exportDocumentToWord,
} from "./utils/exportDocumentToWord.js";

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

export default function App() {
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const reviewFocusTimerRef = useRef(null);
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
    stageRef,
    pageRef,
    contentRef,

    draggingBlockId,
    endBlockDrag,

    editableBlockCount,
    activeParagraphModulesHidden,
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
    handleToggleModuleVisibility,
    handleRestoreCompletedParagraph,
    handleRestoreCompletedSection,
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

  const handleExportWord = () => {
    exportDocumentToWord(
      sections
    );
  };

  const getSelectedBlocksInDocumentOrder = () => {
    const selectedSet = new Set(selectedIds.map(String));
    const ordered = [];
    sections.forEach((section) => {
      (section?.blocks || []).forEach((block) => {
        if (selectedSet.has(String(block.id))) ordered.push(block);
      });
    });
    return ordered;
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

      if (block.type === "Reason") addClaimRelation("reasonExplainsClaim", "原因 → 论点", "原因是否解释论点");
      if (block.type === "Evidence") addClaimRelation("evidenceSupportsClaim", "证据 → 论点", "证据是否支持论点");
      if (block.type === "Counter") addClaimRelation("counterChallengesClaim", "反论 → 论点", "反论是否回应论点");
      if (block.type === "Compare") addClaimRelation("compareClarifiesClaim", "对比 → 论点", "对比是否阐明论点");

      if (block.type === "Conclusion") {
        const documentBlocks = blocks.slice(0, index).filter((item) => item.type !== "Title");
        if (documentBlocks.length > 0) {
          relations.push({
            relationType: "conclusionSummarizesDocument",
            relationLabel: "结论 → 全文",
            criterion: "结论是否总结全文",
            sourceBlock: block,
            targetBlock: { id: "selected-document", type: "全文", text: documentBlocks.map((item) => item.text || "").join("\n") },
            contextBlocks: documentBlocks,
            activeIds: [block.id, ...documentBlocks.map((item) => item.id)],
          });
        }
      }
    });

    return relations;
  };

  const handleReview = async () => {
    const blocks = getSelectedBlocksInDocumentOrder();
    if (blocks.length < 2 || reviewState.running) return;

    if (reviewFocusTimerRef.current) {
      window.clearInterval(reviewFocusTimerRef.current);
      reviewFocusTimerRef.current = null;
    }
    setReviewPanelOpen(false);
    setReviewState({
      running: true,
      current: 0,
      total: blocks.length,
      activeIds: [],
      blinkOn: false,
      status: "正在识别所选模块之间的关系…",
      graph: [],
      notes: [],
      activeGraphId: null,
      activeIssue: null,
      results: [],
    });

    const blockById = new Map(blocks.map((block) => [String(block.id), block]));
    const summaries = new Map();
    const relationByPair = new Map();
    const getRelationPairKey = (sourceId, targetId) =>
      [String(sourceId), String(targetId)].sort().join("::");
    const typeLabels = {
      Claim: "论点",
      Reason: "原因",
      Evidence: "证据",
      Counter: "反论",
      Compare: "对比",
      Conclusion: "结论",
      Title: "标题",
    };
    const blinkTimer = window.setInterval(() => {
      setReviewState((state) => state.running && state.activeGraphId
        ? { ...state, blinkOn: !state.blinkOn }
        : state);
    }, 420);

    try {
      await reviewArgumentFrameworkStream({
        blocks,
        onEvent: async (event) => {
          if (event.type === "module") {
            summaries.set(String(event.id), String(event.focus || ""));
            const block = blockById.get(String(event.id));
            if (!block) return;
            const note = {
              id: String(event.id),
              blockId: String(event.id),
              type: typeLabels[block.type] || block.type || "模块",
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
                ? `正在检查${note.type}：${note.text}`
                : `正在检查${note.type}在整体论证中的作用…`,
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
            const sourceType = typeLabels[sourceBlock.type] || sourceBlock.type || "模块";
            const targetType = typeLabels[targetBlock.type] || targetBlock.type || "模块";
            const relation = String(event.relation || "关联");
            const id = `inferred-${sourceBlock.id}-${targetBlock.id}-${relationByPair.size}`;
            const relationInfo = {
              id,
              sourceId: String(sourceBlock.id),
              targetId: String(targetBlock.id),
              relation,
              importance: Math.max(1, Math.min(5, Number(event.importance) || 3)),
              color: sourceBlock.color || targetBlock.color || "#9aa3af",
              relationLabel: `${sourceType} → ${targetType}`,
              criterion: `这两个模块形成“${relation}”的内容关系`,
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
              status: `正在判断：${sourceType}与${targetType}形成“${relation}”`,
            }));
            await waitForReviewBeat(760);
            return;
          }

          if (event.type === "final") {
            const results = (Array.isArray(event.enhancements) ? event.enhancements : []).map((item, index) => {
              const sourceBlock = blockById.get(String(item.sourceId));
              const targetBlock = blockById.get(String(item.targetId));
              if (!sourceBlock || !targetBlock) return null;
              const relation = relationByPair.get(getRelationPairKey(item.sourceId, item.targetId));
              const sourceType = typeLabels[sourceBlock.type] || sourceBlock.type || "模块";
              const targetType = typeLabels[targetBlock.type] || targetBlock.type || "模块";
              const originalText = String(sourceBlock.text || "").trim();
              const suggestedText = String(item.suggestedText || "").trim();
              if (!suggestedText || suggestedText === originalText) return null;
              return {
                id: `${relation?.id || `enhancement-${sourceBlock.id}-${targetBlock.id}`}-${index}`,
                relationLabel: relation?.relationLabel || `${sourceType} → ${targetType}`,
                category: String(item.category || "内容关系把关"),
                criterion: String(item.criterion || relation?.criterion || "模型识别出的内容关系"),
                relationSourceId: String(sourceBlock.id),
                relationTargetId: String(targetBlock.id),
                targetBlockId: sourceBlock.id,
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
                suggestedText,
                summary: String(item.summary || "这条关系可以进一步加强。"),
                comment: String(item.summary || "这条关系可以进一步加强。"),
                suggestion: String(item.suggestion || "可以进一步补足这条关系中的关键逻辑。"),
                decision: null,
              };
            }).filter(Boolean);
            setReviewState((state) => ({
              ...state,
              results,
              status: "正在整理潜在增强点…",
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
          ? `审阅完成：发现 ${state.results.length} 个潜在增强点`
          : `审阅完成：已检查 ${state.notes.length} 个模块`,
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
        status: "整体审阅失败，请稍后重试",
      }));
      setReviewPanelOpen(false);
    } finally {
      window.clearInterval(blinkTimer);
    }
  };

  const clearReviewIssueFocus = () => {
    if (reviewFocusTimerRef.current) {
      window.clearInterval(reviewFocusTimerRef.current);
      reviewFocusTimerRef.current = null;
    }
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

    if (reviewFocusTimerRef.current) {
      window.clearInterval(reviewFocusTimerRef.current);
    }

    const sourceId = String(item.relationSourceId);
    const targetId = String(item.relationTargetId);
    setReviewState((state) => ({
      ...state,
      activeIds: [sourceId, targetId],
      activeGraphId: `issue-${item.id}`,
      activeIssue: item,
      blinkOn: true,
    }));

    let blinkCount = 0;
    reviewFocusTimerRef.current = window.setInterval(() => {
      blinkCount += 1;
      setReviewState((state) => ({ ...state, blinkOn: !state.blinkOn }));
      if (blinkCount >= 8) {
        window.clearInterval(reviewFocusTimerRef.current);
        reviewFocusTimerRef.current = null;
        setReviewState((state) => ({ ...state, blinkOn: true }));
      }
    }, 340);
  };

  const handleReviewAccept = (item) => {
    handleChangeText(item.targetBlockId, item.suggestedText);
    setReviewState((state) => ({ ...state, results: state.results.map((result) => result.id === item.id ? { ...result, decision: "accepted" } : result) }));
    clearReviewIssueFocus();
  };

  const handleReviewReject = (item) => {
    setReviewState((state) => ({ ...state, results: state.results.map((result) => result.id === item.id ? { ...result, decision: "rejected" } : result) }));
    clearReviewIssueFocus();
  };

  useEffect(() => () => {
    if (reviewFocusTimerRef.current) {
      window.clearInterval(reviewFocusTimerRef.current);
    }
  }, []);

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
      <div
        style={{
          display:
            "grid",

          /**
           * 审阅完成后仅展开紧凑的潜在修改点面板，不再显示关系树。
           */
          gridTemplateColumns:
            reviewPanelOpen
              ? "164px minmax(720px, 1fr) 340px"
              : "164px minmax(0, 1fr)",

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
            title="不包含空格和换行"
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
              总字数　
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
              title="将当前线性正文导出为 Word 文档"
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
              导出Word
            </button>
          </div>
        </div>

        {/* 中间编辑区 */}
        <main
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
              "20px 18px 32px",

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

  onGenerate={
    generateFromSelectedBlocks
  }

  onReview={handleReview}
  isReviewing={reviewState.running}
  reviewStatus={reviewState.status}

  onComplete={
    handleComplete
  }

  onToggleModuleVisibility={
    handleToggleModuleVisibility
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

  editableBlockCount={
    editableBlockCount
  }

  modulesHidden={
    activeParagraphModulesHidden
  }
/>
          </div>

          {/* 页面画布 */}
          <div
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

              activeReviewIssue={
                reviewState.activeIssue
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
            Shift 多选模块　|　
            长按显示抓手后拖动排序　|　
            选中模块后拖动右侧长度柄，Enter 应用　|　
            Delete 删除模块　|　
            生成：按钮或 Enter
          </div>
        </main>

        <ReviewIssuesPanel
          open={reviewPanelOpen}
          results={reviewState.results}
          onFocusIssue={handleFocusReviewIssue}
          onAccept={handleReviewAccept}
          onReject={handleReviewReject}
          onClose={() => {
            clearReviewIssueFocus();
            setReviewPanelOpen(false);
          }}
        />

      </div>
    </div>
  );
}
