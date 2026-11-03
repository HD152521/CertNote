// SQL 실습장의 값 모델. 기준은 Oracle Database 23ai Free (NLS_DATE_FORMAT='YYYY-MM-DD', NLS_DATE_LANGUAGE=AMERICAN).
// 노트와 실습장이 같은 표시를 쓰도록 날짜는 YYYY-MM-DD 로 보인다.

/** Oracle DATE: 초 단위까지의 날짜·시각. 시간대 없이 UTC 밀리초로 들고 다닌다. */
export class SqlDate {
  constructor(readonly ms: number) {}
}

export type Value = number | string | SqlDate | null;

/** ORA- 오류. 실제 Oracle 문구를 그대로 쓴다(골든과 대조). */
export class OraError extends Error {
  constructor(
    readonly code: string,
    readonly text: string,
    /** 실습장이 덧붙이는 한국어 설명(버전 차이 등). Oracle 출력에는 없다. */
    readonly hint?: string,
  ) {
    super(`${code}: ${text}`);
  }
}

/** 실제 Oracle 에는 있지만 실습장이 아직 흉내 내지 않는 기능. 가짜 ORA 오류 대신 안내한다. */
export class NotSupported extends Error {}

export const DAY_MS = 86_400_000;

export const isNull = (v: Value): v is null => v === null;

export function dateOf(y: number, m: number, d: number, hh = 0, mi = 0, ss = 0): SqlDate {
  return new SqlDate(Date.UTC(y, m - 1, d, hh, mi, ss));
}

/** 날짜 + 일수. Oracle 은 초 단위로 반올림해 저장한다. */
export function addDays(d: SqlDate, days: number): SqlDate {
  return new SqlDate(Math.round((d.ms + days * DAY_MS) / 1000) * 1000);
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function formatDateDefault(d: SqlDate): string {
  const t = new Date(d.ms);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 'YYYY-MM-DD' (NLS 기본) 문자열 → 날짜. 실패하면 Oracle 과 같은 오류. */
export function parseDefaultDate(s: string): SqlDate {
  const m = /^\s*(\d{1,4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?\s*$/.exec(s);
  if (!m) {
    if (/^\s*\d+\W+[A-Za-z]/.test(s) || /^\s*[A-Za-z]/.test(s) || /^\s*\d+-[A-Za-z]/.test(s)) {
      throw new OraError('ORA-01858', 'A non-numeric character was found instead of a numeric character.');
    }
    throw new OraError('ORA-01861', 'literal does not match format string');
  }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12) throw new OraError('ORA-01843', 'An invalid month was specified.');
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d < 1 || d > last) throw new OraError('ORA-01847', 'day of month must be between 1 and last day of month');
  return dateOf(y, mo, d, Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
}

/** 문자 → 숫자 암시적 변환(TO_NUMBER 기본형). */
export function toNumber(v: Value): number | null {
  if (v === null) return null;
  if (typeof v === 'number') return v;
  if (v instanceof SqlDate) throw new OraError('ORA-00932', 'inconsistent datatypes: expected NUMBER got DATE');
  const s = v.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) throw new OraError('ORA-01722', 'unable to convert string value containing %s to a number: %s');
  return Number(s);
}

/** 값 → 문자(암시적 변환, || 연결 등). 숫자는 TO_CHAR 기본형(최대 40자리, 앞 0 생략). */
export function toText(v: Value): string | null {
  if (v === null) return null;
  if (typeof v === 'string') return v;
  if (v instanceof SqlDate) return formatDateDefault(v);
  return numberToText(v);
}

/** TO_CHAR(n) 기본형: 0.5 → .5, -0.25 → -.25, 정수는 그대로. 부동소수 오차는 15자리에서 정리한다. */
export function numberToText(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return String(n);
  let s = String(Number(n.toPrecision(15)));
  if (s.includes('e')) {
    const [mant, exp] = s.split('e');
    s = `${mant.toUpperCase()}E${exp.startsWith('-') ? '-' : '+'}${exp.replace(/^[+-]/, '').padStart(2, '0')}`;
    return s;
  }
  return s.replace(/^(-?)0\./, '$1.');
}

/**
 * SQL*Plus 의 숫자 표시(NUMWIDTH 10). 노트의 결과표가 SQL*Plus 출력이라 실습장도 같게 보인다.
 * 10자 안에 들어가면 그대로, 소수가 길면 10자에 맞게 반올림, 정수부가 넘치면 지수 표기.
 */
export function formatNumberSqlplus(n: number, width = 10): string {
  const plain = numberToText(n);
  if (plain.length <= width && !plain.includes('E')) return plain;
  const neg = n < 0;
  const abs = Math.abs(n);
  const intDigits = abs >= 1 ? Math.floor(Math.log10(abs)) + 1 : 0;
  const room = width - (neg ? 1 : 0);
  if (intDigits <= room && abs >= 1e-9) {
    // 소수점 한 자리를 쓰고 남는 칸만큼 소수 자릿수
    const decimals = Math.max(0, room - intDigits - 1);
    let s = abs.toFixed(decimals);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    s = s.replace(/^0\./, '.');
    if (s.replace('.', '').length > 0 && (s.length <= room)) return (neg ? '-' : '') + s;
  }
  // 지수 표기: 1.2346E+10
  const exp = Math.floor(Math.log10(abs));
  const expText = `E${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
  const mantRoom = room - expText.length;
  const mant = (abs / 10 ** exp).toFixed(Math.max(0, mantRoom - 2));
  return `${neg ? '-' : ''}${mant}${expText}`;
}

/** 화면 표시(SQL*Plus 와 같게). NULL 은 빈 칸. */
export function display(v: Value): string {
  if (v === null) return '';
  if (typeof v === 'number') return formatNumberSqlplus(v);
  if (v instanceof SqlDate) return formatDateDefault(v);
  return v;
}

export type Kind = 'number' | 'string' | 'date' | 'null';
export const kindOf = (v: Value): Kind =>
  v === null ? 'null' : typeof v === 'number' ? 'number' : typeof v === 'string' ? 'string' : 'date';

/**
 * 비교(=, <, BETWEEN, IN, ORDER BY 공통). 한쪽이 숫자면 문자를 숫자로, 한쪽이 날짜면 문자를 날짜로 바꾼다.
 * NULL 이 끼면 null(UNKNOWN).
 */
export function compare(a: Value, b: Value): number | null {
  if (a === null || b === null) return null;
  if (typeof a === 'number' || typeof b === 'number') {
    if (a instanceof SqlDate || b instanceof SqlDate) {
      throw new OraError('ORA-00932', `inconsistent datatypes: expected ${a instanceof SqlDate ? 'DATE' : 'NUMBER'} got ${a instanceof SqlDate ? 'NUMBER' : 'DATE'}`);
    }
    const x = toNumber(a)!;
    const y = toNumber(b)!;
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (a instanceof SqlDate || b instanceof SqlDate) {
    const x = a instanceof SqlDate ? a.ms : parseDefaultDate(a).ms;
    const y = b instanceof SqlDate ? b.ms : parseDefaultDate(b as string).ms;
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** GROUP BY·DISTINCT 의 같음: NULL 끼리도 같은 묶음. */
export function groupKey(v: Value): string {
  if (v === null) return '\u0000N';
  if (typeof v === 'number') return `n${v}`;
  if (v instanceof SqlDate) return `d${v.ms}`;
  return `s${v}`;
}
