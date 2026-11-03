// 단일행 함수(문자·숫자·날짜·변환·NULL). 집계 함수는 exec.ts 에 있다.
import { formatDate, formatNumber, parseDate } from './formats';
import { DAY_MS, NotSupported, OraError, SqlDate, addDays, compare, dateOf, toNumber, toText, type Value } from './values';

type Fn = (args: Value[]) => Value;

const argCount = (name: string, args: Value[], min: number, max = min) => {
  void name;
  if (args.length >= min && args.length <= max) return;
  // 인자 수가 정해진 함수(NVL·LOWER·ADD_MONTHS)는 Oracle 이 ORA-00909 를, 범위가 있는 함수(SUBSTR)는 00938·00939 를 낸다.
  if (min === max) throw new OraError('ORA-00909', 'invalid number of arguments');
  if (args.length < min) throw new OraError('ORA-00938', 'not enough arguments for function');
  throw new OraError('ORA-00939', 'too many arguments for function');
};

const anyNull = (args: Value[]) => args.some((a) => a === null);
const num = (v: Value) => toNumber(v) as number;
const str = (v: Value) => toText(v) as string;
/** Oracle 은 빈 문자열을 NULL 로 다룬다. */
const textOrNull = (s: string): Value => (s === '' ? null : s);

function asDate(v: Value): SqlDate {
  if (v instanceof SqlDate) return v;
  if (typeof v === 'number') throw new OraError('ORA-00932', 'inconsistent datatypes: expected DATE got NUMBER');
  return parseDate(v as string, undefined);
}

function roundTo(n: number, digits: number, mode: 'round' | 'trunc'): number {
  const f = 10 ** digits;
  const scaled = n * f;
  // 이진 부동소수 오차(1.005*100=100.49999…) 를 지우고 자른다.
  const fixed = Number(scaled.toPrecision(15));
  const r = mode === 'round' ? Math.sign(fixed) * Math.round(Math.abs(fixed)) : Math.trunc(fixed);
  return Number((r / f).toPrecision(15));
}

const ymd = (d: SqlDate) => {
  const t = new Date(d.ms);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, day: t.getUTCDate(), rest: d.ms - Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) };
};
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function addMonths(d: SqlDate, n: number): SqlDate {
  const { y, m, day, rest } = ymd(d);
  const total = y * 12 + (m - 1) + Math.trunc(n);
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  // 원래 날이 그달 말일이면 결과도 말일
  const nd = day === lastDayOf(y, m) ? lastDayOf(ny, nm) : Math.min(day, lastDayOf(ny, nm));
  return new SqlDate(Date.UTC(ny, nm - 1, nd) + rest);
}

function monthsBetween(a: SqlDate, b: SqlDate): number {
  const x = ymd(a);
  const y = ymd(b);
  const months = (x.y - y.y) * 12 + (x.m - y.m);
  // 같은 날이거나 둘 다 말일이면 정수
  if (x.day === y.day || (x.day === lastDayOf(x.y, x.m) && y.day === lastDayOf(y.y, y.m))) return months;
  const days = x.day - y.day + (x.rest - y.rest) / DAY_MS;
  return months + days / 31;
}

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

function truncDate(d: SqlDate, fmt: string | null, round: boolean): SqlDate {
  const f = (fmt ?? 'DD').toUpperCase();
  const { y, m } = ymd(d);
  const dayStart = Math.floor(d.ms / DAY_MS) * DAY_MS;
  if (['DD', 'DDD', 'J'].includes(f)) return new SqlDate(round ? Math.round(d.ms / DAY_MS) * DAY_MS : dayStart);
  if (['MM', 'MON', 'MONTH', 'RM'].includes(f)) {
    const first = Date.UTC(y, m - 1, 1);
    if (!round) return new SqlDate(first);
    return new SqlDate(new Date(dayStart).getUTCDate() >= 16 ? Date.UTC(y, m, 1) : first);
  }
  if (['YYYY', 'YYY', 'YY', 'Y', 'YEAR', 'SYYYY', 'SYEAR'].includes(f)) {
    const first = Date.UTC(y, 0, 1);
    if (!round) return new SqlDate(first);
    return new SqlDate(m >= 7 ? Date.UTC(y + 1, 0, 1) : first);
  }
  if (['HH', 'HH12', 'HH24'].includes(f)) return new SqlDate(Math.floor(d.ms / 3_600_000) * 3_600_000);
  if (f === 'MI') return new SqlDate(Math.floor(d.ms / 60_000) * 60_000);
  if (f === 'Q') {
    const qm = Math.floor((m - 1) / 3) * 3;
    return new SqlDate(Date.UTC(y, qm, 1));
  }
  throw new OraError('ORA-01898', 'too many precision specifiers');
}

