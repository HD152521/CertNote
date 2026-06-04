# Day 75 - 정부·헬스케어 컴플라이언스 종합 — HIPAA의 법적 구조, FedRAMP·GovCloud의 격리, Week 15 케이스 통합

1996년 미국 의회는 **HIPAA(Health Insurance Portability and Accountability Act)**를 통과시켰다. 원래 목적은 "직장을 옮겨도 건강보험을 유지하게(portability)" 하는 것이었지만, 법의 진짜 유산은 부수 조항인 **Privacy Rule과 Security Rule** — 환자의 의료 정보(PHI)를 어떻게 보호해야 하는지를 규정한 부분이다. 2009년 **HITECH Act**가 이를 강화하며 위반 시 벌금을 대폭 올리고, 클라우드 같은 **비즈니스 제휴사(Business Associate)**도 직접 책임을 지게 만들었다. 그래서 AWS에서 PHI를 다루려면 **BAA(Business Associate Addendum)** 체결이 법적 전제가 된다. 정부·헬스케어 아키텍처가 다른 도메인과 다른 이유가 여기 있다 — **컴플라이언스가 서비스 선택지 자체를 제한한다.**

오늘은 Week 15의 마지막 날로, 두 가지를 한다. 첫째, 정부·헬스케어 컴플라이언스(HIPAA·FedRAMP·GovCloud)를 법적·기술적으로 깊이 파고든다. 둘째, Week 15에서 다룬 다섯 케이스(글로벌 ERP·스타트업·금융·미디어·헬스케어)를 **하나의 의사결정 프레임으로 통합**하고, 시나리오 12문항으로 케이스 분류 능력을 단련한다. Pro 시험의 본질은 "이 시나리오가 어느 케이스이고, 어떤 키워드가 어떤 서비스를 가리키는가"를 즉각 매핑하는 것이다.

## HIPAA — 법이 서비스를 제한한다

HIPAA의 핵심은 **PHI(Protected Health Information, 보호 대상 건강정보)** — 개인을 식별할 수 있는 모든 의료 정보다. HIPAA Security Rule은 PHI에 대해 **관리적·물리적·기술적 보호장치(safeguard)**를 요구하며, 기술적으로는 전송 중·저장 중 암호화, 접근 통제, 감사 로그를 명시한다.

> 💡 **관련 이론**: 클라우드에서 HIPAA를 이해하는 열쇠는 **공동 책임 모델(Shared Responsibility Model)**과 **BAA**다. AWS는 인프라(물리 보안·하이퍼바이저)를 책임지고, 고객은 그 위의 구성(암호화 설정·접근 통제·PHI 처리)을 책임진다. BAA는 이 책임 분담을 법적으로 명문화한 계약으로, AWS Artifact에서 받는다. 결정적 제약은 **PHI는 "HIPAA Eligible Services"에서만 처리**해야 한다는 것 — AWS의 약 130여 개 서비스만 BAA 범위에 들어간다. HIPAA Eligible이 아닌 서비스에 PHI를 넣으면 BAA 위반이다. 시험에서 "HIPAA Eligible 아닌 서비스 사용 차단"이 보이면 **SCP**로 그런 서비스를 Deny하는 게 정답이다 — 법적 요구를 기술 통제로 강제한다.

> 🔍 **더 깊이**: PHI 보호의 한 축은 **비식별화(de-identification)**다. HIPAA는 두 가지 비식별 방법을 인정한다 — **Safe Harbor**(18개 식별자를 모두 제거)와 **Expert Determination**(통계 전문가가 재식별 위험이 낮음을 입증). AWS에서 **Comprehend Medical**은 의료 텍스트에서 PHI 엔터티(이름·날짜·진단 등)를 자동 추출해 비식별화를 돕고, **Macie**는 S3에 저장된 PHI/PII를 자동 발견한다. 둘의 구분이 시험에 나온다 — "의료 텍스트에서 PHI 추출·비식별화"=Comprehend Medical, "S3의 민감 데이터 발견·분류"=Macie다. 또 **HealthLake**는 의료 표준 **FHIR R4** 형식의 데이터레이크로, 의료 데이터를 구조화·분석한다.

