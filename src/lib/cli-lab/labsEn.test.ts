import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LABS } from './labs';
import { cliLabsFor, LABS_EN_TEXT } from './labsEn';
import { translateMessage } from './messagesEn';
import { runCommand } from './run';
import { createInitialState } from './state';

const HANGUL = /[ㄱ-ㆎ가-힣]/;

describe('cliLabsFor', () => {
  it('returns the Korean labs unchanged for ko', () => {
    expect(cliLabsFor('ko')).toBe(LABS);
  });

  it('keeps ids, order, commands and grading identical in English', () => {
    const en = cliLabsFor('en');
    expect(en.map((l) => l.id)).toEqual(LABS.map((l) => l.id));
    en.forEach((lab, i) => {
      expect(lab.code).toBe(LABS[i].code);
      expect(lab.steps.map((s) => s.id)).toEqual(LABS[i].steps.map((s) => s.id));
      lab.steps.forEach((s, j) => {
        expect(s.answer).toBe(LABS[i].steps[j].answer);
        expect(s.isDone).toBe(LABS[i].steps[j].isDone);
      });
    });
  });

  it('has English text for every lab and step with no Hangul', () => {
    for (const lab of LABS) {
      const text = LABS_EN_TEXT[lab.id];
      expect(text, lab.id).toBeDefined();
      expect(Object.keys(text.steps)).toEqual(lab.steps.map((s) => s.id));
    }
    expect(HANGUL.test(JSON.stringify(cliLabsFor("en")))).toBe(false); // functions are dropped by JSON.stringify
  });
});

describe('simulator messages in English', () => {
  const strip = (src: string) =>
    src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').replace(/\s\/\/ .*$/gm, '');
  const literalsWithHangul = (file: string): string[] => {
    const src = strip(readFileSync(new URL(file, import.meta.url), 'utf8'));
    const out: string[] = [];
    const literal = /'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
    for (const m of src.matchAll(literal)) {
      const raw = m[1] ?? m[2] ?? '';
      if (HANGUL.test(raw)) out.push(raw.replace(/\$\{[^}]*\}/g, 'X').replace(/\\n/g, '\n'));
    }
    return out;
  };

  // Every engine source file (not the Korean lab definitions or the English files themselves).
  const SKIP = /(^labs\.ts$|^labsEn\.ts$|^messagesEn\.ts$|\.test\.ts$)/;
  const engineFiles = [
    ...readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.ts') && !SKIP.test(f)).map((f) => `./${f}`),
    ...readdirSync(new URL('./services/', import.meta.url)).filter((f) => f.endsWith('.ts') && !SKIP.test(f)).map((f) => `./services/${f}`),
  ];

  it('covers a meaningful set of engine files', () => {
    expect(engineFiles).toEqual(expect.arrayContaining(['./run.ts', './services/s3.ts', './state.ts', './format.ts']));
  });

  it('passes real output that merely contains a typed Hangul name through untouched', () => {
    const line = "An error occurred (NoSuchBucket) when calling the ListObjectsV2 operation: The specified bucket does not exist: 한글";
    expect(translateMessage(line)).toBe(line);
  });

  for (const file of engineFiles) {
    it(`every Korean string literal in ${file} has an English mapping`, () => {
      for (const lit of literalsWithHangul(file)) {
        expect(HANGUL.test(translateMessage(lit)), lit).toBe(false);
      }
    });
  }

  it('produces no Hangul across representative English runs', () => {
    const lines = [
      'aws --version', 'aws help', 'aws foo', 'ls', 'rm x', 'aws ec2 describe-availability-zones --region mars-1',
      'aws s3api create-bucket --bucket certnote-demo-1', 'aws s3api create-bucket --bucket bucket',
      'aws s3api create-bucket --bucket AB', 'aws iam create-user --user-name u',
      'aws iam attach-user-policy --user-name u --policy-arn arn:aws:iam::123:policy/Foo',
      'aws iam attach-user-policy --user-name u --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess',
      'aws iam delete-user --user-name u', 'aws sts get-caller-identity --output yaml', "aws s3 cp /etc/x s3://b/",
      'aws s3 mb s3://certnote-en-1', 'aws s3api put-bucket-versioning --bucket certnote-en-1 --versioning-configuration Status=Enabled',
      'aws s3 cp hello.txt s3://certnote-en-1/', 'aws s3 rm s3://certnote-en-1/hello.txt', 'aws s3 rb s3://certnote-en-1',
      "aws s3 cp x y z", 'aws s3 mb', "aws s3 ls 's3://x",
    ];
    let state = createInitialState();
    for (const line of lines) {
      const r = runCommand(line, state, 'en');
      state = r.state;
      expect(HANGUL.test(`${r.stdout}\n${r.stderr}\n${r.note ?? ''}`), line).toBe(false);
    }
  });

  it('leaves Korean output unchanged for ko', () => {
    expect(runCommand('rm x', createInitialState()).note).toMatch(HANGUL);
  });
});
