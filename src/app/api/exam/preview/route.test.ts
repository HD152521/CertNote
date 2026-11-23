import { describe, expect, test } from 'vitest';
import { POST as start } from './route';
import { POST as check } from './check/route';
import { getExamCertSlugs } from '@/lib/exam/examBank';

// 비로그인 맛보기 API: 5문항만, 정답·해설은 내려가지 않고, 정답 확인은 한 문제씩.
function post(body: unknown, ip: string): Request {
  return new Request('http://localhost/api/exam/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

describe('guest exam preview API', () => {
  const cert = getExamCertSlugs()[0];

  test('알 수 없는 자격증은 400', async () => {
    expect((await start(post({ certSlug: 'nope-c99' }, '10.0.0.1'))).status).toBe(400);
  });

  test('5문항을 정답·해설 없이 돌려준다', async () => {
    const res = await start(post({ certSlug: cert }, '10.0.0.2'));
    expect(res.status).toBe(200);
    const { questions } = (await res.json()) as { questions: Record<string, unknown>[] };
    expect(questions.length).toBeLessThanOrEqual(5);
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(q).not.toHaveProperty('answer');
      expect(q).not.toHaveProperty('explanation');
    }
  });

  test('정답 확인은 한 문제의 정답·해설을 돌려주고, 없는 문제는 404', async () => {
    const res = await start(post({ certSlug: cert }, '10.0.0.3'));
    const { questions } = (await res.json()) as { questions: { questionId: string }[] };
    const ok = await check(post({ questionId: questions[0].questionId, selected: 'A' }, '10.0.0.3'));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toHaveProperty('answer');
    expect((await check(post({ questionId: 'zzz', selected: 'A' }, '10.0.0.3'))).status).toBe(404);
    expect((await check(post({ selected: 'A' }, '10.0.0.3'))).status).toBe(400);
  });

  test('같은 IP 가 짧은 시간에 많이 부르면 429', async () => {
    let last = 200;
    for (let i = 0; i < 25; i++) last = (await start(post({ certSlug: cert }, '10.0.0.9'))).status;
    expect(last).toBe(429);
  });

  const HANGUL = /[ㄱ-ㆎ가-힣]/;

  test('lang=en 이면 영어 문제와 영어 해설을 내려준다(한글 없음)', async () => {
    const res = await start(post({ certSlug: cert, lang: 'en' }, '10.0.1.1'));
    expect(res.status).toBe(200);
    const { questions } = (await res.json()) as { questions: { questionId: string; prompt: string; choices: { text: string }[] }[] };
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) expect(HANGUL.test(q.prompt + q.choices.map((c) => c.text).join(' '))).toBe(false);
    const ok = await check(post({ questionId: questions[0].questionId, selected: 'A', lang: 'en' }, '10.0.1.1'));
    const body = (await ok.json()) as { explanation: string };
    expect(HANGUL.test(body.explanation)).toBe(false);
  });

  test('lang 이 없거나 알 수 없으면 한국어 그대로', async () => {
    const res = await start(post({ certSlug: cert, lang: 'fr' }, '10.0.1.2'));
    const { questions } = (await res.json()) as { questions: { prompt: string }[] };
    expect(HANGUL.test(questions.map((q) => q.prompt).join(' '))).toBe(true);
  });

  test('영어 요청의 오류 메시지는 영어, 한국어 요청은 한국어', async () => {
    const en = (await (await start(post({ certSlug: 'nope-c99', lang: 'en' }, '10.0.1.3'))).json()) as { message: string };
    expect(HANGUL.test(en.message)).toBe(false);
    const ko = (await (await start(post({ certSlug: 'nope-c99' }, '10.0.1.4'))).json()) as { message: string };
    expect(HANGUL.test(ko.message)).toBe(true);
    const chk = (await (await check(post({ questionId: 'zzz', selected: 'A', lang: 'en' }, '10.0.1.5'))).json()) as { message: string };
    expect(HANGUL.test(chk.message)).toBe(false);
  });
});