> ⚠️ **함정**: "HIPAA 인증 리전"이라는 건 없다 — HIPAA는 리전이 아니라 **서비스 단위(HIPAA Eligible)**와 BAA로 관리된다. 일반 상용 리전(us-east-1 등)에서도 HIPAA Eligible 서비스 + BAA로 PHI를 합법적으로 다룰 수 있다. GovCloud가 필요한 건 HIPAA 때문이 아니라 **FedRAMP High·DoD** 같은 **정부** 요구 때문이다. 시험에서 HIPAA만 있으면 일반 리전 + Eligible 서비스로 충분하고, FedRAMP High/DoD가 추가되면 GovCloud로 넘어간다 — 이 둘을 섞으면 함정에 빠진다.

## FedRAMP와 GovCloud — 정부의 격리

**FedRAMP(Federal Risk and Authorization Management Program)**는 미국 연방 정부가 클라우드 서비스를 쓰기 위한 보안 인증 프로그램으로, Low·Moderate·High 영향 등급이 있다. **GovCloud(US)**는 이 정부 요구를 위한 **물리적·논리적으로 격리된 별도 파티션**이다.

> 💡 **관련 이론**: GovCloud의 핵심 특성은 **ITAR(국제무기거래규정)·EAR 준수를 위한 인력 제한**이다 — GovCloud는 **미국 시민권자·영주권자만이 운영·접근**하며, 별도 자격증명·별도 콘솔·별도 리전(us-gov-west-1·us-gov-east-1)을 쓴다. 이는 NIST SP 800-53의 High 베이스라인과 DoD SRG(IL2~5)를 충족하기 위함이다. 일반 AWS 파티션(aws)과 GovCloud 파티션(aws-us-gov)은 ARN의 파티션 식별자부터 다르고, IAM·계정이 완전히 분리된다. 그래서 일반 리전과 GovCloud 간에는 직접 연결이 안 되고 별도로 관리해야 한다. 시험에서 "FedRAMP High·DoD·미국 시민 운영"이 보이면 GovCloud, "FedRAMP Moderate"는 일반 상용 리전에서도 다수 서비스가 인증되어 있어 GovCloud가 꼭 필요하진 않을 수 있다.

| 요구 | 충분한 환경 |
|------|------------|
| **HIPAA만** | 일반 상용 리전 + HIPAA Eligible 서비스 + BAA |
| **FedRAMP Moderate** | 일반 상용 리전(다수 서비스 인증됨) |
| **FedRAMP High / DoD IL4-5** | **GovCloud(US)** |
| **ITAR(무기 관련 데이터)** | **GovCloud(US)** (미국인 운영) |

> 🔍 **더 깊이**: 30년 보존 같은 초장기 WORM은 **계층 결합**으로 푼다 — 저렴한 저장은 **S3 Glacier Deep Archive**(가장 싼 아카이브 계층)로, 변경 불가는 **Object Lock Compliance** 또는 백업의 **Vault Lock Compliance**로 건다. 둘은 직교한다 — Glacier가 "어디에 싸게 저장하나", Object Lock이 "변경 불가를 어떻게 강제하나"를 담당한다. 시험에서 "30년·최저 비용·변경 불가"가 보이면 Glacier Deep Archive + Object Lock/Vault Lock Compliance의 조합이다.

> 📚 **사례**: 2015년 미국 **연방 인사관리처(OPM) 해킹**으로 약 2,150만 명의 연방 공무원 신원조회 기록(지문·SF-86 보안 양식 포함)이 유출됐다. 원인은 다년간의 미흡한 보안 — 다단계 인증 부재, 미암호화 데이터, 레거시 시스템, 탐지 실패가 겹쳤다. 이 사건은 연방 클라우드 보안 강화(FedRAMP 강제·지속 모니터링)를 가속했다. 교훈은 헬스케어·금융과 동일하다 — 컴플라이언스는 체크박스가 아니라 암호화·MFA·세그먼테이션·탐지·감사의 심층 방어 전체가 작동해야 의미가 있다. 시험에서 정부·의료 시나리오는 항상 이 다층 보호를 동시에 묻는다.

## Week 15 통합 — 케이스 분류 프레임

