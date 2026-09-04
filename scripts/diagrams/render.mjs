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
export function nest({ title, desc, layers, below = [], w = 620 }) {
  // 한 겹 들어갈 때마다 위로 topStep(라벨+설명 자리), 아래로 botStep 만큼 줄어든다.
  // 가장 안쪽 상자가 innerH 는 확보되도록 전체 높이를 역산한다 — 이걸 안 하면
  // 겹이 늘어날수록 안쪽이 납작해져서 글자가 상자 밖으로 삐져나온다.
  const padX = 24,
    topStep = 54,
    botStep = 18,
    innerH = 62;
  const n = layers.length;
  // below: 중첩 상자를 떠받치는 토대 계층(아래로 갈수록 하위). 원본 ASCII 가 ▲ 로
  // "이 위에 얹힌다"를 표현하던 것을 화살표 + 상자로 옮긴 것이다.
  const boxH = 38,
    gapA = 16;
  const nestH = 40 + (n - 1) * (topStep + botStep) + innerH;
  // 마지막 토대 상자의 바닥에서 역산한다. 상수만 더하면 상자가 카드 밖으로 잘린다.
  const h = below.length
    ? nestH - 20 + gapA + (below.length - 1) * (boxH + gapA) + boxH + 16
    : nestH;
  let body = below.length ? ARROW(T.axis) : '';
  layers.forEach((L, i) => {
    const x = 20 + i * padX,
      y = 20 + i * topStep;
    const bw = w - 40 - i * padX * 2,
      bh = nestH - 40 - i * (topStep + botStep);
    const color = L.color || [T.accent, T.violet, T.warn][i % 3];
    body += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="6" fill="${color}" fill-opacity="${0.07 + i * 0.05}" stroke="${color}" stroke-opacity=".55"/>
<text class="h" x="${x + 14}" y="${y + 20}" fill="${color}">${esc(L.label)}</text>`;
    if (L.note) body += `<text class="m" x="${x + 14}" y="${y + 38}">${esc(L.note)}</text>`;
  });
  below.forEach((B, i) => {
    const y = nestH - 20 + gapA + i * (boxH + gapA);
    body += `<line class="ln" x1="${w / 2}" y1="${y - 2}" x2="${w / 2}" y2="${y - gapA + 3}" marker-end="url(#a-${T.axis.slice(1)})"/>
<rect x="20" y="${y}" width="${w - 40}" height="${boxH}" rx="5" fill="${T.bg}" stroke="${T.border}"/>
<text class="t" x="36" y="${y + 24}">${esc(B.label)}</text>`;
    if (B.note)
      body += `<text class="m" x="${w - 36}" y="${y + 24}" text-anchor="end">${esc(B.note)}</text>`;
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

/** 팬아웃: 위의 출처 하나에서 아래 여러 갈래로 갈라진다. 필요하면 아래에서 다시 하나로 모은다 */
export function fanout({ title, desc, source, targets, sink, w = 720 }) {
  const n = targets.length;
  const gap = 12;
  const bw = Math.floor((w - 44 - (n - 1) * gap) / n);
  const srcY = 18,
    srcH = 46;
  const tY = 122;
  // 설명 줄 수에 맞춰 상자를 키운다. 고정 높이로 두면 3줄짜리에서 마지막 줄이 잘린다.
  const maxLines = Math.max(...targets.map((t) => (t.lines || []).length), 0);
  const tH = 34 + Math.min(maxLines, 3) * 18 + 8;
  const h = sink ? tY + tH + 78 : tY + tH + 22;
  let body = ARROW(T.axis);
  // 출처
  body += `<rect x="22" y="${srcY}" width="${w - 44}" height="${srcH}" rx="6" fill="${T.accent}" fill-opacity=".12" stroke="${T.accent}" stroke-opacity=".6"/>
<text class="h" x="${w / 2}" y="${srcY + 21}" text-anchor="middle">${esc(source.label)}</text>`;
  if (source.sub)
    body += `<text class="m" x="${w / 2}" y="${srcY + 38}" text-anchor="middle">${esc(source.sub)}</text>`;
  // 분기선
  const busY = srcY + srcH + 24;
  body += `<line class="ln" x1="${w / 2}" y1="${srcY + srcH}" x2="${w / 2}" y2="${busY}"/>`;
  const xs = targets.map((_, i) => 22 + i * (bw + gap) + bw / 2);
  body += `<line class="ln" x1="${xs[0]}" y1="${busY}" x2="${xs[n - 1]}" y2="${busY}"/>`;
  targets.forEach((t, i) => {
    const x = 22 + i * (bw + gap);
    const c = t.color || T.violet;
    body += `<line class="ln" x1="${xs[i]}" y1="${busY}" x2="${xs[i]}" y2="${tY - 6}" marker-end="url(#a-${T.axis.slice(1)})"/>
<rect x="${x}" y="${tY}" width="${bw}" height="${tH}" rx="6" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-opacity=".55"/>
<text class="t" x="${x + bw / 2}" y="${tY + 24}" text-anchor="middle" fill="${c}">${esc(t.label)}</text>`;
    (t.lines || []).slice(0, 3).forEach((ln, k) => {
      body += `<text class="m" x="${x + bw / 2}" y="${tY + 42 + k * 18}" text-anchor="middle">${esc(ln)}</text>`;
    });
  });
  if (sink) {
    const sY = tY + tH + 30;
    body += `<line class="ln" x1="${xs[0]}" y1="${tY + tH}" x2="${xs[0]}" y2="${sY - 12}"/>
<line class="ln" x1="${xs[n - 1]}" y1="${tY + tH}" x2="${xs[n - 1]}" y2="${sY - 12}"/>
<line class="ln" x1="${xs[0]}" y1="${sY - 12}" x2="${xs[n - 1]}" y2="${sY - 12}"/>
<line class="ln" x1="${w / 2}" y1="${sY - 12}" x2="${w / 2}" y2="${sY - 2}" marker-end="url(#a-${T.axis.slice(1)})"/>
<rect x="22" y="${sY}" width="${w - 44}" height="40" rx="6" fill="${T.ok}" fill-opacity=".1" stroke="${T.ok}" stroke-opacity=".5"/>
<text class="t" x="${w / 2}" y="${sY + 25}" text-anchor="middle" fill="${T.ok}">${esc(sink)}</text>`;
  }
  return shell(w, h, body, { title, desc });
}

/** 컨테이너 안에 계층을 쌓는다. stack 에 바깥 상자와 제목을 두른 형태 */
export function boxedStack({ title, desc, container, layers, w = 620 }) {
  const bh = 42,
    gap = 5,
    padT = 52;
  const h = padT + layers.length * (bh + gap) + 18;
  let body = `<rect x="14" y="14" width="${w - 28}" height="${h - 28}" rx="7" fill="${T.accent}" fill-opacity=".05" stroke="${T.accent}" stroke-opacity=".45"/>
<text class="h" x="30" y="${38}" fill="${T.accent}">${esc(container)}</text>`;
  layers.forEach((L, i) => {
    const y = padT + i * (bh + gap);
    const c = L.color || T.text;
    body += `<rect x="30" y="${y}" width="${w - 60}" height="${bh}" rx="4" fill="${T.bg}" stroke="${T.border}"/>
<text class="t" x="44" y="${y + 26}" fill="${c}">${esc(L.label)}</text>`;
    if (L.note)
      body += `<text class="m" x="${w - 44}" y="${y + 26}" text-anchor="end">${esc(L.note)}</text>`;
  });
  return shell(w, h, body, { title, desc });
}

/** 가로 단계 컬럼: 각 단계가 여러 항목을 갖는다. 아래에 공통 기반(footer)을 둘 수 있다 */
export function columns({ title, desc, columns: cols, footer, w = 720 }) {
  const n = cols.length,
    gap = 10;
  const bw = Math.floor((w - 44 - (n - 1) * gap) / n);
  const maxItems = Math.max(...cols.map((c) => c.items.length));
  const bh = 46 + maxItems * 19;
  const y = 20;
  const h = y + bh + (footer ? 66 : 20);
  let body = ARROW(T.accent);
  cols.forEach((c, i) => {
    const x = 22 + i * (bw + gap);
    const col = c.color || T.accent;
    body += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="6" fill="${col}" fill-opacity=".09" stroke="${col}" stroke-opacity=".5"/>
<text class="h" x="${x + bw / 2}" y="${y + 25}" text-anchor="middle" fill="${col}">${esc(c.label)}</text>`;
    c.items.forEach((it, k) => {
      body += `<text class="m" x="${x + bw / 2}" y="${y + 46 + k * 19}" text-anchor="middle">${esc(it)}</text>`;
    });
    if (i < n - 1)
      body += `<line x1="${x + bw + 1}" y1="${y + bh / 2}" x2="${x + bw + gap - 1}" y2="${y + bh / 2}" stroke="${T.accent}" stroke-width="1.6" marker-end="url(#a-${T.accent.slice(1)})"/>`;
  });
  if (footer) {
    const fy = y + bh + 24;
    body += `<rect x="22" y="${fy}" width="${w - 44}" height="34" rx="5" fill="${T.ok}" fill-opacity=".08" stroke="${T.ok}" stroke-opacity=".45"/>
<text class="m" x="${w / 2}" y="${fy + 22}" text-anchor="middle" fill="${T.ok}">${esc(footer)}</text>`;
  }
  return shell(w, h, body, { title, desc });
}

