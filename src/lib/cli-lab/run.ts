// 명령 한 줄 실행: 토큰화 → 전역 옵션 분리 → 서비스·작업 찾기 → 인자 검증 → 실행 → --query·--output 적용.
// 오류 문구는 AWS CLI v2 를 따르고, 학습에 도움이 되는 한국어 설명은 note 로 따로 돌려준다(출력에 섞지 않는다).
import { search } from 'jmespath';
import { formatOutput, OUTPUT_FORMATS, type OutputFormat } from './format';
import { isKnownRegion } from './regions';
import { tick, type SimState } from './state';
import { tokenize } from './tokenize';
import type { ArgValue, CommandOutcome, CommandRecord, OperationSpec, RunResult, ServiceSpec } from './types';
import { s3 } from './services/s3';
import { s3api } from './services/s3api';
import { ec2, iam, sts } from './services/identity';

export const SERVICES: Record<string, ServiceSpec> = { ec2, iam, s3, s3api, sts };

const USAGE = `
usage: aws [options] <command> <subcommand> [<subcommand> ...] [parameters]
To see help text, you can run:

  aws help
  aws <command> help
  aws <command> <subcommand> help
`;

const GLOBAL_VALUE_OPTIONS = new Set(['--region', '--output', '--query', '--profile', '--endpoint-url']);
const GLOBAL_FLAGS = new Set(['--no-cli-pager', '--debug', '--no-paginate', '--no-verify-ssl', '--no-sign-request']);

const SERVICE_NOTES: Record<string, string> = {
  IllegalLocationConstraintException:
    'us-east-1 이 아닌 리전에서 s3api create-bucket 을 쓰면 --create-bucket-configuration LocationConstraint=<리전> 을 꼭 넣어야 해요. aws s3 mb 는 이걸 알아서 넣어 줘요.',
  InvalidLocationConstraint: 'us-east-1 은 기본 리전이라 LocationConstraint 를 넣으면 오히려 거부돼요.',
  BucketAlreadyExists: '버킷 이름은 모든 AWS 계정을 통틀어 하나뿐이에요. 이름 뒤에 계정 번호나 날짜를 붙여 보세요.',
  InvalidBucketName: '버킷 이름은 3~63자, 소문자·숫자·하이픈·점만 쓸 수 있고 문자나 숫자로 시작하고 끝나야 해요.',
  DeleteConflict: '정책이 붙은 사용자는 바로 지울 수 없어요. detach-user-policy 로 먼저 떼어 내세요.',
};

function columns(items: string[]): string {
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items[i + 1] ? `${items[i].padEnd(40)} | ${items[i + 1]}` : items[i]);
  }
  return rows.join('\n');
}

function shorthand(value: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const pair of value.split(',')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) return null;
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

interface Parsed {
  args: Record<string, ArgValue>;
  positionals: string[];
}

type ParseResult = { ok: true; value: Parsed } | { ok: false; stderr: string; exitCode: number };

function parseOperationArgs(tokens: string[], op: OperationSpec, isS3: boolean): ParseResult {
  const raw: Array<{ name: string; values: string[] }> = [];
  const positionals: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (!t.startsWith('--')) {
      positionals.push(t);
      continue;
    }
    const eq = t.indexOf('=');
    const name = eq > 0 ? t.slice(0, eq) : t;
    const values: string[] = eq > 0 ? [t.slice(eq + 1)] : [];
    while (eq < 0 && i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
      values.push(tokens[i + 1]);
      i += 1;
    }
    raw.push({ name, values });
  }

  const unknown: string[] = [];
  const args: Record<string, ArgValue> = {};
  for (const { name, values } of raw) {
    const spec = op.params.find((p) => p.name === name);
    if (!spec) {
      unknown.push(name, ...values);
      continue;
    }
    if (spec.kind === 'flag') {
      args[name] = true;
      positionals.push(...values);
      continue;
    }
    if (!values.length) return { ok: false, stderr: `${USAGE}\naws: error: argument ${name}: expected one argument`, exitCode: 252 };
    if (spec.kind === 'list') {
      args[name] = values;
      continue;
    }
    if (values.length > 1) unknown.push(...values.slice(1));
    if (spec.kind === 'structure') {
      const v = values[0].trim();
      let parsed: unknown = null;
      if (v.startsWith('{')) {
        try {
          parsed = JSON.parse(v);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { ok: false, stderr: `\nError parsing parameter '${name}': Invalid JSON: ${msg}\nJSON received: ${v}`, exitCode: 252 };
        }
      } else {
        parsed = shorthand(v);
      }
      if (!parsed) {
        return { ok: false, stderr: `\nError parsing parameter '${name}': Expected: '=', received: 'EOF' for input:\n${v}`, exitCode: 252 };
      }
      args[name] = parsed as unknown as ArgValue;
      continue;
    }
    args[name] = values[0];
  }

  const range = op.positionals ?? { min: 0, max: 0 };
  if (positionals.length > range.max) unknown.push(...positionals.splice(range.max));
  if (unknown.length) return { ok: false, stderr: `${USAGE}\nUnknown options: ${unknown.join(', ')}`, exitCode: 252 };

  const missing = op.params.filter((p) => p.required && !(p.name in args)).map((p) => p.name);
  if (positionals.length < range.min) missing.push('paths');
  if (missing.length) {
    const prefix = isS3 ? '' : USAGE;
    return { ok: false, stderr: `${prefix}\naws: error: the following arguments are required: ${missing.join(', ')}`, exitCode: 252 };
  }
  return { ok: true, value: { args, positionals } };
}

