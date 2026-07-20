export async function generateBlocksStream({
  targetBlocks,
  contextBlocks = [],
  onEvent,
}) {
  const response = await fetch("http://localhost:3001/api/generate-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      targetBlocks,
      contextBlocks,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Streaming request failed");
  }

  if (!response.body) {
    throw new Error("ReadableStream is not supported in this browser");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const event = JSON.parse(trimmed);
      onEvent?.(event);
    }
  }

  const finalText = buffer.trim();
  if (finalText) {
    const event = JSON.parse(finalText);
    onEvent?.(event);
  }
}