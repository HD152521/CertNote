import { describe, expect, test } from 'vitest';
import { AWS_SERVICE_DOCS, awsDocsUrl, detectAwsServices } from './officialRefs';

describe('detectAwsServices — 노트에서 주로 다룬 AWS 서비스', () => {
  test('3번 이상 나온 서비스만, 많이 나온 순서로 고른다', () => {
    const md = ['EBS 는 블록 스토리지다. EBS 스냅샷은 S3 에 저장된다.', 'EBS gp3 와 EBS io2 를 비교한다. EBS 볼륨.', 'EC2 인스턴스 스토어와 EC2 의 관계. EC2 재시작. EC2 중지.', 'S3 S3'].join('\n');
    expect(detectAwsServices(md).map((s) => s.id)).toEqual(['ebs', 'ec2', 's3']);
  });

  test('2번 이하로 스쳐 간 서비스는 넣지 않는다', () => {
    expect(detectAwsServices('Lambda 와 Lambda 를 잠깐 언급').map((s) => s.id)).toEqual([]);
  });

  test('비슷한 이름을 섞지 않는다(EC2 ≠ ECS, SQS ≠ SNS)', () => {
    const md = 'ECS ECS ECS SNS SNS SNS';
    expect(detectAwsServices(md).map((s) => s.id).sort()).toEqual(['ecs', 'sns']);
  });

  test('다른 단어의 일부는 세지 않는다(DynamoDB 안의 "DB", "IAMs" 같은 꼬리)', () => {
    expect(detectAwsServices('RDSX RDSX RDSX').map((s) => s.id)).toEqual([]);
  });

  test('코드 블록 안의 이름은 세지 않는다(예제 명령어가 주제를 뜻하지 않음)', () => {
    const md = '```\naws s3 cp a s3://b\naws s3 ls\naws s3 rm\n```\nIAM IAM IAM';
    expect(detectAwsServices(md).map((s) => s.id)).toEqual(['iam']);
  });

  test('최대 개수를 넘지 않는다', () => {
    const md = AWS_SERVICE_DOCS.map((s) => `${s.label} ${s.label} ${s.label}`).join('\n');
    expect(detectAwsServices(md).length).toBe(5);
  });
});

describe('awsDocsUrl — 언어별 공식 문서 주소', () => {
  test('한국어는 ko_kr, 영어는 기본 경로', () => {
    expect(awsDocsUrl('s3', 'ko')).toBe('https://docs.aws.amazon.com/ko_kr/s3/');
    expect(awsDocsUrl('s3', 'en')).toBe('https://docs.aws.amazon.com/s3/');
  });

  test('모든 서비스 경로는 docs.aws.amazon.com 의 문서 경로 형식이다', () => {
    for (const s of AWS_SERVICE_DOCS) expect(s.path).toMatch(/^[a-z0-9-]+$/);
    expect(new Set(AWS_SERVICE_DOCS.map((s) => s.id)).size).toBe(AWS_SERVICE_DOCS.length);
  });
});

describe('detectAwsServices — 횟수가 같으면', () => {
  test('목록 순서(기반 서비스 먼저)를 따른다', () => {
    expect(detectAwsServices('EC2 EC2 EC2 S3 S3 S3').map((s) => s.id)).toEqual(['s3', 'ec2']);
  });
});
