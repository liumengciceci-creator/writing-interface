import {
  createPortal,
} from "react-dom";

export default function InstructionDropBurst({
  effect,
}) {
  if (
    !effect ||
    effect.phase !== "impact" ||
    !Number.isFinite(
      effect.clientX
    ) ||
    !Number.isFinite(
      effect.clientY
    ) ||
    typeof document ===
      "undefined"
  ) {
    return null;
  }

  return createPortal(
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left: effect.clientX,
        top: effect.clientY,
        zIndex: 99999,
        pointerEvents: "none",
        transform:
          "translate(-50%, -50%)",
      }}
    >
      <style>
        {`
          @keyframes instruction-drop-circle-merge {
            0% {
              transform: scale(1);
              opacity: 1;
            }

            36% {
              transform: scale(0.82);
              opacity: 1;
            }

            100% {
              transform: scale(2.4);
              opacity: 0;
            }
          }
        `}
      </style>

      <div
        style={{
          "--instruction-drop-color":
            effect.color ||
            "#8b5cf6",
          width: 26,
          height: 26,
          borderRadius: "50%",
          background:
            effect.color ||
            "#8b5cf6",
          animation:
            "instruction-drop-circle-merge 520ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
        }}
      />
    </div>,
    document.body
  );
}
