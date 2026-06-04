# Day 73 - 금융: 규제·감사·격리·DR — PCI DSS의 역사, HSM과 키 계층의 암호학, 격리 아키텍처의 심층 방어

2008년 결제 처리사 **Heartland Payment Systems**가 약 1억 3천만 건의 카드 정보를 도난당했다 — 당시 역사상 최대 규모였다. 공격자는 SQL 인젝션으로 침입해 네트워크에 스니퍼를 심고, **암호화되지 않은 채 네트워크를 흐르던 카드 데이터**를 몇 달간 빼냈다. 이 사건은 PCI DSS(결제카드 산업 데이터 보안 표준)의 강화를 가속했고, "전송 중·저장 중 암호화"와 "카드 데이터 환경(CDE)의 격리"를 절대 규범으로 만들었다. 금융 아키텍처가 다른 도메인과 근본적으로 다른 이유가 여기 있다 — **규제가 설계를 지배한다.** 가용성·비용보다 격리·암호화·감사 무결성이 먼저다.

오늘 시나리오는 글로벌 은행이다. PCI DSS·SOX 준수, RTO 15분·RPO 1분, 거래 데이터 7년 WORM 보관, 모든 키 자체 관리. SAA라면 "암호화 켜고 백업하세요"지만, Pro는 **CDE를 별도 OU로 격리하고, FIPS 140-2 Level 3 HSM으로 키를 통제하고, 모든 트래픽을 Inspection VPC로 검사하고, 감사 로그를 운영자조차 못 지우게 만드는** 심층 방어(defense in depth)의 총체를 요구한다. 오늘은 PCI DSS가 무엇을 강제하는지, HSM과 KMS의 키 계층 암호학, 그리고 격리 아키텍처의 각 계층을 깊이 분해한다.

## PCI DSS — 12개 요구사항이 만드는 격리

**PCI DSS(Payment Card Industry Data Security Standard)**는 Visa·Mastercard 등이 2004년 공동 제정한 카드 데이터 보호 표준으로, 12개 요구사항으로 구성된다. 핵심 개념은 **CDE(Cardholder Data Environment, 카드 소지자 데이터 환경)** — 카드 데이터를 저장·처리·전송하는 시스템의 경계다. PCI DSS의 가장 강력한 전략은 **범위 축소(scope reduction)**다. CDE를 나머지 시스템에서 강하게 격리할수록, 감사 대상(범위)이 줄어 비용과 위험이 동시에 내려간다.

> 💡 **관련 이론**: 이것이 보안의 **심층 방어(Defense in Depth)** 원칙과 **세그먼테이션(segmentation)**의 결합이다. PCI DSS는 명시적으로 네트워크 세그먼테이션으로 CDE를 분리하면 감사 범위를 줄일 수 있다고 인정한다. AWS에서 이를 구현하는 정석은 **CDE를 별도 계정/OU로 격리**하는 것 — 계정 경계가 가장 강한 격리이므로, CDE 계정의 SCP로 PII·카드 데이터 관련 행위를 비CDE 계정에서 원천 차단한다. NIST SP 800-53의 SC-7(경계 보호)·AC-4(정보 흐름 강제)가 요구하는 바와 정확히 일치한다. 시험에서 "카드 데이터 환경을 나머지에서 격리"가 보이면 별도 OU + SCP가 정답 신호다.

> 🔍 **더 깊이**: PCI DSS는 **카드 번호(PAN)를 저장할 때 반드시 암호화·토큰화·해시 중 하나로 읽을 수 없게** 만들라 하고, **CVV는 인증 후 절대 저장 금지**라고 못박는다. 그래서 실무 패턴은 **토큰화(tokenization)** — 실제 카드 번호를 의미 없는 토큰으로 치환해 CDE 밖 시스템은 토큰만 다루게 하면, 그 시스템들이 CDE 범위에서 빠진다(범위 축소). AWS에서는 결제 토큰화 서비스나 별도 토큰 볼트를 CDE 안에 두고, 나머지 앱은 토큰만 본다. 시험에서 "카드 번호를 다루는 시스템 수를 최소화"가 보이면 토큰화 + CDE 격리가 핵심이다.

## HSM과 KMS — 키 계층의 암호학

