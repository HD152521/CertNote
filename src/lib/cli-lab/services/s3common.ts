import type { Bucket, SimState } from '../state';

// 다른 계정이 이미 가진 것으로 치는 흔한 이름들. 버킷 이름이 전 세계에서 하나뿐이라는 걸 체험하게 한다.
const TAKEN_BUCKET_NAMES = new Set([
  'test', 'bucket', 'my-bucket', 'mybucket', 'test-bucket', 'my-test-bucket',
  'backup', 'backups', 'data', 'logs', 'aws', 'example', 'images', 'static', 'website',
]);

export function isValidBucketName(name: string): boolean {
  if (name.length < 3 || name.length > 63) return false;
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(name)) return false;
  if (name.includes('..')) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return false;
  if (name.startsWith('xn--') || name.startsWith('sthree-')) return false;
  if (name.endsWith('-s3alias') || name.endsWith('--ol-s3')) return false;
  return true;
}

export function isTakenElsewhere(name: string): boolean {
  return TAKEN_BUCKET_NAMES.has(name);
}

export function findBucket(state: SimState, name: string): Bucket | undefined {
  return state.buckets.find((b) => b.name === name);
}

export function replaceBucket(state: SimState, bucket: Bucket): SimState {
  return { ...state, buckets: state.buckets.map((b) => (b.name === bucket.name ? bucket : b)) };
}

export function removeBucket(state: SimState, name: string): SimState {
  return { ...state, buckets: state.buckets.filter((b) => b.name !== name) };
}

export function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  const m = /^s3:\/\/([^/]+)\/?(.*)$/.exec(uri);
  return m ? { bucket: m[1], key: m[2] } : null;
}

export const S3_ERRORS = {
  NoSuchBucket: 'The specified bucket does not exist',
  BucketNotEmpty: 'The bucket you tried to delete is not empty',
  InvalidBucketName: 'The specified bucket is not valid.',
  BucketAlreadyExists:
    'The requested bucket name is not available. The bucket namespace is shared by all users of the system. Please select a different name and try again.',
  BucketAlreadyOwnedByYou:
    'Your previous request to create the named bucket succeeded and you already own it.',
} as const;

/** 버킷 생성 공통 판정. 성공이면 null. */
export function createBucketError(state: SimState, name: string): keyof typeof S3_ERRORS | null {
  if (!isValidBucketName(name)) return 'InvalidBucketName';
  if (findBucket(state, name)) return 'BucketAlreadyOwnedByYou';
  if (isTakenElsewhere(name)) return 'BucketAlreadyExists';
  return null;
}
