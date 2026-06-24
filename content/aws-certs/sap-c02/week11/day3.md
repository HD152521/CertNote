# Day 3 - 통합 관제: Security Hub·Detective·Audit Manager의 역할 분담

탐지 서비스(Macie·GuardDuty·Inspector)를 다 켜고 나면 새로운 문제가 생긴다. "Finding이 하루에 수천 건씩 쏟아지는데, 이걸 누가 어떻게 보나?" 그리고 한 단계 더 — "보안 사고가 났을 때 무슨 일이 있었는지 어떻게 추적하나?", "감사관이 PCI DSS 증거를 요구하면 어떻게 모으나?" 이 세 가지 운영 질문에 답하는 게 **Security Hub(통합·자세 평가)**, **Detective(사건 조사)**, **Audit Manager(감사 증거)**다.

이 셋도 이름이 비슷해 헷갈리지만, 역할은 명확히 갈린다. Security Hub는 **현재 상태를 본다**(지금 우리 보안 자세가 어떤가, 표준을 지키나). Detective는 **과거를 추적한다**(이 사건이 어떻게 일어났나). Audit Manager는 **증거를 모은다**(규제 준수를 어떻게 증명하나). "현재 · 과거 · 증명"의 세 시제로 구분하면 시험의 통합 관제 문제가 풀린다. 오늘은 각 서비스의 내부 동작과, Config·CloudTrail이 이들의 데이터 근간이 되는 관계를 정리한다.

## Security Hub — CSPM과 표준 점검, 그리고 Finding의 단일 창구

Security Hub의 역할은 두 가지다. 첫째 **CSPM(Cloud Security Posture Management)** — 계정의 리소스 설정을 보안 표준과 자동 대조해 "우리 보안 자세가 표준에 얼마나 부합하나"를 점수와 함께 평가한다. 둘째 **Finding 통합 허브** — GuardDuty·Inspector·Macie·IAM Access Analyzer·Firewall Manager 등 모든 보안 서비스와 서드파티의 Finding을 **ASFF(AWS Security Finding Format)** 단일 스키마로 모은다.

자동 점검하는 표준:

- **AWS Foundational Security Best Practices(FSBP)** — AWS가 정의한 기본 보안 권고
- **CIS AWS Foundations Benchmark** — 업계 표준 보안 벤치마크
- **PCI DSS** — 카드 결제 산업 보안 표준
- **NIST SP 800-53** — 미국 연방 보안 통제 프레임워크

> 💡 **관련 이론**: CSPM은 보안 업계에서 정의된 제품 카테고리다. 핵심 임무는 **configuration drift(설정 일탈) 탐지 + 표준 위반 식별** — 클라우드 리소스가 시간이 지나며 안전한 기준선에서 벗어나는 것을 자동으로 잡는다. Security Hub는 AWS 네이티브 CSPM이고, 같은 카테고리의 서드파티로 Wiz, Prisma Cloud, Lacework, Orca가 있다. 멀티클라우드 환경(AWS+Azure+GCP)은 보통 서드파티 CSPM을 함께 쓴다 — 한 콘솔에서 여러 클라우드의 자세를 통합 평가하기 위해서다. 시험에서 "AWS 단일 클라우드 + CIS/PCI 자동 점검 + 통합 대시보드"는 Security Hub가 정답이다.

> 🔍 **더 깊이**: Security Hub의 표준 점검 대부분은 내부적으로 **AWS Config Rule**을 실행한다. 예를 들어 "S3 버킷 퍼블릭 액세스 차단 여부" 점검은 Config의 `s3-bucket-public-read-prohibited` 룰로 평가된다. 그래서 Security Hub의 보안 표준을 켜면 연관된 Config Rule들이 자동 배포되고, **Config가 비활성이면 Security Hub의 많은 점검이 작동하지 않는다**. 이 의존성이 시험에 종종 나온다 — "Security Hub 점검이 'No data'로 나온다"의 원인은 보통 Config 미활성화다. Config가 리소스 변경을 기록·평가하는 엔진이고, Security Hub는 그 결과를 보안 관점으로 집계·표준화하는 상위 레이어다.

