# Day 55 - 보안 종합: 암호화·탐지·통합 관제·엣지 방어를 한 시나리오로

AWS 보안은 단일 서비스로 끝나지 않는다. 11주차에 본 모든 것이 **4개 레이어**로 쌓인다 — **암호화(KMS·CloudHSM)**, **탐지(Macie·GuardDuty·Inspector)**, **통합 관제(Security Hub·Detective·Audit Manager)**, **엣지 방어(WAF·Shield·Firewall Manager·Network Firewall·DNS Firewall)**. production-grade 보안은 이 4개가 유기적으로 결합돼야 완성된다. 그리고 SAP-C02 시험의 보안 시나리오는 거의 항상 **한 문제에 여러 레이어가 동시에 출현**한다 — "데이터를 암호화하고(L1), 위협을 탐지하며(L2), 사고를 조사하고(L3), 엣지를 방어하라(L4)".

오늘은 이 4 레이어를 한 시나리오로 묶어 복습하고, Pro 시험에서 가장 자주 충돌하는 함정(Macie vs GuardDuty vs Inspector, Shield Standard vs Advanced, Network Firewall vs DNS Firewall, Security Hub vs Detective vs Audit Manager)을 키워드 → 정답 매핑으로 못 박는다. 핵심은 "비슷한 이름이 다른 역할"이라는 것이다.

## 보안 4 레이어의 큰 그림

```
[Internet]
    │
─── L4 엣지 방어 ──────────────────────────────────
   Route 53(DNS Firewall) → CloudFront(WAF+Shield) → ALB(WAF)
   → VPC(Network Firewall) / Firewall Manager(Org 일괄)
    │
─── L1 암호화 ────────────────────────────────────
   KMS(봉투 암호화·MRK) / CloudHSM(FIPS L3) — 저장·전송 데이터 보호
    │
─── L2 탐지 ──────────────────────────────────────
   Macie(S3 내용) / GuardDuty(행동) / Inspector(취약점)
    │
─── L3 통합 관제 ─────────────────────────────────
   Security Hub(현재 자세) / Detective(과거 조사) / Audit Manager(준수 증명)
   ── 기반: Config(설정 평가) + CloudTrail(API 로그)
```

> 💡 **관련 이론**: 이 4 레이어 구조는 보안의 **defense in depth(다층 방어)** 원칙의 구현이다. NIST SP 800-53과 사이버 킬 체인 모델이 공통으로 강조하는 바 — 단일 통제는 반드시 뚫린다는 전제하에 여러 독립 계층을 쌓아 한 계층이 뚫려도 다음이 막게 한다. 2019년 Capital One 침해가 이를 역설적으로 증명한다: WAF 오설정(L4) → SSRF로 IMDS 자격 증명 탈취 → S3 대량 유출. 만약 GuardDuty(L2, 비정상 행동 탐지)와 더 엄격한 IAM 최소 권한이 함께 작동했다면 체인이 끊겼을 것이다. Pro 시험이 "한 시나리오에 여러 레이어"를 묻는 이유가 이것이다 — 실무 보안은 레이어 하나로 끝나지 않는다.

## Layer 1: 암호화 — KMS · CloudHSM

| 종류 | 키 소유 | 자동 로테이션 | 핵심 용도 |
|------|---------|----------------|-----------|
| AWS Managed Key | AWS | 1년 자동(강제) | 서비스 기본 암호화 |
| Customer Managed Key (CMK) | 고객 | 활성화 가능 | 정책·회전·감사 통제 |
| Multi-Region Key (MRK) | 고객 | 가능 | Cross-Region DR·복호화 |
| Imported (BYOK) | 고객(외부) | **불가** | 키 출처 통제·컴플라이언스 |
| CloudHSM-backed | 고객(전용 HSM) | 가능 | FIPS 140-2 L3·단일 테넌트 |

