# Day 5 - Week 1 종합: IAM과 자격 증명을 시나리오로 통합 복습

Week 1은 SCS-C03의 토대를 깔았다. 공동 책임 모델과 6개 도메인으로 큰 그림을 그렸고(Day 1), IAM의 빌딩블록과 정책 평가 알고리즘을 익혔으며(Day 2), Identity/Resource 정책·Condition·최소 권한 설계를 파고(Day 3), STS·페더레이션·역할 체이닝·Confused Deputy 방지를 다뤘다(Day 4). 따로 보면 각자의 주제지만, 시험의 시나리오 문제는 항상 두세 개를 한 묶음으로 던진다.

"왜 접근이 거부되는가"라는 한 문제 안에 암묵적 Deny, SCP 가드레일, cross-account 양쪽 허용, Permissions Boundary가 동시에 얽힌다. "서드파티에 안전하게 위임하라"는 문제는 Role + trust policy + ExternalId + 최소 권한을 한 번에 묻는다. 오늘은 그 묶음 풀이를 시나리오로 굳힌다. Week 1이 가르치고 싶은 한 문장은 — **"AWS의 모든 접근 결정은 IAM 평가 알고리즘 하나로 환원되고, 보안 엔지니어의 일은 그 알고리즘에 정확한 정책을 입력하는 것"**이다.

## 한 페이지 컴팩트 — Week 1 핵심

### 공동 책임 + 통제 유형 (Day 1)

| 축 | 핵심 |
|----|------|
| 책임선 | IaaS(EC2)는 고객 책임 큼, SaaS(S3)는 작음. **데이터·접근제어는 항상 고객** |
| 통제 유형 | 예방(IAM/SCP/SG/KMS) · 탐지(CloudTrail/GuardDuty/Config) · 대응(EventBridge→SSM) |
| 6 도메인 | 위협탐지14 / 로깅18 / 인프라20 / IAM16 / 데이터18 / 거버넌스14 |

문항의 동사가 통제 유형을 지정한다는 점도 함께 굳혀 둔다.

| 지문의 표현 | 요구 유형 | 정답 후보 |
|-------------|-----------|-----------|
| prevent / ensure ... cannot / 막아야 | 예방 | SCP, IAM Deny, 버킷 정책 Deny, Block Public Access |
| detect / alert / identify | 탐지 | CloudTrail, GuardDuty, Config, Macie, Access Analyzer |
| respond / automatically remediate | 대응 | EventBridge → Lambda·SSM, 격리, 복원 |
| least operational overhead | 관리형 우선 | 직접 구현·수동 검토 보기는 탈락 |
| most secure / most restrictive | 최소 권한 | 와일드카드 좁힘, 임시 자격 증명, 명시적 Deny |

"GuardDuty로 **차단**한다", "Config로 **막는다**" 같은 문장은 서비스는 맞고 동사가 틀린 대표 오답이다.

### IAM 평가 알고리즘 (Day 2·3)

```
1. 명시적 Deny 있나? ──▶ 있으면 DENY (무조건)
2. SCP 허용하나?      ──▶ 아니면 DENY
3. Permissions Boundary 허용하나? ──▶ 아니면 DENY
4. (cross-account) 양쪽 다 허용? ──▶ 한쪽이라도 빠지면 DENY
5. 명시적 Allow 있나? ──▶ 없으면 암묵적 DENY
   모두 통과 ──▶ ALLOW
```

- SCP·Boundary는 권한을 **주지 않고 상한만 깎는 필터**
- 같은 계정: Identity 또는 Resource 정책 중 하나면 충분 / cross-account: **양쪽 필요**
- KMS는 **키 정책이 1차 권위** — 키 정책이 열어야 IAM 정책이 작동

### 정책 종류와 도구 (Day 3)

| 정책 | 붙는 곳 | Principal | cross-account |
|------|--------|-----------|---------------|
| Identity | User/Group/Role | 없음 | 단독 불가 |
| Resource | S3/KMS/SQS/Role trust | 필수 | 단독 가능 |
| SCP | OU/계정 | — | 조직 가드레일 |
| Permissions Boundary | User/Role | — | 주체 상한 |