"모든 키 자체 관리"와 "FIPS 140-2 Level 3"는 단순한 암호화를 넘어선 요구다. 이를 이해하려면 AWS의 **키 계층 구조**와 HSM의 의미를 알아야 한다.

암호화는 보통 **봉투 암호화(envelope encryption)**로 한다 — 데이터는 **데이터 키(DEK)**로 암호화하고, 그 DEK를 다시 **마스터 키(CMK/KEK)**로 암호화해 저장한다. 데이터를 읽을 땐 CMK로 DEK를 풀고, 풀린 DEK로 데이터를 푼다. 핵심은 **CMK가 절대 HSM 밖으로 평문으로 나오지 않는다**는 것이다.

> 💡 **관련 이론**: **FIPS 140-2(NIST의 암호 모듈 보안 표준)**는 암호 모듈을 Level 1~4로 등급화한다. Level 2는 물리적 변조 증거(tamper-evidence), **Level 3는 변조 시 키 자동 삭제(tamper-response)와 신원 기반 인증**을 요구한다. KMS의 공유 HSM은 FIPS 140-2 Level 3 검증을 받았고, **CloudHSM은 단일 테넌트 전용 HSM으로 Level 3**를 제공한다. 차이는 **테넌시와 통제권**이다 — KMS는 AWS가 관리하는 멀티테넌트 HSM이고, CloudHSM은 고객이 단독 소유·완전 통제하는 HSM이다. 시험에서 "FIPS 140-2 Level 3 + 단일 테넌트 + 키 완전 통제"가 보이면 CloudHSM, "관리형 + 통합 편의"면 KMS다.

| 옵션 | 테넌시 | 키 통제 | FIPS | 용도 |
|------|--------|---------|------|------|
| **KMS (AWS managed key)** | 멀티 | AWS | L3(HSM) | 기본 암호화 |
| **KMS (Customer managed CMK)** | 멀티 | 고객(정책·로테이션) | L3 | 대부분의 규제 요구 |
| **KMS Custom Key Store** | 단일(CloudHSM 백엔드) | 고객 | L3 | KMS 편의 + HSM 통제 |
| **CloudHSM** | 단일 | 고객 완전 | L3 | PIN·마스터 키·완전 소유 |

> 🔍 **더 깊이**: **KMS Custom Key Store**는 두 세계의 다리다 — KMS의 편리한 API·서비스 통합을 그대로 쓰면서, 실제 키 자료(key material)는 고객 소유의 CloudHSM 클러스터에 둔다. 그래서 "KMS의 통합 편의는 원하지만 키는 우리 HSM에 있어야 한다"는 규제 요구를 동시에 만족한다. 순수 CloudHSM은 PKCS#11·JCE 같은 표준 인터페이스로 직접 다뤄야 해 통합이 번거롭다. 시험에서 "키는 전용 HSM에 두되 S3·EBS·RDS 암호화에 KMS처럼 쓰고 싶다"가 보이면 Custom Key Store가 정답이다.

> ⚠️ **함정**: "키 자체 관리 = 무조건 CloudHSM"으로 외우면 과설계다. 대부분의 규제(PCI·SOX 포함)는 **고객 관리 CMK(Customer Managed Key)**로 충분히 충족된다 — 키 정책·로테이션·접근 감사를 고객이 통제하기 때문이다. CloudHSM이 진짜 필요한 경우는 (1) FIPS 140-2 Level 3 단일 테넌트가 계약·규제로 명시되거나, (2) 키를 AWS와 절대 공유 불가하거나, (3) PIN·마스터 키 등 HSM 고유 기능이 필요할 때다. 시험에서 단순히 "CMK 필수"면 KMS CMK, "단일 테넌트 HSM·완전 소유"가 명시되면 CloudHSM이다.

## 격리 네트워크 — Inspection VPC와 중앙 검사

금융은 "모든 트래픽을 검사하라"고 요구한다. 이를 구현하는 패턴이 **Transit Gateway + Inspection VPC + Network Firewall**다. 모든 스포크 VPC와 온프레 트래픽이 TGW를 거쳐 중앙 Inspection VPC로 모이고, 거기서 **AWS Network Firewall**이 IDS/IPS·도메인 필터링·TLS 검사를 수행한 뒤 다시 목적지로 라우팅된다.