핵심 재확인 — KMS는 **봉투 암호화**로 작동한다. 마스터 키(CMK)는 HSM을 떠나지 않고, `GenerateDataKey`로 받은 DEK가 실제 데이터를 로컬 암호화하며, 암호화된 DEK만 데이터와 함께 저장된다. 권한은 **Key Policy(루트) + IAM 위임 + Grant(임시)**의 3중 체크.

> 🔍 **더 깊이**: KMS 키 종류 선택은 "통제권 vs 운영 부담"의 거래다. AWS Managed Key는 운영 부담 0이지만 정책·회전 통제가 거의 없다. CMK는 완전 통제를 주지만 키당 월 $1과 정책 관리 책임이 따른다. BYOK는 키 출처를 완전히 통제하지만 자동 로테이션을 포기한다. CloudHSM은 단일 테넌트·FIPS L3을 주지만 클러스터 운영(HA·백업·사용자 관리) 부담이 크다. 시험은 이 거래의 균형점을 묻는다 — "정책·감사 통제"면 CMK, "외부 생성+만료"면 BYOK, "단일 테넌트+L3"면 CloudHSM, 특별한 요구가 없으면 기본값이 최선.

> 📚 **사례**: 한 핀테크가 BYOK으로 자사 HSM에서 생성한 키를 KMS에 import해 사용했다. 장점은 키 머터리얼이 자사 HSM에 영구 보관되어 AWS가 영구 회수 불가(KMS는 캐시만 보관, 만료 시 삭제). 단점은 자동 로테이션이 안 돼 회전 때마다 직접 재import해야 했다. 교훈: BYOK는 통제권을 얻는 대신 운영 부담과 자동 로테이션을 내주는 거래다.

> ⚠️ **함정**: "IAM Policy만으로 KMS 권한 부여"는 오답이다. Key Policy에 계정 루트로의 IAM 위임이 없으면 IAM 권한이 무효다. 또 "키 즉시 삭제"도 불가 — KMS는 7~30일 PendingDeletion 유예를 강제한다(키 삭제 = 데이터 영구 손실이므로).

## Layer 2: 탐지 3총사 — 내용 · 행동 · 결함

| 서비스 | 본다 | 데이터 소스 | 방법 |
|--------|------|------------|------|
| **Macie** | S3 객체의 **내용**(PII/PCI) | S3 객체 바이트 | ML 콘텐츠 분류 |
| **GuardDuty** | 계정·네트워크의 **행동** | VPC FL·CloudTrail·DNS | 위협 인텔 + ML |
| **Inspector v2** | 소프트웨어의 **결함**(CVE) | EC2·ECR·Lambda 인벤토리 | CVE 데이터베이스 매칭 |

이 셋은 **데이터 소스가 겹치지 않는다** — Macie는 객체 바이트, GuardDuty는 로그, Inspector는 인벤토리. 이 차이가 정답을 가른다.

> 🎯 **시나리오**: "S3 버킷에 신용카드 번호가 저장된 적이 있는지" → **Macie**(콘텐츠 검사). "EC2가 알려진 악성 IP와 통신" → **GuardDuty**(네트워크 행동). "EC2 OS 패치 누락 CVE 스캔" → **Inspector v2**(취약점 DB). "S3에 비정상 접근 행동" → **GuardDuty S3 Protection**(Macie 아님 — 행동이지 내용이 아님).

> 🔍 **더 깊이**: GuardDuty의 Protection 모듈은 옵트인이며 각각 별도 비용이다 — S3 Protection(접근 이상), Malware Protection(EBS 스냅샷 스캔, 에이전트 불필요), EKS Protection(쿠버네티스 감사+런타임), RDS Protection(DB 로그인 이상), Lambda Protection(네트워크 이상). 시험에서 "EKS 런타임 의심 동작"은 EKS Protection, "에이전트 없이 EC2 멀웨어 스캔"은 Malware Protection이 정답이다. GuardDuty가 에이전트 없이 작동하는 비결은 "AWS가 이미 수집하는 로그를 분석"하기 때문이다.