Pro 시험의 시나리오는 결국 "어느 케이스인가"를 먼저 분류하고, 그 케이스의 지배 제약(driving constraint)에 맞는 서비스를 고르는 게임이다. Week 15의 다섯 케이스를 한 표로 통합한다.

| 케이스 | 지배 제약 | 시그널 키워드 | 핵심 서비스 |
|--------|----------|--------------|------------|
| **글로벌 ERP** | 거버넌스·네트워크·주권 | 멀티 계정, EU 데이터, 100TB, 하이브리드 | Organizations/SCP, TGW/DX, MGN, DMS+SCT, Aurora Global |
| **스타트업** | 비용·속도·확장 | 비용 0, 빠른 출시, 100x, 3명 팀 | Lambda, DDB On-Demand, Aurora Serverless v2, Compute SP, OIDC |
| **금융** | 격리·암호·감사 | PCI/SOX, HSM, CDE, RTO 분 단위 | CDE OU/SCP, CloudHSM/Custom Key Store, Inspection VPC, Vault Lock, Route 53 ARC |
| **미디어** | 대역폭·지연·DRM | 라이브, VOD, 동시 500만, 4K, DRM | MediaLive/Convert/Package/Connect, Origin Shield, Signed Cookie, Personalize |
| **헬스케어/정부** | 컴플라이언스 제약 | HIPAA, BAA, FedRAMP, PHI, GovCloud | HIPAA Eligible+SCP, Macie/Comprehend Medical, HealthLake, GovCloud |

> 🎯 **시나리오**: "한 시나리오에 'PHI 5억 건 + FedRAMP High + 30년 보관 + 라이브 환자 모니터링 스트림'이 동시에 나온다. 어떻게 분해하나?" — 답: 케이스가 **혼합**됐음을 인식하고 각 제약을 독립적으로 푼다. PHI+FedRAMP High → **GovCloud + HIPAA Eligible + BAA**, 30년 → **Glacier Deep Archive + Vault Lock Compliance**, 라이브 스트림 → **MediaLive/Connect**(단 GovCloud 지원 여부 확인). Pro 시험의 함정은 한 케이스로 단순화하게 유도하는 것 — 실제론 제약마다 다른 서비스가 필요하다. "여러 제약 동시"가 보이면 각각을 분리해 매핑하라.

> ⚠️ **함정**: 모든 케이스에서 반복되는 함정이 **"가장 강한 통제 = 항상 정답"이 아니라는 것**이다. 스타트업에 CloudHSM을 권하거나, 관대한 RTO에 Multi-Site Active-Active를 권하면 over-engineering이다. Pro 사고는 **요구를 정확히 충족하는 가장 저렴·단순한 선택**이다. 반대로 금융·정부에서 비용을 이유로 격리·암호를 생략하면 컴플라이언스 위반이다. 각 케이스의 지배 제약이 무엇인지 먼저 읽고, 그에 비례하는 통제를 골라야 한다.

## 정리하며

헬스케어·정부 아키텍처는 **컴플라이언스가 서비스 선택지 자체를 제한**한다 — HIPAA Eligible + BAA + SCP로 PHI 처리를 합법 서비스로 가두고, FedRAMP High/DoD는 GovCloud로, PHI 비식별화는 Comprehend Medical, 발견은 Macie, FHIR는 HealthLake, 30년 WORM은 Glacier Deep Archive + Vault Lock Compliance로 푼다. Week 15 전체의 통찰은 **시나리오를 케이스로 분류하고, 지배 제약에 비례하는 통제를 고르며, 혼합 제약은 독립적으로 분해**하는 것이다.

Week 15 한 줄 정리: "글로벌 ERP=거버넌스/네트워크/MGN, 스타트업=서버리스/비용, 금융=격리/HSM/감사, 미디어=Elemental/CloudFront/DRM, 헬스케어·정부=BAA/Eligible/GovCloud." 다음 주(Week 16)는 도메인별 종합 + 최종 모의고사 + D-Day 전략으로, 이 케이스 분류 능력을 실전 시험 형식에서 단련한다.

---

## 📝 시나리오 12문항 (Week 15 통합)

**문제 1.** 한 의료 보험사가 일반 상용 리전(us-east-1)에서 PHI를 처리하되, HIPAA Eligible이 아닌 서비스에 PHI가 들어가는 것을 조직 차원에서 원천 차단하려 한다. 가장 적합한 통제는?

