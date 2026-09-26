// /api/state.js — lê e grava o progresso do plano de estudos no Redis (REDIS_URL),
// protegido por uma senha compartilhada (variável de ambiente APP_PASSWORD).
const { createClient } = require('redis');

const STATE_KEY = 'oab-plano:state';

let clientPromise;
function getClient() {
  if (!clientPromise) {
    const client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (e) => console.error('redis error', e));
    clientPromise = client.connect().then(() => client).catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

const kv = {
  async get(key) {
    const c = await getClient();
    const v = await c.get(key);
    return v ? JSON.parse(v) : null;
  },
  async set(key, value) {
    const c = await getClient();
    await c.set(key, JSON.stringify(value));
  }
};

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
