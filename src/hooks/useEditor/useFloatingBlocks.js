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

      const block =
        getBlockById?.(
          draggingBlockId
        );

      if (!block) {
        return null;
      }

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
        block,

        width:
          block.floatingWidth ??
          block.width ??
          180,

        x:
          dragPointerRaw.clientX -
          stageRect.left -
          pointerOffsetRef.current
            .x,

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

      const block =
        getBlockById?.(
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

          const moved =
            block.floatingX !==
              nextX ||
            block.floatingY !==
              nextY;

          updateBlockPlacement?.(
            blockId,
            {
              placement:
                "floating",

              floatingX:
                nextX,

              floatingY:
                nextY,

              floatingWidth:
                block.floatingWidth ??
                block.width ??
                180,
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