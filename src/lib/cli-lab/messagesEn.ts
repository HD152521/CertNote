// English versions of the Korean guidance the simulator adds (notes) and the few Korean strings
// that can reach stdout/stderr. The engine stays Korean-first; this translates on display.
import type { RunResult } from './types';

export type CliLang = 'ko' | 'en';

const EXACT: Record<string, string> = {
  'us-east-1 이 아닌 리전에서 s3api create-bucket 을 쓰면 --create-bucket-configuration LocationConstraint=<리전> 을 꼭 넣어야 해요. aws s3 mb 는 이걸 알아서 넣어 줘요.':
    'Outside us-east-1, s3api create-bucket needs --create-bucket-configuration LocationConstraint=<region>. aws s3 mb fills this in for you.',
  'us-east-1 은 기본 리전이라 LocationConstraint 를 넣으면 오히려 거부돼요.':
    'us-east-1 is the default Region, so passing a LocationConstraint is actually rejected.',
  '버킷 이름은 모든 AWS 계정을 통틀어 하나뿐이에요. 이름 뒤에 계정 번호나 날짜를 붙여 보세요.':
    'Bucket names are unique across all AWS accounts. Try adding your account ID or a date to the name.',
  '버킷 이름은 3~63자, 소문자·숫자·하이픈·점만 쓸 수 있고 문자나 숫자로 시작하고 끝나야 해요.':
    'Bucket names must be 3 to 63 characters, use only lowercase letters, numbers, hyphens and dots, and start and end with a letter or number.',
  '정책이 붙은 사용자는 바로 지울 수 없어요. detach-user-policy 로 먼저 떼어 내세요.':
    'A user with an attached policy cannot be deleted right away. Detach it first with detach-user-policy.',
  'AWS 관리형 정책의 ARN 은 계정 번호 자리에 aws 가 들어가요: arn:aws:iam::aws:policy/<정책 이름>':
    'In the ARN of an AWS managed policy, the account ID slot holds aws: arn:aws:iam::aws:policy/<policy name>',
  '연습장은 aws 명령과 ls 만 실행해요. 화면 정리는 clear, 처음 상태로 되돌리기는 reset 이에요.':
    'This lab only runs aws commands and ls. Use clear to clear the screen and reset to start over.',
  '연습장의 help 는 지원하는 명령 목록만 보여 줘요. 실제 CLI 는 man 페이지 형식의 긴 도움말이 나와요.':
    'Help in this lab only lists the supported commands. The real CLI shows long man-page style help.',
  '연습장은 yaml 출력을 흉내 내지 않아 json 으로 보여 줘요.':
    'This lab does not emulate yaml output, so it shows json instead.',
  '버전 관리가 켜진 버킷은 객체를 지워도 이전 버전과 삭제 마커가 남아서 비어 있지 않아요. 실제로는 모든 버전을 지워야 버킷을 삭제할 수 있어요. 연습장에서는 reset 으로 처음부터 다시 할 수 있어요.':
    'A versioned bucket is not empty even after deleting its objects, because previous versions and delete markers remain. In real life you must delete every version before the bucket can be deleted. In this lab you can start over with reset.',
  '버킷 안에 객체가 남아 있어요. aws s3 rm s3://<버킷> --recursive 로 비우거나 aws s3 rb s3://<버킷> --force 를 쓰세요.':
    'The bucket still has objects. Empty it with aws s3 rm s3://<bucket> --recursive, or use aws s3 rb s3://<bucket> --force.',
  '\n연습장은 로컬 파일 → S3 업로드(aws s3 cp <파일> s3://<버킷>/)만 지원해요.':
    '\nThis lab only supports uploading a local file to S3 (aws s3 cp <file> s3://<bucket>/).',
};

const PATTERNS: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  [
    /^연습장은 (.*) 만 흉내 내요\. 실제 CLI 는 수백 개 서비스를 지원해요\.$/,
    (m) => `This lab only emulates ${m[1]}. The real CLI supports hundreds of services.`,
  ],
  [/^'(.*)' 은 없는 리전 이름이에요\. 서울은 ap-northeast-2 예요\.$/, (m) => `'${m[1]}' is not a valid Region name. Seoul is ap-northeast-2.`],
];

const VERSION_TAG = /\(CertNote 연습장\)/;

export function translateMessage(text: string): string {
  const exact = EXACT[text];
  if (exact !== undefined) return exact;
  for (const [re, fn] of PATTERNS) {
    const m = re.exec(text);
    if (m) return fn(m);
  }
  return text.replace(VERSION_TAG, '(CertNote practice lab)');
}

/** Translate the human-facing text of a run result. Command echo and real-CLI output are untouched. */
export function translateRunResult(r: RunResult, lang: CliLang): RunResult {
  if (lang !== 'en') return r;
  return {
    ...r,
    stdout: translateMessage(r.stdout),
    stderr: translateMessage(r.stderr),
    note: r.note === undefined ? undefined : translateMessage(r.note),
  };
}
