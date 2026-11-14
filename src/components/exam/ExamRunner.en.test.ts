// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { buildExam, checkAnswer, gradeExam } from '@/lib/exam/examService';
import { getDomainLabelsEn, getExamQuestionsByCert } from '@/lib/exam/examBank';

// 영어 모드의 모의고사 화면(설정 → 풀이 → 채점 결과)을 실제로 렌더해, 화면 글자·속성에 한글이 없는지와
// 한국어판과 문항 수·보기 글자·채점 결과가 같은지 본다. 로그인/DB 없이 API 응답은 서비스 함수로 대신한다.

vi.mock('next/navigation', () => ({ usePathname: () => '/exam' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => createElement('a', { href, ...rest }, children),
}));
vi.mock('@/lib/quiz/attemptService', () => ({ getAttemptService: () => ({ record: async () => undefined }) }));

import { ExamRunner, startErrorMessage } from './ExamRunner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HANGUL = /[ㄱ-ㆎ가-힣]/;
const CERT = 'saa-c03';
const certs = [{
  slug: CERT,
  code: 'SAA-C03',
  name: 'Solutions Architect - Associate',
  domains: [...new Set(getExamQuestionsByCert(CERT).map((q) => q.domain))],
  domainLabelsEn: getDomainLabelsEn(CERT),
}];

interface Api { lastStart?: { questionIds: string[] } }

function installFetch(lang: 'ko' | 'en', api: Api) {
  vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    expect(body.lang).toBe(lang);
    if (url === '/api/exam/start') {
      const questions = buildExam(body.certSlug ?? null, body.count, body.domains, body.lang);
      api.lastStart = { questionIds: questions.map((q) => q.questionId) };
      return Response.json({ questions });
    }
    if (url === '/api/exam/check') return Response.json(checkAnswer(body.questionId, body.selected, body.lang));
    if (url === '/api/exam/submit') return Response.json(await gradeExam('1', body.questionIds, body.answers, body.lang));
    throw new Error(`unexpected fetch ${url}`);
  });
}

// 화면에 보이는 글자와 접근성·입력 속성을 모은다.
function visibleStrings(el: Element): string[] {
  const out: string[] = [el.textContent ?? ''];
  for (const node of [el, ...el.querySelectorAll('*')]) {
    for (const attr of ['aria-label', 'placeholder', 'title', 'alt', 'value', 'aria-description']) {
      const v = node.getAttribute(attr);
      if (v) out.push(v);
    }
  }
  return out;
}

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const btn = (el: Element, label: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label)) as HTMLButtonElement;
const click = (b: Element) => act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  vi.stubGlobal('confirm', () => true);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  document.cookie = 'lang=; path=/; max-age=0';
});

// 한 판을 끝까지 돌리고 단계별 화면 스냅샷을 돌려준다.
async function playThrough(lang: 'ko' | 'en', mode: 'exam' | 'practice') {
  document.cookie = `lang=${lang}; path=/`;
  const api: Api = {};
  installFetch(lang, api);
  await act(async () => root.render(createElement(ExamRunner, { certs, initialCert: CERT })));
  const setup = visibleStrings(host);
  const [practice, exam] = lang === 'en' ? ['Practice', 'Exam'] : ['연습', '실전'];
  await click(btn(host, mode === 'practice' ? practice : exam));
  await click(btn(host, lang === 'en' ? '10Q' : '10문항'));
  await click(btn(host, lang === 'en' ? 'Start Exam' : '시험 시작'));
  await tick();

  const running: string[] = [];
  const total = api.lastStart!.questionIds.length;
  for (let i = 0; i < total; i += 1) {
    const choices = [...host.querySelectorAll('ul li button[aria-pressed]')] as HTMLButtonElement[];
    await click(choices[0]);
    if (mode === 'practice') {
      await click(btn(host, lang === 'en' ? 'Check Answer' : '정답 확인'));
      await tick();
    }
    running.push(...visibleStrings(host));
    if (i < total - 1) await click(btn(host, lang === 'en' ? 'Next' : '다음'));
  }
  await click(btn(host, lang === 'en' ? 'Submit & Grade' : '제출하고 채점'));
  await tick();
  return { total, setup, running, result: visibleStrings(host), resultText: host.textContent ?? '' };
}

