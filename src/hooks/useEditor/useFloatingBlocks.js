import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  CONTENT_LEFT,
  CONTENT_TOP,
  CONTENT_WIDTH,
} from "../../constants";

/**
 * 灰色区域统一使用现有 floating 卡片的紧凑宽度。
 * 长文本不会沿用白色画布中的整行宽度。
 */
function getStandardFloatingWidth(
  text
) {
  const value =
    String(text ?? "");

  let estimatedWidth = 0;

  for (const character of value) {
    estimatedWidth +=
      /[\u4e00-\u9fff]/.test(
        character
      )
        ? 16
        : 8;
  }

  return Math.max(
    220,
    Math.min(
      360,
      estimatedWidth + 32
    )
  );
}

/**
 * 读取 inline 模块当前真实的逐行形状。
 * 拖拽尚未进入灰色区域时，预览使用这些行片段，而不是把整段文字
 * 塞进一个矩形文本框。进入灰色区域后，现有逻辑才会转成 floating。
 */
function collectInlineDragLineFragments(
  element,
  overallRect,
  zoom = 1
) {
  if (
    !element ||
    !overallRect ||
    typeof document === "undefined"
  ) {
    return [];
  }

  const visualZoom =
    Number.isFinite(Number(zoom)) &&
    Number(zoom) > 0
      ? Number(zoom)
      : 1;

  const contentElement =
    element.querySelector?.(
      "[data-semantic-block-content='true']"
    ) || element;

  const walker =
    document.createTreeWalker(
      contentElement,
      NodeFilter.SHOW_TEXT
    );

  const lines = [];
  let textNode = walker.nextNode();

  while (textNode) {
    const value = String(
      textNode.nodeValue ?? ""
    );

    for (
      let index = 0;
      index < value.length;
      index += 1
    ) {
      const range =
        document.createRange();

      range.setStart(textNode, index);
      range.setEnd(textNode, index + 1);

      const rect =
        range.getClientRects?.()[0];

      if (!rect || rect.height <= 0) {
        continue;
      }

      let line = lines.find(
        (candidate) =>
          Math.abs(
            candidate.top - rect.top
          ) < 3
      );

      if (!line) {
        line = {
          text: "",
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        };
        lines.push(line);
      }

      line.text += value[index];
      line.left = Math.min(
        line.left,
        rect.left
      );
      line.right = Math.max(
        line.right,
        rect.right
      );
      line.bottom = Math.max(
        line.bottom,
        rect.bottom
      );
    }

    textNode = walker.nextNode();
  }

  return lines
    .sort((a, b) => a.top - b.top)
    .map((line) => ({
      text: line.text,
      x:
        (
          line.left -
          overallRect.left
        ) /
          visualZoom -
        8,
      y:
        (
          line.top -
          overallRect.top
        ) /
          visualZoom -
        2,
      width:
        (
          line.right -
          line.left
        ) /
          visualZoom +
        16,
      height:
        (
          line.bottom -
          line.top
        ) /
          visualZoom +
        4,
    }));
}

