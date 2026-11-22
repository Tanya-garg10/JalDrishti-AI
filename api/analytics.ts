import { getAnalytics } from '../server/handlers.ts';
import { guardMethod, sendResult } from './_lib.ts';

export default async function handler(req: any, res: any) {
  if (!guardMethod(req, res, ['GET'])) return;
  sendResult(res, await getAnalytics(req.query ?? {}));
}
