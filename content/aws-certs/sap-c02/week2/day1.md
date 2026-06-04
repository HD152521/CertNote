# Day 6 - AWS Organizations: 멀티 계정이라는 새로운 사고 단위

처음 AWS를 쓰는 회사가 거의 모두 거치는 길이 있다. 시작할 때는 **계정 하나**다. 개발자 몇 명이 같은 root 계정으로 콘솔에 들어가서 EC2를 만들고 RDS를 띄운다. 점점 사람이 늘면 IAM User를 만들고, IAM Group을 만든다. 그러다 보안팀이 "운영 환경과 개발 환경을 같은 계정에 두면 안 됩니다"라고 말한다. 그래서 개발용 계정과 운영용 계정을 따로 만든다. 시간이 흐르면 그 둘이 다섯이 되고, 마흔이 되고, 백이 된다. 그리고 어느 순간 IAM 정책 충돌, 부서별 비용 분리 불가, 보안 사고가 한 계정에서 다른 계정으로 번지는 문제가 동시에 터진다.

이 모든 일은 2017년 AWS Organizations가 GA되기 전까지는 **고객이 직접 풀어야 하는 운영 문제**였다. Netflix는 자체 도구 Cloudaco로 100개 이상의 계정을 관리했고, Capital One은 [Cloud Custodian](https://cloudcustodian.io/)을 만들었다. 그러던 2017년, AWS는 "여러 계정을 한 단위로 묶어서 관리하는 API"를 표준으로 제공하기 시작한다. 이게 Organizations다. 그리고 이게 SAP-C02 도메인 1(26%)의 출발점이다.

오늘은 "왜 멀티 계정인가"라는 근본 질문부터 시작해, Organizations의 구조, OU 설계 표준, Management 계정의 위험, 신규 계정 자동화까지 차례로 본다. Pro 시험에서 "계정 N개를 어떻게 묶을까"라는 질문이 보이면 즉시 떠올라야 할 사고 도구다.

## 왜 멀티 계정인가: 4가지 동기와 그 깊이

멀티 계정의 필요성은 단순히 "계정을 나누면 깔끔하다" 정도가 아니다. 네 가지 별개 차원이 동시에 작동한다.

| 동기 | 단일 계정의 문제 | 멀티 계정의 효과 | 학술/실무 배경 |
|------|-------------------|-------------------|-----------------|
| **격리 (Isolation)** | 한 워크로드 실수가 전체 영향 | 폭발 반경(blast radius) 차단 | Bulkhead 패턴 (Hystrix) |
| **청구 (Billing)** | 부서·프로젝트 비용 추적 어려움 | 계정 = 자연스러운 청구 단위 | FinOps Foundation 권고 |
| **규제·감사 (Compliance)** | 데이터 혼재 | 감사 범위 좁힘 (PCI·HIPAA) | NIST SP 800-53 AC-4 |
| **운영 (Operations)** | IAM 정책 복잡도 폭증 | 계정 단위로 단순화 | DDD Bounded Context |

> 💡 **관련 이론**: **Blast Radius**는 Netflix의 Chaos Engineering 팀이 정착시킨 용어다. Netflix Chaos Monkey가 인스턴스를 무작위로 죽일 때, "한 인스턴스 죽음이 얼마나 많은 사용자에게 영향을 미치는가"를 측정하는 게 blast radius다. 계정은 이 반경의 가장 강한 차단막이다 — AWS는 계정 경계에서 IAM, 네트워크, API 호출이 모두 차단된다. 같은 사상이 Michael Nygard의 *Release It!*(2007)에서 **Bulkhead 패턴**으로 정리됐다. 선박의 격벽처럼 한 칸이 침수돼도 다른 칸은 살아남게 하는 설계.

> 💡 **관련 이론**: **Bounded Context**는 Eric Evans의 *Domain-Driven Design*(2003) 핵심 개념. 서로 다른 도메인 모델이 같은 코드베이스에 섞이면 의미 충돌(Order는 결제팀에서는 청구서지만, 물류팀에서는 배송 단위)이 일어난다. 도메인별로 코드와 데이터를 격리하라는 게 BC의 핵심. AWS 계정은 **인프라 레벨의 Bounded Context**다. 결제 도메인과 물류 도메인이 같은 계정에 살면 IAM 정책이 두 도메인 모두를 고려해 비대해진다. 계정을 나누면 각 계정 안의 IAM은 단순해진다.

> 🔍 **더 깊이**: AWS 계정 경계의 강력함은 API 레벨에서 명시적으로 구현돼 있다. 한 계정의 IAM User는 다른 계정의 리소스를 **기본적으로 절대 못 본다**. 보려면 (1) Cross-Account Role + (2) Resource Policy + (3) STS AssumeRole이라는 세 게이트를 모두 통과해야 한다. 반면 같은 계정 안에서는 IAM 정책 하나만 잘못 쓰면 다른 팀 리소스에 접근 가능. 그래서 "Dev/Prod 분리" 같은 격리는 IAM이 아니라 **계정 분리**로 강제하는 게 표준.

> 📚 **사례**: 2019년 Capital One 사고에서 만약 prod와 staging이 다른 계정이었다면 공격자가 staging의 IAM Role로 prod S3에 접근할 수 없었다. 같은 계정에 있었기에 EC2 IAM Role 하나가 production data까지 가져왔다. 사고 후 Capital One은 "**Account Vending Machine**"이라는 자체 도구로 모든 워크로드 그룹을 별도 계정으로 분리했다. 이 사상이 AWS Control Tower의 Account Factory에 그대로 반영된다.

## AWS Organizations 구조: Root, OU, Account의 3층

```
Root
 ├── Management Account (결제·Org 관리, 워크로드 X)
 ├── OU: Security
 │    ├── Log Archive (CloudTrail S3 적재, Object Lock)
 │    └── Audit (Security Hub, GuardDuty Master)
 ├── OU: Infrastructure
 │    ├── Network (TGW, DNS, Direct Connect, Route 53)
 │    └── Shared Services (CI/CD, ECR, AD, CodeArtifact)
 ├── OU: Workloads
 │    ├── OU: Prod (계정 N개)
 │    └── OU: Non-Prod (계정 N개)
 ├── OU: Sandbox (자유로운 실험, 비용·서비스 제한)
 ├── OU: PolicyStaging (SCP 시험용)
 └── OU: Suspended (폐쇄 예정 계정)
```

- **Management Account**: Organizations 생성한 결제 계정. 워크로드 배포 금지 (보안·격리).
- **Member Account**: OU 안에 들어가는 일반 계정.
- **OU (Organizational Unit)**: 계정의 컨테이너. 최대 5단계 중첩.

> 🔍 **더 깊이**: OU의 최대 깊이는 5단계지만 실무에서 3단계 이상 가는 경우는 거의 없다. AWS SRA(Security Reference Architecture) 권장은 2-3단계다. 예: Root → Workloads → Prod → App-A-Prod 계정 (3단계). 깊어질수록 SCP 평가 비용이 늘고 운영 복잡도가 폭증한다.

> 🔍 **더 깊이**: Organizations의 백엔드는 **Eventually Consistent**다. SCP 변경이 모든 계정에 전파되는 데 수 분이 걸릴 수 있다. CloudTrail의 OrganizationsAggregator에서 `attachPolicy` 이벤트를 본 후 즉시 효과를 기대하면 안 된다. Pro 시험에서 "SCP를 부착한 직후 Lambda가 즉시 차단해야 한다" 같은 보기가 함정인 이유.

> ⚠️ **함정**: Management 계정에는 SCP가 적용되지 않는다(의도된 동작). Management의 root 사용자는 Org 자체를 삭제할 수 있는 유일한 Principal이므로 SCP로도 막을 수 없다. 그래서 Management의 root는 (1) MFA 하드웨어 토큰 강제, (2) 이메일 주소를 root 전용 별도 alias로, (3) 평시 비밀번호 복구 불가능하게 설정한 후 봉인하는 게 표준.

## OU 설계 표준: AWS SRA의 5가지 핵심 OU

AWS 공식 SRA가 권장하는 OU 구조는 다음 5개를 기본으로 한다.

| OU | 역할 | 안에 들어가는 대표 계정 |
|----|------|---------------------------|
| **Security** | 감사·로그·보안 도구 마스터 (필수) | Log Archive, Audit, Security Tooling |
| **Infrastructure** | 네트워크·공유 서비스 | Network, Shared Services |
| **Workloads** | 실제 비즈니스 (Prod/Non-Prod 분리) | App-A-Prod, App-B-Prod |
| **Sandbox** | 개발자 실험 (제한된 SCP로 격리) | Developer Personal |
| **PolicyStaging** | SCP 시험용 (선택) | Policy Test |

> 💡 **암기 팁**: OU는 "조직도"가 아니라 **"공통 정책 단위"**로 묶는다. 같은 SCP가 적용될 계정끼리 묶는 게 OU의 본질. 회사 조직도(영업팀·개발팀·인사팀)를 그대로 OU로 만들면 OU 간에 공통 정책이 거의 없어 SCP가 무의미해진다.

> 🎯 **시나리오**: "한 글로벌 금융사가 미국·유럽·아시아 3개 지역에서 동시 운영한다. 각 지역마다 별도 규제(SOX, GDPR, PCI-K)가 적용된다. OU를 어떻게 설계?" — 답: **지역별 OU(US/EU/APAC) + 각 안에 Prod/Non-Prod 중첩**. 같은 SCP(예: GDPR 데이터 주권)는 EU OU에만 적용. PCI-DSS는 모든 지역의 결제 워크로드에 공통이므로 별도 PCI OU로 또 분리 가능. 핵심: SCP가 공통으로 적용될 단위로 묶는 것.

## 계정 분리 단위 결정: 언제 나누고 언제 합칠까

| 기준 | 분리 권장? | 이유 |
|------|------------|------|
| 환경 (Prod/Stg/Dev) | ✅ 강력 권장 | 폭발 반경, IAM 분리 |
| 비즈니스 유닛 (BU) | ✅ 권장 | 청구·거버넌스, BU별 책임 |
| 데이터 분류 (PII·PCI·HIPAA) | ✅ 권장 | 규제 격리, 감사 범위 좁힘 |
| 마이크로서비스 (5개) | ❌ 과도 | 같은 계정 가능, IAM Role로 분리 |
| 마이크로서비스 (100개) | ⚠️ 일부 분리 | 도메인 단위(예: Payment, Inventory)로 |
| 리전 | ❌ 분리 X | 계정은 글로벌, 리전은 한 계정 안에서 선택 |

> 🔍 **더 깊이**: "마이크로서비스마다 계정"은 흔한 over-engineering이다. 100개 서비스 = 100개 계정으로 가면 (1) IAM Identity Center Permission Set 매핑 폭발, (2) Cross-Account 호출이 모든 곳에서 발생, (3) CloudTrail Org Trail의 이벤트 노이즈 폭증. Netflix·Amazon 같은 빅테크도 도메인(Bounded Context) 단위로 묶고, 각 도메인 안에서 IAM Role로 서비스를 분리한다. Pro 시험에서 "마이크로서비스마다 계정 분리" 보기는 보통 함정.

> 📚 **사례**: Capital One은 사고 후 약 **2,500개 계정**으로 확장했다(2022 기준). 하지만 모든 계정은 자동화된 vending machine으로 생성되고, 베이스라인이 일관되며, SCM(Source Control)에서 IaC로 관리된다. 즉 계정 수가 많아도 운영 부담이 적은 이유는 **자동화**다. 자동화 없이 계정만 늘리면 운영팀이 무너진다.

## Management 계정의 위험과 격리 패턴

Management 계정은 Organizations의 본부다. 침해되면 모든 멤버 계정이 위험. 그래서 보안 요구가 가장 높다.

| 항목 | 표준 가이드라인 |
|------|------------------|
| 워크로드 배포 | **절대 금지** |
| root 이메일 | 회사 그룹 alias (개인 이메일 X) |
| root MFA | 하드웨어 토큰 (YubiKey 등) |
| root 비밀번호 | 봉인 후 금고 보관 |
| IAM User | 최소화, 가능한 IAM Identity Center로 |
| 로깅 | CloudTrail All Region + Log Archive로 전송 |
| 결제 액세스 | Billing IAM Policy로 별도 분리 |

> ⚠️ **함정**: SCP는 Management 계정에 적용 안 됨. 결제는 Management로 합산되지만 정책은 멤버에만. Pro 시험에서 "Management 계정에서 비인가 리전 사용을 SCP로 차단"이라는 보기는 100% 함정.

> 🔍 **더 깊이**: 2022년 AWS는 **GovCloud / China Regions / 별도 partition** 환경에서 Organizations의 trust 모델을 더 강화하는 업데이트를 했다. Management 계정의 IAM User를 별도 partition으로 옮기거나 break-glass 절차를 자동화하는 패턴이 일반화됐다. 일부 대기업은 Management 계정에 **두 명 동시 로그인 강제**(two-person rule) + 모든 액션을 SNS로 보안팀 전송. 핵 발사 절차와 비슷한 dual control.

## 신규 계정 자동 생성: 4가지 옵션

| 방법 | 특징 | 적합한 조직 |
|------|------|--------------|
| **Org 콘솔로 수동 생성** | 클릭 몇 번 | 작은 조직 (계정 < 20개) |
| **Account Factory (Control Tower)** | 표준 가드레일·로깅 자동 설정 | 중대형 조직 |
| **AFT (Account Factory for Terraform)** | IaC 기반, GitOps | Terraform 사용 조직 |
| **API: `CreateAccount`** | 사용자 정의 자동화 | 자체 vending machine |

> 🔍 **더 깊이**: `CreateAccount` API는 비동기다. 호출하면 `CreateAccountRequestId`만 반환되고, 실제 계정 생성은 백엔드에서 수 분~수 시간 걸린다. `DescribeCreateAccountStatus`로 polling 필요. 일괄 100개를 만들면 quota throttling이 발생할 수 있어 SQS + Step Functions로 직렬화하는 게 표준 패턴.

## Consolidated Billing: 결제 통합의 효과

| 효과 | 설명 |
|------|------|
| **단일 청구서** | CFO·회계 단순화 |
| **볼륨 할인 합산** | 모든 계정 사용량 합쳐 단계별 할인 (S3 storage tier 등) |
| **RI·Savings Plans 공유** | Management/Org 단위 공유, 안 쓴 SP를 다른 계정이 사용 |
| **데이터 전송 등급 할인 합산** | 전체 outbound 합산하여 단계 할인 |

> 💡 **암기 팁**: Org 가입만으로 자동 적용. 별도 설정 불필요. RI/SP 공유는 **Linked Account Sharing** 옵션이 켜져 있어야 함(기본 ON).

> ⚠️ **함정**: Cost Explorer는 Management 계정에서만 전체 보기 가능. 멤버 계정은 자기 계정만 본다. 부서별 비용 분리하려면 **Cost Allocation Tag**를 활성화하고 모든 리소스에 태그 부착이 필수.

## Trusted Access와 Delegated Administrator

특정 AWS 서비스(CloudFormation StackSets, GuardDuty, Security Hub, Config, IAM Access Analyzer 등)가 Org 단위로 작동하려면 **"Trusted Access"** 활성화 필요. 이 후 **Delegated Administrator**로 위임 가능.

> 🔍 **더 깊이**: Delegated Administrator는 Management 계정이 직접 보안 도구를 운영하는 부담을 줄인다. 예: Management는 결제만, Audit 계정이 GuardDuty Delegated Admin이 되어 모든 멤버의 위협 탐지 결과를 모음. 이게 보안 팀과 결제 팀의 책임 분리를 가능하게 하는 핵심 패턴.

## CLI로 직접 보기

```bash
# Org 생성 (Management 계정에서 단 1회)
aws organizations create-organization --feature-set ALL

# OU 생성
aws organizations create-organizational-unit \
  --parent-id r-xxxx --name Workloads

# 신규 계정 생성 (비동기)
aws organizations create-account \
  --email prod-app-a@example.com \
  --account-name "App-A-Prod"

# 생성 상태 polling
aws organizations describe-create-account-status \
  --create-account-request-id car-xxxxx

# OU로 이동
aws organizations move-account \
  --account-id 111111111111 \
  --source-parent-id r-xxxx \
  --destination-parent-id ou-yyyy

# Org 전체 구조 보기
aws organizations list-roots
aws organizations list-organizational-units-for-parent --parent-id r-xxxx
aws organizations list-accounts-for-parent --parent-id ou-yyyy
```

## 정리하며

오늘 본 그림은 셋이다. 첫째, 멀티 계정은 **격리·청구·규제·운영** 네 가지 별개 차원을 동시에 푸는 도구다. 둘째, Organizations는 **Root → OU → Account**의 3층 위에서 동작하며 OU는 조직도가 아니라 공통 정책 단위로 묶는다. 셋째, Management 계정은 결제·Org 관리만 두고 워크로드는 절대 배포하지 않으며, 신규 계정은 Account Factory(또는 AFT)로 자동화한다.

이 세 그림이 도메인 1의 출발점이다. 다음 글에서는 OU 위에 부착되는 **Service Control Policy(SCP)**를 본다. SCP는 Pro 시험에서 가장 자주 등장하는 단일 주제이고, "ceiling일 뿐 권한 부여는 아니다"라는 한 줄을 정확히 이해하는 게 합격선의 절반이다.

---

## 📝 연습 문제

**문제 1.** 한 핀테크가 PCI-DSS 인증을 받기 위해 결제 워크로드를 분리하려고 한다. 같은 회사에서 운영하는 인사·물류 워크로드와 같은 AWS 계정에 두고 IAM Role로만 분리하면 어떤 문제가 발생하는가?

A) 계정당 EBS 스냅샷 비용이 약 2배 증가해 월 청구액이 늘어남
B) 감사 범위가 전체 계정으로 확대되어 PCI 인증 비용 폭증
C) PCI 워크로드가 섞이면 해당 계정에서 RDS Multi-AZ 구성이 금지됨
D) cardholder data 처리량에 비례해 IAM User 쿼터가 빠르게 소진됨