/** 합류: 여러 출처가 하나로 모인다(fanout 의 반대) */
export function merge({ title, desc, sources, result, w = 660 }) {
  const n = sources.length,
    gap = 18;
  const bw = Math.floor((w - 44 - (n - 1) * gap) / n);
  const sY = 18,
    maxL = Math.max(...sources.map((s) => (s.lines || []).length));
  const sH = 34 + maxL * 18;
  const rY = sY + sH + 62;
  const h = rY + 58 + 18;
  let body = ARROW(T.axis);
  const xs = sources.map((_, i) => 22 + i * (bw + gap) + bw / 2);
  sources.forEach((s, i) => {
    const x = 22 + i * (bw + gap);
    const c = s.color || T.violet;
    body += `<rect x="${x}" y="${sY}" width="${bw}" height="${sH}" rx="6" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-opacity=".55"/>
<text class="t" x="${x + bw / 2}" y="${sY + 23}" text-anchor="middle" fill="${c}">${esc(s.label)}</text>`;
    (s.lines || []).forEach((ln, k) => {
      body += `<text class="m" x="${x + bw / 2}" y="${sY + 41 + k * 18}" text-anchor="middle">${esc(ln)}</text>`;
    });
    body += `<line class="ln" x1="${xs[i]}" y1="${sY + sH}" x2="${xs[i]}" y2="${sY + sH + 26}"/>`;
  });
  const busY = sY + sH + 26;
  body += `<line class="ln" x1="${xs[0]}" y1="${busY}" x2="${xs[n - 1]}" y2="${busY}"/>
<line class="ln" x1="${w / 2}" y1="${busY}" x2="${w / 2}" y2="${rY - 6}" marker-end="url(#a-${T.axis.slice(1)})"/>
<rect x="22" y="${rY}" width="${w - 44}" height="58" rx="6" fill="${T.ok}" fill-opacity=".12" stroke="${T.ok}" stroke-opacity=".6"/>
<text class="h" x="${w / 2}" y="${rY + 25}" text-anchor="middle" fill="${T.ok}">${esc(result.label)}</text>`;
  if (result.sub)
    body += `<text class="m" x="${w / 2}" y="${rY + 44}" text-anchor="middle">${esc(result.sub)}</text>`;
  return shell(w, h, body, { title, desc });
}

