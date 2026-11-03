// 화면 쪽 실행기: 워커에 SQL 을 보내고, 정해진 시간 안에 답이 없으면 워커를 끝내 탭이 멈추지 않게 한다.
// 워커를 못 쓰는 환경(아주 오래된 브라우저)에서는 같은 스레드에서 바로 실행한다.
import { runSql } from '@/lib/sql-lab/run';
import { SQL_TASK_SETS, runForTask } from '@/lib/sql-lab/tasks';
import { display } from '@/lib/sql-lab/values';
import type { WireResult, WorkerRequest, WorkerResponse } from './sqlWorker';

/** 이 시간 안에 끝나지 않으면 실행을 멈춘다(엔진 안의 3초 상한보다 조금 길게) */
export const RUN_TIMEOUT_MS = 4000;

export type Verdict = { ok: true } | { ok: false; reason: string } | null | undefined;
export interface RunOutput {
  results: WireResult[];
  verdict?: Verdict;
  timedOut?: boolean;
}

let worker: Worker | null = null;
let seq = 0;

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./sqlWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      worker = null;
    }
  }
  return worker;
}

function runHere(src: string, task?: WorkerRequest['task']): RunOutput {
  const wire = (r: ReturnType<typeof runSql>[number]) =>
    (r.kind === 'rows' ? { ...r, rows: r.rows.map((row) => row.map((v) => (v === null ? null : display(v)))) } : r) as WireResult;
  if (task) {
    const item = SQL_TASK_SETS.find((s) => s.id === task.setId)?.items.find((i) => i.id === task.itemId);
    if (item) {
      const out = runForTask(item, src);
      return { results: out.results.map(wire), verdict: out.verdict };
    }
  }
  return { results: runSql(src).map(wire) };
}

export function runInWorker(src: string, task?: WorkerRequest['task']): Promise<RunOutput> {
  const w = getWorker();
  if (!w) return Promise.resolve(runHere(src, task));
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      // 끝나지 않는 계산: 워커를 버리고 다음 실행은 새 워커로
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      w.terminate();
      if (worker === w) worker = null;
      resolve({ results: [], timedOut: true });
    }, RUN_TIMEOUT_MS);
    const onMessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.id !== id) return;
      clearTimeout(timer);
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      resolve({ results: e.data.results, verdict: e.data.verdict });
    };
    const onError = () => {
      clearTimeout(timer);
      w.removeEventListener('message', onMessage);
      if (worker === w) worker = null;
      resolve(runHere(src, task));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError, { once: true });
    w.postMessage({ id, src, task } satisfies WorkerRequest);
  });
}
