// GET/POST /api/state — lê e grava o progresso do plano de estudos
// DO USUÁRIO LOGADO (cada conta tem sua própria chave no Redis).
const { keys, withRedis, send, readBody, getSessionUser } = require('./_lib/core');

const EMPTY = { lessons: {}, reviews: {}, simulados: {} };

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }

  let body = null;
  if (req.method === 'POST') {
    body = readBody(req);
    if (!body) return send(res, 400, { error: 'invalid_body' });
  }

  try {
    const result = await withRedis(async (client) => {
      const user = await getSessionUser(client, req);
      if (!user) return { status: 401 };

      if (req.method === 'GET') {
        const raw = await client.get(keys.state(user.username));
        return { status: 200, data: raw ? JSON.parse(raw) : EMPTY };
      }

      const safe = {
        lessons: (body.lessons && typeof body.lessons === 'object') ? body.lessons : {},
        reviews: (body.reviews && typeof body.reviews === 'object') ? body.reviews : {},
        simulados: (body.simulados && typeof body.simulados === 'object') ? body.simulados : {}
      };
      await client.set(keys.state(user.username), JSON.stringify(safe));
      return { status: 200, data: { ok: true } };
    });

    if (result.status === 401) return send(res, 401, { error: 'unauthorized' });
    return send(res, 200, result.data);
  } catch (err) {
    const code = req.method === 'GET' ? 'redis_read_failed' : 'redis_write_failed';
    return send(res, 500, { error: code, message: String((err && err.message) || err) });
  }
};
