// TO_CHAR·TO_DATE 의 형식 문자열. NLS_DATE_LANGUAGE=AMERICAN 기준(요일·월 이름이 영어).
import { DAY_MS, OraError, SqlDate, dateOf, parseDefaultDate } from './values';

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** 형식 요소. 긴 것부터 맞춘다(MONTH 가 MON 보다 먼저). */
const DATE_ELEMENTS = ['YYYY', 'SYYYY', 'RRRR', 'YYY', 'MONTH', 'HH24', 'HH12', 'A.M.', 'P.M.', 'YY', 'RR', 'MM', 'MON', 'DDD', 'DD', 'DAY', 'DY', 'HH', 'MI', 'SS', 'AM', 'PM', 'WW', 'Q', 'D', 'W', 'Y', 'J'];

interface Piece {
  el?: string;
  /** 원문 표기(대소문자: Month → November) */
  raw: string;
  fm: boolean;
}

function splitDateFormat(fmt: string): Piece[] {
  const out: Piece[] = [];
  let fm = false;
  let i = 0;
  while (i < fmt.length) {
    if (fmt[i] === '"') {
      const close = fmt.indexOf('"', i + 1);
      const end = close < 0 ? fmt.length : close;
      out.push({ raw: fmt.slice(i + 1, end), fm });
      i = end + 1;
      continue;
    }
    const up = fmt.slice(i).toUpperCase();
    if (up.startsWith('FM')) {
      fm = !fm;
      i += 2;
      continue;
    }
    const el = DATE_ELEMENTS.find((e) => up.startsWith(e));
    if (el) {
      out.push({ el, raw: fmt.slice(i, i + el.length), fm });
      i += el.length;
      continue;
    }
    if (/[-/,.;:\s]/.test(fmt[i])) {
      out.push({ raw: fmt[i], fm });
      i++;
      continue;
    }
    throw new OraError('ORA-01821', 'date format not recognized');
  }
  return out;
}

/** 대소문자 따라가기: MONTH → NOVEMBER, Month → November, month → november */
function caseLike(raw: string, word: string): string {
  if (raw === raw.toUpperCase()) return word.toUpperCase();
  if (raw[0] === raw[0].toUpperCase() && raw.slice(1) === raw.slice(1).toLowerCase()) return word[0] + word.slice(1).toLowerCase();
  if (raw[0] === raw[0].toUpperCase()) return word[0] + word.slice(1).toLowerCase();
  return word.toLowerCase();
}


export function formatDate(d: SqlDate, fmt: string): string {
  const t = new Date(d.ms);
  const y = t.getUTCFullYear();
  const mo = t.getUTCMonth();
  const day = t.getUTCDate();
  const h = t.getUTCHours();
  const dow = t.getUTCDay();
  const yearStart = Date.UTC(y, 0, 1);
  const doy = Math.floor((Date.UTC(y, mo, day) - yearStart) / DAY_MS) + 1;
  const num = (n: number, w: number, fm: boolean) => (fm ? String(n) : String(n).padStart(w, '0'));
  return splitDateFormat(fmt)
    .map(({ el, raw, fm }) => {
      switch (el) {
        case undefined:
          return raw;
        case 'YYYY':
        case 'SYYYY':
        case 'RRRR':
          return num(y, 4, fm);
        case 'YYY':
          return num(y % 1000, 3, fm);
        case 'YY':
        case 'RR':
          return num(y % 100, 2, fm);
        case 'Y':
          return String(y % 10);
        case 'MM':
          return num(mo + 1, 2, fm);
        case 'MON':
          return caseLike(raw, MONTHS[mo].slice(0, 3));
        case 'MONTH': {
          const w = caseLike(raw, MONTHS[mo]);
          return fm ? w : w.padEnd(9, ' ');
        }
        case 'DD':
          return num(day, 2, fm);
        case 'DDD':
          return num(doy, 3, fm);
        case 'D':
          return String(dow + 1);
        case 'DY':
          return caseLike(raw, DAYS[dow].slice(0, 3));
        case 'DAY': {
          const w = caseLike(raw, DAYS[dow]);
          return fm ? w : w.padEnd(9, ' ');
        }
        case 'HH':
        case 'HH12':
          return num(h % 12 === 0 ? 12 : h % 12, 2, fm);
        case 'HH24':
          return num(h, 2, fm);
        case 'MI':
          return num(t.getUTCMinutes(), 2, fm);
        case 'SS':
          return num(t.getUTCSeconds(), 2, fm);
        case 'AM':
        case 'PM':
          return caseLike(raw, h < 12 ? 'AM' : 'PM');
        case 'A.M.':
        case 'P.M.':
          return caseLike(raw, h < 12 ? 'A.M.' : 'P.M.');
        case 'Q':
          return String(Math.floor(mo / 3) + 1);
        case 'WW':
          return num(Math.floor((doy - 1) / 7) + 1, 2, fm);
        case 'W':
          return String(Math.floor((day - 1) / 7) + 1);
        case 'J':
          return String(Math.floor(d.ms / DAY_MS) + 2440588);
        default:
          return raw;
      }
    })
    .join('');
}