export const FUNCTIONS: Record<string, Fn> = {
  // ── 문자 ──
  LOWER: (a) => (argCount('LOWER', a, 1), a[0] === null ? null : str(a[0]).toLowerCase()),
  UPPER: (a) => (argCount('UPPER', a, 1), a[0] === null ? null : str(a[0]).toUpperCase()),
  INITCAP: (a) => {
    argCount('INITCAP', a, 1);
    if (a[0] === null) return null;
    return str(a[0]).toLowerCase().replace(/(^|[^A-Za-z0-9])([a-z])/g, (_, p, c: string) => p + c.toUpperCase());
  },
  CONCAT: (a) => {
    argCount('CONCAT', a, 2);
    return textOrNull((toText(a[0]) ?? '') + (toText(a[1]) ?? ''));
  },
  LENGTH: (a) => (argCount('LENGTH', a, 1), a[0] === null ? null : [...str(a[0])].length),
  LENGTHB: (a) => (argCount('LENGTHB', a, 1), a[0] === null ? null : new TextEncoder().encode(str(a[0])).length),
  SUBSTR: (a) => {
    argCount('SUBSTR', a, 2, 3);
    if (anyNull(a)) return null;
    const s = [...str(a[0])];
    let pos = Math.trunc(num(a[1]));
    if (pos === 0) pos = 1;
    const from = pos > 0 ? pos - 1 : s.length + pos;
    if (from < 0 || from >= s.length) return null;
    const len = a.length > 2 ? Math.trunc(num(a[2])) : s.length;
    if (len < 1) return null;
    return textOrNull(s.slice(from, from + len).join(''));
  },
  INSTR: (a) => {
    argCount('INSTR', a, 2, 4);
    if (anyNull(a)) return null;
    const s = str(a[0]);
    const sub = str(a[1]);
    const pos = a.length > 2 ? Math.trunc(num(a[2])) : 1;
    const occ = a.length > 3 ? Math.trunc(num(a[3])) : 1;
    if (occ < 1) throw new OraError('ORA-01428', `argument '${occ}' is out of range`);
    if (pos === 0) return 0;
    let found = 0;
    if (pos > 0) {
      for (let i = pos - 1; i <= s.length - sub.length; i++) if (s.startsWith(sub, i) && ++found === occ) return i + 1;
    } else {
      for (let i = s.length + pos; i >= 0; i--) if (s.startsWith(sub, i) && ++found === occ) return i + 1;
    }
    return 0;
  },
  LTRIM: (a) => trimSide(a, 'L'),
  RTRIM: (a) => trimSide(a, 'R'),
  LPAD: (a) => pad(a, 'L'),
  RPAD: (a) => pad(a, 'R'),
  REPLACE: (a) => {
    argCount('REPLACE', a, 2, 3);
    if (a[0] === null) return null;
    const from = toText(a[1]);
    if (from === null) return a[0];
    return textOrNull(str(a[0]).split(from).join(toText(a[2] ?? null) ?? ''));
  },
  TRANSLATE: (a) => {
    argCount('TRANSLATE', a, 3);
    if (anyNull(a)) return null;
    const from = [...str(a[1])];
    const to = [...str(a[2])];
    return textOrNull(
      [...str(a[0])]
        .map((c) => {
          const i = from.indexOf(c);
          return i < 0 ? c : (to[i] ?? '');
        })
        .join(''),
    );
  },
  ASCII: (a) => (argCount('ASCII', a, 1), a[0] === null ? null : str(a[0]).charCodeAt(0)),
  CHR: (a) => (argCount('CHR', a, 1), a[0] === null ? null : String.fromCharCode(num(a[0]))),
  REVERSE: () => {
    throw new NotSupported('REVERSE 는 Oracle 에 문서화되지 않은 함수라 실습장에 넣지 않았어요.');
  },

  // ── 숫자 ──
  ROUND: (a) => {
    argCount('ROUND', a, 1, 2);
    if (a[0] instanceof SqlDate) return a[1] === null ? null : truncDate(a[0], a.length > 1 ? str(a[1]) : null, true);
    if (anyNull(a)) return null;
    return roundTo(num(a[0]), a.length > 1 ? Math.trunc(num(a[1])) : 0, 'round');
  },
  TRUNC: (a) => {
    argCount('TRUNC', a, 1, 2);
    if (a[0] instanceof SqlDate) return a[1] === null ? null : truncDate(a[0], a.length > 1 ? str(a[1]) : null, false);
    if (anyNull(a)) return null;
    return roundTo(num(a[0]), a.length > 1 ? Math.trunc(num(a[1])) : 0, 'trunc');
  },
  CEIL: (a) => (argCount('CEIL', a, 1), a[0] === null ? null : Math.ceil(num(a[0]))),
  FLOOR: (a) => (argCount('FLOOR', a, 1), a[0] === null ? null : Math.floor(num(a[0]))),
  MOD: (a) => {
    argCount('MOD', a, 2);
    if (anyNull(a)) return null;
    const [m, n] = [num(a[0]), num(a[1])];
    if (n === 0) return m; // Oracle: MOD(m, 0) = m
    return Number((m - n * Math.trunc(m / n)).toPrecision(15));
  },
  REMAINDER: (a) => {
    argCount('REMAINDER', a, 2);
    if (anyNull(a)) return null;
    const [m, n] = [num(a[0]), num(a[1])];
    if (n === 0) throw new OraError('ORA-01476', 'divisor is equal to zero');
    return Number((m - n * Math.round(m / n)).toPrecision(15));
  },
  ABS: (a) => (argCount('ABS', a, 1), a[0] === null ? null : Math.abs(num(a[0]))),
  SIGN: (a) => (argCount('SIGN', a, 1), a[0] === null ? null : Math.sign(num(a[0]))),
  POWER: (a) => (argCount('POWER', a, 2), anyNull(a) ? null : num(a[0]) ** num(a[1])),
  SQRT: (a) => {
    argCount('SQRT', a, 1);
    if (a[0] === null) return null;
    const n = num(a[0]);
    if (n < 0) throw new OraError('ORA-01428', `argument '${n}' is out of range`);
    return Math.sqrt(n);
  },
  EXP: (a) => (argCount('EXP', a, 1), a[0] === null ? null : Math.exp(num(a[0]))),
  LN: (a) => (argCount('LN', a, 1), a[0] === null ? null : Math.log(num(a[0]))),
  LOG: (a) => (argCount('LOG', a, 2), anyNull(a) ? null : Math.log(num(a[1])) / Math.log(num(a[0]))),

  // ── 날짜 ──
  SYSDATE: () => new SqlDate(Math.floor(Date.now() / 1000) * 1000),
  ADD_MONTHS: (a) => (argCount('ADD_MONTHS', a, 2), anyNull(a) ? null : addMonths(asDate(a[0]), num(a[1]))),
  MONTHS_BETWEEN: (a) => (argCount('MONTHS_BETWEEN', a, 2), anyNull(a) ? null : monthsBetween(asDate(a[0]), asDate(a[1]))),
  LAST_DAY: (a) => {
    argCount('LAST_DAY', a, 1);
    if (a[0] === null) return null;
    const { y, m, rest } = ymd(asDate(a[0]));
    return new SqlDate(Date.UTC(y, m - 1, lastDayOf(y, m)) + rest);
  },
  NEXT_DAY: (a) => {
    argCount('NEXT_DAY', a, 2);
    if (anyNull(a)) return null;
    const d = asDate(a[0]);
    const want = str(a[1]).trim().toUpperCase();
    let idx = typeof a[1] === 'number' ? (num(a[1]) - 1) % 7 : DAY_NAMES.findIndex((n) => n === want || (want.length >= 3 && n.startsWith(want)));
    if (idx < 0 || Number.isNaN(idx)) throw new OraError('ORA-01846', 'not a valid day of the week');
    idx = ((idx % 7) + 7) % 7;
    const cur = new Date(d.ms).getUTCDay();
    const delta = ((idx - cur + 7) % 7) || 7;
    return addDays(d, delta);
  },

  // ── 변환 ──
  TO_CHAR: (a) => {
    argCount('TO_CHAR', a, 1, 2);
    if (a[0] === null) return null;
    if (a.length > 1 && a[1] === null) return null;
    const fmt = a.length > 1 ? str(a[1]) : null;
    if (a[0] instanceof SqlDate) return textOrNull(fmt === null ? toText(a[0])! : formatDate(a[0], fmt));
    if (typeof a[0] === 'number') return fmt === null ? toText(a[0]) : formatNumber(a[0], fmt);
    if (fmt !== null) return formatNumber(num(a[0]), fmt);
    return a[0];
  },
  TO_DATE: (a) => {
    argCount('TO_DATE', a, 1, 2);
    if (anyNull(a)) return null;
    if (a[0] instanceof SqlDate) return a[0];
    return parseDate(str(a[0]), a.length > 1 ? str(a[1]) : undefined);
  },
  TO_NUMBER: (a) => {
    argCount('TO_NUMBER', a, 1, 2);
    if (a[0] === null) return null;
    if (a.length > 1) return toNumber(str(a[0]).replace(/[,$\s]/g, ''));
    return toNumber(a[0]);
  },

  // ── NULL·조건 ──
  NVL: (a) => (argCount('NVL', a, 2), a[0] === null ? a[1] : a[0]),
  NVL2: (a) => (argCount('NVL2', a, 3), a[0] === null ? a[2] : a[1]),
  NULLIF: (a) => (argCount('NULLIF', a, 2), compare(a[0], a[1]) === 0 ? null : a[0]),
  COALESCE: (a) => {
    if (a.length < 2) throw new OraError('ORA-00938', 'not enough arguments for function');
    return a.find((v) => v !== null) ?? null;
  },
  GREATEST: (a) => (a.length === 0 ? null : anyNull(a) ? null : a.reduce((x, y) => ((compare(y, x) ?? 0) > 0 ? y : x))),
  LEAST: (a) => (a.length === 0 ? null : anyNull(a) ? null : a.reduce((x, y) => ((compare(y, x) ?? 0) < 0 ? y : x))),
  DECODE: (a) => {
    if (a.length < 3) throw new OraError('ORA-00938', 'not enough arguments for function');
    const [base, ...rest] = a;
    for (let i = 0; i + 1 < rest.length; i += 2) {
      // DECODE 는 NULL 과 NULL 을 같다고 본다(= 비교와 다르다).
      if ((base === null && rest[i] === null) || compare(base, rest[i]) === 0) return rest[i + 1];
    }
    return rest.length % 2 === 1 ? rest[rest.length - 1] : null;
  },
};