function result(state: SimState, record: CommandRecord, out: Partial<Omit<RunResult, 'state' | 'record'>>): RunResult {
  return { state, stdout: out.stdout ?? '', stderr: out.stderr ?? '', exitCode: out.exitCode ?? 0, note: out.note, record: { ...record, exitCode: out.exitCode ?? 0 } };
}

function runLocal(tokens: string[], state: SimState, record: CommandRecord): RunResult {
  const cmd = tokens[0];
  if (cmd === 'ls') return result(state, record, { stdout: state.localFiles.map((f) => f.name).join('  ') });
  return result(state, record, {
    stderr: `bash: ${cmd}: command not found`,
    exitCode: 127,
    note: '연습장은 aws 명령과 ls 만 실행해요. 화면 정리는 clear, 처음 상태로 되돌리기는 reset 이에요.',
  });
}

export function runCommand(line: string, before: SimState): RunResult {
  const record: CommandRecord = { raw: line, args: {}, positionals: [], exitCode: 0 };
  const tk = tokenize(line);
  if (!tk.ok) return result(before, record, { stderr: `bash: ${tk.error}`, exitCode: 2 });
  if (!tk.tokens.length) return result(before, record, {});
  if (tk.tokens[0] !== 'aws') return runLocal(tk.tokens, before, record);

  const state = tick(before);
  const globals: Record<string, string> = {};
  const rest: string[] = [];
  const tokens = tk.tokens.slice(1);
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    const eq = t.indexOf('=');
    const name = eq > 0 ? t.slice(0, eq) : t;
    if (GLOBAL_VALUE_OPTIONS.has(name)) {
      const value = eq > 0 ? t.slice(eq + 1) : tokens[i + 1];
      if (value === undefined || (eq < 0 && value.startsWith('--'))) {
        return result(state, record, { stderr: `${USAGE}\naws: error: argument ${name}: expected one argument`, exitCode: 252 });
      }
      globals[name] = value;
      if (eq < 0) i += 1;
    } else if (GLOBAL_FLAGS.has(t)) {
      // 페이저·디버그 옵션은 연습장에서 의미가 없어 받아만 둔다.
    } else {
      rest.push(t);
    }
  }

  if (rest[0] === '--version') {
    return result(state, record, { stdout: 'aws-cli/2.31.0 Python/3.13.7 Linux/6.1 exe/x86_64 (CertNote 연습장)' });
  }
  const [serviceName, opName, ...opTokens] = rest;
  const region = globals['--region'] ?? state.defaultRegion;
  Object.assign(record, { service: serviceName, operation: opName, region, output: globals['--output'], query: globals['--query'] });

  if (!serviceName) {
    return result(state, record, { stderr: `${USAGE}\naws: error: the following arguments are required: command`, exitCode: 252 });
  }
  if (serviceName === 'help' || opName === 'help') {
    const svc = SERVICES[serviceName];
    return result(state, record, {
      stdout: svc ? columns(Object.keys(svc.operations)) : columns(Object.keys(SERVICES)),
      note: '연습장의 help 는 지원하는 명령 목록만 보여 줘요. 실제 CLI 는 man 페이지 형식의 긴 도움말이 나와요.',
    });
  }
  const service = SERVICES[serviceName];
  if (!service) {
    return result(state, record, {
      stderr: `${USAGE}\naws: error: argument command: Invalid choice, valid choices are:\n\n${columns(Object.keys(SERVICES))}`,
      exitCode: 252,
      note: `연습장은 ${Object.keys(SERVICES).join(', ')} 만 흉내 내요. 실제 CLI 는 수백 개 서비스를 지원해요.`,
    });
  }
  const op = opName ? service.operations[opName] : undefined;
  if (!op) {
    const err = opName
      ? `aws: error: argument operation: Invalid choice, valid choices are:\n\n${columns(Object.keys(service.operations))}`
      : 'aws: error: the following arguments are required: operation';
    return result(state, record, { stderr: `${USAGE}\n${err}`, exitCode: 252 });
  }

  const output = globals['--output'] ?? 'json';
  if (!['json', 'text', 'table', 'yaml', 'yaml-stream'].includes(output)) {
    return result(state, record, {
      stderr: `${USAGE}\naws: error: argument --output: Invalid choice, valid choices are:\n\n${columns(['json', 'text', 'table', 'yaml', 'yaml-stream'])}`,
      exitCode: 252,
    });
  }
  const profile = globals['--profile'];
  if (profile && profile !== 'default') {
    return result(state, record, { stderr: `\nThe config profile (${profile}) could not be found`, exitCode: 253 });
  }
  if (!service.global && !isKnownRegion(region)) {
    const host = serviceName === 's3api' ? 's3' : serviceName;
    return result(state, record, {
      stderr: `\nCould not connect to the endpoint URL: "https://${host}.${region}.amazonaws.com/"`,
      exitCode: 255,
      note: `'${region}' 은 없는 리전 이름이에요. 서울은 ap-northeast-2 예요.`,
    });
  }

  const parsed = parseOperationArgs(opTokens, op, serviceName === 's3');
  if (!parsed.ok) return result(state, record, { stderr: parsed.stderr, exitCode: parsed.exitCode });
  Object.assign(record, { args: parsed.value.args, positionals: parsed.value.positionals });

  const outcome: CommandOutcome = op.run({ state, region, args: parsed.value.args, positionals: parsed.value.positionals });
  return finish(outcome, state, record, op, globals['--query'], output);
}