- Condition 함정: `BoolIfExists`(MFA), `aws:SourceArn`/`SourceAccount`(Confused Deputy), VPC엔 `aws:SourceVpc`
- ABAC: `aws:PrincipalTag == aws:ResourceTag`로 정책 수 일정 유지
- 권한을 **주는** 것은 Identity·Resource 정책뿐. SCP·경계·세션 정책은 **천장만** 정한다
- `NotAction`은 **Deny와만** 결합한다(Allow와 쓰면 새 서비스가 자동으로 허용됨)
- 리소스 정책 미지원 서비스(EC2·DynamoDB·RDS)의 교차 계정은 **역할을 맡는 방식**으로

### STS·자격 증명 (Day 4)

- 임시 자격 증명 = AccessKeyId + SecretAccessKey + **SessionToken**(만료)
- AssumeRole: **trust(누가) + permission(무엇을)** 두 정책
- 페더레이션: SAML(AssumeRoleWithSAML)·OIDC(AssumeRoleWithWebIdentity)·Identity Center
- Confused Deputy: 서드파티는 **ExternalId**(서드파티 발급), AWS 서비스는 **aws:SourceArn**
- 역할 체이닝: 세션 최대 **1시간** 고정 / IMDSv2 강제로 자격 증명 탈취 방어

## 시나리오 풀이 4단계 흐름

시험장에서 IAM 문제를 만나면 다음 순서로 의식적으로 분해한다.

1. **요청 분해**: 누가(Principal) · 무엇을(Action) · 어디에(Resource) · 같은 계정인가 cross-account인가?
2. **필터 점검**: 명시적 Deny? SCP? Boundary? cross-account면 양쪽? KMS면 키 정책?
3. **최소 권한 판정**: 보기 중 와일드카드를 좁힌 것, 임시 자격 증명을 쓴 것, 가드레일을 강제한 것
4. **함정 제거**: 장기 키 사용 / root 사용 / `Bool` vs `BoolIfExists` / ExternalId 누락 / 단일 통제만

> 🎯 **시나리오**: "개발자에게 admin이 있는데 특정 S3 버킷 접근이 거부된다"는 보고. 4단계로 풀면 — admin은 명시적 Allow(5번 통과). 그런데 거부됐다면 1~4번 필터 어딘가. 가장 흔한 원인은 **SCP 또는 버킷 정책의 명시적 Deny**, 또는 그 버킷이 KMS 암호화인데 **키 정책이 개발자를 허용 안 함**. "권한이 있는데 거부"는 거의 항상 필터(상한)에서 막힌 것이다.

## 케이스 워크스루 — 손으로 따라가 보기

요약표를 읽는 것과 실제로 판정하는 것은 다르다. 아래 세 케이스를 **보기를 보지 않고** 스스로 분해해 본 뒤 풀이를 확인해 보자. 시험장에서 필요한 것은 지식이 아니라 이 분해 절차다.

### 케이스 A — 권한은 있는데 막힌다

> 상황: 데이터팀 역할 `role/DataScience`에 `AmazonS3FullAccess`가 붙어 있다. 같은 계정의 버킷 `s3://research-raw`에서 객체를 읽으려 하면 `AccessDenied`가 난다. 버킷 정책에는 데이터팀을 명시적으로 허용하는 문장이 있고, Deny 문장은 없다. 계정은 Organizations 멤버다.

**분해**

| 단계 | 확인 | 판정 |
|------|------|------|
| 요청 분해 | 같은 계정, `s3:GetObject`, 객체 ARN | 교차 계정 아님 → 양쪽 AND 규칙 해당 없음 |
| 명시적 Deny | 버킷 정책엔 없다. 그러나 **다른 층은 확인되지 않았다** | SCP·권한 경계가 미확인 |
| 가드레일 | Organizations 멤버 → SCP 존재 가능. 경계 부착 여부 미확인 | 유력 후보 |
| 명시적 Allow | Identity·Resource 양쪽 모두 있음 | 이 층은 통과 |

**결론**: Allow는 충분한데 막혔으므로 원인은 **상한 쪽**이다. 확인 순서는 ① 오류 메시지에 `explicit deny in a service control policy`가 있는지 ② 역할에 권한 경계가 붙어 있는지 ③ 버킷이 KMS 암호화라면 키 정책이 이 역할을 허용하는지. 세 번째가 특히 자주 빠진다 — `s3:GetObject` 권한이 있어도 **`kms:Decrypt`가 없으면 객체를 읽을 수 없다.** 그리고 KMS는 키 정책이 1차 권위이므로 IAM에 `kms:Decrypt`를 넣는 것만으로는 부족하다.