/** 두 구조를 나란히 비교. 각 열은 위에서 아래로 쌓인 계층 */
export function compareStacks({ title, desc, left, right, w = 660 }) {
  const colW = (w - 60) / 2,
    bh = 44,
    gap = 5,
    top = 44;
  const rows = Math.max(left.layers.length, right.layers.length);
  const h = top + rows * (bh + gap) + 16;
  let body = '';
  [
    [left, 20],
    [right, 40 + colW],
  ].forEach(([side, x]) => {
    body += `<text class="h" x="${x + colW / 2}" y="${28}" text-anchor="middle" fill="${T.muted}">${esc(side.label)}</text>`;
    const off = rows - side.layers.length; // 아래쪽 기준으로 맞춘다(하드웨어가 바닥)
    side.layers.forEach((L, i) => {
      const y = top + (i + off) * (bh + gap);
      const c = L.color || T.accent;
      body += `<rect x="${x}" y="${y}" width="${colW}" height="${bh}" rx="5" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-opacity=".5"/>
<text class="t" x="${x + colW / 2}" y="${y + 27}" text-anchor="middle">${esc(L.label)}</text>`;
    });
  });
  return shell(w, h, body, { title, desc });
}

/** 나란한 두 상자를 이름 붙인 연결선으로 잇는다. 양방향이면 both:true */
export function pair({ title, desc, left, right, link, both = false, w = 660 }) {
  const bw = 250,
    bh = 92,
    y = 46;
  const h = y + bh + 24;
  const lx = 24,
    rx = w - 24 - bw;
  let body = ARROW(T.axis);
  [
    [left, lx],
    [right, rx],
  ].forEach(([s, x]) => {
    const c = s.color || T.accent;
    body += `<text class="m" x="${x + bw / 2}" y="${30}" text-anchor="middle">${esc(s.cap || '')}</text>
<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="6" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-opacity=".55"/>
<text class="h" x="${x + bw / 2}" y="${y + 30}" text-anchor="middle" fill="${c}">${esc(s.label)}</text>`;
    (s.lines || []).slice(0, 2).forEach((ln, k) => {
      body += `<text class="m" x="${x + bw / 2}" y="${y + 52 + k * 18}" text-anchor="middle">${esc(ln)}</text>`;
    });
  });
  const my = y + bh / 2;
  body += `<line class="ln" x1="${lx + bw + 6}" y1="${my}" x2="${rx - 6}" y2="${my}" marker-end="url(#a-${T.axis.slice(1)})"${both ? ` marker-start="url(#a-${T.axis.slice(1)})"` : ''}/>
<text class="m" x="${w / 2}" y="${my - 10}" text-anchor="middle">${esc(link)}</text>`;
  return shell(w, h, body, { title, desc });
}

