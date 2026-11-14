import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cliStrings } from './i18n';

const HANGUL = /[ㄱ-ㆎ가-힣]/;
const FILES = ['AccountStrip.tsx', 'CliLab.tsx', 'LabSteps.tsx', 'LabTerminal.tsx'];

const stripComments = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');

describe('cli-lab component strings', () => {
  it.each(FILES)('%s has no hard-coded Korean outside comments', (file) => {
    const src = stripComments(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'));
    expect(src.split('\n').filter((l) => HANGUL.test(l))).toEqual([]);
  });

  it('English dictionary has every key of the Korean one and no Hangul', () => {
    const ko = cliStrings('ko');
    const en = cliStrings('en');
    expect(Object.keys(en)).toEqual(Object.keys(ko));
    for (const key of Object.keys(ko) as Array<keyof typeof ko>) {
      const render = (d: typeof ko) => {
        const v = d[key] as unknown;
        if (typeof v !== 'function') return String(v);
        return (v as (...a: unknown[]) => string)(2, 'Title', true);
      };
      expect(HANGUL.test(render(en)), key).toBe(false);
      if (!['stepOf', 'acct', 'taskLabel'].includes(key)) expect(render(ko), key).toMatch(HANGUL);
    }
  });
});