**여기서 배우는 것**: "권한을 더 준다"는 방향으로 먼저 손대면 원인을 못 찾은 채 권한만 넓어진다. 반드시 **어느 층이 범인인지 특정한 뒤** 그 층만 고친다.

> 🔍 **더 깊이**: 이 케이스에서 KMS가 특히 까다로운 이유를 한 번 더 짚어 둔다. S3나 SQS는 IAM 정책 **또는** 리소스 정책 중 하나만 허용해도 같은 계정 안에서는 통과하지만, KMS는 **키 정책이 먼저 문을 열어야** IAM 정책이 의미를 갖는다. 기본 키 정책에 들어 있는 `"Principal": {"AWS": "arn:aws:iam::ACCOUNT:root"}` 한 줄이 "이 계정의 IAM 정책에게 판단을 위임한다"는 뜻이고, 이 줄이 없는 키는 아무리 넓은 IAM 정책을 가진 주체라도 쓸 수 없다. 그래서 "암호화된 버킷은 읽히는데 다른 암호화된 버킷은 안 읽힌다"는 증상이 나오면 IAM이 아니라 **각 키의 키 정책**을 비교해 봐야 한다. Week 3의 데이터 보호에서 이 성질을 본격적으로 다룬다.

> 💡 **관련 이론**: 케이스 A의 진단 절차는 보안 운영에서 **격리(isolation) 기반 디버깅**이라 부르는 방식이다. 여러 층이 동시에 작동하는 시스템에서 원인을 찾을 때, 한 층씩 배제해 가며 범위를 좁힌다. 반대 방식 — 증상이 사라질 때까지 여기저기 권한을 넓히는 것 — 은 문제를 해결한 것처럼 보이지만 실제로는 **불필요한 권한을 영구히 남긴다.** 그렇게 쌓인 권한은 나중에 누구도 지우지 못한다. "왜 이 권한이 있는지 아무도 모른다"는 상태가 대부분 이렇게 만들어진다. 진단은 빠르게, 수정은 최소 범위로 — 이 원칙이 최소 권한을 시간이 지나도 유지시켜 준다.

### 케이스 B — 위임을 안전하게 설계하기

> 상황: 비용 분석 SaaS에게 우리 조직의 결제·사용량 데이터를 읽을 권한을 주려 한다. SaaS는 자기 AWS 계정에서 우리 계정의 역할을 맡는 방식을 요구한다. 우리 조직에는 계정이 40개 있고, SaaS는 전 계정의 데이터를 봐야 한다.

**분해**

1. **자격 증명 형태** — 액세스 키 발급은 검토 대상이 아니다. 역할 + 임시 자격 증명이 유일한 방향.
2. **신뢰 경계** — 신뢰 정책의 `Principal`은 SaaS 계정. 여기에 **SaaS가 발급한 `sts:ExternalId`** 조건이 필수다. 없으면 같은 SaaS를 쓰는 다른 고객이 우리 역할을 맡게 유도될 수 있다.
3. **권한 범위** — 읽기 전용, 필요한 서비스로만. 결제 데이터라면 해당 읽기 액션에 한정한다.
4. **확장성** — 40개 계정에 손으로 역할을 만들면 누락과 드리프트가 생긴다. IaC(StackSets 등)로 동일한 역할을 배포하고, 이름을 규격화한다.
5. **관측** — 그 역할의 세션이 언제 무엇을 했는지 CloudTrail로 상시 확인 가능해야 한다. 세션 이름 규칙을 SaaS와 합의해 두면 조사 시 도움이 된다.
6. **철회 가능성** — 계약이 끝나면 즉시 끊을 수 있어야 한다. 신뢰 정책 한 곳만 고치면 되도록 설계한다.

**결론**: 답은 단일 조치가 아니라 **여섯 항목의 묶음**이다. 시험에서 이런 지문이 나오면 "역할 + ExternalId + 최소 권한"이 모두 들어간 보기 하나가 정답이고, 그중 하나라도 빠진 보기는 오답이다. 특히 ExternalId가 빠진 보기가 가장 그럴듯하게 생겼다.

### 케이스 C — 장기 키를 걷어내기

> 상황: 감사 결과 계정 전체에서 액세스 키 60여 개가 발견됐다. 일부는 3년 넘게 회전되지 않았고, 소유자가 퇴사한 것도 있다. "전부 삭제하라"는 지시가 내려왔다.

**분해**

전부 삭제하는 조치는 **위험하다.** 어떤 키가 무엇을 돌리고 있는지 모르는 상태에서 지우면 운영이 멈추고, 지운 키는 되돌릴 수 없다. 순서는 다음과 같다.

