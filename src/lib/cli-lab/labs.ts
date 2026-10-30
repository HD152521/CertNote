// 연습 과제 정의. 목표 판정은 "명령 문자열"이 아니라 실행 결과(계정 상태·실행 기록)로 한다 —
// 옵션 순서나 따옴표 모양이 달라도, s3 mb 로 하든 s3api 로 하든 결과가 맞으면 통과.
import type { SimState } from './state';
import type { CommandRecord, RunResult } from './types';

export interface StepCheckInput {
  state: SimState;
  record: CommandRecord;
  result: RunResult;
}

export interface LabStep {
  id: string;
  title: string;
  task: string;
  hint: string;
  answer: string;
  /** 통과 뒤에 보여 주는 시험 포인트 */
  takeaway: string;
  isDone: (input: StepCheckInput) => boolean;
}

export interface Lab {
  id: string;
  code: string;
  service: string;
  title: string;
  source: string;
  steps: LabStep[];
}

const ran = (r: CommandRecord, service: string, operation: string) =>
  r.service === service && r.operation === operation && r.exitCode === 0;

export const LABS: Lab[] = [
  {
    id: 'regions-azs',
    code: 'LAB 01',
    service: 'EC2 · STS',
    title: '리전과 가용 영역 지도 그리기',
    source: 'SAA-C03 Week 1 · Day 1',
    steps: [
      {
        id: 'whoami',
        title: '지금 누구로 접속했나',
        task: '명령을 실행하기 전에 어떤 계정·사용자로 요청이 나가는지부터 확인하세요.',
        hint: 'STS 서비스에 "호출한 사람이 누구냐"고 묻는 명령이 있어요.',
        answer: 'aws sts get-caller-identity',
        takeaway: '권한 오류가 나면 제일 먼저 이 명령으로 내가 어떤 IAM 주체인지 확인해요. 역할을 맡은(AssumeRole) 상태라면 Arn 에 assumed-role 이 보여요.',
        isDone: ({ record }) => ran(record, 'sts', 'get-caller-identity'),
      },
      {
        id: 'seoul-azs',
        title: '서울 리전의 AZ 를 표로',
        task: '서울 리전(ap-northeast-2)의 가용 영역 목록을 표(table) 형식으로 출력하세요.',
        hint: 'ec2 describe-availability-zones 에 --output table 을 붙여 보세요.',
        answer: 'aws ec2 describe-availability-zones --region ap-northeast-2 --output table',
        takeaway: '서울 리전은 AZ 가 4개(a~d)예요. 리전은 최소 3개 AZ 로 이뤄진 격리 단위라는 점이 시험에 자주 나와요.',
        isDone: ({ record }) =>
          ran(record, 'ec2', 'describe-availability-zones') && record.region === 'ap-northeast-2' && record.output === 'table',
      },
      {
        id: 'zone-id',
        title: 'ZoneName 과 ZoneId 만 뽑기',
        task: '--query 로 각 AZ 의 ZoneName 과 ZoneId 두 칸만 골라 보세요.',
        hint: "JMESPath 로 목록의 각 항목에서 두 필드를 뽑아요: 'AvailabilityZones[*].[ZoneName,ZoneId]'",
        answer: "aws ec2 describe-availability-zones --query 'AvailabilityZones[*].[ZoneName,ZoneId]' --output table",
        takeaway: 'ZoneName(ap-northeast-2a)은 계정마다 섞여 배정되지만 ZoneId(apne2-az1)는 모든 계정에서 같아요. 다른 계정과 같은 AZ 에 맞추려면 ZoneId 를 기준으로 해야 해요.',
        isDone: ({ record }) => ran(record, 'ec2', 'describe-availability-zones') && /ZoneId/.test(record.query ?? ''),
      },
      {
        id: 'virginia',
        title: '버지니아 북부와 비교',
        task: '같은 조회를 us-east-1 에서 해 보고, us-east-1a 의 ZoneId 가 무엇인지 확인하세요.',
        hint: '앞 명령에 --region us-east-1 만 바꿔 넣으면 돼요.',
        answer: "aws ec2 describe-availability-zones --region us-east-1 --query 'AvailabilityZones[*].[ZoneName,ZoneId]' --output table",
        takeaway: '이 계정에서 us-east-1a 는 use1-az6 이에요. 이름의 a 가 물리적으로 첫 번째 AZ 라는 보장이 없다는 걸 직접 본 거예요.',
        isDone: ({ record }) => ran(record, 'ec2', 'describe-availability-zones') && record.region === 'us-east-1',
      },
    ],
  },
  {
    id: 's3-first-bucket',
    code: 'LAB 02',
    service: 'S3',
    title: '서울 리전에 첫 버킷 만들기',
    source: 'SAA-C03 Week 3 · S3 기초',
    steps: [
      {
        id: 'create',
        title: 's3api 로 서울에 버킷 만들기',
        task: 'aws s3api create-bucket 으로 서울 리전에 버킷을 만드세요. 이름은 전 세계에서 하나뿐이어야 해요.',
        hint: '그냥 실행하면 오류가 나요. 오류 메시지를 읽고 --create-bucket-configuration 을 더해 보세요.',
        answer:
          'aws s3api create-bucket --bucket certnote-lab-123456789012 --create-bucket-configuration LocationConstraint=ap-northeast-2',
        takeaway: 'us-east-1 이 아닌 리전에서는 LocationConstraint 가 꼭 필요해요. aws s3 mb 같은 고수준 명령은 이걸 알아서 채워 줘서 차이를 모르고 지나가기 쉬워요.',
        isDone: ({ state }) => state.buckets.some((b) => b.region === 'ap-northeast-2'),
      },
      {
        id: 'versioning',
        title: '버전 관리 켜기',
        task: '방금 만든 버킷의 버전 관리(Versioning)를 켜세요.',
        hint: 'put-bucket-versioning 에 --versioning-configuration Status=Enabled 를 줘요.',
        answer:
          'aws s3api put-bucket-versioning --bucket {bucket} --versioning-configuration Status=Enabled',
        takeaway: '버전 관리는 한 번 켜면 끌 수 없고 일시 중지(Suspended)만 돼요. 실수로 지우거나 덮어쓴 객체를 되살리는 용도로 출제돼요.',
        isDone: ({ state }) => state.buckets.some((b) => b.versioning === 'Enabled'),
      },
      {
        id: 'upload',
        title: '파일 올리기',
        task: '작업 폴더의 hello.txt 를 버킷에 올리세요. (ls 로 로컬 파일을 볼 수 있어요)',
        hint: 'aws s3 cp <로컬 파일> s3://<버킷>/',
        answer: 'aws s3 cp hello.txt s3://{bucket}/',
        takeaway: '대상 경로가 / 로 끝나면 파일 이름이 그대로 키가 돼요. S3 에는 폴더가 없고, 슬래시가 들어간 키 이름이 있을 뿐이에요.',
        isDone: ({ state }) => state.buckets.some((b) => b.objects.some((o) => o.key.endsWith('hello.txt'))),
      },
      {
        id: 'verify',
        title: '설정 확인하기',
        task: '버킷의 버전 관리 상태를 조회해서 Enabled 인지 확인하세요.',
        hint: 'put 의 짝은 get 이에요.',
        answer: 'aws s3api get-bucket-versioning --bucket {bucket}',
        takeaway: '한 번도 설정하지 않은 버킷은 아무것도 출력하지 않아요. "Disabled" 라는 상태 값은 없어요.',
        isDone: ({ record, result }) => ran(record, 's3api', 'get-bucket-versioning') && /Enabled/.test(result.stdout),
      },
    ],
  },
  {
    id: 'iam-least-privilege',
    code: 'LAB 03',
    service: 'IAM',
    title: '읽기 전용 사용자 만들고 정리하기',
    source: 'SAA-C03 Week 1 · Day 2',
    steps: [
      {
        id: 'create-user',
        title: '사용자 만들기',
        task: '새 IAM 사용자를 하나 만드세요.',
        hint: 'aws iam create-user --user-name <이름>',
        answer: 'aws iam create-user --user-name dev-kim',
        takeaway: '새 사용자는 아무 권한이 없어요(암묵적 거부). 권한은 정책을 붙여야 생겨요.',
        isDone: ({ state }) => state.users.length > 0,
      },
      {
        id: 'attach',
        title: '읽기 전용 정책 붙이기',
        task: 'AWS 관리형 정책 ReadOnlyAccess 를 그 사용자에게 붙이세요.',
        hint: 'AWS 관리형 정책 ARN 은 arn:aws:iam::aws:policy/<정책 이름> 형식이에요. 계정 번호 자리가 aws 예요.',
        answer: 'aws iam attach-user-policy --user-name {user} --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess',
        takeaway: '실무와 시험 모두 사용자에게 직접 붙이기보다 그룹에 붙이는 쪽을 권장해요. 여기서는 흐름을 보려고 바로 붙였어요.',
        isDone: ({ state }) => state.users.some((u) => u.policyArns.some((a) => a.endsWith('/ReadOnlyAccess'))),
      },
      {
        id: 'list',
        title: '붙은 정책 확인',
        task: '그 사용자에게 붙은 정책 이름만 text 형식으로 출력하세요.',
        hint: "list-attached-user-policies 에 --query 'AttachedPolicies[].PolicyName' --output text",
        answer: "aws iam list-attached-user-policies --user-name {user} --query 'AttachedPolicies[].PolicyName' --output text",
        takeaway: '--query 와 --output text 조합은 셸 스크립트에서 값을 변수로 받을 때 가장 많이 쓰는 패턴이에요.',
        isDone: ({ record, result }) =>
          ran(record, 'iam', 'list-attached-user-policies') && record.output === 'text' && result.stdout.trim() !== '',
      },
      {
        id: 'cleanup',
        title: '사용자 지우기',
        task: '연습이 끝났으니 사용자를 지우세요. 바로 지워지지 않으면 오류를 읽어 보세요.',
        hint: '정책이 붙은 사용자는 지울 수 없어요. detach-user-policy 를 먼저.',
        answer:
          'aws iam detach-user-policy --user-name {user} --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess\naws iam delete-user --user-name {user}',
        takeaway: 'IAM 사용자를 지우려면 정책·액세스 키·그룹 소속 등을 먼저 정리해야 해요. 콘솔은 이걸 대신 해 주지만 CLI 는 하나씩 해야 해요.',
        isDone: ({ record }) => ran(record, 'iam', 'delete-user'),
      },
    ],
  },
];

/** 정답 예시의 {bucket}·{user} 를 학습자가 실제로 만든 이름으로 바꾼다. */
export function resolveAnswer(answer: string, state: SimState): string {
  const bucket = state.buckets.find((b) => b.region === 'ap-northeast-2')?.name ?? state.buckets[0]?.name ?? 'certnote-lab-123456789012';
  const user = state.users[0]?.userName ?? 'dev-kim';
  return answer.replaceAll('{bucket}', bucket).replaceAll('{user}', user);
}