describe('ExamRunner 영어 모드', () => {
  test.each(['exam', 'practice'] as const)('%s 모드: 설정·풀이·결과 화면에 한글이 없다', async (mode) => {
    const r = await playThrough('en', mode);
    expect(r.total).toBe(10);
    for (const [phase, strings] of [['설정', r.setup], ['풀이', r.running], ['결과', r.result]] as const) {
      const bad = strings.filter((s) => HANGUL.test(s)).map((s) => s.slice(0, 80));
      expect(bad, `${phase} 화면 한글`).toEqual([]);
    }
    expect(r.resultText).toMatch(/Passing score 72%/);
    expect(r.resultText).toMatch(/Unanswered 0/);
  });

  test('영어 결과 화면의 자격증 링크는 영어판(/en/<slug>)으로 간다', async () => {
    await playThrough('en', 'exam');
    const hrefs = [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain(`/en/${CERT}`);
    expect(hrefs.some((h) => h?.startsWith('/aws-certs/'))).toBe(false);
  });

  test('시작 오류 메시지도 영어 모드에서는 영어다', () => {
    for (const error of ['unauthorized', 'plan_required', 'no_questions', 'rate_limited', 'internal_error', undefined]) {
      expect(HANGUL.test(startErrorMessage('en', { error, message: '한국어 메시지' }))).toBe(false);
    }
    expect(startErrorMessage('ko', { error: 'plan_required', message: '모의고사는 Pro 플랜 전용입니다.' })).toBe('모의고사는 Pro 플랜 전용입니다.');
  });
});

describe('영어판과 한국어판의 동등성', () => {
  test('같은 문항 id에 같은 답을 내면 정답 수·점수·보기 글자·정답 키가 같다', async () => {
    const ids = buildExam(CERT, 20, [], 'ko').map((q) => q.questionId);
    const answers = Object.fromEntries(ids.map((id, i) => [id, ['A', 'B', 'C'][i % 3]]));
    const ko = await gradeExam('1', ids, answers, 'ko');
    const en = await gradeExam('1', ids, answers, 'en');
    expect(en.total).toBe(ko.total);
    expect(en.correct).toBe(ko.correct);
    expect(en.score).toBe(ko.score);
    expect(en.passed).toBe(ko.passed);
    expect(en.items.map((i) => i.answer)).toEqual(ko.items.map((i) => i.answer));
    expect(en.items.map((i) => i.choices.map((c) => c.label).join(''))).toEqual(ko.items.map((i) => i.choices.map((c) => c.label).join('')));
    expect(en.items.map((i) => i.multi)).toEqual(ko.items.map((i) => i.multi));
    expect(en.domains.map((d) => [d.domain, d.total, d.correct])).toEqual(ko.domains.map((d) => [d.domain, d.total, d.correct]));
    // 영어 해설이 한국어 해설보다 더 자주 비어 있으면 번역 누락이다.
    expect(en.items.filter((i) => !i.explanation).length).toBeLessThanOrEqual(ko.items.filter((i) => !i.explanation).length);
    expect(en.items.some((i) => HANGUL.test(i.prompt + i.explanation + i.choices.map((c) => c.text).join('')))).toBe(false);
  });

  test('한국어 모드 화면은 그대로 한국어다', async () => {
    const r = await playThrough('ko', 'practice');
    expect(r.total).toBe(10);
    expect(r.resultText).toMatch(/합격선 72%/);
    expect(r.resultText).not.toMatch(/Passing score/);
  });
});