> 📚 **사례**: 2021년 Log4Shell(CVE-2021-44228)이 터졌을 때, "우리 인프라 어디에 취약한 Log4j가 있나"를 아는 것 자체가 난제였다. Inspector v2를 켜둔 조직은 신규 CVE가 NVD에 등록되자 추가 스캔 없이 영향 받는 EC2·ECR 이미지·Lambda를 자동 식별했다. 교훈: 취약점 대응의 첫 단계는 "어디 있는지 아는 것"이고, 지속 스캔 + 자동 재평가가 0-day 대응 속도를 결정한다. 단, Inspector는 탐지만 하고 패치 적용은 Patch Manager의 일이다.

> ⚠️ **함정**: "Inspector가 패치를 적용한다"는 오해. Inspector는 탐지·평가만 한다. 패치 적용은 Systems Manager **Patch Manager**다(보완 관계). "취약점 찾기"=Inspector, "찾은 것 패치"=Patch Manager.

## Layer 3: 통합 관제 — 현재 · 과거 · 증명

| 서비스 | 시제 | 역할 |
|--------|------|------|
| **Security Hub** | 현재 | CSPM·표준 점검(CIS/PCI/NIST) + Finding 통합(ASFF) |
| **Detective** | 과거 | 그래프 기반 사건 조사·근본 원인 |
| **Audit Manager** | 증명 | 컴플라이언스 증거 자동 수집·감사 보고서 |

Security Hub는 "지금 표준을 지키나", Detective는 "이 사건이 어떻게 일어났나", Audit Manager는 "준수를 어떻게 증명하나". 셋 다 **Config(설정 평가)**와 **CloudTrail(API 로그)**을 데이터 근간으로 삼는다.

> 💡 **관련 이론**: Security Hub는 **CSPM(Cloud Security Posture Management)** 카테고리에 속한다(서드파티: Wiz, Prisma Cloud, Lacework). CSPM의 핵심은 "configuration drift 탐지 + 표준 위반 식별"이다. Security Hub의 표준 점검 다수가 내부적으로 **Config Rule**로 구현되므로, Config가 비활성이면 점검이 "No data"가 된다 — 시험 단골 함정. Config가 평가 엔진이고 Security Hub는 그 위의 보안 집계·표준화 레이어다.

> 🔍 **더 깊이**: Audit Manager가 Security Hub와 다른 결정적 지점은 **시점 vs 지속**이다. Security Hub는 "지금 이 순간"을 본다. 감사는 "기간 내 지속 준수"를 증거로 요구한다 — 감사 전날만 고쳐선 안 되고, 분기 내내 통제가 작동했다는 타임스탬프 증거가 필요하다. 그래서 Audit Manager는 CloudTrail·Config 증거를 시간에 걸쳐 축적한다. "실시간 점검"=Security Hub, "기간 증거+보고서"=Audit Manager.

> 📚 **사례**: 한 헬스케어 SaaS는 HIPAA 감사 증거를 엔지니어가 수동 캡처하느라 매번 3~4주를 썼다. Audit Manager HIPAA 프레임워크로 통제별 증거가 자동 수집·축적되어 준비가 며칠로 줄었다. 교훈: 감사의 비용은 "통제 준수"가 아니라 "준수 증명(증거 수집)"에 있다.

## Layer 4: 엣지·DDoS 방어 — 계층으로 막는다

| 서비스 | 계층 | 적용 대상 | 핵심 |
|--------|------|-----------|------|
| **WAF** | L7 | CloudFront·ALB·APIGW·AppSync·App Runner·Cognito | OWASP Managed Rule·Rate-Based |
| **Shield Standard** | L3/L4 | 모든 AWS 리소스(무료) | volumetric/protocol 자동 완화 |
| **Shield Advanced** | L3-7 | 지정 리소스($3,000/월~) | L7+Cost Protection+SRT 24/7 |
| **Firewall Manager** | 정책 | Organization 전체 | 일괄·자동 배포·드리프트 시정 |
| **Network Firewall** | L3-7 | VPC 내부 | IDS/IPS·TLS Inspection(Suricata) |
| **DNS Firewall** | DNS | VPC 출발 쿼리 | 악성 도메인 차단(이름 기반) |

