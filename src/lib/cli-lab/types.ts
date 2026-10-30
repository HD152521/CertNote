import type { SimState } from './state';

export type ArgValue = string | string[] | true;

export interface ParamSpec {
  name: string; // '--bucket'
  kind: 'string' | 'flag' | 'list' | 'structure';
  required?: boolean;
}

export interface CommandContext {
  state: SimState;
  region: string;
  args: Record<string, ArgValue>;
  positionals: string[];
}

export type CommandOutcome =
  /** data 는 --query·--output 을 거쳐 찍히고, stdout 은 그대로 찍힌다(s3 고수준 명령). */
  | { kind: 'ok'; state?: SimState; data?: unknown; stdout?: string }
  | { kind: 'service-error'; code: string; message: string; state?: SimState }
  | { kind: 'error'; stderr: string; exitCode: number; state?: SimState };

export interface OperationSpec {
  /** 오류 문구·표 제목에 쓰는 API 이름. 예: CreateBucket */
  apiName: string;
  params: ParamSpec[];
  positionals?: { min: number; max: number };
  run: (ctx: CommandContext) => CommandOutcome;
}

export interface ServiceSpec {
  /** iam·sts 처럼 리전과 무관한 서비스 */
  global?: boolean;
  operations: Record<string, OperationSpec>;
}

/** 실행 기록 한 줄 — 랩 목표 판정에 쓴다. */
export interface CommandRecord {
  raw: string;
  service?: string;
  operation?: string;
  args: Record<string, ArgValue>;
  positionals: string[];
  region?: string;
  output?: string;
  query?: string;
  exitCode: number;
}

export interface RunResult {
  state: SimState;
  stdout: string;
  stderr: string;
  exitCode: number;
  /** 실제 CLI 출력이 아니라 연습장이 덧붙이는 한국어 안내 */
  note?: string;
  record: CommandRecord;
}