## Detective — 그래프로 사건의 인과를 추적한다

GuardDuty가 "악성 IP와 통신함"이라는 Finding을 던졌다고 하자. 그래서 **무슨 일이 일어난 건가?** 그 EC2가 언제부터, 누구의 자격 증명으로, 어떤 리소스와, 얼마나 많이 통신했나? 이 깊이 있는 조사가 **Detective**의 영역이다.

Detective는 VPC Flow Logs·CloudTrail·GuardDuty Finding·EKS 감사 로그를 **자동으로 수집·연결해 행동 그래프(behavior graph)**를 만든다. Finding을 클릭하면 관련 엔티티(IP·역할·인스턴스·계정)들이 시간축 위에서 어떻게 상호작용했는지 시각화된다. 사람이 여러 로그를 수동으로 조인할 필요 없이, "이 자격 증명의 평소 활동 vs 사건 시점 활동"을 비교해 이상의 맥락을 보여준다.

- **그래프 분석**: 엔티티 간 관계를 노드·엣지로 시각화
- **시간축 기반**: "언제부터 행동이 달라졌나"를 추적
- **자동 데이터 통합**: 추가 설정 없이 소스 로그를 끌어옴
- **GuardDuty 연동**: Finding에서 바로 Detective 조사로 점프

> 💡 **관련 이론**: Detective의 그래프 분석은 **그래프 이론(graph theory)**을 보안 조사에 적용한 것이다. 보안 사건은 본질적으로 "엔티티 간 관계의 비정상 패턴"이다 — 평소 연결이 없던 노드(외부 IP)와 갑자기 강하게 연결된 노드(내부 인스턴스), 짧은 시간에 폭증한 엣지(대량 API 호출). 그래프로 모델링하면 이런 이상 연결이 시각적으로 드러난다. 이는 사기 탐지(fraud detection)·소셜 네트워크 분석과 같은 기법 — 개별 이벤트가 아니라 **연결의 구조**를 본다. 단순 로그 나열로는 안 보이는 "공격 경로(attack path)"가 그래프에서는 한눈에 보인다.

> ⚠️ **함정**: Security Hub와 Detective의 경계. Security Hub는 "무엇이 잘못됐나"(Finding 집계·표준 점검)를 보여주지만 "왜·어떻게 일어났나"의 깊은 조사는 하지 못한다. 그 조사가 Detective다. 시험에서 "특정 IAM 사용자의 활동을 시계열로 시각화해 사건의 근본 원인을 조사"는 Detective, "모든 계정의 보안 표준 준수 현황 대시보드"는 Security Hub다. 둘은 대체재가 아니라 보완(탐지·집계 → 조사) 관계다.

## Audit Manager — 컴플라이언스 증거를 자동으로 모은다

감사(audit)는 "우리가 규제를 지킨다"는 것을 **증거로 증명**하는 일이다. PCI DSS·HIPAA·SOC 2 같은 표준은 수백 개의 통제(control)를 요구하고, 각 통제마다 "정말 지키고 있다"는 증거(스크린샷·설정·로그)를 모아 감사관에게 제출해야 한다. 이걸 수동으로 하면 분기마다 보안팀이 몇 주를 쏟는다. **Audit Manager**가 이 증거 수집을 자동화한다.

- **사전 빌드 프레임워크**: PCI DSS·HIPAA·SOC 2·GDPR·NIST·FedRAMP 등 표준의 통제 구조를 미리 제공
- **자동 증거 수집**: 각 통제에 매핑된 **CloudTrail 로그·Config 스냅샷·Security Hub Finding·API 응답**을 자동으로 수집해 증거로 첨부
- **감사 보고서 생성**: 감사관 제출용 보고서를 자동 패키징
- **커스텀 프레임워크**: 자사 내부 통제 기준도 정의 가능

