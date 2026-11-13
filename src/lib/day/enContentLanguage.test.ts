import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// 영어판 day 페이지는 전 주차가 색인 대상이다(isIndexableDay). 한글이 섞인 파일이 하나라도 있으면
// lang="en" 선언과 본문 언어가 어긋나 구글이 색인에서 빼던 문제가 되살아나므로, 번역 누락을 여기서 막는다.
const EN_ROOT = path.join(process.cwd(), 'content', 'en');
const HANGUL = /[ㄱ-ㆎ가-힣]/;

function listNotes(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return listNotes(p);
    return /\.(md|json)$/.test(e.name) ? [p] : [];
  });
}

describe('content/en 영어 콘텐츠', () => {
  test('한글이 한 글자도 없다', () => {
    const bad = listNotes(EN_ROOT)
      .filter((p) => HANGUL.test(fs.readFileSync(p, 'utf8')))
      .map((p) => path.relative(EN_ROOT, p));
    expect(bad, `한글이 남은 영어 파일 ${bad.length}개`).toEqual([]);
  });

  test('번역 작업 보고서(TRANSLATION_*.md)를 콘텐츠 폴더에 남기지 않는다', () => {
    const stray = listNotes(EN_ROOT).filter((p) => /TRANSLATION_/.test(path.basename(p)));
    expect(stray.map((p) => path.relative(EN_ROOT, p))).toEqual([]);
  });
});
