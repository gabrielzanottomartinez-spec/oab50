// api/_lib/core.js — utilidades compartilhadas pelas funções da pasta /api.
// (Pastas e arquivos começando com "_" não viram rotas na Vercel.)
const { createClient } = require('redis');
const crypto = require('crypto');

const PREFIX = 'oab-plano:';
const SESSION_COOKIE = 'oab_session';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 dias
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

const keys = {
  user: (u) => `${PREFIX}user:${u}`,
  state: (u) => `${PREFIX}state:${u}`,
  // guardamos só o hash do token de sessão, nunca o token em si
  session: (token) => `${PREFIX}session:${crypto.createHash('sha256').update(token).digest('hex')}`,
  loginFail: (u) => `${PREFIX}loginfail:${u}`
};

async function withRedis(fn) {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL não configurada — conecte um banco Redis ao projeto na Vercel.');
  const client = createClient({ url });
  client.on('error', () => {}); // evita que erros de conexão derrubem a função sem resposta
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.quit().catch(() => {});
  }
}

function send(res, status, obj) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(obj);
}

function readBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  return body && typeof body === 'object' ? body : null;
}

function normalizeUsername(u) {
  return String(u || '').trim().toLowerCase();
}

/* ---------- Senhas (scrypt nativo do Node, sem dependência extra) ---------- */
function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, 64, (err, derived) => {
      if (err) return reject(err);
      resolve({ salt: salt.toString('hex'), hash: derived.toString('hex') });
    });
  });
}

async function verifyPassword(password, saltHex, hashHex) {
  const { hash } = await hashPassword(password, saltHex);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(hashHex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- Sessões (token aleatório em cookie HttpOnly) ---------- */
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function setSessionCookie(req, res, token, maxAge) {
  // "Secure" em produção; em testes locais via http://localhost ele é omitido.
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '');
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token ? encodeURIComponent(token) : ''}; Path=/; HttpOnly;${local ? '' : ' Secure;'} SameSite=Lax; Max-Age=${maxAge}`
  );
}

async function createSession(client, req, res, username) {
  const token = crypto.randomBytes(32).toString('hex');
  await client.set(keys.session(token), username, { EX: SESSION_TTL });
  setSessionCookie(req, res, token, SESSION_TTL);
}

async function destroySession(client, req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) await client.del(keys.session(token));
  setSessionCookie(req, res, '', 0);
}

// Retorna o usuário logado ({ name, username, ... }) ou null.
async function getSessionUser(client, req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const username = await client.get(keys.session(token));
  if (!username) return null;
  const raw = await client.get(keys.user(username));
  return raw ? JSON.parse(raw) : null;
}

function publicUser(u) {
  return { name: u.name, username: u.username };
}

module.exports = {
  keys, USERNAME_RE, withRedis, send, readBody, normalizeUsername,
  hashPassword, verifyPassword, createSession, destroySession,
  getSessionUser, publicUser
};