> 🔍 **더 깊이**: Audit Manager가 Security Hub와 다른 결정적 지점은 **시점(point-in-time) vs 지속(continuous)**이다. Security Hub는 "지금 이 순간 표준을 지키나"를 실시간으로 본다. Audit Manager는 "감사 기간 동안 지속적으로 지켰음을 증명하는 증거를 시간에 걸쳐 축적"한다. 감사는 "현재 상태"가 아니라 "기간 내 지속 준수"를 요구하기 때문이다 — 감사 전날만 설정을 고쳐선 안 되고, 분기 내내 통제가 작동했다는 타임스탬프 증거가 필요하다. 그래서 Audit Manager는 CloudTrail(누가 언제 무엇을)과 Config(설정이 시간에 따라 어떻게 변했나)를 증거 소스로 삼는다. 시험에서 "감사관 제출용 증거 자동 수집·보고서"는 Audit Manager, "실시간 표준 점검"은 Security Hub다.

> 📚 **사례**: 한 헬스케어 SaaS는 HIPAA 감사를 매년 받았는데, 통제별 증거(접근 로그, 암호화 설정, 백업 정책 등 수백 항목)를 엔지니어들이 수동으로 캡처·정리하느라 매번 3~4주를 소모했다. Audit Manager의 HIPAA 프레임워크를 활성화하니, 각 통제에 매핑된 CloudTrail·Config·Security Hub 증거가 **자동으로 수집·타임스탬프와 함께 축적**됐고, 감사 시점에 보고서를 버튼 한 번으로 생성했다. 준비 기간이 3~4주에서 며칠로 줄었다. 교훈: 감사의 비용은 "통제를 지키는 것"보다 "지켰음을 증명하는 증거 수집"에 있고, Audit Manager는 그 증거 파이프라인을 자동화한다.

> 📚 **사례**: 한 보안 스타트업이 Security Hub만 켜두고 Detective 없이 운영하다 침해를 겪었다. Security Hub는 "GuardDuty가 의심 IAM 활동을 탐지함"이라는 Finding을 보여줬지만, "그래서 그 자격 증명이 정확히 무엇을 했고 어디까지 번졌나"를 알려면 CloudTrail·VPC Flow Log를 며칠간 수동으로 조인해야 했다. 조사가 늦어지는 사이 공격자는 추가 리소스로 횡이동(lateral movement)했다. 이후 Detective를 도입하니 Finding 클릭 한 번으로 자격 증명의 시간축 활동 그래프가 떠 횡이동 경로를 즉시 파악했다. 교훈: Security Hub(탐지·집계)와 Detective(조사)는 대체재가 아니라 순차적 보완이다 — 탐지는 "무엇이"를, 조사는 "어떻게·어디까지"를 답한다.

## 데이터 근간 — Config와 CloudTrail Lake

세 통합 서비스는 모두 **Config**와 **CloudTrail**이라는 두 기반 위에 선다.

**Config**는 "리소스 설정의 변경을 기록하고 규칙으로 평가"하는 엔진이다. Config Rule이 "S3가 퍼블릭인가", "EBS가 암호화됐나" 같은 컴플라이언스를 자동 평가하고, 이 결과가 Security Hub 점검과 Audit Manager 증거의 핵심 소스가 된다. Config가 없으면 상위 레이어의 많은 기능이 빈다.

**CloudTrail Lake**는 CloudTrail 이벤트를 **SQL로 쿼리 가능한 데이터 저장소**로 만든 기능이다. "지난 90일간 특정 IAM 역할이 호출한 모든 `DeleteBucket`을 찾아라" 같은 임의 조사를 SQL로 직접 한다. Detective(그래프 시각화)와 보완 관계 — Lake는 쿼리, Detective는 시각화에 강하다.

