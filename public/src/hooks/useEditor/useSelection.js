import {
  useCallback,
  useState,
} from "react";

import {
  CONTENT_WIDTH,
  PAGE_HEIGHT,
} from "../../constants";

import {
  clamp,
} from "../../utils";

/**
 * 判断选框与模块可视矩形是否存在实际重叠。
 *
 * 不要求中心点进入，也不设置最低覆盖比例；只要有任何正面积的视觉
 * 重叠就命中。两条边仅仅接触、重叠面积为 0 时不算选中。
 */
function isRectCoveredBySelection(
  selectionRect,
  blockRect
) {
  if (
    !selectionRect ||
    !blockRect
  ) {
    return false;
  }

  const selectionLeft =
    Number(selectionRect.x) || 0;

  const selectionTop =
    Number(selectionRect.y) || 0;

  const selectionRight =
    selectionLeft +
    Math.max(
      0,
      Number(
        selectionRect.width
      ) || 0
    );

  const selectionBottom =
    selectionTop +
    Math.max(
      0,
      Number(
        selectionRect.height
      ) || 0
    );

  const blockLeft =
    Number(blockRect.x) || 0;

  const blockTop =
    Number(blockRect.y) || 0;

  const blockWidth =
    Math.max(
      0,
      Number(
        blockRect.width
      ) || 0
    );

  const blockHeight =
    Math.max(
      0,
      Number(
        blockRect.height
      ) || 0
    );

  if (
    blockWidth <= 0 ||
    blockHeight <= 0
  ) {
    return false;
  }

  const blockRight =
    blockLeft + blockWidth;

  const blockBottom =
    blockTop + blockHeight;

  const overlapWidth =
    Math.min(
      selectionRight,
      blockRight
    ) -
    Math.max(
      selectionLeft,
      blockLeft
    );

  const overlapHeight =
    Math.min(
      selectionBottom,
      blockBottom
    ) -
    Math.max(
      selectionTop,
      blockTop
    );

  return (
    overlapWidth > 0 &&
    overlapHeight > 0
  );
}

