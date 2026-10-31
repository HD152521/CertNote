// 출력 모양: ls 의 날짜·사람이 읽는 크기·여러 칸 배치, stat 의 시각. GNU coreutils 8.30 의 규칙을 그대로 옮겼다.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SIX_MONTHS = (365.2425 * 24 * 60 * 60) / 2;

const local = (t: number, tzOffsetMin: number) => new Date((t + tzOffsetMin * 60) * 1000);
const two = (n: number) => String(n).padStart(2, '0');

/** ls -l 의 날짜 칸: 최근 6개월이면 "Oct 31 09:00", 아니면 "Aug  2  2022". */
export function lsDate(t: number, now: number, tzOffsetMin: number): string {
  const d = local(t, tzOffsetMin);
  const day = String(d.getUTCDate()).padStart(2, ' ');
  const recent = t <= now && now - t < SIX_MONTHS;
  const tail = recent ? `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}` : ` ${d.getUTCFullYear()}`;
  return `${MONTHS[d.getUTCMonth()]} ${day} ${tail}`;
}

/** stat 의 시각: "2026-10-31 09:00:00.000000000 +0900" */
export function statTime(t: number, tzOffsetMin: number): string {
  const d = local(t, tzOffsetMin);
  const sign = tzOffsetMin < 0 ? '-' : '+';
  const off = Math.abs(tzOffsetMin);
  return (
    `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())} ` +
    `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}.000000000 ` +
    `${sign}${two(Math.floor(off / 60))}${two(off % 60)}`
  );
}

/** passwd -S 의 날짜: 2026-10-31 */
export function isoDay(days: number): string {
  const d = new Date(days * 86400 * 1000);
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
}

/** ls -h: 1024 단위, 10 미만이면 소수 한 자리. 항상 올림. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return String(bytes);
  const units = ['K', 'M', 'G', 'T'];
  let v = bytes;
  let u = -1;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  if (v < 10) {
    const up = Math.ceil(v * 10) / 10;
    if (up < 10) return `${up.toFixed(1)}${units[u]}`;
    v = up;
  }
  return `${Math.ceil(v)}${units[u]}`;
}

const TABSIZE = 8;

/** 탭과 공백으로 from 칸에서 to 칸까지 채운다 (ls.c indent). */
function indent(from: number, to: number): string {
  let s = '';
  let pos = from;
  while (pos < to) {
    if (Math.floor(to / TABSIZE) > Math.floor((pos + 1) / TABSIZE)) {
      s += '\t';
      pos += TABSIZE - (pos % TABSIZE);
    } else {
      s += ' ';
      pos += 1;
    }
  }
  return s;
}

const width = (s: string) => [...s].length;

/** ls 가 터미널에 찍는 여러 칸 배치(-C, 세로로 채움). 80칸 기준. */
export function columns(items: string[], lineLength = 80): string {
  const n = items.length;
  if (n === 0) return '';
  const maxCols = Math.min(Math.max(1, Math.floor(lineLength / 3)), n);
  const infos = Array.from({ length: maxCols }, (_, i) => ({
    valid: true,
    lineLen: (i + 1) * 3,
    cols: Array<number>(i + 1).fill(3),
  }));
  items.forEach((item, filesno) => {
    const len = width(item);
    for (let i = 0; i < maxCols; i++) {
      const info = infos[i];
      if (!info.valid) continue;
      const rows = Math.floor((n + i) / (i + 1));
      const idx = Math.floor(filesno / rows);
      const real = len + (idx === i ? 0 : 2);
      if (info.cols[idx] < real) {
        info.lineLen += real - info.cols[idx];
        info.cols[idx] = real;
        info.valid = info.lineLen < lineLength;
      }
    }
  });
  let cols = maxCols;
  while (cols > 1 && !infos[cols - 1].valid) cols--;
  const colWidths = infos[cols - 1].cols;
  const rows = Math.floor(n / cols) + (n % cols !== 0 ? 1 : 0);
  const lines: string[] = [];
  for (let row = 0; row < rows; row++) {
    let line = '';
    let pos = 0;
    let col = 0;
    let filesno = row;
    for (;;) {
      const item = items[filesno];
      const max = colWidths[col++];
      line += item;
      filesno += rows;
      if (filesno >= n) break;
      line += indent(pos + width(item), pos + max);
      pos += max;
    }
    lines.push(line);
  }
  return `${lines.join('\n')}\n`;
}

export const padLeft = (s: string | number, w: number) => String(s).padStart(w, ' ');
export const padRight = (s: string | number, w: number) => String(s).padEnd(w, ' ');
