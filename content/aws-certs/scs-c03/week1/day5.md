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
