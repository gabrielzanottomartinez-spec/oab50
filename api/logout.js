// POST /api/logout — encerra a sessão atual.
const { withRedis, send, destroySession } = require('./_lib/core');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  try {
    await withRedis((client) => destroySession(client, req, res));
    return send(res, 200, { ok: true });
  } catch (err) {
    return send(res, 500, { error: 'server_error', message: String((err && err.message) || err) });
  }
};
