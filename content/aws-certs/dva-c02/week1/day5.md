# Day 5 - Week 1 종합: 인프라와 IAM이 만드는 신뢰의 사슬

지난 4일간 본 것들을 한 줄로 묶으면 "AWS에서 무언가가 동작하려면 ① 어디서(Region/AZ) ② 누가(Principal) ③ 무엇을(Action) ④ 어디에(Resource) ⑤ 어떤 조건(Condition)에서 할 수 있는지가 모두 맞아야 한다"는 문장이 된다. 이게 DVA 시험에서 보안·문제 해결 도메인(합치면 44%)의 90% 답을 결정한다.

오늘은 1주차의 키 개념들을 시나리오 기반으로 다시 묶고, 시험에 자주 나오는 함정 패턴들을 분류한다. 진도가 아니라 정리 회차이므로 문제와 해설을 더 깊게 둔다. 실제 시험 직전에 다시 한 번 훑기 좋은 형태로 정리한다.

## 1주차의 큰 그림

```
[ AWS Global Infrastructure ]
    └─ Region (격리된 인프라 단위)
        └─ AZ (3+ 물리적 DC 그룹)
            └─ EC2/Lambda/RDS 등 실제 자원
                └─ IAM (누가 무엇을 할 수 있는가)
                    ├─ User (장기 자격증명)
                    ├─ Group (권한 묶음)
                    ├─ Role (임시 자격증명 발급기)
                    └─ Policy (JSON 명세서)
                        └─ Condition (ABAC 엔진)
```

이 사슬에서 어느 하나라도 끊기면 호출이 실패한다. 시험 시나리오를 풀 때 어느 고리가 문제인지 식별하는 게 빠른 답으로 가는 길이다.

다시 한 번 강조하자면, AWS의 모든 보안 모델은 **deny-by-default**다. 어떤 자원에 대해서도 명시적 Allow가 없으면 거부된다. SCP 같은 상위 가드레일이 추가로 차단할 수는 있지만 권한을 생성하지는 못한다. 이 모델을 받아들이고 나면 "왜 권한이 안 되지?"라는 질문은 항상 "어디서 Allow가 누락됐나?"의 검색으로 풀린다.

## 자주 출제되는 함정 패턴

### 1. "EC2가 S3에 접근 못 함"의 5가지 원인

가장 흔한 시나리오. 단순히 "IAM Role을 attach해라"가 항상 답은 아니다. 가능한 원인을 다 짚어보자.

| 원인 | 증상 | 해결 |
|------|------|------|
| IAM Role 미attach | "Unable to locate credentials" | 인스턴스 프로파일 부여 |
| Role 정책에 S3 권한 없음 | `AccessDenied` | s3:GetObject 등 추가 |
| S3 버킷 정책의 Explicit Deny | `AccessDenied` | bucket policy 검토 |
| S3 Block Public Access + 잘못된 정책 | `AccessDenied` | BPA 또는 정책 재구성 |
| VPC Endpoint 없이 private subnet | timeout | S3 Gateway Endpoint 추가 |
| KMS 키로 암호화된 객체 + KMS 권한 없음 | `AccessDenied` (KMS) | KMS Key Policy + IAM kms:Decrypt |

> ⚠️ **함정**: SSE-KMS로 암호화된 S3 객체는 IAM의 `s3:GetObject`만으로는 못 읽는다. 같은 Principal에 `kms:Decrypt`도 있어야 하고, KMS Key Policy의 grant 항목에도 그 Principal이 있어야 한다. 시험에서 "S3 권한은 있는데 GetObject가 실패"라는 시나리오는 거의 KMS가 답이다.

> 🔍 **더 깊이**: VPC Endpoint 시나리오는 네트워크 레이어의 문제라 IAM 디버깅으로는 안 풀린다. private subnet의 EC2가 S3에 접근할 때 (1) NAT Gateway 경유로 인터넷 통해 가거나, (2) S3 Gateway Endpoint(라우팅 테이블에 prefix-list 추가) 또는 Interface Endpoint(PrivateLink)로 AWS 내부망에서 가야 한다. NAT를 안 쓰고 Endpoint도 없으면 timeout이 난다. AccessDenied가 아니라 timeout이라는 점이 진단의 단서.

### 2. "Lambda가 다른 계정 자원 접근 못 함"

