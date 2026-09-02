// ⚠️⚠️ 실행 전 반드시 읽을 것 — 이 스크립트는 현재 상태에서 실행하면 작업물을 파괴한다. ⚠️⚠️
//
// 1) day.md 덮어쓰기: CERTS 의 5개 트랙(dva·saa·soa·sap·dop)은 이 저장소에서 콘텐츠 보강을 거쳐
//    외부 소스보다 내용이 많다(2026-09-01 실측: saa-c03 week1 전 파일이 repo 쪽이 더 큼,
//    day5 는 36.3KB vs 30.2KB). syncCert() 는 소스를 그대로 copyFile 하므로 실행하면 보강분이 사라진다.
// 2) index.json: 예전에는 CERTS 를 통째로 직렬화해 덮어써서, 이 저장소에서 직접 작성된 7개 트랙
//    (clf·aif·mla·dea·scs·mls·linux-master-1)이 인덱스에서 사라지고 section 도 소실됐다.
//    → 아래 main() 에서 '병합'으로 고쳤다(2026-09-01). 하지만 1)의 위험은 그대로 남아 있다.
//
// 결론: 새 트랙을 외부 저장소에서 처음 들여올 때가 아니면 실행하지 말 것.
// 부분 동기화가 필요하면 CERTS 를 대상 트랙만 남기고 임시로 줄여서 돌릴 것.
// 관련: docs/linux-master-2-plan.md §4-0

// scripts/sync-content.mjs
// 외부 자격증 학습 레포 5개에서 markdown을 webapp/content/aws-certs/ 로 복사합니다.
// 향후 다른 카테고리(k8s 등)는 동일 패턴으로 추가하면 됩니다.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_BASE = process.env.AWS_CERTS_SRC ?? 'C:\\Users\\안용식\\aws-certs';
const DEST_BASE = path.join(ROOT, 'content', 'aws-certs');

const CERTS = [
  {
    sourceRepo: 'AWS_associate_developer',
    slug: 'dva-c02',
    code: 'DVA-C02',
    level: 'associate',
    name: 'Developer - Associate',
    weeks: 13,
    accent: '#FF9900',
    order: 1,
  },
  {
    sourceRepo: 'AWS_associate_solutionArchitect',
    slug: 'saa-c03',
    code: 'SAA-C03',
    level: 'associate',
    name: 'Solutions Architect - Associate',
    weeks: 12,
    accent: '#FF9900',
    order: 2,
  },
  {
    sourceRepo: 'AWS_associate_cloudopsEngineer',
    slug: 'soa-c02',
    code: 'SOA-C02',
    level: 'associate',
    name: 'CloudOps Engineer - Associate',
    weeks: 12,
    accent: '#FF9900',
    order: 3,
  },
  {
    sourceRepo: 'AWS_professional_solutionArchitect',
    slug: 'sap-c02',
    code: 'SAP-C02',
    level: 'professional',
    name: 'Solutions Architect - Professional',
    weeks: 16,
    accent: '#FF9900',
    order: 4,
  },
  {
    sourceRepo: 'AWS_professional_devopsEngineer',
    slug: 'dop-c02',
    code: 'DOP-C02',
    level: 'professional',
    name: 'DevOps Engineer - Professional',
    weeks: 16,
    accent: '#FF9900',
    order: 5,
  },
];

