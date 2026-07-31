import {
  Fragment,
  memo,
} from "react";

import {
  normalizeId,
} from "./semanticEditorUtils";


function SemanticHighlightLayer({
  lineExtensions = [],
  blockById,

  selectedIdSet,

  /**
   * 普通 AI 生成
   */
  generatingIdSet,
  generatingBlinkOn = false,


  /**
   * 长度调整
   */
  isAdjustingLength = false,
  adjustingLengthBlockId = null,
  lengthAdjustBlinkOn = false,


  /**
   * 新增：
   * 指令润色/修改时闪烁
   */
  instructionGeneratingIdSet,
  instructionBlinkOn = false,


  lengthResizeDraft = null,
  lengthResizePreview = null,

  draggingInlineBlockId = null,

  /**
   * 指令拖入动画
   */
  instructionEffect = null,


  hasFocusedEditingBlock = false,
  effectiveEditingBlockId = null,
}) {


  const isLengthPreviewSubmitting =
    Boolean(
      lengthResizeDraft?.submitting
    );


  const showingLengthPreviewPulse =
    isLengthPreviewSubmitting &&
    isAdjustingLength &&
    lengthAdjustBlinkOn;



  return (
    <svg
      aria-hidden="true"
      width="100%"
      height="100%"
      style={{
        position:"absolute",
        inset:0,
        zIndex:0,
        overflow:"visible",
        pointerEvents:"none",
        userSelect:"none",
      }}
    >


      {lineExtensions.map(
        (
          rectangle
        ) => {


          const block =
            blockById?.get(
              rectangle.blockId
            );


          if(!block){
            return null;
          }

          if (
            block.isModuleHidden ===
            true
          ) {
            return null;
          }


          const blockId =
            normalizeId(
              rectangle.blockId
            );


          const color =
            block.color ||
            "#7c83fd";


          const fill =
            block.fill ||
            "rgba(124,131,253,0.08)";

          const softStroke =
            `color-mix(in srgb, ${color} 52%, white)`;


          const selected =
            selectedIdSet?.has(
              blockId
            );


          /**
           * 普通生成
           */
          const generating =
            generatingIdSet?.has(
              blockId
            );


          /**
           * 长度调整
           */
          const adjustingLength =
            isAdjustingLength &&
            normalizeId(
              adjustingLengthBlockId
            ) === blockId;


          /**
           * 指令润色修改
           */
          const instructionGenerating =
            instructionGeneratingIdSet?.has(
              blockId
            );



          /**
           * 三种 AI 状态统一闪烁
           */
          const showingGenerationPulse =
            (
              generating &&
              generatingBlinkOn
            )
            ||
            (
              adjustingLength &&
              lengthAdjustBlinkOn
            )
            ||
            (
              instructionGenerating &&
              instructionBlinkOn
            );



          const previewingLength =
            normalizeId(
              lengthResizeDraft?.blockId
            ) === blockId;



          const dragging =
            normalizeId(
              draggingInlineBlockId
            ) === blockId;



          const instructionTarget =
            normalizeId(
              instructionEffect?.blockId
            ) === blockId;



          return (

            <Fragment
              key={
                rectangle.key
              }
            >


              <rect
                x={
                  rectangle.left
                }
                y={
                  rectangle.top
                }
                width={
                  rectangle.width
                }
                height={
                  rectangle.height
                }
                rx="8"
                ry="8"

                fill={
                  showingGenerationPulse
                    ? `${color}22`
                    : fill
                }


                stroke={
                  softStroke
                }


                strokeWidth="1"


                opacity={
                  dragging ||
                  previewingLength
                    ? 0
                    :
                    hasFocusedEditingBlock &&
                    blockId !==
                      normalizeId(
                        effectiveEditingBlockId
                      )
                      ? 0.24
                      : 1
                }


                style={{
                  filter:
                    instructionTarget &&
                    instructionEffect
                      ?.phase === "hover"
                      ?
                      `drop-shadow(0 5px 7px rgba(15,23,42,0.28)) drop-shadow(0 1px 2px ${color}55)`
                      : showingGenerationPulse
                      ?
                      `drop-shadow(0 0 2px ${color}33) drop-shadow(0 2px 3px rgba(31,41,55,0.12))`
                      :
                      selected &&
                      !adjustingLength &&
                      !instructionGenerating
                        ?
                        `drop-shadow(0 5px 7px rgba(15,23,42,0.28)) drop-shadow(0 1px 2px ${color}55)`
                        :
                        undefined,


                  transition:
                    showingGenerationPulse
                      ?
                      "fill 160ms ease, filter 160ms ease, opacity 180ms ease"
                      :
                      "opacity 180ms ease",
                }}
              />



              {
                instructionTarget &&
                !dragging &&
                instructionEffect &&

                (
                  <rect
                    x={
                      rectangle.left
                    }
                    y={
                      rectangle.top
                    }
                    width={
                      rectangle.width
                    }
                    height={
                      rectangle.height
                    }
                    rx="8"
                    ry="8"


                    fill={
                      instructionEffect.fill
                    }


                    stroke={
                      instructionEffect.color
                    }


                    strokeWidth="1.5"


                    pointerEvents="none"


                    style={{
                      transformBox:
                        "fill-box",


                      transformOrigin:
                        "left center",


                      animation:
                        instructionEffect.phase ===
                        "impact"
                          ?
                          "semantic-instruction-water-fill 640ms cubic-bezier(0.22,1,0.36,1) forwards"
                          :
                        instructionEffect.phase ===
                          "waiting"
                          ?
                          "semantic-instruction-waiting-pulse 620ms ease-in-out infinite"
                          :
                          undefined,


                    opacity:
                        instructionEffect.phase ===
                        "hover"
                          ? 0
                          : undefined,
                    }}
                  />
                )
              }


            </Fragment>

          );
        }
      )}




      {
        lengthResizePreview
          ?.rectangles
          ?.map(
            (
              rectangle,
              index
            ) => (

              <rect
                key={
                  `length-preview-${lengthResizePreview.blockId}-${index}`
                }

                x={
                  rectangle.left
                }

                y={
                  rectangle.top
                }

                width={
                  rectangle.width
                }

                height={
                  rectangle.height
                }

                rx="8"
                ry="8"


                fill={
                  showingLengthPreviewPulse
                    ?
                    `${
                      lengthResizePreview.block?.color ||
                      "#7c83fd"
                    }22`
                    :
                    (
                      lengthResizePreview.block?.fill ||
                      "rgba(124,131,253,0.08)"
                    )
                }


                stroke={
                  lengthResizePreview.block?.color ||
                  "#7c83fd"
                }


                strokeWidth="1.5"


                pointerEvents="none"


                style={{
                  filter:
                    showingLengthPreviewPulse
                      ?
                      `drop-shadow(0 0 2px ${
                        lengthResizePreview.block?.color ||
                        "#7c83fd"
                      }33)`
                      :
                      undefined,


                  transition:
                    isLengthPreviewSubmitting
                      ?
                      "fill 160ms ease, filter 160ms ease"
                      :
                      "none",
                }}
              />

            )
          )
      }


    </svg>
  );
}


export default memo(
  SemanticHighlightLayer
);
