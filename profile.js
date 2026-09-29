// /api/profile — respostas do questionário inicial (exame, horas por dia, dia de descanso,
// matéria da 2ª fase), gravadas no CADASTRO do usuário no servidor.
//   GET  → { profile }            (null se o usuário ainda não respondeu)
//   POST → { profile } no corpo   (grava; usado no cadastro e em "Ajustar respostas do plano")
// O site só mostra o questionário quando este registro não existe.
const { keys, withRedis, send, readBody, getSessionUser } = require('./_lib/core');

function clean(p) {
  if (!p || typeof p !== 'object') return null;
  const exam = String(p.exam || '');
  const hours = Number(p.hours);
  const restDow = Number(p.restDow);
  const fase2 = String(p.fase2 || '');
  const startDate = String(p.startDate || '');
  if (!/^\d{2}$/.test(exam)) return null;
  if (!(hours >= 1 && hours <= 12)) return null;
  if (!(Number.isInteger(restDow) && restDow >= 0 && restDow <= 6)) return null;
  if (fase2 && !/^f2-[a-z-]+$/.test(fase2)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
  const preDone = Array.isArray(p.preDone)
    ? p.preDone.filter((id) => typeof id === 'string' && /^[a-z0-9-]{3,80}$/.test(id)).slice(0, 3000)
    : [];
  return { exam, hours, restDow, fase2, startDate, preDone, updatedAt: new Date().toISOString() };
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  let profile = null;
  if (req.method === 'POST') {
    const body = readBody(req);
    profile = clean(body && body.profile);
    if (!profile) return send(res, 400, { error: 'invalid_profile' });
  }
  try {
    const result = await withRedis(async (client) => {
      const user = await getSessionUser(client, req);
      if (!user) return { status: 401 };
      if (req.method === 'GET') return { status: 200, data: { profile: user.profile || null } };
      const updated = Object.assign({}, user, { profile, onboardedAt: user.onboardedAt || profile.updatedAt });
      await client.set(keys.user(user.username), JSON.stringify(updated));
      return { status: 200, data: { ok: true, profile } };
    });
    if (result.status === 401) return send(res, 401, { error: 'unauthorized' });
    return send(res, 200, result.data);
  } catch (err) {
    return send(res, 500, { error: 'server_error', message: String((err && err.message) || err) });
  }
};
