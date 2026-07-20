import {
  useEffect,
  useRef,
  useState,
} from "react";

import Sidebar from "./components/Sidebar.jsx";
import Toolbar from "./components/Toolbar.jsx";
import PageCanvas from "./components/PageCanvas/PageCanvas.jsx";

import {
  useEditor,
} from "./hooks/useEditor";

const CUSTOM_TEMPLATES_STORAGE_KEY =
  "writing-interface-custom-block-templates";

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

export default function App() {
  const stageRef =
    useRef(null);

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

    /**
     * 页面与布局状态。
     */
    statusText,
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
  } = useEditor();

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
           * 两列布局：
           * 左侧标签栏 + 中间编辑区。
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

  onComplete={
    handleComplete
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
                generatingBlockIds
              }

              generatingBlinkOn={
                generatingBlinkOn
              }

              isAdjustingLength={
                isAdjustingLength
              }

              adjustingLengthBlockId={
                adjustingLengthBlockId
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

      </div>
    </div>
  );
}