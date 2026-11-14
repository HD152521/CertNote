import { describe, expect, it } from 'vitest';
import { SHELL_DRILLS, drillInitialState } from './drills';
import { SHELL_DRILLS_EN, shellDrillsFor } from './drillsEn';
import { SHELL_LABS, labInitialState } from './labs';
import { SHELL_LABS_EN, shellLabsFor } from './labsEn';
import { runLine } from './run';

const HANGUL = /[ㄱ-ㆎ가-힣]/;

describe('English shell labs', () => {
  it('has the same ids, order and step ids as the Korean labs', () => {
    expect(SHELL_LABS_EN.map((l) => l.id)).toEqual(SHELL_LABS.map((l) => l.id));
    SHELL_LABS.forEach((ko, i) => {
      const en = SHELL_LABS_EN[i];
      expect(en.steps.map((s) => s.id)).toEqual(ko.steps.map((s) => s.id));
      expect(en.code).toBe(ko.code);
      expect(en.workdir).toBe(ko.workdir);
      expect(en.watch).toBe(ko.watch);
      expect(en.setup).toEqual(ko.setup);
    });
  });

  it('shares answers and graders with the Korean labs', () => {
    SHELL_LABS.forEach((ko, i) => {
      ko.steps.forEach((s, j) => {
        const en = SHELL_LABS_EN[i].steps[j];
        expect(en.answer).toBe(s.answer);
        expect(en.isDone).toBe(s.isDone);
      });
    });
  });

  it('has no Hangul anywhere and no empty text', () => {
    for (const l of SHELL_LABS_EN) {
      for (const text of [l.code, l.topic, l.title, l.source]) expect(HANGUL.test(text), text).toBe(false);
      for (const s of l.steps) {
        for (const text of [s.title, s.task, s.hint, s.answer, s.takeaway]) {
          expect(HANGUL.test(text), `${l.id}/${s.id}: ${text}`).toBe(false);
          expect(text.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('model answers pass the graders of the English labs, step by step', () => {
    for (const lab of SHELL_LABS_EN) {
      let st = labInitialState(lab);
      for (const step of lab.steps) {
        let passed = false;
        for (const line of step.answer.split('\n')) {
          const r = runLine(line, st);
          st = r.state;
          passed = step.isDone({ state: st, result: r });
        }
        expect(passed, `${lab.id}/${step.id}`).toBe(true);
      }
    }
  });

  it('shellLabsFor defaults to Korean', () => {
    expect(shellLabsFor()).toBe(SHELL_LABS);
    expect(shellLabsFor('ko')).toBe(SHELL_LABS);
    expect(shellLabsFor('en')).toBe(SHELL_LABS_EN);
  });
});

describe('English shell drills', () => {
  it('has the same ids, order and item counts as the Korean drills', () => {
    expect(SHELL_DRILLS_EN.map((d) => d.id)).toEqual(SHELL_DRILLS.map((d) => d.id));
    SHELL_DRILLS.forEach((ko, i) => {
      const en = SHELL_DRILLS_EN[i];
      expect(en.items.map((x) => x.id)).toEqual(ko.items.map((x) => x.id));
      ko.items.forEach((it, j) => {
        const e = en.items[j];
        expect(e.conditions.length).toBe(it.conditions.length);
        expect(e.setup).toEqual(it.setup);
        expect(e.answer).toBe(it.answer);
        expect(e.isDone).toBe(it.isDone);
      });
    });
  });

  it('has no Hangul anywhere', () => {
    for (const d of SHELL_DRILLS_EN) {
      for (const text of [d.code, d.title]) expect(HANGUL.test(text), text).toBe(false);
      for (const it of d.items) {
        for (const text of [it.title, it.prompt, it.answer, it.explain, ...it.conditions, ...it.setup]) {
          expect(HANGUL.test(text), `${d.id}/${it.id}: ${text}`).toBe(false);
        }
      }
    }
  });

  it('model answers pass the English drill graders', () => {
    for (const it of SHELL_DRILLS_EN.flatMap((d) => d.items)) {
      let st = drillInitialState(it);
      let passed = false;
      for (const line of it.answer.split('\n')) {
        const r = runLine(line, st);
        st = r.state;
        passed = it.isDone({ state: st, result: r });
      }
      expect(passed, it.id).toBe(true);
    }
  });

  it('shellDrillsFor defaults to Korean', () => {
    expect(shellDrillsFor()).toBe(SHELL_DRILLS);
    expect(shellDrillsFor('en')).toBe(SHELL_DRILLS_EN);
  });
});
