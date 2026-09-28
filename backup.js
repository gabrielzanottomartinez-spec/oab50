// POST /api/backup — cópia de segurança automática do progresso do usuário logado.
// O site chama esta rota a cada 10 minutos enquanto está aberto. O servidor só grava
// uma nova cópia se já passaram ~10 minutos desde a última E se os dados mudaram.
// As cópias ficam numa lista no Redis (oab-plano:backups:<usuario>), das mais novas
// para as mais antigas, guardando as últimas KEEP versões.
const crypto = require('crypto');
const { keys, withRedis, send, getSessionUser } = require('./_lib/core');

const MIN_INTERVAL_MS = 10 * 60 * 1000 - 30 * 1000; // 10 min (com folga para o relógio do navegador)
const KEEP = 144; // ~24 h de uso contínuo

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  try {
    const result = await withRedis(async (client) => {
      const user = await getSessionUser(client, req);
      if (!user) return { status: 401 };

      const raw = await client.get(keys.state(user.username));
      if (!raw) return { status: 200, data: { ok: true, created: false, ts: null } };

      const now = Date.now();
      const metaRaw = await client.get(keys.backupMeta(user.username));
      const meta = metaRaw ? JSON.parse(metaRaw) : null;
      if (meta && now - meta.ts < MIN_INTERVAL_MS) {
        return { status: 200, data: { ok: true, created: false, ts: meta.ts } };
      }

      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      let created = false;
      if (!meta || meta.hash !== hash) {
        await client.lPush(keys.backups(user.username), JSON.stringify({ ts: now, state: JSON.parse(raw) }));
        await client.lTrim(keys.backups(user.username), 0, KEEP - 1);
        created = true;
      }
      // Sem mudanças desde a última cópia: ela continua valendo, só atualizamos o horário da verificação.
      await client.set(keys.backupMeta(user.username), JSON.stringify({ ts: now, hash }));
      return { status: 200, data: { ok: true, created, ts: now } };
    });
    if (result.status === 401) return send(res, 401, { error: 'unauthorized' });
    return send(res, 200, result.data);
  } catch (err) {
    return send(res, 500, { error: 'backup_failed', message: String((err && err.message) || err) });
  }
};
