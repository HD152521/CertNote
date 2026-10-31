// 시뮬레이터 계정 상태. 명령은 이 상태를 읽고, 바꿀 때는 새 객체를 돌려준다(원본 불변).
// 시각은 실제 시계 대신 가상 시계를 쓴다 — 같은 입력이면 같은 출력이 나와야 테스트·스크린샷이 흔들리지 않는다.

export interface S3Object {
  key: string;
  size: number;
  lastModified: number;
}

export interface Bucket {
  name: string;
  region: string;
  createdAt: number;
  versioning?: 'Enabled' | 'Suspended';
  objects: S3Object[];
  /** 버전 관리 중 덮어쓰거나 지워서 남은 이전 버전·삭제 마커 수. 0 이 아니면 버킷을 지울 수 없다. */
  hiddenVersions: number;
}

export interface IamUser {
  userName: string;
  userId: string;
  arn: string;
  createdAt: number;
  policyArns: string[];
}

export interface LocalFile {
  name: string;
  size: number;
}

export interface SimState {
  accountId: string;
  callerName: string;
  defaultRegion: string;
  clock: number;
  buckets: Bucket[];
  users: IamUser[];
  localFiles: LocalFile[];
}

// AWS 문서가 예시로 쓰는 계정 번호. 실제 계정과 겹치지 않는다.
export const SIM_ACCOUNT_ID = '123456789012';
const SIM_START = Date.UTC(2026, 9, 30, 0, 0, 0);
const TICK_MS = 7_000;

export function createInitialState(overrides: Partial<SimState> = {}): SimState {
  return {
    accountId: SIM_ACCOUNT_ID,
    callerName: 'certnote-learner',
    defaultRegion: 'ap-northeast-2',
    clock: SIM_START,
    buckets: [],
    users: [],
    localFiles: [
      { name: 'hello.txt', size: 13 },
      { name: 'index.html', size: 1_024 },
      { name: 'report-2026.csv', size: 48_211 },
    ],
    ...overrides,
  };
}

export function tick(state: SimState): SimState {
  return { ...state, clock: state.clock + TICK_MS };
}

// 이름에서 고정된 ID 를 만든다(실제처럼 보이되 매번 같게).
export function stableId(prefix: string, seed: string, length = 17): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let h = 2166136261;
  let out = '';
  for (let i = 0; out.length < length; i += 1) {
    h ^= seed.charCodeAt(i % Math.max(seed.length, 1)) + i;
    h = Math.imul(h, 16777619) >>> 0;
    out += alphabet[h % alphabet.length];
  }
  return prefix + out;
}

export function callerUserId(state: SimState): string {
  return stableId('AIDA', state.callerName);
}

export function callerArn(state: SimState): string {
  return `arn:aws:iam::${state.accountId}:user/${state.callerName}`;
}

/** CLI 가 JSON 에 찍는 ISO 시각. 예: 2026-10-30T00:00:07+00:00 */
export function isoTime(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

/** `aws s3 ls` 가 찍는 시각. 실제 CLI 는 로컬 시간대지만 연습장은 UTC 로 고정한다. */
export function lsTime(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}
