# Day 55 - 보안 종합 복습: KMS·탐지·통합 관제·엣지 방어를 한 시나리오로

AWS 보안은 단일 서비스로 끝나지 않는다. **암호화(KMS, CloudHSM)**, **탐지(Macie, GuardDuty, Inspector)**, **통합 관제(Security Hub, Detective, Audit Manager)**, **엣지 방어(WAF, Shield, Firewall Manager, Network Firewall, DNS Firewall)**의 4개 레이어가 유기적으로 결합돼야 production-grade 보안이 완성된다. 오늘은 11주차에 본 보안 전체를 한 시나리오로 정리하고, Pro 시험에서 자주 충돌하는 "Macie vs GuardDuty vs Inspector" 같은 함정을 명확히 구분한다.

## Layer 1: 암호화 — KMS · CloudHSM

### KMS Key 종류 매트릭스

| 종류 | 키 소유 | 자동 로테이션 | 사용처 |
|------|---------|----------------|--------|
| AWS Managed Key (aws/...) | AWS | 1년 자동 | 기본 |
| Customer Managed Key (CMK) | 고객 | 활성화 가능 | 정책 통제 필요 |
| Multi-Region Key (MRK) | 고객 | 가능 | Cross-Region DR |
| Imported (BYOK) | 고객(외부) | **불가** | 컴플라이언스 |
| CloudHSM-backed | 고객(HSM) | 가능 | FIPS 140-2 L3 |

> 🔍 **더 깊이**: KMS의 액세스 통제는 **Key Policy + IAM Policy + Grant**의 3중 체크로 작동한다. Key Policy가 거부하면 IAM에서 허용해도 불가, Key Policy가 허용해도 IAM에서 거부 가능. Grant는 단기 임시 위임용(SDK가 자동 생성). Cross-Account 키 사용 시 양쪽 모두 명시적 허용 필요.

> 💡 **관련 이론**: **MRK(Multi-Region Key)**는 2021년 출시. 기존 KMS 키는 리전 종속이라 Cross-Region 백업 복호화 시 매번 re-encrypt가 필요했다. MRK는 같은 키 머터리얼을 여러 리전에 복제해 동일 ciphertext를 모든 리전에서 직접 복호화 가능. DR 시나리오의 게임 체인저.

> 📚 **사례**: 한 핀테크가 BYOK으로 자사 HSM에서 생성한 키를 KMS에 import해 사용. 단점: 자동 로테이션 불가, 만료 시 직접 갱신. 장점: 키 머터리얼이 자사 HSM에 영구 보관되어 AWS에서도 완전히 회수 불가(KMS는 캐시만 보관).

### CloudHSM vs KMS

- KMS: 멀티 테넌트, FIPS 140-2 L2/L3
- CloudHSM: 단일 테넌트 전용 HSM, FIPS 140-2 L3, SSL 가속 등 추가 용도

## Layer 2: 탐지 3총사

### Macie vs GuardDuty vs Inspector

이 셋의 구분이 Pro 시험 보안 영역의 가장 빈번한 함정.

| 서비스 | 탐지 대상 | 방법 |
|--------|-----------|------|
| **Macie** | S3 내 PII/PCI 데이터 | ML 기반 콘텐츠 분류 |
| **GuardDuty** | 계정·네트워크 위협 | VPC Flow Log + CloudTrail + DNS 분석 |
| **Inspector v2** | EC2·ECR·Lambda 취약점 | CVE 데이터베이스 매칭 |

> 🎯 **시나리오**: "한 회사가 S3 버킷에 신용카드 번호가 저장된 적이 있는지 자동 탐지". → **Macie** (콘텐츠 자체 검사). "EC2가 알려진 악성 IP와 통신". → **GuardDuty** (네트워크 행동 분석). "EC2 OS의 패치 누락 CVE 스캔". → **Inspector v2** (취약점 데이터베이스).

> 🔍 **더 깊이**: GuardDuty는 ML 모델로 "이상 행동" 탐지(예: 평소 안 가던 IP로 접속, 비정상 시간 API 호출). 추가 **Protection 옵트인**: S3 Protection(S3 접근 이상), EKS Protection(쿠버네티스), Malware Protection(EC2 디스크 스캔), RDS Protection(DB 접근 이상), Lambda Protection. 각각 별도 비용 발생.

> 📚 **사례**: 한 SaaS가 GuardDuty Malware Protection으로 EC2 디스크를 스냅샷 + 다른 instance에서 EICAR 시그니처 + ClamAV 검사. 검출 시 자동 격리 + Incident 생성. EC2에 에이전트 설치 불필요.

## Layer 3: 통합 관제

