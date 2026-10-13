// 스펙 -> public/diagrams/*.svg 생성
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { specs } from './specs.mjs';

const OUT = path.join(process.cwd(), 'public', 'diagrams');
mkdirSync(OUT, { recursive: true });

let n = 0;
for (const [key, s] of Object.entries(specs)) {
  const svg = s.svg();
  writeFileSync(path.join(OUT, `${key}.svg`), svg, 'utf8');
  console.log(`  ${key}.svg  (${svg.length}B)  <- ${s.src}`);
  n++;
}
console.log(`[diagrams] ${n}개 생성`);
