import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function resolveAuthSecret(dbPath = './data/taskly.db') {
  if (process.env.TASKLY_AUTH_SECRET && process.env.TASKLY_AUTH_SECRET.length >= 16) {
    return process.env.TASKLY_AUTH_SECRET;
  }
  if (dbPath === ':memory:') {
    return crypto.randomBytes(32).toString('hex');
  }
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  const secretFile = path.join(dir, '.auth-secret');
  if (fs.existsSync(secretFile)) {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretFile, generated, { encoding: 'utf8', mode: 0o600 });
  return generated;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split(':');
  if (parts.length !== 2) return false;
  const [salt, hashHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(hashHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function signToken(payload, secret, ttlSeconds = 7 * 24 * 3600) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const nowSec = Math.floor(Date.now() / 1000);
  const body = base64UrlEncode(JSON.stringify({ ...payload, iat: nowSec, exp: nowSec + ttlSeconds }));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const data = `${header}.${body}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(base64UrlDecode(body));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!parsed.sub || (parsed.exp && parsed.exp < nowSec)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createAuthMiddleware(db, secret) {
  return function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sesi autentikasi tidak ditemukan. Silakan masuk kembali.',
          retryable: false,
        },
      });
    }
    const decoded = verifyToken(match[1], secret);
    if (!decoded) {
      return res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Sesi telah kedaluwarsa atau tidak valid. Silakan masuk kembali.',
          retryable: false,
        },
      });
    }
    const user = db.prepare('SELECT id, email, full_name, avatar_url, created_at FROM users WHERE id = ?').get(decoded.sub);
    if (!user) {
      return res.status(401).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Akun tidak lagi tersedia.',
          retryable: false,
        },
      });
    }
    req.user = user;
    next();
  };
}