Cross-account는 "양쪽 합의"가 원칙. Lambda 함수의 실행 역할에 ① `sts:AssumeRole` 권한 + 대상 계정 Role ARN 명시, ② 대상 계정 Role의 Trust Policy에 우리 Role을 Principal로 명시, 둘 다 필요하다.

```python
# Lambda 코드 안에서 cross-account 호출
import boto3
sts = boto3.client('sts')
resp = sts.assume_role(
    RoleArn='arn:aws:iam::222222222222:role/CrossAccountReadRole',
    RoleSessionName='lambda-cross-account'
)
creds = resp['Credentials']
s3 = boto3.client('s3',
    aws_access_key_id=creds['AccessKeyId'],
    aws_secret_access_key=creds['SecretAccessKey'],
    aws_session_token=creds['SessionToken']
)
s3.list_objects_v2(Bucket='other-account-bucket')
```

이 코드의 함정: 받은 임시 자격증명은 1시간 후 만료되는데, Lambda가 워크플로 안에서 보관하다가 재사용하면 만료 후 호출에 실패한다. 매 호출마다 새로 assume하거나, SDK의 `RefreshableCredentials`를 활용해 자동 갱신을 맡기는 것이 깔끔하다.

### 3. "STS endpoint" 함정

`sts.amazonaws.com`(글로벌) vs `sts.ap-northeast-2.amazonaws.com`(리전). 시험에서 "us-east-1 장애 시 다른 리전의 워크로드가 자격증명 발급에 실패"라는 시나리오가 나오면 글로벌 STS endpoint를 의심한다. `AWS_STS_REGIONAL_ENDPOINTS=regional`로 전환.

### 4. "Permission Boundary"의 이해

Permission Boundary는 IAM User/Role의 효과적 최대 권한을 정의하는 메커니즘이다. **Boundary에 없는 액션은 Identity Policy에 있어도 차단된다**. 흔히 "관리자가 개발자에게 IAM 관리 권한을 위임하면서 너무 큰 권한이 새어 나가지 않도록" 사용한다. 예: 개발자가 만들 수 있는 모든 Role에 Boundary를 강제하면, 그 Role들이 IAM 자체를 건드릴 수 없게 막을 수 있다.

> ⚠️ **함정**: SCP, Permission Boundary, Session Policy의 차이는 시험에 단골이다. **SCP**는 계정 전체에 적용되는 Organizations 가드레일, **Permission Boundary**는 특정 IAM Entity의 최대 권한 상한, **Session Policy**는 AssumeRole 호출 시 inline으로 한 번만 좁히는 일회성 가드레일. 셋 다 "권한을 부여하지 않고 차감만 한다"는 공통점이 있다.

## 도메인별 시험 출제 비중과 1주차 매핑

| 도메인 | 비중 | 1주차에서 다룬 영역 |
|--------|------|------|
| 개발 (Development) | 32% | SDK, CLI, credential chain |
| 보안 (Security) | 26% | IAM 전체, STS, SigV4 |
| 배포 (Deployment) | 24% | (아직 안 다룸) |
| 문제 해결 (Troubleshooting) | 18% | IAM 정책 시뮬레이션, `--debug`, get-caller-identity |

1주차의 중요도는 시험에서 보안 26% + 문제해결 18%의 절반 이상이 IAM 관련이라는 점에서 압도적이다. **1주차를 완벽하게 이해하면 시험의 30% 이상은 거저 푸는 셈**이다.

## 알아둬야 할 ARN 패턴

ARN(Amazon Resource Name)은 `arn:partition:service:region:account-id:resource` 형식이다. 시험에 자주 나오는 패턴을 외워두자.

| 자원 | ARN 예시 |
|------|------|
| IAM User | `arn:aws:iam::123456789012:user/Alice` |
| IAM Role | `arn:aws:iam::123456789012:role/MyRole` |
| S3 Bucket | `arn:aws:s3:::my-bucket` (region/account 없음) |
| S3 Object | `arn:aws:s3:::my-bucket/path/to/file` |
| Lambda Function | `arn:aws:lambda:ap-northeast-2:123456789012:function:MyFn` |
| Lambda Layer | `arn:aws:lambda:ap-northeast-2:123456789012:layer:MyLayer:3` (버전 번호 포함) |
| DynamoDB Table | `arn:aws:dynamodb:ap-northeast-2:123456789012:table/MyTable` |
| SQS Queue | `arn:aws:sqs:ap-northeast-2:123456789012:MyQueue` |
| SNS Topic | `arn:aws:sns:ap-northeast-2:123456789012:MyTopic` |
| KMS Key | `arn:aws:kms:ap-northeast-2:123456789012:key/uuid` |
| Secrets Manager | `arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:Name-randomSuffix` |
| Parameter Store | `arn:aws:ssm:ap-northeast-2:123456789012:parameter/path/to/param` |