> 💡 **관련 이론**: DDoS는 OSI 계층으로 나뉜다 — Volumetric/Protocol(L3/L4, Shield), Application(L7, Shield Advanced+WAF Rate-Based). "낮은 계층에서 막을 것을 높은 계층까지 올리지 말라"는 원칙대로, Shield는 volumetric 공격을 AWS 엣지에서 흡수해 애플리케이션 도달 전에 차단한다. 시험의 첫 질문은 항상 "이 공격은 몇 계층인가"다.

> 🎯 **시나리오**: "L7 HTTP flood DDoS + 자동 스케일 아웃 요금 폭증 + 공격 중 전문가 부재" → **Shield Advanced**(L7 보호 + Cost Protection 요금 면제 + SRT 24/7). Standard는 L7 미보호 + Cost Protection 없음. WAF 단독은 DDoS 자동 완화·비용 보호 없음.

> 📚 **사례**: 2020년 AWS Shield는 약 2.3 Tbps의 CLDAP 반사 증폭 DDoS를 완화했다(당시 역대 최대급). 이런 초대형 volumetric 공격은 단일 데이터센터로 흡수 불가하고 AWS 글로벌 엣지 용량(수십 Tbps)으로만 막힌다. 교훈: volumetric DDoS 방어의 본질은 "공격보다 큰 흡수 용량"이며, 개별 기업이 자체 구축하기 가장 어려운 영역이다.

> ⚠️ **함정**: Firewall Manager vs SCP vs Config. **Firewall Manager**=보안 정책 능동 배포(WAF/Shield/SG/NWF), **SCP**=행위 금지(거부 가드레일), **Config**=비준수 평가. "Org 전체 WAF 정책 + 신규 계정 자동"은 Firewall Manager.

## 보안 키워드 → 정답 매핑 (시험 직전 암기표)

| 키워드 | 정답 | 레이어 |
|--------|------|--------|
| "봉투 암호화·큰 데이터 + KMS" | GenerateDataKey + DEK | L1 |
| "Multi-Region 동일 키 복호화·DR" | MRK | L1 |
| "외부 생성 키 + 만료 + 회전 불가" | Imported(BYOK) | L1 |
| "FIPS 140-2 L3 + 단일 테넌트" | CloudHSM / Custom Key Store | L1 |
| "IAM만으로 KMS 권한" | 오답(Key Policy 위임 필수) | L1 |
| "키 즉시 삭제" | 불가(7~30일 PendingDeletion) | L1 |
| "S3 내용에 PII/카드번호" | Macie | L2 |
| "S3 비정상 접근 행동" | GuardDuty S3 Protection | L2 |
| "EC2 ↔ 악성 IP·자격증명 탈취" | GuardDuty | L2 |
| "EC2·ECR·Lambda CVE 탐지" | Inspector v2 | L2 |
| "탐지된 취약점 패치 적용" | Patch Manager | L2 |
| "EKS 런타임 의심 동작" | GuardDuty EKS Protection | L2 |
| "에이전트 없이 EC2 멀웨어 스캔" | GuardDuty Malware Protection | L2 |
| "CIS/PCI 표준 자동 평가 + 통합" | Security Hub | L3 |
| "사건 시계열 그래프 조사" | Detective | L3 |
| "HIPAA 감사 증거 자동·보고서" | Audit Manager | L3 |
| "리소스 비준수 자동 평가" | Config Rule | L3 |
| "CloudTrail 이벤트 SQL 쿼리" | CloudTrail Lake | L3 |
| "OWASP 즉시 보호 + 운영 최소" | WAF Managed Rule Groups | L4 |
| "L7 DDoS + Cost Protection + SRT" | Shield Advanced | L4 |
| "Org 전체 WAF/SG 정책 자동" | Firewall Manager | L4 |
| "VPC 내 IDS/IPS + TLS Inspection" | Network Firewall | L4 |
| "VPC 내 악성 도메인 차단" | DNS Firewall | L4 |
| "특정 국가 차단" | WAF Geo Match | L4 |
| "단일 IP L7 flood/brute force" | WAF Rate-Based | L4 |
| "사람 SSH 없이 EC2 접근" | SSM Session Manager | - |
| "Secrets 자동 로테이션" | Secrets Manager | - |