```
[ 장기 키 정리 절차 — 되돌릴 수 있는 순서로 ]

  ① 자격 증명 보고서로 전수 목록화
       키 ID · 생성일 · **마지막 사용일** · 마지막 사용 서비스·리전
        │
        ▼
  ② 분류
       · 최근 미사용 + 소유자 없음  → 즉시 처리 대상
       · 사용 중                    → 대체 경로 설계 필요
        │
        ▼
  ③ 대체 경로 마련  (여기가 본 작업이다)
       사람      → IAM Identity Center 로그인
       EC2·컨테이너 → 인스턴스·태스크 역할
       CI/CD     → OIDC 페더레이션
       외부 시스템 → 역할 + ExternalId
        │
        ▼
  ④ **비활성화**  (삭제가 아니다 — 되돌릴 수 있는 상태)
        │
        ▼
  ⑤ 관찰 기간   무엇이 깨지는지 지켜본다
        │
        ▼
  ⑥ 삭제 + 재발 방지
       · 키 생성 자체를 정책으로 제한
       · 미사용 키 탐지를 상시 규칙으로
```

**결론**: 보안 개선 작업도 배포다. **되돌릴 수 있는 단계(비활성화)를 반드시 거치고**, 근본 대체 경로를 먼저 만든 뒤 회수한다. 시험에서 "가장 먼저 해야 할 일"을 물으면 대개 ①(현황 파악)이고, "재발을 막으려면"을 물으면 ⑥(정책으로 강제)이다. 같은 지문이라도 묻는 시점에 따라 정답이 달라진다.

## 헷갈리는 쌍 대조표

Week 1에서 시험이 반복해 노리는 짝만 모았다. 왼쪽과 오른쪽을 바꿔 기억하면 그대로 오답이 되는 것들이다.

| 왼쪽 | 오른쪽 | 결정적 차이 |
|------|--------|-------------|
| Identity 정책 | Resource 정책 | `Principal` 요소 유무 / 관리 주체가 다름 |
| 명시적 Deny | 묵시적 Deny | 오류 메시지에 `explicit`이 있는가 |
| 권한을 주는 정책 | 상한을 정하는 정책 | SCP·경계·세션은 **권한을 만들지 못한다** |
| `Bool` | `BoolIfExists` | 키가 없는 요청을 어떻게 처리하는가 |
| `sts:ExternalId` | `aws:SourceArn` | 대리인이 서드파티 계정인가, AWS 서비스인가 |
| `AssumeRole` | `GetSessionToken` | 신원을 갈아입는가, 같은 신원에 MFA만 반영하는가 |
| `RoleSessionName` | `sts:SourceIdentity` | 자유롭게 바뀌는가, 체이닝 내내 고정되는가 |
| 같은 계정 접근 | 교차 계정 접근 | OR(둘 중 하나) 대 AND(양쪽 모두) |
| 역할 | 인스턴스 프로파일 | EC2에 붙이는 것은 프로파일 |
| IAM User | IAM Identity Center | 영구 자격 증명 대 SSO 임시 자격 증명 |
| SCP 적용 대상 | SCP 예외 | 멤버 계정 root에는 **적용**, 서비스 연결 롤·관리 계정에는 **미적용** |
| 관리형 정책 조회 | 인라인 정책 조회 | CLI 명령이 다르다 — 인라인을 빠뜨리기 쉽다 |

## 정책 조각 치트시트

시험장에서 눈에 익어 있어야 할 형태들이다. 문법을 외우기보다 **모양을 보고 용도를 즉시 알아채는 것**이 목표다.

