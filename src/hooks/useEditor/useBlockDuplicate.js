import {
  useCallback,
} from "react";

import {
  BLOCK_WIDTH,
} from "../../constants";

import {
  cloneSections,
  findBlockLocation,
  normalizeSections,
} from "./sectionHelpers";

/**
 * 统一把 ID 转为字符串进行比较。
 */
function normalizeId(
  value
) {
  return value == null
    ? ""
    : String(value);
}

/**
 * 转换为可靠数字。
 */
function toFiniteNumber(
  value,
  fallback = 0
) {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : fallback;
}

/**
 * 深度复制模块数据。
 *
 * 这样副本不会和原模块共享：
 * - completedBlocks
 * - appearance
 * - style
 * - metadata
 * - 其他嵌套对象或数组
 *
 * 即使以后单独修改副本，也不会意外修改原模块。
 */
function cloneBlockData(
  block
) {
  if (!block) {
    return null;
  }

  if (
    typeof structuredClone ===
    "function"
  ) {
    try {
      return structuredClone(
        block
      );
    } catch {
      // 某些对象不能 structuredClone，
      // 继续使用递归复制。
    }
  }

  if (
    Array.isArray(block)
  ) {
    return block.map(
      cloneBlockData
    );
  }

  if (
    typeof block ===
      "object" &&
    block !== null
  ) {
    const result = {};

    Object.entries(
      block
    ).forEach(
      ([key, value]) => {
        result[key] =
          cloneBlockData(
            value
          );
      }
    );

    return result;
  }

  return block;
}

/**
 * 找到 sectionLayouts 中属于指定模块的全部 fragment。
 *
 * 同时兼容：
 * - localFragments
 * - fragments
 * - globalFragments
 */
function collectBlockFragments(
  sectionLayouts,
  blockId
) {
  const targetId =
    normalizeId(blockId);

  if (!targetId) {
    return [];
  }

  const result = [];

  (
    sectionLayouts || []
  ).forEach((section) => {
    /**
     * buildSectionLayouts 保存的是段内局部坐标。
     * 复制时需要把 section.top 加回去，得到相对于整块
     * content 的坐标，否则第二段以后的副本会跑到错误位置。
     */
    const localFragments =
      Array.isArray(
        section?.localFragments
      )
        ? section.localFragments
        : Array.isArray(
              section?.fragments
            )
          ? section.fragments
          : null;

    if (localFragments) {
      const sectionTop =
        toFiniteNumber(
          section?.top
        );

      localFragments.forEach(
        (fragment) => {
          if (
            normalizeId(
              fragment?.blockId
            ) !== targetId
          ) {
            return;
          }

          result.push({
            ...fragment,
            y:
              sectionTop +
              toFiniteNumber(
                fragment?.y
              ),
          });
        }
      );

      return;
    }

    /**
     * 兼容旧布局数据：只有没有 localFragments 时才读取
     * globalFragments，避免同一模块的局部/全局坐标被重复合并。
     */
    (
      section?.globalFragments ||
      []
    ).forEach((fragment) => {
      if (
        normalizeId(
          fragment?.blockId
        ) === targetId
      ) {
        result.push(fragment);
      }
    });
  });

  return result;
}

/**
 * 将同一模块的多个 fragment 合并成一个整体区域。
 *
 * 用于支持：
 * - 普通单行模块
 * - 多行模块
 * - 跨行 inline 模块
 */
function buildFragmentBounds(
  fragments
) {
  if (
    !Array.isArray(
      fragments
    ) ||
    fragments.length === 0
  ) {
    return null;
  }

  let left =
    Infinity;

  let top =
    Infinity;

  let right =
    -Infinity;

  let bottom =
    -Infinity;

  fragments.forEach(
    (fragment) => {
      const x =
        toFiniteNumber(
          fragment?.x
        );

      const y =
        toFiniteNumber(
          fragment?.y
        );

      const width =
        Math.max(
          0,
          toFiniteNumber(
            fragment?.width
          )
        );

      const height =
        Math.max(
          0,
          toFiniteNumber(
            fragment?.height
          )
        );

      left =
        Math.min(
          left,
          x
        );

      top =
        Math.min(
          top,
          y
        );

      right =
        Math.max(
          right,
          x + width
        );

      bottom =
        Math.max(
          bottom,
          y + height
        );
    }
  );

  if (
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(right) ||
    !Number.isFinite(bottom)
  ) {
    return null;
  }

  return {
    x: left,
    y: top,

    width:
      Math.max(
        0,
        right - left
      ),

    height:
      Math.max(
        0,
        bottom - top
      ),

    right,
    bottom,
  };
}