**정답: B**
해설: PCI-DSS는 cardholder data가 닿는 모든 시스템을 감사 범위로 본다. 같은 계정에 PCI와 non-PCI 워크로드가 섞이면 전체 계정이 감사 대상이 되어 비용·시간이 폭증한다. 별도 계정으로 분리하면 그 계정만 감사 범위. 같은 원리가 HIPAA, SOX에도 적용. Trade-off: 계정 분리 운영 부담 < 감사 비용 절감.

---

**문제 2.** Management 계정에 대한 설명으로 옳은 것은?

A) 결제 집중을 위해 모든 워크로드를 Management 계정에 배포하는 것이 권장된다
B) Org 루트에 부착한 SCP가 Management 계정에도 자동으로 강하게 적용된다
C) 결제 마스터이며 워크로드 배포는 표준 가이드라인상 금지
D) Member 계정에 부착된 것과 동일한 SCP가 상속되어 동일하게 적용된다

**정답: C**
해설: Management는 결제·Org 관리 전용. 워크로드는 멤버 계정에. SCP는 Management 계정에 적용되지 않는다(의도). 침해되면 모든 멤버 위험하므로 root MFA 하드웨어 토큰·이메일 별도 alias 필수.

---

**문제 3.** Prod와 Dev를 같은 계정에 두면 발생하는 가장 큰 위험은?

