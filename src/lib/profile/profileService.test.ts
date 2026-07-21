import { describe, expect, it } from 'vitest';
import { toLearnerProfile } from './profileService';

describe('toLearnerProfile', () => {
  it('maps a full row to the domain profile', () => {
    expect(
      toLearnerProfile({
        name: '홍길동',
        occupation: '개발자',
        purpose: '이직',
        experience_level: 'intermediate',
        target_cert: 'saa-c03',
      }),
    ).toEqual({
      name: '홍길동',
      occupation: '개발자',
      purpose: '이직',
      experienceLevel: 'intermediate',
      targetCert: 'saa-c03',
    });
  });

  it('returns all-null profile when row is missing', () => {
    expect(toLearnerProfile(undefined)).toEqual({
      name: null,
      occupation: null,
      purpose: null,
      experienceLevel: null,
      targetCert: null,
    });
  });

  it('preserves nulls for unfilled fields (partial onboarding)', () => {
    expect(
      toLearnerProfile({
        name: '김클라우드',
        occupation: null,
        purpose: null,
        experience_level: null,
        target_cert: 'clf-c02',
      }),
    ).toEqual({
      name: '김클라우드',
      occupation: null,
      purpose: null,
      experienceLevel: null,
      targetCert: 'clf-c02',
    });
  });
});