## 정리하며

AWS 보안은 4 레이어(암호화 → 탐지 → 통합 관제 → 엣지 방어)의 조합이다. 각 레이어 내에서도 비슷한 이름이 다른 역할을 한다 — Macie(내용) vs GuardDuty(행동) vs Inspector(결함), Security Hub(현재) vs Detective(과거) vs Audit Manager(증명), Shield Standard(L3/4) vs Advanced(L7+비용보호), Network Firewall(VPC 트래픽) vs DNS Firewall(도메인 이름). Pro 시험은 한 시나리오에 여러 레이어가 동시 출현하므로, 키워드 → 정답 매핑을 즉답 수준으로 외우고 4 레이어를 한꺼번에 떠올리는 훈련이 필요하다.

다음 주(Week 12)는 **비용 최적화 심화**다 — Savings Plans 수학, Compute Optimizer, Cost Explorer, S3·NAT Gateway 같은 hidden cost 영역.

---

## 📝 연습 문제

**문제 1.** 멀티 리전 RDS 스냅샷을 두 리전에서 모두 복호화하며 DR 환경을 구성해야 한다. 추가 KMS 호출이나 re-encrypt 없이 즉시 복원하고, 리전별 키 접근 권한은 따로 통제하고 싶다.

A) Cross-Region Copy + 매번 re-encrypt

B) Multi-Region Key (Primary + Replica)

C) AWS Managed Key

D) BYOK를 두 리전에 각각 import

**정답: B**
해설: MRK는 같은 키 머터리얼을 여러 리전에 복제하고 키 ID가 동일해, 한 리전의 ciphertext를 다른 리전 Replica로 직접 복호화한다. 리전별 Key Policy로 접근 통제도 분리된다. A는 리전 종속이라 비효율적. C는 정책·회전 통제 불가, 리전 종속. D는 두 import 키가 서로 다른 키가 되어 동일 ciphertext를 양쪽에서 복호화 못 하고 자동 로테이션도 불가. 함정: "Cross-Region 동일 키 복호화 + DR"은 MRK.

---

**문제 2.** S3 버킷에 카드 번호·SSN이 저장된 적 있는지 자동 탐지·분류하고 버킷별 민감도를 우선순위화해야 한다.

A) Inspector v2

B) Macie

C) GuardDuty S3 Protection

D) Config Rule

**정답: B**
해설: Macie는 ML로 S3 객체 내용을 스캔해 PII/PCI를 분류하고 민감도 점수를 매긴다. A(Inspector)는 EC2·ECR·Lambda CVE 취약점. C(GuardDuty S3 Protection)는 "접근 행동의 이상"이지 콘텐츠 검사가 아니다. D(Config)는 설정 평가이지 객체 내용 분류가 아니다. 함정: "S3 내용에 민감 데이터"=Macie, "S3 접근 행동 이상"=GuardDuty.

---

**문제 3.** EC2·컨테이너 이미지(ECR)·Lambda에서 알려진 CVE를 지속 자동 탐지하고, 신규 CVE 공개 시 추가 스캔 없이 자동 재평가되어야 한다.

A) Inspector v2

B) Patch Manager

C) GuardDuty

D) Macie

