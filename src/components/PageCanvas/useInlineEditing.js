import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  findBlockById,
  isNodeInside,
  normalizeId,
  normalizeText,
} from "./semanticEditorUtils";

import {
  insertPlainText,
  placeCaret,
} from "./caretUtils";

/**
 * 为 requestAnimationFrame 提供浏览器兜底。
 */
function runNextFrame(callback) {
  if (
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame ===
      "function"
  ) {
    return window.requestAnimationFrame(
      callback
    );
  }

  return window.setTimeout(
    callback,
    0
  );
}

/**
 * 取消 requestAnimationFrame 或 setTimeout。
 */
function cancelNextFrame(frameId) {
  if (frameId == null) {
    return;
  }

  if (
    typeof window !== "undefined" &&
    typeof window.cancelAnimationFrame ===
      "function"
  ) {
    window.cancelAnimationFrame(
      frameId
    );

    return;
  }

  window.clearTimeout(frameId);
}

/**
 * 获取折叠 selection 的光标矩形。
 *
 * 空行或行尾时 range.getBoundingClientRect()
 * 有时会返回 0 尺寸，因此使用临时零宽字符测量。
 */
function getCaretClientRect(
  range,
  blockElement
) {
  if (!range) {
    return null;
  }

  const directRect =
    range.getBoundingClientRect();

  if (
    directRect &&
    (
      directRect.height > 0 ||
      directRect.width > 0
    )
  ) {
    return directRect;
  }

  const marker =
    document.createElement("span");

  marker.textContent = "\u200B";

  marker.setAttribute(
    "data-semantic-caret-marker",
    "true"
  );

  marker.style.display =
    "inline-block";

  marker.style.width = "0";

  marker.style.padding = "0";

  marker.style.margin = "0";

  marker.style.border = "0";

  marker.style.pointerEvents =
    "none";

  const temporaryRange =
    range.cloneRange();

  temporaryRange.insertNode(
    marker
  );

  const markerRect =
    marker.getBoundingClientRect();

  marker.remove();

  /**
   * 删除临时节点后，浏览器的 selection
   * 有时会失去原位置，因此恢复原 range。
   */
  const selection =
    window.getSelection();

  if (
    selection &&
    isNodeInside(
      range.startContainer,
      blockElement
    )
  ) {
    selection.removeAllRanges();
    selection.addRange(range);
  }

  return markerRect;
}

/**
 * 管理 SingleSemanticEditor 内部的文本编辑行为。
 */
