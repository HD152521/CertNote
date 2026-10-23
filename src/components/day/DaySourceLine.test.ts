import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { DaySourceLine, reportErrorHref } from './DaySourceLine';

function render(props: Partial<Parameters<typeof DaySourceLine>[0]> = {}): string {
  return renderToStaticMarkup(
    DaySourceLine({
      certMeta: { code: 'SAA-C03', section: 'aws' },
      lang: 'ko',
      reviewedMonth: null,
      pagePath: '/aws/saa-c03/week1/day1',
      ...props,
    }),
  );
}

describe('DaySourceLine — day 메타 줄', () => {
  test('시험 코드 기준과 오류 제보 링크를 렌더한다', () => {
    const html = render();
    expect(html).toContain('기준: SAA-C03 시험 가이드');
    expect(html).toContain('오류 제보');
    expect(html).toContain(`href="${reportErrorHref('/aws/saa-c03/week1/day1')}"`);
  });

  test('검수 기록이 없으면 날짜를 표시하지 않는다', () => {
    expect(render()).not.toContain('마지막 검수');
  });

  test('검수 기록이 있으면 연월을 표시한다', () => {
    expect(render({ reviewedMonth: '2026-10' })).toContain('마지막 검수 2026-10');
  });

  test('리눅스마스터는 출제 기준이라고 쓴다', () => {
    expect(render({ certMeta: { code: '리눅스마스터 1급', section: 'linux' } })).toContain('기준: 리눅스마스터 1급 출제 기준');
  });

  test('영어판 문구', () => {
    const html = render({ lang: 'en', pagePath: '/en/saa-c03/week1/day1', reviewedMonth: '2026-10' });
    expect(html).toContain('Based on the SAA-C03 exam guide');
    expect(html).toContain('Last reviewed 2026-10');
    expect(html).toContain('Report an error');
  });

  test('오류 제보 링크는 문의 페이지 + 인코딩된 노트 경로(정적 링크)', () => {
    expect(reportErrorHref('/aws/saa-c03/week1/day1')).toBe('/contact?page=%2Faws%2Fsaa-c03%2Fweek1%2Fday1');
  });
});