A) NAT Gateway·데이터 전송 비용이 합산되어 월 청구액이 증가
B) Dev 실수가 Prod에 영향 (폭발 반경)
C) Dev/Prod 권한이 한 계정에 섞여 IAM 정책을 깔끔히 단순화하기 어려움
D) 한 계정에 두 환경이 있으면 리전을 분리해 배포할 수 없음

**정답: B**
해설: 계정 = 강한 격리 경계. Netflix Chaos Engineering의 blast radius 개념. Dev/Prod 같은 계정에서 IAM 정책 실수로 Dev User가 Prod 리소스 접근 가능. Capital One 사고의 핵심 교훈도 같은 계정 격리 부족.

---

**문제 4.** 100개 계정의 CloudTrail 로그를 단일 위치에 변경 불가능하게 보관하려면?

A) 각 계정의 S3 버킷에 버킷 정책과 Versioning을 걸어 개별 보관
B) Log Archive 계정 + S3 Object Lock + Organization Trail
C) 각 계정 CloudWatch Logs에 무기한 보존 정책으로 적재
D) 로그를 그대로 두고 Athena로 직접 쿼리해 필요 시 조회

**정답: B**
해설: Log Archive 계정 + Object Lock(WORM, Write Once Read Many)이 표준 패턴. Organization Trail은 한 번 켜면 모든 멤버 계정 CloudTrail이 자동으로 같은 S3로 적재. 21 CFR Part 11, SOX 같은 규제에서도 log immutability가 핵심.

