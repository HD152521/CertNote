// 콘텐츠 다이어그램 SVG 생성기.
//
// ASCII 다이어그램 중 '그림'에 해당하는 것(아키텍처·중첩·흐름·축그래프)을 SVG로 만든다.
// 주석/분해도(문자열 위에 └── 로 자리를 가리키는 것)와 ASCII 표는 대상이 아니다 —
// 전자는 모노스페이스 격자 위에서만 성립하고, 후자는 마크다운 표가 정답이다.
//
// 스펙(JSON) → SVG. 손으로 SVG 를 쓰지 않는 이유는 85개를 개별 작성하면
// 색·여백·글꼴이 제각각이 되기 때문이다. 여기 상수를 한 곳에서 관리한다.
//
// 색은 .article pre(globals.css)와 맞춘다 — 코드블록이 라이트/다크 모두 다크 카드로
// 통일돼 있어서, 같은 톤으로 그리면 <img> 라 테마 변수를 못 읽는 문제가 사라진다.

export const T = {
  bg: '#22272e',
  border: '#373e47',
  grid: '#2d333b',
  axis: '#545d68',
  text: '#adbac7',
  muted: '#768390',
  accent: '#6cb6ff', // 파랑 — 주 흐름
  warn: '#f0a35e', // 주황 — 고정값·경계
  danger: '#f47067', // 빨강 — 초과·위험
  ok: '#8ddb8c', // 초록 — 정상·허용
  violet: '#dcbdfb',
  font: 'system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif',
};

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function shell(w, h, body, { title, desc }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-labelledby="t d">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<style>
  .bx{fill:${T.bg};stroke:${T.border}}
  .t{fill:${T.text};font:500 14px ${T.font}}
  .m{fill:${T.muted};font:400 12.5px ${T.font}}
  .h{fill:${T.text};font:600 14.5px ${T.font}}
  .ln{stroke:${T.axis};stroke-width:1.5;fill:none}
</style>
<rect class="bx" x="1" y="1" width="${w - 2}" height="${h - 2}" rx="8"/>
${body}
</svg>
`;
}

// 화살표 머리 정의(한 번만 삽입)
const ARROW = (color) =>
  `<marker id="a-${color.slice(1)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`;

/** 중첩(포함 관계): 바깥 → 안쪽 순서로 layers 를 준다 */
export function nest({ title, desc, layers, w = 620 }) {
  // 한 겹 들어갈 때마다 위로 topStep(라벨+설명 자리), 아래로 botStep 만큼 줄어든다.
  // 가장 안쪽 상자가 innerH 는 확보되도록 전체 높이를 역산한다 — 이걸 안 하면
  // 겹이 늘어날수록 안쪽이 납작해져서 글자가 상자 밖으로 삐져나온다.
  const padX = 24,
    topStep = 54,
    botStep = 18,
    innerH = 62;
  const n = layers.length;
  const h = 40 + (n - 1) * (topStep + botStep) + innerH;
  let body = '';
  layers.forEach((L, i) => {
    const x = 20 + i * padX,
      y = 20 + i * topStep;
    const bw = w - 40 - i * padX * 2,
      bh = h - 40 - i * (topStep + botStep);
    const color = L.color || [T.accent, T.violet, T.warn][i % 3];
    body += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="6" fill="${color}" fill-opacity="${0.07 + i * 0.05}" stroke="${color}" stroke-opacity=".55"/>
<text class="h" x="${x + 14}" y="${y + 20}" fill="${color}">${esc(L.label)}</text>`;
    if (L.note) body += `<text class="m" x="${x + 14}" y="${y + 38}">${esc(L.note)}</text>`;
  });
  return shell(w, h, body, { title, desc });
}

/** 세로 흐름: 위에서 아래로 상자를 잇는다 */
export function flowDown({ title, desc, steps, w = 560 }) {
  const bw = 300,
    bh = 52,
    gap = 40;
  const h = 30 + steps.length * (bh + gap);
  let body = ARROW(T.axis);
  steps.forEach((s, i) => {
    const y = 20 + i * (bh + gap),
      x = 40;
    body += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="6" fill="${T.bg}" stroke="${s.color || T.accent}" stroke-opacity=".7"/>
<text class="h" x="${x + 16}" y="${y + 23}">${esc(s.label)}</text>`;
    if (s.sub) body += `<text class="m" x="${x + 16}" y="${y + 41}">${esc(s.sub)}</text>`;
    if (s.note) body += `<text class="m" x="${x + bw + 18}" y="${y + 30}">${esc(s.note)}</text>`;
    if (i < steps.length - 1) {
      const y1 = y + bh,
        y2 = y + bh + gap;
      body += `<line class="ln" x1="${x + bw / 2}" y1="${y1 + 4}" x2="${x + bw / 2}" y2="${y2 - 6}" marker-end="url(#a-${T.axis.slice(1)})"/>`;
      if (s.edge)
        body += `<text class="m" x="${x + bw / 2 + 10}" y="${(y1 + y2) / 2 + 4}">${esc(s.edge)}</text>`;
    }
  });
  return shell(w, h, body, { title, desc });
}

/** 순환 고리: 가로로 늘어놓고 마지막에서 처음으로 되돌아오는 화살표 */
export function cycle({ title, desc, steps, back, w = 700 }) {
  const n = steps.length,
    bw = Math.floor((w - 60 - (n - 1) * 26) / n),
    bh = 50,
    y = 34;
  const h = 190;
  let body = ARROW(T.accent) + ARROW(T.warn);
  steps.forEach((s, i) => {
    const x = 30 + i * (bw + 26);
    body += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="6" fill="${T.accent}" fill-opacity=".1" stroke="${T.accent}" stroke-opacity=".6"/>
<text class="t" x="${x + bw / 2}" y="${y + 31}" text-anchor="middle">${esc(s)}</text>`;
    if (i < n - 1)
      body += `<line x1="${x + bw + 5}" y1="${y + bh / 2}" x2="${x + bw + 21}" y2="${y + bh / 2}" stroke="${T.accent}" stroke-width="1.8" marker-end="url(#a-${T.accent.slice(1)})"/>`;
  });
  const lx = 30 + bw / 2,
    rx = 30 + (n - 1) * (bw + 26) + bw / 2,
    by = 130;
  body += `<path d="M${rx},${y + bh} V${by} H${lx} V${y + bh + 6}" fill="none" stroke="${T.warn}" stroke-width="1.8" stroke-dasharray="5 4" marker-end="url(#a-${T.warn.slice(1)})"/>
<text class="m" x="${(lx + rx) / 2}" y="${by - 9}" text-anchor="middle" fill="${T.warn}">${esc(back)}</text>`;
  return shell(w, h, body, { title, desc });
}

/** 가로 계층 스택: 위가 상위 계층 */
export function stack({ title, desc, layers, w = 620 }) {
  const bh = 44,
    gap = 6;
  const h = 24 + layers.length * (bh + gap);
  let body = '';
  layers.forEach((L, i) => {
    const y = 14 + i * (bh + gap);
    const c = L.color || T.accent;
    body += `<rect x="20" y="${y}" width="${w - 40}" height="${bh}" rx="5" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-opacity=".5"/>
<text class="h" x="36" y="${y + 27}">${esc(L.label)}</text>`;
    if (L.note)
      body += `<text class="m" x="${w - 36}" y="${y + 27}" text-anchor="end">${esc(L.note)}</text>`;
  });
  return shell(w, h, body, { title, desc });
}

export const util = { esc, shell, ARROW };
