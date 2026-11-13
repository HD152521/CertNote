import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { EN_EDITION_NON_AWS, hasEnglishEdition, koSectionOfEnglishSlug } from './enEdition';

describe('enEdition — 영어판 자격증 목록', () => {
  test('content/en/index.json 의 비-aws 자격증과 정확히 일치한다', async () => {
    const raw = await fs.readFile(path.join(process.cwd(), 'content/en/index.json'), 'utf8');
    const certs = JSON.parse(raw.replace(/^﻿/, '')).certs as { slug: string; section: string }[];
    const nonAws = Object.fromEntries(certs.filter((c) => c.section !== 'aws').map((c) => [c.slug, c.section]));

    expect(EN_EDITION_NON_AWS).toEqual(nonAws);
  });

  test('aws 는 항상, 그 밖의 섹션은 목록에 있는 슬러그만 영어판이 있다', () => {
    expect(hasEnglishEdition('aws', 'saa-c03')).toBe(true);
    expect(hasEnglishEdition('data', 'sqld')).toBe(true);
    expect(hasEnglishEdition('linux', 'linux-master-1')).toBe(true);
    expect(hasEnglishEdition('linux', 'unknown-track')).toBe(false);
    expect(hasEnglishEdition('data', 'linux-master-1')).toBe(false);
  });

  test('영어판 슬러그의 한국어 짝 섹션을 돌려준다', () => {
    expect(koSectionOfEnglishSlug('saa-c03')).toBe('aws');
    expect(koSectionOfEnglishSlug('sqld')).toBe('data');
  });
});
