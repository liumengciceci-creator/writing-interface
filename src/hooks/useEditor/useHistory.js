import {
  useCallback,
  useState,
} from "react";

import {
  cloneSections,
} from "./sectionHelpers";

export function useHistory({
  initialSections,
  setSections,
  clearInteractionState,
}) {
  /**
   * 编辑历史。
   *
   * history 中始终至少保留一份初始状态。
   */
  const [history, setHistory] =
    useState(() => [
      cloneSections(initialSections),
    ]);

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

        setHistory(
          (prevHistory) => {
            const nextHistory = [
              ...prevHistory,
              clonedSnapshot,
            ];

            console.log(
              "history length:",
              prevHistory.length,
              "->",
              nextHistory.length
            );

            console.groupEnd();

            return nextHistory;
          }
        );
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

      setHistory(
        (prevHistory) => {
          console.log(
            "history before undo:",
            prevHistory
          );

          if (
            prevHistory.length <= 1
          ) {
            console.log(
              "undo skipped"
            );

            console.groupEnd();

            return prevHistory;
          }

          /**
           * history 保存的每一项都是“某次修改发生前”的快照。
           * 因此撤销时应恢复当前栈顶，再把它移出历史。
           *
           * 旧逻辑先移除栈顶、再读取新的栈顶，会一次退回两步；
           * 连续完成、编辑、恢复或复制模块后尤其明显。
           */
          const previousSections =
            prevHistory[
              prevHistory.length - 1
            ];

          const nextHistory =
            prevHistory.slice(
              0,
              -1
            );

          setSections(
            cloneSections(
              previousSections
            )
          );

          console.groupEnd();

          return nextHistory;
        }
      );

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
        setHistory([
          cloneSections(
            sectionsSnapshot
          ),
        ]);
      },
      []
    );

  return {
    history,
    pushHistorySnapshot,
    undoLastAction,
    resetHistory,
  };
}
