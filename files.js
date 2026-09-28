// /api/files — anexos dos simulados, guardados no Vercel Blob (armazenamento privado).
//   POST   /api/files          corpo = o arquivo (binário); cabeçalhos X-File-Name e Content-Type
//   GET    /api/files?id=...   devolve o arquivo (só para o dono)
//   DELETE /api/files?id=...   apaga o arquivo
// Os arquivos ficam no Blob com acesso privado; a lista de arquivos de cada usuário fica no
// Redis (oab-plano:files:<usuario>). Ninguém acessa o arquivo sem estar logado como o dono.
const crypto = require('crypto');
const { Readable } = require('stream');
const { put, get, del } = require('@vercel/blob');
const { keys, withRedis, send, getSessionUser } = require('./_lib/core');

const MAX_BYTES = 4 * 1024 * 1024; // limite de 4 MB (as funções da Vercel aceitam até 4,5 MB por requisição)
const ALLOWED_EXT = ['pdf', 'doc', 'docx'];
const ACCESS = process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('too_large'), { code: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function safeName(name) {
  return String(name || 'arquivo').replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 150) || 'arquivo';
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      const name = safeName(decodeURIComponent(req.headers['x-file-name'] || ''));
      const ext = (name.split('.').pop() || '').toLowerCase();
      if (ALLOWED_EXT.indexOf(ext) < 0) return send(res, 400, { error: 'invalid_type' });
      const len = parseInt(req.headers['content-length'] || '0', 10);
      if (len > MAX_BYTES) return send(res, 413, { error: 'too_large' });

      const user = await withRedis((client) => getSessionUser(client, req));
      if (!user) return send(res, 401, { error: 'unauthorized' });

      let body;
      try { body = await readRaw(req, MAX_BYTES); }
      catch (e) { return send(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'too_large' : 'read_failed' }); }
      if (!body.length) return send(res, 400, { error: 'empty_file' });

      const id = crypto.randomBytes(16).toString('hex');
      const contentType = String(req.headers['content-type'] || 'application/octet-stream');
      const blob = await put(`simulados/${user.username}/${id}.${ext}`, body, {
        access: ACCESS, contentType, addRandomSuffix: true
      });
      const meta = { id, name, type: contentType, size: body.length, pathname: blob.pathname, url: blob.url, ts: Date.now() };
      await withRedis((client) => client.hSet(keys.files(user.username), id, JSON.stringify(meta)));
      return send(res, 201, { file: { id, name, type: contentType, size: body.length } });
    }

    if (req.method === 'GET' || req.method === 'DELETE') {
      const id = String((req.query && req.query.id) || new URL(req.url, 'http://x').searchParams.get('id') || '');
      if (!/^[a-f0-9]{32}$/.test(id)) return send(res, 400, { error: 'invalid_id' });

      const found = await withRedis(async (client) => {
        const user = await getSessionUser(client, req);
        if (!user) return { status: 401 };
        const raw = await client.hGet(keys.files(user.username), id);
        if (!raw) return { status: 404 };
        const meta = JSON.parse(raw);
        if (req.method === 'DELETE') await client.hDel(keys.files(user.username), id);
        return { status: 200, meta };
      });
      if (found.status !== 200) return send(res, found.status, { error: found.status === 401 ? 'unauthorized' : 'not_found' });
      const meta = found.meta;

      if (req.method === 'DELETE') {
        await del(meta.url).catch(() => {});
        return send(res, 200, { ok: true });
      }

      const result = await get(meta.pathname, { access: ACCESS });
      if (!result || !result.stream) return send(res, 404, { error: 'not_found' });
      res.statusCode = 200;
      res.setHeader('Content-Type', meta.type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(meta.name)}`);
      res.setHeader('Cache-Control', 'private, no-store');
      Readable.fromWeb(result.stream).pipe(res);
      return;
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return send(res, 405, { error: 'method_not_allowed' });
  } catch (err) {
    return send(res, 500, { error: 'files_failed', message: String((err && err.message) || err) });
  }
};
