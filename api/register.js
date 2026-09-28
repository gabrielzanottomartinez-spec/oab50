// POST /api/register — cria uma conta { name, username, password } e já inicia a sessão.
const {
  keys, USERNAME_RE, withRedis, send, readBody, normalizeUsername,
  hashPassword, createSession, publicUser
} = require('./_lib/core');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const body = readBody(req);
  if (!body) return send(res, 400, { error: 'invalid_body' });

  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  const username = normalizeUsername(body.username);
  const password = String(body.password || '');

  if (name.length < 2 || name.length > 80) return send(res, 400, { error: 'invalid_name' });
  if (!USERNAME_RE.test(username)) return send(res, 400, { error: 'invalid_username' });
  if (password.length < 6 || password.length > 200) return send(res, 400, { error: 'invalid_password' });

  try {
    const { salt, hash } = await hashPassword(password);
    const user = { name, username, salt, hash, createdAt: new Date().toISOString() };
    const result = await withRedis(async (client) => {
      // NX: só grava se o usuário ainda não existir
      const ok = await client.set(keys.user(username), JSON.stringify(user), { NX: true });
      if (!ok) return 'taken';
      await createSession(client, req, res, username);
      return 'ok';
    });
    if (result === 'taken') return send(res, 409, { error: 'username_taken' });
    return send(res, 201, { user: publicUser(user) });
  } catch (err) {
    return send(res, 500, { error: 'server_error', message: String((err && err.message) || err) });
  }
};
