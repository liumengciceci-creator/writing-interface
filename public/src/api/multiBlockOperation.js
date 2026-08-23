/**
 * 双模块操作请求。
 *
 * 支持：
 *
 * join
 * 拼接：在两个模块之间生成一个过渡模块。
 *
 * merge
 * 融合：将两个模块融合为一个新模块。
 *
 * imitate
 * 模仿：后选模块模仿先选模块的表达风格。
 *
 * relate
 * 建立联系：同时改写两个模块。
 *
 * relate 支持的 relationType：
 *
 * cause
 * 因果
 *
 * contrast
 * 对比
 *
 * progressive
 * 递进
 *
 * transition
 * 转折
 */
import { API_BASE_URL } from "../apiConfig";
export async function multiBlockOperation({
  operation,
  firstBlock,
  secondBlock,
  options = {},
  signal,
}) {
  /**
   * 发送请求到 Express 后端。
   */
  const response = await fetch(
  `${API_BASE_URL}/api/multi-block-operation`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        operation,
        firstBlock,
        secondBlock,
        options,
      }),

      signal,
    }
  );

  /**
   * 尝试读取服务器返回的 JSON。
   */
  let data = null;

  try {
    data =
      await response.json();
  } catch (error) {
    console.error(
      "[multiBlockOperation] 无法解析服务器返回的数据：",
      error
    );

    data = null;
  }

  /**
   * HTTP 状态不是 2xx 时，
   * 抛出服务器提供的错误信息。
   */
  if (!response.ok) {
    const message =
      data?.error ||
      data?.message ||
      `双模块操作失败（${response.status}）`;

    const requestError =
      new Error(message);

    requestError.status =
      response.status;

    requestError.details =
      data?.details ||
      null;

    throw requestError;
  }

  /**
   * 服务器没有返回有效 JSON。
   */
  if (!data) {
    throw new Error(
      "服务器没有返回有效数据"
    );
  }

  return data;
}