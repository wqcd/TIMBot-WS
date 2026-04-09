/**
 * timbot-ws 日志工具
 */

export const LOG_PREFIX = "[timbot-ws]";

/** 简易日志 */
export function logSimple(level: "info" | "warn" | "error", message: string): void {
  const full = `${LOG_PREFIX} ${message}`;
  if (level === "error") console.error(full);
  else if (level === "warn") console.warn(full);
  else console.log(full);
}

/** Debug 日志 */
export function logDebug(message: string): void {
  console.debug(`${LOG_PREFIX} ${message}`);
}
