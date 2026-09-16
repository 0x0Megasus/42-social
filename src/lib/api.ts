"use client";

export const API_TIMEOUT_MS = 20_000;

export class ApiTimeoutError extends Error {
  constructor() {
    super("Request timed out — check your connection and retry.");
    this.name = "ApiTimeoutError";
  }
}

export async function api(
  input: string,
  init?: RequestInit,
  timeoutMs = API_TIMEOUT_MS
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new ApiTimeoutError()), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof ApiTimeoutError) throw e;
    if (e instanceof DOMException && e.name === "AbortError")
      throw new ApiTimeoutError();
    throw e;
  } finally {
    clearTimeout(t);
  }
}
