import { createHash } from "node:crypto";
import type { Request } from "express";

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

function requestAddress(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function allowPublicWrite(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const key = `${scope}:${digest(requestAddress(req))}`;
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  if (windows.size > 10_000) {
    for (const [entryKey, entry] of windows) {
      if (entry.resetAt <= now) windows.delete(entryKey);
    }
  }
  return true;
}

export function publicWriteRateLimitKey(req: Request, scope: string) {
  return `${scope}:${digest(requestAddress(req))}`;
}

export function anonymousVisitorKey(req: Request, path: string) {
  const day = new Date().toISOString().slice(0, 10);
  const userAgent = req.get("user-agent")?.slice(0, 200) ?? "";
  return digest(`${day}\n${requestAddress(req)}\n${userAgent}\n${path}`);
}

export function safeReferrer(referrer?: string) {
  if (!referrer) return undefined;
  try {
    const url = new URL(referrer);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin.slice(0, 200)
      : undefined;
  } catch {
    return undefined;
  }
}