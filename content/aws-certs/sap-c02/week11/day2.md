# Day 2 - 탐지 3총사: Macie·GuardDuty·Inspector의 내부 동작과 경계

보안 탐지를 클라우드에서 처음 설계할 때 가장 큰 함정은 "보안 서비스가 다 비슷해 보인다"는 착각이다. Macie, GuardDuty, Inspector는 이름만으로는 무엇을 탐지하는지 구분되지 않고, SAP-C02 시험은 정확히 이 혼동을 노린다. 핵심은 세 서비스가 **완전히 다른 데이터를, 완전히 다른 방법으로** 본다는 것이다. Macie는 **데이터의 내용**(S3 객체 안에 카드 번호가 있나)을, GuardDuty는 **행동의 이상**(이 계정이 평소 안 하던 짓을 하나)을, Inspector는 **소프트웨어의 결함**(이 EC2에 알려진 취약점이 있나)을 본다.

이 셋을 "내용 · 행동 · 결함"의 삼각형으로 머릿속에 박아두면 시험의 거의 모든 탐지 문제가 풀린다. 오늘은 각 서비스의 내부 동작 원리(ML 분류, 위협 인텔리전스, CVE 매칭)와, 이들이 Security Hub·EventBridge로 묶여 자동 대응 파이프라인이 되는 통합 패턴을 정리한다.

## 한눈에 — 무엇을, 어디서, 어떻게 보는가

| 서비스 | 탐지 대상(어디) | 탐지 내용(무엇) | 탐지 방법(어떻게) |
|--------|----------------|----------------|------------------|
| **Macie** | S3 객체 | PII·PCI·자격증명 등 민감 데이터 | ML 기반 콘텐츠 분류 |
| **GuardDuty** | 계정·네트워크·런타임 | 이상 행동·악성 통신·침해 | 로그 분석 + 위협 인텔 + ML |
| **Inspector** | EC2·ECR·Lambda | CVE·소프트웨어 취약점·네트워크 노출 | CVE 데이터베이스 매칭 |

세 서비스는 **데이터 소스가 겹치지 않는다**. Macie는 S3 객체의 바이트를 읽고, GuardDuty는 VPC Flow Log·CloudTrail·DNS 로그를 읽으며, Inspector는 소프트웨어 인벤토리를 읽는다. 이 "입력의 차이"가 정답을 가르는 핵심이다.

## Macie — S3 안에 무엇이 들었는지 ML로 읽는다

Macie의 본질은 **데이터 분류기(data classifier)**다. S3 버킷의 객체를 샘플링·스캔해 그 안에 민감 데이터가 있는지 머신러닝과 패턴 매칭으로 판별한다. AWS가 미리 학습시킨 **관리형 데이터 식별자(managed data identifiers)**가 신용카드 번호, 미국 SSN, AWS 자격 증명, 여권 번호, 의료 정보 등 수십 종을 인식하고, 정규식·키워드로 **커스텀 식별자**도 정의할 수 있다.

- **민감도 점수(0~100)**: 버킷별로 발견된 민감 데이터의 양·종류로 점수를 매겨 우선순위를 정한다.
- **버킷 인벤토리**: 모든 S3 버킷의 암호화·퍼블릭 액세스·공유 상태를 자동 평가한다(데이터가 노출 가능한 구조인지).
- **Organization 통합**: 위임 관리자 계정에서 전 계정의 S3를 일괄 스캔한다.

> 💡 **관련 이론**: Macie가 "전체 객체를 다 읽지 않고 샘플링한다"는 점이 비용·정확도 트레이드오프의 핵심이다. 페타바이트 버킷의 모든 바이트를 매번 스캔하면 비용이 폭발한다. Macie는 객체 유형·크기에 따라 대표 샘플을 추출해 분류하고, 비용은 **스캔한 데이터량(GB) 단위**로 과금한다. 이것이 통계학의 **표본 추출(sampling)** 원리다 — 모집단(전체 객체) 전수 조사 대신 대표 표본으로 추정한다. 실무에서는 "일회성 전체 스캔으로 베이스라인을 잡고, 이후 신규·변경 객체만 자동 스캔"하는 패턴으로 비용을 통제한다. 시험에서 "Macie 비용 최적화"는 "스캔 범위를 신규/민감 추정 버킷으로 한정"이 정답 방향이다.

