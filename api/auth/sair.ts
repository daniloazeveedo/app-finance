/** POST /api/auth/sair — encerra a sessão dos dois lados. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { rota, responde } from "../../lib/http";
import { fecha } from "../../lib/sessao";

export default rota(["POST"], async (req: VercelRequest, res: VercelResponse) => {
  await fecha(req, res);
  responde(res, 200, { ok: true });
});