> 💡 **관련 이론**: Network Firewall의 엔진은 오픈소스 IDS/IPS인 **Suricata**의 룰 문법을 그대로 쓴다 — 그래서 기존 보안팀의 Suricata 시그니처를 재사용할 수 있다. 이 중앙 집중 검사 모델은 네트워크 설계의 **hub-and-spoke + service insertion** 패턴으로, 모든 east-west(VPC 간)·north-south(인터넷) 트래픽을 단일 검사 지점으로 강제한다. 분산 방화벽(각 VPC마다 따로)보다 운영·일관성·감사가 쉽다. WA Security 기둥의 "모든 계층에서 보호 적용"과 NIST SC-7(경계 보호)을 중앙화로 구현한 것이다. 시험에서 "모든 VPC 트래픽을 한 곳에서 IDS/IPS·검사"가 보이면 Inspection VPC + Network Firewall이다.

> 🔍 **더 깊이**: TGW가 트래픽을 Inspection VPC로 우회시키는 메커니즘은 **TGW 라우트 테이블의 의도적 비대칭 설계**다. 스포크 VPC의 TGW 라우트 테이블은 모든 목적지(0.0.0.0/0 포함)를 Inspection VPC 어태치먼트로 보내고, Inspection VPC는 검사 후 적절한 목적지 라우트 테이블로 되돌린다 — 이를 **appliance mode**로 켜야 같은 흐름의 양방향 패킷이 동일한 Network Firewall 엔드포인트(AZ)로 가서 상태 추적(stateful inspection)이 깨지지 않는다. 시험에서 "Inspection VPC인데 비대칭 라우팅으로 연결이 끊긴다"가 보이면 TGW appliance mode 누락이 원인이다.

> 📚 **사례**: 2017년 **Equifax 유출**(약 1억 4,700만 명의 사회보장번호·신용정보)은 Apache Struts의 알려진 취약점(CVE-2017-5638)을 패치하지 않아 발생했고, 공격자는 침입 후 **암호화되지 않은 자격증명과 평문 데이터**에 접근해 수 개월간 탐지되지 않은 채 데이터를 빼냈다. 교훈은 다층적이다 — (1) 취약점 관리(Inspector로 자동 스캔), (2) 네트워크 세그먼테이션(침입해도 횡적 이동 차단), (3) 이상 탐지(GuardDuty로 비정상 데이터 유출 감지), (4) 감사 가시성. 어느 한 계층이 아니라 심층 방어 전체가 무너졌다. 시험에서 "침입 후 횡적 이동·데이터 유출 탐지"가 보이면 Network Firewall + GuardDuty + 세그먼테이션의 조합을 떠올린다.

## DR — 엄격한 RTO 15분·RPO 1분

RTO 15분·RPO 1분은 매우 엄격하다. RPO 1분(실제 1초 미만)은 **Aurora Global Database**(storage-level 비동기, 보통 RPO 1초 미만)나 **DynamoDB Global Tables**(multi-master, 실질 RPO≈0)로 충족한다. RTO 15분은 Warm Standby 또는 Active-Active 수준의 상시 가동이 필요하다. 백업은 **AWS Backup Cross-Region + Vault Lock Compliance 7년**으로 WORM을 건다.

> 💡 **관련 이론**: 금융 DR에서 **RTO/RPO를 검증하는 것** 자체가 규제 요구다. **FFIEC**(미국 연방 금융기관 검사 위원회) 가이드와 바젤 운영 리스크 프레임워크는 단순히 DR을 "갖추는" 것이 아니라 **주기적으로 테스트해 입증**하라고 요구한다. 그래서 **AWS Resilience Hub**(RTO/RPO 정책 대비 실제 복원력 평가)와 **AWS FIS(Fault Injection Service)** 기반 Game Day(의도적 장애 주입으로 복구 검증)가 등장한다. 이것이 **카오스 엔지니어링(Chaos Engineering)** — 2011년 Netflix가 Chaos Monkey로 대중화한, "장애를 일부러 일으켜 시스템이 견디는지 증명"하는 분야다. 시험에서 "DR을 입증·정기 검증"이 보이면 Resilience Hub + FIS Game Day다.