> 🔍 **더 깊이**: Config와 CloudTrail은 "무엇을 기록하나"가 근본적으로 다르다. **Config는 리소스의 상태(state)**를 본다 — "이 S3 버킷이 지금 퍼블릭인가, 어제와 비교해 설정이 어떻게 바뀌었나"(설정 스냅샷의 시계열). **CloudTrail은 행위(action)**를 본다 — "누가 언제 어떤 API를 호출했나"(이벤트의 흐름). 보안 조사에는 둘 다 필요하다 — Config로 "지금 잘못된 설정"을 찾고, CloudTrail로 "누가 그 설정을 언제 바꿨나"를 추적한다. 예: S3가 갑자기 퍼블릭이 됐다면, Config가 "퍼블릭 상태 변화"를 플래그하고 CloudTrail이 "누가 `PutBucketAcl`을 호출했나"를 알려준다. 이 상태(Config) + 행위(CloudTrail)의 조합이 모든 상위 보안 서비스의 데이터 토대다.

> ⚠️ **함정**: CloudTrail Lake vs Athena over S3 logs vs CloudWatch Logs Insights를 혼동하기 쉽다. 셋 다 로그를 쿼리하지만 — **CloudTrail Lake**는 CloudTrail 이벤트 전용 관리형 SQL 저장소(설정 0, 즉시 쿼리)다. **Athena**는 S3에 쌓인 CloudTrail 로그를 쿼리할 수 있지만 테이블·파티션을 직접 구성하는 ETL 부담이 있다. **CloudWatch Logs Insights**는 CloudWatch Logs(애플리케이션·시스템 로그)용이지 CloudTrail 이벤트 저장소가 아니다. 시험에서 "CloudTrail 이벤트를 임의 SQL로 조사"는 가장 직접적인 CloudTrail Lake가 정답이다.

| 도구 | 핵심 역할 | 형태 |
|------|----------|------|
| **Config** | 리소스 설정 변경 기록·규칙 평가 | 컴플라이언스 평가 엔진 |
| **CloudTrail** | API 호출(누가 언제 무엇) 기록 | 감사 로그 |
| **CloudTrail Lake** | CloudTrail 이벤트 SQL 쿼리 | 분석 가능 저장소 |

> 🎯 **시나리오**: "여러 계정의 보안을 운영한다. (1) 모든 계정의 CIS·PCI 표준 준수 현황을 단일 대시보드로 보고, (2) GuardDuty가 의심 Finding을 내면 관련 리소스의 행동을 시계열로 깊이 조사하며, (3) 연 1회 HIPAA 감사용 증거를 자동 수집해야 한다. 어떻게 구성하나?" → (1) **Security Hub**(표준 점검·Finding 통합, Org 위임 관리자), (2) **Detective**(GuardDuty 연동 그래프 조사), (3) **Audit Manager**(HIPAA 프레임워크 증거 자동 수집). 세 서비스가 각각 "현재 자세 · 과거 사건 · 준수 증명"을 담당하고, 그 아래 Config·CloudTrail이 데이터를 공급한다. 함정: 셋을 하나로 묶으려 하면 안 된다 — 역할이 다르므로 조합한다.

## 통합 SOC 아키텍처

```
[GuardDuty]   [Inspector]   [Macie]   [IAM Access Analyzer]
     │            │            │            │
     └────────────┴────────────┴────────────┘
                       │  (ASFF 통합)
                       ▼
              [Security Hub]  ◀── (표준 점검: Config Rule 기반)
                       │
        ┌──────────────┼───────────────┐
        ▼              ▼               ▼
   [Detective]    [EventBridge]   [Audit Manager]
   (그래프 조사)    (자동 대응)      (감사 증거·보고서)
                       │
                [Lambda · SNS · SOAR]

   기반 데이터: Config(설정 변경) + CloudTrail/Lake(API 로그)
```

