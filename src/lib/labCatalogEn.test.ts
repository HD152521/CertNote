import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { enInfoPathOf, infoHref, isEnInfoPath, koInfoPathOf } from './enEdition';
import { LAB_CATALOG, LAB_GROUPS } from './labCatalog';
import { LAB_CATALOG_EN, LAB_GROUPS_EN } from './labCatalogEn';
import { labByIdFor, labCatalogFor, labGroupsFor, labHref, labHubHref } from './labCatalogLang';

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;

describe('English lab catalog', () => {
  it('has the same ids, kinds and order as the Korean catalog', () => {
    expect(LAB_CATALOG_EN.map((l) => [l.id, l.kind])).toEqual(LAB_CATALOG.map((l) => [l.id, l.kind]));
    expect(LAB_CATALOG_EN).toHaveLength(17);
    expect(LAB_GROUPS_EN.map((g) => g.kind)).toEqual(LAB_GROUPS.map((g) => g.kind));
  });

  it('has the same codes, except the Korean practical prefix which is translated', () => {
    expect(LAB_CATALOG_EN.map((l) => l.code)).toEqual(LAB_CATALOG.map((l) => l.code.replace('실기', 'Practical')));
  });

  it('keeps one related note per Korean related note, in the same order', () => {
    for (const [i, ko] of LAB_CATALOG.entries()) {
      const en = LAB_CATALOG_EN[i];
      expect(en.related.length, ko.id).toBe(ko.related.length);
      expect(en.intro.length, ko.id).toBe(ko.intro.length);
      expect(
        en.related.map((r) => r.href),
        ko.id,
      ).toEqual(ko.related.map((r) => `/en${r.href.replace(/^\/(aws|linux|data)/, '')}`));
    }
  });

  it('contains no Hangul in its source file or in any exported string', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/lib/labCatalogEn.ts'), 'utf8');
    expect(HANGUL.test(src)).toBe(false);
    expect(HANGUL.test(JSON.stringify([LAB_CATALOG_EN, LAB_GROUPS_EN]))).toBe(false);
  });

  it('links only to English notes that exist', () => {
    for (const lab of LAB_CATALOG_EN) {
      for (const r of lab.related) {
        const m = r.href.match(/^\/en\/([a-z0-9-]+)\/week(\d+)\/day(\d+)$/);
        expect(m, `${lab.id} ${r.href}`).not.toBeNull();
        const [, slug, week, day] = m!;
        expect(existsSync(path.join(process.cwd(), 'content/en', slug, `week${week}`, `day${day}.md`)), r.href).toBe(true);
      }
    }
  });

  it('is picked by the language accessors', () => {
    expect(labCatalogFor('en')).toBe(LAB_CATALOG_EN);
    expect(labCatalogFor('ko')).toBe(LAB_CATALOG);
    expect(labGroupsFor('en')).toBe(LAB_GROUPS_EN);
    expect(labByIdFor('sql-pivot-dml', 'en')?.title).toMatch(/PIVOT/);
    expect(labByIdFor('nope', 'en')).toBeUndefined();
    expect(labHubHref('en')).toBe('/en/lab');
    expect(labHref('regions-azs', 'ko')).toBe('/lab/regions-azs');
    expect(labHref('regions-azs', 'en')).toBe('/en/lab/regions-azs');
  });
});

describe('lab pages pair with their English edition', () => {
  it('maps /lab and every /lab/<id> to /en/lab[/<id>] and back', () => {
    expect(enInfoPathOf('/lab')).toBe('/en/lab');
    expect(koInfoPathOf('/en/lab')).toBe('/lab');
    for (const l of LAB_CATALOG) {
      expect(enInfoPathOf(`/lab/${l.id}`)).toBe(`/en/lab/${l.id}`);
      expect(koInfoPathOf(`/en/lab/${l.id}`)).toBe(`/lab/${l.id}`);
      expect(isEnInfoPath(`/en/lab/${l.id}`)).toBe(true);
      expect(infoHref(`/lab/${l.id}`, 'en')).toBe(`/en/lab/${l.id}`);
      expect(infoHref(`/lab/${l.id}`, 'ko')).toBe(`/lab/${l.id}`);
    }
  });

  it('does not pair unknown lab ids', () => {
    expect(enInfoPathOf('/lab/nope')).toBeUndefined();
    expect(koInfoPathOf('/en/lab/nope')).toBeUndefined();
    expect(isEnInfoPath('/en/lab/')).toBe(false);
    expect(isEnInfoPath('/en/lab/regions-azs/x')).toBe(false);
  });
});