/** 조건 분기: 입력 -> 판단 -> 두 갈래. 갈래가 다시 합류하면 tail 을 준다 */
export function branch({ title, desc, input, condition, yes, no, tail, w = 660 }) {
  const bw = 268,
    bh = 62;
  const inY = 18,
    dY = 106,
    brY = 178;
  const h = brY + bh + (tail ? 84 : 20);
  const lx = 24,
    rx = w - 24 - bw;
  let body = ARROW(T.axis);
  const iw = w - 48; // 입력에는 긴 호출 문자열이 들어가므로 카드 폭을 다 쓴다
  body += `<rect x="24" y="${inY}" width="${iw}" height="52" rx="6" fill="${T.accent}" fill-opacity=".12" stroke="${T.accent}" stroke-opacity=".6"/>
<text class="h" x="${w / 2}" y="${inY + 22}" text-anchor="middle">${esc(input.label)}</text>`;
  if (input.sub)
    body += `<text class="m" x="${w / 2}" y="${inY + 40}" text-anchor="middle">${esc(input.sub)}</text>`;
  body += `<line class="ln" x1="${w / 2}" y1="${inY + 52}" x2="${w / 2}" y2="${dY - 6}" marker-end="url(#a-${T.axis.slice(1)})"/>
<text class="m" x="${w / 2}" y="${dY + 16}" text-anchor="middle" fill="${T.warn}">${esc(condition)}</text>
<line class="ln" x1="${lx + bw / 2}" y1="${dY + 26}" x2="${rx + bw / 2}" y2="${dY + 26}"/>`;
  [
    [yes, lx, T.ok],
    [no, rx, T.danger],
  ].forEach(([s, x, c]) => {
    body += `<line class="ln" x1="${x + bw / 2}" y1="${dY + 26}" x2="${x + bw / 2}" y2="${brY - 6}" marker-end="url(#a-${T.axis.slice(1)})"/>
<text class="m" x="${x + bw / 2}" y="${dY + 46}" text-anchor="middle" fill="${c}">${esc(s.edge || '')}</text>
<rect x="${x}" y="${brY}" width="${bw}" height="${bh}" rx="6" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-opacity=".55"/>
<text class="t" x="${x + bw / 2}" y="${brY + 26}" text-anchor="middle" fill="${c}">${esc(s.label)}</text>`;
    if (s.sub)
      body += `<text class="m" x="${x + bw / 2}" y="${brY + 46}" text-anchor="middle">${esc(s.sub)}</text>`;
  });
  if (tail) {
    const ty = brY + bh + 30;
    body += `<line class="ln" x1="${lx + bw / 2}" y1="${brY + bh}" x2="${lx + bw / 2}" y2="${ty - 12}"/>
<line class="ln" x1="${rx + bw / 2}" y1="${brY + bh}" x2="${rx + bw / 2}" y2="${ty - 12}"/>
<line class="ln" x1="${lx + bw / 2}" y1="${ty - 12}" x2="${rx + bw / 2}" y2="${ty - 12}"/>
<line class="ln" x1="${w / 2}" y1="${ty - 12}" x2="${w / 2}" y2="${ty - 2}" marker-end="url(#a-${T.axis.slice(1)})"/>
<rect x="24" y="${ty}" width="${w - 48}" height="40" rx="6" fill="${T.bg}" stroke="${T.border}"/>
<text class="t" x="${w / 2}" y="${ty + 25}" text-anchor="middle">${esc(tail)}</text>`;
  }
  return shell(w, h, body, { title, desc });
}