## 정리하며

통합 관제는 "현재 · 과거 · 증명"의 세 시제다 — **Security Hub**는 **현재** 보안 자세를 표준(CIS·PCI·NIST)으로 점검하고 모든 Finding을 ASFF로 통합하며, **Detective**는 **과거** 사건을 그래프로 추적해 근본 원인을 조사하고, **Audit Manager**는 컴플라이언스 준수를 **증명**할 증거를 자동 수집한다. 이 모두의 데이터 근간은 Config(설정 평가)와 CloudTrail(API 로그)이며, Security Hub의 표준 점검 다수가 Config Rule로 구현된다.

SAP 시험 단골 매핑: (1) "멀티 계정 CIS·PCI 자동 점검 + 통합 대시보드" → **Security Hub**, (2) "IAM 사용자 활동 시계열 시각화·사건 근본 원인 조사" → **Detective**, (3) "HIPAA·PCI 감사 증거 자동 수집·보고서" → **Audit Manager**, (4) "리소스 비준수 자동 평가" → **Config Rule**, (5) "CloudTrail 이벤트 SQL 쿼리" → **CloudTrail Lake**, (6) "Security Hub 점검이 No data" → Config 미활성화, (7) "Finding을 외부 SIEM으로" → EventBridge → Kinesis/Lambda. 다음 day는 엣지 보안(WAF·Shield·Firewall Manager)을 본다.

---

## 📝 연습 문제

**문제 1.** 30개 계정으로 구성된 Organization에서 CIS와 PCI DSS 표준 준수 현황을 자동 점검하고, GuardDuty·Inspector·Macie의 Finding을 단일 대시보드로 통합 관리하고 싶다. 가장 적합한 것은?

A) Trusted Advisor

B) Security Hub (Org 위임 관리자)

C) Audit Manager

D) Detective

**정답: B**
해설: Security Hub는 CIS·PCI·NIST·FSBP 표준을 자동 점검하고 모든 보안 서비스 Finding을 ASFF로 통합하며, Org 위임 관리자에서 전 계정을 일괄 관리한다. A(Trusted Advisor)는 일반 모범 사례 점검이지 보안 표준(CIS/PCI) 통합 점검·Finding 허브가 아니다. C(Audit Manager)는 감사 증거 수집이지 실시간 표준 점검·대시보드가 아니다. D(Detective)는 사건 조사 도구다. 함정: "표준 자동 점검 + Finding 통합 대시보드"는 Security Hub.

---

**문제 2.** GuardDuty가 한 EC2의 자격 증명 탈취 의심을 탐지했다. 이 인스턴스가 언제부터, 어떤 자격 증명으로, 어떤 리소스와 통신했는지 시계열 그래프로 깊이 조사해 근본 원인을 파악해야 한다. 가장 적합한 것은?

A) CloudTrail 콘솔에서 수동 로그 검색

B) Detective

C) X-Ray

D) Macie

**정답: B**
해설: Detective는 VPC Flow Log·CloudTrail·GuardDuty Finding을 자동 통합해 행동 그래프를 만들고, 엔티티 간 관계와 시간축 변화를 시각화해 사건의 근본 원인 조사를 돕는다. GuardDuty Finding에서 바로 점프할 수 있다. A(수동 로그 검색)는 여러 로그를 사람이 조인해야 해 느리고 누락이 쉽다. C(X-Ray)는 애플리케이션 분산 추적이지 보안 조사가 아니다. D(Macie)는 S3 데이터 분류. 함정: "사건의 시계열·관계 시각화·근본 원인 조사"는 Detective.

---

**문제 3.** 연 1회 HIPAA 감사를 위해 각 통제별 증거(접근 로그, 암호화 설정, 백업 정책 등)를 감사 기간에 걸쳐 자동 수집하고 감사관 제출용 보고서를 생성해야 한다. 가장 적합한 것은?

