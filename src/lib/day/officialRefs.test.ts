import { describe, expect, test } from 'vitest';
import { AWS_SERVICE_DOCS, awsDocsUrl, detectAwsServices } from './officialRefs';

const ids = (md: string) => detectAwsServices(md).map((s) => s.id);

describe('detectAwsServices — 노트에서 주로 다룬 AWS 서비스', () => {
  test('3번 이상 나온 서비스만, 많이 나온 순서로 고른다', () => {
    const md = ['EBS 는 블록 스토리지다. EBS 스냅샷은 S3 에 저장된다.', 'EBS gp3 와 EBS io2 를 비교한다. EBS 볼륨.', 'EC2 인스턴스 스토어와 EC2 의 관계. EC2 재시작. EC2 중지.', 'S3 S3'].join('\n');
    expect(ids(md)).toEqual(['ebs', 'ec2', 's3']);
  });

  test('2번 이하로 스쳐 간 서비스는 넣지 않는다', () => {
    expect(ids('Lambda 와 Lambda 를 잠깐 언급')).toEqual([]);
  });

  test('한국어 조사가 바로 붙어도 센다(S3에, EC2의)', () => {
    expect(ids('S3에 S3의 S3로')).toEqual(['s3']);
    expect(ids('EC2의 EC2를 EC2가')).toEqual(['ec2']);
  });

  test('비슷한 이름을 섞지 않는다(EC2 ≠ ECS, SQS ≠ SNS)', () => {
    expect(ids('ECS ECS ECS')).toEqual(['ecs']);
    expect(ids('SNS SNS SNS')).toEqual(['sns']);
    expect(ids('SQS SQS SQS')).toEqual(['sqs']);
  });

  test('영문 단어의 일부는 세지 않는다(RDSX, EC2s, IAMs)', () => {
    expect(ids('RDSX RDSX RDSX EC2s EC2s EC2s IAMs IAMs IAMs')).toEqual([]);
  });

  test('코드 블록(``` 와 ~~~) 안의 이름은 세지 않는다', () => {
    expect(ids('```\naws s3 cp a s3://b\nS3 S3 S3\n```\n~~~\nS3 S3 S3\n~~~\nIAM IAM IAM')).toEqual(['iam']);
  });

  test('최대 5개', () => {
    const md = AWS_SERVICE_DOCS.map((s) => `${s.label} ${s.label} ${s.label}`).join('\n');
    expect(detectAwsServices(md).length).toBe(5);
  });
});

describe('detectAwsServices — 이름이 겹치는 서비스', () => {
  test('Application/DynamoDB/Aurora Auto Scaling 은 EC2 Auto Scaling 이 아니다', () => {
    expect(ids('Application Auto Scaling, DynamoDB Auto Scaling, Aurora Auto Scaling')).not.toContain('autoscaling');
    expect(ids('Auto Scaling 그룹, Auto Scaling 정책, Auto Scaling')).toContain('autoscaling');
  });

  test('IAM Identity Center 는 IAM 으로 세지 않는다', () => {
    expect(ids('IAM Identity Center, IAM Identity Center, IAM Identity Center')).toEqual(['identity-center']);
  });

  test('Kinesis Data Firehose 는 Kinesis 로 세지 않는다', () => {
    expect(ids('Kinesis Data Firehose, Kinesis Data Firehose, Kinesis Data Firehose')).toEqual(['firehose']);
  });
});

describe('detectAwsServices — 순서', () => {
  test('제목·소제목에 나온 서비스가 본문에 흔한 IAM·S3 보다 앞선다', () => {
    const md = ['# Day 3 - Macie로 민감 데이터 찾기', '## Macie 작동 방식', '본문 IAM IAM IAM IAM IAM IAM IAM IAM IAM', 'S3 S3 S3 S3 S3 S3 S3 S3', 'Macie 는 S3 를 스캔한다.'].join('\n');
    expect(ids(md)[0]).toBe('macie');
  });

  test('점수가 같으면 목록 순서(기반 서비스 먼저)', () => {
    expect(ids('EC2 EC2 EC2 S3 S3 S3')).toEqual(['s3', 'ec2']);
  });
});

describe('awsDocsUrl — 언어별 공식 문서 주소', () => {
  test('한국어는 ko_kr, 영어는 기본 경로', () => {
    expect(awsDocsUrl('s3', 'ko')).toBe('https://docs.aws.amazon.com/ko_kr/s3/');
    expect(awsDocsUrl('s3', 'en')).toBe('https://docs.aws.amazon.com/s3/');
  });

  test('모든 서비스 경로는 문서 경로 형식이고 id 는 겹치지 않는다', () => {
    for (const s of AWS_SERVICE_DOCS) expect(s.path).toMatch(/^[a-z0-9-]+$/);
    expect(new Set(AWS_SERVICE_DOCS.map((s) => s.id)).size).toBe(AWS_SERVICE_DOCS.length);
  });
});