```json
// ① 조직 밖 접근 차단 — 리소스 쪽에서 거는 경계
{
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::secure-data", "arn:aws:s3:::secure-data/*"],
  "Condition": {
    "StringNotEquals": { "aws:PrincipalOrgID": "o-exampleorgid" }
  }
}

// ② 평문 전송 차단 — 거의 모든 민감 버킷의 기본 문장
{
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::secure-data", "arn:aws:s3:::secure-data/*"],
  "Condition": { "Bool": { "aws:SecureTransport": "false" } }
}

// ③ MFA 없는 민감 작업 차단 — IfExists 를 쓰는 이유를 기억할 것
{
  "Effect": "Deny",
  "Action": ["iam:*", "kms:ScheduleKeyDeletion", "ec2:TerminateInstances"],
  "Resource": "*",
  "Condition": { "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" } }
}

// ④ 서드파티 위임 신뢰 정책 — ExternalId 가 핵심
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::VENDOR-ACCOUNT:root" },
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": { "sts:ExternalId": "vendor-issued-value" }
  }
}

// ⑤ AWS 서비스 신뢰 정책 — 출처 조건이 없으면 "전 세계의 그 서비스"다
{
  "Effect": "Allow",
  "Principal": { "Service": "sns.amazonaws.com" },
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": { "aws:SourceAccount": "111122223333" },
    "ArnLike": { "aws:SourceArn": "arn:aws:sns:ap-northeast-2:111122223333:alerts" }
  }
}

// ⑥ ABAC — 정책 수를 일정하게 유지하는 한 문장
{
  "Effect": "Allow",
  "Action": ["ec2:StartInstances", "ec2:StopInstances"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceTag/Project": "${aws:PrincipalTag/Project}"
    }
  }
}
```

## CLI 치트시트

```bash
# ── 신원 확인 ────────────────────────────────────────────
aws sts get-caller-identity                 # 지금 나는 누구인가
aws organizations describe-organization     # 조직 멤버인가(= SCP 적용 대상인가)

# ── 권한 조사 ────────────────────────────────────────────
aws iam list-attached-role-policies --role-name AppRole   # 관리형
aws iam list-role-policies          --role-name AppRole   # 인라인 (빠뜨리기 쉬움)
aws iam get-role --role-name AppRole --query 'Role.AssumeRolePolicyDocument'
aws iam get-account-authorization-details > iam-dump.json # 전수 덤프

# ── 검증 ─────────────────────────────────────────────────
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:role/AppRole \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::research-raw/sample.csv
aws accessanalyzer validate-policy \
  --policy-document file://new-policy.json --policy-type IDENTITY_POLICY

# ── 자격 증명 위생 ───────────────────────────────────────
aws iam generate-credential-report
aws iam get-credential-report --query Content --output text
aws iam generate-service-last-accessed-details \
  --arn arn:aws:iam::111122223333:role/AppRole

# ── 역할 맡기 ────────────────────────────────────────────
aws sts assume-role \
  --role-arn arn:aws:iam::444455556666:role/CrossAccountReadRole \
  --role-session-name audit-2026 \
  --external-id vendor-issued-value \
  --source-identity alice@example.com
```

> ⚠️ **함정**: `simulate-principal-policy`가 `allowed`를 반환해도 실제로는 막힐 수 있다. 이 도구는 **SCP를 평가하지 않고**, 리소스 기반 정책과 VPC 엔드포인트 정책도 완전히 반영하지 못한다. 그래서 시뮬레이터는 "IAM·경계 층에는 문제가 없다"를 **배제하기 위한 도구**로 쓰고, 그래도 막힌다면 조직 가드레일과 리소스 쪽을 본다. 정밀한 진단 절차는 Week 2에서 다룬다.

> 📚 **사례**: 2019년 Capital One 침해는 이번 주에 배운 것이 왜 실무의 중심인지 보여 준다. 공격자는 잘못 구성된 웹 애플리케이션 방화벽을 통해 SSRF로 EC2 인스턴스 메타데이터에 접근했고, 그 인스턴스 역할의 임시 자격 증명을 얻어 S3 데이터를 내려받았다. 미국·캐나다 신용카드 신청자 약 1억 명 규모의 정보가 영향을 받았다. 주목할 점은 **뚫린 것이 전부 고객 책임 영역**이었다는 사실이다 — S3 인프라도, 하이퍼바이저도 무사했다. 그리고 임시 자격 증명을 쓰고 있었음에도 사고가 났다. 임시 자격 증명은 "노출 시 유효 기간이 제한된다"는 방어선일 뿐, **노출 경로를 막는 것(IMDSv2)**과 **탈취돼도 할 수 있는 일을 좁히는 것(최소 권한)**은 별개의 통제다. Week 1의 결론이 여기에 있다.

## 한 줄 요약