> 🎯 **시나리오**: "한 은행이 RTO 15분·RPO 1분을 약속하고 규제기관에 이를 입증해야 한다. Failover 결정을 사람의 패닉이 아니라 통제된 절차로 만들고 싶다. 어떤 서비스 조합인가?" — 답: **Aurora Global + Route 53 ARC(Application Recovery Controller) + FIS Game Day + Resilience Hub**. **Route 53 ARC의 Routing Control**은 Failover를 단순 health check 자동 전환이 아니라 **명시적인 on/off 스위치(readiness check로 사전 검증된)**로 만들어, 운영자가 통제된 결정을 내리게 한다 — 부분 장애 시 자동 페일오버가 오히려 양쪽을 다 죽이는 사태(flapping)를 막는다. 시험에서 "Failover를 통제된 의사결정으로·복구 준비 상태 검증"이 보이면 Route 53 ARC다.

## 감사 무결성 — 운영자도 못 지우는 로그

금융 감사의 핵심은 **무결성** — 침해자나 내부자가 자기 흔적을 지울 수 없어야 한다. 정석은 **CloudTrail Organization Trail → 별도 Log Archive 계정의 S3 + Object Lock**이다. Org Trail은 조직 전체 계정의 API 호출을 자동 수집하고, 별도 계정에 두면 워크로드 운영자가 접근할 수 없으며, Object Lock으로 변경·삭제를 원천 봉쇄한다.

> 🔍 **더 깊이**: 탐지·조사 계층은 역할이 다르다 — **GuardDuty**는 위협 탐지(비정상 API·암호화폐 채굴·데이터 유출 패턴), **Macie**는 S3의 PII·카드 데이터 자동 발견, **Security Hub**는 이 모든 발견을 통합하고 PCI DSS·CIS 같은 표준 대비 자동 점검, **Detective**는 발견된 사건의 근본 원인을 그래프로 추적(어떤 자격증명이 언제 무엇을 했나), **Audit Manager**는 PCI·SOX 프레임워크별 증거를 자동 수집해 감사 보고서를 만든다. 시험은 이 역할 구분을 노린다 — "통합 점검·표준 준수 대시보드"=Security Hub, "사건 근본 원인 시각화·조사"=Detective, "규제 프레임워크 증거 수집·감사 보고서"=Audit Manager, "S3의 민감 데이터 발견"=Macie다.

> ⚠️ **함정**: CloudTrail을 같은 계정·같은 리전의 S3에 저장하면 감사 무결성이 깨진다 — 그 계정·리전이 침해되면 로그도 함께 위변조·삭제될 수 있다. 또 Object Lock을 켜도 **Governance 모드**면 권한자가 우회 가능하므로, 규제 WORM엔 반드시 **Compliance 모드**여야 한다. 시험에서 "운영자·root도 로그를 못 지워야"가 보이면 별도 Log Archive 계정 + Object Lock **Compliance**의 조합이다.

## 정리하며

금융 아키텍처는 **규제가 설계를 지배하는** 심층 방어의 총체다 — CDE를 별도 OU/SCP로 격리(범위 축소), CMK/CloudHSM/Custom Key Store로 FIPS 140-2 Level 3 키 통제, Inspection VPC + Network Firewall로 중앙 트래픽 검사, Aurora/DDB Global로 엄격한 RTO/RPO, Route 53 ARC + FIS로 통제된 Failover와 입증, 별도 Log Archive + Object Lock Compliance로 감사 무결성. 핵심 통찰은 (1) 격리는 계정 경계가 가장 강하고, (2) 대부분 규제는 CMK로 충분하며 CloudHSM은 단일 테넌트가 명시될 때만, (3) DR은 갖추는 게 아니라 입증하는 것이며, (4) 감사 로그는 생성자가 만질 수 없어야 한다는 것이다.

SAP 시험 단골 매핑: (1) "FIPS 140-2 L3·단일 테넌트·완전 소유" → **CloudHSM**, (2) "전용 HSM에 키 두되 KMS처럼 통합" → **KMS Custom Key Store**, (3) "단순 CMK 필수" → **KMS Customer Managed Key**, (4) "모든 VPC 트래픽 IDS/IPS·중앙 검사" → **Inspection VPC + Network Firewall**, (5) "Inspection VPC 비대칭 라우팅 단절" → **TGW appliance mode**, (6) "PCI DSS 통합 점검 대시보드" → **Security Hub**, (7) "사건 근본 원인 시각화" → **Detective**, (8) "규제 프레임워크 증거·감사 보고서" → **Audit Manager**, (9) "7년 변경 불가 백업" → **Backup Vault Lock Compliance**, (10) "통제된 Failover·복구 준비 검증" → **Route 53 ARC**, (11) "DR 정기 입증" → **FIS Game Day + Resilience Hub**. 다음 day는 전혀 다른 부하 프로파일 — 동시 시청자 500만의 글로벌 미디어 스트리밍을 파고든다.

