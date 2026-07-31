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

export function useFloatingBlocks({
  zoom,
  stageRef,
  pageRef,
  totalContentHeight,
  sectionLayouts,
  draggingBlockId,
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
        block
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

        dragBlockSnapshotRef.current =
          block
            ? {
                ...block,
                floatingLineFragments:
                  Array.isArray(
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

        const sourceElement =
          event.target?.closest?.(
            "[data-semantic-block-id], [data-block-root='true']"
          );

        const sourceRect =
          sourceElement
            ?.getBoundingClientRect?.();

        dragVisualSizeRef.current =
          sourceRect &&
          sourceRect.width > 0 &&
          sourceRect.height > 0
            ? {
                width:
                  sourceRect.width,
                height:
                  sourceRect.height,
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

        const stageRect =
          stageRef.current
            .getBoundingClientRect();

        if (
          block?.placement ===
          "floating"
        ) {
          const blockLeft =
            block.floatingX ??
            0;

          const blockTop =
            block.floatingY ??
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
           * inline 罔≦�����咲ゝ�∽�駈�
           * 莅��茹�罅��後�藜���篆������九�霡祉��
           */
          pointerOffsetRef.current =
            {
              x: 24,
              y: 20,
            };
        }
      },
      [
        getStagePoint,
        stageRef,
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

      pointerOffsetRef.current =
        {
          x: 0,
          y: 0,
        };

      dragVisualSizeRef.current =
        null;

      dragBlockSnapshotRef.current =
        null;
    }, []);

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
        return (
          draggingBlockId !=
            null &&
          String(blockId) ===
            String(
              draggingBlockId
            ) &&
          isDraggingOutsidePage
        );
      },
      [
        draggingBlockId,
        isDraggingOutsidePage,
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

      return {
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

      return {
        block,
        width,
        x: clampedX,
        y: clampedY,
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

        const block =
          getBlockById?.(
            blockId
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

          const finalX =
            hasCopiedLineAppearance
              ? event.clientX -
                stageRect.left -
                Math.min(
                  pointerOffsetRef.current
                    .x,
                  floatingWidth - 20
                )
              : nextX;

          const moved =
            block.floatingX !==
              finalX ||
            block.floatingY !==
              nextY;

          updateBlockPlacement?.(
            blockId,
            {
              placement:
                "floating",

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
