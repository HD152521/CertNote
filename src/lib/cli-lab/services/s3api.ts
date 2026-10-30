import { isoTime } from '../state';
import type { ServiceSpec, CommandContext, CommandOutcome } from '../types';
import { createBucketError, findBucket, removeBucket, replaceBucket, S3_ERRORS } from './s3common';

function str(ctx: CommandContext, name: string): string {
  const v = ctx.args[name];
  return typeof v === 'string' ? v : '';
}

function structure(ctx: CommandContext, name: string): Record<string, unknown> {
  const v = ctx.args[name];
  return typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function s3Error(code: keyof typeof S3_ERRORS): CommandOutcome {
  return { kind: 'service-error', code, message: S3_ERRORS[code] };
}

function createBucket(ctx: CommandContext): CommandOutcome {
  const name = str(ctx, '--bucket');
  const constraint = structure(ctx, '--create-bucket-configuration').LocationConstraint as string | undefined;

  // 서울 같은 리전 엔드포인트로 보내면서 LocationConstraint 를 빼면 실패한다 — SAA 단골 함정.
  if (ctx.region === 'us-east-1') {
    if (constraint === 'us-east-1') {
      return { kind: 'service-error', code: 'InvalidLocationConstraint', message: 'The specified location-constraint is not valid' };
    }
  } else if (!constraint) {
    return {
      kind: 'service-error',
      code: 'IllegalLocationConstraintException',
      message: 'The unspecified location constraint is incompatible for the region specific endpoint this request was sent to.',
    };
  } else if (constraint !== ctx.region) {
    return {
      kind: 'service-error',
      code: 'IllegalLocationConstraintException',
      message: `The ${constraint} location constraint is incompatible for the region specific endpoint this request was sent to.`,
    };
  }

  const err = createBucketError(ctx.state, name);
  if (err) return s3Error(err);

  const region = constraint ?? ctx.region;
  const state = { ...ctx.state, buckets: [...ctx.state.buckets, { name, region, createdAt: ctx.state.clock, objects: [], hiddenVersions: 0 }] };
  const location = region === 'us-east-1' ? `/${name}` : `http://${name}.s3.amazonaws.com/`;
  return { kind: 'ok', state, data: { Location: location } };
}

export const s3api: ServiceSpec = {
  operations: {
    'create-bucket': {
      apiName: 'CreateBucket',
      params: [
        { name: '--bucket', kind: 'string', required: true },
        { name: '--create-bucket-configuration', kind: 'structure' },
        { name: '--acl', kind: 'string' },
        { name: '--object-ownership', kind: 'string' },
      ],
      run: createBucket,
    },
    'list-buckets': {
      apiName: 'ListBuckets',
      params: [],
      run: (ctx) => ({
        kind: 'ok',
        data: {
          Buckets: ctx.state.buckets.map((b) => ({ Name: b.name, CreationDate: isoTime(b.createdAt) })),
          Owner: { ID: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2' },
        },
      }),
    },
    'head-bucket': {
      apiName: 'HeadBucket',
      params: [{ name: '--bucket', kind: 'string', required: true }],
      run: (ctx) => {
        const b = findBucket(ctx.state, str(ctx, '--bucket'));
        if (!b) return { kind: 'service-error', code: '404', message: 'Not Found' };
        return { kind: 'ok', data: { BucketRegion: b.region, AccessPointAlias: false } };
      },
    },
    'get-bucket-location': {
      apiName: 'GetBucketLocation',
      params: [{ name: '--bucket', kind: 'string', required: true }],
      run: (ctx) => {
        const b = findBucket(ctx.state, str(ctx, '--bucket'));
        if (!b) return s3Error('NoSuchBucket');
        // us-east-1 버킷은 null 이 온다(역사적 이유).
        return { kind: 'ok', data: { LocationConstraint: b.region === 'us-east-1' ? null : b.region } };
      },
    },
    'put-bucket-versioning': {
      apiName: 'PutBucketVersioning',
      params: [
        { name: '--bucket', kind: 'string', required: true },
        { name: '--versioning-configuration', kind: 'structure', required: true },
      ],
      run: (ctx) => {
        const b = findBucket(ctx.state, str(ctx, '--bucket'));
        if (!b) return s3Error('NoSuchBucket');
        const status = structure(ctx, '--versioning-configuration').Status;
        if (status !== 'Enabled' && status !== 'Suspended') {
          return { kind: 'service-error', code: 'MalformedXML', message: 'The XML you provided was not well-formed or did not validate against our published schema' };
        }
        return { kind: 'ok', state: replaceBucket(ctx.state, { ...b, versioning: status }) };
      },
    },
    'get-bucket-versioning': {
      apiName: 'GetBucketVersioning',
      params: [{ name: '--bucket', kind: 'string', required: true }],
      run: (ctx) => {
        const b = findBucket(ctx.state, str(ctx, '--bucket'));
        if (!b) return s3Error('NoSuchBucket');
        // 한 번도 설정하지 않은 버킷은 빈 응답 — 터미널에 아무것도 안 찍힌다.
        return { kind: 'ok', data: b.versioning ? { Status: b.versioning } : undefined };
      },
    },
    'delete-bucket': {
      apiName: 'DeleteBucket',
      params: [{ name: '--bucket', kind: 'string', required: true }],
      run: (ctx) => {
        const b = findBucket(ctx.state, str(ctx, '--bucket'));
        if (!b) return s3Error('NoSuchBucket');
        if (b.objects.length || b.hiddenVersions) return s3Error('BucketNotEmpty');
        return { kind: 'ok', state: removeBucket(ctx.state, b.name) };
      },
    },
  },
};