---

## 📝 연습 문제

**문제 1.** 한 은행이 결제 키를 FIPS 140-2 Level 3 인증의 **단일 테넌트** 하드웨어에서 완전히 자체 소유·통제하고, AWS와 절대 공유하지 않아야 한다. PIN·마스터 키 같은 HSM 고유 기능도 필요하다. 가장 적합한 것은?

A) KMS AWS managed key

B) CloudHSM

C) KMS Customer managed CMK (공유 HSM)

D) Secrets Manager

**정답: B**

해설: CloudHSM은 **고객 단독 소유의 단일 테넌트 HSM**으로 FIPS 140-2 Level 3를 제공하며, PIN·마스터 키 등 HSM 고유 기능을 직접 다룰 수 있고 AWS와 키를 공유하지 않는다. A·C의 KMS는 AWS가 관리하는 **멀티테넌트** 공유 HSM이라 "단일 테넌트·완전 소유" 요건에 미달한다(C의 CMK도 키 정책은 고객이 통제하나 HSM 자체는 공유). D의 Secrets Manager는 시크릿 저장소이지 HSM이 아니다. 함정: 단순 "CMK 필수"면 KMS CMK지만, "단일 테넌트·HSM 완전 소유"가 명시되면 CloudHSM이다.

---

**문제 2.** 한 금융사가 키 자료를 자사 소유의 CloudHSM 클러스터에 두되, S3·EBS·RDS 암호화에는 KMS의 표준 통합을 그대로 쓰고 싶다. 가장 적합한 구성은?

A) 순수 CloudHSM을 PKCS#11로 직접 호출

B) KMS Custom Key Store (CloudHSM 백엔드)

C) KMS AWS managed key

D) 각 서비스에 SSE-S3

**정답: B**

해설: **KMS Custom Key Store**는 KMS의 편리한 API·서비스 통합(S3·EBS·RDS의 KMS 암호화)을 그대로 쓰면서, 실제 키 자료는 **고객 소유 CloudHSM 클러스터**에 보관한다 — "키는 우리 HSM에, 사용은 KMS처럼"을 동시에 만족한다. A의 순수 CloudHSM은 PKCS#11/JCE로 직접 다뤄야 해 S3·RDS의 KMS 통합 편의를 못 쓴다. C는 키가 AWS 관리 HSM에 있다. D는 AWS 소유 키라 자체 관리가 아니다. 함정: "전용 HSM + KMS 통합 편의 동시"는 Custom Key Store다.

---

**문제 3.** 한 은행이 모든 스포크 VPC와 온프레 트래픽을 한 곳에서 IDS/IPS·도메인 필터링·TLS 검사하려 한다. 가장 적합한 패턴은?

A) 각 VPC에 개별 WAF

B) Transit Gateway + Inspection VPC + AWS Network Firewall

C) 각 서브넷에 NACL

D) GuardDuty만 활성화

**정답: B**

해설: **TGW + Inspection VPC + Network Firewall**은 모든 east-west·north-south 트래픽을 중앙 검사 지점으로 강제하는 hub-and-spoke service insertion 패턴이다. Network Firewall은 Suricata 기반 IDS/IPS·도메인 필터링·TLS 검사를 수행한다. A의 WAF는 L7 HTTP 보호에 한정되고 VPC 간 모든 트래픽을 검사하지 못한다. C의 NACL은 단순 허용/차단이라 IDS/IPS가 아니다. D의 GuardDuty는 탐지(분석)이지 인라인 트래픽 검사·차단이 아니다. 함정: "모든 VPC 트래픽 중앙 IDS/IPS"는 Inspection VPC + Network Firewall이다.

---

**문제 4.** Inspection VPC를 구성했는데, 같은 연결의 요청과 응답이 서로 다른 AZ의 방화벽 엔드포인트로 가서 상태 추적이 깨지고 연결이 끊긴다. 가장 정확한 원인·해법은?