> ⚠️ **함정**: "S3에 민감 데이터가 들어있나"는 Macie, "S3에 의심스러운 접근이 있나"는 **GuardDuty S3 Protection**이다. 둘 다 S3를 보지만 차원이 다르다 — Macie는 **객체의 내용**(카드 번호 존재 여부), GuardDuty S3 Protection은 **접근 행동의 이상**(비정상 IP에서 대량 GetObject, 평소 안 쓰던 API). 시험 선택지에 둘이 함께 나오면 "내용 검사 = Macie, 행동 이상 = GuardDuty"로 가른다.

## GuardDuty — 평소와 다른 행동을 위협 인텔과 ML로 잡는다

GuardDuty는 **위협 탐지(threat detection)** 서비스로, 에이전트 설치 없이 AWS가 이미 수집하는 로그를 분석한다. 기본 데이터 소스는 세 가지 — **VPC Flow Logs**(네트워크 메타데이터), **CloudTrail**(API 호출 기록), **DNS Logs**(도메인 조회). 여기에 AWS의 위협 인텔리전스(알려진 악성 IP·도메인·암호화폐 채굴 풀 목록)를 결합하고, ML로 "이 계정의 평소 행동 베이스라인"과 비교해 이상을 탐지한다.

Finding 카테고리: **Recon**(포트 스캔·정찰), **UnauthorizedAccess**(비정상 로그인·자격 증명 탈취 의심), **Backdoor**(C2 서버 통신), **Trojan**, **CryptoCurrency**(채굴 풀 통신), **Impact**(데이터 유출 의심) 등.

기본 외에 **Protection 모듈을 옵트인**해 탐지 범위를 넓힌다(각각 별도 과금):

- **S3 Protection**: S3 데이터 이벤트 분석 — 비정상 접근 행동
- **Malware Protection**: EC2/EBS 디스크를 스냅샷 떠서 멀웨어 스캔 — **에이전트 불필요**
- **EKS Protection**: 쿠버네티스 감사 로그(Audit) + 런타임(Runtime) 모니터링
- **RDS Protection**: RDS 로그인 활동의 이상 탐지
- **Lambda Protection**: Lambda 네트워크 활동 이상

> 🔍 **더 깊이**: GuardDuty의 ML 이상 탐지가 작동하는 방식은 **행동 베이스라이닝(behavioral baselining)**이다. 처음 며칠~몇 주간 계정의 정상 패턴(어느 리전에서, 어느 시간대에, 어떤 API를, 어떤 IAM 주체가 호출하는가)을 학습해 베이스라인을 만든다. 그 후 베이스라인에서 통계적으로 크게 벗어나는 행동(평소 안 쓰던 리전에서 IAM 키 사용, 새벽 3시에 대량 데이터 다운로드)을 "이상"으로 플래그한다. 이것이 시그니처 기반 탐지(알려진 패턴만 잡음)와 다른 **이상 탐지(anomaly detection)**의 강점이다 — 한 번도 본 적 없는 새로운 공격도 "평소와 다름"으로 잡을 수 있다. 트레이드오프: 베이스라인 학습 전이나 정상 행동이 급변할 때 거짓 양성(false positive)이 생긴다.

> 📚 **사례**: 2019년 Capital One 침해는 SSRF(Server-Side Request Forgery) 취약점으로 WAF를 우회해 EC2 인스턴스 메타데이터(IMDS)에서 IAM 역할 자격 증명을 탈취하고, 그 권한으로 S3 버킷 1억 건 이상의 고객 데이터를 유출한 사건이다. 공격자는 탈취한 자격 증명으로 평소 그 역할이 하지 않던 대량 `ListBuckets`·`GetObject`를 수행했다 — 정확히 GuardDuty의 **UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration**과 비정상 데이터 접근 패턴이 잡아낼 수 있는 행동이다. 교훈: 취약점(SSRF)은 Inspector·코드 리뷰가, 자격 증명 탈취 후 비정상 행동은 GuardDuty가 막는 다층 방어가 필요하다. 단일 서비스로는 이 체인을 끊지 못한다. (이후 AWS는 IMDSv2로 SSRF 기반 메타데이터 탈취를 구조적으로 어렵게 만들었다.)