/**
 * 读取 inline 模块每一行实际显示的文字和矩形。
 *
 * 跨行 inline 元素使用 box-decoration-break: clone，因此不能只保存
 * 一个总包围盒；否则 floating 副本会变成一整块大文本框。
 */
function collectDomLineFragments(
  element,
  overallLeft,
  overallTop
) {
  const contentElement =
    element?.querySelector?.(
      "[data-semantic-block-content='true']"
    ) || element;

  if (
    !contentElement ||
    typeof document ===
      "undefined"
  ) {
    return [];
  }

  const walker =
    document.createTreeWalker(
      contentElement,
      NodeFilter.SHOW_TEXT
    );

  const lines = [];
  let textNode =
    walker.nextNode();

  while (textNode) {
    const value =
      String(
        textNode.nodeValue ??
          ""
      );

    for (
      let index = 0;
      index < value.length;
      index += 1
    ) {
      const range =
        document.createRange();

      range.setStart(
        textNode,
        index
      );
      range.setEnd(
        textNode,
        index + 1
      );

      const rect =
        range.getClientRects?.()[0] ||
        range.getBoundingClientRect?.();

      if (
        !rect ||
        rect.height <= 0
      ) {
        continue;
      }

      let line =
        lines.find(
          (candidate) =>
            Math.abs(
              candidate.top -
                rect.top
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

      line.text +=
        value[index];
      line.left =
        Math.min(
          line.left,
          rect.left
        );
      line.right =
        Math.max(
          line.right,
          rect.right
        );
      line.bottom =
        Math.max(
          line.bottom,
          rect.bottom
        );
    }

    textNode =
      walker.nextNode();
  }

  return lines
    .sort(
      (a, b) =>
        a.top - b.top
    )
    .map((line) => ({
      text: line.text,
      x:
        line.left -
        overallLeft -
        8,
      y:
        line.top -
        overallTop -
        2,
      width:
        Math.max(
          1,
          line.right -
            line.left +
            16
        ),
      height:
        Math.max(
          1,
          line.bottom -
            line.top +
            4
        ),
    }));
}

/**
 * 获取源模块应该被复制的准确宽度。
 *
 * 规则：
 *
 * 1. floating 模块：
 *    优先完整保留 floatingWidth。
 *
 * 2. inline 模块：
 *    优先使用实时布局中的视觉宽度。
 *
 * 3. 只有实时布局不存在时，
 *    才使用源模块保存的 width。
 *
 * 4. 副本再次被复制时，
 *    会继续使用第一次副本保存的 floatingWidth，
 *    因此不会越复制越宽或越窄。
 */
function getSourceVisualWidth({
  sourceBlock,
  sourceDomBounds,
  sourceBounds,
  zoom,
}) {
  if (
    sourceBlock?.placement ===
      "floating" &&
    Number.isFinite(
      Number(
        sourceBlock
          ?.floatingWidth
      )
    )
  ) {
    return Math.max(
      1,
      Number(
        sourceBlock
          .floatingWidth
      )
    );
  }

  /**
   * inline 模块优先使用浏览器实际渲染后的边框宽度。
   * 不能再使用旧布局的预估宽度，否则文字较短时副本会偏大。
   */
  if (
    sourceDomBounds &&
    Number.isFinite(
      sourceDomBounds.width
    ) &&
    sourceDomBounds.width > 0
  ) {
    return Math.max(
      1,
      sourceDomBounds.width
    );
  }

  if (
    sourceBounds &&
    Number.isFinite(
      sourceBounds.width
    ) &&
    sourceBounds.width > 0
  ) {
    return Math.max(
      1,
      sourceBounds.width *
        zoom
    );
  }

  if (
    Number.isFinite(
      Number(
        sourceBlock
          ?.floatingWidth
      )
    )
  ) {
    return Math.max(
      1,
      Number(
        sourceBlock
          .floatingWidth
      )
    );
  }

  if (
    Number.isFinite(
      Number(
        sourceBlock?.width
      )
    )
  ) {
    return Math.max(
      1,
      Number(
        sourceBlock.width
      )
    );
  }

  return BLOCK_WIDTH;
}

/**
 * 模块复制 Hook。
 *
 * 统一规则：
 *
 * 1. 无论源模块是 inline 还是 floating，
 *    新副本初始状态始终是 floating。
 *
 * 2. Cmd/Ctrl + V：
 *    副本出现在源模块右下方。
 *
 * 3. Option + Shift + 拖动：
 *    副本出现在鼠标附近，并立即进入拖拽。
 *
 * 4. 副本拖回正文时，
 *    再由现有 floating -> inline 逻辑处理。
 *
 * 5. 连续复制多少次，
 *    模块的文字、宽度、样式和其他数据都保持一致。
 */
export function useBlockDuplicate({
  sections = [],
  sectionLayouts = [],

  stageRef,
  pageRef,
  contentRef,

  zoom = 1,

  setSections,
  selectedIds = [],
  setSelectedIds,
  setDraggingBlockId,

  nextBlockIdRef,

  getBlockById,

  pushHistorySnapshot,
  createEditingSectionFn,
}) {
  const normalizedZoom =
    Number.isFinite(
      Number(zoom)
    ) &&
    Number(zoom) > 0
      ? Number(zoom)
      : 1;

  /**
   * 获取源模块的实时布局区域。
   */
  const getSourceLayoutBounds =
    useCallback(
      (blockId) => {
        const fragments =
          collectBlockFragments(
            sectionLayouts,
            blockId
          );

        return buildFragmentBounds(
          fragments
        );
      },
      [sectionLayouts]
    );

  /**
   * 直接读取 inline 模块在浏览器中的真实位置。
   *
   * 这是复制定位的第一优先级。它不依赖 sectionLayouts，因而不会
   * 受到段落局部坐标、页面缩放或重新排版时序的影响。跨行模块会
   * 合并全部 ClientRect，得到模块当前真实可见区域。
   */
  const getSourceDomBounds =
    useCallback(
      (blockId) => {
        const stageElement =
          stageRef?.current;

        const pageElement =
          pageRef?.current;

        const stageRect =
          stageElement
            ?.getBoundingClientRect();

        if (
          !stageRect ||
          !pageElement
        ) {
          return null;
        }

        const targetId =
          normalizeId(blockId);

        const elements =
          Array.from(
            pageElement.querySelectorAll(
              "[data-semantic-block-id]"
            )
          ).filter(
            (element) =>
              normalizeId(
                element.getAttribute(
                  "data-semantic-block-id"
                )
              ) === targetId
          );

        const rects = [];

        elements.forEach(
          (element) => {
            const clientRects =
              Array.from(
                element.getClientRects?.() ||
                  []
              );

            if (
              clientRects.length > 0
            ) {
              rects.push(
                ...clientRects
              );
            } else {
              const rect =
                element.getBoundingClientRect?.();

              if (rect) {
                rects.push(rect);
              }
            }
          }
        );

        const visibleRects =
          rects.filter(
            (rect) =>
              rect.width > 0 &&
              rect.height > 0
          );

        if (
          visibleRects.length === 0
        ) {
          return null;
        }

        const left =
          Math.min(
            ...visibleRects.map(
              (rect) => rect.left
            )
          );

        const top =
          Math.min(
            ...visibleRects.map(
              (rect) => rect.top
            )
          );

        const right =
          Math.max(
            ...visibleRects.map(
              (rect) => rect.right
            )
          );

        const bottom =
          Math.max(
            ...visibleRects.map(
              (rect) => rect.bottom
            )
          );

        return {
          x:
            left -
            stageRect.left,

          y:
            top -
            stageRect.top,

          right:
            right -
            stageRect.left,

          bottom:
            bottom -
            stageRect.top,

          width:
            right - left,

          height:
            bottom - top,

          lineFragments:
            elements.length === 1
              ? collectDomLineFragments(
                  elements[0],
                  left,
                  top
                )
              : [],
        };
      },
      [
        stageRef,
        pageRef,
      ]
    );

  /**
   * 将 content 内部的布局坐标转换成
   * 相对于 Stage 的 floating 坐标。
   *
   * 这里只使用 DOM 来转换坐标系，
   * 不再通过 DOM 查询具体模块。
   */
  const convertContentPositionToStage =
    useCallback(
      (
        contentX,
        contentY
      ) => {
        const stageElement =
          stageRef?.current;

        const contentElement =
          contentRef?.current;

        const stageRect =
          stageElement
            ?.getBoundingClientRect();

        const contentRect =
          contentElement
            ?.getBoundingClientRect();

        if (
          stageRect &&
          contentRect
        ) {
          return {
            x:
              contentRect.left -
              stageRect.left +
              contentX *
                normalizedZoom,

            y:
              contentRect.top -
              stageRect.top +
              contentY *
                normalizedZoom,
          };
        }

        /**
         * contentRef 暂时不存在时，
         * 使用布局坐标作为安全回退。
         */
        return {
          x:
            contentX *
            normalizedZoom,

          y:
            contentY *
            normalizedZoom,
        };
      },
      [
        stageRef,
        contentRef,
        normalizedZoom,
      ]
    );

  /**
   * 计算副本在 Stage 中的初始 floating 坐标。
   */
  const getSourceStagePosition =
    useCallback(
      (
        sourceBlock,
        sourceBounds,
        options = {}
      ) => {
        const {
          clientX,
          clientY,

          offsetX = 24,
          offsetY = 24,

          index = 0,
          domBounds = null,
        } = options;

        const cascadeX =
          offsetX;

        const cascadeY =
          offsetY;

        const stageElement =
          stageRef?.current;

        const stageRect =
          stageElement
            ?.getBoundingClientRect();

        /**
         * Option + Shift 拖拽复制：
         * 副本直接从鼠标附近开始。
         */
        if (
          stageRect &&
          Number.isFinite(
            Number(clientX)
          ) &&
          Number.isFinite(
            Number(clientY)
          )
        ) {
          return {
            x:
              Number(clientX) -
              stageRect.left -
              24,

            y:
              Number(clientY) -
              stageRect.top -
              20,
          };
        }

        /**
         * floating 源模块：
         * 在原 floating 坐标右下方创建。
         */
        if (
          sourceBlock
            ?.placement ===
          "floating"
        ) {
          return {
            x:
              toFiniteNumber(
                sourceBlock
                  .floatingX,
                40
              ) +
              cascadeX,

            y:
              toFiniteNumber(
                sourceBlock
                  .floatingY,
                40
              ) +
              cascadeY,
          };
        }

        /**
         * inline 模块优先使用屏幕上的真实位置。副本放在原模块右侧；
         * 如果右侧空间不足，后面的画布边界约束会把它移到页面内。
         */
        if (domBounds) {
          return {
            x:
              domBounds.x +
              cascadeX,

            y:
              domBounds.y +
              cascadeY,
          };
        }

        /**
         * inline 源模块：
         * 使用 sectionLayouts 的实时位置，
         * 在其右下方创建 floating 副本。
         */
        if (sourceBounds) {
          const stagePosition =
            convertContentPositionToStage(
              sourceBounds.x,
              sourceBounds.y
            );

          return {
            x:
              stagePosition.x +
              cascadeX,

            y:
              stagePosition.y +
              cascadeY,
          };
        }

        /**
         * 极端情况下没有找到布局时，
         * 尽量放在白色内容区域附近，
         * 而不是灰色区域的固定左上角。
         */
        const contentElement =
          contentRef?.current;

        const contentRect =
          contentElement
            ?.getBoundingClientRect();

        if (
          stageRect &&
          contentRect
        ) {
          return {
            x:
              contentRect.left -
              stageRect.left +
              cascadeX,

            y:
              contentRect.top -
              stageRect.top +
              cascadeY,
          };
        }

        /**
         * 正常情况下 stageRef 和 pageRef 都已经由 App 绑定。
         * 如果页面尚未挂载，不再退回左上角灰色区域的固定坐标，
         * 而是返回空值，让本次粘贴安全取消。
         */
        return null;
      },
      [
        stageRef,
        contentRef,
        convertContentPositionToStage,
      ]
    );

  /**
   * floating 模块虽然不进入 inline 文档流，但刚粘贴时必须完整
   * 出现在白色页面内。这里使用真实 DOM 矩形约束位置，因此缩放后
   * 仍然准确，之后用户依然可以把它拖到灰色区域或拖回 inline。
   */
  const clampPositionInsidePage =
    useCallback(
      (
        position,
        floatingWidth
      ) => {
        if (!position) {
          return null;
        }

        const stageRect =
          stageRef?.current
            ?.getBoundingClientRect();

        const pageRect =
          pageRef?.current
            ?.getBoundingClientRect();

        if (
          !stageRect ||
          !pageRect
        ) {
          return position;
        }

        const margin = 12;

        const pageLeft =
          pageRect.left -
          stageRect.left;

        const pageTop =
          pageRect.top -
          stageRect.top;

        const pageRight =
          pageRect.right -
          stageRect.left;

        const pageBottom =
          pageRect.bottom -
          stageRect.top;

        const width =
          Math.max(
            1,
            toFiniteNumber(
              floatingWidth,
              BLOCK_WIDTH
            )
          );

        const minX =
          pageLeft + margin;

        const maxX =
          Math.max(
            minX,
            pageRight -
              margin -
              width
          );

        const minY =
          pageTop + margin;

        /**
         * 40px 是 floating 模块的最小高度。这里保证粘贴时至少
         * 整个模块头部可见，实际内容较高时仍可正常向下展开。
         */
        const maxY =
          Math.max(
            minY,
            pageBottom -
              margin -
              40
          );

        return {
          x:
            Math.min(
              maxX,
              Math.max(
                minX,
                toFiniteNumber(
                  position?.x,
                  minX
                )
              )
            ),

          y:
            Math.min(
              maxY,
              Math.max(
                minY,
                toFiniteNumber(
                  position?.y,
                  minY
                )
              )
            ),
        };
      },
      [
        stageRef,
        pageRef,
      ]
    );

  /**
   * 找到保存 floating 副本的 section。
   *
   * 优先：
   * 1. 原模块所在 section
   * 2. 第一个 editing section
   * 3. 第一个非 completed section
   */
  const getTargetSectionId =
    useCallback(
      (
        sourceBlockId
      ) => {
        const sourceLocation =
          findBlockLocation(
            sections,
            sourceBlockId
          );

        if (
          sourceLocation
            ?.sectionId != null
        ) {
          return sourceLocation
            .sectionId;
        }

        const editingSection =
          sections.find(
            (section) =>
              section?.mode ===
              "editing"
          );

        if (
          editingSection?.id !=
          null
        ) {
          return editingSection.id;
        }

        const activeSection =
          sections.find(
            (section) =>
              section?.mode !==
              "completed"
          );

        return (
          activeSection?.id ??
          sections[0]?.id ??
          null
        );
      },
      [sections]
    );

  /**
   * 复制一个或多个模块。
   */
  const duplicateBlocks =
    useCallback(
      (
        blockIds,
        options = {}
      ) => {
        const normalizedIds =
          Array.from(
            new Set(
              (
                Array.isArray(
                  blockIds
                )
                  ? blockIds
                  : [blockIds]
              )
                .filter(
                  (id) =>
                    id !== null &&
                    id !== undefined
                )
                .map(
                  normalizeId
                )
            )
          );

        if (
          normalizedIds.length ===
            0 ||
          !nextBlockIdRef
        ) {
          return {
            blocks: [],
            ids: [],
            primaryBlock:
              null,
            primaryId: null,
          };
        }

        const {
          clientX,
          clientY,

          offsetX = 24,
          offsetY = 24,

          startDragging =
            false,
        } = options;

        const copies = [];

        /**
         * 先锁定整组源模块的共同参考点。随后所有副本只做同一个
         * 平移，不再按 index 级联错开，因此多选复制会完整保留
         * 原来的横向、纵向和跨行相对位置。
         */
        const primarySourceId =
          normalizedIds[0];

        const primarySourceBlock =
          getBlockById?.(
            primarySourceId
          );

        const primarySourceBounds =
          getSourceLayoutBounds(
            primarySourceId
          );

        const primarySourceDomBounds =
          primarySourceBlock
            ?.placement ===
            "floating"
            ? null
            : getSourceDomBounds(
                primarySourceId
              );

        const primaryBasePosition =
          primarySourceBlock
            ? getSourceStagePosition(
                primarySourceBlock,
                primarySourceBounds,
                {
                  offsetX: 0,
                  offsetY: 0,
                  domBounds:
                    primarySourceDomBounds,
                }
              )
            : null;

        const stageRect =
          stageRef?.current
            ?.getBoundingClientRect();

        const pointerPrimaryPosition =
          stageRect &&
          Number.isFinite(
            Number(clientX)
          ) &&
          Number.isFinite(
            Number(clientY)
          )
            ? {
                x:
                  Number(clientX) -
                  stageRect.left -
                  24,
                y:
                  Number(clientY) -
                  stageRect.top -
                  20,
              }
            : null;

        normalizedIds.forEach(
          (
            sourceId,
            index
          ) => {
            const sourceBlock =
              getBlockById?.(
                sourceId
              );

            if (!sourceBlock) {
              return;
            }

            const targetSectionId =
              getTargetSectionId(
                sourceId
              );

            if (
              targetSectionId ==
              null
            ) {
              return;
            }

            const sourceBounds =
              getSourceLayoutBounds(
                sourceId
              );

            const sourceDomBounds =
              sourceBlock
                .placement ===
              "floating"
                ? null
                : getSourceDomBounds(
                    sourceId
                  );

            const sourceWidth =
              getSourceVisualWidth({
                sourceBlock,
                sourceDomBounds,
                sourceBounds,
                zoom:
                  normalizedZoom,
              });

            const sourceBasePosition =
              getSourceStagePosition(
                sourceBlock,
                sourceBounds,
                {
                  offsetX: 0,
                  offsetY: 0,
                  domBounds:
                    sourceDomBounds,
                }
              );

            const position =
              sourceBasePosition &&
              pointerPrimaryPosition &&
              primaryBasePosition
                ? {
                    x:
                      pointerPrimaryPosition.x +
                      sourceBasePosition.x -
                      primaryBasePosition.x,
                    y:
                      pointerPrimaryPosition.y +
                      sourceBasePosition.y -
                      primaryBasePosition.y,
                  }
                : sourceBasePosition
                  ? {
                      x:
                        sourceBasePosition.x +
                        offsetX,
                      y:
                        sourceBasePosition.y +
                        offsetY,
                    }
                  : null;

            if (!position) {
              console.warn(
                "[useBlockDuplicate] 页面尚未完成挂载，已取消本次模块粘贴。"
              );

              return;
            }

            const newId =
              nextBlockIdRef
                .current++;

            /**
             * 完整深度复制原模块。
             *
             * 文字、类型、颜色、填充、边框、
             * 自定义样式和嵌套数据全部保留。
             */
            const copiedBlock =
              cloneBlockData(
                sourceBlock
              );

            if (!copiedBlock) {
              return;
            }

            copiedBlock.id =
              newId;

            /**
             * 复制模块当前显示的内容，而不是最初的模板标签。
             * AI 生成后 label 仍可能保留“论点 / 证据”等旧文字，
             * 因此副本必须明确保存源模块此刻的 text。
             */
            copiedBlock.text =
              String(
                sourceBlock.text ??
                  sourceBlock.label ??
                  ""
              );

            /**
             * 无论源模块是不是 inline，
             * 副本刚创建时都必须是 floating。
             */
            copiedBlock.placement =
              "floating";

            copiedBlock.floatingX =
              position.x;

            copiedBlock.floatingY =
              position.y;

            /**
             * 同时保存一致的 width 和 floatingWidth。
             *
             * 这样从：
             * 原模块 -> 副本 -> 再次复制
             *
             * 无论复制多少次，宽度都不会变化。
             */
            copiedBlock.floatingWidth =
              sourceWidth;

            copiedBlock.width =
              sourceWidth;

            /**
             * 从 inline 复制出来的 floating 模块继续采用 inline 的
             * 字号、内边距和行高，并记录真实高度。这样框和文字都与
             * 原模块保持相同视觉比例，而不是套用较大的 floating
             * 默认样式。
             */
            if (
              sourceBlock.placement !==
              "floating"
            ) {
              /**
               * DOM 尺寸在复制发生的这一帧可能暂时不可用，但 inline
               * 副本仍必须保持原模块外观，不能退回普通文本框样式。
               */
              copiedBlock.floatingMatchesInlineAppearance =
                true;

              copiedBlock.floatingLineFragments =
                Array.isArray(
                  sourceDomBounds
                    ?.lineFragments
                )
                  ? cloneBlockData(
                      sourceDomBounds
                        .lineFragments
                    )
                  : [];

              copiedBlock.floatingHeight =
                Math.max(
                  1,
                  sourceDomBounds
                    ?.height ??
                    (
                      sourceBounds
                        ?.height != null
                        ? sourceBounds.height *
                          normalizedZoom
                        : sourceBlock.height ??
                          28
                    )
                );

              copiedBlock.height =
                copiedBlock.floatingHeight;

            }

            /**
             * 不继承旧完成组关系。
             */
            copiedBlock.completionGroupId =
              null;

            /**
             * 清除只属于当前交互过程的状态。
             */
            copiedBlock.isEditing =
              false;

            copiedBlock.isSelected =
              false;

            copiedBlock.isDragging =
              false;

            /** 副本不显示右下角的长度/宽度拉伸手柄。 */
            copiedBlock.hideResizeHandle =
              true;

            copiedBlock.hideFloatingResizeHandle =
              true;

            copies.push({
              block:
                copiedBlock,

              sectionId:
                targetSectionId,
            });
          }
        );

        if (
          copies.length === 0
        ) {
          return {
            blocks: [],
            ids: [],
            primaryBlock:
              null,
            primaryId: null,
          };
        }

        /**
         * 用同一位移把整组副本约束到页面内。逐个 clamp 会破坏相对
         * 位置，并在下方已有模块时造成首拖落点偏移。
         */
        const pageRect =
          pageRef?.current
            ?.getBoundingClientRect();

        if (
          stageRect &&
          pageRect
        ) {
          const margin = 12;
          const minX =
            pageRect.left -
            stageRect.left +
            margin;
          const minY =
            pageRect.top -
            stageRect.top +
            margin;
          const maxRight =
            pageRect.right -
            stageRect.left -
            margin;
          const maxBottom =
            pageRect.bottom -
            stageRect.top -
            margin;

          const groupLeft =
            Math.min(
              ...copies.map(
                ({ block }) =>
                  block.floatingX
              )
            );
          const groupTop =
            Math.min(
              ...copies.map(
                ({ block }) =>
                  block.floatingY
              )
            );
          const groupRight =
            Math.max(
              ...copies.map(
                ({ block }) =>
                  block.floatingX +
                  (block.floatingWidth || 1)
              )
            );
          const groupBottom =
            Math.max(
              ...copies.map(
                ({ block }) =>
                  block.floatingY +
                  (block.floatingHeight ||
                    block.height ||
                    40)
              )
            );

          let translateX = 0;
          let translateY = 0;

          if (groupLeft < minX) {
            translateX =
              minX - groupLeft;
          } else if (
            groupRight > maxRight
          ) {
            translateX =
              maxRight - groupRight;
          }

          if (groupTop < minY) {
            translateY =
              minY - groupTop;
          } else if (
            groupBottom > maxBottom
          ) {
            translateY =
              maxBottom - groupBottom;
          }

          copies.forEach(
            ({ block }) => {
              block.floatingX +=
                translateX;
              block.floatingY +=
                translateY;
            }
          );
        }

        setSections?.(
          (
            previousSections
          ) => {
            const nextSections =
              cloneSections(
                previousSections
              );

            pushHistorySnapshot?.(
              previousSections
            );

            copies.forEach(
              (copy) => {
                const targetSection =
                  nextSections.find(
                    (section) =>
                      normalizeId(
                        section.id
                      ) ===
                      normalizeId(
                        copy.sectionId
                      )
                  ) ||
                  nextSections.find(
                    (section) =>
                      section?.mode ===
                      "editing"
                  ) ||
                  nextSections.find(
                    (section) =>
                      section?.mode !==
                      "completed"
                  ) ||
                  nextSections[0];

                if (
                  !targetSection
                ) {
                  return;
                }

                if (
                  !Array.isArray(
                    targetSection
                      .blocks
                  )
                ) {
                  targetSection.blocks =
                    [];
                }

                targetSection.blocks.push(
                  copy.block
                );
              }
            );

            return normalizeSections(
              nextSections,
              createEditingSectionFn
            );
          }
        );

        const copiedBlocks =
          copies.map(
            (copy) =>
              copy.block
          );

        const copiedIds =
          copiedBlocks.map(
            (block) =>
              block.id
          );

        setSelectedIds?.(
          copiedIds
        );

        /**
         * Option + Shift 拖拽复制时，
         * 后续拖拽目标切换为新副本。
         */
        if (
          startDragging &&
          copiedIds.length > 0
        ) {
          setDraggingBlockId?.(
            copiedIds[0]
          );
        }

        return {
          blocks:
            copiedBlocks,

          ids:
            copiedIds,

          primaryBlock:
            copiedBlocks[0] ??
            null,

          primaryId:
            copiedIds[0] ??
            null,
        };
      },
      [
        nextBlockIdRef,

        getBlockById,
        getTargetSectionId,
        getSourceLayoutBounds,
        getSourceDomBounds,
        getSourceStagePosition,
        clampPositionInsidePage,

        normalizedZoom,

        setSections,
        setSelectedIds,
        setDraggingBlockId,

        pushHistorySnapshot,
        createEditingSectionFn,
      ]
    );

  /**
   * Cmd/Ctrl + V：
   * 在被复制模块右下方创建 floating 副本。
   */
  const duplicateSelectedBlocks =
    useCallback(
      (
        selectedIds,
        options = {}
      ) => {
        return duplicateBlocks(
          selectedIds,
          {
            offsetX: 24,
            offsetY: 24,

            ...options,

            startDragging:
              false,
          }
        );
      },
      [duplicateBlocks]
    );

  /**
   * Option + Shift + 左键拖动：
   * 创建 floating 副本并立即拖动。
   */
  const beginDuplicateDrag =
    useCallback(
      (
        event,
        blockId
      ) => {
        if (
          !event ||
          blockId == null
        ) {
          return {
            blocks: [],
            ids: [],
            primaryBlock:
              null,
            primaryId: null,
          };
        }

        const normalizedBlockId =
          normalizeId(blockId);

        const selectedBlockIds =
          Array.from(
            new Set(
              (selectedIds || [])
                .map(normalizeId)
                .filter(Boolean)
            )
          );

        const sourceIds =
          selectedBlockIds.length > 1 &&
          selectedBlockIds.includes(
            normalizedBlockId
          )
            ? [
                normalizedBlockId,
                ...selectedBlockIds.filter(
                  (id) =>
                    id !==
                    normalizedBlockId
                ),
              ]
            : [blockId];

        return duplicateBlocks(
          sourceIds,
          {
            clientX:
              event.clientX,

            clientY:
              event.clientY,

            offsetX: 0,
            offsetY: 0,

            startDragging:
              true,
          }
        );
      },
      [
        duplicateBlocks,
        selectedIds,
      ]
    );

  return {
    duplicateBlocks,
    duplicateSelectedBlocks,
    beginDuplicateDrag,
  };
}

export default useBlockDuplicate;