export function useSelection({
  contentRef,
  zoom,
  totalContentHeight,
  blockBounds,
  draggingType,
  draggingBlockId,
}) {
  const [
    selectedIds,
    setSelectedIds,
  ] = useState([]);

  const [
    isSelecting,
    setIsSelecting,
  ] = useState(false);

  const [
    selectionRect,
    setSelectionRect,
  ] = useState(null);

  const [
    selectionStart,
    setSelectionStart,
  ] = useState(null);

  const [
    selectionCandidateStart,
    setSelectionCandidateStart,
  ] = useState(null);

  /**
   * 清除所有选择状态。
   */
  const clearSelection =
    useCallback(() => {
      setSelectedIds([]);
      setSelectionRect(null);
      setSelectionStart(null);
      setSelectionCandidateStart(
        null
      );
      setIsSelecting(false);
    }, []);

  /**
   * 将鼠标坐标转换为内容画布坐标。
   */
  const getContentPoint =
    useCallback(
      (event) => {
        if (!contentRef.current) {
          return null;
        }

        const rect =
          contentRef.current.getBoundingClientRect();

        const x =
          (event.clientX -
            rect.left) /
          zoom;

        const y =
          (event.clientY -
            rect.top) /
          zoom;

        return {
          x: clamp(
            x,
            0,
            CONTENT_WIDTH
          ),

          y: clamp(
            y,
            0,
            Math.max(
              totalContentHeight,
              PAGE_HEIGHT
            )
          ),
        };
      },
      [
        contentRef,
        zoom,
        totalContentHeight,
      ]
    );

  /**
   * 根据框选区域获取命中的模块 ID。
   *
   * 单行或多行模块，只要任意可视行片段与选框有实际重叠即命中。
   */
  const getHitBlockIds =
    useCallback(
      (rect) => {
        const contentElement =
          contentRef.current;

        const domHitIds = [];
        const domRepresentedIds =
          new Set();

        if (contentElement) {
          const contentRect =
            contentElement.getBoundingClientRect();

          const semanticBlocks =
            Array.from(
              contentElement.querySelectorAll(
                "[data-semantic-block-id]:not([data-completed-inline='true'])"
              )
            );

          if (
            semanticBlocks.length > 0
          ) {
            /**
             * 同一模块可能产生多个 DOM 行片段。
             * 产品规则：任意一行片段的任何可见部分进入选框，
             * 就选中整个模块。
             * 这里只使用实时 DOM 行片段；旧布局边界不会重复参与。
             */
            const rectsByBlockId =
              new Map();

            semanticBlocks.forEach(
              (element) => {
                const blockId =
                  element.getAttribute(
                    "data-semantic-block-id"
                  );

                if (!blockId) {
                  return;
                }

                const clientRects =
                  Array.from(
                    element.getClientRects?.() ||
                    []
                  ).filter(
                    (clientRect) =>
                      clientRect.width > 0 &&
                      clientRect.height > 0
                  );

                if (
                  clientRects.length === 0
                ) {
                  return;
                }

                domRepresentedIds.add(
                  String(blockId)
                );

                const existingRects =
                  rectsByBlockId.get(
                    String(blockId)
                  ) || [];

                const localRects =
                  clientRects.map(
                    (clientRect) => ({
                      x:
                        (clientRect.left -
                          contentRect.left) /
                        zoom,
                      y:
                        (clientRect.top -
                          contentRect.top) /
                        zoom,
                      width:
                        clientRect.width /
                        zoom,
                      height:
                        clientRect.height /
                        zoom,
                    })
                  );

                rectsByBlockId.set(
                  String(blockId),
                  [
                    ...existingRects,
                    ...localRects,
                  ]
                );
              }
            );

            const hitIds =
              Array.from(
                rectsByBlockId.entries()
              )
                .filter(([, lineRects]) =>
                  lineRects.some(
                    (lineRect) =>
                      isRectCoveredBySelection(
                        rect,
                        lineRect
                      )
                  )
                )
                .map(([blockId]) =>
                  blockId
                );

            domHitIds.push(...hitIds);
          }
        }

        const layoutHitIds =
          blockBounds
            .filter(
              (blockRect) =>
                !domRepresentedIds.has(
                  String(
                    blockRect.blockId
                  )
                ) &&
                isRectCoveredBySelection(
                  rect,
                  blockRect
                )
            )
            .map(
              (blockRect) =>
                blockRect.blockId
            );

        return Array.from(
          new Set([
            ...domHitIds,
            ...layoutHitIds,
          ].map(String))
        );
      },
      [
        blockBounds,
        contentRef,
        zoom,
      ]
    );

  /**
   * 更新框选矩形及选中的模块。
   */
  const updateSelectionRect =
    useCallback(
      (
        start,
        point,
        isShiftPressed
      ) => {
        const x = Math.min(
          start.x,
          point.x
        );

        const y = Math.min(
          start.y,
          point.y
        );

        const width = Math.abs(
          point.x - start.x
        );

        const height = Math.abs(
          point.y - start.y
        );

        const nextRect = {
          x,
          y,
          width,
          height,
        };

        setSelectionRect(
          nextRect
        );

        const hitIds =
          getHitBlockIds(
            nextRect
          );

        const uniqueHitIds =
          Array.from(
            new Set(hitIds)
          );

        setSelectedIds(
          (previousIds) => {
            if (isShiftPressed) {
              return Array.from(
                new Set([
                  ...previousIds,
                  ...uniqueHitIds,
                ])
              );
            }

            return uniqueHitIds;
          }
        );
      },
      [getHitBlockIds]
    );

  /**
   * 点击单个模块。
   *
   * 普通点击：
   * 只选择当前模块。
   *
   * Shift 点击：
   * 1. 按点击顺序追加模块；
   * 2. 再次点击已选模块时取消；
   * 3. 可以连续追加任意数量的模块。
   */
  const handleBlockMouseDown =
    useCallback(
      (
        event,
        blockId
      ) => {
        event.stopPropagation();

        if (event.shiftKey) {
          setSelectedIds(
            (previousIds) => {
              const normalizedBlockId =
                String(blockId);

              const alreadySelected =
                previousIds.some(
                  (id) =>
                    String(id) ===
                    normalizedBlockId
                );

              if (alreadySelected) {
                return previousIds.filter(
                  (id) =>
                    String(id) !==
                    normalizedBlockId
                );
              }

              return [
                ...previousIds,
                blockId,
              ];
            }
          );

          return;
        }

        setSelectedIds(
          (previousIds) => {
            const normalizedBlockId =
              String(blockId);

            const belongsToCurrentGroup =
              previousIds.length > 1 &&
              previousIds.some(
                (id) =>
                  String(id) ===
                  normalizedBlockId
              );

            /**
             * 在已经框选出的组合中按下任意模块时保留整组选择。
             * 否则 dragstart 之前的 mousedown 会先把 selectedIds
             * 缩成单个模块，后续拖拽永远无法知道原来的组合。
             */
            if (
              belongsToCurrentGroup
            ) {
              return previousIds;
            }

            return [blockId];
          }
        );
      },
      []
    );

  /**
   * 开始尝试框选。
   *
   * 鼠标按下时不会立刻进入框选，
   * 移动超过 5px 后才正式开始。
   */
  const handleSelectionStart =
    useCallback(
      (event) => {
        if (
          draggingType ||
          draggingBlockId != null
        ) {
          return;
        }

        const target =
          event.target;

        if (
          target.closest?.(
            "[data-block-root='true']"
          )
        ) {
          return;
        }

        if (
          target.closest?.(
            "[data-editable-fragment='true']"
          )
        ) {
          return;
        }

        if (
          target.closest?.(
            "[data-completed-text='true']"
          )
        ) {
          return;
        }

        const point =
          getContentPoint(event);

        if (!point) {
          return;
        }

        setSelectionCandidateStart(
          point
        );

        setSelectionStart(null);
        setSelectionRect(null);
        setIsSelecting(false);

        if (!event.shiftKey) {
          setSelectedIds([]);
        }
      },
      [
        draggingType,
        draggingBlockId,
        getContentPoint,
      ]
    );

  /**
   * 鼠标移动时更新框选。
   */
  const handleSelectionMove =
    useCallback(
      (event) => {
        const point =
          getContentPoint(event);

        if (!point) {
          return;
        }

        if (!isSelecting) {
          if (
            !selectionCandidateStart
          ) {
            return;
          }

          const dx =
            point.x -
            selectionCandidateStart.x;

          const dy =
            point.y -
            selectionCandidateStart.y;

          const distance =
            Math.hypot(
              dx,
              dy
            );

          if (distance < 5) {
            return;
          }

          const start =
            selectionCandidateStart;

          setIsSelecting(true);
          setSelectionStart(start);

          updateSelectionRect(
            start,
            point,
            event.shiftKey
          );

          return;
        }

        if (!selectionStart) {
          return;
        }

        updateSelectionRect(
          selectionStart,
          point,
          event.shiftKey
        );
      },
      [
        getContentPoint,
        isSelecting,
        selectionCandidateStart,
        selectionStart,
        updateSelectionRect,
      ]
    );

  /**
   * 结束框选。
   */
  const handleSelectionEnd =
    useCallback(
      (event) => {
        if (
          event &&
          selectionStart
        ) {
          const finalPoint =
            getContentPoint(event);

          if (finalPoint) {
            updateSelectionRect(
              selectionStart,
              finalPoint,
              event.shiftKey
            );
          }
        }

        setIsSelecting(false);
        setSelectionStart(null);
        setSelectionCandidateStart(
          null
        );
        setSelectionRect(null);
      },
      [
        getContentPoint,
        selectionStart,
        updateSelectionRect,
      ]
    );

  return {
    selectedIds,
    setSelectedIds,

    isSelecting,
    selectionRect,

    clearSelection,

    handleBlockMouseDown,
    handleSelectionStart,
    handleSelectionMove,
    handleSelectionEnd,
  };
}
