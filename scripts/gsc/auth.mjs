// Service-account JWT 인증 (node:crypto + fetch 만 사용). 읽기 전용 스코프(webmasters.readonly).
// 키 경로: env GSC_KEY_PATH (기본 C:\Users\yongsik\.secrets\certnote-gsc.json). 키 내용은 절대 출력하지 않는다.
import fs from 'node:fs';
import crypto from 'node:crypto';

const DEFAULT_KEY = 'C:/Users/yongsik/.secrets/certnote-gsc.json';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const SITE_URL = process.env.GSC_SITE || 'sc-domain:juganlab.com';

let cached = null;

function loadKey() {
  const p = process.env.GSC_KEY_PATH || DEFAULT_KEY;
  let k;
  try { k = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { throw new Error(`키 파일을 읽을 수 없음 (${p}): ${e.code || 'parse error'}`); }
  if (!k.client_email || !k.private_key) throw new Error('키 파일 형식 오류 (client_email/private_key 없음)');
  return k;
}

export async function token() {
  if (cached && cached.exp > Date.now()) return cached.t;
  const k = loadKey();
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' +
    b64({ iss: k.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), k.private_key).toString('base64url');
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error(`인증 실패 HTTP ${r.status} ${j.error || ''}`);
  cached = { t: j.access_token, exp: Date.now() + 3000e3 };
  return cached.t;
}

// 모든 호출은 조회(읽기)만. body 가 있으면 POST(inspect/searchAnalytics 도 POST 이지만 읽기 API).
export async function api(url, body) {
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: 'Bearer ' + (await token()), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 300) }; }
  return { status: r.status, j };
}
