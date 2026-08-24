import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createPortal,
} from "react-dom";
import { useI18n } from "../i18n.jsx";

function clamp(
  value,
  minimum,
  maximum
) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value
    )
  );
}

function loadPosition(
  storageKey,
  defaultPosition
) {
  try {
    const savedValue =
      window.localStorage.getItem(
        storageKey
      );

    if (!savedValue) {
      return defaultPosition;
    }

    const parsed =
      JSON.parse(savedValue);

    if (
      !Number.isFinite(parsed?.x) ||
      !Number.isFinite(parsed?.y)
    ) {
      return defaultPosition;
    }

    return {
      x: parsed.x,
      y: parsed.y,
    };
  } catch {
    return defaultPosition;
  }
}

export default function FloatingPaletteWindow({
  storageKey,
  defaultPosition = {
    x: 18,
    y: 24,
  },
  width = 128,
  onWidthChange,
  children,
}) {
  const { t } = useI18n();
  const [position, setPosition] =
    useState(() =>
      loadPosition(
        storageKey,
        defaultPosition
      )
    );

  const [isDragging, setIsDragging] =
    useState(false);

  const [isResizing, setIsResizing] =
    useState(false);

  const interactionRef =
    useRef(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify(position)
      );
    } catch {
      // 浏览器禁止本地存储时继续使用当前会话位置。
    }
  }, [position, storageKey]);

  useEffect(() => {
    const handlePointerMove =
      (event) => {
        const interaction =
          interactionRef.current;

        if (!interaction) {
          return;
        }

        if (
          interaction.type ===
          "drag"
        ) {
          const maximumX =
            Math.max(
              0,
              window.innerWidth -
                width
            );

          const maximumY =
            Math.max(
              0,
              window.innerHeight -
                48
            );

          setPosition({
            x: clamp(
              event.clientX -
                interaction.offsetX,
              0,
              maximumX
            ),
            y: clamp(
              event.clientY -
                interaction.offsetY,
              0,
              maximumY
            ),
          });

          return;
        }

        if (
          interaction.type ===
          "resize"
        ) {
          const maximumWidth =
            Math.max(
              128,
              window.innerWidth -
                position.x -
                8
            );

          const nextWidth =
            clamp(
              interaction.startWidth +
                event.clientX -
                interaction.startX,
              128,
              Math.min(
                360,
                maximumWidth
              )
            );

          onWidthChange?.(
            Math.round(nextWidth)
          );
        }
      };

    const finishInteraction =
      () => {
        interactionRef.current =
          null;

        setIsDragging(false);
        setIsResizing(false);
      };

    window.addEventListener(
      "pointermove",
      handlePointerMove
    );

    window.addEventListener(
      "pointerup",
      finishInteraction
    );

    window.addEventListener(
      "pointercancel",
      finishInteraction
    );

    return () => {
      window.removeEventListener(
        "pointermove",
        handlePointerMove
      );

      window.removeEventListener(
        "pointerup",
        finishInteraction
      );

      window.removeEventListener(
        "pointercancel",
        finishInteraction
      );
    };
  }, [
    onWidthChange,
    position.x,
    width,
  ]);

  if (
    typeof document ===
    "undefined"
  ) {
    return null;
  }

  return createPortal(
    <div
      onPointerDownCapture={(
        event
      ) => {
        const dragHandle =
          event.target.closest?.(
            "[data-palette-drag-handle='true']"
          );

        const interactiveControl =
          event.target.closest?.(
            "button, input, textarea, select"
          );

        if (
          !dragHandle ||
          interactiveControl
        ) {
          return;
        }

        const rect =
          event.currentTarget
            .getBoundingClientRect();

        interactionRef.current = {
          type: "drag",
          offsetX:
            event.clientX -
            rect.left,
          offsetY:
            event.clientY -
            rect.top,
        };

        setIsDragging(true);

        event.preventDefault();
      }}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width,
        maxWidth:
          "calc(100vw - 8px)",
        zIndex:
          isDragging ||
          isResizing
            ? 1900
            : 1700,
        touchAction: "none",
      }}
    >
      {children}

      <button
        type="button"
        aria-label={t("canvas.resizeWidth")}
        title={t("canvas.dragResizeWidth")}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();

          interactionRef.current = {
            type: "resize",
            startX:
              event.clientX,
            startWidth:
              width,
          };

          setIsResizing(true);
        }}
        style={{
          position: "absolute",
          right: -4,
          top: 8,
          bottom: 8,
          width: 8,
          height: "auto",
          padding: 0,
          border: "none",
          borderRadius: 0,
          background:
            "transparent",
          boxShadow: "none",
          cursor: "ew-resize",
          opacity: 1,
          outline: "none",
        }}
      />
    </div>,
    document.body
  );
}
