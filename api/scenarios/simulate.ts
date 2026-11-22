import { postScenarioSimulate } from '../../server/handlers.ts';
import { guardMethod, sendResult } from '../_lib.ts';

export default async function handler(req: any, res: any) {
  if (!guardMethod(req, res, ['POST'])) return;
  sendResult(res, await postScenarioSimulate(req.body));
}