Week 1의 모든 내용은 두 질문으로 압축된다. **"이 접근은 IAM 평가의 어느 단계에서 결정되는가"**와 **"이 자격 증명은 임시인가 장기인가, 위임 경계는 안전한가"**다. 평가는 **명시적 Deny 우선 → 가드레일(SCP·권한 경계) 통과 → 명시적 Allow 존재**의 순서이고, 가드레일은 권한을 만들지 못하므로 `AdministratorAccess`도 상한을 넘지 못한다. 같은 계정은 Identity **또는** Resource 정책 하나로 충분하지만 **교차 계정은 양쪽 모두** 필요하며, KMS는 **키 정책이 1차 권위**라 IAM만으로는 키를 못 쓴다. 자격 증명 쪽에서는 장기 액세스 키를 없애는 것이 목표이고, 사람은 Identity Center, 워크로드는 인스턴스·태스크 역할, CI는 OIDC, 외부 벤더는 **역할 + ExternalId**로 해결한다. 위임에는 언제나 **Confused Deputy** 방어가 따라붙는다 — 서드파티에는 `sts:ExternalId`, AWS 서비스에는 `aws:SourceArn`·`aws:SourceAccount`. 그리고 "권한이 있는데 거부된다"는 상황은 거의 예외 없이 **상한 층에서 막힌 것**이므로, 권한을 넓히기 전에 어느 층이 범인인지부터 특정한다.

---

## 📝 종합 시나리오 10개

**문제 1.** 한 회사가 EC2에서 실행되는 애플리케이션이 S3에 접근하도록 구성하려 한다. 보안 모범 사례에 가장 부합하는 방법은?

A) IAM User를 만들어 access key를 생성하고 EC2 인스턴스의 환경 변수에 저장한다  
B) IAM Role을 인스턴스 프로파일로 EC2에 부착하고 IMDSv2를 강제한다  
C) root 자격 증명을 EC2에 두고 필요 시 사용한다  
D) S3 버킷을 public-read로 열어 인증 없이 접근하게 한다  

**정답: B**  
해설: EC2에는 인스턴스 프로파일(IAM Role)을 붙여 STS 임시 자격 증명을 자동 발급받게 하고 IMDSv2를 강제해 SSRF로 인한 자격 증명 탈취를 막는 것이 모범 사례다. 환경 변수에 장기 access key를 저장하면 노출 위험이 크고, root 사용은 절대 금지이며, 버킷 public-read는 데이터 유출의 전형적 원인이다.

---

**문제 2.** 계정 A의 CodePipeline이 계정 B의 ECS 서비스로 배포하며, artifact는 계정 A의 KMS 키로 암호화돼 있다. 배포가 동작하려면 반드시 갖춰야 할 권한 경계 조합은?

A) 계정 A의 파이프라인 역할에 모든 권한을 주면 cross-account도 자동 동작한다  
B) 계정 B에 trust가 A로 설정된 배포 역할 + 계정 A KMS 키 정책에 B 사용 허용 + B 역할의 ECS 권한 + artifact 버킷 정책에 B read 허용  
C) 계정 B의 root 자격 증명을 계정 A에 저장한다  
D) IAM Identity Center SSO만 설정하면 머신 워크플로가 자동 해결된다  

**정답: B**  
해설: cross-account CI/CD는 trust 관계, KMS 키 정책의 cross-account 허용, 대상 계정 역할의 서비스 권한, artifact 버킷 정책의 read 허용이라는 네 경계를 모두 정렬해야 한다. 한쪽 계정에 권한을 몰아준다고 경계가 자동으로 열리지 않고, root 저장은 금지이며, Identity Center는 사람 SSO용이지 머신 워크플로용이 아니다.

---

**문제 3.** 한 사용자가 `PowerUserAccess`를 가지고 있고 SCP·Boundary에 아무 제약이 없는데, `dynamodb:Query` 호출이 거부된다. 가장 가능성 높은 원인은?

A) DynamoDB는 IAM으로 통제되지 않는다  
B) 어딘가에 `dynamodb:Query`(또는 상위 와일드카드)를 명시적으로 Deny하는 정책이 있다  
C) PowerUserAccess는 DynamoDB를 포함하지 않으며 명시적 Allow가 없어 암묵적 Deny일 수 있다  
D) B와 C 둘 다 가능한 원인이다  

**정답: D**  
해설: 거부 원인은 명시적 Deny가 존재하거나, 해당 Action에 대한 명시적 Allow가 없어 암묵적 Deny가 적용되는 경우 모두 가능하다. PowerUserAccess는 대부분의 서비스를 허용하지만 별도 인라인/리소스 정책의 Deny가 우선할 수 있고, 권한 범위 밖이면 암묵적 Deny가 된다. DynamoDB가 IAM 통제를 받지 않는다는 것은 사실이 아니다.

---

