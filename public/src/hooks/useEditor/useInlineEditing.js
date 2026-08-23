import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  getEditableNodes,
  getJoinedEditableText,
  normalizeEditableText,
  getCaretOffsetWithin,
  setCaretOffsetWithin,
} from "../../utils/editableText";

const DEBUG_INLINE = true;

export function useInlineEditing({
  sectionLayouts,
  onChangeText,
  onTextBlur,
  onTextEditStart,
}) {
  const [
    editingBlockId,
    setEditingBlockId,
  ] = useState(null);

  const [
    editingDraft,
    setEditingDraft,
  ] = useState("");

  const [
    handleVisibleBlockId,
    setHandleVisibleBlockId,
  ] = useState(null);

  const longPressTimerRef =
    useRef(null);

  const editingContainerRef =
    useRef(null);

  const blurTokenRef =
    useRef(0);

  const justEnteredEditRef =
    useRef(false);

  const isComposingRef =
    useRef(false);

  const latestDraftRef =
    useRef("");

  const caretOffsetRef =
    useRef(null);

  const restoreCaretRafRef =
    useRef(null);

  const enterFocusRafRef =
    useRef(null);

  const suppressNextCaretRestoreRef =
    useRef(false);

  /**
   * 保留这个值是为了兼容
   * PageCanvas 等已有代码。
   *
   * 现在始终为 false，
   * 不再把编辑框移动到下一行，
   * 也不再扩展成整行。
   */
  const lockedMoveDownRef =
    useRef(false);

  const debugLog = (
    ...args
  ) => {
    if (!DEBUG_INLINE) {
      return;
    }

    console.log(
      "[useInlineEditing]",
      ...args
    );
  };

  const debugDumpEditableState =
    (label) => {
      if (!DEBUG_INLINE) {
        return;
      }

      const container =
        editingContainerRef.current;

      if (!container) {
        console.log(
          `[useInlineEditing] ${label}: no container`
        );

        return;
      }

      const nodes =
        getEditableNodes(
          container
        );

      const active =
        document.activeElement;

      console.group(
        `[useInlineEditing] ${label}`
      );

      console.log(
        "editingBlockId =",
        editingBlockId
      );

      console.log(
        "editingDraft =",
        JSON.stringify(
          editingDraft
        )
      );

      console.log(
        "latestDraftRef =",
        JSON.stringify(
          latestDraftRef.current
        )
      );

      console.log(
        "caretOffsetRef =",
        caretOffsetRef.current
      );

      console.log(
        "lockedMoveDown =",
        lockedMoveDownRef.current
      );

      console.log(
        "activeFragmentIndex =",
        active?.getAttribute?.(
          "data-fragment-index"
        ) ?? null
      );

      console.log(
        "nodes =",
        nodes.map(
          (node) => ({
            fragmentIndex:
              node.getAttribute(
                "data-fragment-index"
              ),

            textContent:
              JSON.stringify(
                node.textContent ??
                  ""
              ),

            innerText:
              JSON.stringify(
                node.innerText ??
                  ""
              ),
          })
        )
      );

      console.groupEnd();
    };

  /**
   * 保持 latestDraftRef
   * 与编辑草稿同步。
   */
  useEffect(() => {
    latestDraftRef.current =
      editingDraft;
  }, [
    editingDraft,
  ]);

  /**
   * 标记刚进入编辑状态。
   */
  useEffect(() => {
    if (
      editingBlockId == null
    ) {
      return;
    }

    justEnteredEditRef.current =
      true;
  }, [
    editingBlockId,
  ]);

  /**
   * 组件卸载时清理定时器
   * 和动画帧。
   */
  useEffect(() => {
    return () => {
      if (
        longPressTimerRef.current
      ) {
        clearTimeout(
          longPressTimerRef.current
        );
      }

      if (
        restoreCaretRafRef.current
      ) {
        cancelAnimationFrame(
          restoreCaretRafRef.current
        );
      }

      if (
        enterFocusRafRef.current
      ) {
        cancelAnimationFrame(
          enterFocusRafRef.current
        );
      }
    };
  }, []);

  /**
   * 查找模块所在的编辑 section
   * 以及模块数据。
   */
  function getEditingSectionAndBlock(
    blockId
  ) {
    const editingSection =
      sectionLayouts.find(
        (section) =>
          section.mode ===
            "editing" &&
          section.blocks?.some(
            (block) =>
              String(
                block.id
              ) ===
              String(
                blockId
              )
          )
      );

    if (!editingSection) {
      return {
        editingSection:
          null,

        block:
          null,
      };
    }

    const block =
      (
        editingSection.blocks ||
        []
      ).find(
        (item) =>
          String(
            item.id
          ) ===
          String(
            blockId
          )
      );

    return {
      editingSection,
      block,
    };
  }

  /**
   * 获取当前模块对应的全部 fragment。
   */
  function getCurrentEditingBlockFragments(
    blockId
  ) {
    if (
      blockId == null
    ) {
      return [];
    }

    const {
      editingSection,
    } =
      getEditingSectionAndBlock(
        blockId
      );

    if (
      !editingSection
        ?.localFragments
    ) {
      return [];
    }

    return editingSection
      .localFragments
      .filter(
        (fragment) =>
          String(
            fragment.blockId
          ) ===
          String(
            blockId
          )
      )
      .sort(
        (a, b) => {
          if (
            a.y !== b.y
          ) {
            return (
              a.y - b.y
            );
          }

          return (
            a.x - b.x
          );
        }
      );
  }

  /**
   * 计算当前 fragment 前面
   * 已经存在多少字符。
   *
   * 双击某个 fragment 时，
   * 用于把光标放到对应位置。
   */
  function getOffsetBeforeFragment(
    blockId,
    fragmentIndex
  ) {
    const fragments =
      getCurrentEditingBlockFragments(
        blockId
      );

    if (
      !fragments.length
    ) {
      return 0;
    }

    let offset = 0;

    for (
      let index = 0;
      index <
      fragments.length;
      index += 1
    ) {
      if (
        index >=
        fragmentIndex
      ) {
        break;
      }

      offset +=
        normalizeEditableText(
          fragments[index]
            .text || ""
        ).length;
    }

    return offset;
  }

  /**
   * 从当前编辑容器读取
   * 完整规范化文本。
   */
  function readNormalizedTextFromContainer() {
    const container =
      editingContainerRef.current;

    if (!container) {
      return "";
    }

    return normalizeEditableText(
      getJoinedEditableText(
        container
      )
    );
  }

  /**
   * 输入过程中实时更新草稿
   * 和模块正文。
   */
  const applyDraftLive = (
    nextText
  ) => {
    const normalized =
      normalizeEditableText(
        nextText
      );

    debugLog(
      "applyDraftLive",
      {
        editingBlockId,
        normalized,
        lockedMoveDown:
          lockedMoveDownRef
            .current,
      }
    );

    latestDraftRef.current =
      normalized;

    setEditingDraft(
      normalized
    );

    if (
      editingBlockId != null
    ) {
      onChangeText?.(
        editingBlockId,
        normalized
      );
    }
  };

  /**
   * 完成当前行内编辑。
   */
  const commitInlineEdit =
    () => {
      const finalText =
        normalizeEditableText(
          latestDraftRef
            .current ??
            editingDraft ??
            ""
        );

      debugLog(
        "commitInlineEdit",
        {
          editingBlockId,
          finalText,
          lockedMoveDown:
            lockedMoveDownRef
              .current,
        }
      );

      if (
        editingBlockId != null
      ) {
        onChangeText?.(
          editingBlockId,
          finalText
        );

        onTextBlur?.(
          editingBlockId
        );
      }

      setEditingBlockId(
        null
      );

      setEditingDraft(
        ""
      );

      isComposingRef.current =
        false;

      latestDraftRef.current =
        "";

      caretOffsetRef.current =
        null;

      suppressNextCaretRestoreRef.current =
        false;

      lockedMoveDownRef.current =
        false;
    };

  /**
   * 进入编辑状态后，
   * 自动聚焦并恢复光标位置。
   */
  useLayoutEffect(() => {
    const container =
      editingContainerRef.current;

    if (
      !container ||
      editingBlockId == null
    ) {
      return;
    }

    if (
      !justEnteredEditRef.current
    ) {
      return;
    }

    justEnteredEditRef.current =
      false;

    const nodes =
      getEditableNodes(
        container
      );

    if (
      !nodes.length
    ) {
      return;
    }

    const targetNode =
      nodes[0];

    const initialOffset =
      caretOffsetRef.current ==
      null
        ? 0
        : caretOffsetRef
            .current;

    if (
      enterFocusRafRef.current
    ) {
      cancelAnimationFrame(
        enterFocusRafRef.current
      );
    }

    enterFocusRafRef.current =
      requestAnimationFrame(
        () => {
          targetNode.focus();

          setCaretOffsetWithin(
            container,
            initialOffset
          );

          debugDumpEditableState(
            "after enter focus"
          );
        }
      );
  }, [
    editingBlockId,
    editingDraft,
  ]);

  /**
   * 布局重新渲染后，
   * 必要时恢复光标位置。
   */
  useLayoutEffect(() => {
    const container =
      editingContainerRef.current;

    if (
      !container ||
      caretOffsetRef.current ==
        null ||
      editingBlockId == null
    ) {
      return;
    }

    if (
      isComposingRef.current
    ) {
      return;
    }

    const active =
      document.activeElement;

    if (
      !active ||
      !container.contains(
        active
      )
    ) {
      return;
    }

    if (
      suppressNextCaretRestoreRef
        .current
    ) {
      suppressNextCaretRestoreRef.current =
        false;

      return;
    }

    const targetOffset =
      caretOffsetRef.current;

    const safeOffset =
      Math.max(
        0,
        Math.min(
          targetOffset,
          normalizeEditableText(
            editingDraft
          ).length
        )
      );

    if (
      restoreCaretRafRef.current
    ) {
      cancelAnimationFrame(
        restoreCaretRafRef.current
      );
    }

    restoreCaretRafRef.current =
      requestAnimationFrame(
        () => {
          const liveText =
            readNormalizedTextFromContainer();

          const liveCaret =
            getCaretOffsetWithin(
              container
            );

          if (
            liveText !==
            normalizeEditableText(
              editingDraft
            )
          ) {
            return;
          }

          if (
            liveCaret == null
          ) {
            return;
          }

          if (
            Math.abs(
              liveCaret -
                safeOffset
            ) <= 1
          ) {
            return;
          }

          debugLog(
            "restore caret",
            {
              targetOffset,
              safeOffset,
              liveCaret,
              liveText,
              editingDraft,
              lockedMoveDown:
                lockedMoveDownRef
                  .current,
            }
          );

          setCaretOffsetWithin(
            container,
            safeOffset
          );

          debugDumpEditableState(
            "after restore caret"
          );
        }
      );
  }, [
    editingDraft,
    editingBlockId,
  ]);

  /**
   * 双击模块进入编辑。
   */
  const handleFragmentDoubleClick =
    (
      event,
      blockId,
      fragmentIndex = 0
    ) => {
      onTextEditStart?.();

      event.preventDefault();
      event.stopPropagation();

      if (
        longPressTimerRef.current
      ) {
        clearTimeout(
          longPressTimerRef.current
        );

        longPressTimerRef.current =
          null;
      }

      setHandleVisibleBlockId(
        null
      );

      const {
        block,
      } =
        getEditingSectionAndBlock(
          blockId
        );

      const initialText =
        normalizeEditableText(
          block?.text || ""
        );

      /**
       * 关键修改：
       *
       * 不再根据整行编辑框宽度
       * 判断是否需要移动到下一行。
       *
       * 编辑框保持模块原来的位置
       * 和宽度，长文本在框内换行。
       */
      lockedMoveDownRef.current =
        false;

      setEditingBlockId(
        blockId
      );

      setEditingDraft(
        initialText
      );

      latestDraftRef.current =
        initialText;

      caretOffsetRef.current =
        getOffsetBeforeFragment(
          blockId,
          fragmentIndex
        );

      suppressNextCaretRestoreRef.current =
        true;

      debugLog(
        "handleFragmentDoubleClick",
        {
          blockId,
          fragmentIndex,
          initialText,
          initialOffset:
            caretOffsetRef.current,

          lockedMoveDown:
            false,
        }
      );
    };

  /**
   * 普通输入事件。
   */
  const handleEditableInput =
    () => {
      if (
        isComposingRef.current
      ) {
        return;
      }

      const container =
        editingContainerRef.current;

      if (!container) {
        return;
      }

      const rawOffset =
        getCaretOffsetWithin(
          container
        );

      const nextText =
        normalizeEditableText(
          getJoinedEditableText(
            container
          )
        );

      caretOffsetRef.current =
        Math.max(
          0,
          Math.min(
            rawOffset ?? 0,
            nextText.length
          )
        );

      debugLog(
        "handleEditableInput",
        {
          rawOffset,
          safeOffset:
            caretOffsetRef.current,

          nextText,
          lockedMoveDown:
            lockedMoveDownRef
              .current,
        }
      );

      applyDraftLive(
        nextText
      );
    };

  /**
   * 中文输入法组合输入开始。
   */
  const handleEditableCompositionStart =
    () => {
      isComposingRef.current =
        true;

      debugLog(
        "composition start",
        {
          lockedMoveDown:
            lockedMoveDownRef
              .current,
        }
      );
    };

  /**
   * 中文输入法组合输入结束。
   */
  const handleEditableCompositionEnd =
    () => {
      requestAnimationFrame(
        () => {
          isComposingRef.current =
            false;

          const container =
            editingContainerRef
              .current;

          if (!container) {
            return;
          }

          const rawOffset =
            getCaretOffsetWithin(
              container
            );

          const nextText =
            normalizeEditableText(
              getJoinedEditableText(
                container
              )
            );

          caretOffsetRef.current =
            Math.max(
              0,
              Math.min(
                rawOffset ?? 0,
                nextText.length
              )
            );

          debugLog(
            "composition end",
            {
              rawOffset,
              safeOffset:
                caretOffsetRef
                  .current,

              nextText,
              lockedMoveDown:
                lockedMoveDownRef
                  .current,
            }
          );

          applyDraftLive(
            nextText
          );
        }
      );
    };

  /**
   * 编辑框失焦后提交。
   */
  const handleEditableBlur =
    () => {
      const token =
        ++blurTokenRef.current;

      queueMicrotask(
        () => {
          if (
            token !==
            blurTokenRef.current
          ) {
            return;
          }

          const container =
            editingContainerRef
              .current;

          const active =
            document.activeElement;

          if (
            container &&
            active &&
            container.contains(
              active
            )
          ) {
            return;
          }

          if (
            isComposingRef.current
          ) {
            return;
          }

          debugLog(
            "handleEditableBlur -> commit",
            {
              lockedMoveDown:
                lockedMoveDownRef
                  .current,
            }
          );

          commitInlineEdit();
        }
      );
    };

  /**
   * 开始长按检测。
   */
  const startLongPressHandle =
    (
      blockId,
      onLongPress
    ) => {
      if (
        longPressTimerRef.current
      ) {
        clearTimeout(
          longPressTimerRef.current
        );
      }

      longPressTimerRef.current =
        setTimeout(
          () => {
            setHandleVisibleBlockId(
              blockId
            );

            longPressTimerRef.current =
              null;

            if (
              typeof onLongPress ===
              "function"
            ) {
              onLongPress();
            }
          },
          350
        );
    };

  /**
   * 取消长按检测。
   */
  const cancelLongPressHandle =
    () => {
      if (
        !longPressTimerRef.current
      ) {
        return;
      }

      clearTimeout(
        longPressTimerRef.current
      );

      longPressTimerRef.current =
        null;
    };

  return {
    editingBlockId,
    editingDraft,
    handleVisibleBlockId,
    editingContainerRef,

    /**
     * 保留返回值以兼容现有 PageCanvas。
     * 现在永远为 false。
     */
    lockedMoveDown:
      false,

    setHandleVisibleBlockId,

    commitInlineEdit,

    handleFragmentDoubleClick,

    handleEditableInput,
    handleEditableBlur,

    handleEditableCompositionStart,
    handleEditableCompositionEnd,

    startLongPressHandle,
    cancelLongPressHandle,
  };
}