> 🔍 **더 깊이**: GuardDuty Malware Protection의 "에이전트 불필요" 구현이 영리하다. 전통적 안티바이러스는 각 호스트에 에이전트를 설치해야 하는데(운영 부담·성능 영향), GuardDuty는 의심스러운 Finding이 발생한 EC2의 **EBS 볼륨 스냅샷을 떠서 AWS 관리 환경에서 스캔**한다. 호스트의 CPU를 쓰지 않고, 에이전트 배포·패치도 없으며, 공격자가 호스트에 침투해도 스캔 자체를 방해하기 어렵다(별도 환경에서 검사). 트레이드오프: 실시간이 아니라 스냅샷 시점 검사이고, 스캔할 때마다 스냅샷 비용이 든다.

## Inspector — 소프트웨어의 알려진 결함을 CVE로 매칭한다

Inspector(v2)는 **취약점 평가(vulnerability assessment)** 서비스다. EC2·ECR(컨테이너 이미지)·Lambda의 소프트웨어 인벤토리를 수집해 **CVE(Common Vulnerabilities and Exposures) 데이터베이스**와 대조한다. "이 인스턴스에 깔린 OpenSSL 버전이 CVE-2014-0160(Heartbleed)에 해당하는가" 같은 매칭이다.

- **EC2**: SSM Agent를 통해 OS·설치 패키지를 지속(continuous) 스캔. 새 CVE가 공개되면 추가 스캔 없이 자동 재평가.
- **ECR**: 컨테이너 이미지를 푸시할 때 + 주기적으로 재스캔(이미지 안의 OS 패키지·라이브러리 취약점).
- **Lambda**: 함수 코드·레이어의 의존성 취약점 + (선택) 코드 자체의 보안 결함.
- **Risk Score**: CVSS 기본 점수에 환경 컨텍스트(네트워크 노출 여부, 익스플로잇 존재 여부)를 반영해 우선순위 조정.

> 💡 **관련 이론**: CVE는 1999년 MITRE가 시작한 **공개 취약점 식별 체계**다. 각 취약점에 `CVE-연도-순번`(예: CVE-2021-44228, Log4Shell) 고유 ID를 부여해 전 세계가 같은 언어로 취약점을 참조한다. 심각도는 **CVSS(Common Vulnerability Scoring System, 0~10)**로 표준화한다(NIST의 NVD가 점수 관리). Inspector의 가치는 "수천 개 패키지 × 매일 쏟아지는 신규 CVE"를 사람이 일일이 대조할 수 없다는 데서 나온다 — 인벤토리를 자동 수집해 NVD/벤더 피드와 지속 대조한다. 시험에서 "패치 누락·알려진 취약점 자동 탐지"는 Inspector, "탐지된 취약점의 실제 패치 적용"은 Systems Manager Patch Manager(보완 관계)다.

> ⚠️ **함정**: "Inspector가 패치를 적용한다"는 오해. Inspector는 **탐지·평가만** 한다("이 인스턴스에 이런 CVE가 있다"). 실제 **패치 적용**은 **Systems Manager Patch Manager**의 일이다. 시험 시나리오가 "취약점을 찾아라"면 Inspector, "찾은 취약점을 자동으로 패치하라"면 Patch Manager(+ EventBridge로 연동)다. 둘은 보완 관계이지 대체재가 아니다.

