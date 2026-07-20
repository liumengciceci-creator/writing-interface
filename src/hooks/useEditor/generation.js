import { API_BASE_URL } from "../../apiConfig";

export async function generateBlocksFromAPI({
  targetBlocks,
  contextBlocks = [],
}) {
  const payload = {
    targetBlocks: targetBlocks.map((block) => ({
      id: block.id,
      type: block.type,
      text: block.text,
    })),
    contextBlocks: contextBlocks.map((block) => ({
      id: block.id,
      type: block.type,
      text: block.text,
    })),
  };

  const response = await fetch(`${API_BASE_URL}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.details || errData.error || "API request failed");
  }

  const data = await response.json();

  if (!Array.isArray(data.results) || data.results.length === 0) {
    throw new Error("后端没有返回 results 数组");
  }

  return data.results;
}