import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getActiveInstructionDragData,
  hasInstructionDragData,
  readInstructionDragData,
} from "../../utils/instructionDrag";

import InstructionDropBurst from "./InstructionDropBurst.jsx";
import BlockSources from "./BlockSources.jsx";
import SemanticHighlightLayer from "./SemanticHighlightLayer.jsx";
import LengthResizeControls from "./LengthResizeControls.jsx";
import LengthFlowSpacer from "./LengthFlowSpacer.jsx";

import useInlineEditing from "./useInlineEditing.js";
import useSemanticMeasurements from "./useSemanticMeasurements.js";
import useLengthResize from "./useLengthResize.js";

import {
  EMPTY_TEXT,
  getTypeLabel,
  findBlockById,
  normalizeId,
  normalizeText,
} from "./semanticEditorUtils.js";

import {
  getDropIndex,
  shouldStartNewLine,
} from "./dragPositionUtils.js";


/**
 * 将拖拽提示固定到目标模块的视觉末尾。
 *
 * 一个 inline 模块换行后会产生多个 DOMRect。如果直接使用鼠标
 * 命中的片段，提示线可能落在同一模块的中间。因此先找到该模块
 * 最后一个视觉片段，再把蓝线放到它的右侧或与下一模块的间隙中。
 */
function getAfterBlockDropAnchor(
  visualEntries,
  nearestEntry
) {
  if (!nearestEntry) {
    return null;
  }

  const blockRects =
    visualEntries
      .filter(
        (entry) =>
          entry.element ===
          nearestEntry.element
      )
      .map((entry) => entry.rect)
      .sort((a, b) => {
        if (Math.abs(a.top - b.top) > 4) {
          return a.top - b.top;
        }

        return a.left - b.left;
      });

  const anchorRect =
    blockRects[blockRects.length - 1];

  if (!anchorRect) {
    return null;
  }

  const anchorCenterY =
    anchorRect.top +
    anchorRect.height / 2;

  const nextRect =
    visualEntries
      .filter((entry) => {
        if (
          entry.element ===
          nearestEntry.element
        ) {
          return false;
        }

        const rect = entry.rect;
        const centerY =
          rect.top + rect.height / 2;

        return (
          rect.left >= anchorRect.right &&
          Math.abs(centerY - anchorCenterY) <=
            Math.max(
              8,
              Math.min(
                rect.height,
                anchorRect.height
              ) / 2
            )
        );
      })
      .map((entry) => entry.rect)
      .sort((a, b) => a.left - b.left)[0];

  const clientX = nextRect
    ? (anchorRect.right + nextRect.left) / 2
    : anchorRect.right + 4;

  return {
    clientX,
    rect: anchorRect,
  };
}

/**
 * 将字符串拆成用户可见字符。
 */
function splitVisibleCharacters(value) {
  const text = String(value ?? "");

  if (
    typeof Intl !== "undefined" &&
    typeof Intl.Segmenter === "function"
  ) {
    const segmenter =
      new Intl.Segmenter(
        undefined,
        {
          granularity:
            "grapheme",
        }
      );

    return Array.from(
      segmenter.segment(text),
      (item) => item.segment
    );
  }

  return Array.from(text);
}

/**
 * 按真实视觉宽度生成缩短预览文字。
 *
 * 旧逻辑按字数截断，标点、空格和不同字符宽度会造成
 * 文字始终比预览框更长。
 *
 * 新逻辑使用 Canvas 测量实际文字宽度，再通过二分查找
 * 找到能够完整放入目标框的最长文字前缀。
 */
