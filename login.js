// POST /api/login — { username, password } → inicia a sessão (cookie HttpOnly).
const {
  keys, withRedis, send, readBody, normalizeUsername,
  hashPassword, verifyPassword, createSession, publicUser
} = require('./_lib/core');

const MAX_FAILS = 10;          // tentativas erradas permitidas…
const FAIL_WINDOW = 15 * 60;   // …a cada 15 minutos, por usuário

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const body = readBody(req);
  if (!body) return send(res, 400, { error: 'invalid_body' });

  const username = normalizeUsername(body.username);
  const password = String(body.password || '');
  if (!username || !password) return send(res, 401, { error: 'invalid_credentials' });

  try {
    const result = await withRedis(async (client) => {
      const fails = parseInt((await client.get(keys.loginFail(username))) || '0', 10);
      if (fails >= MAX_FAILS) return { status: 429 };

      const raw = await client.get(keys.user(username));
      const user = raw ? JSON.parse(raw) : null;
      let ok = false;
      if (user) {
        ok = await verifyPassword(password, user.salt, user.hash);
      } else {
        await hashPassword(password); // mesmo custo de tempo, pra não revelar quais usuários existem
      }

      if (!ok) {
        const n = await client.incr(keys.loginFail(username));
        if (n === 1) await client.expire(keys.loginFail(username), FAIL_WINDOW);
        return { status: 401 };
      }

      await client.del(keys.loginFail(username));
      await createSession(client, req, res, username);
      return { status: 200, user };
    });

    if (result.status === 429) return send(res, 429, { error: 'too_many_attempts' });
    if (result.status === 401) return send(res, 401, { error: 'invalid_credentials' });
    return send(res, 200, { user: publicUser(result.user) });
  } catch (err) {
    return send(res, 500, { error: 'server_error', message: String((err && err.message) || err) });
  }
};
