// 브랜드 아이콘 생성기. 로고 정의(src/lib/brand.ts, B안)에서 파비콘·PWA·Apple 아이콘을 만든다.
// 실행: node scripts/gen-icons.mjs  → src/app/{icon.svg,apple-icon.png,favicon.ico}, public/icons/*.png
// sharp 는 next 가 함께 설치하는 래스터화 라이브러리다. Node 24 의 타입 제거 덕분에 brand.ts 를 그대로 읽는다.
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { BRAND_NAVY, markSvg } from '../src/lib/brand.ts';

// 작은 크기에서는 선이 뭉개지지 않게 획을 굵힌다.
const strokeFor = (size) => (size <= 16 ? 8 : size <= 48 ? 7 : 6);

async function png(svg, size) {
  return sharp(Buffer.from(svg), { density: 72 * (size / 64) * 4 }).resize(size, size).png().toBuffer();
}

// ICO 컨테이너에 PNG 를 그대로 담는다(Vista 이후 모든 브라우저가 읽는 형식).
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const write = (path, data) => {
  writeFileSync(path, data);
  console.log(`✓ ${path}`);
};

mkdirSync('public/icons', { recursive: true });

write('src/app/icon.svg', `${markSvg()}\n`);

const favicons = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(markSvg({ stroke: strokeFor(size) }), size) })));
write('src/app/favicon.ico', ico(favicons));

// 일반 아이콘: 둥근 타일 그대로(배경 투명). 마스커블·Apple: 가장자리까지 남색으로 채운다(OS 가 모서리를 깎는다).
// 마크의 선은 중심에서 반지름 약 19 안에 있어 마스커블 안전영역(반지름 25.6)을 넘지 않는다.
write('public/icons/icon-192.png', await png(markSvg(), 192));
write('public/icons/icon-512.png', await png(markSvg(), 512));
write('public/icons/icon-maskable-512.png', await png(markSvg({ fullBleedScale: 1 }), 512));
const apple = await png(markSvg({ fullBleedScale: 1 }), 180);
write('public/icons/apple-touch-icon.png', apple);
write('src/app/apple-icon.png', apple);

console.log(`brand navy ${BRAND_NAVY}`);
