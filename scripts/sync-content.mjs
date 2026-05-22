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
    for (let d = 1; d <= 5; d++) {
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
  await fs.writeFile(
    path.join(DEST_BASE, 'index.json'),
    JSON.stringify(
      {
        category: 'aws-certs',
        title: 'AWS Certification',
        certs: CERTS.map((c) => ({
          slug: c.slug,
          code: c.code,
          level: c.level,
          name: c.name,
          weeks: c.weeks,
          order: c.order,
        })),
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`\nTotal day.md: ${results.reduce((s, r) => s + r.dayCount, 0)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