/** TO_DATE. 형식이 없으면 NLS 기본(YYYY-MM-DD)으로 읽는다. 구분 문자는 Oracle 처럼 느슨하게 맞춘다. */
export function parseDate(s: string, fmt: string | undefined): SqlDate {
  if (fmt === undefined) return parseDefaultDate(s.replace(/[/.]/g, '-'));
  const pieces = splitDateFormat(fmt);
  let i = 0;
  let y = new Date().getUTCFullYear();
  let mo = new Date().getUTCMonth() + 1; // Oracle: 형식에 없는 월은 현재 월
  let day = 1;
  let h = 0;
  let mi = 0;
  let ss = 0;
  let pm: boolean | null = null;
  const readDigits = (max: number) => {
    const m = new RegExp(`^\\d{1,${max}}`).exec(s.slice(i));
    if (!m) throw new OraError('ORA-01858', 'a non-numeric character was found where a numeric was expected');
    i += m[0].length;
    return Number(m[0]);
  };
  for (const p of pieces) {
    if (!p.el) {
      // 구분 문자: 입력 쪽 구분 문자를 건너뛴다(Oracle 은 - 와 / 를 가리지 않는다).
      while (i < s.length && /[^A-Za-z0-9]/.test(s[i])) i++;
      continue;
    }
    while (i < s.length && /\s/.test(s[i])) i++;
    switch (p.el) {
      case 'YYYY':
      case 'SYYYY':
      case 'RRRR':
        y = readDigits(4);
        break;
      case 'YY': {
        const n = readDigits(2);
        y = Math.floor(new Date().getUTCFullYear() / 100) * 100 + n;
        break;
      }
      case 'RR': {
        const n = readDigits(2);
        // 현재 연도 끝 두 자리가 0~49 일 때: 00~49 → 이번 세기, 50~99 → 지난 세기
        const cur = new Date().getUTCFullYear();
        const century = Math.floor(cur / 100) * 100;
        y = cur % 100 < 50 ? (n < 50 ? century + n : century - 100 + n) : n < 50 ? century + 100 + n : century + n;
        break;
      }
      case 'MM':
        mo = readDigits(2);
        break;
      case 'MON':
      case 'MONTH': {
        const rest = s.slice(i).toUpperCase();
        const idx = MONTHS.findIndex((m) => rest.startsWith(m) || rest.startsWith(m.slice(0, 3)));
        if (idx < 0) throw new OraError('ORA-01843', 'An invalid month was specified.');
        i += rest.startsWith(MONTHS[idx]) ? MONTHS[idx].length : 3;
        mo = idx + 1;
        break;
      }
      case 'DD':
        day = readDigits(2);
        break;
      case 'HH':
      case 'HH12':
      case 'HH24':
        h = readDigits(2);
        break;
      case 'MI':
        mi = readDigits(2);
        break;
      case 'SS':
        ss = readDigits(2);
        break;
      case 'AM':
      case 'PM': {
        const w = s.slice(i, i + 2).toUpperCase();
        pm = w === 'PM';
        i += 2;
        break;
      }
      default:
        throw new OraError('ORA-01821', 'date format not recognized');
    }
  }
  if (s.slice(i).trim()) throw new OraError('ORA-01830', 'date format picture ends before converting entire input string');
  if (pm !== null && h <= 12) h = (h % 12) + (pm ? 12 : 0);
  if (mo < 1 || mo > 12) throw new OraError('ORA-01843', 'An invalid month was specified.');
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (day < 1 || day > last) throw new OraError('ORA-01847', 'day of month must be between 1 and last day of month');
  if (h > 23) throw new OraError('ORA-01850', 'hour must be between 0 and 23');
  if (mi > 59) throw new OraError('ORA-01851', 'minutes must be between 0 and 59');
  if (ss > 59) throw new OraError('ORA-01852', 'seconds must be between 0 and 59');
  return dateOf(y, mo, day, h, mi, ss);
}

