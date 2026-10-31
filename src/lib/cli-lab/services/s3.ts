// `aws s3` 고수준 명령. API 오류를 그대로 찍지 않고 "make_bucket failed: ..." 처럼 감싸며, 실패 시 종료 코드는 1.
import type { Bucket, SimState } from '../state';
import { lsTime } from '../state';
import type { CommandContext, CommandOutcome, ServiceSpec } from '../types';
import { createBucketError, findBucket, parseS3Uri, removeBucket, replaceBucket, S3_ERRORS } from './s3common';

const apiError = (code: keyof typeof S3_ERRORS, op: string) =>
  `An error occurred (${code}) when calling the ${op} operation: ${S3_ERRORS[code]}`;

function fail(stderr: string, exitCode = 1, state?: SimState): CommandOutcome {
  return { kind: 'error', stderr, exitCode, state };
}

function badUri(arg: string | undefined): CommandOutcome {
  return fail(`\nusage: aws s3 <Command> [<Arg> ...]\nError: Invalid argument type: ${arg ?? ''}`, 252);
}

function mb(ctx: CommandContext): CommandOutcome {
  const uri = ctx.positionals[0];
  const p = uri ? parseS3Uri(uri) : null;
  if (!p) return badUri(uri);
  const err = createBucketError(ctx.state, p.bucket);
  if (err) return fail(`make_bucket failed: ${uri} ${apiError(err, 'CreateBucket')}`);
  // 고수준 명령은 현재 리전을 LocationConstraint 로 알아서 넣어 준다.
  const bucket: Bucket = { name: p.bucket, region: ctx.region, createdAt: ctx.state.clock, objects: [], hiddenVersions: 0 };
  return { kind: 'ok', state: { ...ctx.state, buckets: [...ctx.state.buckets, bucket] }, stdout: `make_bucket: ${p.bucket}` };
}

function deleteObjects(bucket: Bucket, keys: string[]): Bucket {
  const versioned = bucket.versioning === 'Enabled' || bucket.versioning === 'Suspended';
  return {
    ...bucket,
    objects: bucket.objects.filter((o) => !keys.includes(o.key)),
    // 버전 관리 버킷에서 지우면 객체는 이전 버전으로 남고 삭제 마커가 하나 생긴다.
    hiddenVersions: bucket.hiddenVersions + (versioned ? keys.length * 2 : 0),
  };
}

function rb(ctx: CommandContext): CommandOutcome {
  const uri = ctx.positionals[0];
  const p = uri ? parseS3Uri(uri) : null;
  if (!p) return badUri(uri);
  const bucket = findBucket(ctx.state, p.bucket);
  if (!bucket) return fail(`remove_bucket failed: ${uri} ${apiError('NoSuchBucket', 'DeleteBucket')}`);

  let state = ctx.state;
  let current = bucket;
  const lines: string[] = [];
  if (ctx.args['--force'] && bucket.objects.length) {
    lines.push(...bucket.objects.map((o) => `delete: s3://${bucket.name}/${o.key}`));
    current = deleteObjects(bucket, bucket.objects.map((o) => o.key));
    state = replaceBucket(state, current);
  }
  if (current.objects.length || current.hiddenVersions) {
    lines.push(`remove_bucket failed: ${uri} ${apiError('BucketNotEmpty', 'DeleteBucket')}`);
    return { kind: 'error', stderr: lines.join('\n'), exitCode: 1, state };
  }
  lines.push(`remove_bucket: ${bucket.name}`);
  return { kind: 'ok', state: removeBucket(state, bucket.name), stdout: lines.join('\n') };
}