---

**문제 5.** OU를 어떻게 나누어야 하는가?

A) 회사 조직도(영업·개발·인사 부서)를 그대로 OU로 매핑
B) 운영 리전별(us/eu/apac)로 OU를 분리
C) 공통 정책(SCP) 단위로
D) 개발자 개인·팀 그룹별로 OU를 생성

**정답: C**
해설: OU는 공통 정책이 적용될 계정 묶음. 조직도 그대로 옮기면 OU 간 공통 SCP가 거의 없어 SCP 무의미. SRA 권장은 Security/Infrastructure/Workloads/Sandbox.

---

**문제 6.** Consolidated Billing의 가장 큰 이점은?

A) 멤버 계정 간 보안 경계가 강화되어 침해 전파가 차단됨
B) RI·Savings Plans 공유 + 볼륨 할인 합산 + 단일 청구서
C) 계정 간 IAM 정책이 통합되어 권한 관리가 단순화됨
D) 멤버 계정 전체에 걸친 DR failover가 자동화됨

**정답: B**
해설: 모든 계정 사용량 합산 → RI/SP 공유, 단계 할인. CFO·회계 단일 청구서. 결제 통합 자체가 보안을 강화하지는 않는다(별도 SCP/CT 필요).

---

**문제 7.** 한 개발자가 자유롭게 실험할 OU 설계 가이드라인은?

