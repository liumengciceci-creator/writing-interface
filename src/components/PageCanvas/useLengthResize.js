import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** 拉伸预览末端与下一个模块之间的固定视觉距离。 */
const LENGTH_PREVIEW_END_GAP = 8;

import {
  getWritingLengthInfo,
  normalizeId,
  shouldShowInlineLengthResizeHandle,
} from "./semanticEditorUtils";

/**
 * 获取矩形的自然宽度。
 *
 * width 可能是为了视觉上的行尾对齐而被扩展后的宽度；
 * naturalWidth 才是模块文字在真实文档流中占据的宽度。
 */
function getRectangleNaturalWidth(
  rectangle
) {
  const naturalWidth =
    Number(
      rectangle?.naturalWidth
    );

  if (
    Number.isFinite(
      naturalWidth
    ) &&
    naturalWidth > 0
  ) {
    return naturalWidth;
  }

  const width =
    Number(
      rectangle?.width
    );

  return Number.isFinite(width)
    ? Math.max(1, width)
    : 1;
}

/**
 * 获取矩形自然状态下的右边界。
 */
function getRectangleNaturalRight(
  rectangle
) {
  const naturalRight =
    Number(
      rectangle?.naturalRight
    );

  if (
    Number.isFinite(
      naturalRight
    )
  ) {
    return naturalRight;
  }

  return (
    (
      Number(
        rectangle?.left
      ) || 0
    ) +
    getRectangleNaturalWidth(
      rectangle
    )
  );
}

/**
 * 获取一组数值的中位数。
 *
 * 相比平均值，中位数不会轻易受到异常的大间距影响。
 */
function getMedian(
  values
) {
  if (
    !Array.isArray(values) ||
    values.length === 0
  ) {
    return Number.NaN;
  }

  const sorted = values
    .filter(
      (value) =>
        Number.isFinite(value)
    )
    .sort(
      (
        first,
        second
      ) =>
        first - second
    );

  if (sorted.length === 0) {
    return Number.NaN;
  }

  const middleIndex =
    Math.floor(
      sorted.length / 2
    );

  if (
    sorted.length % 2 === 1
  ) {
    return sorted[
      middleIndex
    ];
  }

  return (
    sorted[
      middleIndex - 1
    ] +
    sorted[
      middleIndex
    ]
  ) / 2;
}

/**
 * 管理语义模块的长度拉伸。
 *
 * 包含：
 * 1. 拉伸手柄位置计算
 * 2. 拉伸预览框计算
 * 3. 文档流占位宽度计算
 * 4. pointermove / pointerup
 * 5. Enter 提交 AI 长度调整
 * 6. Escape 取消
 * 7. AI 调整过程中的闪烁状态
 * 8. 拖动状态管理
 */
