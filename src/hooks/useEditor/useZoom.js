import { useState } from "react";

import {
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
} from "../../constants";

import {
  clamp,
  roundZoom,
} from "../../utils";

export function useZoom() {
  const [zoom, setZoom] = useState(1);

  const zoomIn = () => {
    setZoom((prev) =>
      clamp(
        roundZoom(prev + ZOOM_STEP),
        MIN_ZOOM,
        MAX_ZOOM
      )
    );
  };

  const zoomOut = () => {
    setZoom((prev) =>
      clamp(
        roundZoom(prev - ZOOM_STEP),
        MIN_ZOOM,
        MAX_ZOOM
      )
    );
  };

  const resetZoom = () => {
    setZoom(1);
  };

  return {
    zoom,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
  };
}