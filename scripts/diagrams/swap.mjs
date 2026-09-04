// 원본 ASCII 코드블록을 SVG 이미지 참조로 교체한다.
// 안전장치: 교체 대상 블록의 첫 줄이 기대한 문자열로 시작하는지 확인하고,
// 하나도 못 찾거나 여러 개 찾으면 중단한다(엉뚱한 블록을 지우는 사고 방지).
import { readFileSync, writeFileSync } from 'node:fs';

export function swap(file, { anchor, alt, svg }) {
  const src = readFileSync(file, 'utf8');
  // 콘텐츠 파일은 CRLF/LF 가 섞여 있다(git autocrlf). \r 을 허용하지 않으면 조용히 0개 매치된다.
  const re = /```[a-z]*\r?\n([\s\S]*?)```/g;
  const hits = [];
  let m;
  while ((m = re.exec(src))) if (m[1].includes(anchor)) hits.push(m);
  if (hits.length !== 1)
    throw new Error(`${file}: anchor "${anchor}" 가 ${hits.length}개 매치 (1개여야 함)`);
  const h = hits[0];
  const out = src.slice(0, h.index) + `![${alt}](/diagrams/${svg}.svg)` + src.slice(h.index + h[0].length);
  writeFileSync(file, out, 'utf8');
  return h[0].split('\n').length;
}