> 📚 **사례**: 2021년 12월 Log4Shell(CVE-2021-44228)이 터졌을 때, Java의 Log4j 로깅 라이브러리를 쓰는 거의 모든 서버가 원격 코드 실행에 노출됐다. 문제는 "우리 인프라 어디에 취약한 Log4j 버전이 깔려 있는가"를 아는 것 자체였다 — 수천 개 컨테이너 이미지와 EC2, Lambda 의존성에 묻혀 있었다. Inspector v2를 켜둔 조직은 신규 CVE가 NVD에 등록되자 **추가 스캔 없이 자동으로** 영향 받는 모든 리소스(EC2·ECR 이미지·Lambda 레이어)를 식별할 수 있었다. 교훈: 취약점 대응의 첫 단계는 "어디에 있는지 아는 것"이고, 지속 스캔 + 자동 재평가가 0-day 대응 속도를 결정한다.

## 통합 — Security Hub로 모으고 EventBridge로 자동 대응

세 서비스의 Finding은 각자 따로 보면 운영이 불가능하다. 그래서 **Security Hub**가 모든 Finding을 **ASFF(AWS Security Finding Format)** 표준 스키마로 통합하고, **EventBridge**가 Finding을 트리거로 자동 대응(Lambda·SNS·Step Functions)을 발동한다.

```
Macie Finding     ─┐
GuardDuty Finding ─┼──▶ Security Hub (ASFF 통합) ──▶ EventBridge Rule ──▶ Lambda / SNS / SOAR
Inspector Finding ─┘                                                        (격리·스냅샷·알림)
```

멀티 계정 환경에서는 **Organization 위임 관리자(delegated administrator)** 한 곳에서 전 계정의 탐지 서비스를 일괄 활성화·관리한다. 새 계정이 추가되면 자동으로 포함된다.

> 🎯 **시나리오**: "GuardDuty가 EC2의 자격 증명 탈취 의심(InstanceCredentialExfiltration)을 탐지하면, 사람 개입 없이 즉시 해당 EC2를 격리하고 포렌식용 스냅샷을 떠서 보안팀에 알려라." → **GuardDuty Finding → EventBridge Rule → Lambda**. Lambda가 (1) EC2를 격리 보안 그룹(모든 트래픽 차단)으로 교체, (2) EBS 스냅샷 생성(포렌식 증거 보존), (3) SNS로 보안팀 알림을 수행한다. Security Hub로 Finding을 집계해 가시성을 높이고, 멀티 계정이면 위임 관리자에서 일괄 운영한다. 이 "탐지 → 자동 격리·증거 보존 → 알림"이 클라우드 보안 자동화(SOAR)의 표준 패턴이다.

> 🔍 **더 깊이**: ASFF가 왜 중요한가? GuardDuty·Inspector·Macie·서드파티(F5, Crowdstrike 등)는 각자 다른 형식으로 Finding을 낸다. 이를 SIEM이나 자동화에 넣으려면 형식을 통일해야 하는데, Security Hub가 모두 ASFF(JSON 표준 스키마)로 정규화한다. 덕분에 EventBridge 룰 하나로 출처가 다른 Finding을 일관되게 처리하고, Splunk·외부 SIEM으로 보낼 때도 한 형식만 파싱하면 된다. 이것은 데이터 통합의 **표준 스키마(canonical schema)** 패턴 — N개 소스 × M개 소비자를 N+M 통합으로 줄인다(N×M 어댑터 지옥 회피).

## 정리하며

탐지 3총사는 "내용 · 행동 · 결함"의 삼각형이다 — **Macie**는 S3 객체의 **내용**(민감 데이터)을 ML로 분류하고, **GuardDuty**는 계정·네트워크의 **행동**(이상·악성 통신)을 위협 인텔과 ML로 잡으며, **Inspector**는 소프트웨어의 **결함**(CVE)을 데이터베이스 매칭으로 평가한다. 데이터 소스가 겹치지 않는다는 점(S3 바이트 vs 로그 vs 인벤토리)이 정답을 가른다. 이들은 Security Hub로 ASFF 통합되고 EventBridge로 자동 대응한다.