**정답: A**
해설: Inspector v2는 EC2·ECR·Lambda 인벤토리를 CVE DB와 지속 대조하고 신규 CVE 등록 시 자동 재평가한다. B(Patch Manager)는 패치 "적용"이지 취약점 "탐지·평가"가 아니다(보완 관계). C(GuardDuty)는 행동·위협 탐지이지 CVE 평가가 아니다. D(Macie)는 S3 데이터. 함정: "CVE 자동 탐지·재평가"=Inspector, "패치 적용"=Patch Manager.

---

**문제 4.** EC2가 알려진 악성 IP와 통신하고 평소 안 쓰던 리전에서 IAM 자격 증명이 사용되는 등 이상 행동을 에이전트 없이 탐지해야 한다.

A) Inspector v2

B) GuardDuty

C) Macie

D) WAF

**정답: B**
해설: GuardDuty는 VPC FL·CloudTrail·DNS를 분석하고 위협 인텔(악성 IP)+ML 행동 베이스라이닝으로 이상을 탐지하며 에이전트가 필요 없다. A는 CVE 평가, C는 S3 데이터, D는 L7 웹 필터. 함정: "악성 IP 통신·비정상 행동·에이전트 없음"=GuardDuty.

---

**문제 5.** 30개 계정에서 CIS·PCI 표준 준수 현황을 자동 점검하고 GuardDuty·Inspector·Macie Finding을 단일 대시보드로 통합하려 한다.

A) Trusted Advisor

B) Security Hub (Org 위임 관리자)

C) Audit Manager

D) Detective

**정답: B**
해설: Security Hub는 CIS·PCI·NIST 표준을 자동 점검하고 모든 보안 Finding을 ASFF로 통합하며 Org 위임 관리자로 전 계정을 관리한다. A는 일반 모범 사례 점검이지 보안 표준 통합 허브가 아니다. C는 감사 증거 수집이지 실시간 점검·대시보드가 아니다. D는 사건 조사. 함정: "표준 자동 점검 + Finding 통합 대시보드"=Security Hub.

---

**문제 6.** GuardDuty가 EC2 자격 증명 탈취 의심을 탐지했다. 이 인스턴스가 언제부터 어떤 자격 증명으로 어떤 리소스와 통신했는지 시계열 그래프로 깊이 조사해 근본 원인을 파악해야 한다.

A) CloudTrail 콘솔 수동 검색

B) Detective

C) X-Ray

D) Macie

**정답: B**
해설: Detective는 VPC FL·CloudTrail·GuardDuty Finding을 통합해 행동 그래프를 만들고 엔티티 관계·시간축을 시각화해 근본 원인 조사를 돕는다(Finding에서 바로 점프). A는 수동 조인이라 느리고 누락이 쉽다. C는 앱 분산 추적. D는 S3 데이터. 함정: "사건 시계열·관계 시각화·근본 원인"=Detective.

---

**문제 7.** L7 HTTP flood DDoS를 받았고, 그로 인한 자동 스케일 아웃 요금 폭증을 면제받고 싶으며, 공격 중 24/7 전문가 지원이 필요하다.

A) Shield Standard

B) Shield Advanced

C) WAF Rate-Based만

D) CloudFront만

**정답: B**
해설: Shield Advanced는 L7 DDoS 보호 + Cost Protection(요금 면제) + SRT 24/7을 모두 제공한다. A는 무료지만 L3/4만, L7·Cost Protection·SRT 없음. C는 L7 완화에 일부 도움되나 비용 보호·전문가 지원 없음. D는 캐싱·배포이지 DDoS 비용 보호가 아니다. 함정: "L7 DDoS + Cost Protection + SRT" 세 키워드는 Shield Advanced 전용.

---

**문제 8.** VPC 내부 트래픽에 IDS/IPS를 적용하고 암호화 트래픽도 복호화해 검사(TLS Inspection)해야 한다.

A) WAF

B) Network Firewall

C) Shield

D) GuardDuty

