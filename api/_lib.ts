import type { HandlerResult } from '../server/handlers.ts';

interface VercelRequestLike {
  method?: string;
  query: Record<string, unknown>;
  body?: unknown;
}

interface VercelResponseLike {
  status(code: number): VercelResponseLike;
  json(body: unknown): unknown;
  send(body: unknown): unknown;
  setHeader(name: string, value: string): unknown;
}

export function sendResult(res: VercelResponseLike, result: HandlerResult): void {
  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }
  }
  res.status(result.status ?? 200);
  if (result.buffer) {
    res.send(result.buffer);
    return;
  }
  res.json(result.json ?? {});
}

export function methodNotAllowed(res: VercelResponseLike): void {
  res.status(405).json({ error: 'Method not allowed.' });
}

export function guardMethod(
  req: VercelRequestLike,
  res: VercelResponseLike,
  allowed: string[],
): boolean {
  const method = (req.method ?? 'GET').toUpperCase();
  if (allowed.includes(method)) return true;
  methodNotAllowed(res);
  return false;
}