A) IAM Policy로 사용자·역할별 서비스 사용을 제한

B) SCP로 비HIPAA-Eligible 서비스를 Deny

C) Config Rule로 비Eligible 서비스 사용을 탐지·기록

D) GuardDuty로 비정상 서비스 호출을 모니터링

**정답: B**

해설: HIPAA는 PHI를 HIPAA Eligible 서비스에서만 처리하도록 요구하며(BAA 범위), 이를 조직 전체에 **예방적으로** 강제하려면 SCP로 Eligible이 아닌 서비스의 API를 Deny한다 — root조차 우회 불가. A는 root에 적용되지 않고 계정 전체 강제가 어렵다. C·D는 탐지·모니터링(사후)이라 사전 차단이 아니다. 함정: "사용 자체를 원천 차단"은 예방적 SCP다.

---

**문제 2.** 의료 임상 노트(자유 텍스트)에서 환자 이름·진단 같은 PHI를 자동 추출해 비식별화하려 한다. 가장 적합한 서비스는?

A) Amazon Comprehend (일반 NLP 엔터티 추출)

B) Amazon Comprehend Medical

C) Amazon Macie (S3 민감 데이터 발견·분류)

D) Amazon Textract (문서에서 텍스트·표 추출)

**정답: B**

해설: **Comprehend Medical**은 의료 텍스트에 특화되어 PHI 엔터티(이름·날짜·진단·약물 등)와 의학 용어를 추출해 비식별화를 돕는다. A의 일반 Comprehend는 의료 엔터티에 특화되지 않았다. C의 Macie는 S3 저장 데이터의 민감 정보 발견용이지 텍스트에서 의료 엔터티 추출이 아니다. D의 Textract는 문서에서 텍스트·표 추출이지 PHI 식별이 아니다. 함정: "의료 텍스트 PHI 추출"은 Comprehend Medical, "S3 민감 데이터 발견"은 Macie다.

---

**문제 3.** 한 정부 기관이 FedRAMP High와 DoD IL5를 충족하고, 시스템을 미국 시민권자만 운영해야 한다(ITAR 관련 데이터 포함). 가장 적합한 환경은?

A) 일반 us-east-1 + HIPAA Eligible 서비스 + BAA

B) AWS GovCloud (US)

C) eu-west-1 (데이터 주권 분리 리전)

D) Local Zones (저지연 엣지 컴퓨트)

**정답: B**

해설: **GovCloud(US)**는 FedRAMP High·DoD SRG IL2-5를 충족하는 격리된 별도 파티션으로, **미국 시민권자·영주권자만 운영·접근**하며 ITAR 요구를 만족한다(별도 리전·계정·콘솔). A·C의 일반 리전은 FedRAMP High·ITAR 인력 제한을 충족하지 못한다. D는 저지연 엣지 컴퓨트이지 컴플라이언스 격리 환경이 아니다. 함정: "FedRAMP High·DoD·미국인 운영·ITAR"은 GovCloud다.

---

**문제 4.** PHI를 의료 상호운용성 표준(FHIR R4) 형식으로 저장·분석하는 데이터레이크를 구축하려 한다. 가장 적합한 서비스는?

A) Amazon Athena (S3 위 서버리스 SQL 쿼리)

B) Amazon HealthLake

C) Amazon Redshift (컬럼형 데이터 웨어하우스)

D) AWS Lake Formation (데이터레이크 거버넌스·권한)

**정답: B**

해설: **HealthLake**는 의료 데이터를 **FHIR R4** 표준으로 저장·구조화·분석하는 관리형 데이터레이크로, 의료 상호운용성에 특화된다. A·C·D는 범용 분석·웨어하우스·거버넌스 도구로 FHIR 표준 의료 데이터에 특화되지 않았다. 함정: "FHIR R4 의료 데이터레이크"는 HealthLake다.

---

**문제 5.** 거래 로그를 30년간 최저 비용으로 저장하되, 누구도(root 포함) 변경·삭제할 수 없어야 한다. 가장 적합한 조합은?

A) S3 Standard + Versioning으로 버전 보존