> 💡 **암기 팁**: S3와 IAM은 글로벌 서비스라 ARN에 region이 비어 있다(`arn:aws:s3:::`). 다른 서비스는 region이 채워진다. 또 IAM은 account-id가 들어가지만 S3는 안 들어간다(버킷 이름 자체가 글로벌 unique). 그리고 partition은 일반 AWS는 `aws`, GovCloud는 `aws-us-gov`, 중국 리전은 `aws-cn`이다. 정책을 cross-partition으로 복사하면 partition prefix를 바꾸지 않아 fail하는 경우가 있다.

## 정리하며

1주차는 AWS의 "기반"을 깐다. 인프라 지도 위에 IAM이라는 신뢰의 사슬이 얹혀 있고, 그 사슬에 코드의 SDK 호출이 묶인다. 다음 주부터는 이 위에 진짜 컴퓨트(EC2, Lambda, ECS), 데이터(S3, DynamoDB, RDS), 통합(API Gateway, SQS, EventBridge), 배포(CodePipeline 등)가 올라간다.

기억해야 할 핵심 마인드셋: AWS에서 "이게 왜 안 되지?"라는 질문은 거의 항상 "어떤 IAM 평가 단계에서 막혔나?"로 환원된다. SCP, Resource Policy, Identity Policy, Permission Boundary, Session Policy, Explicit Deny — 이 6개 레이어 중 하나가 답이다. 그리고 그 답을 찾는 출발점은 `aws sts get-caller-identity`와 IAM Policy Simulator다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 모든 직원에게 IAM User를 발급하고 access key로 CLI를 쓰고 있다. CISO가 보안 감사 결과 "장기 키 사용 금지"를 지시했다. 가장 적절한 마이그레이션은?

A) IAM User의 access key를 30일마다 회전
B) AWS IAM Identity Center(SSO) 도입 + 외부 IdP 연동 + `aws configure sso`로 CLI 사용
C) Root account를 공유
D) 모든 직원에게 EC2 인스턴스를 줘서 IAM Role로 접근

**정답: B**
해설: IAM Identity Center는 외부 IdP(Okta, Azure AD, Google Workspace 등)와 SAML 2.0/OIDC로 연동되며, CLI는 STS로 임시 자격증명을 받아 동작한다. 장기 키가 디스크에 절대 저장되지 않는다. A는 회전 주기만큼 위험이 줄지만 여전히 장기 키. C는 root 공유는 최악의 보안 사고. D는 모든 직원이 EC2를 띄우는 건 비용·운영 부담이 비현실적.

---

**문제 2.** 다음 IAM 정책의 효과는?
```json
{
  "Effect": "Allow",
  "Action": "s3:*",
  "Resource": "arn:aws:s3:::project-${aws:PrincipalTag/Project}/*",
  "Condition": {"Null": {"aws:PrincipalTag/Project": "false"}}
}
```

A) 모든 S3 버킷 접근 허용
B) `Project` 태그가 있는 Principal에게, 그 태그 값과 일치하는 prefix의 버킷에만 모든 S3 액션 허용
C) 정책 오류로 항상 거부
D) Root account에만 적용

**정답: B**
해설: `${aws:PrincipalTag/Project}`는 호출자의 Project 태그 값으로 치환되고, `"Null": false`는 "이 태그가 반드시 존재해야 한다"는 의미다. Project=alpha 사용자는 `project-alpha-*` 버킷에 접근, Project=beta 사용자는 `project-beta-*` 버킷에 접근. 단일 정책으로 부서별 자원 분리가 가능한 ABAC의 대표 패턴이다.

---

**문제 3.** EC2에서 Lambda로 워크로드를 옮긴 후 코드 변경 없이 같은 IAM 정책으로 동작시키려고 한다. 무엇이 달라지는가?

