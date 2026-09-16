import { NextResponse } from "next/server";
import type { ApiError } from "@/lib/contracts";


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
