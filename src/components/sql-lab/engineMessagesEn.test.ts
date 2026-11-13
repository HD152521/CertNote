import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { translateEngineMessageEn } from './engineMessagesEn';
import { hasHangul, localizeEngineText } from './i18n';

const ENGINE_DIR = path.join(process.cwd(), 'src', 'lib', 'sql-lab');

/** 엔진 소스에서 사용자에게 보이는 한국어 안내문(NotSupported·note 메시지)을 뽑는다. */
function engineKoreanMessages(): string[] {
  const out: string[] = [];
  for (const f of fs.readdirSync(ENGINE_DIR)) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
    const src = fs.readFileSync(path.join(ENGINE_DIR, f), 'utf8');
    const re = /(?:new NotSupported\(|message:\s*)(['`])((?:\\.|(?!\1).)*)\1/g;
    for (const m of src.matchAll(re)) if (hasHangul(m[2])) out.push(m[2]);
  }
  return out;
}

/** 템플릿 자리(${...})를 실제 값처럼 보이는 표본으로 채운다. */
function fill(msg: string): string {
  return msg
    .replace(/\$\{[^}]*sets\.length[^}]*\}/g, '7')
    .replace(/\$\{[^}]*filtered\.length[^}]*\}/g, '123,456')
    .replace(/\$\{[^}]*MAX[^}]*\}/g, '10,000')
    .replace(/\$\{[^}]*(?:verb|name|first\.value|specV)[^}]*\}/g, 'X')
    .replace(/\$\{[^}]*\}/g, '1');
}

describe('엔진 한국어 안내문의 영어 대응', () => {
  const msgs = engineKoreanMessages();

  test('엔진 소스에서 안내문을 찾았다(추출 정규식이 깨지면 이 테스트가 먼저 실패한다)', () => {
    expect(msgs.length).toBeGreaterThanOrEqual(24);
  });

  test('모든 엔진 한국어 안내문이 개별 영어 문구로 옮겨지고 한글이 없다', () => {
    const missing = msgs.filter((m) => {
      const t = translateEngineMessageEn(fill(m));
      return t === undefined || hasHangul(t);
    });
    expect(missing).toEqual([]);
  });

  test('3초 취소 안내가 미지원 안내로 뭉개지지 않는다', () => {
    const t = localizeEngineText(
      'en',
      '실행이 3초를 넘어서 멈췄어요. 큰 테이블에서 행마다 서브쿼리나 MERGE 의 ON 조건을 다시 계산하고 있는지 확인해 보세요. (이 문장은 취소됐어요.)',
    );
    expect(t).toMatch(/3 seconds/);
    expect(t).toMatch(/cancelled/);
    expect(t).not.toMatch(/not supported/i);
  });

  test('GRANT/FLASHBACK 안내는 원래 뜻을 유지한다', () => {
    expect(localizeEngineText('en', 'GRANT 는 사용자·권한이 여럿인 실제 DB 에서만 의미가 있어서, 실습장(사용자 한 명)에서는 문법만 확인하고 실행하지 않아요.')).toMatch(
      /only checks the syntax/,
    );
    expect(localizeEngineText('en', 'FLASHBACK 는 휴지통(RECYCLEBIN)이 있는 실제 Oracle 에서만 동작해요. 실습장은 DROP 한 테이블을 휴지통에 두지 않아서 되살리기(FLASHBACK TABLE … TO BEFORE DROP)를 흉내 내지 않아요.')).toMatch(
      /recycle bin/,
    );
  });

  test('ko 는 원문 그대로, 알 수 없는 한글 문구는 일반 안내로 대체한다', () => {
    const msg = '실행이 3초를 넘어서 멈췄어요.';
    expect(localizeEngineText('ko', msg)).toBe(msg);
    expect(hasHangul(localizeEngineText('en', '알 수 없는 새 안내예요.'))).toBe(false);
  });
});
