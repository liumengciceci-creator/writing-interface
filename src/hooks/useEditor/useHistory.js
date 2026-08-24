import {
  useCallback,
  useRef,
  useState,
} from "react";

import {
  cloneSections,
} from "./sectionHelpers";

export function useHistory({
  initialSections,
  sections,
  setSections,
  clearInteractionState,
}) {
  /**
   * 每一项都是一次文档 action 发生前的完整快照。
   */
  const [history, setHistory] =
    useState([]);

  /**
   * 撤销后可向前恢复的状态。
   * 数组第一项始终是下一次“重做”要恢复的状态。
   */
  const [future, setFuture] =
    useState([]);

  const historyRef = useRef(history);
  const futureRef = useRef(future);
  historyRef.current = history;
  futureRef.current = future;

  /**
   * 快捷键可能连续触发，不能只依赖下一次 React render 才更新当前值。
   */
  const sectionsRef = useRef(
    cloneSections(sections || initialSections)
  );
  sectionsRef.current = sections;

  /**
   * 保存一次撤销快照。
   *
   * 注意：
   * 传入的应该是修改之前的 sections。
   */
  const pushHistorySnapshot =
    useCallback(
      (sectionsSnapshot) => {
        console.group(
          "[useHistory] pushHistorySnapshot"
        );

        const clonedSnapshot =
          cloneSections(
            sectionsSnapshot
          );

        console.log(
          "snapshot pushed:",
          clonedSnapshot
        );

        const previousHistory =
          historyRef.current;

        /**
         * React Strict Mode 可能重复执行包含此调用的 state updater。
         * 连续相同快照只保存一次，避免一次操作需要点两次撤销。
         */
        const lastSnapshot =
          previousHistory[
            previousHistory.length - 1
          ];

        const isDuplicate =
          lastSnapshot != null &&
          JSON.stringify(lastSnapshot) ===
            JSON.stringify(clonedSnapshot);

        if (!isDuplicate) {
          const nextHistory = [
            ...previousHistory,
            clonedSnapshot,
          ];

          historyRef.current =
            nextHistory;
          setHistory(nextHistory);

          console.log(
            "history length:",
            previousHistory.length,
            "->",
            nextHistory.length
          );
        }

        console.groupEnd();

        /**
         * 撤销后只要发生新的文档 action，旧的重做分支就失效。
         */
        futureRef.current = [];
        setFuture([]);
      },
      []
    );

  /**
   * 撤销最后一次操作。
   */
  const undoLastAction =
    useCallback(() => {
      console.group(
        "[useHistory] undoLastAction"
      );

      const previousHistory =
        historyRef.current;

      console.log(
        "history before undo:",
        previousHistory
      );

      if (previousHistory.length === 0) {
        console.log("undo skipped");
        console.groupEnd();
        return;
      }

      const restoredSections =
        cloneSections(
          previousHistory[
            previousHistory.length - 1
          ]
        );

      const currentSections =
        cloneSections(
          sectionsRef.current
        );

      const nextHistory =
        previousHistory.slice(0, -1);
      const nextFuture = [
        currentSections,
        ...futureRef.current,
      ];

      historyRef.current = nextHistory;
      futureRef.current = nextFuture;
      sectionsRef.current = restoredSections;

      setHistory(nextHistory);
      setFuture(nextFuture);
      setSections(restoredSections);

      console.groupEnd();

      clearInteractionState?.();
    }, [
      setSections,
      clearInteractionState,
    ]);

  /**
   * 恢复刚刚被撤销的一步。
   */
  const redoLastAction =
    useCallback(() => {
      const previousFuture =
        futureRef.current;

      if (previousFuture.length === 0) {
        return;
      }

      const nextSections =
        cloneSections(previousFuture[0]);
      const currentSections =
        cloneSections(
          sectionsRef.current
        );
      const nextHistory = [
        ...historyRef.current,
        currentSections,
      ];
      const nextFuture =
        previousFuture.slice(1);

      historyRef.current = nextHistory;
      futureRef.current = nextFuture;
      sectionsRef.current = nextSections;

      setHistory(nextHistory);
      setFuture(nextFuture);
      setSections(nextSections);

      clearInteractionState?.();
    }, [
      setSections,
      clearInteractionState,
    ]);

  /**
   * 清空历史记录，并以当前 sections
   * 作为新的初始状态。
   */
  const resetHistory =
    useCallback(
      (sectionsSnapshot) => {
        historyRef.current = [];
        futureRef.current = [];
        setHistory([]);
        setFuture([]);
        sectionsRef.current =
          cloneSections(
            sectionsSnapshot
          );
      },
      []
    );

  return {
    history,
    future,
    canUndo: history.length > 0,
    canRedo: future.length > 0,
    pushHistorySnapshot,
    undoLastAction,
    redoLastAction,
    resetHistory,
  };
}
