import { API_BASE_URL } from "../apiConfig";

export async function generateBlocksStream({
  targetBlocks,
  contextBlocks = [],
  onEvent,
  signal,
}) {
  const response = await fetch(
    `${API_BASE_URL}/api/generate-stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify({
        targetBlocks,
        contextBlocks,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Streaming request failed");
  }

  if (!response.body) {
    throw new Error(
      "ReadableStream is not supported in this browser"
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let receivedDone = false;

  const emitLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let event;
    try {
      event = JSON.parse(trimmed);
    } catch (error) {
      console.warn(
        "[generateBlocksStream] JSON parse failed:",
        trimmed,
        error
      );
      return;
    }

    if (event?.type === "done") {
      receivedDone = true;
    }

    onEvent?.(event);
  };

  try {
    while (true) {
      const { value, done } =
        await reader.read();

      if (done) break;

      buffer += decoder.decode(value, {
        stream: true,
      });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        emitLine(line);
      }
    }

    buffer += decoder.decode();

    const finalText = buffer.trim();

    if (finalText) {
      emitLine(finalText);
    }

    if (!receivedDone) {
      throw new Error(
        "生成连接在服务端确认完成前中断，请重试"
      );
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }

    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}