**문제 4.** 서드파티 백업 벤더에게 회사의 특정 S3 버킷에 대한 cross-account 접근을 안전하게 위임하려 한다. 가장 적절한 구성은?

A) 벤더에게 IAM User access key를 발급해 전달한다  
B) IAM Role을 만들고 trust policy에 벤더 계정과 벤더가 발급한 ExternalId를 명시하며, permission은 해당 버킷·필요 Action으로 제한한다  
C) 버킷을 public으로 열어 벤더가 인증 없이 접근하게 한다  
D) 벤더에게 회사 root 자격 증명을 공유한다  

**정답: B**  
해설: cross-account 서드파티 위임의 정답은 Role + trust policy에 벤더 계정과 ExternalId를 명시하고 permission을 최소 권한으로 좁히는 것이다. ExternalId는 같은 벤더를 쓰는 다른 고객이 우리 자원에 접근하는 Confused Deputy를 막는다. access key 발급·public 개방·root 공유는 모두 심각한 노출 위험을 만든다.

---

**문제 5.** 보안팀이 조직의 모든 계정에서 누구도(admin·root 포함) 기존 CloudTrail을 끄지 못하게 하고 동시에 미국 외 리전 사용을 차단하려 한다. 가장 적절한 조합은?

A) 각 계정 사용자 정책에 일일이 Deny를 추가한다  
B) SCP에 `cloudtrail:StopLogging`/`DeleteTrail` Deny와 `aws:RequestedRegion` 기반 region Deny를 작성하되, 글로벌 서비스를 `NotAction`으로 제외한다  
C) GuardDuty로 CloudTrail 중단과 타 리전 사용을 탐지해 알림만 보낸다  
D) IAM Permissions Boundary로 모든 계정에 일괄 적용한다  

**정답: B**  
해설: 조직 차원의 강제는 SCP의 명시적 Deny로 구현하며, region 제한 시 IAM·CloudFront·Route 53 같은 글로벌 서비스를 `NotAction`으로 제외하지 않으면 계정 운영 자체가 막히는 함정이 있다. 사용자별 정책은 누락 위험이 크고, GuardDuty 탐지는 사후 알림일 뿐이며, Permissions Boundary는 주체별 상한이라 계정 전체 거버넌스에는 SCP가 적합하다.

---

**문제 6.** 한 정책이 MFA 없는 민감 작업을 막으려고 `"Bool": {"aws:MultiFactorAuthPresent": "false"}`로 Deny를 걸었더니, 서비스 간 자동화 호출까지 차단되는 부작용이 생겼다. 올바른 수정은?

A) 조건을 `"BoolIfExists": {"aws:MultiFactorAuthPresent": "false"}`로 바꾼다  
B) Deny를 Allow로 바꾼다  
C) MFA 조건을 제거하고 모두 허용한다  
D) 모든 사용자에게 MFA 디바이스를 강제 등록만 한다  

**정답: A**  
해설: 일부 호출에는 MFA 컨텍스트 키가 아예 없어 `Bool`로 평가하면 정상 요청까지 매칭돼 막힌다. `BoolIfExists`는 키가 있을 때만 값을 검사하고 없으면 통과시켜 의도대로 동작한다. Allow 전환이나 조건 제거는 MFA 강제를 무력화하고, 디바이스 등록만으로는 정책 평가 부작용이 해결되지 않는다.

---

**문제 7.** 수십 개 팀이 각자 리소스를 운영하며 팀 추가 때마다 IAM 정책이 폭증하는 문제를 겪는다. 가장 확장성 있는 최소 권한 접근은?

A) 모든 팀에 동일한 admin 정책을 부여한다  
B) `aws:PrincipalTag/team`과 `aws:ResourceTag/team`의 일치를 조건으로 하는 ABAC 정책으로 통일한다  
C) 팀마다 별도 역할과 전용 정책을 계속 추가한다  
D) 팀별 권한 관리를 포기하고 수동 승인으로 운영한다  

**정답: B**  
해설: ABAC은 주체와 리소스의 팀 태그 일치를 조건으로 표현해 정책 하나로 임의 개수의 팀을 처리하므로, 팀이 늘어도 태그만 부여하면 된다. 페더레이션 사용자는 session tag를 PrincipalTag로 매핑하면 동일하게 적용된다. admin 일괄 부여는 최소 권한 위반, 팀별 정책 양산은 폭증 문제 그대로, 수동 승인은 확장성이 없다.

---

