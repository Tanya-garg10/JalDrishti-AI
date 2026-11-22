import { getStress, putStressWeights } from '../server/handlers.ts';
import { guardMethod, sendResult } from './_lib.ts';

export default async function handler(req: any, res: any) {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET') {
    sendResult(res, await getStress(req.query ?? {}));
    return;
  }
  if (method === 'PUT') {
    sendResult(res, await putStressWeights(req.body));
    return;
  }
  guardMethod(req, res, []);
}
