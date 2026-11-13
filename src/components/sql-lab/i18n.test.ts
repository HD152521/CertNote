import { describe, expect, it } from 'vitest';
import { hasHangul, localizeEngineText, localizeHint, sqlStrings, tableNote } from './i18n';
import { ogEnglishSafe } from '@/lib/ogText';
import { sampleDatabase, VISIBLE_TABLES } from '@/lib/sql-lab/data';

const en = sqlStrings('en');
const ko = sqlStrings('ko');

const flatten = (s: ReturnType<typeof sqlStrings>): string[] =>
  Object.values(s).flatMap((v): string[] =>
    typeof v === 'string' ? [v] : typeof v === 'function' ? [v(1, 1, 200), v(5, 5, 200), v(300, 200, 200)].map(String) : Object.values(v),
  );

describe('sql-lab i18n', () => {
  it('영어 사전에는 한글이 한 글자도 없다', () => {
    for (const text of flatten(en)) expect(hasHangul(text), text).toBe(false);
  });

  it('기본값은 ko 이고 기존 한국어 문구를 그대로 돌려준다', () => {
    expect(sqlStrings()).toBe(ko);
    expect(ko.run).toBe('실행');
    expect(ko.running).toBe('실행 중…');
    expect(ko.reset).toBe('처음 문장으로');
    expect(ko.consoleLabel).toBe('SQL 입력');
    expect(ko.schemaTitle).toBe('예제 테이블 보기: EMP · DEPT · SALGRADE');
    expect(ko.noRows).toBe('no rows selected (결과 0행)');
    expect(ko.rowCount(14, 14, 200)).toBe('14행');
    expect(ko.rowCount(300, 200, 200)).toBe('300행 중 200행만 보인다');
    expect(ko.tableRows(4)).toBe('4행');
  });

  it('lang en 이면 영어 문구를 돌려준다', () => {
    expect(en.run).toBe('Run');
    expect(en.rowCount(1, 1, 200)).toBe('1 row');
    expect(en.rowCount(300, 200, 200)).toBe('300 rows (showing the first 200)');
  });

  it('엔진 문구: ko 는 원문 그대로, en 은 한글이 든 문구를 영어로 바꾼다', () => {
    const msg = '실습장이 이 문장을 처리하지 못했어요.';
    expect(localizeEngineText('ko', msg)).toBe(msg);
    expect(hasHangul(localizeEngineText('en', msg))).toBe(false);
    expect(localizeEngineText('en', 'Commit complete.')).toBe('Commit complete.');
    expect(localizeHint('ko', '힌트')).toBe('힌트');
    expect(localizeHint('en', '힌트')).toBeUndefined();
    expect(localizeHint('en', 'Check the column name.')).toBe('Check the column name.');
  });

  it('영어 스키마 패널의 표 설명에는 한글이 없다', () => {
    const db = sampleDatabase();
    for (const name of VISIBLE_TABLES) {
      expect(hasHangul(tableNote('en', name, db[name].note)), name).toBe(false);
      expect(tableNote('ko', name, db[name].note)).toBe(db[name].note);
    }
  });

  it('OG 카드: 영어에서 한글이 든 값은 대체 문구로 바뀐다', () => {
    expect(ogEnglishSafe('개발자', '')).toBe('');
    expect(ogEnglishSafe('Developer', '')).toBe('Developer');
  });
});
