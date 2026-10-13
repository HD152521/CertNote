import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  buildAdSenseScriptSrc,
  buildAdsTxt,
  getAdSenseClient,
  parseAdSenseClient,
  parseAdSlotId,
} from './adsense';

const VALID = 'ca-pub-0000000000000000';

describe('parseAdSenseClient — 게시자 ID 형식 검증', () => {
  test('ca-pub- 뒤에 숫자 16자리면 그대로 돌려준다', () => {
    expect(parseAdSenseClient(VALID)).toBe(VALID);
    expect(parseAdSenseClient('ca-pub-1234567890123456')).toBe('ca-pub-1234567890123456');
  });

  test('앞뒤 공백은 잘라낸다(환경변수 붙여넣기 실수)', () => {
    expect(parseAdSenseClient(`  ${VALID}\n`)).toBe(VALID);
  });

  test.each([
    ['undefined', undefined],
    ['null', null],
    ['빈 문자열', ''],
    ['공백', '   '],
    ['ca- 접두사 없음', 'pub-0000000000000000'],
    ['15자리', 'ca-pub-000000000000000'],
    ['17자리', 'ca-pub-00000000000000000'],
    ['숫자가 아닌 문자', 'ca-pub-00000000000000ab'],
    ['대문자', 'CA-PUB-0000000000000000'],
    ['뒤에 붙은 쿼리', `${VALID}&x=1`],
    ['따옴표 주입', `${VALID}"><script>`],
  ])('%s 이면 null', (_name, raw) => {
    expect(parseAdSenseClient(raw)).toBeNull();
  });
});

describe('getAdSenseClient — NEXT_PUBLIC_ADSENSE_CLIENT 읽기', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('환경변수가 없으면 null', () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', '');
    expect(getAdSenseClient()).toBeNull();
  });

  test('형식이 틀리면 null', () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', 'pub-123');
    expect(getAdSenseClient()).toBeNull();
  });

  test('유효하면 게시자 ID', () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', VALID);
    expect(getAdSenseClient()).toBe(VALID);
  });
});

describe('parseAdSlotId — 광고 단위 ID', () => {
  test('숫자만으로 된 문자열이면 그대로', () => {
    expect(parseAdSlotId('1234567890')).toBe('1234567890');
    expect(parseAdSlotId(' 1234567890 ')).toBe('1234567890');
  });

  test.each([
    ['undefined', undefined],
    ['null', null],
    ['빈 문자열', ''],
    ['숫자가 아닌 문자', '12ab'],
    ['따옴표 주입', '123" onload="x'],
  ])('%s 이면 null', (_name, raw) => {
    expect(parseAdSlotId(raw)).toBeNull();
  });
});

describe('buildAdSenseScriptSrc — 로더 주소', () => {
  test('client 쿼리에 게시자 ID 를 싣는다', () => {
    expect(buildAdSenseScriptSrc(VALID)).toBe(
      'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-0000000000000000',
    );
  });
});

describe('buildAdsTxt — /ads.txt 본문', () => {
  test('유효한 게시자 ID 면 ca- 접두사를 뗀 한 줄을 낸다', () => {
    expect(buildAdsTxt(VALID)).toBe('google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0');
  });

  test('값이 없으면 null(라우트가 404 를 낸다)', () => {
    expect(buildAdsTxt(null)).toBeNull();
  });
});
