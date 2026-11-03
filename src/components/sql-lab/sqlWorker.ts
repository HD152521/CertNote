// SQL 실습장 실행 워커. 엔진을 화면 스레드 밖에서 돌려, 어떤 입력(정규식 백트래킹, 거대한 DML)도 탭을 멈추지 못하게 한다.
// 화면 쪽(SqlConsole)은 일정 시간 안에 답이 없으면 이 워커를 끝내고 새로 만든다.
import { runSql, type StatementResult } from '@/lib/sql-lab/run';
import { SQL_TASK_SETS, runForTask } from '@/lib/sql-lab/tasks';
import { display } from '@/lib/sql-lab/values';

export interface WorkerRequest {
  id: number;
  src: string;
  task?: { setId: string; itemId: string };
}

/** 워커 밖으로 보낼 때 값은 화면에 보일 글자로 바꾼다(날짜 객체는 구조화 복제로 넘기면 모양이 깨진다). NULL 은 null 그대로. */
export type WireResult = StatementResult extends infer R
  ? R extends { kind: 'rows'; rows: unknown[][] }
    ? Omit<R, 'rows'> & { rows: (string | null)[][] }
    : R
  : never;

export interface WorkerResponse {
  id: number;
  results: WireResult[];
  verdict?: { ok: true } | { ok: false; reason: string } | null;
}

const toWire = (r: StatementResult): WireResult =>
  (r.kind === 'rows' ? { ...r, rows: r.rows.map((row) => row.map((v) => (v === null ? null : display(v)))) } : r) as WireResult;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, src, task } = event.data;
  let response: WorkerResponse;
  if (task) {
    const item = SQL_TASK_SETS.find((s) => s.id === task.setId)?.items.find((i) => i.id === task.itemId);
    if (!item) response = { id, results: runSql(src).map(toWire), verdict: null };
    else {
      const out = runForTask(item, src);
      response = { id, results: out.results.map(toWire), verdict: out.verdict };
    }
  } else response = { id, results: runSql(src).map(toWire) };
  (self as unknown as Worker).postMessage(response);
};
