// PWA 아이콘 생성기. 외부 의존성 없이 zlib만으로 PNG를 직접 인코딩한다.
// 브랜드: 다크 배경(#0a0a0a) + AWS 오렌지(#ff9900) 라운드 사각형에 노트 줄 모티프.
// 실행: node scripts/gen-icons.mjs  → public/icons/*.png
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [0x0a, 0x0a, 0x0a];
const ACCENT = [0xff, 0x99, 0x00];
const LINE = [0x1f, 0x13, 0x00]; // accent-fg(어두운 갈색) — 노트 줄

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10,11,12 = 0 (deflate, adaptive filter, no interlace)
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// 라운드 사각형 내부 여부.
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function drawIcon(size, markScale) {
  const buf = Buffer.alloc(size * size * 4);
  const m = Math.round(size * markScale); // 마크 한 변
  const mx0 = Math.round((size - m) / 2);
  const my0 = Math.round((size - m) / 2);
  const mx1 = mx0 + m;
  const my1 = my0 + m;
  const r = Math.round(m * 0.2);

  // 노트 줄 3개(마크 내부 하단 2/3). [yCenterRatio, widthRatio]
  const lines = [
    [0.42, 0.62],
    [0.58, 0.62],
    [0.74, 0.4],
  ];
  const lineH = Math.max(2, Math.round(m * 0.07));
  const lineX0 = mx0 + Math.round(m * 0.2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let c = BG;
      if (inRoundRect(x, y, mx0, my0, mx1, my1, r)) {
        c = ACCENT;
        for (const [yc, wr] of lines) {
          const ly = my0 + Math.round(m * yc);
          const lx1 = lineX0 + Math.round(m * wr);
          if (y >= ly - lineH / 2 && y <= ly + lineH / 2 && x >= lineX0 && x <= lx1) {
            c = LINE;
            break;
          }
        }
      }
      const i = (y * size + x) * 4;
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      buf[i + 3] = 0xff;
    }
  }
  return encodePng(size, size, buf);
}

mkdirSync('public/icons', { recursive: true });
// 일반 아이콘은 마크 60%, 마스커블은 안전영역 고려 48%.
const targets = [
  ['icon-192.png', 192, 0.6],
  ['icon-512.png', 512, 0.6],
  ['icon-maskable-512.png', 512, 0.48],
  ['apple-touch-icon.png', 180, 0.62],
];
for (const [name, size, scale] of targets) {
  writeFileSync(`public/icons/${name}`, drawIcon(size, scale));
  console.log(`✓ public/icons/${name} (${size}px)`);
}