A) Workloads OU에 포함하고 Prod와 동일한 가드레일을 그대로 적용
B) Sandbox OU + 제한적 SCP(GPU·고비용 인스턴스 deny) + AWS Budgets 알람 + 자동 정리 Lambda
C) Management 계정에 실험용 IAM User를 만들어 직접 리소스 생성
D) Security OU에 포함해 로그·감사 도구와 함께 운영

**정답: B**
해설: Sandbox OU 패턴 — 격리 + 비용 제어 SCP + 자동 정리. 한 달에 한 번 SC2 Lambda로 사용 안 한 리소스 자동 삭제하는 자동화도 표준. 개발자 실험은 권장되지만 회사 청구서가 폭주하면 안 됨.

---

**문제 8.** 한 글로벌 회사가 미국·유럽·아시아 3개 지역에서 운영한다. 각 지역마다 별도 규제(GDPR, CCPA). OU 설계는?

A) 모든 계정을 단일 OU에 두고 SCP를 글로벌로 일괄 적용
B) 지역별 OU(US/EU/APAC) + 각 안에 Prod/Non-Prod 중첩
C) 마이크로서비스·애플리케이션 서비스별로 OU를 분리
D) 개발자 개인·팀별로 OU를 생성해 접근을 분리

**정답: B**
해설: SCP가 공통 적용될 단위로 묶는 게 OU의 본질. GDPR은 EU OU에만 적용. CCPA는 US OU에만. 공통 PCI-DSS는 별도 OU로 또 분리 가능. 같은 SCP 적용 범위 = 같은 OU.