### Security Hub: CSPM + 표준 점검 + 통합 Finding

- AWS Foundational Security Best Practices, CIS Benchmark, PCI DSS 등 표준 자동 평가
- Macie/GuardDuty/Inspector/IAM Access Analyzer 등 모든 보안 서비스 Finding 통합
- ASFF(AWS Security Finding Format)로 표준화

### Detective: 그래프 기반 사건 조사

- GuardDuty Finding을 시작점으로 관련 리소스·시간대 자동 시각화
- "이 EC2가 언제 누구와 통신했는가" 같은 깊이 있는 조사

### Audit Manager: 컴플라이언스 증거 자동 수집

- HIPAA, SOC2, PCI DSS 같은 표준의 컨트롤별 증거 자동 수집
- 감사 보고서 생성

> 💡 **관련 이론**: Security Hub는 **CSPM(Cloud Security Posture Management)** 카테고리에 속한다. 같은 카테고리의 서드파티: Wiz, Prisma Cloud, Lacework. CSPM의 핵심은 "configuration drift 자동 탐지 + 표준 위반 식별". AWS는 Security Hub로 native CSPM을 제공하지만, multi-cloud 환경은 보통 서드파티를 함께 사용.

## Layer 4: 엣지·DDoS 방어

| 서비스 | 레이어 | 적용 대상 |
|--------|--------|-----------|
| **WAF** | L7 | CloudFront, ALB, API Gateway, AppSync |
| **Shield Standard** | L3-4 | 모든 AWS 리소스 (무료) |
| **Shield Advanced** | L3-7 | 지정 리소스 (월 $3000+) |
| **Firewall Manager** | 정책 통합 | Organizations 전체 |
| **Network Firewall** | L3-7 IDS/IPS | VPC 내 트래픽 |
| **Route 53 DNS Firewall** | DNS | VPC 출발 DNS 쿼리 |

### Shield Standard vs Advanced

- **Standard**: 무료, 자동 적용, SYN flood/UDP flood 등 L3/4 자동 완화
- **Advanced**: $3000/월(Organization 단위), L7 보호 추가, **Cost Protection**(DDoS로 인한 청구 면제), SRT(Shield Response Team) 24/7 지원, WAF/AWS Firewall Manager 포함

> 🎯 **시나리오**: "L7 DDoS + 청구 비용 보호 + 24/7 전문가 지원". → **Shield Advanced**. Standard는 L7 미보호 + Cost Protection 없음.

### Firewall Manager: Org 단위 통합

- WAF Rule, Shield, Security Group, Network Firewall, Route 53 DNS Firewall 정책을 Organizations 전체에 자동 배포
- 신규 계정 자동 적용
- 정책 위반 자동 탐지·시정

> 📚 **사례**: 한 대기업이 500개 계정에 WAF "AWSManagedRulesCommonRuleSet" 적용 필요. 계정별 수동 설정은 불가능. Firewall Manager로 단일 정책 정의 → 자동 배포 + 신규 계정 자동 포함. 정책 위반(WAF 비활성화 등) 발견 시 자동 알림.

## 보안 키워드 → 정답 매핑 표

| 키워드 | 정답 |
|--------|------|
| "S3 PII 탐지" | Macie |
| "EC2 ↔ 악성 IP 통신" | GuardDuty |
| "EC2 패치 누락 CVE" | Inspector v2 |
| "Multi-Region 동일 키 복호화" | MRK |
| "FIPS 140-2 Level 3 + 단일 테넌트" | CloudHSM |
| "Cross-Account API 호출 추적" | CloudTrail |
| "CIS/PCI 표준 자동 평가" | Security Hub |
| "GuardDuty Finding 상세 조사" | Detective |
| "HIPAA 감사 증거 자동" | Audit Manager |
| "L7 DDoS + Cost Protection" | Shield Advanced |
| "VPC 내 IDS/IPS + TLS Inspection" | Network Firewall |
| "VPC 내 악성 도메인 차단" | Route 53 DNS Firewall |
| "Org 전체 WAF 정책 자동" | Firewall Manager |
| "사람 SSH 없이 EC2 접근" | SSM Session Manager |
| "Secrets 30일 자동 로테이션" | Secrets Manager |

## 정리하며

AWS 보안은 4개 레이어(암호화 → 탐지 → 통합 관제 → 엣지 방어)의 조합으로 작동한다. 각 레이어 내에서도 비슷한 이름의 서비스가 다른 역할을 하므로(Macie vs GuardDuty vs Inspector, Shield Standard vs Advanced, Network Firewall vs DNS Firewall) 키워드 → 정답 매핑을 명확히 해야 한다. Pro 시험은 한 시나리오에 여러 레이어가 동시 출현하므로 4 레이어를 한꺼번에 떠올리는 훈련이 필요하다.