export default function useInlineEditing({
  editorRef,

  blocks = [],

  focusedEditingBlockId = null,
  onEditingBlockChange,

  onChangeText,
  onCommitBlocks,
  onTextBlur,
  onTextEditStart,

  isGenerating = false,

  /**
   * 文字变化后重新测量模块边框。
   */
  measureLineExtensions,
} = {}) {
  const [
    editingBlockId,
    setEditingBlockId,
  ] = useState(null);

  /**
   * 每次双击都递增。
   *
   * 即使连续双击同一个模块，
   * 也重新执行 focus 和光标定位。
   */
  const [
    focusRequestVersion,
    setFocusRequestVersion,
  ] = useState(0);

  const caretPointRef =
    useRef({
      x: null,
      y: null,
    });

  const dirtyRef =
    useRef(false);

  /**
   * 当前编辑会话的文字撤销栈。
   */
  const textUndoStackRef =
    useRef([]);

  /**
   * 在主组件 JSX 最后渲染自定义光标，
   * 并将该 ref 传给它。
   */
  const customCaretRef =
    useRef(null);

  const internalEditingBlock =
    useMemo(() => {
      if (
        editingBlockId == null
      ) {
        return null;
      }

      return (
        blocks.find(
          (block) =>
            normalizeId(
              block.id
            ) ===
            normalizeId(
              editingBlockId
            )
        ) || null
      );
    }, [
      blocks,
      editingBlockId,
    ]);

  /**
   * 当前代码中只有 Generated 模块
   * 会向外暴露为 focused editing block。
   *
   * 保留你原有逻辑，防止外部面板行为变化。
   */
  const internalEditingBlockCanFocus =
    internalEditingBlock
      ?.isGenerated === true ||
    internalEditingBlock
      ?.type === "Generated";

  const effectiveEditingBlockId =
    focusedEditingBlockId != null
      ? normalizeId(
          focusedEditingBlockId
        )
      : internalEditingBlockCanFocus
        ? normalizeId(
            editingBlockId
          )
        : "";

  const hasFocusedEditingBlock =
    effectiveEditingBlockId !== "";

  /**
   * 将内部编辑状态通知给外层。
   */
  useEffect(() => {
    onEditingBlockChange?.(
      editingBlockId == null ||
        !internalEditingBlockCanFocus
        ? null
        : normalizeId(
            editingBlockId
          )
    );
  }, [
    editingBlockId,
    internalEditingBlockCanFocus,
    onEditingBlockChange,
  ]);

  /**
   * 重新测量模块边框。
   */
  const requestMeasurement =
    useCallback(() => {
      if (
        typeof measureLineExtensions !==
        "function"
      ) {
        return;
      }

      runNextFrame(
        measureLineExtensions
      );
    }, [
      measureLineExtensions,
    ]);

  /**
   * 将自定义光标隐藏。
   */
  const hideCustomCaret =
    useCallback(() => {
      const caret =
        customCaretRef.current;

      if (!caret) {
        return;
      }

      caret.style.display =
        "none";
    }, []);

  /**
   * 根据浏览器 selection 更新自定义光标位置。
   */
  const updateCustomCaret =
    useCallback(() => {
      const editor =
        editorRef?.current;

      const caret =
        customCaretRef.current;

      if (
        !editor ||
        !caret ||
        !editingBlockId
      ) {
        hideCustomCaret();

        return;
      }

      const blockElement =
        findBlockById(
          editor,
          editingBlockId
        );

      if (!blockElement) {
        hideCustomCaret();

        return;
      }

      const selection =
        window.getSelection();

      if (
        !selection ||
        selection.rangeCount === 0
      ) {
        hideCustomCaret();

        return;
      }

      const range =
        selection.getRangeAt(0);

      if (
        !range.collapsed ||
        !isNodeInside(
          range.startContainer,
          blockElement
        )
      ) {
        hideCustomCaret();

        return;
      }

      const caretRect =
        getCaretClientRect(
          range,
          blockElement
        );

      if (!caretRect) {
        hideCustomCaret();

        return;
      }

      const editorRect =
        editor.getBoundingClientRect();

      const scaleX =
        editor.offsetWidth > 0
          ? editorRect.width /
            editor.offsetWidth
          : 1;

      const scaleY =
        editor.offsetHeight > 0
          ? editorRect.height /
            editor.offsetHeight
          : scaleX;

      const safeScaleX =
        Number.isFinite(scaleX) &&
        scaleX > 0
          ? scaleX
          : 1;

      const safeScaleY =
        Number.isFinite(scaleY) &&
        scaleY > 0
          ? scaleY
          : 1;

      const left =
        (
          caretRect.left -
          editorRect.left
        ) /
          safeScaleX +
        (editor.scrollLeft || 0);

      const top =
        (
          caretRect.top -
          editorRect.top
        ) /
          safeScaleY +
        (editor.scrollTop || 0);

      let height =
        caretRect.height /
        safeScaleY;

      if (
        !Number.isFinite(height) ||
        height <= 1
      ) {
        const computedStyle =
          window.getComputedStyle(
            blockElement
          );

        height =
          Number.parseFloat(
            computedStyle.fontSize
          ) || 16;
      }

      caret.style.display =
        "block";

      caret.style.left =
        `${Math.round(
          left * 100
        ) / 100}px`;

      caret.style.top =
        `${Math.round(
          top * 100
        ) / 100}px`;

      caret.style.height =
        `${Math.max(
          14,
          Math.min(
            height,
            30
          )
        )}px`;

      caret.style.animation =
        "none";

      /**
       * 重新设置 animation，
       * 让每次输入后都从亮起状态开始闪烁。
       */
      void caret.offsetWidth;

      caret.style.animation =
        "semantic-custom-caret-blink 1s step-end infinite";
    }, [
      editingBlockId,
      editorRef,
      hideCustomCaret,
    ]);

  /**
   * 将当前模块文字提交给外层。
   */
  const commitBlock =
    useCallback(
      (
        blockId,
        element
      ) => {
        if (
          !blockId ||
          !element
        ) {
          return;
        }

        const text =
          normalizeText(
            element.textContent
          );

        if (dirtyRef.current) {
          if (
            typeof onCommitBlocks ===
            "function"
          ) {
            onCommitBlocks([
              {
                id: blockId,
                text,
              },
            ]);
          } else {
            onChangeText?.(
              blockId,
              text
            );
          }
        }

        dirtyRef.current =
          false;

        textUndoStackRef.current =
          [];

        onTextBlur?.(
          blockId,
          text
        );
      },
      [
        onChangeText,
        onCommitBlocks,
        onTextBlur,
      ]
    );

  /**
   * 保存一次文字撤销快照。
   */
  const rememberTextForUndo =
    useCallback((element) => {
      if (!element) {
        return;
      }

      const currentText =
        normalizeText(
          element.textContent
        );

      const stack =
        textUndoStackRef.current;

      if (
        stack[
          stack.length - 1
        ] === currentText
      ) {
        return;
      }

      textUndoStackRef.current = [
        ...stack.slice(-99),
        currentText,
      ];
    }, []);

  /**
   * 双击模块进入编辑。
   */
  const handleDoubleClick =
    useCallback(
      (
        event,
        block
      ) => {
        event.preventDefault();
        event.stopPropagation();

        if (
          isGenerating ||
          !block
        ) {
          return;
        }

        const blockId =
          normalizeId(
            block.id
          );

        if (!blockId) {
          return;
        }

        caretPointRef.current = {
          x: event.clientX,
          y: event.clientY,
        };

        dirtyRef.current =
          false;

        textUndoStackRef.current =
          [];

        setEditingBlockId(
          blockId
        );

        setFocusRequestVersion(
          (version) =>
            version + 1
        );

        onTextEditStart?.(
          blockId
        );
      },
      [
        isGenerating,
        onTextEditStart,
      ]
    );

  /**
   * contentEditable 输入后标记为脏数据。
   */
  const handleInput =
    useCallback(() => {
      dirtyRef.current =
        true;

      runNextFrame(
        updateCustomCaret
      );

      requestMeasurement();
    }, [
      requestMeasurement,
      updateCustomCaret,
    ]);

  /**
   * 只允许粘贴纯文本。
   */
  const handlePaste =
    useCallback(
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        const blockElement =
          event.currentTarget;

        rememberTextForUndo(
          blockElement
        );

        const text =
          (
            event.clipboardData ||
            window.clipboardData
          )
            ?.getData(
              "text/plain"
            )
            ?.replace(
              /\r\n?/g,
              "\n"
            ) || "";

        if (!text) {
          return;
        }

        if (
          insertPlainText(
            blockElement,
            text
          )
        ) {
          dirtyRef.current =
            true;

          runNextFrame(
            updateCustomCaret
          );

          requestMeasurement();
        }
      },
      [
        rememberTextForUndo,
        requestMeasurement,
        updateCustomCaret,
      ]
    );

  /**
   * Enter 时不允许浏览器插入 div 或 p，
   * 而是插入纯文本换行符。
   */
  const handleBeforeInput =
    useCallback(
      (event) => {
        const inputType =
          event.nativeEvent
            ?.inputType;

        if (
          inputType !==
            "historyUndo" &&
          inputType !==
            "historyRedo"
        ) {
          rememberTextForUndo(
            event.currentTarget
          );
        }

        if (
          inputType !==
            "insertParagraph" &&
          inputType !==
            "insertLineBreak"
        ) {
          return;
        }

        event.preventDefault();

        if (
          insertPlainText(
            event.currentTarget,
            "\n"
          )
        ) {
          dirtyRef.current =
            true;

          runNextFrame(
            updateCustomCaret
          );

          requestMeasurement();
        }
      },
      [
        rememberTextForUndo,
        requestMeasurement,
        updateCustomCaret,
      ]
    );

  /**
   * 编辑状态下的键盘事件。
   */
  const handleKeyDown =
    useCallback(
      (
        event,
        blockId
      ) => {
        const isCurrentBlockEditing =
          normalizeId(
            editingBlockId
          ) ===
          normalizeId(
            blockId
          );

        /**
         * 非编辑状态不拦截键盘，
         * 让外层快捷键处理整个模块删除。
         */
        if (
          !isCurrentBlockEditing
        ) {
          return;
        }

        event.stopPropagation();

        const key =
          event.key.toLowerCase();

        const isDirectTextMutation =
          event.key ===
            "Backspace" ||
          event.key ===
            "Delete" ||
          event.key ===
            "Enter" ||
          (
            event.key.length === 1 &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey
          );

        if (
          isDirectTextMutation &&
          !event.isComposing
        ) {
          rememberTextForUndo(
            event.currentTarget
          );
        }

        const isTextUndo =
          (
            event.metaKey ||
            event.ctrlKey
          ) &&
          !event.shiftKey &&
          key === "z";

        if (isTextUndo) {
          event.preventDefault();

          const previousText =
            textUndoStackRef.current.pop();

          if (
            previousText !==
            undefined
          ) {
            const contentElement =
              event.currentTarget.querySelector(
                "[data-semantic-block-content='true']"
              );

            const editableTextElement =
              contentElement || event.currentTarget;

            editableTextElement.textContent =
              previousText;

            placeCaret(
              editableTextElement
            );

            dirtyRef.current =
              true;

            runNextFrame(
              updateCustomCaret
            );

            requestMeasurement();
          }

          return;
        }

        if (
          event.key ===
          "Escape"
        ) {
          event.preventDefault();

          event.currentTarget.blur();

          return;
        }

        /**
         * Delete 和 Backspace 在编辑状态下
         * 只交给浏览器删除文字，不删除整个模块。
         */
      },
      [
        editingBlockId,
        rememberTextForUndo,
        requestMeasurement,
        updateCustomCaret,
      ]
    );

  /**
   * 编辑模块失焦后提交。
   */
  const handleBlur =
    useCallback(
      (
        event,
        blockId
      ) => {
        const blockElement =
          event.currentTarget;

        commitBlock(
          blockId,
          blockElement
        );

        hideCustomCaret();

        setEditingBlockId(
          (currentId) =>
            normalizeId(
              currentId
            ) ===
            normalizeId(
              blockId
            )
              ? null
              : currentId
        );
      },
      [
        commitBlock,
        hideCustomCaret,
      ]
    );

  /**
   * 主动结束当前编辑。
   */
  const stopEditing =
    useCallback(
      ({
        commit = true,
      } = {}) => {
        if (!editingBlockId) {
          return;
        }

        const blockId =
          normalizeId(
            editingBlockId
          );

        const blockElement =
          findBlockById(
            editorRef?.current,
            blockId
          );

        if (
          commit &&
          blockElement
        ) {
          commitBlock(
            blockId,
            blockElement
          );
        }

        if (
          blockElement &&
          document.activeElement ===
            blockElement
        ) {
          blockElement.blur();
        }

        dirtyRef.current =
          false;

        textUndoStackRef.current =
          [];

        setEditingBlockId(
          null
        );

        hideCustomCaret();
      },
      [
        commitBlock,
        editingBlockId,
        editorRef,
        hideCustomCaret,
      ]
    );

  /**
   * React 打开 contentEditable 后，
   * 聚焦模块并把光标放在双击位置。
   */
  useLayoutEffect(() => {
    if (!editingBlockId) {
      return undefined;
    }

    const blockElement =
      findBlockById(
        editorRef?.current,
        editingBlockId
      );

    if (!blockElement) {
      return undefined;
    }

    const frameId =
      runNextFrame(() => {
        blockElement.focus({
          preventScroll: true,
        });

        placeCaret(
          blockElement,
          caretPointRef.current.x,
          caretPointRef.current.y
        );

        updateCustomCaret();
      });

    return () => {
      cancelNextFrame(
        frameId
      );
    };
  }, [
    editingBlockId,
    editorRef,
    focusRequestVersion,
    updateCustomCaret,
  ]);

  /**
   * 鼠标点击、方向键和 selection 变化时，
   * 同步模拟光标。
   */
  useEffect(() => {
    if (!editingBlockId) {
      hideCustomCaret();

      return undefined;
    }

    const handleSelectionChange =
      () => {
        runNextFrame(
          updateCustomCaret
        );
      };

    document.addEventListener(
      "selectionchange",
      handleSelectionChange
    );

    window.addEventListener(
      "resize",
      handleSelectionChange
    );

    return () => {
      document.removeEventListener(
        "selectionchange",
        handleSelectionChange
      );

      window.removeEventListener(
        "resize",
        handleSelectionChange
      );
    };
  }, [
    editingBlockId,
    hideCustomCaret,
    updateCustomCaret,
  ]);

  /**
   * AI 开始生成时结束当前 contentEditable 会话。
   *
   * 否则浏览器保存的旧 DOM 可能在生成结束后
   * 覆盖 React 返回的新内容。
   */
  useLayoutEffect(() => {
    if (
      !isGenerating ||
      !editingBlockId
    ) {
      return;
    }

    const blockId =
      normalizeId(
        editingBlockId
      );

    const blockElement =
      findBlockById(
        editorRef?.current,
        blockId
      );

    if (blockElement) {
      commitBlock(
        blockId,
        blockElement
      );

      if (
        document.activeElement ===
        blockElement
      ) {
        blockElement.blur();
      }
    }

    dirtyRef.current =
      false;

    textUndoStackRef.current =
      [];

    setEditingBlockId(
      null
    );

    hideCustomCaret();
  }, [
    commitBlock,
    editingBlockId,
    editorRef,
    hideCustomCaret,
    isGenerating,
  ]);

  /**
   * 当前编辑模块被删除后退出编辑。
   */
  useEffect(() => {
    if (!editingBlockId) {
      return;
    }

    const stillExists =
      blocks.some(
        (block) =>
          normalizeId(
            block.id
          ) ===
          normalizeId(
            editingBlockId
          )
      );

    if (stillExists) {
      return;
    }

    dirtyRef.current =
      false;

    textUndoStackRef.current =
      [];

    setEditingBlockId(
      null
    );

    hideCustomCaret();
  }, [
    blocks,
    editingBlockId,
    hideCustomCaret,
  ]);

  return {
    editingBlockId,
    setEditingBlockId,

    effectiveEditingBlockId,
    hasFocusedEditingBlock,

    customCaretRef,

    handleDoubleClick,
    handleInput,
    handlePaste,
    handleBeforeInput,
    handleKeyDown,
    handleBlur,

    commitBlock,
    stopEditing,
    updateCustomCaret,
  };
}