---

**문제 9.** 한 보안팀이 새로운 SCP를 시험해 보고 싶다. 실수로 production에 영향을 주면 안 된다. 권장 패턴은?

A) Production OU에 바로 부착하고 CloudTrail로 영향을 모니터링하며 조정
B) PolicyStaging OU에 테스트 계정 1개를 두고 부착 후 검증
C) Management 계정에서 SCP dry-run 모드로 실행해 영향만 미리 확인
D) Lambda로 IAM 정책 시뮬레이터를 호출해 SCP 효과를 사전 시뮬레이션

**정답: B**
해설: PolicyStaging OU 패턴이 표준. AWS Config Conformance Pack과 결합해 SCP 효과를 검증한 후 본 OU에 부착. dry-run 모드는 SCP에 공식적으로 없으므로 staging OU가 사실상 dry-run.

---

**문제 10.** 한 회사가 Terraform으로 신규 계정을 자동 생성하고 표준 베이스라인(VPC, IAM, CloudTrail)을 자동 적용하려고 한다. 가장 적합한 도구는?

A) Account Factory 콘솔로 계정을 찍어내고 베이스라인을 수동 적용
B) AFT (Account Factory for Terraform)
C) CfCT (Customizations for Control Tower, CloudFormation 기반)
D) StackSets만으로 베이스라인 스택을 전 계정에 배포

**정답: B**
해설: AFT는 Terraform 기반 GitOps 흐름과 일치. 계정 단위 커스터마이징(네트워킹 stub, 추가 IAM Role, 태그) 가능. CfCT는 CloudFormation 기반.