A) Security Hub

B) Audit Manager

C) Config

D) Inspector

**정답: B**
해설: Audit Manager는 HIPAA 등 사전 빌드 프레임워크의 통제별로 CloudTrail·Config·Security Hub 증거를 자동 수집·타임스탬프와 함께 축적하고 감사 보고서를 생성한다. A(Security Hub)는 현재 시점 표준 점검이지 기간 내 지속 준수 증거 축적·보고서 자동화가 아니다. C(Config)는 평가 엔진이지 감사 보고서 패키징이 아니다(증거 소스 역할). D(Inspector)는 취약점 스캔. 함정: "감사 증거 자동 수집 + 보고서"는 Audit Manager, "실시간 점검"은 Security Hub.

---

**문제 4.** Security Hub의 보안 표준 점검 다수가 "No data" 상태로 나온다. 가장 가능성 높은 원인은?

A) GuardDuty가 비활성화되어 있다

B) AWS Config가 비활성화되어 표준 점검의 근간인 Config Rule이 평가되지 않는다

C) Macie가 비활성화되어 있다

D) CloudFront가 없다

**정답: B**
해설: Security Hub의 표준 점검 다수는 내부적으로 Config Rule로 구현된다. Config가 비활성이면 연관 Config Rule이 리소스를 평가하지 못해 점검 결과가 "No data"가 된다. 해결은 해당 계정·리전에서 Config를 활성화하는 것이다. A·C는 특정 탐지 서비스 Finding 통합에 영향을 줄 뿐 표준 점검의 근간이 아니다. D는 무관. 함정: "Security Hub 점검 No data"의 전형적 원인은 Config 미활성화.

---

**문제 5.** 지난 90일간 특정 IAM 역할이 호출한 모든 `DeleteBucket` API를 SQL로 임의 조회해 사건을 조사하고 싶다. 가장 적합한 것은?

A) Athena over raw S3 CloudTrail logs (직접 ETL)

B) CloudTrail Lake

C) CloudWatch Logs Insights

D) Detective

**정답: B**
해설: CloudTrail Lake는 CloudTrail 이벤트를 SQL로 직접 쿼리 가능한 관리형 데이터 저장소로, 임의 조건의 이벤트 조사를 가장 직접적으로 수행한다. A(Athena)는 가능하지만 S3로 로그를 모으고 테이블·파티션을 직접 구성하는 ETL 부담이 있다. C(Logs Insights)는 CloudWatch Logs용 쿼리이지 CloudTrail 이벤트 저장소에 최적화돼 있지 않다. D(Detective)는 그래프 시각화에 강하지 임의 SQL 쿼리 도구가 아니다. 함정: "CloudTrail 이벤트 SQL 쿼리"는 CloudTrail Lake.

---

**문제 6.** Security Hub의 모든 Finding을 외부 SIEM(예: Splunk)으로 실시간 전송해 SOC에서 통합 분석하려고 한다. 가장 적합한 구성은?

A) S3로 Export 후 야간 배치 ETL

B) Security Hub → EventBridge Rule → Kinesis Data Firehose/Lambda → SIEM

C) Config Snapshot 전송

D) CloudWatch Metric 알람

**정답: B**
해설: Security Hub Finding은 ASFF로 정규화돼 EventBridge로 흐르고, EventBridge Rule이 이를 Kinesis Data Firehose나 Lambda로 보내 SIEM에 실시간 전달한다. ASFF 단일 스키마라 SIEM 파싱이 일관된다. A(야간 배치)는 실시간이 아니고 운영 부담이 크다. C(Config Snapshot)는 설정 스냅샷이지 보안 Finding 스트림이 아니다. D(Metric 알람)는 임계값 알림이지 Finding 전체 전송이 아니다. 함정: "Finding 실시간 SIEM 전송"은 EventBridge 기반 스트리밍.