B) S3 Glacier Deep Archive + Object Lock Compliance(또는 Vault Lock Compliance)

C) S3 Glacier Deep Archive만으로 저비용 아카이브

D) EBS 스냅샷을 30년간 보관하고 주기적 복사

**정답: B**

해설: 30년 초장기 보존은 **Glacier Deep Archive**(가장 저렴한 아카이브)로 비용을, **Object Lock Compliance**(또는 백업의 Vault Lock Compliance)로 root조차 변경·삭제 불가의 WORM을 건다 — "어디에 싸게"와 "변경 불가 강제"는 직교한 두 통제다. A는 비용 과다·삭제 차단 미흡, C는 변경 불가 보장이 없다, D는 30년 WORM에 부적합하다. 함정: "30년·최저 비용·변경 불가"는 Glacier Deep Archive + Compliance Lock 조합이다.

---

**문제 6.** 글로벌 OTT가 라이브 스포츠를 송출한다. 인코더 장애에도 무중단이어야 하고, 공용 인터넷으로 카메라 피드를 안전하게 받아야 한다. 입력~인코딩 구간의 조합은?

A) MediaConvert + S3 (파일 기반 VOD 트랜스코딩)

B) MediaConnect(입력 이중화) + MediaLive(파이프라인 이중화)

C) MediaPackage + CloudFront (패키징·전송 구간)

D) Kinesis Video Streams + Lambda (데이터 스트림 처리)

**정답: B**

해설: **MediaConnect**가 SRT/Zixi/RIST로 공용망 라이브 피드를 안전·신뢰성 있게 받고(입력 이중화), **MediaLive**가 두 파이프라인을 동시 운영해 인코더 장애에도 무중단으로 인코딩한다. A는 VOD용이다. C는 패키징·전송 구간이지 입력·인코딩이 아니다. D는 데이터 스트림이지 비디오 인코딩이 아니다. 함정: "안전한 라이브 입력 + 인코딩 무중단"은 MediaConnect + MediaLive다.

---

**문제 7.** 시드 단계 SaaS가 관계형 DB가 필요한데, 트래픽이 0이 되는 시간이 많고 갑자기 폭증하기도 한다. 비용을 사용량에 비례시키고 끊김 없는 스케일을 원한다. 가장 적합한 선택은?

A) RDS Provisioned Multi-AZ (고정 용량 + 동기 standby)

B) Aurora Serverless v2

C) Redshift (분석용 컬럼형 웨어하우스)

D) DynamoDB (키-값 NoSQL, On-Demand 과금)

**정답: B**

해설: **Aurora Serverless v2**는 0.5 ACU 단위로 끊김 없이 초 단위 스케일하며 사용량에 비례 과금하는 관계형 DB로, 변동 큰 워크로드에 적합하다. A는 고정 용량이라 유휴 비용이 크다. C는 분석용 웨어하우스다. D는 "관계형 필요" 전제에 맞지 않는다. 함정: "관계형 + 변동 + 비용 비례"는 Aurora Serverless v2다.

---

**문제 8.** 글로벌 제조사가 EU 워크로드의 데이터가 EU 외 리전으로 나가지 못하게 강제하려 한다. 계정 root조차 비EU 리전에 리소스를 만들 수 없어야 한다. 가장 적합한 통제는?

A) IAM Policy에 리전 조건을 추가해 사용자별 제한

B) SCP DenyRegions(`aws:RequestedRegion`)

C) NACL로 비EU 리전 네트워크 트래픽 차단

D) Config Rule로 비EU 리전 리소스를 탐지(탐지만)

**정답: B**

해설: SCP는 권한 상한선으로 root조차 막으므로(관리 계정만 예외), `aws:RequestedRegion` 조건의 DenyRegions로 비EU 리전 API를 차단하면 누구도 그 리전에 리소스를 못 만든다. A는 root에 적용되지 않고, C는 네트워크 계층이라 리소스 생성을 못 막으며, D는 사후 탐지일 뿐이다. 함정: "root도 막는 리전 강제"는 SCP다.

---

**문제 9.** 한 은행이 모든 VPC 간·인터넷 트래픽을 중앙에서 IDS/IPS와 TLS Inspection으로 검사해야 한다. 가장 적합한 패턴은?