SAP 시험 단골 매핑: (1) "S3에 카드 번호·SSN 저장 여부" → **Macie**, (2) "S3 비정상 접근 행동" → **GuardDuty S3 Protection**(Macie 아님), (3) "EC2 ↔ 악성 IP 통신·자격 증명 탈취" → **GuardDuty**, (4) "EC2·컨테이너·Lambda의 CVE 자동 탐지" → **Inspector v2**, (5) "탐지된 취약점 패치 적용" → **Patch Manager**(Inspector 아님), (6) "EKS 런타임 의심 동작" → **GuardDuty EKS Protection**, (7) "에이전트 없이 EC2 멀웨어 스캔" → **GuardDuty Malware Protection**, (8) "모든 계정 Finding 통합" → **Security Hub + 위임 관리자**. 다음 day는 이 Finding들을 모으는 통합 관제(Security Hub·Detective·Audit Manager)를 본다.

---

## 📝 연습 문제

**문제 1.** S3 버킷에 신용카드 번호나 SSN 같은 민감 데이터가 저장된 적이 있는지 자동으로 탐지·분류하고, 버킷별 민감도 점수로 우선순위를 매기고 싶다. 가장 적합한 것은?

A) GuardDuty S3 Protection

B) Macie

C) Inspector v2

D) Config Rule

**정답: B**
해설: Macie는 ML 기반으로 S3 객체의 내용을 스캔해 PII·PCI·자격 증명 등 민감 데이터를 분류하고 버킷별 민감도 점수(0~100)를 매긴다. A(GuardDuty S3 Protection)는 객체 내용이 아니라 "접근 행동의 이상"을 탐지한다(비정상 IP에서 대량 다운로드 등) — 콘텐츠 검사가 아니다. C(Inspector)는 EC2·ECR·Lambda의 CVE 취약점 스캔이다. D(Config Rule)는 리소스 설정 평가이지 객체 내용 분류가 아니다. 함정: "S3 내용에 민감 데이터" = Macie, "S3 접근 행동 이상" = GuardDuty.

---

**문제 2.** EC2 인스턴스가 알려진 악성 IP와 통신하고, 평소 사용하지 않던 리전에서 IAM 자격 증명이 사용되는 등 이상 행동을 에이전트 설치 없이 탐지해야 한다. 가장 적합한 것은?

A) Inspector v2

B) GuardDuty

C) Macie

D) AWS WAF

**정답: B**
해설: GuardDuty는 VPC Flow Log·CloudTrail·DNS 로그를 분석하고 AWS 위협 인텔리전스(악성 IP 목록) + ML 행동 베이스라이닝으로 이상을 탐지한다. 에이전트 설치가 필요 없다. A(Inspector)는 소프트웨어 취약점(CVE) 평가이지 네트워크·행동 이상 탐지가 아니다. C(Macie)는 S3 데이터 분류. D(WAF)는 L7 웹 요청 필터링이지 계정·네트워크 행동 분석이 아니다. 함정: "악성 IP 통신·비정상 행동·에이전트 없음" = GuardDuty.

---

**문제 3.** 수백 개의 컨테이너 이미지(ECR)와 EC2, Lambda 함수에서 알려진 CVE 취약점을 지속적으로 자동 탐지하고, 신규 CVE가 공개되면 추가 스캔 없이 자동 재평가되어야 한다. 가장 적합한 것은?

A) GuardDuty

B) Inspector v2

C) Macie

D) Systems Manager Patch Manager

**정답: B**
해설: Inspector v2는 EC2·ECR·Lambda의 소프트웨어 인벤토리를 CVE 데이터베이스와 지속 대조하며, 신규 CVE가 NVD에 등록되면 추가 스캔 없이 영향 리소스를 자동 재평가한다. A(GuardDuty)는 행동·위협 탐지이지 CVE 평가가 아니다. C(Macie)는 S3 데이터. D(Patch Manager)는 패치를 "적용"하는 도구이지 취약점을 "탐지·평가"하는 도구가 아니다. 함정: "CVE 자동 탐지·재평가" = Inspector, "패치 적용" = Patch Manager.

---

**문제 4.** EKS 클러스터에서 Pod의 런타임 의심 동작(권한 상승 시도, 의심 프로세스 실행)을 탐지해야 한다. 가장 적합한 것은?