**정답: B**
해설: Network Firewall은 Suricata 룰 기반 L3-7 IDS/IPS로 VPC 내부 트래픽을 inline 검사하고 TLS Inspection을 지원한다. A(WAF)는 엣지 L7 웹만, VPC 전반·TLS Inspection 불가. C(Shield)는 DDoS 방어. D(GuardDuty)는 로그 기반 탐지이지 inline IPS·TLS Inspection이 아니다. 함정: "VPC 내부 IDS/IPS + TLS Inspection"=Network Firewall.

---

**문제 9.** VPC 내 EC2가 멀웨어 C2 서버나 알려진 악성 도메인에 접근하지 못하게 이름 해석 단계에서 차단하고 싶다.

A) NACL로 IP 차단

B) WAF

C) Route 53 Resolver DNS Firewall

D) Security Group

**정답: C**
해설: DNS Firewall은 VPC 출발 DNS 쿼리를 악성 도메인 리스트로 차단해 이름 해석 단계에서 C2·악성 도메인 접근을 막는다. A·D(NACL/SG)는 IP 기반인데 악성 도메인 IP가 수시로 바뀌어 부적합. B(WAF)는 인바운드 L7 웹 필터이지 아웃바운드 DNS 차단이 아니다. 함정: "악성 도메인 차단(이름 기반)"=DNS Firewall.

---

**문제 10.** 500개 계정 Organization의 모든 인터넷 향 ALB에 동일 WAF Managed Rule을 적용하고, 신규 계정·리소스에도 자동 적용하며, 누군가 WAF를 끄면 자동 탐지·시정하고 싶다.

A) AWS Config Rule

B) Firewall Manager

C) SCP

D) Control Tower

**정답: B**
해설: Firewall Manager는 Org 단위로 WAF·Shield·SG·Network Firewall 정책을 일괄 배포하고 신규 계정·리소스에 자동 적용하며 드리프트를 자동 시정한다. A(Config)는 비준수 평가가 본업이지 능동 배포가 아니다. C(SCP)는 행위 금지(거부)이지 정책 배포가 아니다. D(Control Tower)는 랜딩 존 거버넌스. 함정: "보안 정책 멀티 계정 배포 + 신규 자동 + 드리프트 시정"=Firewall Manager.

---

**문제 11.** 단일 테넌트 전용 HSM에서 FIPS 140-2 Level 3 키 관리가 필요하면서, 개발팀은 기존 KMS API(`Encrypt`/`Decrypt`)를 그대로 쓰고 싶다.

A) 순수 KMS CMK(멀티 테넌트)

B) KMS Custom Key Store + CloudHSM

C) Secrets Manager

D) Imported Key Material

**정답: B**
해설: Custom Key Store는 KMS API를 유지하면서 실제 키를 고객 전용 CloudHSM(단일 테넌트·FIPS L3)에만 보관한다. A는 멀티 테넌트라 단일 테넌트 L3 요건 미달. C는 비밀 저장소이지 HSM 키 관리가 아니다. D는 import 키도 KMS 멀티 테넌트 HSM에 저장되어 단일 테넌트 요건 미달. 함정: "단일 테넌트 + FIPS L3 + KMS API 유지"=Custom Key Store + CloudHSM.

---

**문제 12.** 연 1회 HIPAA 감사를 위해 통제별 증거(접근 로그·암호화 설정·백업 정책 등)를 감사 기간에 걸쳐 자동 수집하고 감사관 제출용 보고서를 생성해야 한다.

A) Security Hub

B) Audit Manager

C) Detective

D) Config

**정답: B**
해설: Audit Manager는 HIPAA 등 프레임워크의 통제별로 CloudTrail·Config·Security Hub 증거를 자동 수집·축적하고 감사 보고서를 생성한다. A(Security Hub)는 현재 시점 표준 점검이지 기간 증거 축적·보고서 자동화가 아니다. C(Detective)는 사건 조사. D(Config)는 평가 엔진(증거 소스 역할)이지 보고서 패키징이 아니다. 함정: "감사 증거 자동 수집 + 보고서"=Audit Manager, "실시간 점검"=Security Hub.