**문제 8.** 기업 직원 수천 명이 여러 AWS 계정에 접근해야 한다. 계정마다 IAM User를 만드는 안티패턴을 피하는 가장 적절한 방법은?

A) 계정마다 공유 IAM User를 하나씩 만들어 팀이 함께 쓴다  
B) IAM Identity Center에서 permission set을 정의하고 외부 IdP와 연동해 SSO로 임시 자격 증명을 발급받게 한다  
C) 모든 직원에게 root 자격 증명을 배포한다  
D) 각 직원에게 장기 access key를 발급한다  

**정답: B**  
해설: IAM Identity Center는 외부 IdP와 연동해 permission set 기반으로 다계정 SSO를 제공하며, 사용자는 로그인 후 임시 자격 증명으로 접근하므로 계정마다 IAM User를 만들 필요가 없다. 공유 User는 추적성과 최소 권한을 모두 해치고, root 배포와 장기 키 발급은 심각한 보안 위험이다.

---

**문제 9.** 계정 A의 역할이 계정 B의 KMS 키로 암호화된 S3 객체를 읽지 못한다. S3 버킷 정책과 A의 IAM 정책은 모두 올바르게 GetObject를 허용한다. 가장 가능성 높은 누락은?

A) 계정 B의 KMS 키 정책이 계정 A의 역할에 `kms:Decrypt`를 허용하지 않았다  
B) S3는 cross-account 읽기를 지원하지 않는다  
C) 두 계정이 다른 리전이라 불가능하다  
D) GetObject 권한만 있으면 KMS 복호화는 자동으로 허용된다  

**정답: A**  
해설: KMS는 키 정책이 1차 권위를 가지므로, 암호화 객체를 읽으려면 키 소유 계정(B)의 키 정책이 호출 역할(A)에 `kms:Decrypt`를 명시적으로 허용해야 한다. S3 권한이 있어도 복호화 권한이 없으면 객체를 읽을 수 없다. S3 cross-account 읽기는 지원되며, 리전이 달라도 가능하고, GetObject가 KMS 복호화를 자동 부여하지 않는다.

---

**문제 10.** SNS 토픽 정책이 `"Principal": {"Service": "s3.amazonaws.com"}`으로 S3의 이벤트 발행을 허용한다. 다른 사람의 S3 버킷이 이 토픽을 트리거하도록 악용되는 것을 막으려면?

A) Principal을 `*`로 바꿔 모든 호출을 허용한다  
B) Condition에 `aws:SourceArn`(특정 버킷 ARN)과 `aws:SourceAccount`를 추가해 우리 버킷의 호출만 허용한다  
C) 토픽을 삭제하고 SQS로 교체한다  
D) S3 버킷을 비공개로 전환하면 자동 해결된다  

**정답: B**  
해설: 서비스 주체를 신뢰할 때는 `aws:SourceArn`과 `aws:SourceAccount` 조건으로 호출 출처를 특정 리소스·계정으로 한정해야 Confused Deputy를 막는다. 그렇지 않으면 같은 S3 서비스 주체를 쓰는 타인의 버킷이 우리 토픽을 트리거할 수 있다. Principal `*`는 위험을 키우고, 서비스 교체나 버킷 비공개 전환은 이 출처 검증 문제를 해결하지 않는다.

---

## Week 1 마무리 — 다음 주로 가는 다리

이번 주 다섯 가지 — 공동 책임 모델, 정책 평가 알고리즘, Identity/Resource 정책, Condition·최소 권한, STS·페더레이션 — 는 SCS-C03 **도메인 4(IAM)의 핵심이자 나머지 다섯 도메인의 전제**다. 다음 주부터 데이터 보호(KMS·암호화)를 본격적으로 들어가는데, 그때 만날 키 정책·grant·암호화 컨텍스트는 모두 이번 주에 익힌 두 질문 위에서 풀린다.

1. "이 접근은 **IAM 평가 알고리즘의 어느 단계**에서 결정되는가" (명시적 Deny → 필터 → 명시적 Allow)
2. "이 자격 증명은 **임시인가 장기인가, 그리고 위임 경계는 안전한가**" (STS · trust policy · ExternalId)

이 두 질문을 잊지 않으면, 다음 주의 KMS 키 정책, S3 암호화 강제, Secrets Manager 회전 같은 주제가 "따로 외울 도구"가 아니라 "이번 주 IAM 사고 프레임의 데이터 보호 버전"으로 보이기 시작할 것이다.