export default function useLengthResize({
  editorRef,

  lineExtensions = [],
  blockById,

  editingBlockId = null,

  isGenerating = false,
  isAdjustingLength = false,
  adjustingLengthBlockId = null,

  onAdjustLength,
}) {
  const [
    lengthResizeDraft,
    setLengthResizeDraft,
  ] = useState(null);

  const lengthResizeDragRef =
    useRef(null);

  /**
   * 始终保存最新的长度拉伸草稿。
   *
   * beginLengthResize 可能由 memo 组件中的旧事件回调触发，
   * 因此不能只依赖闭包里的 lengthResizeDraft。
   * 使用 ref 可以保证第二次拖动一定读取到上一次松手的位置。
   */
  const lengthResizeDraftRef =
    useRef(null);

  useEffect(() => {
    lengthResizeDraftRef.current =
      lengthResizeDraft;
  }, [lengthResizeDraft]);

  /**
   * 只有用户正在按住鼠标拖动时为 true。
   *
   * 松开鼠标以后立即变为 false，
   * 用于让长度提示框立即消失。
   *
   * lengthResizeDraft 继续保留，
   * 等待用户按 Enter 提交或 Escape 取消。
   */
  const [
    isLengthResizeDragging,
    setIsLengthResizeDragging,
  ] = useState(false);

  const [
    lengthAdjustBlinkOn,
    setLengthAdjustBlinkOn,
  ] = useState(false);

  /**
   * AI 正在根据长度调整模块时，
   * 控制模块边框闪烁。
   */
  useEffect(() => {
    if (
      !isAdjustingLength ||
      adjustingLengthBlockId == null
    ) {
      setLengthAdjustBlinkOn(
        false
      );

      return undefined;
    }

    setLengthAdjustBlinkOn(
      true
    );

    const intervalId =
      window.setInterval(() => {
        setLengthAdjustBlinkOn(
          (current) =>
            !current
        );
      }, 280);

    return () => {
      window.clearInterval(
        intervalId
      );
    };
  }, [
    adjustingLengthBlockId,
    isAdjustingLength,
  ]);

  /**
   * 根据全部可编辑模块和 DOM 测量矩形，
   * 计算长度拉伸手柄的位置。
   *
   * 生成开始时会清空选区，因此这里不能依赖 selectedIds；
   * 否则生成结束后只有重新点选过的模块才会出现句尾手柄。
   */
  const lengthResizeHandles =
    useMemo(() => {
      const handles = [];

      if (!blockById) {
        return handles;
      }

      for (
        const rawBlockId of
        blockById.keys()
      ) {
        const blockId =
          normalizeId(
            rawBlockId
          );

        const block =
          blockById.get(
            blockId
          );

        if (
          !shouldShowInlineLengthResizeHandle(
            block
          )
        ) {
          continue;
        }

        const rectangles =
          lineExtensions.filter(
            (rectangle) =>
              normalizeId(
                rectangle.blockId
              ) === blockId
          );

        if (
          rectangles.length === 0
        ) {
          continue;
        }

        /**
         * 找到模块最后一个真实视觉片段，
         * 用于放置右侧拉伸手柄。
         *
         * 这里必须使用自然右边界，
         * 不能使用已经补齐到编辑器右侧的 width。
         */
        const lastRectangle =
          rectangles.reduce(
            (
              current,
              rectangle
            ) => {
              if (!current) {
                return rectangle;
              }

              if (
                rectangle.top >
                current.top + 2
              ) {
                return rectangle;
              }

              const sameRow =
                Math.abs(
                  rectangle.top -
                    current.top
                ) <= 2;

              if (
                sameRow &&
                getRectangleNaturalRight(
                  rectangle
                ) >
                  getRectangleNaturalRight(
                    current
                  )
              ) {
                return rectangle;
              }

              return current;
            },
            null
          );

        /**
         * 找到模块第一个视觉片段，
         * 用于计算拉伸预览起点。
         */
        const firstRectangle =
          rectangles.reduce(
            (
              current,
              rectangle
            ) => {
              if (!current) {
                return rectangle;
              }

              const isAbove =
                rectangle.top <
                current.top - 2;

              const isSameRowAndLeft =
                (
                  Math.abs(
                    rectangle.top -
                      current.top
                  ) <= 2
                ) &&
                rectangle.left <
                  current.left;

              return (
                isAbove ||
                isSameRowAndLeft
              )
                ? rectangle
                : current;
            },
            null
          );

        if (
          !firstRectangle ||
          !lastRectangle
        ) {
          continue;
        }

        const editor =
          editorRef.current;

        /**
         * 计算当前模块自己的真实行距。
         *
         * 不能再使用整个 lineExtensions 中所有 top 的平均差值，
         * 因为其中包含模块之间和段落之间的大块垂直间距。
         *
         * 那些大间距一旦被当作普通行距，
         * 预览框每增加一行就会多偏移一段，
         * 最终出现越往下错位越大的问题。
         */
        const currentBlockRowTops =
          Array.from(
            new Set(
              rectangles.map(
                (rectangle) =>
                  Math.round(
                    Number(
                      rectangle.top
                    ) || 0
                  )
              )
            )
          ).sort(
            (
              first,
              second
            ) =>
              first - second
          );

        const firstRectangleHeight =
          Math.max(
            1,
            Number(
              firstRectangle.height
            ) || 1
          );

        /**
         * 只接受合理范围内的行距。
         *
         * 超过这个范围的差值通常不是文字换行，
         * 而是段落间距、模块间距或其他布局空白。
         */
        const maximumReasonableRowStep =
          Math.max(
            firstRectangleHeight *
              2.2,
            80
          );

        const currentBlockRowSteps =
          currentBlockRowTops
            .slice(1)
            .map(
              (
                top,
                index
              ) =>
                top -
                currentBlockRowTops[
                  index
                ]
            )
            .filter(
              (step) =>
                Number.isFinite(
                  step
                ) &&
                step > 0 &&
                step <=
                  maximumReasonableRowStep
            );

        const measuredRowStep =
          getMedian(
            currentBlockRowSteps
          );

        /**
         * 当前模块只有一行时，
         * 从编辑器 CSS 中读取 line-height。
         */
        const editorStyle =
          (
            editor &&
            typeof window !==
              "undefined"
          )
            ? window.getComputedStyle(
                editor
              )
            : null;

        const computedLineHeight =
          Number.parseFloat(
            editorStyle?.lineHeight
          );

        /**
         * rowStep 的优先级：
         *
         * 1. 当前模块自身已有的真实跨行距离
         * 2. 编辑器 CSS line-height
         * 3. 当前矩形高度
         *
         * 不再硬编码最小 30px，
         * 避免实际行距小于 30px 时逐行累计偏差。
         */
        const rowStep =
          (
            Number.isFinite(
              measuredRowStep
            ) &&
            measuredRowStep > 0
          )
            ? measuredRowStep
            : (
                Number.isFinite(
                  computedLineHeight
                ) &&
                computedLineHeight > 0
              )
              ? computedLineHeight
              : firstRectangleHeight;

        const paddingRight =
          editorStyle
            ? (
                Number.parseFloat(
                  editorStyle.paddingRight
                ) || 0
              )
            : 0;

        /**
         * 编辑器内容区域的真实右边界。
         */
        const fallbackRight =
          lineExtensions.length > 0
            ? Math.max(
                ...lineExtensions.map(
                  (rectangle) =>
                    (
                      Number(
                        rectangle.left
                      ) || 0
                    ) +
                    getRectangleNaturalWidth(
                      rectangle
                    )
                )
              )
            : 1;

        const editorRight =
          Math.max(
            1,
            (
              editor?.offsetWidth ||
              fallbackRight
            ) - paddingRight
          );

        /**
         * 模块在文档流中真实占用的总宽度。
         *
         * 这里使用 naturalWidth，
         * 防止行尾 SVG 补齐宽度影响字数与像素的换算。
         */
        const naturalVisualWidth =
          rectangles.reduce(
            (
              total,
              rectangle
            ) =>
              total +
              getRectangleNaturalWidth(
                rectangle
              ),
            0
          );

        handles.push({
          block,
          blockId,

          anchorX:
            getRectangleNaturalRight(
              lastRectangle
            ),

          anchorY:
            lastRectangle.top +
            lastRectangle.height /
              2,

          visualWidth:
            Math.max(
              8,
              naturalVisualWidth
            ),

          firstLeft:
            firstRectangle.left,

          firstTop:
            firstRectangle.top,

          rowHeight:
            firstRectangleHeight,

          rowStep,
          editorRight,
        });
      }

      return handles;
    }, [
      blockById,
      editorRef,
      lineExtensions,
    ]);

  /**
   * 根据目标字数计算拉伸后的视觉矩形。
   *
   * 当宽度超过当前行时，
   * 会继续生成下一行的预览矩形。
   */
  const lengthResizePreview =
    useMemo(() => {
      if (!lengthResizeDraft) {
        return null;
      }

      const handle =
        lengthResizeHandles.find(
          (item) =>
            item.blockId ===
            lengthResizeDraft.blockId
        );

      if (!handle) {
        return null;
      }

      const originalCount =
        Math.max(
          1,
          Number(
            lengthResizeDraft
              .originalCount
          ) || 1
        );

      const targetLength =
        Math.max(
          1,
          Number(
            lengthResizeDraft
              .targetLength
          ) || 1
        );

      /**
       * 根据字数比例估算目标视觉宽度。
       */
      /**
       * 必须使用开始拖动时冻结的原始视觉宽度。
       *
       * 缩短预览会暂时隐藏文字，DOM 重新测量后
       * handle.visualWidth 也会随之变小。若继续使用它计算，
       * 就会再次乘以缩短比例，造成预览框越来越短。
       */
      const originalVisualWidth =
        Math.max(
          8,
          Number(
            lengthResizeDraft
              .originalVisualWidth
          ) ||
            handle.visualWidth
        );

      /**
       * 手柄必须跟随鼠标的真实像素位置，
       * 不能只跟随取整后的目标字数。
       *
       * targetLength 每次只能变化一个整数，
       * 如果用字数比例计算框宽，手柄会停顿后跳动，
       * 看起来就像漂在鼠标后面。
       */
      const targetVisualWidth =
        Math.max(
          8,
          originalVisualWidth *
            (
              targetLength /
              originalCount
            )
        );

      /**
       * 冻结开始拖动时的完整布局几何信息。
       *
       * 缩短文字后 DOM 会重新排版，实时 handle 的
       * firstLeft、firstTop、rowStep 等数值可能变化。
       * 预览继续读取这些动态值就会产生位置漂移。
       */
      const frozenFirstLeft =
        Number(
          lengthResizeDraft
            .originalFirstLeft
        );

      const frozenFirstTop =
        Number(
          lengthResizeDraft
            .originalFirstTop
        );

      const frozenRowHeight =
        Number(
          lengthResizeDraft
            .originalRowHeight
        );

      const frozenRowStep =
        Number(
          lengthResizeDraft
            .originalRowStep
        );

      const frozenEditorRight =
        Number(
          lengthResizeDraft
            .originalEditorRight
        );

      const firstLeft =
        Number.isFinite(
          frozenFirstLeft
        )
          ? frozenFirstLeft
          : handle.firstLeft;

      const firstTop =
        Number.isFinite(
          frozenFirstTop
        )
          ? frozenFirstTop
          : handle.firstTop;

      const rowHeight =
        Number.isFinite(
          frozenRowHeight
        ) &&
        frozenRowHeight > 0
          ? frozenRowHeight
          : handle.rowHeight;

      const rowStep =
        Number.isFinite(
          frozenRowStep
        ) &&
        frozenRowStep > 0
          ? frozenRowStep
          : handle.rowStep;

      const editorRight =
        Number.isFinite(
          frozenEditorRight
        ) &&
        frozenEditorRight > 0
          ? frozenEditorRight
          : handle.editorRight;

      const rectangles = [];

      let remaining =
        targetVisualWidth;

      let rowIndex = 0;

      /**
       * 为预览边框生成多行矩形。
       *
       * 不限制正常拉伸长度。
       * 10000 只是防止异常数据造成死循环。
       */
      while (
        remaining > 0.5 &&
        rowIndex < 10000
      ) {
        const left =
          rowIndex === 0
            ? firstLeft
            : 0;

        const availableWidth =
          Math.max(
            8,
            editorRight -
              left
          );

        const width =
          Math.min(
            remaining,
            availableWidth
          );

        rectangles.push({
          left,

          top:
            firstTop +
            rowIndex *
              rowStep,

          width:
            Math.max(
              8,
              width
            ),

          height:
            rowHeight,
        });

        remaining -= width;
        rowIndex += 1;
      }

      const lastRectangle =
        rectangles[
          rectangles.length - 1
        ];

      if (!lastRectangle) {
        return null;
      }

      /**
       * 文档流变化量。
       *
       * 正数：模块被拉长，需要在后面增加占位。
       * 负数：模块被缩短，需要回收原来占据的空间，
       *       让后续模块向前移动。
       */
      const flowDelta =
        targetVisualWidth -
        originalVisualWidth;

      const spacerWidth =
        Math.max(
          0,
          flowDelta
        ) +
        LENGTH_PREVIEW_END_GAP;

      const shrinkWidth =
        Math.max(
          0,
          -flowDelta
        );

      return {
        ...handle,

        targetVisualWidth,

        /**
         * 向外暴露冻结后的原始宽度，
         * 供文字遮挡逻辑使用。
         */
        originalVisualWidth,

        /**
         * 保留旧字段，兼容现有的 LengthFlowSpacer。
         */
        spacerWidth,

        /**
         * 固定写入文档流的模块间距。不要再依赖原 inline 模块的
         * margin-right，否则换行临界点会出现贴合或重叠。
         */
        endGap:
          LENGTH_PREVIEW_END_GAP,

        /**
         * 新增字段：
         * LengthFlowSpacer 使用 flowDelta 处理正向占位
         * 和负向空间回收。
         */
        flowDelta,

        /**
         * SingleSemanticEditor 使用 shrinkWidth
         * 遮挡目标宽度之外的原文字。
         */
        shrinkWidth,

        isShrinking:
          flowDelta < 0,

        rectangles,

        handleX:
          lastRectangle.left +
          lastRectangle.width,

        handleY:
          lastRectangle.top +
          lastRectangle.height /
            2,
      };
    }, [
      lengthResizeDraft,
      lengthResizeHandles,
    ]);

  /**
   * 用户按下拉伸手柄时开始拉伸。
   */
  const beginLengthResize =
    useCallback(
      (event, handle) => {
        if (
          isGenerating ||
          isAdjustingLength ||
          editingBlockId ||
          !handle?.block
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const lengthInfo =
          getWritingLengthInfo(
            handle.block.text
          );

        if (
          lengthInfo.count <= 0
        ) {
          return;
        }

        /**
         * 如果当前模块已经存在尚未提交的拉伸草稿，
         * 再次拖动时必须从上一次松手后的目标位置继续。
         *
         * 注意：
         * originalCount 始终保留模块真实文本的原始长度，
         * dragStartLength 才是本次拖动开始时的长度。
         */
        const latestDraft =
          lengthResizeDraftRef.current;

        const existingDraft =
          (
            latestDraft &&
            latestDraft.blockId ===
              handle.blockId &&
            !latestDraft.submitting
          )
            ? latestDraft
            : null;

        const dragStartLength =
          Math.max(
            1,
            Number(
              existingDraft?.targetLength
            ) || lengthInfo.count
          );

        const editor =
          editorRef.current;

        const editorRect =
          editor?.getBoundingClientRect();

        const scaleX =
          (
            editor &&
            editor.offsetWidth > 0
          )
            ? (
                (
                  editorRect?.width ||
                  editor.offsetWidth
                ) /
                editor.offsetWidth
              )
            : 1;

        const safeScaleX =
          (
            Number.isFinite(
              scaleX
            ) &&
            scaleX > 0
          )
            ? scaleX
            : 1;

        /**
         * 每增加或减少一个字或词，
         * 鼠标大约需要移动的像素。
         */
        const pixelsPerUnit =
          Math.max(
            7,
            (
              handle.visualWidth /
              Math.max(
                1,
                lengthInfo.count
              )
            ) *
              safeScaleX
          );

        setIsLengthResizeDragging(
          true
        );

        lengthResizeDragRef.current =
          {
            blockId:
              handle.blockId,

            startClientX:
              event.clientX,

            startClientY:
              event.clientY,

            anchorX:
              handle.anchorX,

            originalCount:
              lengthInfo.count,

            dragStartLength,

            /**
             * 手柄位置以真实像素宽度为准，
             * targetLength 只用于状态提示和最终 AI 请求。
             */
            dragStartVisualWidth:
              Math.max(
                8,
                Number(
                  existingDraft
                    ?.targetVisualWidth
                ) ||
                  (
                    (
                      existingDraft
                        ?.originalVisualWidth ??
                      handle.visualWidth
                    ) *
                    (
                      dragStartLength /
                      Math.max(
                        1,
                        lengthInfo.count
                      )
                    )
                  )
              ),

            lengthUnit:
              lengthInfo.unit,

            unitLabel:
              lengthInfo.label,

            pixelsPerUnit,

            scaleX:
              safeScaleX,

            minLocalX: 4,

            maxLocalX:
              Math.max(
                4,
                (
                  editor?.offsetWidth ||
                  handle.editorRight
                ) - 4
              ),

            rowStepClient:
              handle.rowStep *
              safeScaleX,

            rowWidthClient:
              handle.editorRight *
              safeScaleX,
          };

        const nextDraft = {
          blockId:
            handle.blockId,

          anchorX:
            handle.anchorX,

          anchorY:
            handle.anchorY,

          targetX:
            existingDraft?.targetX ??
            handle.anchorX,

          originalCount:
            lengthInfo.count,

          /**
           * 冻结开始拖动时的真实宽度。
           * 后续即使文字被遮挡、DOM 重新测量，
           * 也不会改变这个基准。
           */
          originalVisualWidth:
            existingDraft
              ?.originalVisualWidth ??
            handle.visualWidth,

          /**
           * 保存当前预览的真实像素宽度。
           * 再次拖动时从上次松手的位置继续。
           */
          targetVisualWidth:
            existingDraft
              ?.targetVisualWidth ??
            (
              (
                existingDraft
                  ?.originalVisualWidth ??
                handle.visualWidth
              ) *
              (
                dragStartLength /
                Math.max(
                  1,
                  lengthInfo.count
                )
              )
            ),

          /**
           * 冻结完整的初始几何信息，防止隐藏文字后
           * DOM 重排导致手柄和预览框发生漂移。
           */
          originalFirstLeft:
            existingDraft
              ?.originalFirstLeft ??
            handle.firstLeft,

          originalFirstTop:
            existingDraft
              ?.originalFirstTop ??
            handle.firstTop,

          originalRowHeight:
            existingDraft
              ?.originalRowHeight ??
            handle.rowHeight,

          originalRowStep:
            existingDraft
              ?.originalRowStep ??
            handle.rowStep,

          originalEditorRight:
            existingDraft
              ?.originalEditorRight ??
            handle.editorRight,

          targetLength:
            dragStartLength,

          lengthUnit:
            lengthInfo.unit,

          unitLabel:
            lengthInfo.label,

          value:
            Math.round(
              (
                (
                  dragStartLength -
                  lengthInfo.count
                ) /
                Math.max(
                  1,
                  lengthInfo.count
                )
              ) * 100
            ),

          submitting: false,
        };

        lengthResizeDraftRef.current =
          nextDraft;

        setLengthResizeDraft(
          nextDraft
        );

        editor?.focus({
          preventScroll: true,
        });
      },
      [
        editingBlockId,
        editorRef,
        isAdjustingLength,
        isGenerating,
        lengthResizeDraft,
      ]
    );

  /**
   * 全局监听 pointermove。
   *
   * 支持横向拖动，
   * 也支持向上或向下跨行拖动。
   */
  useEffect(() => {
    const handlePointerMove =
      (event) => {
        const drag =
          lengthResizeDragRef.current;

        if (!drag) {
          return;
        }

        event.preventDefault();

        const deltaClientX =
          event.clientX -
          drag.startClientX;

        /**
         * 鼠标每向下一视觉行移动一次，
         * 视为增加一整行宽度。
         */
        const rowDelta =
          Math.round(
            (
              event.clientY -
              drag.startClientY
            ) /
              Math.max(
                1,
                drag.rowStepClient
              )
          );

        const linearDelta =
          deltaClientX +
          rowDelta *
            drag.rowWidthClient;

        const deltaUnits =
          Math.round(
            linearDelta /
            Math.max(
              1,
              drag.pixelsPerUnit
            )
          );

        /**
         * 最短为一个字或词。
         *
         * 不设置最大长度限制。
         */
        const targetLength =
          Math.max(
            1,
            drag.dragStartLength +
              deltaUnits
          );

        /**
         * 计算相对于原始长度的变化百分比。
         *
         * 不限制最大百分比。
         */
        const value =
          Math.round(
            (
              (
                targetLength -
                drag.originalCount
              ) /
              drag.originalCount
            ) * 100
          );

        /**
         * targetX 只保留在单行编辑器范围内。
         *
         * 真正跨行后的手柄位置，
         * 使用 lengthResizePreview.handleX 和 handleY。
         */
        const targetX =
          Math.max(
            drag.minLocalX,
            Math.min(
              drag.maxLocalX,
              drag.anchorX +
                (
                  (
                    targetLength -
                    drag.originalCount
                  ) *
                  drag.pixelsPerUnit
                ) /
                  drag.scaleX
            )
          );

        setLengthResizeDraft(
          (current) => {
            if (
              !current ||
              current.blockId !==
                drag.blockId
            ) {
              return current;
            }

            const nextDraft = {
              ...current,

              targetX,

              targetLength,

              value,
            };

            lengthResizeDraftRef.current =
              nextDraft;

            return nextDraft;
          }
        );
      };

    const handlePointerUp =
      () => {
        /**
         * 松开鼠标后停止改变长度，
         * 但保留预览，等待 Enter 或 Escape。
         */
        lengthResizeDragRef.current =
          null;

        setIsLengthResizeDragging(
          false
        );
      };

    window.addEventListener(
      "pointermove",
      handlePointerMove,
      {
        passive: false,
      }
    );

    window.addEventListener(
      "pointerup",
      handlePointerUp
    );

    window.addEventListener(
      "pointercancel",
      handlePointerUp
    );

    return () => {
      window.removeEventListener(
        "pointermove",
        handlePointerMove
      );

      window.removeEventListener(
        "pointerup",
        handlePointerUp
      );

      window.removeEventListener(
        "pointercancel",
        handlePointerUp
      );
    };
  }, []);

  /**
   * 拉伸完成后：
   *
   * Enter：提交 AI 调整
   * Escape：取消本次调整
   */
  useEffect(() => {
    if (!lengthResizeDraft) {
      return undefined;
    }

    const handleLengthKeyDown =
      async (event) => {
        if (
          event.key === "Escape"
        ) {
          event.preventDefault();
          event.stopPropagation();

          event
            .stopImmediatePropagation?.();

          lengthResizeDragRef.current =
            null;

          setIsLengthResizeDragging(
            false
          );

          setLengthResizeDraft(
            null
          );

          return;
        }

        if (
          event.key !== "Enter" ||
          event.isComposing ||
          lengthResizeDraft
            .submitting ||
          isAdjustingLength
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        event
          .stopImmediatePropagation?.();

        /**
         * 长度没有变化时不发送请求。
         */
        if (
          lengthResizeDraft
            .targetLength ===
          lengthResizeDraft
            .originalCount
        ) {
          setIsLengthResizeDragging(
            false
          );

          setLengthResizeDraft(
            null
          );

          return;
        }

        const block =
          blockById?.get(
            lengthResizeDraft.blockId
          );

        if (!block) {
          setIsLengthResizeDragging(
            false
          );

          setLengthResizeDraft(
            null
          );

          return;
        }

        const submittedDraft = {
          ...lengthResizeDraft,
        };

        lengthResizeDragRef.current =
          null;

        setIsLengthResizeDragging(
          false
        );

        /**
         * 按 Enter 后不要立即清空长度草稿。
         *
         * 预览框、隐藏后的文本和文档流占位都依赖
         * lengthResizeDraft。若这里立刻设为 null，
         * AI 请求刚开始时模块就会恢复到原来的位置。
         *
         * 这里仅把草稿锁定为 submitting：
         * 1. 模块继续停留在用户拖拽的位置；
         * 2. 生成过程中不能再次拖动或重复提交；
         * 3. AI 完成后再清除预览，让真实生成文本接管布局。
         */
        const submittingDraft = {
          ...submittedDraft,
          submitting: true,
        };

        lengthResizeDraftRef.current =
          submittingDraft;

        setLengthResizeDraft(
          submittingDraft
        );

        try {
          const result =
            await onAdjustLength?.(
              block,
              {
                value:
                  submittedDraft.value,

                targetLength:
                  submittedDraft
                    .targetLength,

                lengthUnit:
                  submittedDraft
                    .lengthUnit,
              }
            );

          /**
           * AI 完成并且流式文本已经写回以后，
           * 才清除临时预览状态。
           */
          lengthResizeDraftRef.current =
            null;

          setLengthResizeDraft(
            null
          );

          return result;
        } catch (error) {
          console.error(
            "[useLengthResize] 拉伸调整长度失败：",
            error
          );

          if (
            blockById?.has(
              submittedDraft.blockId
            )
          ) {
            const restoredDraft = {
              ...submittedDraft,
              submitting: false,
            };

            lengthResizeDraftRef.current =
              restoredDraft;

            setLengthResizeDraft(
              restoredDraft
            );
          } else {
            lengthResizeDraftRef.current =
              null;

            setLengthResizeDraft(
              null
            );
          }

          throw error;
        }
      };

    window.addEventListener(
      "keydown",
      handleLengthKeyDown,
      true
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleLengthKeyDown,
        true
      );
    };
  }, [
    blockById,
    isAdjustingLength,
    lengthResizeDraft,
    onAdjustLength,
  ]);

  /**
   * 只有模块真的从正文中消失时才取消拉伸预览。
   * 手柄属于每一个正文模块，取消选择不应让拖动瞬间中断。
   */
  useEffect(() => {
    if (
      lengthResizeDraft &&
      !blockById?.has(
        lengthResizeDraft.blockId
      ) &&
      !lengthResizeDraft
        .submitting
    ) {
      lengthResizeDragRef.current =
        null;

      setIsLengthResizeDragging(
        false
      );

      setLengthResizeDraft(
        null
      );
    }
  }, [
    blockById,
    lengthResizeDraft,
  ]);

  /**
   * 主动取消长度拉伸。
   */
  const cancelLengthResize =
    useCallback(() => {
      lengthResizeDragRef.current =
        null;

      setIsLengthResizeDragging(
        false
      );

      setLengthResizeDraft(
        null
      );
    }, []);

  return {
    lengthResizeDraft,
    lengthResizeHandles,
    lengthResizePreview,

    lengthAdjustBlinkOn,
    isLengthResizeDragging,

    beginLengthResize,
    cancelLengthResize,
  };
}
