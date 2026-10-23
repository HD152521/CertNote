import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { AWS_SERVICE_DOCS } from '@/lib/day/officialRefs';
import { OfficialRefs } from './OfficialRefs';

const s3 = AWS_SERVICE_DOCS.find((d) => d.id === 's3')!;
const ebs = AWS_SERVICE_DOCS.find((d) => d.id === 'ebs')!;

function render(props: Partial<Parameters<typeof OfficialRefs>[0]> = {}): string {
  const el = OfficialRefs({
    certMeta: { code: 'SAA-C03', section: 'aws' },
    lang: 'ko',
    examUrl: 'https://aws.amazon.com/certification/certified-solutions-architect-associate/',
    services: [ebs, s3],
    ...props,
  });
  return el ? renderToStaticMarkup(el) : '';
}

describe('OfficialRefs — 참고 공식 자료', () => {
  test('공식 시험 안내를 먼저, 이어서 서비스 문서를 한국어 경로로 건다', () => {
    const html = render();
    expect(html).toContain('참고 공식 자료');
    expect(html.indexOf('SAA-C03 공식 시험 안내')).toBeLessThan(html.indexOf('Amazon EBS 공식 문서'));
    expect(html).toContain('href="https://docs.aws.amazon.com/ko_kr/ebs/"');
    expect(html).toContain('href="https://docs.aws.amazon.com/ko_kr/s3/"');
  });

  test('외부 링크는 새 탭 + noopener', () => {
    expect(render()).toContain('rel="noopener noreferrer"');
  });

  test('영어판은 영어 문서 경로와 영어 문구', () => {
    const html = render({ lang: 'en' });
    expect(html).toContain('Official references');
    expect(html).toContain('href="https://docs.aws.amazon.com/s3/"');
    expect(html).toContain('Amazon S3 documentation');
  });

  test('리눅스 트랙은 출제 기준 문구', () => {
    const html = render({ certMeta: { code: '리눅스마스터 1급', section: 'linux' }, examUrl: 'https://www.ihd.or.kr/introducesubject1.do', services: [] });
    expect(html).toContain('리눅스마스터 1급 공식 출제 기준');
  });

  test('보여 줄 자료가 없으면 아무것도 그리지 않는다', () => {
    expect(render({ examUrl: null, services: [] })).toBe('');
  });
});
