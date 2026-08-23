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
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed);
          onEvent?.(event);
        } catch (error) {
          console.warn(
            "[generateBlocksStream] JSON parse failed:",
            trimmed,
            error
          );
        }
      }
    }

    buffer += decoder.decode();

    const finalText = buffer.trim();

    if (finalText) {
      try {
        const event = JSON.parse(finalText);
        onEvent?.(event);
      } catch (error) {
        console.warn(
          "[generateBlocksStream] Final JSON parse failed:",
          finalText,
          error
        );
      }
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