A) Lambda는 IAM Role을 사용할 수 없음
B) Lambda 실행 역할의 Trust Policy의 Principal이 `ec2.amazonaws.com` → `lambda.amazonaws.com`으로 바뀌어야 함
C) Lambda는 access key를 코드에 박아야 함
D) 변경 사항 없음, 그대로 동작

**정답: B**
해설: IAM Role의 Trust Policy는 "어느 서비스가 이 Role을 assume할 수 있는가"를 결정한다. EC2가 사용하던 Role을 그대로 Lambda에 붙이면 Lambda가 assume을 시도하다 실패한다. Trust Policy의 Principal Service를 변경해야 한다. Permission Policy(실제 권한)는 그대로 재사용 가능.

---

**문제 4.** STS의 AssumeRole 응답에 포함되지 않는 것은?

A) AccessKeyId (ASIA로 시작)
B) SecretAccessKey
C) SessionToken
D) IAM User의 password

**정답: D**
해설: STS는 임시 자격증명 3종 세트(AccessKeyId / SecretAccessKey / SessionToken) + Expiration timestamp를 반환한다. IAM User의 password는 STS와 무관하며 절대 노출되지 않는다. AccessKeyId가 `ASIA`로 시작하는 게 임시, `AKIA`로 시작하는 게 영구 키임을 구별하는 게 시험에 종종 나온다.

---

**문제 5.** 한 회사가 SCP로 "us-east-1과 ap-northeast-2만 허용"을 설정했다. IAM User에는 `AdministratorAccess`가 있다. 이 User가 eu-west-1에서 EC2를 시작하려 한다. 결과는?

A) AdministratorAccess가 SCP보다 우선해 허용
B) SCP의 Deny가 우선해 거부
C) eu-west-1만 비활성화되고 다른 액션은 가능
D) 경고 표시만 나오고 진행 가능

**정답: B**
해설: SCP는 Organizations 수준의 절대 상한선이다. Identity-based의 Allow가 아무리 넓어도 SCP가 막으면 거부. `aws:RequestedRegion` 조건으로 비승인 리전 차단은 회사 전체 가드레일의 표준 패턴. 단 IAM, CloudFront, Route 53, Support 같은 글로벌 서비스에는 영향을 주지 않도록 예외 처리가 필요하다(SCP의 NotAction으로 제외).

---

**문제 6.** 다음 시나리오에서 가장 적절한 디버깅 첫 단계는? "EC2에서 boto3 코드가 `An error occurred (AccessDenied) when calling the GetObject operation`을 반환한다."

A) S3 버킷을 public으로 설정
B) `aws sts get-caller-identity`로 현재 어느 Role/User로 동작하고 있는지 확인
C) IAM Root 자격증명으로 변경
D) EC2 인스턴스 재시작

**정답: B**
해설: AccessDenied의 디버깅은 항상 "내가 누구로 호출하고 있는가"부터 시작한다. `get-caller-identity`는 ARN을 보여주는데, 예상한 Role이 맞는지 확인하면 권한 추적의 출발점이 된다. 그 다음 IAM Policy Simulator로 그 ARN의 권한을 점검, KMS 암호화 객체라면 KMS 권한도 확인, S3 Block Public Access 설정도 검토. A는 보안 사고로 가는 길.

---

**문제 7.** 한 개발자가 `~/.aws/credentials`에 dev profile을 설정했는데, CLI 명령에 `--profile dev`를 명시하지 않으면 default profile의 자격증명이 사용된다. 모든 명령에 자동으로 dev profile이 적용되게 하려면?

A) `aws configure set profile dev`
B) `AWS_PROFILE=dev` 환경변수 설정
C) `~/.aws/config`의 default profile을 dev로 교체
D) `aws configure --profile dev` 다시 실행

**정답: B**
해설: `AWS_PROFILE` 환경변수는 그 셸 세션 동안 모든 AWS CLI/SDK 호출의 default profile을 결정한다. `~/.bashrc`에 `export AWS_PROFILE=dev`를 두면 영구 적용. C도 가능은 하지만 default profile의 내용 자체를 바꾸는 거라 다른 profile과의 경계가 흐려진다. 또 환경변수 방식은 `unset AWS_PROFILE`로 쉽게 되돌릴 수 있어 멀티 계정 작업에 유연하다.

---

