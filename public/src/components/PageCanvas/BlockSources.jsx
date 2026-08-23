export default function BlockSources({
  sources,
  floating = false,
}) {
  const safeSources = Array.isArray(sources)
    ? sources.filter((source) => source?.url).slice(0, 5)
    : [];

  if (!safeSources.length) return null;

  return (
    <span
      data-block-sources="true"
      contentEditable={false}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      style={{
        display: floating ? "block" : "inline-block",
        width: floating ? "auto" : 0,
        height: floating ? "auto" : 0,
        marginTop: floating ? 6 : 0,
        verticalAlign: "baseline",
        position: "relative",
        zIndex: 4,
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      aria-label="生成内容来源"
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 2,
          position: floating ? "relative" : "absolute",
          right: floating ? "auto" : 0,
          bottom: floating ? "auto" : 11,
          whiteSpace: "nowrap",
          zIndex: 20,
          pointerEvents: "auto",
        }}
      >
        {safeSources.map((source, index) => (
          <a
            key={`${source.url}-${index}`}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            draggable={false}
            title={source.title || source.url}
            onClick={(event) => event.stopPropagation()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 17,
              minWidth: 17,
              height: 17,
              padding: 0,
              border: "1px solid rgba(55,65,81,0.34)",
              borderRadius: "50%",
              background: "#ffffff",
              color: "#374151",
              fontSize: 9,
              fontWeight: 600,
              lineHeight: "17px",
              textDecoration: "none",
              boxSizing: "border-box",
              cursor: "pointer",
            }}
          >
            {index + 1}
          </a>
        ))}
      </span>
    </span>
  );
}
