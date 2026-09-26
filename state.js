// /api/state.js — lê e grava o progresso do plano de estudos no Vercel KV,
// protegido por uma senha compartilhada (variável de ambiente APP_PASSWORD).
const { kv } = require('@vercel/kv');

const STATE_KEY = 'oab-plano:state';

function checkAuth(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true; // nenhuma senha configurada ainda: acesso liberado (configure a env var!)
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token === expected;
}

module.exports = async (req, res) => {
  if (!checkAuth(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const data = await kv.get(STATE_KEY);
      res.status(200).json(data || { lessons: {}, reviews: {}, simulados: {} });
    } catch (err) {
      res.status(500).json({ error: 'kv_read_failed', message: String(err && err.message || err) });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'invalid_body' });
        return;
      }
      const safe = {
        lessons: (body.lessons && typeof body.lessons === 'object') ? body.lessons : {},
        reviews: (body.reviews && typeof body.reviews === 'object') ? body.reviews : {},
        simulados: (body.simulados && typeof body.simulados === 'object') ? body.simulados : {}
      };
      await kv.set(STATE_KEY, safe);
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'kv_write_failed', message: String(err && err.message || err) });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'method_not_allowed' });
};