function finish(
  outcome: CommandOutcome,
  state: SimState,
  record: CommandRecord,
  op: OperationSpec,
  query: string | undefined,
  output: string,
): RunResult {
  if (outcome.kind === 'error') {
    const note = /BucketNotEmpty/.test(outcome.stderr) ? bucketNotEmptyNote(outcome.state ?? state, record) : undefined;
    return result(outcome.state ?? state, record, { stderr: outcome.stderr, exitCode: outcome.exitCode, note });
  }
  if (outcome.kind === 'service-error') {
    const note =
      outcome.code === 'BucketNotEmpty'
        ? bucketNotEmptyNote(state, record)
        : outcome.message.includes(':policy/') && !outcome.message.includes('iam::aws:policy/')
          ? 'AWS 관리형 정책의 ARN 은 계정 번호 자리에 aws 가 들어가요: arn:aws:iam::aws:policy/<정책 이름>'
          : SERVICE_NOTES[outcome.code];
    return result(outcome.state ?? state, record, {
      stderr: `\nAn error occurred (${outcome.code}) when calling the ${op.apiName} operation: ${outcome.message}`,
      exitCode: 254,
      note,
    });
  }

  const next = outcome.state ?? state;
  if (outcome.stdout !== undefined) return result(next, record, { stdout: outcome.stdout });

  let data = outcome.data;
  if (query && data !== undefined) {
    try {
      data = search(data as Parameters<typeof search>[0], query);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return result(state, record, { stderr: `\nBad value for --query ${query}: ${msg}`, exitCode: 252 });
    }
  }
  const fmt: OutputFormat = (OUTPUT_FORMATS as readonly string[]).includes(output) ? (output as OutputFormat) : 'json';
  const note = output.startsWith('yaml') ? '연습장은 yaml 출력을 흉내 내지 않아 json 으로 보여 줘요.' : undefined;
  return result(next, record, { stdout: formatOutput(data, fmt, op.apiName), note });
}

function bucketNotEmptyNote(state: SimState, record: CommandRecord): string {
  const target = String(record.args['--bucket'] ?? record.positionals[0] ?? '').replace(/^s3:\/\//, '');
  const bucket = state.buckets.find((b) => b.name === target);
  if (bucket && !bucket.objects.length && bucket.hiddenVersions) {
    return '버전 관리가 켜진 버킷은 객체를 지워도 이전 버전과 삭제 마커가 남아서 비어 있지 않아요. 실제로는 모든 버전을 지워야 버킷을 삭제할 수 있어요. 연습장에서는 reset 으로 처음부터 다시 할 수 있어요.';
  }
  return '버킷 안에 객체가 남아 있어요. aws s3 rm s3://<버킷> --recursive 로 비우거나 aws s3 rb s3://<버킷> --force 를 쓰세요.';
}
