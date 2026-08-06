import { useEffect, useRef } from "react";

export default function CompletedSection({
  section,
  onRestoreCompletedSection,
  onUpdateCompletedSectionText,
  isDimmed = false,
}) {
  const editorRef = useRef(null);
  const isTitleSection =
    Array.isArray(section?.blocks) &&
    section.blocks.some(
      (block) =>
        block?.type === "Title" &&
        block?.placement !== "floating"
    );

  useEffect(() => {
    if (!editorRef.current) return;

    const currentText = editorRef.current.textContent || "";
    if (currentText !== (section.text || "")) {
      editorRef.current.textContent = section.text || "";
    }
  }, [section.text]);

  const commitCurrentText = () => {
    if (!editorRef.current) return;
    const nextText = editorRef.current.textContent || "";
    onUpdateCompletedSectionText?.(section.id, nextText);
  };

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: section.top,
        width: "100%",
        minHeight: section.height,
        boxSizing: "border-box",
        padding: "6px 2px",
        textAlign: "left",
        opacity:
          isDimmed
            ? 0.24
            : 1,
        transition:
          "opacity 180ms ease",
      }}
    >
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-completed-text="true"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();

          // 先保存，再恢复
          commitCurrentText();
          onRestoreCompletedSection?.(section.id);
        }}
        onBlur={() => {
          commitCurrentText();
        }}
        style={{
          width: "100%",
          minHeight: section.height,
          fontSize:
            isTitleSection
              ? 20
              : 14,
          fontWeight:
            isTitleSection
              ? 700
              : 400,
          color: "#222",
          lineHeight:
            isTitleSection
              ? "26px"
              : "28px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          textAlign: "left",
          outline: "none",
          border: "none",
          background: "transparent",
          userSelect: "text",
          WebkitUserSelect: "text",
          cursor: "text",
          display: "block",
        }}
      />
    </div>
  );
}
