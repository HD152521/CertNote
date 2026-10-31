import { describe, expect, it } from 'vitest';
import { LABS } from './cli-lab/labs';
import { LAB_CATALOG } from './labCatalog';
import { SHELL_LABS } from './shell-lab/labs';

describe('lab catalog', () => {
  it('lists every lab of both engines with the same code and title', () => {
    const engine = [
      ...SHELL_LABS.map((l) => ({ id: l.id, kind: 'linux', code: l.code, title: l.title })),
      ...LABS.map((l) => ({ id: l.id, kind: 'aws', code: l.code, title: l.title })),
    ];
    expect(LAB_CATALOG.map(({ id, kind, code, title }) => ({ id, kind, code, title }))).toEqual(engine);
  });

  it('has an intro and at least one related note for every lab', () => {
    for (const lab of LAB_CATALOG) {
      expect(lab.summary.length, lab.id).toBeGreaterThan(30);
      expect(lab.intro.length, lab.id).toBeGreaterThan(0);
      expect(lab.related.length, lab.id).toBeGreaterThan(0);
    }
  });
});
