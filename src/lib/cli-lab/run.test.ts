import { describe, expect, it } from 'vitest';
import { runCommand } from './run';
import { createInitialState, type SimState } from './state';
import { tokenize } from './tokenize';

function runAll(lines: string[], start: SimState = createInitialState()) {
  let state = start;
  const results = lines.map((line) => {
    const r = runCommand(line, state);
    state = r.state;
    return r;
  });
  return { state, results, last: results[results.length - 1] };
}

describe('tokenize', () => {
  it('keeps quoted JMESPath and joins backslash continuations', () => {
    const r = tokenize("aws ec2 describe-availability-zones \\\n  --query 'AvailabilityZones[*].[ZoneName, ZoneId]'");
    expect(r).toEqual({ ok: true, tokens: ['aws', 'ec2', 'describe-availability-zones', '--query', 'AvailabilityZones[*].[ZoneName, ZoneId]'] });
  });

  it('reports an unclosed quote', () => {
    expect(tokenize("aws s3 ls 's3://x").ok).toBe(false);
  });

  it('drops a trailing comment', () => {
    expect(tokenize('aws s3 ls # 버킷 목록')).toEqual({ ok: true, tokens: ['aws', 's3', 'ls'] });
  });
});

describe('s3api create-bucket', () => {
  it('fails in Seoul without a LocationConstraint', () => {
    const r = runCommand('aws s3api create-bucket --bucket certnote-demo-1', createInitialState());
    expect(r.exitCode).toBe(254);
    expect(r.stderr).toContain('IllegalLocationConstraintException');
    expect(r.note).toContain('LocationConstraint');
    expect(r.state.buckets).toHaveLength(0);
  });

  it('creates the bucket with shorthand or JSON configuration', () => {
    const a = runCommand(
      'aws s3api create-bucket --bucket certnote-demo-1 --create-bucket-configuration LocationConstraint=ap-northeast-2',
      createInitialState(),
    );
    expect(a.exitCode).toBe(0);
    expect(JSON.parse(a.stdout)).toEqual({ Location: 'http://certnote-demo-1.s3.amazonaws.com/' });
    expect(a.state.buckets[0]).toMatchObject({ name: 'certnote-demo-1', region: 'ap-northeast-2' });

    const b = runCommand(
      `aws s3api create-bucket --bucket certnote-demo-2 --create-bucket-configuration '{"LocationConstraint":"ap-northeast-2"}'`,
      createInitialState(),
    );
    expect(b.exitCode).toBe(0);
  });

  it('works in us-east-1 without configuration and rejects an explicit us-east-1 constraint', () => {
    expect(runCommand('aws s3api create-bucket --bucket certnote-east --region us-east-1', createInitialState()).exitCode).toBe(0);
    const bad = runCommand(
      'aws s3api create-bucket --bucket certnote-east --region us-east-1 --create-bucket-configuration LocationConstraint=us-east-1',
      createInitialState(),
    );
    expect(bad.stderr).toContain('InvalidLocationConstraint');
  });

  it('rejects names owned by someone else and invalid names', () => {
    expect(runCommand('aws s3 mb s3://test', createInitialState()).stderr).toContain('BucketAlreadyExists');
    expect(runCommand('aws s3 mb s3://My_Bucket', createInitialState()).stderr).toContain('InvalidBucketName');
  });
});

describe('state carries across commands', () => {
  it('lists, uploads and deletes like a real account', () => {
    const { results, state } = runAll([
      'aws s3 mb s3://certnote-lab-001',
      'aws s3 cp hello.txt s3://certnote-lab-001/',
      'aws s3 ls s3://certnote-lab-001',
      'aws s3 rb s3://certnote-lab-001',
      'aws s3 rb s3://certnote-lab-001 --force',
      'aws s3 ls',
    ]);
    expect(results[0].stdout).toBe('make_bucket: certnote-lab-001');
    expect(results[1].stdout).toBe('upload: ./hello.txt to s3://certnote-lab-001/hello.txt');
    expect(results[2].stdout).toMatch(/\s13 hello\.txt$/);
    expect(results[3].exitCode).toBe(1);
    expect(results[3].stderr).toContain('BucketNotEmpty');
    expect(results[4].stdout).toBe('delete: s3://certnote-lab-001/hello.txt\nremove_bucket: certnote-lab-001');
    expect(results[5].stdout).toBe('');
    expect(state.buckets).toHaveLength(0);
  });

  it('keeps old versions in a versioned bucket so it cannot be removed', () => {
    const { last, state } = runAll([
      'aws s3 mb s3://certnote-ver-001',
      'aws s3api put-bucket-versioning --bucket certnote-ver-001 --versioning-configuration Status=Enabled',
      'aws s3 cp hello.txt s3://certnote-ver-001/',
      'aws s3 rb s3://certnote-ver-001 --force',
    ]);
    expect(last.exitCode).toBe(1);
    expect(last.note).toContain('버전 관리');
    expect(state.buckets[0].objects).toHaveLength(0);
  });

  it('prints nothing for a bucket whose versioning was never set', () => {
    const { last } = runAll(['aws s3 mb s3://certnote-v', 'aws s3api get-bucket-versioning --bucket certnote-v']);
    expect(last).toMatchObject({ stdout: '', exitCode: 0 });
  });
});

