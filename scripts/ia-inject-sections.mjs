// P0-5/P0-6 일회성: content 메타에 section 주입 + linux 레벨 재분류(멱등).
// 실행: node scripts/ia-inject-sections.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'content');
const CATEGORIES = ['aws-certs', 'en']; // 현재 콘텐츠 트리(주제+언어 혼재)
const LINUX_SLUG = 'linux-master-1';

// 자격증 slug → 섹션. 현재는 linux-master-1만 linux, 나머지 aws.
const sectionOf = (slug) => (slug === LINUX_SLUG ? 'linux' : 'aws');

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}
async function writeJson(p, obj) {
  await fs.writeFile(p, JSON.stringify(obj, null, 2) + '\n');
}

let changed = 0;

for (const category of CATEGORIES) {
  const idxPath = path.join(ROOT, category, 'index.json');
  let idx;
  try {
    idx = await readJson(idxPath);
  } catch {
    console.log(`- skip ${category} (no index.json)`);
    continue;
  }

  for (const entry of idx.certs ?? []) {
    const section = sectionOf(entry.slug);
    // index.json 엔트리 갱신
    if (entry.section !== section) { entry.section = section; changed++; }
    if (entry.slug === LINUX_SLUG && entry.level === 'professional') { entry.level = 'grade-1'; changed++; }

    // meta.json 갱신
    const metaPath = path.join(ROOT, category, entry.slug, 'meta.json');
    try {
      const meta = await readJson(metaPath);
      let mChanged = false;
      if (meta.section !== section) { meta.section = section; mChanged = true; }
      if (entry.slug === LINUX_SLUG && meta.level === 'professional') { meta.level = 'grade-1'; mChanged = true; }
      if (mChanged) { await writeJson(metaPath, meta); changed++; console.log(`  meta ${category}/${entry.slug} → section=${section}${meta.level === 'grade-1' ? ' level=grade-1' : ''}`); }
    } catch {
      console.log(`  ! ${category}/${entry.slug}/meta.json 없음(스킵)`);
    }
  }
  await writeJson(idxPath, idx);
  console.log(`✓ ${category}: ${idx.certs?.length ?? 0} certs 처리`);
}

console.log(`\n총 변경 필드: ${changed} (멱등 — 재실행 시 0)`);