다음 주(Week 12)는 **비용 최적화 심화**다. Savings Plans 수학, Compute Optimizer, Cost Explorer, S3·NAT Gateway 같은 hidden cost 영역.

---

## 📝 연습 문제

**문제 1.** 멀티 리전 RDS Snapshot을 두 리전에서 모두 복호화 + DR.

A) Cross-Region Copy + Imported Key
B) Multi-Region Key (MRK)
C) AWS Managed Key
D) BYOK + 매번 re-encrypt

**정답: B**
해설: MRK는 같은 키 머터리얼을 여러 리전에 복제 → 동일 ciphertext를 모든 리전에서 직접 복호화. AWS Managed Key는 리전 종속, BYOK는 자동 로테이션 불가.

---

**문제 2.** S3 버킷에 카드 번호·SSN이 저장된 적 있는지 자동 탐지.

A) Inspector v2
B) Macie
C) GuardDuty S3 Protection
D) Config Rule

**정답: B**
해설: Macie는 ML 기반으로 S3 내 PII/PCI 콘텐츠 자동 분류. GuardDuty S3 Protection은 의심스러운 "접근 행동" 탐지(콘텐츠 검사는 아님). Inspector는 EC2/ECR/Lambda 취약점.

---

**문제 3.** EC2 OS 패치 누락 CVE 자동 스캔.

A) Inspector v2
B) Patch Manager
C) GuardDuty
D) Macie

**정답: A**
해설: Inspector v2는 EC2·ECR·Lambda의 CVE 데이터베이스 매칭. Patch Manager는 패치 자동 적용이지 탐지·평가가 아님(보완 관계).

---

**문제 4.** EC2가 알려진 악성 IP와 통신.

A) Inspector v2
B) GuardDuty
C) Macie
D) WAF

**정답: B**
해설: GuardDuty는 VPC Flow Log + DNS + CloudTrail 분석. AWS 위협 인텔리전스에서 악성 IP·도메인 목록 자동 업데이트. 행동 이상도 ML 탐지.

---

**문제 5.** 모든 계정 CIS·PCI 표준 자동 점검 + 단일 대시보드.

A) Audit Manager
B) Security Hub
C) Detective
D) Trusted Advisor

**정답: B**
해설: Security Hub는 표준 점검 + 모든 보안 서비스 Finding 통합. Audit Manager는 감사 증거 수집이지 실시간 점검이 아님.

---

**문제 6.** L7 DDoS 보호 + DDoS로 인한 청구 비용 보호 + 24/7 전문가 지원.

A) WAF만
B) Shield Standard
C) Shield Advanced
D) NACL + SG

**정답: C**
해설: Cost Protection · SRT · L7 보호는 Shield Advanced 전용. Standard는 무료지만 L3/4만 자동 완화. WAF는 룰 작성 도구이지 DDoS 자동 완화는 아님.

---

**문제 7.** 멀티 계정 WAF·Security Group 정책 자동 적용 + 신규 계정도 자동.

A) SCP
B) Firewall Manager
C) Control Tower
D) Config Aggregator

**정답: B**
해설: Firewall Manager는 Org 단위 보안 정책 통합 배포. SCP는 거부 정책뿐, Control Tower는 거버넌스(landing zone), Config는 평가.

---

**문제 8.** VPC 내 트래픽에 IDS/IPS + TLS Inspection.

A) WAF
B) Network Firewall
C) Shield
D) GuardDuty

**정답: B**
해설: Network Firewall은 L3-7 IDS/IPS + TLS Inspection + 스테이트풀 룰. WAF는 L7만, 엣지(CF/ALB/APIGW)에만 적용 가능.

---

**문제 9.** VPC 내 EC2가 악성 도메인 접근하지 못하게.

A) NACL
B) WAF
C) Route 53 DNS Firewall (Resolver DNS Firewall)
D) Security Group

**정답: C**
해설: DNS Firewall은 VPC 출발 DNS 쿼리를 도메인 리스트로 차단. NACL/SG는 IP 기반이라 도메인 차단에 부적합(IP가 자주 바뀜).

---

**문제 10.** HIPAA 감사 — 컨트롤별 증거 자동 수집 + 보고서 생성.

A) Security Hub
B) Audit Manager
C) Detective
D) Config

**정답: B**
해설: Audit Manager는 HIPAA/SOC2/PCI DSS 표준의 컨트롤별 증거(CloudTrail 로그, Config 스냅샷 등) 자동 수집 + 감사 보고서. Security Hub는 실시간 점검이지 감사 보고서 자동화 아님.