/** 선 그래프. points 는 0~1 정규화 좌표 [[x,y]...] (y 는 위가 1). band 는 상하한 쌍 */
export function lineChart({ title, desc, xLabel, yLabel, series, band, note, w = 700, plotH = 190 }) {
  const L = 62,
    R = 168,
    TOP = 26;
  const pw = w - L - R,
    ph = plotH;
  const h = TOP + ph + 62 + (note ? 22 : 0);
  const X = (t) => L + t * pw;
  const Y = (v) => TOP + (1 - v) * ph;
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
  let body = ARROW(T.axis);
  if (band) {
    const up = band.upper.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`);
    const lo = band.lower.slice().reverse().map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`);
    body += `<polygon points="${up.concat(lo).join(' ')}" fill="${T.accent}" opacity=".13"/>
<path d="${path(band.upper)}" fill="none" stroke="${T.accent}" stroke-width="1.4" stroke-dasharray="5 4" opacity=".8"/>
<path d="${path(band.lower)}" fill="none" stroke="${T.accent}" stroke-width="1.4" stroke-dasharray="5 4" opacity=".8"/>`;
  }
  // 축
  body += `<line class="ln" x1="${L}" y1="${TOP - 6}" x2="${L}" y2="${TOP + ph}"/>
<line class="ln" x1="${L}" y1="${TOP + ph}" x2="${L + pw + 8}" y2="${TOP + ph}"/>
<text class="m" x="${L}" y="${TOP - 12}" text-anchor="middle">${esc(yLabel)}</text>
<text class="m" x="${L + pw + 8}" y="${TOP + ph + 20}" text-anchor="end">${esc(xLabel)}</text>`;
  series.forEach((s, i) => {
    const c = s.color || [T.accent, T.warn, T.danger, T.ok][i % 4];
    body += `<path d="${path(s.points)}" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"${s.dashed ? ' stroke-dasharray="6 4"' : ''}/>`;
    const last = s.points[s.points.length - 1];
    body += `<text class="t" x="${X(last[0]) + 10}" y="${Y(last[1]) + 5}" fill="${c}">${esc(s.label)}</text>`;
  });
  if (note)
    body += `<text class="m" x="${L}" y="${TOP + ph + 46}">${esc(note)}</text>`;
  return shell(w, h, body, { title, desc });
}

/** 작은 선그래프 여러 개를 나란히. 같은 축을 공유하는 경우를 비교할 때 쓴다 */
export function multiChart({ title, desc, panels, xLabel, yLabel, note, w = 720 }) {
  const n = panels.length,
    gap = 14;
  const pw = Math.floor((w - 40 - (n - 1) * gap) / n),
    ph = 132;
  const top = 44;
  const h = top + ph + 74 + (note ? 20 : 0);
  let body = `<text class="m" x="20" y="20">${esc(yLabel)} ↑</text>`;
  panels.forEach((p, i) => {
    const ox = 20 + i * (pw + gap);
    const X = (t) => ox + 10 + t * (pw - 20);
    const Y = (v) => top + (1 - v) * ph;
    body += `<text class="t" x="${ox + pw / 2}" y="${top - 12}" text-anchor="middle" fill="${p.color || T.text}">${esc(p.label)}</text>
<line class="ln" x1="${ox + 6}" y1="${top - 4}" x2="${ox + 6}" y2="${top + ph}"/>
<line class="ln" x1="${ox + 6}" y1="${top + ph}" x2="${ox + pw - 4}" y2="${top + ph}"/>`;
    p.series.forEach((s, k) => {
      const c = s.color || (k === 0 ? T.accent : T.danger);
      const d = s.points.map((q, j) => `${j ? 'L' : 'M'}${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join(' ');
      body += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"${s.dashed ? ' stroke-dasharray="5 4"' : ''}/>`;
    });
    (p.notes || []).forEach((t, k) => {
      body += `<text class="m" x="${ox + pw / 2}" y="${top + ph + 22 + k * 17}" text-anchor="middle">${esc(t)}</text>`;
    });
  });
  // 범례
  const ly = top + ph + 62;
  body += `<line x1="20" y1="${ly - 4}" x2="44" y2="${ly - 4}" stroke="${T.accent}" stroke-width="2.2"/>
<text class="m" x="50" y="${ly}">학습</text>
<line x1="96" y1="${ly - 4}" x2="120" y2="${ly - 4}" stroke="${T.danger}" stroke-width="2.2" stroke-dasharray="5 4"/>
<text class="m" x="126" y="${ly}">검증</text>
<text class="m" x="${w - 20}" y="${ly}" text-anchor="end">${esc(xLabel)} →</text>`;
  if (note) body += `<text class="m" x="20" y="${ly + 20}">${esc(note)}</text>`;
  return shell(w, h, body, { title, desc });
}