**문제 8.** IAM Policy의 `"Resource": "arn:aws:s3:::my-bucket/${aws:username}/*"`에서 `${aws:username}` 변수가 평가되는 시점은?

A) 정책 작성 시점
B) 정책 attach 시점
C) API 호출 시점 (호출자의 정보로 동적 치환)
D) 평가되지 않고 그대로 사용됨

**정답: C**
해설: IAM Policy variables는 매 API 호출 시점에 평가된다. Alice가 호출하면 `${aws:username}` → `Alice`로 치환돼 `my-bucket/Alice/*`가 되고, Bob이 호출하면 `my-bucket/Bob/*`가 된다. 단일 정책으로 사용자별 격리된 폴더를 강제할 수 있다. 이 패턴이 SaaS의 "테넌트별 데이터 격리"에서 표준이다.

---

**문제 9.** SigV4 서명이 timestamp 검증에 실패할 때 나오는 에러는?

A) AccessDenied
B) SignatureDoesNotMatch 또는 RequestTimeTooSkewed
C) ThrottlingException
D) ServiceUnavailable

**정답: B**
해설: 시계가 AWS 서버와 15분 이상 차이나면 `RequestTimeTooSkewed`, 서명 자체가 잘못되면 `SignatureDoesNotMatch`가 나온다. NTP 동기화, 컨테이너 시계, VM clock drift가 흔한 원인. `date -u`로 UTC 확인 후 `chronyd`로 동기화. 클라우드 환경에서 가끔 한 번씩 만나는 이슈인데, 원인을 모르면 IAM 권한을 의심하다 시간을 버린다.

---

**문제 10.** 한 회사가 AWS Organizations로 prod와 dev 계정을 분리하고, 개발자들은 IAM Identity Center로 두 계정의 Role을 모두 assume할 수 있다. dev 계정에 큰 사고가 생겨도 prod이 보호되는 이유는?

A) AWS가 자동으로 격리
B) Organizations의 OU 분리로 IAM Principal이 계정 경계를 넘으려면 명시적 cross-account 권한이 필요하고, SCP로 추가 격리 가능
C) prod 계정은 항상 read-only
D) 모든 액션이 자동 감사됨

**정답: B**
해설: AWS Account 자체가 강력한 격리 경계다. 같은 Organizations 안에 있어도 다른 계정 자원에 접근하려면 명시적 cross-account 권한(IAM Role + Resource Policy)이 필요하다. SCP로 추가 가드레일(예: prod 계정에서 특정 액션 차단)을 걸 수 있고, GuardDuty/CloudTrail의 multi-account aggregation으로 중앙 감사도 가능. 다중 계정 전략(multi-account strategy)은 AWS Well-Architected의 표준 권장 사항이다.

---

**문제 11.** Lambda 함수가 `LimitExceededException`을 받았다. SDK의 default retry 동작은?

A) 1회만 시도하고 실패
B) Standard retry mode로 3번 추가 시도 + exponential backoff with jitter
C) 무한 재시도
D) 다른 리전으로 자동 페일오버

**정답: B**
해설: AWS SDK의 기본 retry mode는 standard로 총 4번 시도(첫 호출 + 3번 retry). 각 retry는 0~1초, 0~2초, 0~4초의 무작위 backoff(jitter). LimitExceededException은 throttling류라 retry로 회복될 수 있다. Lambda 함수가 timeout에 가깝다면 max attempts를 환경변수로 줄이는 게 안전. 무한 재시도는 thundering herd를 만들어 서버를 더 죽인다.

---

**문제 12.** 한 회사가 SaaS 모니터링 도구에게 자기 AWS 계정의 CloudWatch 지표를 읽게 하려고 한다. 가장 안전한 설정은?

A) IAM User를 만들고 access key를 SaaS에게 제공
B) IAM Role을 만들고 Trust Policy에 SaaS의 계정 ID + External ID 조건을 명시, ReadOnlyAccess만 부여
C) Root account 자격증명을 제공
D) CloudWatch를 public으로 공개

**정답: B**
해설: 외부 SaaS 시나리오는 cross-account Role + External ID가 표준이다. External ID는 confused deputy 문제 방지, ReadOnlyAccess는 least privilege 원칙. AWS는 모든 third-party SaaS에서 이 패턴을 요구하며, SaaS 측에서 External ID 자동 생성 기능을 제공한다.