/** 인자 없이 쓰는 함수(SYSDATE 는 괄호 없이 쓴다) */
export const NILADIC = new Set(['SYSDATE', 'CURRENT_DATE', 'SYSTIMESTAMP', 'USER']);

function trimSide(a: Value[], side: 'L' | 'R'): Value {
  argCount(side === 'L' ? 'LTRIM' : 'RTRIM', a, 1, 2);
  if (anyNull(a)) return null;
  const set = new Set([...(a.length > 1 ? str(a[1]) : ' ')]);
  const s = [...str(a[0])];
  if (side === 'L') {
    let i = 0;
    while (i < s.length && set.has(s[i])) i++;
    return textOrNull(s.slice(i).join(''));
  }
  let j = s.length;
  while (j > 0 && set.has(s[j - 1])) j--;
  return textOrNull(s.slice(0, j).join(''));
}

function pad(a: Value[], side: 'L' | 'R'): Value {
  argCount(side === 'L' ? 'LPAD' : 'RPAD', a, 2, 3);
  if (anyNull(a)) return null;
  const s = [...str(a[0])];
  const n = Math.trunc(num(a[1]));
  if (n < 1) return null;
  // VARCHAR2 한도(4000바이트)를 넘는 결과는 만들지 않는다 — 거대한 문자열로 탭이 멈추지 않게.
  if (n > 4000) throw new NotSupported('LPAD·RPAD 의 길이는 실습장에서 4000 까지만 받아요(VARCHAR2 한도).');
  const fill = [...(a.length > 2 ? str(a[2]) : ' ')];
  if (s.length >= n) return s.slice(0, n).join('');
  const need = n - s.length;
  const padding = Array.from({ length: need }, (_, i) => fill[i % fill.length]).join('');
  return side === 'L' ? padding + s.join('') : s.join('') + padding;
}

export function trimBoth(mode: 'LEADING' | 'TRAILING' | 'BOTH', chars: Value | undefined, arg: Value): Value {
  if (arg === null || chars === null) return null;
  const c = chars === undefined ? ' ' : str(chars);
  if ([...c].length !== 1) throw new OraError('ORA-30001', 'trim set should have only one character');
  let s = str(arg);
  if (mode !== 'TRAILING') while (s.startsWith(c)) s = s.slice(c.length);
  if (mode !== 'LEADING') while (s.endsWith(c)) s = s.slice(0, -c.length);
  return textOrNull(s);
}

export function extractField(field: string, v: Value): Value {
  if (v === null) return null;
  const d = asDate(v);
  const t = new Date(d.ms);
  switch (field) {
    case 'YEAR':
      return t.getUTCFullYear();
    case 'MONTH':
      return t.getUTCMonth() + 1;
    case 'DAY':
      return t.getUTCDate();
    default:
      throw new OraError('ORA-30076', 'invalid extract field for extract source');
  }
}

export { dateOf };