/** 获取跨行 inline 元素所有可视片段的联合矩形。 */
function getElementVisualUnionRect(
  element
) {
  const rects = Array.from(
    element?.getClientRects?.() || []
  ).filter(
    (rect) =>
      rect.width > 0 &&
      rect.height > 0
  );

  if (rects.length === 0) {
    return element
      ?.getBoundingClientRect?.() ||
      null;
  }

  const left = Math.min(
    ...rects.map((rect) => rect.left)
  );
  const top = Math.min(
    ...rects.map((rect) => rect.top)
  );
  const right = Math.max(
    ...rects.map((rect) => rect.right)
  );
  const bottom = Math.max(
    ...rects.map((rect) => rect.bottom)
  );

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * 整组拖拽始终保持开始时的相对位置和尺寸。
 * 只以主模块为锚点做统一平移，不重新换行或压缩布局。
 */
function buildCompactFloatingGroupLayout(
  snapshots,
  primaryId,
  primaryX,
  primaryY
) {
  const primaryItem =
    snapshots.find(
      (item) =>
        String(item.id) ===
        String(primaryId)
    ) || snapshots[0];

  const offsetX =
    primaryX -
    (primaryItem?.x || 0);
  const offsetY =
    primaryY -
    (primaryItem?.y || 0);

  return snapshots.map((item) => ({
    ...item,
    layoutX: item.x,
    layoutY: item.y,
    layoutWidth:
      item.width ||
      item.block?.floatingWidth ||
      item.block?.width ||
      180,
    layoutHeight:
      item.height ||
      item.block?.floatingHeight ||
      item.block?.height ||
      40,
    x: offsetX + item.x,
    y: offsetY + item.y,
  }));
}

export function useFloatingBlocks({
  zoom,
  stageRef,
  pageRef,
  totalContentHeight,
  sectionLayouts,
  draggingBlockId,
  selectedIds = [],
  getBlockById,
  updateBlockPlacement,
  handleCanvasMouseUp,
}) {
  const [
    dragPointer,
    setDragPointer,
  ] = useState(null);

  const [
    dragPointerRaw,
    setDragPointerRaw,
  ] = useState(null);

  const dragStartRef =
    useRef(null);

  /** 只有当前手势真正移动过，Stage 外 mouseup 才能提交放置。 */
  const dragMovedRef =
    useRef(false);

  const pointerOffsetRef =
    useRef({
      x: 0,
      y: 0,
    });

  /**
   * 记录开始拖拽瞬间模块真实渲染尺寸，预览必须保持原尺寸，
   * 不能套用固定宽度后看起来突然放大。
   */
  const dragVisualSizeRef =
    useRef(null);

  /**
   * 锁定开始拖拽瞬间的完整模块数据。
   *
   * 复制后立即拖动时，React sections 可能还没完成下一帧刷新；
   * 如果预览只按 id 重新查询，就可能拿到缺少分行片段的旧数据，
   * 从而退回普通文本框。拖拽期间始终优先使用这份快照。
   */
  const dragBlockSnapshotRef =
    useRef(null);

  /** 拖拽开始时锁定整组选中模块的 DOM 位置和数据。 */
  const dragGroupSnapshotRef =
    useRef([]);

  /**
   * �桁�藜����後�篋� Stage ����而�上������
   */
  const getStagePoint =
    useCallback(
      (event) => {
        if (
          !stageRef?.current
        ) {
          return null;
        }

        const rect =
          stageRef.current
            .getBoundingClientRect();

        return {
          x:
            (event.clientX -
              rect.left) /
            zoom,

          y:
            (event.clientY -
              rect.top) /
            zoom,
        };
      },
      [
        stageRef,
        zoom,
      ]
    );

  /**
   * �桁�藜����後�篋��処�� Page ����而�上������
   */
  const getPagePoint =
    useCallback(
      (event) => {
        if (
          !pageRef?.current
        ) {
          return null;
        }

        const rect =
          pageRef.current
            .getBoundingClientRect();

        return {
          x:
            (event.clientX -
              rect.left) /
            zoom,

          y:
            (event.clientY -
              rect.top) /
            zoom,
        };
      },
      [
        pageRef,
        zoom,
      ]
    );

  /**
   * 絨� Stage ����莉��≫減 Page ������
   */
  const getPagePointFromStagePoint =
    useCallback(
      (stagePoint) => {
        if (
          !stagePoint ||
          !pageRef?.current ||
          !stageRef?.current
        ) {
          return null;
        }

        const stageRect =
          stageRef.current
            .getBoundingClientRect();

        const pageRect =
          pageRef.current
            .getBoundingClientRect();

        return {
          x:
            stagePoint.x -
            (
              pageRect.left -
              stageRect.left
            ) /
              zoom,

          y:
            stagePoint.y -
            (
              pageRect.top -
              stageRect.top
            ) /
              zoom,
        };
      },
      [
        pageRef,
        stageRef,
        zoom,
      ]
    );

  /**
   * �ゆ�㊤���������篋��処�� Page ����
   */
  const isInsidePageArea =
    useCallback(
      (pagePoint) => {
        if (
          !pagePoint ||
          !pageRef?.current
        ) {
          return false;
        }

        return (
          pagePoint.x >= 0 &&
          pagePoint.x <=
            pageRef.current
              .offsetWidth &&
          pagePoint.y >= 0 &&
          pagePoint.y <=
            pageRef.current
              .offsetHeight
        );
      },
      [pageRef]
    );

  /**
   * 綵���蕁合��賢鐚�
   * �処�� Page ���活�筝阪���ユ③�����阪����
   */
  const isInsideContentArea =
    useCallback(
      (pagePoint) =>
        isInsidePageArea(
          pagePoint
        ),
      [isInsidePageArea]
    );

  /**
   * 綣�紮�莊�荼�群��罔≦��������
   */
  const beginDragTracking =
    useCallback(
      (
        event,
        block,
        explicitGroupBlocks = null
      ) => {
        const point =
          getStagePoint(
            event
          );

        if (
          !point ||
          !stageRef?.current
        ) {
          return;
        }

        dragStartRef.current =
          point;

        dragMovedRef.current =
          false;

        const sourceElement =
          event.target?.closest?.(
            "[data-semantic-block-id], [data-block-root='true']"
          );

        const sourceRect =
          getElementVisualUnionRect(
            sourceElement
          );

        const activeId =
          String(block?.id ?? "");

        const explicitBlocks =
          Array.isArray(
            explicitGroupBlocks
          )
            ? explicitGroupBlocks.filter(
                Boolean
              )
            : [];

        const selectedKeys =
          new Set(
            (
              explicitBlocks.length > 0
                ? explicitBlocks.map(
                    (item) => item.id
                  )
                : selectedIds
            ).map((id) => String(id))
          );

        const groupKeys =
          selectedKeys.size > 1 &&
          selectedKeys.has(activeId)
            ? selectedKeys
            : new Set([activeId]);

        const stageRect =
          stageRef.current
            .getBoundingClientRect();

        const allBlockElements =
          Array.from(
            stageRef.current.querySelectorAll(
              "[data-semantic-block-id], [data-block-id]"
            )
          );

        dragGroupSnapshotRef.current =
          explicitBlocks.length > 0
            ? explicitBlocks.map(
                (groupBlock) => ({
                  id: String(
                    groupBlock.id
                  ),
                  block: {
                    ...groupBlock,
                    floatingLineFragments:
                      Array.isArray(
                        groupBlock.floatingLineFragments
                      )
                        ? groupBlock.floatingLineFragments.map(
                            (fragment) => ({
                              ...fragment,
                            })
                          )
                        : [],
                  },
                  x:
                    groupBlock.floatingX ||
                    0,
                  y:
                    groupBlock.floatingY ||
                    0,
                  width:
                    groupBlock.floatingWidth ||
                    groupBlock.width ||
                    180,
                  height:
                    groupBlock.floatingHeight ||
                    groupBlock.height ||
                    40,
                })
              )
            : Array.from(groupKeys)
            .map((id) => {
              const groupBlock =
                String(block?.id) === id
                  ? block
                  : getBlockById?.(id);

              const element =
                String(block?.id) === id
                  ? sourceElement
                  : allBlockElements.find(
                      (candidate) =>
                        candidate.classList?.contains(
                          "semantic-inline-block"
                        ) &&
                        String(
                          candidate.getAttribute(
                            "data-semantic-block-id"
                          )
                        ) === id
                    ) ||
                    allBlockElements.find(
                      (candidate) =>
                        String(
                          candidate.getAttribute(
                            "data-semantic-block-id"
                          ) ??
                          candidate.getAttribute(
                            "data-block-id"
                          )
                        ) === id
                    );

              const rect =
                getElementVisualUnionRect(
                  element
                );

              if (!groupBlock || !rect) {
                return null;
              }

              const lineFragments =
                groupBlock.placement !== "floating"
                  ? collectInlineDragLineFragments(
                      element,
                      rect,
                      zoom
                    )
                  : Array.isArray(
                      groupBlock.floatingLineFragments
                    )
                    ? groupBlock.floatingLineFragments
                    : [];

              return {
                id,
                block: {
                  ...groupBlock,
                  floatingMatchesInlineAppearance:
                    lineFragments.length > 0
                      ? true
                      : groupBlock.floatingMatchesInlineAppearance,
                  floatingLineFragments:
                    lineFragments,
                },
                x:
                  groupBlock.placement === "floating"
                    ? groupBlock.floatingX ??
                      rect.left - stageRect.left
                    : rect.left - stageRect.left,
                y:
                  groupBlock.placement === "floating"
                    ? groupBlock.floatingY ??
                      rect.top - stageRect.top
                    : rect.top - stageRect.top,
                width:
                  rect.width / zoom,
                height:
                  rect.height / zoom,
              };
            })
            .filter(Boolean);

        const inlineLineFragments =
          block?.placement !== "floating" &&
          sourceRect
          ? collectInlineDragLineFragments(
              sourceElement,
              sourceRect,
              zoom
            )
            : [];

        dragBlockSnapshotRef.current =
          block
            ? {
                ...block,
                floatingMatchesInlineAppearance:
                  inlineLineFragments.length > 0
                    ? true
                    : block.floatingMatchesInlineAppearance,
                floatingLineFragments:
                  inlineLineFragments.length > 0
                    ? inlineLineFragments
                    : Array.isArray(
                        block.floatingLineFragments
                      )
                      ? block.floatingLineFragments.map(
                        (fragment) => ({
                          ...fragment,
                        })
                      )
                      : block.floatingLineFragments,
              }
            : null;

        const explicitPrimary =
          dragGroupSnapshotRef.current.find(
            (item) =>
              String(item.id) ===
              activeId
          );

        dragVisualSizeRef.current =
          explicitPrimary
            ? {
                width:
                  explicitPrimary.width,
                height:
                  explicitPrimary.height,
              }
            : sourceRect &&
          sourceRect.width > 0 &&
          sourceRect.height > 0
            ? {
                width:
                  sourceRect.width /
                  zoom,
                height:
                  sourceRect.height /
                  zoom,
              }
            : null;

        setDragPointer(
          point
        );

        setDragPointerRaw({
          clientX:
            event.clientX,

          clientY:
            event.clientY,
        });

        if (
          block?.placement ===
          "floating"
        ) {
          /**
           * 普通 floating 模块首次拖动时以真实 DOM 位置为准。
           * 副本刚创建后，React 状态与浏览器布局可能相差一帧；若直接
           * 使用 floatingX/Y，鼠标偏移会在第一次移动时产生跳跃。
           * Option+Shift 即时复制没有副本 DOM，因此继续使用显式快照。
           */
          const useExplicitSnapshot =
            explicitBlocks.length > 0;

          const blockLeft =
            !useExplicitSnapshot &&
            sourceRect
              ? sourceRect.left -
                stageRect.left
              : block.floatingX ??
                0;

          const blockTop =
            !useExplicitSnapshot &&
            sourceRect
              ? sourceRect.top -
                stageRect.top
              : block.floatingY ??
                0;

          /**
           * floatingX / floatingY �� Stage 絮鎶�����鐚�
           * ��罩よ���筝�荀����や札 zoom��
           */
          pointerOffsetRef.current =
            {
              x:
                event.clientX -
                stageRect.left -
                blockLeft,

              y:
                event.clientY -
                stageRect.top -
                blockTop,
            };
        } else {
          /**
           * inline 预览必须使用用户在模块上的真实按下位置。
           * 固定偏移会在原模块隐藏、预览接管的一瞬间产生横向跳动，
           * 标签小方块也会跟着左右晃动。
           */
          pointerOffsetRef.current =
            {
              x: sourceRect
                ? event.clientX -
                  sourceRect.left
                : 24,
              y: sourceRect
                ? event.clientY -
                  sourceRect.top
                : 20,
            };
        }
      },
      [
        getStagePoint,
        stageRef,
        selectedIds,
        getBlockById,
        zoom,
      ]
    );

  /**
   * �贋�井���醇������
   */
  const updateDragPointer =
    useCallback(
      (event) => {
        if (
          !dragStartRef.current
        ) {
          return;
        }

        const point =
          getStagePoint(
            event
          );

        if (!point) {
          return;
        }

        if (
          Math.hypot(
            point.x -
              dragStartRef.current.x,
            point.y -
              dragStartRef.current.y
          ) >= 3
        ) {
          dragMovedRef.current =
            true;
        }

        setDragPointer(
          point
        );

        setDragPointerRaw({
          clientX:
            event.clientX,

          clientY:
            event.clientY,
        });
      },
      [getStagePoint]
    );

  /**
   * 羝��ゆ���順�倶����
   */
  const clearDragPointer =
    useCallback(() => {
      setDragPointer(
        null
      );

      setDragPointerRaw(
        null
      );

      dragStartRef.current =
        null;

      dragMovedRef.current =
        false;

      pointerOffsetRef.current =
        {
          x: 0,
          y: 0,
        };

      dragVisualSizeRef.current =
        null;

      dragBlockSnapshotRef.current =
        null;

      dragGroupSnapshotRef.current =
        [];
    }, []);

  /**
   * draggingBlockId 可能是上一次拖拽留下的异步状态，不能单独作为放置依据。
   * 必须同时存在本次快照、起点，并且指针移动超过阈值。
   */
  const hasActiveDragGesture =
    useCallback(
      (blockId) => {
        const snapshot =
          dragBlockSnapshotRef.current;

        return Boolean(
          dragStartRef.current &&
          dragMovedRef.current &&
          snapshot &&
          String(snapshot.id) ===
            String(blockId)
        );
      },
      []
    );

  /**
   * 綵������遵�霡脂���
   */
  const dragOffset =
    useMemo(() => {
      if (
        !dragPointer ||
        !dragStartRef.current
      ) {
        return {
          x: 0,
          y: 0,
        };
      }

      return {
        x:
          dragPointer.x -
          dragStartRef.current.x,

        y:
          dragPointer.y -
          dragStartRef.current.y,
      };
    }, [dragPointer]);

  const currentPagePoint =
    useMemo(() => {
      return getPagePointFromStagePoint(
        dragPointer
      );
    }, [
      dragPointer,
      getPagePointFromStagePoint,
    ]);

  const isDraggingOutsidePage =
    useMemo(() => {
      if (
        draggingBlockId ==
        null
      ) {
        return false;
      }

      if (!dragPointer) {
        return false;
      }

      return !isInsidePageArea(
        currentPagePoint
      );
    }, [
      draggingBlockId,
      dragPointer,
      currentPagePoint,
      isInsidePageArea,
    ]);

  const isDraggingOutsideContent =
    isDraggingOutsidePage;

  const shouldHideInlineBlock =
    useCallback(
      (blockId) => {
        const normalizedBlockId =
          String(blockId);

        const draggingSelection =
          selectedIds.length > 1 &&
          selectedIds.some(
            (id) =>
              String(id) ===
              String(draggingBlockId)
          );

        return (
          draggingBlockId !=
            null &&
          (
            normalizedBlockId ===
              String(
                draggingBlockId
              ) ||
            (
              draggingSelection &&
              selectedIds.some(
                (id) =>
                  String(id) ===
                  normalizedBlockId
              )
            )
          ) &&
          isDraggingOutsidePage
        );
      },
      [
        draggingBlockId,
        isDraggingOutsidePage,
        selectedIds,
      ]
    );

  /**
   * 馹級�√��� floating 蘂�茹���
   */
  const draggingFloatingPreview =
    useMemo(() => {
      if (
        draggingBlockId ==
        null
      ) {
        return null;
      }

      if (
        !dragPointer ||
        !dragPointerRaw ||
        !stageRef?.current
      ) {
        return null;
      }

      const snapshotBlock =
        dragBlockSnapshotRef.current;

      const block =
        snapshotBlock &&
        String(
          snapshotBlock.id
        ) ===
          String(
            draggingBlockId
          )
          ? snapshotBlock
          : getBlockById?.(
              draggingBlockId
            );

      if (!block) {
        return null;
      }

      const convertsToStandardFloating =
        isDraggingOutsidePage &&
        Array.isArray(
          block.floatingLineFragments
        ) &&
        block.floatingLineFragments
          .length > 0;

      const previewBlock =
        convertsToStandardFloating
          ? {
              ...block,
              floatingMatchesInlineAppearance:
                false,
              floatingLineFragments:
                [],
            }
          : block;

      /**
       * floating 罔≦��菴��ョ�処�� Page ���
       * 篏睡�� draggingBackToPagePreview鐚�
       * �水���榊ｰ筝や肩蘂�茹�罅���
       */
      if (
        block.placement ===
          "floating" &&
        !isDraggingOutsidePage
      ) {
        return null;
      }

      const stageRect =
        stageRef.current
          .getBoundingClientRect();

      const primaryPreview = {
        block:
          previewBlock,

        width:
          convertsToStandardFloating
            ? getStandardFloatingWidth(
                block.text
              )
            : dragVisualSizeRef.current
                ?.width ??
              block.floatingWidth ??
              block.width ??
              180,

        height:
          convertsToStandardFloating
            ? 40
            : dragVisualSizeRef.current
                ?.height ??
              block.floatingHeight ??
              block.height ??
              40,

        x:
          dragPointerRaw.clientX -
          stageRect.left -
          (
            convertsToStandardFloating
              ? Math.min(
                  pointerOffsetRef.current
                    .x,
                  getStandardFloatingWidth(
                    block.text
                  ) - 20
                )
              : pointerOffsetRef.current
                  .x
          ),

        y:
          dragPointerRaw.clientY -
          stageRect.top -
          pointerOffsetRef.current
            .y,
      };

      const groupSnapshots =
        dragGroupSnapshotRef.current;

      const primarySnapshot =
        groupSnapshots.find(
          (item) =>
            String(item.id) ===
            String(draggingBlockId)
        );

      if (
        !primarySnapshot ||
        groupSnapshots.length <= 1
      ) {
        return primaryPreview;
      }

      if (isDraggingOutsidePage) {
        const compactItems =
          buildCompactFloatingGroupLayout(
            groupSnapshots,
            draggingBlockId,
            primaryPreview.x,
            primaryPreview.y
          );

        const compactPrimary =
          compactItems.find(
            (item) =>
              String(item.id) ===
              String(draggingBlockId)
          );

        const makeCompactPreview =
          (item) => ({
            block: {
              ...item.block,
              floatingMatchesInlineAppearance:
                false,
              floatingLineFragments: [],
            },
            width: item.layoutWidth,
            height: item.layoutHeight,
            x: item.x,
            y: item.y,
          });

        return {
          ...makeCompactPreview(
            compactPrimary
          ),
          groupPreviews:
            compactItems
              .filter(
                (item) =>
                  String(item.id) !==
                  String(draggingBlockId)
              )
              .map(
                makeCompactPreview
              ),
        };
      }

      const groupPreviews =
        groupSnapshots
          .filter(
            (item) =>
              String(item.id) !==
              String(draggingBlockId)
          )
          .map((item) => {
            return {
              block: item.block,
              width: item.width,
              height: item.height,
              x:
                primaryPreview.x +
                item.x -
                primarySnapshot.x,
              y:
                primaryPreview.y +
                item.y -
                primarySnapshot.y,
            };
          });

      return {
        ...primaryPreview,
        groupPreviews,
      };
    }, [
      draggingBlockId,
      dragPointer,
      dragPointerRaw,
      isDraggingOutsidePage,
      getBlockById,
      stageRef,
    ]);

  /**
   * floating 罔≦�������処�� Page �句��蘂�茹���
   */
  const draggingBackToPagePreview =
    useMemo(() => {
      if (
        draggingBlockId ==
        null
      ) {
        return null;
      }

      if (
        !dragPointer ||
        isDraggingOutsidePage
      ) {
        return null;
      }

      const snapshotBlock =
        dragBlockSnapshotRef.current;

      const block =
        snapshotBlock &&
        String(
          snapshotBlock.id
        ) ===
          String(
            draggingBlockId
          )
          ? snapshotBlock
          : getBlockById?.(
              draggingBlockId
            );

      if (
        !block ||
        block.placement !==
          "floating" ||
        !currentPagePoint
      ) {
        return null;
      }

      const width =
        Math.min(
          block.floatingWidth ??
            block.width ??
            180,
          CONTENT_WIDTH
        );

      /**
       * pointerOffsetRef 篆�絖������綛��靘�鐚�
       * 蕁級�∫�茹���������而�� Page ����鐚�
       * ��罩よ�����荀��や札 zoom��
       */
      const offsetX =
        pointerOffsetRef.current
          .x /
        zoom;

      const offsetY =
        pointerOffsetRef.current
          .y /
        zoom;

      const rawX =
        currentPagePoint.x -
        CONTENT_LEFT -
        offsetX;

      const rawY =
        currentPagePoint.y -
        CONTENT_TOP -
        offsetY;

      const clampedX =
        Math.max(
          0,
          Math.min(
            CONTENT_WIDTH -
              width,
            rawX
          )
        );

      const clampedY =
        Math.max(
          0,
          Math.min(
            Math.max(
              0,
              totalContentHeight -
                40
            ),
            rawY
          )
        );

      const primaryPreview = {
        block,
        width,
        x: clampedX,
        y: clampedY,
      };

      const groupSnapshots =
        dragGroupSnapshotRef.current;

      const primarySnapshot =
        groupSnapshots.find(
          (item) =>
            String(item.id) ===
            String(draggingBlockId)
        );

      if (
        !primarySnapshot ||
        groupSnapshots.length <= 1
      ) {
        return primaryPreview;
      }

      return {
        ...primaryPreview,
        groupPreviews:
          groupSnapshots
            .filter(
              (item) =>
                String(item.id) !==
                String(draggingBlockId)
            )
            .map((item) => ({
              block: item.block,
              width:
                Math.min(
                  item.width ||
                    item.block?.floatingWidth ||
                    item.block?.width ||
                    180,
                  CONTENT_WIDTH
                ),
              height:
                item.height ||
                item.block?.floatingHeight ||
                item.block?.height ||
                40,
              x:
                clampedX +
                (item.x -
                  primarySnapshot.x) /
                  zoom,
              y:
                clampedY +
                (item.y -
                  primarySnapshot.y) /
                  zoom,
            })),
      };
    }, [
      draggingBlockId,
      dragPointer,
      isDraggingOutsidePage,
      getBlockById,
      currentPagePoint,
      zoom,
      totalContentHeight,
    ]);

  /**
   * 絎���綏我��罔≦���丞舟��
   *
   * - inline ���亥�域�峨�阪��鐚�莉�減 floating
   * - floating ���域�峨�阪��腱糸����贋�医����
   * - floating �����処�臥ゝ���篋ょ� useCanvasDrop
   *   �������③�����ヤ�臀�攻莉��≫減 inline
   * - inline ���処�臥ゝ�√��腱糸���膸х鮫篏睡���� inline �����肢�
   */
  const handleFloatingDrop =
    useCallback(
      (
        event,
        blockId
      ) => {
        const stagePoint =
          getStagePoint(
            event
          );

        const pagePoint =
          getPagePoint(
            event
          );

        if (
          !stagePoint ||
          !pagePoint
        ) {
          clearDragPointer();

          return {
            type: "none",
          };
        }

        const stateBlock =
          getBlockById?.(
            blockId
          );

        const snapshotBlock =
          dragBlockSnapshotRef.current;

        const block =
          stateBlock ||
          (
            snapshotBlock &&
            String(
              snapshotBlock.id
            ) ===
              String(blockId)
              ? snapshotBlock
              : null
          );

        if (!block) {
          clearDragPointer();

          return {
            type: "none",
          };
        }

        const insidePage =
          isInsidePageArea(
            pagePoint
          );

        const isFloating =
          block.placement ===
          "floating";

        /**
         * �丞舟�亥�処�� Page 紊�鐚�
         * 莉��� floating ���贋�� floating ������
         */
        if (!insidePage) {
          if (
            !stageRef?.current
          ) {
            clearDragPointer();

            return {
              type: "none",
            };
          }

          const stageRect =
            stageRef.current
              .getBoundingClientRect();

          const nextX =
            event.clientX -
            stageRect.left -
            pointerOffsetRef.current
              .x;

          const nextY =
            event.clientY -
            stageRect.top -
            pointerOffsetRef.current
              .y;

          const hasCopiedLineAppearance =
            Array.isArray(
              block.floatingLineFragments
            ) &&
            block.floatingLineFragments
              .length > 0;

          const floatingWidth =
            hasCopiedLineAppearance
              ? getStandardFloatingWidth(
                  block.text
                )
              : block.floatingWidth ??
                block.width ??
                180;

          const rawFinalX =
            hasCopiedLineAppearance
              ? event.clientX -
                stageRect.left -
                Math.min(
                  pointerOffsetRef.current
                    .x,
                  floatingWidth - 20
                )
              : nextX;

          /**
           * 左侧工作区可能位于 Stage DOM 之外。
           * 直接保存负 floatingX 会让模块实际存在、但落到不可见区域。
           * 所有模块统一限制在 Stage 可见左边界内。
           */
          const finalX =
            Math.max(
              8,
              rawFinalX
            );

          const moved =
            block.floatingX !==
              finalX ||
            block.floatingY !==
              nextY;

          const groupSnapshots =
            dragGroupSnapshotRef.current;

          const primarySnapshot =
            groupSnapshots.find(
              (item) =>
                String(item.id) ===
                String(blockId)
            );

          if (
            primarySnapshot &&
            groupSnapshots.length > 1
          ) {
            const compactItems =
              buildCompactFloatingGroupLayout(
                groupSnapshots,
                blockId,
                finalX,
                nextY
              );

            const groupUpdates =
              compactItems.map(
                (item) => ({
                  blockId: item.id,
                  updates: {
                    placement: "floating",
                    ...(item.block
                      ?.isDuplicatedCopy
                      ? {
                          hideResizeHandle:
                            false,
                          hideFloatingResizeHandle:
                            false,
                        }
                      : {}),
                    floatingX: item.x,
                    floatingY: item.y,
                    floatingWidth:
                      item.layoutWidth,
                    floatingMatchesInlineAppearance:
                      false,
                    floatingLineFragments:
                      [],
                    floatingHeight: null,
                    height:
                      item.layoutHeight,
                  },
                })
              );

            /** 一次状态更新完成整组转换，因此撤销也只需要一次。 */
            updateBlockPlacement?.(
              groupUpdates
            );

            clearDragPointer();

            return {
              type: "group-to-floating",
              moved: true,
              groupIds:
                groupSnapshots.map(
                  (item) => item.id
                ),
            };
          }

          updateBlockPlacement?.(
            blockId,
            {
              placement:
                "floating",

              ...(block.isDuplicatedCopy
                ? {
                    hideResizeHandle:
                      false,
                    hideFloatingResizeHandle:
                      false,
                  }
                : {}),

              floatingX:
                finalX,

              floatingY:
                nextY,

              floatingWidth:
                floatingWidth,

              ...(hasCopiedLineAppearance
                ? {
                    floatingMatchesInlineAppearance:
                      false,
                    floatingLineFragments:
                      [],
                    floatingHeight:
                      null,
                    height: 40,
                  }
                : {}),
            }
          );

          clearDragPointer();

          return {
            type:
              isFloating
                ? "floating-move"
                : "to-floating",

            moved,
          };
        }

        /**
         * floating �����処�� Page鐚�
         *
         * 筝������������� updateBlockPlacement鐚�
         * ��������劫� placement鐚��贋��羈�莚���③�����ヤ�臀��
         * 菴����巡� useCanvasDrop ��腱糸���倶������腴�篋���
         *
         * 篋ょ� handleCanvasMouseUp鐚�
         * 1. �上�亥���� editing section
         * 2. �号�����篏�臀��膊� insertIndex
         * 3. 絨�罔≦��莉��≫減 inline
         * 4. 羝��� floating ����
         * 5. ���ュ�医�綺���絖�羌�篏�臀�
         */
        if (
          insidePage &&
          isFloating
        ) {
          handleCanvasMouseUp?.(
            event
          );

          clearDragPointer();

          return {
            type:
              "to-inline",
          };
        }

        /**
         * 綏我�� inline 罔≦�����処�� Page ��������
         */
        if (
          insidePage &&
          !isFloating
        ) {
          handleCanvasMouseUp?.(
            event
          );

          clearDragPointer();

          return {
            type:
              "inline-move",
          };
        }

        clearDragPointer();

        return {
          type: "none",
        };
      },
      [
        getStagePoint,
        getPagePoint,
        getBlockById,
        isInsidePageArea,
        updateBlockPlacement,
        handleCanvasMouseUp,
        clearDragPointer,
        stageRef,
      ]
    );

  /**
   * �狗������ floating 罔≦����
   */
  const floatingBlocks =
    useMemo(() => {
      const result = [];

      for (
        const section of
        sectionLayouts || []
      ) {
        for (
          const block of
          section.blocks || []
        ) {
          if (
            block.placement ===
            "floating"
          ) {
            result.push(
              block
            );
          }
        }
      }

      return result;
    }, [sectionLayouts]);

  return {
    beginDragTracking,
    dragOffset,
    updateDragPointer,
    clearDragPointer,
    hasActiveDragGesture,

    isInsideContentArea,
    isDraggingOutsideContent,
    isDraggingOutsidePage,
    shouldHideInlineBlock,

    draggingFloatingPreview,
    draggingBackToPagePreview,

    handleFloatingDrop,
    floatingBlocks,
  };
}
