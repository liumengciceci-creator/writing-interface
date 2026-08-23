import { useCallback, useRef, useState, useEffect } from "react";

export function useStatus() {
  const [statusText, setStatusText] = useState("");

  const statusTimerRef = useRef(null);

  /**
   * 临时显示顶部状态。
   */
  const showTemporaryStatus = useCallback(
    (message, duration = 2000) => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }

      setStatusText(message);

      statusTimerRef.current = setTimeout(() => {
        setStatusText("");
        statusTimerRef.current = null;
      }, duration);
    },
    []
  );

  /**
   * 清除当前状态
   */
  const clearStatus = useCallback(() => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }

    setStatusText("");
  }, []);

  /**
   * 卸载时清理 timer
   */
  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  return {
    statusText,
    setStatusText,

    statusTimerRef,

    showTemporaryStatus,
    clearStatus,
  };
}