function getLengthClippedText(
  value,
  targetVisualWidth,
  originalVisualWidth,
  editorElement
) {
  const text =
    String(value ?? "");

  if (!text) {
    return "";
  }

  const safeTargetWidth =
    Math.max(
      1,
      Number(targetVisualWidth) ||
        1
    );

  const safeOriginalWidth =
    Math.max(
      1,
      Number(originalVisualWidth) ||
        safeTargetWidth
    );

  if (
    safeTargetWidth >=
    safeOriginalWidth
  ) {
    return text;
  }

  const characters =
    splitVisibleCharacters(text);

  if (
    characters.length <= 1
  ) {
    return text;
  }

  const fallbackByRatio =
    () => {
      const count =
        Math.max(
          1,
          Math.floor(
            characters.length *
              (
                safeTargetWidth /
                safeOriginalWidth
              )
          )
        );

      return characters
        .slice(0, count)
        .join("")
        .replace(/\s+$/u, "");
    };

  if (
    typeof document ===
      "undefined"
  ) {
    return fallbackByRatio();
  }

  const canvas =
    getLengthClippedText
      .canvas ||
    (
      getLengthClippedText.canvas =
        document.createElement(
          "canvas"
        )
    );

  const context =
    canvas.getContext("2d");

  if (!context) {
    return fallbackByRatio();
  }

  const computedStyle =
    editorElement &&
    typeof window !==
      "undefined"
      ? window.getComputedStyle(
          editorElement
        )
      : null;

  context.font =
    computedStyle?.font ||
    [
      computedStyle?.fontStyle ||
        "normal",
      computedStyle?.fontVariant ||
        "normal",
      computedStyle?.fontWeight ||
        "400",
      computedStyle?.fontSize ||
        "16px",
      computedStyle?.fontFamily ||
        "sans-serif",
    ].join(" ");

  const letterSpacing =
    Number.parseFloat(
      computedStyle
        ?.letterSpacing
    ) || 0;

  const measureCharacters =
    (items) => {
      const candidate =
        items.join("");

      return (
        context.measureText(
          candidate
        ).width +
        Math.max(
          0,
          items.length - 1
        ) *
          letterSpacing
      );
    };

  const fullMeasuredWidth =
    Math.max(
      1,
      measureCharacters(
        characters
      )
    );

  /**
   * 使用目标框与原模块的宽度比例映射 Canvas 宽度。
   * 减少 4px，确保文字不会压住右侧边框和手柄。
   */
  const targetMeasuredWidth =
    Math.max(
      1,
      fullMeasuredWidth *
        (
          safeTargetWidth /
          safeOriginalWidth
        ) -
        4
    );

  let low = 1;
  let high =
    characters.length;
  let best = 1;

  while (low <= high) {
    const middle =
      Math.floor(
        (low + high) / 2
      );

    const candidate =
      characters.slice(
        0,
        middle
      );

    if (
      measureCharacters(
        candidate
      ) <=
      targetMeasuredWidth
    ) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return characters
    .slice(0, best)
    .join("")
    .replace(/\s+$/u, "");
}

function readDraggedData(
  dataTransfer
) {
  if (!dataTransfer) {
    return null;
  }

  const types = [
    "application/x-writing-block",
    "application/x-semantic-block",
    "application/json",
  ];

  for (const type of types) {
    const raw =
      dataTransfer.getData(type);

    if (!raw) {
      continue;
    }

    try {
      return JSON.parse(raw);
    } catch {
      // 继续读取下一个格式。
    }
  }

  const plain =
    dataTransfer.getData(
      "text/plain"
    );

  if (!plain) {
    return null;
  }

  try {
    return JSON.parse(plain);
  } catch {
    return {
      type: plain,
      text: "",
    };
  }
}


const SingleSemanticEditor =
  forwardRef(
    function SingleSemanticEditor(
      {
        blocks = [],
        selectedIds = [],
        externalDraggingBlockId = null,

        onChangeText,
        onCommitBlocks,
        onTextBlur,
        onTextEditStart,

        onBlockMouseDown,
        onSelectBlockForPanel,
        onClearSelection,

        onInsertBlock,
        onTemplateDropComplete,
        onReorderBlocks,
        onRestoreCompletedParagraph,
        onApplyInstruction,
        onAdjustLength,

        onExistingBlockDragStart,
        onExistingBlockDragOver,
        onExistingBlockDragEnd,
        onDuplicateBlockDragStart,

        isGenerating = false,
        generatingBlockIds = [],
        generatingBlinkOn = false,
        isAdjustingLength = false,
        adjustingLengthBlockId = null,

        isAdjustingStyle = false,
        adjustingStyleBlockId = null,

        focusedEditingBlockId = null,
        onEditingBlockChange,
        onContentHeightChange,
      },
      forwardedRef
    ) {

      const editorRef =
        useRef(null);

      const measureLineExtensionsRef =
        useRef(null);

      /**
       * 浏览器有时会丢弃自定义 dataTransfer MIME，
       * 因此额外保存正在拖动的已有模块 ID。
       */
      const draggingExistingBlockIdRef =
        useRef(null);

      const suppressNextNativeDragRef =
        useRef(false);

      const duplicateDragCandidateRef =
        useRef(null);

      useEffect(() => {
        return () => {
          const candidate =
            duplicateDragCandidateRef.current;

          if (!candidate) {
            return;
          }

          window.removeEventListener(
            "mousemove",
            candidate.handleMouseMove
          );

          window.removeEventListener(
            "mouseup",
            candidate.handleMouseUp
          );
        };
      }, []);


      const [
        draggingInlineBlockId,
        setDraggingInlineBlockId,
      ] = useState(null);

      const [
        instructionEffect,
        setInstructionEffect,
      ] = useState(null);

      /**
       * 模块拖拽时显示的 inline 插入竖线。
       */
      const [
        dropIndicator,
        setDropIndicator,
      ] = useState(null);

      const [
        copiedParagraphId,
        setCopiedParagraphId,
      ] = useState(null);

      const copyFeedbackTimerRef =
        useRef(null);

      useEffect(() => {
        return () => {
          if (
            copyFeedbackTimerRef.current
          ) {
            window.clearTimeout(
              copyFeedbackTimerRef.current
            );
          }
        };
      }, []);

      /**
       * floating 模块使用 mousemove 拖动，不会产生原生 dragover。
       * 因此单独根据鼠标位置计算同一套 inline 插入竖线。
       */
      const updateFloatingDropIndicator =
        useCallback(
          (event) => {
            const root =
              editorRef.current;

            if (
              !root ||
              externalDraggingBlockId ==
                null
            ) {
              return;
            }

            const draggingId =
              normalizeId(
                externalDraggingBlockId
              );

            const visualEntries = [];

            Array.from(
              root.querySelectorAll(
                "[data-semantic-block-id]"
              )
            )
              .filter(
                (element) =>
                  normalizeId(
                    element.getAttribute(
                      "data-semantic-block-id"
                    )
                  ) !== draggingId
              )
              .forEach((element) => {
                Array.from(
                  element.getClientRects?.() ||
                    []
                ).forEach((rect) => {
                  if (
                    rect.width > 0 &&
                    rect.height > 0
                  ) {
                    visualEntries.push({
                      element,
                      rect,
                    });
                  }
                });
              });

            if (
              visualEntries.length === 0
            ) {
              /**
               * 空编辑器没有任何现有模块可以作为参考，但第一个模块
               * 仍需要明确的插入提示。正文起点就是首个插入位置。
               */
              setDropIndicator({
                left: 0,
                top: 0,
                height: 28,
              });
              return;
            }

            const nearestEntry =
              visualEntries.reduce(
                (nearest, entry) => {
                  const rect = entry.rect;
                  const dx =
                    event.clientX < rect.left
                      ? rect.left -
                        event.clientX
                      : event.clientX >
                          rect.right
                        ? event.clientX -
                          rect.right
                        : 0;

                  const dy =
                    event.clientY < rect.top
                      ? rect.top -
                        event.clientY
                      : event.clientY >
                          rect.bottom
                        ? event.clientY -
                          rect.bottom
                        : 0;

                  const distance =
                    Math.hypot(dx, dy);

                  return !nearest ||
                    distance <
                      nearest.distance
                    ? {
                        entry,
                        distance,
                      }
                    : nearest;
                },
                null
              )?.entry;

            if (!nearestEntry) {
              setDropIndicator(null);
              return;
            }

            const afterAnchor =
              getAfterBlockDropAnchor(
                visualEntries,
                nearestEntry
              );

            if (!afterAnchor) {
              setDropIndicator(null);
              return;
            }

            const nearestRect =
              afterAnchor.rect;

            const rootRect =
              root.getBoundingClientRect();

            const scaleX =
              root.offsetWidth > 0
                ? rootRect.width /
                  root.offsetWidth
                : 1;

            const scaleY =
              root.offsetHeight > 0
                ? rootRect.height /
                  root.offsetHeight
                : scaleX;

            const startsNewLine =
              shouldStartNewLine(
                root,
                event.clientX,
                event.clientY,
                draggingId || null
              );

            const newLineTop =
              event.clientY >
              nearestRect.bottom
                ? nearestRect.bottom + 10
                : nearestRect.top;

            setDropIndicator({
              left:
                startsNewLine
                  ? 0
                  : (
                      afterAnchor.clientX -
                      rootRect.left
                    ) /
                Math.max(
                  scaleX,
                  0.001
                ),

              top:
                (
                  (startsNewLine
                    ? newLineTop
                    : nearestRect.top) -
                  rootRect.top
                ) /
                Math.max(
                  scaleY,
                  0.001
                ),

              height:
                nearestRect.height /
                Math.max(
                  scaleY,
                  0.001
                ),
            });
          },
          [externalDraggingBlockId]
        );

      useEffect(() => {
        if (
          externalDraggingBlockId ==
            null &&
          draggingInlineBlockId ==
            null
        ) {
          setDropIndicator(null);
        }
      }, [
        externalDraggingBlockId,
        draggingInlineBlockId,
      ]);

      const instructionDropTimerRef =
        useRef(null);

      useEffect(() => {
        return () => {
          if (
            instructionDropTimerRef.current
          ) {
            window.clearTimeout(
              instructionDropTimerRef.current
            );
          }
        };
      }, []);

      const selectedIdSet =
        useMemo(
          () =>
            new Set(
              selectedIds.map(
                normalizeId
              )
            ),
          [selectedIds]
        );

      const isDraggingSelectedGroup =
        selectedIdSet.size > 1 &&
        selectedIdSet.has(
          normalizeId(
            draggingInlineBlockId ??
            externalDraggingBlockId
          )
        );

      const generatingIdSet =
        useMemo(
          () =>
            new Set(
              generatingBlockIds.map(
                normalizeId
              )
            ),
          [generatingBlockIds]
        );

      const adjustingStyleIdSet =
        useMemo(
          () =>
            adjustingStyleBlockId == null
              ? new Set()
              : new Set([
                  normalizeId(
                    adjustingStyleBlockId
                  ),
                ]),
          [adjustingStyleBlockId]
        );

      const blockById =
        useMemo(() => {
          const result =
            new Map();

          blocks.forEach(
            (block) => {
              result.set(
                normalizeId(
                  block.id
                ),
                block
              );
            }
          );

          return result;
        }, [blocks]);



      const {
        editingBlockId,
        effectiveEditingBlockId,
        hasFocusedEditingBlock,
        customCaretRef,
        handleDoubleClick,
        handleInput,
        handlePaste,
        handleBeforeInput,
        handleKeyDown,
        handleBlur,
      } = useInlineEditing({
        editorRef,
        blocks,
        focusedEditingBlockId,
        onEditingBlockChange,
        onChangeText,
        onCommitBlocks,
        onTextBlur,
        onTextEditStart,
        isGenerating,
        measureLineExtensions: () => {
          measureLineExtensionsRef.current?.();
        },
      });

      const {
        lineExtensions,
        measureLineExtensions,
      } = useSemanticMeasurements({
        editorRef,
        blocks,
        editingBlockId,
        isGenerating,
        isAdjustingLength,
      });

      useEffect(() => {
        measureLineExtensionsRef.current =
          measureLineExtensions;
      }, [measureLineExtensions]);

      const {
        lengthResizeDraft,
        lengthResizeHandles,
        lengthResizePreview,
        lengthAdjustBlinkOn,
        isLengthResizeDragging,
        beginLengthResize,
      } = useLengthResize({
        editorRef,
        lineExtensions,
        selectedIdSet,
        blockById,
        editingBlockId,
        isGenerating,
        isAdjustingLength,
        adjustingLengthBlockId,
        onAdjustLength,
      });


      useEffect(() => {
        if (
          draggingInlineBlockId ==
          null
        ) {
          return;
        }

        const stillInline =
          blocks.some(
            (block) =>
              normalizeId(
                block.id
              ) ===
              normalizeId(
                draggingInlineBlockId
              )
          );

        if (stillInline) {
          return;
        }

        draggingExistingBlockIdRef.current =
          null;

        setDraggingInlineBlockId(
          null
        );
      }, [
        blocks,
        draggingInlineBlockId,
      ]);

      const setEditorElement =
        useCallback(
          (element) => {
            editorRef.current =
              element;

            if (
              typeof forwardedRef ===
              "function"
            ) {
              forwardedRef(element);
            } else if (
              forwardedRef
            ) {
              forwardedRef.current =
                element;
            }
          },
          [forwardedRef]
        );

      const reportContentHeight =
        useCallback(() => {
          const editor =
            editorRef.current;

          if (!editor) {
            return;
          }

          const nextHeight =
            Math.ceil(
              Math.max(
                editor.scrollHeight,
                editor.offsetHeight,
                180
              )
            );

          onContentHeightChange?.(
            nextHeight
          );
        }, [
          onContentHeightChange,
        ]);

      useLayoutEffect(() => {
        const editor =
          editorRef.current;

        if (!editor) {
          return undefined;
        }

        const animationId =
          requestAnimationFrame(
            reportContentHeight
          );

        const resizeObserver =
          typeof ResizeObserver !==
          "undefined"
            ? new ResizeObserver(
                () => {
                  requestAnimationFrame(
                    reportContentHeight
                  );
                }
              )
            : null;

        resizeObserver?.observe(
          editor
        );

        return () => {
          cancelAnimationFrame(
            animationId
          );

          resizeObserver?.disconnect();
        };
      }, [
        blocks,
        reportContentHeight,
      ]);

      useLayoutEffect(() => {
        const editor =
          editorRef.current;

        if (!editor) {
          return;
        }

        const repaired = [];

        for (const block of blocks) {
          const blockId =
            normalizeId(
              block.id
            );

          if (
            !blockId ||
            normalizeId(
              editingBlockId
            ) === blockId
          ) {
            continue;
          }

          const blockElement =
            findBlockById(
              editor,
              blockId
            );

          if (
            !blockElement ||
            blockElement.contains(
              document.activeElement
            )
          ) {
            continue;
          }

          const contentElement =
            blockElement.querySelector(
              "[data-semantic-block-content='true']"
            );

          const textElement =
            contentElement ||
            (
              blockElement.getAttribute(
                "data-completed-inline"
              ) === "true"
                ? blockElement
                : null
            );

          if (!textElement) {
            continue;
          }

          const expectedText =
            String(
              block.text ?? ""
            ) || EMPTY_TEXT;

          const actualText =
            String(
              textElement.textContent ??
              ""
            );

          if (
            actualText ===
            expectedText
          ) {
            continue;
          }

          repaired.push({
            blockId,
            expectedText:
              String(
                block.text ?? ""
              ),
            actualText:
              actualText ===
              EMPTY_TEXT
                ? ""
                : actualText,
          });

          textElement.textContent =
            expectedText;
        }

        if (repaired.length) {
          console.warn(
            "[AI Debug] 可见 DOM 与模块状态不一致，已自动修复",
            repaired
          );
        }
      }, [
        blocks,
        editingBlockId,
        isGenerating,
      ]);

      const handleBlockMouseDown =
        useCallback(
          (event, block) => {
            /**
             * 非编辑状态已经通过 user-select: none 禁止蓝色选区。
             * 这里不能 preventDefault，否则浏览器不会启动
             * draggable 模块的原生拖拽。
             */

            if (
              event.button === 0 &&
              event.altKey &&
              event.shiftKey
            ) {
              event.preventDefault();
              event.stopPropagation();
              suppressNextNativeDragRef.current = true;

              const startX =
                event.clientX;

              const startY =
                event.clientY;

              const cancelCandidate =
                () => {
                  const candidate =
                    duplicateDragCandidateRef.current;

                  if (!candidate) {
                    return;
                  }

                  window.removeEventListener(
                    "mousemove",
                    candidate.handleMouseMove
                  );

                  window.removeEventListener(
                    "mouseup",
                    candidate.handleMouseUp
                  );

                  duplicateDragCandidateRef.current =
                    null;

                  suppressNextNativeDragRef.current =
                    false;
                };

              const handleMouseMove =
                (moveEvent) => {
                  const distance =
                    Math.hypot(
                      moveEvent.clientX -
                        startX,
                      moveEvent.clientY -
                        startY
                    );

                  if (distance <= 5) {
                    return;
                  }

                  cancelCandidate();

                  window
                    .getSelection?.()
                    ?.removeAllRanges();

                  onDuplicateBlockDragStart?.(
                    moveEvent,
                    block
                  );
                };

              const handleMouseUp =
                () => {
                  cancelCandidate();
                };

              duplicateDragCandidateRef.current = {
                handleMouseMove,
                handleMouseUp,
              };

              window.addEventListener(
                "mousemove",
                handleMouseMove
              );

              window.addEventListener(
                "mouseup",
                handleMouseUp
              );

              return;
            }

            event.stopPropagation();

            onBlockMouseDown?.(
              event,
              block.id
            );

            onSelectBlockForPanel?.(
              block
            );
          },
          [
            onBlockMouseDown,
            onSelectBlockForPanel,
            onDuplicateBlockDragStart,
          ]
        );

      const handleRootMouseDown =
        useCallback(
          (event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              if (!event.shiftKey) {
                onClearSelection?.();
              }

              /**
               * 编辑器空白处的事件继续冒泡给 PageCanvas，
               * 由 PageCanvas 启动鼠标框选。
               */
              return;
            }

            event.stopPropagation();
          },
          [onClearSelection]
        );

      const handleDragOver =
        useCallback((event) => {
          event.preventDefault();
          event.stopPropagation();

          /**
           * 指令拖入是“作用到当前模块”，不是模块位置调整。
           * 此时不显示任何插入蓝线，目标反馈由模块投影负责。
           */
          if (
            hasInstructionDragData(
              event.dataTransfer
            )
          ) {
            setDropIndicator(null);
            return;
          }

          onExistingBlockDragOver?.(
            event
          );

          if (
            event.dataTransfer
          ) {
            event.dataTransfer.dropEffect =
              draggingExistingBlockIdRef.current !=
              null
                ? "move"
                : "copy";
          }

          const root =
            editorRef.current;

          if (!root) {
            return;
          }

          const draggingId =
            normalizeId(
              draggingExistingBlockIdRef.current
            );

          const candidates =
            Array.from(
              root.querySelectorAll(
                "[data-semantic-block-id]"
              )
            ).filter(
              (element) =>
                normalizeId(
                  element.getAttribute(
                    "data-semantic-block-id"
                  )
                ) !== draggingId
            );

          const visualEntries = [];

          candidates.forEach(
            (element) => {
              Array.from(
                element.getClientRects?.() ||
                  []
              ).forEach((rect) => {
                if (
                  rect.width > 0 &&
                  rect.height > 0
                ) {
                  visualEntries.push({
                    element,
                    rect,
                  });
                }
              });
            }
          );

          if (
            visualEntries.length === 0
          ) {
            /**
             * 从侧栏拖入第一个模块，或唯一模块被排除时，显示正文
             * 起始位置的蓝线，不再因为没有候选矩形而隐藏提示。
             */
            setDropIndicator({
              left: 0,
              top: 0,
              height: 28,
            });
            return;
          }

          const pointerX =
            event.clientX;

          const pointerY =
            event.clientY;

          const nearestEntry =
            visualEntries.reduce(
              (nearest, entry) => {
                const rect = entry.rect;
                const dx =
                  pointerX < rect.left
                    ? rect.left - pointerX
                    : pointerX > rect.right
                      ? pointerX - rect.right
                      : 0;

                const dy =
                  pointerY < rect.top
                    ? rect.top - pointerY
                    : pointerY > rect.bottom
                      ? pointerY - rect.bottom
                      : 0;

                const distance =
                  Math.hypot(dx, dy);

                return !nearest ||
                  distance < nearest.distance
                  ? {
                      entry,
                      distance,
                    }
                  : nearest;
              },
              null
            )?.entry;

          if (!nearestEntry) {
            setDropIndicator(null);
            return;
          }

          const afterAnchor =
            getAfterBlockDropAnchor(
              visualEntries,
              nearestEntry
            );

          if (!afterAnchor) {
            setDropIndicator(null);
            return;
          }

          const nearestRect =
            afterAnchor.rect;

          const rootRect =
            root.getBoundingClientRect();

          const scaleX =
            root.offsetWidth > 0
              ? rootRect.width /
                root.offsetWidth
              : 1;

          const scaleY =
            root.offsetHeight > 0
              ? rootRect.height /
                root.offsetHeight
              : scaleX;

          const startsNewLine =
            shouldStartNewLine(
              root,
              pointerX,
              pointerY,
              draggingId || null
            );

          const newLineTop =
            pointerY >
            nearestRect.bottom
              ? nearestRect.bottom + 10
              : nearestRect.top;

          setDropIndicator({
            left:
              startsNewLine
                ? 0
                : (
                    afterAnchor.clientX -
                    rootRect.left
                  ) /
              Math.max(scaleX, 0.001),

            top:
              (
                (startsNewLine
                  ? newLineTop
                  : nearestRect.top) -
                rootRect.top
              ) /
              Math.max(scaleY, 0.001),

            height:
              nearestRect.height /
              Math.max(scaleY, 0.001),
          });
        }, [
          onExistingBlockDragOver,
        ]);

      /**
       * 拖动一个已经存在的模块。
       * 双击编辑时关闭拖拽，普通状态下可以直接拖动换位。
       */
      const handleExistingBlockDragStart =
        useCallback(
          (
            event,
            block
          ) => {
            if (
              suppressNextNativeDragRef.current
            ) {
              suppressNextNativeDragRef.current =
                false;

              event.preventDefault();
              event.stopPropagation();

              return;
            }

            if (
              isGenerating ||
              normalizeId(
                editingBlockId
              ) ===
                normalizeId(
                  block.id
                ) ||
              !event.dataTransfer
            ) {
              event.preventDefault();
              return;
            }

            event.stopPropagation();

            const realBlockId =
              normalizeId(
                block.id
              );

            draggingExistingBlockIdRef.current =
              realBlockId;

            setDraggingInlineBlockId(
              realBlockId
            );

            onExistingBlockDragStart?.(
              event,
              block
            );

            const payload = {
              kind:
                "existing-block",
              source:
                "semantic-editor",
              blockId:
                block.id,
              id:
                block.id,
              type:
                block.type,
              text:
                block.text,
            };

            const serialized =
              JSON.stringify(
                payload
              );

            event.dataTransfer.effectAllowed =
              "move";

            event.dataTransfer.setData(
              "application/x-writing-block",
              serialized
            );

            event.dataTransfer.setData(
              "application/x-semantic-block",
              serialized
            );

            event.dataTransfer.setData(
              "application/json",
              serialized
            );

            event.dataTransfer.setData(
              "text/plain",
              serialized
            );

            /**
             * 禁用浏览器自带的拖拽残影。
             * 页面使用 useFloatingBlocks 的单一自定义预览，
             * 避免长条原模块和方形预览同时出现。
             */
            const transparentDragImage =
              document.createElement(
                "div"
              );

            transparentDragImage.style.position =
              "fixed";
            transparentDragImage.style.left =
              "-9999px";
            transparentDragImage.style.top =
              "-9999px";
            transparentDragImage.style.width =
              "1px";
            transparentDragImage.style.height =
              "1px";
            transparentDragImage.style.opacity =
              "0";

            document.body.appendChild(
              transparentDragImage
            );

            event.dataTransfer.setDragImage(
              transparentDragImage,
              0,
              0
            );

            requestAnimationFrame(
              () => {
                transparentDragImage.remove();
              }
            );
          },
          [
            editingBlockId,
            isGenerating,
            onExistingBlockDragStart,
          ]
        );

      const handleExistingBlockDragEnd =
        useCallback((event) => {
          const blockId =
            draggingExistingBlockIdRef.current;

          onExistingBlockDragEnd?.(
            event,
            blockId
          );

          draggingExistingBlockIdRef.current =
            null;

          setDraggingInlineBlockId(
            null
          );

          setDropIndicator(null);
        }, [
          onExistingBlockDragEnd,
        ]);

      const handleDrop =
        useCallback(
          (event) => {
            event.preventDefault();
            event.stopPropagation();

            setDropIndicator(null);

            const payload =
              readDraggedData(
                event.dataTransfer
              );

            const locallyDraggedId =
              draggingExistingBlockIdRef.current;

            if (
              !payload &&
              locallyDraggedId == null
            ) {
              return;
            }

            const existingId =
              locallyDraggedId ??
              payload?.blockId ??
              payload?.id;

            const selectedExistingIds =
              selectedIds
                .map(normalizeId)
                .filter(Boolean);

            const draggedSelection =
              selectedExistingIds.length > 1 &&
              selectedExistingIds.includes(
                normalizeId(existingId)
              )
                ? selectedExistingIds
                : [normalizeId(existingId)]
                    .filter(Boolean);

            const isExistingBlock =
              (
                locallyDraggedId !=
                  null ||
                payload?.kind ===
                  "existing-block" ||
                payload?.source ===
                  "semantic-editor"
              ) &&
              existingId != null;

            const forceLineBreakBefore =
              shouldStartNewLine(
                editorRef.current,
                event.clientX,
                event.clientY,
                isExistingBlock
                  ? draggedSelection
                  : null
              );

            const insertIndex =
              getDropIndex(
                editorRef.current,
                event.clientX,
                event.clientY,
                isExistingBlock
                  ? draggedSelection
                  : null,
                forceLineBreakBefore
              );

            if (
              isExistingBlock
            ) {
              onReorderBlocks?.(
                existingId,
                insertIndex,
                {
                  forceLineBreakBefore,
                  draggedBlockIds:
                    draggedSelection,
                }
              );

              draggingExistingBlockIdRef.current =
                null;

              setDraggingInlineBlockId(
                null
              );

              return;
            }

            const nextPayload = {
              ...payload,
              forceLineBreakBefore,
              text:
                normalizeText(
                  payload.text
                ) ||
                payload.label ||
                getTypeLabel(
                  payload.type
                ),
            };

            onInsertBlock?.(
              nextPayload,
              insertIndex
            );

            /**
             * 编辑器内部已经 stopPropagation，外层 Stage 收不到 drop。
             * 必须显式通知外层清除 draggingType，否则下一次点击
             * 画布空白处会把同一个模板再次创建一遍。
             */
            onTemplateDropComplete?.(
              event
            );
          },
          [
            onInsertBlock,
            onTemplateDropComplete,
            onReorderBlocks,
            selectedIds,
          ]
        );

      return (
        <>
          <style>
            {`
              [data-single-semantic-editor="true"],
              [data-single-semantic-editor="true"]:focus,
              [data-single-semantic-editor="true"]:focus-visible {
                outline: none !important;
                box-shadow: none !important;
              }

              .semantic-inline-block {
                caret-color: #111827 !important;
              }

              .semantic-inline-block:focus {
                outline: none !important;
                caret-color: #111827 !important;
              }

              .semantic-inline-block[data-editing="true"] {
                cursor: text !important;
                caret-color: #111827 !important;
                box-shadow: none !important;
              }

              .semantic-inline-block[data-module-hidden="true"]::before {
                display: none !important;
              }

              @keyframes semantic-instruction-water-fill {
                0% {
                  transform: scaleX(0);
                  opacity: 0.2;
                }

                72% {
                  opacity: 0.88;
                }

                100% {
                  transform: scaleX(1);
                  opacity: 0.68;
                }
              }

              @keyframes semantic-instruction-waiting-pulse {
                0%, 100% {
                  opacity: 0.42;
                }

                50% {
                  opacity: 0.78;
                }
              }

              @keyframes semantic-custom-caret-blink {
                0%, 49% {
                  opacity: 1;
                }

                50%, 100% {
                  opacity: 0;
                }
              }

              .semantic-inline-block::before {
                content: attr(data-semantic-label);

                position: absolute;
                left: 7px;
                top: -12px;
                z-index: 2;

                height: 16px;
                padding: 0 6px;
                border-radius: 5px;

                background:
                  var(--semantic-color);

                color: white;
                font-size: 9px;
                font-weight: 600;
                line-height: 16px;
                white-space: nowrap;

                pointer-events: none;
                user-select: none;
                -webkit-user-select: none;
              }

              .semantic-inline-block[data-semantic-type="Title"]::before {
                top: -14px;
                height: 18px;
                padding: 0 8px;
                font-size: 10px;
                font-weight: 700;
                line-height: 18px;
              }
            `}
          </style>

          <InstructionDropBurst
            effect={instructionEffect}
          />

          <div
            ref={setEditorElement}
            data-single-semantic-editor="true"
            tabIndex={-1}

            onMouseDown={
              handleRootMouseDown
            }

            onMouseMove={(event) => {
              if (
                externalDraggingBlockId !=
                null
              ) {
                updateFloatingDropIndicator(
                  event
                );
              }
            }}

            onMouseLeave={() => {
              if (
                externalDraggingBlockId !=
                null
              ) {
                setDropIndicator(null);
              }
            }}

            onDragOver={
              handleDragOver
            }

            onDragLeave={(event) => {
              if (
                event.currentTarget.contains(
                  event.relatedTarget
                )
              ) {
                return;
              }

              setDropIndicator(null);
            }}

            onDrop={
              handleDrop
            }

            style={{
              position: "relative",
              outline: "none",
              boxShadow: "none",
              width: "100%",
              minHeight:
                Math.max(
                  180,
                  lengthResizePreview
                    ?.rectangles
                    ?.length
                    ? (
                        lengthResizePreview
                          .rectangles[
                          lengthResizePreview
                            .rectangles
                            .length - 1
                        ].top +
                        lengthResizePreview
                          .rectangles[
                          lengthResizePreview
                            .rectangles
                            .length - 1
                        ].height +
                        42
                      )
                    : 180
                ),

              padding:
                "20px 18px 40px 0",

              /**
               * 右侧预留 18px，正好对应模块的：
               * 10px 右 padding + 1.5px border + 6px margin。
               *
               * 浏览器会在到达页面右侧之前提前换行，
               * 随后 clone 出来的右侧装饰落入这段预留区域，
               * 文字不会被裁切，不同模块的行尾也能对齐。
               */

              boxSizing:
                "border-box",

              color: "#202124",
              fontSize: 16,
              lineHeight: "38px",

              whiteSpace:
                "pre-wrap",

              overflowWrap:
                "anywhere",

              wordBreak:
                "break-word",

              userSelect: "text",
              WebkitUserSelect:
                "text",
            }}
          >

            <SemanticHighlightLayer
              lineExtensions={lineExtensions}
              blockById={blockById}
              selectedIdSet={selectedIdSet}
              generatingIdSet={generatingIdSet}
              generatingBlinkOn={generatingBlinkOn}
              isAdjustingLength={isAdjustingLength}
              adjustingLengthBlockId={adjustingLengthBlockId}
              lengthAdjustBlinkOn={lengthAdjustBlinkOn}

              instructionGeneratingIdSet={
                adjustingStyleIdSet
              }

              instructionBlinkOn={
                isAdjustingStyle
              }

              lengthResizeDraft={lengthResizeDraft}
              lengthResizePreview={lengthResizePreview}
              draggingInlineBlockId={draggingInlineBlockId}
              draggingSelectedGroup={
                isDraggingSelectedGroup
              }
              instructionEffect={instructionEffect}
              hasFocusedEditingBlock={hasFocusedEditingBlock}
              effectiveEditingBlockId={effectiveEditingBlockId}
            />

            <LengthResizeControls
              lengthResizeHandles={lengthResizeHandles}
              lengthResizeDraft={lengthResizeDraft}
              lengthResizePreview={lengthResizePreview}
              isLengthResizeDragging={isLengthResizeDragging}
              beginLengthResize={beginLengthResize}
              isGenerating={isGenerating}
              isAdjustingLength={isAdjustingLength}
              hasFocusedEditingBlock={hasFocusedEditingBlock}
              effectiveEditingBlockId={effectiveEditingBlockId}
            />

            {dropIndicator && (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left:
                    dropIndicator.left -
                    1,
                  top:
                    dropIndicator.top,
                  width: 2,
                  height:
                    Math.max(
                      26,
                      dropIndicator.height
                    ),
                  borderRadius: 3,
                  background: "#2563eb",
                  boxShadow:
                    "0 1px 4px rgba(37,99,235,0.28)",
                  pointerEvents: "none",
                  zIndex: 80,
                }}
              />
            )}


            {blocks.map(
              (block) => {
                console.log(
                  "[Render]",
                  block.id,
                  JSON.stringify(
                    block.text
                  )
                );

                const blockId =
                  normalizeId(
                    block.id
                  );

                const completedSourceBlocks =
                  Array.isArray(
                    block.completedBlocks
                  )
                    ? block.completedBlocks
                    : [];

                const isTitleBlock =
                  block.type === "Title" ||
                  block.isCompletedTitle === true ||
                  (
                    block.isCompletedParagraph === true &&
                    completedSourceBlocks.length > 0 &&
                    completedSourceBlocks.every(
                      (sourceBlock) =>
                        sourceBlock?.type === "Title"
                    )
                  );

                if (
                  block
                    .isCompletedParagraph
                ) {
                  return (
                    <div
                      key={blockId}
                      data-semantic-block-id={
                        blockId
                      }
                      data-completed-inline="true"
                      style={{
                        display: "block",
                        width: "100%",
                        margin: "14px 0 18px",
                        padding: 0,
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        color: "#333",
                        fontSize:
                          isTitleBlock
                            ? 20
                            : 16,
                        fontWeight:
                          isTitleBlock
                            ? 700
                            : 400,
                        lineHeight:
                          isTitleBlock
                            ? "26px"
                            : "28px",
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        userSelect: "text",
                        WebkitUserSelect: "text",
                        opacity:
                          hasFocusedEditingBlock
                            ? 0.24
                            : 1,
                        transition: "opacity 180ms ease",
                      }}
                    >
                      <span
                        data-completed-text="true"
                        data-semantic-block-content="true"
                        contentEditable
                        suppressContentEditableWarning
                        spellCheck
                        onMouseDown={(event) => {
                          event.stopPropagation();
                        }}
                        onDoubleClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();

                          const latestText =
                            normalizeText(
                              event.currentTarget
                                .textContent
                            );

                          onRestoreCompletedParagraph?.(
                            block.id,
                            latestText
                          );
                        }}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                        }}
                        onBlur={(event) => {
                          const nextText =
                            normalizeText(
                              event.currentTarget
                                .textContent
                            );

                          if (
                            nextText ===
                            normalizeText(
                              block.text
                            )
                          ) {
                            return;
                          }

                          onCommitBlocks?.([
                            {
                              id: block.id,
                              text: nextText,
                            },
                          ]);
                        }}
                        style={{
                          outline: "none",
                          border: "none",
                          background: "transparent",
                          caretColor: "#111827",
                          cursor: "text",
                        }}
                      >
                        {String(
                          block.text ?? ""
                        )}
                      </span>

                      <button
                        type="button"
                        aria-label="复制段落"
                        title="复制段落"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={async (event) => {
                          event.preventDefault();
                          event.stopPropagation();

                          const currentText =
                            normalizeText(
                              event.currentTarget
                                .previousElementSibling
                                ?.textContent ??
                                block.text
                            );

                          if (
                            currentText !==
                            normalizeText(
                              block.text
                            )
                          ) {
                            onCommitBlocks?.([
                              {
                                id: block.id,
                                text: currentText,
                              },
                            ]);
                          }

                          try {
                            await navigator.clipboard.writeText(
                              currentText
                            );

                            setCopiedParagraphId(
                              blockId
                            );

                            if (
                              copyFeedbackTimerRef.current
                            ) {
                              window.clearTimeout(
                                copyFeedbackTimerRef.current
                              );
                            }

                            copyFeedbackTimerRef.current =
                              window.setTimeout(
                                () => {
                                  setCopiedParagraphId(
                                    null
                                  );

                                  copyFeedbackTimerRef.current =
                                    null;
                                },
                                1400
                              );
                          } catch (error) {
                            console.error(
                              "复制段落失败：",
                              error
                            );
                          }
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 26,
                          height: 26,
                          marginLeft: 8,
                          padding: 0,
                          border: "1px solid #d1d5db",
                          borderRadius: 6,
                          background:
                            normalizeId(
                              copiedParagraphId
                            ) === blockId
                              ? "#ecfdf3"
                              : "#fff",
                          color:
                            normalizeId(
                              copiedParagraphId
                            ) === blockId
                              ? "#15803d"
                              : "#6b7280",
                          fontSize: 15,
                          lineHeight: 1,
                          cursor: "pointer",
                          verticalAlign: "middle",
                        }}
                      >
                        {normalizeId(
                          copiedParagraphId
                        ) === blockId
                          ? "✓"
                          : "⧉"}
                      </button>
                    </div>
                  );
                }

                const isEditing =
                  normalizeId(
                    editingBlockId
                  ) === blockId;

                const color =
                  block.color ||
                  "#7c83fd";

                const isModuleHidden =
                  block.isModuleHidden ===
                  true;

                const activeLengthPreview =
                  normalizeId(
                    lengthResizePreview
                      ?.blockId
                  ) === blockId
                    ? lengthResizePreview
                    : null;

                const shouldClipText =
                  Boolean(
                    activeLengthPreview &&
                    lengthResizeDraft &&
                    lengthResizeDraft
                      .targetLength <
                      lengthResizeDraft
                        .originalCount &&
                    !isEditing
                  );

                console.log(
                  "[Block Render]",
                  block.id,
                  {
                    text:
                      block.text,
                    isEditing,
                    isGenerating,
                  }
                );

                const renderedBlockText =
                  shouldClipText
                    ? getLengthClippedText(
                        block.text,
                        activeLengthPreview
                          .targetVisualWidth,
                        activeLengthPreview
                          .originalVisualWidth,
                        editorRef.current
                      )
                    : String(
                        block.text ?? ""
                      );

                return (
                  <Fragment
                    key={blockId}
                  >
                    {block.forceLineBreakBefore && (
                      <span
                        aria-hidden="true"
                        data-semantic-forced-break="true"
                        style={{
                          display:
                            "block",
                          width: "100%",
                          height: 10,
                          minHeight: 10,
                          lineHeight:
                            "10px",
                          pointerEvents:
                            "none",
                          userSelect:
                            "none",
                          WebkitUserSelect:
                            "none",
                        }}
                      />
                    )}

                    <span

                    className="semantic-inline-block"

                    data-semantic-block-id={
                      blockId
                    }

                    data-semantic-text="true"

                    data-semantic-label={
                      getTypeLabel(
                        block.type
                      )
                    }

                    data-semantic-type={
                      block.type
                    }

                    data-force-line-break-before={
                      block.forceLineBreakBefore
                        ? "true"
                        : "false"
                    }

                    data-editing={
                      isEditing
                        ? "true"
                        : "false"
                    }

                    data-module-hidden={
                      isModuleHidden
                        ? "true"
                        : "false"
                    }

                    contentEditable={
                      isEditing &&
                      !isGenerating
                    }

                    draggable={
                      !isEditing &&
                      !isGenerating
                    }

                    tabIndex={
                      isEditing
                        ? 0
                        : -1
                    }

                    role="textbox"

                    aria-multiline="true"

                    suppressContentEditableWarning
                    spellCheck={false}

                    onMouseDown={(
                      event
                    ) =>
                      handleBlockMouseDown(
                        event,
                        block
                      )
                    }

                    onDoubleClick={(
                      event
                    ) =>
                      handleDoubleClick(
                        event,
                        block
                      )
                    }

                    onDragOver={(
                      event
                    ) => {
                      if (
                        !hasInstructionDragData(
                          event.dataTransfer
                        )
                      ) {
                        return;
                      }

                      const instruction =
                        getActiveInstructionDragData();

                      event.preventDefault();
                      event.stopPropagation();

                      if (
                        event.dataTransfer
                      ) {
                        event.dataTransfer.dropEffect =
                          "copy";
                      }

                      setInstructionEffect({
                        blockId,
                        color:
                          instruction?.color ||
                          "#ef4444",
                        fill:
                          instruction?.fill ||
                          "#feecec",
                        phase: "hover",
                      });

                      setDropIndicator(null);
                    }}

                    onDragLeave={(
                      event
                    ) => {
                      if (
                        event.currentTarget.contains(
                          event.relatedTarget
                        )
                      ) {
                        return;
                      }

                      setInstructionEffect(
                        (current) =>
                          current?.phase ===
                          "impact"
                            ? current
                            :
                          normalizeId(
                            current?.blockId
                          ) === blockId
                            ? null
                            : current
                      );
                    }}

                    onDrop={(
                      event
                    ) => {
                      const instruction =
                        readInstructionDragData(
                          event.dataTransfer
                        );

                      if (!instruction) {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();

                      if (isGenerating) {
                        setInstructionEffect(
                          null
                        );
                        return;
                      }

                      setInstructionEffect({
                        blockId,
                        color:
                          instruction.color,
                        fill:
                          instruction.fill,
                        phase: "impact",
                        clientX:
                          event.clientX,
                        clientY:
                          event.clientY,
                      });

                      setDropIndicator(null);

                      if (
                        instructionDropTimerRef.current
                      ) {
                        window.clearTimeout(
                          instructionDropTimerRef.current
                        );
                      }

                      instructionDropTimerRef.current =
                        window.setTimeout(() => {
                          instructionDropTimerRef.current =
                            null;

                          setInstructionEffect(
                            (current) =>
                              normalizeId(
                                current?.blockId
                              ) === blockId
                                ? {
                                    ...current,
                                    phase:
                                      "waiting",
                                  }
                                : current
                          );

                          Promise.resolve(
                            onApplyInstruction?.(
                              block,
                              instruction,
                              {
                                onTextStart:
                                  () => {
                                    setInstructionEffect(
                                      (current) =>
                                        normalizeId(
                                          current?.blockId
                                        ) === blockId
                                          ? null
                                          : current
                                    );
                                  },
                              }
                            )
                          ).catch((error) => {
                            console.error(
                              "[SingleSemanticEditor] 应用指令失败：",
                              error
                            );
                          }).finally(() => {
                            setInstructionEffect(
                              (current) =>
                                normalizeId(
                                  current?.blockId
                                ) === blockId
                                  ? null
                                  : current
                            );
                          });
                        }, 660);
                    }}

                    onDragStart={(
                      event
                    ) =>
                      handleExistingBlockDragStart(
                        event,
                        block
                      )
                    }

                    onDragEnd={
                      handleExistingBlockDragEnd
                    }

                    onBeforeInput={
                      handleBeforeInput
                    }

                    onInput={
                      handleInput
                    }

                    onPaste={
                      handlePaste
                    }

                    onKeyDown={(
                      event
                    ) =>
                      handleKeyDown(
                        event,
                        blockId
                      )
                    }

                    onBlur={(
                      event
                    ) =>
                      handleBlur(
                        event,
                        blockId
                      )
                    }

                    style={{
                      "--semantic-color":
                        color,

                      position:
                        "relative",

                      zIndex: 1,

                      display:
                        isTitleBlock
                          ? "inline-block"
                          : "inline",

                      margin:
                        activeLengthPreview
                          ? "0 0 6px 0"
                          : "0 6px 6px 0",

                      padding:
                        isTitleBlock
                          ? "1px 12px 3px"
                          : "2px 8px",

                      border:
                        "1px solid transparent",

                      borderRadius:
                        8,

                      background:
                        "transparent",

                      opacity:
                        (
                          normalizeId(
                            draggingInlineBlockId
                          ) === blockId ||
                          (
                            isDraggingSelectedGroup &&
                            selectedIdSet.has(
                              blockId
                            )
                          )
                        )
                          ? 0
                          : hasFocusedEditingBlock &&
                            blockId !==
                              effectiveEditingBlockId
                          ? 0.24
                          : 1,

                      transition:
                        "opacity 180ms ease",

                      boxShadow:
                        undefined,

                      color:
                        "#202124",

                      fontSize:
                        isTitleBlock
                          ? 20
                          : 16,

                      fontWeight:
                        isTitleBlock
                          ? 700
                          : 400,

                      lineHeight:
                        isTitleBlock
                          ? "26px"
                          : "24px",

                      caretColor:
                        "#111827",

                      cursor:
                        isEditing
                          ? "text"
                          : "grab",

                      userSelect:
                        isEditing
                          ? "text"
                          : "none",

                      WebkitUserSelect:
                        isEditing
                          ? "text"
                          : "none",

                      whiteSpace:
                        "pre-wrap",

                      overflowWrap:
                        "anywhere",

                      wordBreak:
                        "break-word",

                      boxDecorationBreak:
                        "clone",

                      WebkitBoxDecorationBreak:
                        "clone",
                    }}
                    >
                      <span
                        data-semantic-block-content="true"
                      >
                        {renderedBlockText ||
                          EMPTY_TEXT}
                      </span>
                      {!isEditing && (
                        <BlockSources
                          sources={block.sources}
                        />
                      )}
                    </span>

                    <LengthFlowSpacer
                      lengthResizePreview={
                        normalizeId(
                          lengthResizePreview?.blockId
                        ) === blockId
                          ? lengthResizePreview
                          : null
                      }
                    />
                  </Fragment>
                );
              }
            )}

            <span
              ref={customCaretRef}
              aria-hidden="true"
              data-semantic-custom-caret="true"
              style={{
                position: "absolute",
                display: "none",
                width: 1,
                minWidth: 1,
                borderRadius: 0,
                background: "#111827",
                zIndex: 30,
                pointerEvents: "none",
                userSelect: "none",
                WebkitUserSelect:
                  "none",
              }}
            />
          </div>
        </>
      );
    }
  );

export default SingleSemanticEditor;