/** TO_CHAR(숫자, 형식): 9 0 , . $ L FM 을 다룬다. */
export function formatNumber(n: number, fmt: string): string {
  let f = fmt.toUpperCase();
  const fm = f.startsWith('FM');
  if (fm) f = f.slice(2);
  const dollar = f.includes('$') || f.includes('L');
  // L(지역 통화 기호)은 10자리 칸을 차지한다(AMERICAN 에서는 $ 가 그 칸 오른쪽에 붙는다).
  const localWidth = f.includes('L') ? 9 : 0;
  f = f.replace(/[$L]/g, '');
  if (!/^[90,]*(\.[90]*)?$/.test(f)) throw new OraError('ORA-01481', 'invalid number format model');
  const [intFmt, decFmt = ''] = f.split('.');
  const hasPoint = f.includes('.');
  const decimals = decFmt.length;
  const abs = Math.abs(n);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart = ''] = fixed.split('.');
  const intSlots = intFmt.replace(/,/g, '').length;
  const intDigits = intPart === '0' ? '' : intPart;
  const width = fmt.length + 1 - (fm ? 2 : 0) + localWidth;
  if (intDigits.length > intSlots) return '#'.repeat(width);
  // 정수부: 오른쪽부터 채운다. 0 자리부터 왼쪽은 0 을 강제한다.
  const firstZero = intFmt.indexOf('0');
  let di = intDigits.length - 1;
  let printedLeft = false;
  const chars = [...intFmt];
  const res: string[] = new Array(chars.length).fill(' ');
  for (let k = chars.length - 1; k >= 0; k--) {
    if (chars[k] === ',') {
      res[k] = ',';
      continue;
    }
    if (di >= 0) res[k] = intDigits[di--];
    else if (firstZero >= 0 && k >= firstZero) res[k] = '0';
    else res[k] = ' ';
  }
  // 쉼표는 왼쪽에 숫자가 찍혔을 때만 남긴다.
  for (let k = 0; k < res.length; k++) {
    if (res[k] === ',') res[k] = printedLeft ? ',' : ' ';
    else if (res[k] !== ' ') printedLeft = true;
  }
  let out = res.join('');
  // 값이 0 이고 소수 자리도 없으면 마지막 자리에 0 을 찍는다.
  if (!intDigits && !hasPoint && out.trim() === '') out = out.slice(0, -1) + '0';
  let dec = hasPoint ? `.${decPart}` : '';
  if (fm && hasPoint) {
    const keep = decFmt.lastIndexOf('0') + 1;
    dec = `.${decPart.slice(0, Math.max(keep, decPart.replace(/0+$/, '').length))}`;
    if (dec === '.') dec = intDigits || out.trim() ? '.' : '0.';
  }
  const core = `${n < 0 ? '-' : ''}${dollar ? '$' : ''}${out.trim()}${dec}`;
  // FM 은 앞 공백을 지우고, 아니면 부호 자리까지 포함한 폭(형식 길이 + 1)에 맞춰 오른쪽 정렬한다.
  return fm ? core : core.padStart(width, ' ');
}
