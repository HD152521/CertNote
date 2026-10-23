import type { Lang } from '@/lib/category';

// day 노트 끝의 "참고 공식 자료" 블록 재료. 구글 검색 기본 가이드의 "출처를 드러내고 관련 자료로 연결"
// 항목 대응 — 측정 당시 학습 노트 807개 중 AWS 공식 문서로 연결된 노트는 20개뿐이었다.
//
// 주소는 docs.aws.amazon.com 의 서비스별 문서 시작 페이지(ko_kr 경로 포함)를 2026-10-24 에 하나씩 요청해
// 200 을 확인한 것만 넣었다. aurora·backup·transit-gateway 처럼 시작 페이지가 404 인 경로는 뺐다.
export interface AwsServiceDoc {
  id: string;
  label: string; // 화면에 보이는 이름
  path: string; // docs.aws.amazon.com/<path>/
  pattern: RegExp; // 노트 본문에서 이 서비스를 가리키는 표기
}

// 영문 이름 앞뒤가 다른 영문자·숫자가 아니어야 한다("RDSX", "EC2s" 제외). 한글 조사는 바로 붙어도 된다.
const word = (alt: string) => new RegExp(`(?<![A-Za-z0-9])(?:${alt})(?![A-Za-z0-9])`, 'g');

export const AWS_SERVICE_DOCS: readonly AwsServiceDoc[] = [
  { id: 's3', label: 'Amazon S3', path: 's3', pattern: word('S3') },
  { id: 'ec2', label: 'Amazon EC2', path: 'ec2', pattern: word('EC2') },
  { id: 'ebs', label: 'Amazon EBS', path: 'ebs', pattern: word('EBS') },
  { id: 'efs', label: 'Amazon EFS', path: 'efs', pattern: word('EFS') },
  { id: 'fsx', label: 'Amazon FSx', path: 'fsx', pattern: word('FSx') },
  { id: 'rds', label: 'Amazon RDS · Aurora', path: 'rds', pattern: word('RDS|Aurora') },
  { id: 'dynamodb', label: 'Amazon DynamoDB', path: 'dynamodb', pattern: word('DynamoDB') },
  { id: 'elasticache', label: 'Amazon ElastiCache', path: 'elasticache', pattern: word('ElastiCache') },
  { id: 'lambda', label: 'AWS Lambda', path: 'lambda', pattern: word('Lambda') },
  { id: 'apigateway', label: 'Amazon API Gateway', path: 'apigateway', pattern: word('API Gateway') },
  { id: 'sqs', label: 'Amazon SQS', path: 'sqs', pattern: word('SQS') },
  { id: 'sns', label: 'Amazon SNS', path: 'sns', pattern: word('SNS') },
  { id: 'eventbridge', label: 'Amazon EventBridge', path: 'eventbridge', pattern: word('EventBridge') },
  { id: 'step-functions', label: 'AWS Step Functions', path: 'step-functions', pattern: word('Step Functions') },
  { id: 'cloudfront', label: 'Amazon CloudFront', path: 'cloudfront', pattern: word('CloudFront') },
  { id: 'route53', label: 'Amazon Route 53', path: 'route53', pattern: word('Route ?53') },
  { id: 'vpc', label: 'Amazon VPC', path: 'vpc', pattern: word('VPC') },
  { id: 'directconnect', label: 'AWS Direct Connect', path: 'directconnect', pattern: word('Direct Connect') },
  { id: 'elb', label: 'Elastic Load Balancing', path: 'elasticloadbalancing', pattern: word('ELB|ALB|NLB|Elastic Load Balancing') },
  { id: 'autoscaling', label: 'Amazon EC2 Auto Scaling', path: 'autoscaling', pattern: word('Auto Scaling') },
  { id: 'iam', label: 'AWS IAM', path: 'iam', pattern: word('IAM') },
  { id: 'identity-center', label: 'IAM Identity Center', path: 'singlesignon', pattern: word('IAM Identity Center') },
  { id: 'organizations', label: 'AWS Organizations', path: 'organizations', pattern: word('Organizations|SCP') },
  { id: 'controltower', label: 'AWS Control Tower', path: 'controltower', pattern: word('Control Tower') },
  { id: 'kms', label: 'AWS KMS', path: 'kms', pattern: word('KMS') },
  { id: 'secretsmanager', label: 'AWS Secrets Manager', path: 'secretsmanager', pattern: word('Secrets Manager') },
  { id: 'acm', label: 'AWS Certificate Manager', path: 'acm', pattern: word('ACM|Certificate Manager') },
  { id: 'waf', label: 'AWS WAF · Shield', path: 'waf', pattern: word('WAF|Shield') },
  { id: 'guardduty', label: 'Amazon GuardDuty', path: 'guardduty', pattern: word('GuardDuty') },
  { id: 'securityhub', label: 'AWS Security Hub', path: 'securityhub', pattern: word('Security Hub') },
  { id: 'macie', label: 'Amazon Macie', path: 'macie', pattern: word('Macie') },
  { id: 'inspector', label: 'Amazon Inspector', path: 'inspector', pattern: word('Inspector') },
  { id: 'cognito', label: 'Amazon Cognito', path: 'cognito', pattern: word('Cognito') },
  { id: 'cloudwatch', label: 'Amazon CloudWatch', path: 'cloudwatch', pattern: word('CloudWatch') },
  { id: 'cloudtrail', label: 'AWS CloudTrail', path: 'cloudtrail', pattern: word('CloudTrail') },
  { id: 'config', label: 'AWS Config', path: 'config', pattern: word('AWS Config') },
  { id: 'xray', label: 'AWS X-Ray', path: 'xray', pattern: word('X-Ray') },
  { id: 'cloudformation', label: 'AWS CloudFormation', path: 'cloudformation', pattern: word('CloudFormation') },
  { id: 'systems-manager', label: 'AWS Systems Manager', path: 'systems-manager', pattern: word('Systems Manager|SSM') },
  { id: 'codepipeline', label: 'AWS CodePipeline', path: 'codepipeline', pattern: word('CodePipeline') },
  { id: 'codebuild', label: 'AWS CodeBuild', path: 'codebuild', pattern: word('CodeBuild') },
  { id: 'codedeploy', label: 'AWS CodeDeploy', path: 'codedeploy', pattern: word('CodeDeploy') },
  { id: 'ecs', label: 'Amazon ECS · Fargate', path: 'ecs', pattern: word('ECS|Fargate') },
  { id: 'eks', label: 'Amazon EKS', path: 'eks', pattern: word('EKS') },
  { id: 'kinesis', label: 'Amazon Kinesis', path: 'kinesis', pattern: word('Kinesis Data Streams|Kinesis') },
  { id: 'firehose', label: 'Amazon Data Firehose', path: 'firehose', pattern: word('Firehose') },
  { id: 'msk', label: 'Amazon MSK', path: 'msk', pattern: word('MSK') },
  { id: 'glue', label: 'AWS Glue', path: 'glue', pattern: word('Glue') },
  { id: 'athena', label: 'Amazon Athena', path: 'athena', pattern: word('Athena') },
  { id: 'redshift', label: 'Amazon Redshift', path: 'redshift', pattern: word('Redshift') },
  { id: 'emr', label: 'Amazon EMR', path: 'emr', pattern: word('EMR') },
  { id: 'lake-formation', label: 'AWS Lake Formation', path: 'lake-formation', pattern: word('Lake Formation') },
  { id: 'opensearch', label: 'Amazon OpenSearch Service', path: 'opensearch-service', pattern: word('OpenSearch') },
  { id: 'quicksight', label: 'Amazon QuickSight', path: 'quicksight', pattern: word('QuickSight') },
  { id: 'dms', label: 'AWS DMS', path: 'dms', pattern: word('DMS') },
  { id: 'datasync', label: 'AWS DataSync', path: 'datasync', pattern: word('DataSync') },
  { id: 'storagegateway', label: 'AWS Storage Gateway', path: 'storagegateway', pattern: word('Storage Gateway') },
  { id: 'sagemaker', label: 'Amazon SageMaker AI', path: 'sagemaker', pattern: word('SageMaker') },
  { id: 'bedrock', label: 'Amazon Bedrock', path: 'bedrock', pattern: word('Bedrock') },
];

// 한 서비스가 이 횟수 이상 나와야 "이 노트의 주제"로 본다. 비교 대상으로 한두 번 스친 서비스까지
// 걸면 노트와 상관없는 문서 목록이 된다.
const MIN_MENTIONS = 3;
const MAX_SERVICES = 5;

export function detectAwsServices(markdown: string): AwsServiceDoc[] {
  // 코드 블록(CLI 예제 등)의 이름은 주제가 아니므로 뺀다.
  const prose = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
  return AWS_SERVICE_DOCS.map((doc, order) => ({ doc, order, count: prose.match(doc.pattern)?.length ?? 0 }))
    .filter((x) => x.count >= MIN_MENTIONS)
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, MAX_SERVICES)
    .map((x) => x.doc);
}

export function awsDocsUrl(path: string, lang: Lang): string {
  return `https://docs.aws.amazon.com/${lang === 'ko' ? 'ko_kr/' : ''}${path}/`;
}
