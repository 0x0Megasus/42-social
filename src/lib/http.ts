import { NextResponse } from "next/server";
import type { ApiError } from "@/lib/contracts";

// Consistent JSON envelopes (skill: api-design-principles).
// Every route returns { data } on success or { error, retryAfter? } on failure
// with `Retry-After` + `X-RateLimit-*` headers where rate limits apply.

export function jsonOk<T>(data: T, status = 200, headers?: HeadersInit) {
  return NextResponse.json(data, { status, headers });
}

export function jsonError(
  error: ApiError["error"],
  status: number,
  extra?: Partial<ApiError> & { headers?: HeadersInit }
) {
  const { headers, ...body } = extra ?? {};
  return NextResponse.json(
    { error, ...(body.retryAfter !== undefined ? { retryAfter: body.retryAfter } : {}) },
    { status, headers }
  );
}

export function rateLimitHeaders(
  limit: number,
  remaining: number,
  resetSeconds: number,
  retryAfter?: number
): HeadersInit {
  const h: Record<string, string> = {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(0, remaining)),
    "X-RateLimit-Reset": String(resetSeconds),
  };
  if (retryAfter !== undefined) h["Retry-After"] = String(retryAfter);
  return h;
}