A) Inspector ECR 스캔

B) GuardDuty EKS Protection (Runtime Monitoring)

C) Macie

D) Config

**정답: B**
해설: GuardDuty EKS Protection은 쿠버네티스 감사 로그(Audit)와 런타임(Runtime Monitoring)을 분석해 Pod의 런타임 의심 동작을 탐지한다. A(Inspector ECR)는 이미지의 정적 CVE 취약점을 스캔하지만 런타임 행동은 보지 못한다. C(Macie)는 S3 데이터. D(Config)는 설정 평가. 함정: "EKS 이미지 취약점(정적)" = Inspector ECR, "EKS 런타임 행동(동적)" = GuardDuty EKS Protection.

---

**문제 5.** GuardDuty가 EC2 자격 증명 탈취 의심을 탐지하면 사람 개입 없이 즉시 해당 EC2를 격리하고, 포렌식 스냅샷을 생성하고, 보안팀에 알림을 보내야 한다. 어떤 구성인가?

A) GuardDuty Finding → SNS만

B) GuardDuty Finding → EventBridge Rule → Lambda(격리 SG 교체 + 스냅샷 + SNS)

C) Macie → Security Hub

D) Inspector → Patch Manager

**정답: B**
해설: GuardDuty Finding을 EventBridge Rule이 트리거로 받아 Lambda를 실행해, EC2를 격리 보안 그룹으로 교체하고 EBS 스냅샷을 떠서 증거를 보존하며 SNS로 알린다 — 탐지 → 자동 격리·증거 보존 → 알림의 표준 SOAR 패턴. A(SNS만)는 알림만 하고 자동 격리·증거 보존이 없다. C·D는 시나리오(EC2 자격 증명 탈취 자동 대응)와 무관. 함정: "탐지 후 자동 격리·증거 보존"은 EventBridge → Lambda 자동화.

---

**문제 6.** 50개 계정으로 구성된 Organization에서 GuardDuty·Inspector·Macie를 모든 계정에 일괄 활성화하고, 신규 계정도 자동 포함되며, 모든 Finding을 한 콘솔에서 통합 관리하고 싶다. 가장 적합한 구성은?

A) 계정마다 수동으로 각 서비스 활성화

B) Organization 위임 관리자 + Security Hub 통합

C) 각 계정의 Finding을 S3로 내보내 ETL

D) CloudTrail만 활성화

**정답: B**
해설: 각 탐지 서비스의 Organization 위임 관리자(delegated administrator)에서 전 계정 일괄 활성화·관리가 가능하고 신규 계정이 자동 포함되며, Security Hub가 모든 Finding을 ASFF로 통합해 단일 콘솔에서 본다. A는 50개 계정 수동 관리가 비현실적이고 신규 계정 자동 포함이 안 된다. C는 통합·자동화가 빈약하고 운영 부담이 크다. D(CloudTrail)는 API 로그일 뿐 탐지·통합이 아니다. 함정: "멀티 계정 일괄 + 신규 자동 + 통합 콘솔"은 위임 관리자 + Security Hub.

---

**문제 7.** EC2의 EBS 디스크에 멀웨어가 있는지 검사하되, 인스턴스에 에이전트를 설치하지 않고 호스트 성능에도 영향을 주지 않아야 한다. 가장 적합한 것은?

A) 각 EC2에 ClamAV 에이전트 설치

B) GuardDuty Malware Protection

C) Inspector v2

D) Macie

**정답: B**
해설: GuardDuty Malware Protection은 의심 Finding이 발생한 EC2의 EBS 볼륨 스냅샷을 떠서 AWS 관리 환경에서 멀웨어를 스캔한다 — 호스트에 에이전트 불필요, CPU 영향 없음. A는 에이전트 설치·관리 부담이 있어 요건("에이전트 없이")에 어긋난다. C(Inspector)는 CVE 취약점 평가이지 멀웨어 스캔이 아니다. D(Macie)는 S3 데이터 분류. 함정: "에이전트 없이 EC2 멀웨어 스캔"은 GuardDuty Malware Protection.
