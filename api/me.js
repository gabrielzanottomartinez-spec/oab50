// GET /api/me — devolve o usuário da sessão atual, ou 401 se ninguém estiver logado.
const { withRedis, send, getSessionUser, publicUser } = require('./_lib/core');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  try {
    const user = await withRedis((client) => getSessionUser(client, req));
    if (!user) return send(res, 401, { error: 'unauthorized' });
    return send(res, 200, { user: publicUser(user) });
  } catch (err) {
    return send(res, 500, { error: 'server_error', message: String((err && err.message) || err) });
  }
};