A) WAF만으로 L7 HTTP 트래픽 검사

B) Transit Gateway + Inspection VPC + Network Firewall

C) 각 서브넷 NACL로 IP·포트 단위 허용/차단

D) Security Group 규칙 강화로 인바운드 제한

**정답: B**

해설: **TGW + Inspection VPC + Network Firewall**은 모든 east-west·north-south 트래픽을 중앙 검사 지점으로 강제하는 패턴으로, Suricata 기반 IDS/IPS·도메인 필터링·TLS 검사를 수행한다. A의 WAF는 L7 HTTP에 한정되고, C·D는 단순 허용/차단이라 IDS/IPS가 아니다. 함정: "모든 트래픽 중앙 IDS/IPS·TLS Inspection"은 Inspection VPC + Network Firewall이다.

---

**문제 10.** 금융사가 분기별로 의도적 장애를 주입해 DR의 RTO/RPO 달성을 입증하고, 이를 자동 스케줄로 실행하려 한다. 가장 적합한 조합은?

A) Trusted Advisor로 내결함성 카테고리 점검

B) AWS FIS + EventBridge Scheduler (+ Resilience Hub로 평가)

C) Backup Restore를 분기마다 수동 실행해 복구 확인

D) CloudWatch Alarm으로 장애 지표를 모니터링

**정답: B**

해설: **AWS FIS(Fault Injection Service)**가 통제된 장애를 주입(카오스 엔지니어링)해 복구를 검증하고, **EventBridge Scheduler**로 분기별 자동 실행하며, **Resilience Hub**가 RTO/RPO 정책 대비 복원력을 평가한다 — 규제가 요구하는 "DR 입증"을 자동화한다. A·D는 DR 입증 도구가 아니고, C는 수동이라 정기 자동 검증이 아니다. 함정: "의도적 장애 주입·DR 입증·자동화"는 FIS + Scheduler다.

---

**문제 11.** 한 스타트업이 100배로 성장해 Lambda·Fargate 비용이 월 수만 달러가 됐다. 서버리스를 유지하면서 약정 할인을 받되 리전·패밀리 변경 유연성도 원한다. 가장 적합한 것은?

A) EC2 Instance Savings Plans (특정 리전·family 고정)

B) Compute Savings Plans

C) Standard Reserved Instances (EC2 family·OS 고정)

D) Spot Instances (회수 위험 있는 즉시 할인)

**정답: B**

해설: **Compute Savings Plans**는 EC2·**Fargate·Lambda**를 모두 커버하며 리전·패밀리·OS 무관하게 적용되는 최고 유연성 약정으로, 서버리스를 유지한 채 할인을 얻는다. A·C는 EC2에만 적용되어 Lambda·Fargate를 커버하지 못한다. D는 약정 할인이 아니다. 함정: "Lambda·Fargate 절감 + 유연성"은 Compute SP다.

---

**문제 12.** 한 시나리오에 "PHI 처리 + FedRAMP High + 30년 WORM 보관 + 글로벌 라이브 환자 모니터링 스트림"이 동시에 등장한다. 가장 올바른 접근은?

A) 하나의 케이스로 단순화해 GovCloud만 적용

B) 제약을 독립 분해 — GovCloud+HIPAA Eligible+BAA(컴플라이언스), Glacier Deep Archive+Vault Lock Compliance(30년 WORM), MediaLive/Connect(라이브, GovCloud 지원 확인)

C) 비용을 이유로 일반 리전 사용

D) 모든 데이터를 단일 S3 버킷에 저장

**정답: B**

해설: Pro 시험의 핵심은 혼합 제약을 **각각 독립적으로 분해**하는 것이다. PHI+FedRAMP High → GovCloud + HIPAA Eligible + BAA, 30년 WORM → Glacier Deep Archive + Vault Lock Compliance, 라이브 → MediaLive/Connect(단 해당 환경 서비스 지원 확인)로 제약마다 다른 서비스를 매핑한다. A는 한 케이스로 단순화하는 전형적 함정(다른 제약을 놓침), C는 FedRAMP High·PHI 위반, D는 격리·WORM·접근 통제를 무시한다. 함정: "여러 제약 동시"는 단순화가 아니라 독립 분해다.

---