describe('global options', () => {
  it('applies --query and --output table', () => {
    const r = runCommand(
      "aws ec2 describe-availability-zones --region ap-northeast-2 --query 'AvailabilityZones[*].[ZoneName,ZoneId]' --output table",
      createInitialState(),
    );
    expect(r.exitCode).toBe(0);
    const lines = r.stdout.split('\n');
    expect(lines[1]).toContain('DescribeAvailabilityZones');
    expect(r.stdout).toContain('ap-northeast-2a');
    expect(r.stdout).toContain('apne2-az1');
    expect(new Set(lines.map((l) => l.length)).size).toBe(1);
  });

  it('renders nested tables with equal line widths', () => {
    const r = runCommand('aws ec2 describe-regions --output table', createInitialState());
    const lines = r.stdout.split('\n');
    expect(lines.some((l) => l.startsWith('||'))).toBe(true);
    expect(new Set(lines.map((l) => l.length)).size).toBe(1);
  });

  it('prints text output tab separated', () => {
    const r = runCommand("aws ec2 describe-availability-zones --query 'AvailabilityZones[].ZoneName' --output text", createInitialState());
    expect(r.stdout).toBe('ap-northeast-2a\tap-northeast-2b\tap-northeast-2c\tap-northeast-2d');
  });

  it('reports an unknown region as an endpoint error', () => {
    const r = runCommand('aws ec2 describe-regions --region seoul', createInitialState());
    expect(r.exitCode).toBe(255);
    expect(r.stderr).toContain('https://ec2.seoul.amazonaws.com/');
  });

  it('reports a bad JMESPath expression', () => {
    expect(runCommand("aws ec2 describe-regions --query 'Regions[*.'", createInitialState()).exitCode).toBe(252);
  });
});

describe('argument errors', () => {
  it('names unknown options and missing required ones', () => {
    expect(runCommand('aws s3api get-bucket-versioning --bukket x', createInitialState()).stderr).toContain(
      'Unknown options: --bukket, x',
    );
    expect(runCommand('aws iam create-user', createInitialState()).stderr).toContain(
      'the following arguments are required: --user-name',
    );
  });

  it('lists valid operations for a typo', () => {
    const r = runCommand('aws s3api create-buckets --bucket x', createInitialState());
    expect(r.stderr).toContain('Invalid choice');
    expect(r.stderr).toContain('create-bucket');
  });

  it('treats non-aws commands as missing', () => {
    expect(runCommand('kubectl get pods', createInitialState()).exitCode).toBe(127);
  });
});

describe('iam', () => {
  it('creates a user, attaches a policy and refuses to delete while attached', () => {
    const { results } = runAll([
      'aws iam create-user --user-name dev-kim',
      'aws iam attach-user-policy --user-name dev-kim --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess',
      "aws iam list-attached-user-policies --user-name dev-kim --query 'AttachedPolicies[].PolicyName' --output text",
      'aws iam delete-user --user-name dev-kim',
      'aws iam create-user --user-name DEV-KIM',
    ]);
    expect(JSON.parse(results[0].stdout).User.Arn).toBe('arn:aws:iam::123456789012:user/dev-kim');
    expect(results[2].stdout).toBe('ReadOnlyAccess');
    expect(results[3].stderr).toContain('DeleteConflict');
    expect(results[4].stderr).toContain('EntityAlreadyExists');
  });

  it('is global so an unknown --region does not matter', () => {
    expect(runCommand('aws sts get-caller-identity --region nowhere-1', createInitialState()).exitCode).toBe(0);
  });
});

describe('teaching notes', () => {
  it('explains the managed policy ARN format', () => {
    const { last } = runAll([
      'aws iam create-user --user-name dev-kim',
      'aws iam attach-user-policy --user-name dev-kim --policy-arn arn:aws:iam::123456789012:policy/ReadOnlyAccess',
    ]);
    expect(last.stderr).toContain('NoSuchEntity');
    expect(last.note).toContain('arn:aws:iam::aws:policy/');
  });
});