A) Network Firewall 룰 오류 — 룰을 재작성

B) TGW의 appliance mode 미활성화 — appliance mode를 켠다

C) 보안 그룹 미설정 — SG를 추가

D) 리전 장애 — 다른 리전으로 이전

**정답: B**

해설: TGW는 기본적으로 흐름별로 AZ를 분산시킬 수 있어, 상태 저장 방화벽(stateful)에서 같은 연결의 양방향 패킷이 다른 AZ 엔드포인트로 가면 상태 추적이 깨진다. TGW 어태치먼트에 **appliance mode**를 켜면 같은 흐름의 모든 패킷이 동일 엔드포인트(AZ)로 고정되어 stateful inspection이 정상 동작한다. A·C는 비대칭 라우팅 증상과 무관하고, D는 과한 대응이다. 함정: "Inspection VPC 비대칭 라우팅 단절"은 appliance mode 누락이다.

---

**문제 5.** 발견된 보안 사건의 근본 원인을 "어떤 자격증명이 언제 무엇을 했는지" 그래프로 추적·시각화해 조사하려 한다. 가장 적합한 서비스는?

A) Security Hub

B) Amazon Detective

C) Audit Manager

D) Macie

**정답: B**

해설: **Detective**는 CloudTrail·VPC Flow Logs·GuardDuty 데이터를 그래프 모델로 연결해, 사건의 근본 원인과 행위 연쇄(어떤 주체가 언제 무엇을)를 시각적으로 추적·조사하는 데 특화된다. A의 Security Hub는 발견 사항을 통합·표준 대비 점검(대시보드)하지 근본 원인 그래프 조사는 아니다. C의 Audit Manager는 규제 프레임워크 증거 수집·감사 보고서용이다. D의 Macie는 S3 민감 데이터 발견용이다. 함정: "사건 근본 원인 시각화·조사"는 Detective다.

---

**문제 6.** 한 은행이 RTO 15분·RPO 1분을 약속하고, Failover를 자동 health check가 아니라 **사전 검증된 통제 스위치**로 운영해 부분 장애 시 양쪽이 다 죽는 사태를 막고 싶다. 가장 적합한 서비스는?

A) Route 53 단순 Failover Routing

B) Route 53 Application Recovery Controller(ARC)

C) Auto Scaling

D) CloudWatch Alarm

**정답: B**

해설: **Route 53 ARC**의 Routing Control은 Failover를 명시적 on/off 스위치로 만들고, Readiness Check로 대상 리전의 복구 준비 상태를 사전 검증한다 — 운영자가 통제된 결정을 내려, 자동 페일오버가 부분 장애 시 양쪽을 다 죽이는 flapping을 방지한다. A의 단순 Failover Routing은 health check 기반 자동 전환이라 통제·사전 검증이 약하다. C·D는 Failover 의사결정 메커니즘이 아니다. 함정: "통제된 Failover·복구 준비 검증"은 Route 53 ARC다.

---

**문제 7.** 거래 감사 로그를 7년간 누구도(운영자·root 포함) 변경·삭제하지 못하게 보관하고, 워크로드 운영자가 로그 저장소에 아예 접근하지 못하게 하려 한다. 가장 적합한 설계는?

A) 같은 계정 S3 + Versioning

B) 별도 Log Archive 계정의 S3 + Object Lock Compliance + CloudTrail Org Trail

C) 같은 계정 S3 + Object Lock Governance

D) CloudWatch Logs 보존 7년

**정답: B**

해설: **CloudTrail Organization Trail**이 조직 전체의 API 호출을 수집하고, 이를 **별도 Log Archive 계정**의 S3에 두면 워크로드 운영자는 그 계정에 접근 권한이 없어 로그를 만질 수 없다(계정 격리). **Object Lock Compliance** 모드는 root조차 보존 기간 내 변경·삭제를 못 하게 한다. A의 Versioning은 삭제 자체를 막지 못하고, C의 Governance는 권한자가 우회 가능해 "root도 불가" 요건에 미달하며, 같은 계정이라 운영자 접근도 막지 못한다. D는 WORM 보장이 아니다. 함정: "운영자·root 모두 불가"는 별도 계정 + Object Lock Compliance다.

---

