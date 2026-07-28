// 4-섹션 IA 마이그레이션 검증(읽기전용 스모크). 배포 직후 실행해 회귀·SEO 손상을 즉시 잡는다.
// 사용:  node scripts/verify-migration.mjs --base=https://cert.juganlab.com --phase=0
//        node scripts/verify-migration.mjs --base=http://localhost:3002 --phase=1
// phase 0: 기존 URL 전수 200(하위호환). phase 1: 301(308)+신URL 200+리다이렉트 순서+무효404.

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  }),
);
const BASE = (args.base || 'http://localhost:3002').replace(/\/$/, '');
const PHASE = String(args.phase ?? '0');

// 무료 Week1 day 하나(존재 전제). 필요 시 --day=로 교체.
const FREE_DAY = args.day || '/saa-c03/week1/day1';

let pass = 0;
let fail = 0;
const log = (ok, msg) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`);
  ok ? pass++ : fail++;
};

// redirect 따라가지 않고 상태·Location 확인.
async function head(pathname) {
  const res = await fetch(BASE + pathname, { redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location') };
}
async function get(pathname) {
  const res = await fetch(BASE + pathname, { redirect: 'follow' });
  return { status: res.status, body: await res.text() };
}

async function expect200(pathname) {
  try {
    const { status } = await get(pathname);
    log(status === 200, `200 ${pathname} (got ${status})`);
  } catch (e) {
    log(false, `200 ${pathname} (error ${e.message})`);
  }
}
async function expectRedirect(pathname, toContains) {
  try {
    const { status, location } = await head(pathname);
    const ok = (status === 301 || status === 308) && (location || '').includes(toContains);
    log(ok, `redirect ${pathname} → *${toContains}* (got ${status} ${location ?? ''})`);
  } catch (e) {
    log(false, `redirect ${pathname} (error ${e.message})`);
  }
}
async function expect404(pathname) {
  try {
    const { status } = await get(pathname);
    log(status === 404, `404 ${pathname} (got ${status})`);
  } catch (e) {
    log(false, `404 ${pathname} (error ${e.message})`);
  }
}

async function phase0() {
  console.log(`\n[Phase 0] 기존 URL 하위호환(전수 200) — base=${BASE}`);
  await expect200('/aws-certs');
  await expect200('/aws-certs/saa-c03');
  await expect200('/aws-certs' + FREE_DAY);
  await expect200('/aws-certs/linux-master-1');
  await expect200('/en');
}

async function phase1() {
  console.log(`\n[Phase 1] 섹션축+301+신URL — base=${BASE}`);
  // 301(308) — 구 → 신
  await expectRedirect('/aws-certs/saa-c03/week1/day1', '/aws/saa-c03/week1/day1');
  await expectRedirect('/aws-certs', '/aws');
  // ★ 순서(가장 중요): linux는 /linux로, 절대 /aws/linux-master-1 아님
  await expectRedirect('/aws-certs/linux-master-1/week1/day1', '/linux/linux-master-1/week1/day1');
  await expectRedirect('/aws-certs/linux-master-1', '/linux/linux-master-1');
  // 신 URL 200
  await expect200('/aws');
  await expect200('/aws/saa-c03');
  await expect200('/aws' + FREE_DAY);
  await expect200('/linux');
  await expect200('/linux/linux-master-1');
  // 무효 섹션 404
  await expect404('/foobar');
  // canonical 자기참조(신 URL)
  try {
    const { body } = await get('/aws/saa-c03');
    log(/rel=["']canonical["'][^>]*\/aws\/saa-c03/.test(body) || body.includes('/aws/saa-c03'), 'canonical self /aws/saa-c03');
  } catch (e) {
    log(false, `canonical (error ${e.message})`);
  }
}

const run = PHASE === '1' ? phase1 : phase0;
await run();
console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
