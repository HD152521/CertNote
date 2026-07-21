import { query } from '../db';

// 온보딩에서 수집하지만 지금까지 학습에 쓰이지 않던 학습자 프로필.
// M1(개인화 추천)·M4(목표)에서 이 값을 읽어 경로를 맞춘다.
export interface LearnerProfile {
  name: string | null;
  occupation: string | null;      // 직업(예: 개발자, 학생)
  purpose: string | null;         // 학습 목적(예: 이직, 승진)
  experienceLevel: string | null; // 경력 수준(예: beginner|intermediate|advanced)
  targetCert: string | null;      // 목표 자격증 slug
}

interface ProfileRow {
  name: string | null;
  occupation: string | null;
  purpose: string | null;
  experience_level: string | null;
  target_cert: string | null;
}

// DB row → 도메인 프로필 매핑(순수). row 없으면 전부 null.
// IO와 분리해 단위테스트 대상이 된다(entitlement의 resolveEntitlement 패턴).
export function toLearnerProfile(row: ProfileRow | undefined): LearnerProfile {
  return {
    name: row?.name ?? null,
    occupation: row?.occupation ?? null,
    purpose: row?.purpose ?? null,
    experienceLevel: row?.experience_level ?? null,
    targetCert: row?.target_cert ?? null,
  };
}

// 로그인 사용자의 학습자 프로필 조회(읽기 전용).
export async function getLearnerProfile(userId: string): Promise<LearnerProfile> {
  const rows = await query<ProfileRow>(
    `SELECT name, occupation, purpose, experience_level, target_cert
     FROM users WHERE id = $1`,
    [userId],
  );
  return toLearnerProfile(rows[0]);
}
