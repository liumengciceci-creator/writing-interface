import {
  useEffect,
  useRef,
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
   *
   * 不能因为元素位于语义编辑器内部就一律返回 true，
   * 否则选中模块后的 Cmd/Ctrl+Z、Cmd/Ctrl+C、
   * Cmd/Ctrl+V 和 Delete 都会被拦截。
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

/**
 * 判断页面当前是否存在真实文字选区。
 */
function hasActiveTextSelection() {
  const selection =
    window.getSelection?.();

  if (!selection) {
    return false;
  }

  if (selection.isCollapsed) {
    return false;
  }

  return Boolean(
    String(
      selection.toString?.() ??
        ""
    ).length > 0
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

  /**
   * 创建指定模块的副本。
   *
   * Cmd/Ctrl + V 时调用。
   * 副本由 useBlockDuplicate
   * 统一创建为 floating。
   */
  duplicateSelectedBlocks,

  handleGlobalMouseUp,
}) {
  /**
   * 编辑器内部模块剪贴板。
   *
   * Cmd/Ctrl + C 时只记录模块 ID，
   * 不立即生成副本。
   *
   * Cmd/Ctrl + V 时读取这些 ID，
   * 再调用 duplicateSelectedBlocks。
   */
  const copiedBlockIdsRef =
    useRef([]);

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
          String(
            event.key ?? ""
          ).toLowerCase();

        const hasCommandModifier =
          event.metaKey ||
          event.ctrlKey;

        const isUndoShortcut =
          hasCommandModifier &&
          !event.shiftKey &&
          !event.altKey &&
          key === "z";

        const isCopyShortcut =
          hasCommandModifier &&
          !event.shiftKey &&
          !event.altKey &&
          key === "c";

        const isPasteShortcut =
          hasCommandModifier &&
          !event.shiftKey &&
          !event.altKey &&
          key === "v";

        const isZoomInShortcut =
          hasCommandModifier &&
          !event.altKey &&
          (
            event.key === "=" ||
            event.key === "+"
          );

        const isZoomOutShortcut =
          hasCommandModifier &&
          !event.altKey &&
          event.key === "-";

        const isZoomResetShortcut =
          hasCommandModifier &&
          !event.altKey &&
          event.key === "0";

        const isEnterTrigger =
          event.key ===
            "Enter" &&
          !event.shiftKey &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey;

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
         *
         * 页面中其他残留或失焦的编辑状态不能阻止
         * 单击选中模块后的 Delete、Copy 和 Paste。
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
          event.stopPropagation();

          undoLastAction?.();

          return;
        }

        /**
         * Cmd/Ctrl + C：
         * 将当前选中的模块写入内部模块剪贴板。
         *
         * 此时不会立即创建副本。
         *
         * 以下情况保留浏览器原生文字复制：
         * 1. 当前正在编辑文字
         * 2. 当前存在真实文字选区
         */
        if (isCopyShortcut) {
          if (
            isTyping ||
            hasFocusedTextEditor ||
            hasActiveTextSelection()
          ) {
            return;
          }

          if (
            !Array.isArray(
              selectedIds
            ) ||
            selectedIds.length ===
              0
          ) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          copiedBlockIdsRef.current =
            selectedIds
              .filter(
                (blockId) =>
                  blockId !==
                    null &&
                  blockId !==
                    undefined
              )
              .map(
                (blockId) =>
                  String(
                    blockId
                  )
              );

          return;
        }

        /**
         * Cmd/Ctrl + V：
         * 粘贴内部剪贴板中的模块。
         *
         * 正在编辑文字时，
         * 保留浏览器原生文字粘贴。
         */
        if (isPasteShortcut) {
          if (
            isTyping ||
            hasFocusedTextEditor
          ) {
            return;
          }

          const copiedBlockIds =
            copiedBlockIdsRef.current;

          if (
            !Array.isArray(
              copiedBlockIds
            ) ||
            copiedBlockIds.length ===
              0
          ) {
            return;
          }

          if (
            typeof duplicateSelectedBlocks !==
            "function"
          ) {
            console.warn(
              "[useEditorShortcuts] duplicateSelectedBlocks 未传入，无法粘贴模块。"
            );

            return;
          }

          event.preventDefault();
          event.stopPropagation();

          duplicateSelectedBlocks(
            copiedBlockIds
          );

          return;
        }

        /**
         * 页面缩放快捷键。
         */
        if (
          isZoomInShortcut
        ) {
          event.preventDefault();
          event.stopPropagation();

          zoomIn?.();

          return;
        }

        if (
          isZoomOutShortcut
        ) {
          event.preventDefault();
          event.stopPropagation();

          zoomOut?.();

          return;
        }

        if (
          isZoomResetShortcut
        ) {
          event.preventDefault();
          event.stopPropagation();

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
          (
            event.key ===
              "Delete" ||
            event.key ===
              "Backspace"
          ) &&
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
          event.stopPropagation();

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
          !hasFocusedTextEditor &&
          selectedIds.length >
            0 &&
          !isGenerating
        ) {
          event.preventDefault();
          event.stopPropagation();

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
    duplicateSelectedBlocks,
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