function ls(ctx: CommandContext): CommandOutcome {
  const uri = ctx.positionals[0];
  if (!uri) {
    const lines = [...ctx.state.buckets]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((b) => `${lsTime(b.createdAt)} ${b.name}`);
    return { kind: 'ok', stdout: lines.join('\n') };
  }
  const p = parseS3Uri(uri);
  if (!p) return badUri(uri);
  const bucket = findBucket(ctx.state, p.bucket);
  if (!bucket) {
    return { kind: 'error', stderr: `\n${apiError('NoSuchBucket', 'ListObjectsV2')}`, exitCode: 254 };
  }
  const lines = bucket.objects
    .filter((o) => o.key.startsWith(p.key))
    .map((o) => `${lsTime(o.lastModified)} ${String(o.size).padStart(10)} ${o.key}`);
  return { kind: 'ok', stdout: lines.join('\n') };
}

function cp(ctx: CommandContext): CommandOutcome {
  const [src, dst] = ctx.positionals;
  const target = dst ? parseS3Uri(dst) : null;
  if (!src || !target || src.startsWith('s3://')) {
    return fail('\n연습장은 로컬 파일 → S3 업로드(aws s3 cp <파일> s3://<버킷>/)만 지원해요.', 252);
  }
  const fileName = src.replace(/^\.\//, '');
  const file = ctx.state.localFiles.find((f) => f.name === fileName);
  if (!file) return fail(`\nThe user-provided path ${src} does not exist.`, 255);

  const key = target.key === '' || target.key.endsWith('/') ? `${target.key}${file.name}` : target.key;
  const shown = `upload: ./${file.name} to s3://${target.bucket}/${key}`;
  const bucket = findBucket(ctx.state, target.bucket);
  if (!bucket) return fail(`upload failed: ./${file.name} to s3://${target.bucket}/${key} ${apiError('NoSuchBucket', 'PutObject')}`);

  const overwritten = bucket.objects.some((o) => o.key === key);
  const updated: Bucket = {
    ...bucket,
    objects: [...bucket.objects.filter((o) => o.key !== key), { key, size: file.size, lastModified: ctx.state.clock }],
    hiddenVersions: bucket.hiddenVersions + (overwritten && bucket.versioning === 'Enabled' ? 1 : 0),
  };
  return { kind: 'ok', state: replaceBucket(ctx.state, updated), stdout: shown };
}

function rm(ctx: CommandContext): CommandOutcome {
  const uri = ctx.positionals[0];
  const p = uri ? parseS3Uri(uri) : null;
  if (!p) return badUri(uri);
  const bucket = findBucket(ctx.state, p.bucket);
  if (!bucket) return fail(`delete failed: ${uri} ${apiError('NoSuchBucket', 'DeleteObject')}`);
  const keys = ctx.args['--recursive']
    ? bucket.objects.filter((o) => o.key.startsWith(p.key)).map((o) => o.key)
    : [p.key];
  // 없는 키를 지워도 S3 는 성공으로 답한다.
  const stdout = keys.map((k) => `delete: s3://${bucket.name}/${k}`).join('\n');
  const existing = keys.filter((k) => bucket.objects.some((o) => o.key === k));
  return { kind: 'ok', state: replaceBucket(ctx.state, deleteObjects(bucket, existing)), stdout };
}

const one = { min: 1, max: 1 };
export const s3: ServiceSpec = {
  operations: {
    mb: { apiName: 'CreateBucket', params: [], positionals: one, run: mb },
    rb: { apiName: 'DeleteBucket', params: [{ name: '--force', kind: 'flag' }], positionals: one, run: rb },
    ls: {
      apiName: 'ListObjectsV2',
      params: [{ name: '--recursive', kind: 'flag' }, { name: '--human-readable', kind: 'flag' }, { name: '--summarize', kind: 'flag' }],
      positionals: { min: 0, max: 1 },
      run: ls,
    },
    cp: { apiName: 'PutObject', params: [{ name: '--recursive', kind: 'flag' }], positionals: { min: 2, max: 2 }, run: cp },
    rm: { apiName: 'DeleteObject', params: [{ name: '--recursive', kind: 'flag' }], positionals: one, run: rm },
  },
};