async function rmrf(p) {
  await fs.rm(p, { recursive: true, force: true });
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function copyFile(src, dest) {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

async function syncCert(cert) {
  const srcRoot = path.join(SRC_BASE, cert.sourceRepo);
  const destRoot = path.join(DEST_BASE, cert.slug);

  await rmrf(destRoot);
  await ensureDir(destRoot);

  let dayCount = 0;
  const readmeSrc = path.join(srcRoot, 'README.md');
  try {
    await copyFile(readmeSrc, path.join(destRoot, 'README.md'));
  } catch {
    console.warn(`[${cert.slug}] README.md 없음 — 스킵`);
  }

  for (let w = 1; w <= cert.weeks; w++) {
    for (let d = 1; d <= 10; d++) {
      const src = path.join(srcRoot, `week${w}`, `day${d}.md`);
      try {
        await fs.access(src);
      } catch {
        continue;
      }
      const dest = path.join(destRoot, `week${w}`, `day${d}.md`);
      await copyFile(src, dest);
      dayCount += 1;
    }
  }

  const meta = {
    slug: cert.slug,
    code: cert.code,
    level: cert.level,
    name: cert.name,
    weeks: cert.weeks,
    accent: cert.accent,
    order: cert.order,
    dayCount,
    sourceRepo: cert.sourceRepo,
    syncedAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(destRoot, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

  return { slug: cert.slug, dayCount };
}

async function main() {
  console.log(`Sync source: ${SRC_BASE}`);
  console.log(`Sync target: ${DEST_BASE}\n`);

  const results = [];
  for (const cert of CERTS) {
    const res = await syncCert(cert);
    results.push(res);
    console.log(`  ${res.slug.padEnd(10)} : ${res.dayCount} day.md 복사`);
  }

  // 카테고리 인덱스 (UI에서 자격증 목록 조회용)
  //
  // ⚠️ 반드시 '병합'이어야 한다. 예전에는 CERTS 를 그대로 직렬화해 통째로 덮어썼는데,
  // CERTS 는 외부 소스 저장소(AWS_CERTS_SRC)에서 동기화하는 트랙만 담는다. 그래서 이 저장소에서
  // 직접 작성된 트랙(clf-c02·aif-c01·mla-c01·dea-c01·scs-c03·mls-c01·linux-master-1)은 CERTS 에
  // 없고, 덮어쓰기 방식에서는 sync 한 번에 index 에서 사라졌다. 게다가 CERTS 에는 section 필드가
  // 없어서, 살아남은 항목들도 section 을 잃었다.
  // 그 결과가 치명적이다 — listCerts(section) 이 section 으로 필터하고 [category]/[slug] 는
  // dynamicParams=false 라, index 에서 빠진 자격증은 즉시 진짜 404 가 된다(전 자격증 허브 소실).
  // 이제는 기존 항목을 읽어 slug 기준으로 병합한다: CERTS 항목은 동기화된 값으로 갱신하되
  // section 같은 추가 필드는 보존하고, CERTS 에 없는 항목은 그대로 둔다.
  const indexPath = path.join(DEST_BASE, 'index.json');
  let existing = { category: 'aws-certs', title: 'AWS Certification', certs: [] };
  try {
    existing = JSON.parse(await fs.readFile(indexPath, 'utf8'));
  } catch {
    // 최초 실행이면 빈 인덱스에서 시작한다.
  }
  const bySlug = new Map((existing.certs ?? []).map((c) => [c.slug, c]));
  for (const c of CERTS) {
    // 기존 항목의 추가 필드(section 등)를 남기고 동기화 대상 필드만 덮어쓴다.
    bySlug.set(c.slug, {
      ...(bySlug.get(c.slug) ?? {}),
      slug: c.slug,
      code: c.code,
      level: c.level,
      name: c.name,
      weeks: c.weeks,
      order: c.order,
    });
  }
  const merged = [...bySlug.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const dropped = merged.filter((c) => c.section === undefined).map((c) => c.slug);
  if (dropped.length > 0) {
    console.warn(`  ! section 없는 항목: ${dropped.join(', ')} — ia-inject-sections.mjs 실행 필요`);
  }
  await fs.writeFile(
    indexPath,
    JSON.stringify({ ...existing, category: existing.category ?? 'aws-certs', title: existing.title ?? 'AWS Certification', certs: merged }, null, 2),
    'utf8',
  );
  console.log(`
  index.json: ${merged.length}개 (CERTS ${CERTS.length}개 갱신, 나머지 보존)`);

  console.log(`\nTotal day.md: ${results.reduce((s, r) => s + r.dayCount, 0)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
