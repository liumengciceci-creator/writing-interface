import {
  useEffect,
} from "react";

/**
 * 判断当前键盘事件是否发生在文字编辑区域。
 */
function isTypingElement(
  element
) {
  if (
    !element ||
    !(element instanceof Element)
  ) {
    return false;
  }

  const tagName =
    element.tagName;

  if (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT"
  ) {
    return true;
  }

  if (
    element.isContentEditable
  ) {
    return true;
  }

  /**
   * 只有真正处于 contentEditable=true 的节点才算输入状态。
   * 不能因为元素位于语义编辑器内部就一律返回 true，
   * 否则选中模块后 Cmd/Ctrl+Z 和 Delete 都会被拦截。
   */
  return Boolean(
    element.closest(
      [
        "[contenteditable='true']",
        "[data-semantic-text='true'][data-editing='true']",
        "[data-editable-fragment='true'][contenteditable='true']",
      ].join(",")
    )
  );
}

export function useEditorShortcuts({
  selectedIds = [],

  isGenerating,

  draggingType,
  draggingBlockId,

  undoLastAction,

  zoomIn,
  zoomOut,
  resetZoom,

  handleDeleteSelected,
  generateFromSelectedBlocks,

  handleGlobalMouseUp,
}) {
  /**
   * 键盘快捷键。
   */
  useEffect(() => {
    const handleKeyDown =
      async (event) => {
        /**
         * 中文输入法组合输入过程中，
         * 不响应全局快捷键。
         */
        if (
          event.isComposing ||
          event.keyCode === 229
        ) {
          return;
        }

        const key =
          event.key.toLowerCase();

        const isUndoShortcut =
          (event.metaKey ||
            event.ctrlKey) &&
          !event.shiftKey &&
          key === "z";

        const isZoomInShortcut =
          (event.metaKey ||
            event.ctrlKey) &&
          (event.key === "=" ||
            event.key === "+");

        const isZoomOutShortcut =
          (event.metaKey ||
            event.ctrlKey) &&
          event.key === "-";

        const isZoomResetShortcut =
          (event.metaKey ||
            event.ctrlKey) &&
          event.key === "0";

        const isEnterTrigger =
          event.key ===
            "Enter" &&
          !event.shiftKey &&
          !event.metaKey &&
          !event.ctrlKey;

        const eventTarget =
          event.target instanceof
          Element
            ? event.target
            : null;

        const activeElement =
          document.activeElement;

        const isTyping =
          isTypingElement(
            eventTarget
          ) ||
          isTypingElement(
            activeElement
          );

        /**
         * 编辑锁只保护当前真正获得焦点的编辑器。
         * 页面里其他残留或失焦的编辑状态不能阻止
         * 单击选中模块后的 Delete/Backspace 删除。
         */
        const hasFocusedTextEditor =
          Boolean(
            activeElement instanceof
              Element &&
            activeElement.closest(
              [
                "[data-floating-editing='true']",
                "[data-semantic-text='true'][data-editing='true']",
                "[data-editable-fragment='true'][contenteditable='true']",
              ].join(",")
            )
          );

        /**
         * 正在编辑文字时，
         * Cmd/Ctrl + Z 交给浏览器原生 contentEditable。
         *
         * 光标不在编辑器内时，
         * 才执行应用自己的历史记录撤销。
         */
        if (isUndoShortcut) {
          if (
            isTyping ||
            hasFocusedTextEditor
          ) {
            return;
          }

          event.preventDefault();

          undoLastAction?.();

          return;
        }

        /**
         * 页面缩放快捷键。
         */
        if (
          isZoomInShortcut
        ) {
          event.preventDefault();

          zoomIn?.();

          return;
        }

        if (
          isZoomOutShortcut
        ) {
          event.preventDefault();

          zoomOut?.();

          return;
        }

        if (
          isZoomResetShortcut
        ) {
          event.preventDefault();

          resetZoom?.();

          return;
        }

        /**
         * 输入状态下的 Delete 和 Backspace
         * 必须交给 SingleSemanticEditor。
         *
         * 非输入状态下才删除选中的模块。
         */
        if (
          (event.key ===
            "Delete" ||
            event.key ===
              "Backspace") &&
          !isTyping &&
          !hasFocusedTextEditor
        ) {
          if (
            selectedIds.length ===
            0
          ) {
            return;
          }

          event.preventDefault();

          handleDeleteSelected?.();

          return;
        }

        /**
         * 输入状态下按 Enter 是模块内换行。
         *
         * 非输入状态下按 Enter，
         * 才根据选中模块进行 AI 生成。
         */
        if (
          isEnterTrigger &&
          !isTyping &&
          selectedIds.length >
            0 &&
          !isGenerating
        ) {
          event.preventDefault();

          await generateFromSelectedBlocks?.();
        }
      };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    selectedIds,
    isGenerating,

    undoLastAction,

    zoomIn,
    zoomOut,
    resetZoom,

    handleDeleteSelected,
    generateFromSelectedBlocks,
  ]);

  /**
   * 鼠标在页面外松开时结束拖拽。
   *
   * 延迟到下一帧执行，避免它先于
   * PageCanvas 的 onMouseUp 清除拖拽数据。
   */
  useEffect(() => {
    const handleWindowMouseUp =
      (event) => {
        if (
          draggingType == null &&
          draggingBlockId == null
        ) {
          return;
        }

        requestAnimationFrame(
          () => {
            handleGlobalMouseUp?.(
              event
            );
          }
        );
      };

    window.addEventListener(
      "mouseup",
      handleWindowMouseUp
    );

    return () => {
      window.removeEventListener(
        "mouseup",
        handleWindowMouseUp
      );
    };
  }, [
    draggingType,
    draggingBlockId,
    handleGlobalMouseUp,
  ]);
}
