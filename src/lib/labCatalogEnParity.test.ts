import { describe, expect, it } from 'vitest';
import { shellLabsFor } from './shell-lab/labsEn';
import { shellDrillsFor } from './shell-lab/drillsEn';
import { sqlTaskSetsFor } from './sql-lab/tasks';
import { cliLabsFor } from './cli-lab/labsEn';
import { LAB_CATALOG_EN } from './labCatalogEn';

describe('English lab catalog parity with the English engines', () => {
  it('has the same code and title as the English engine definition for all 17 labs', () => {
    const engine = [
      ...shellLabsFor('en').map((l) => ({ id: l.id, code: l.code, title: l.title })),
      ...shellDrillsFor('en').map((l) => ({ id: l.id, code: l.code, title: l.title })),
      ...sqlTaskSetsFor('en').map((l) => ({ id: l.id, code: l.code, title: l.title })),
      ...cliLabsFor('en').map((l) => ({ id: l.id, code: l.code, title: l.title })),
    ];
    expect(engine).toHaveLength(17);
    expect(LAB_CATALOG_EN.map(({ id, code, title }) => ({ id, code, title }))).toEqual(engine);
  });
});
