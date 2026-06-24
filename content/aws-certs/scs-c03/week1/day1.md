# Day 1 - 공동 책임 모델과 SCS-C03 6개 도메인: 보안 엔지니어의 큰 그림

보안 자격증을 처음 준비하는 사람의 절반은 "AWS 보안 = IAM 정책 잘 쓰기"라고 생각한다. 그렇게 들어가면 SCS-C03의 시나리오 문제 앞에서 무너진다. 이 시험이 측정하는 것은 정책 문법이 아니라 **"이 위협을 어느 계층에서, 누가 책임지고, 어떤 통제로 막는가"**라는 사고의 틀이다. 그 틀의 두 기둥이 공동 책임 모델(Shared Responsibility Model)과 6개 시험 도메인이다.

오늘은 도구 하나도 깊이 파지 않는다. 대신 앞으로 12주 동안 만날 모든 서비스가 어디에 놓이는지를 가늠하는 지도를 그린다. GuardDuty, KMS, IAM, WAF, Macie, Config — 이 이름들이 각각 "어떤 책임 경계의 어떤 통제 유형"인지가 머리에 자리잡으면, 시나리오 문제에서 정답 보기와 함정 보기가 자연스럽게 갈라진다.

## 공동 책임 모델: "of the cloud" vs "in the cloud"

AWS의 공동 책임 모델은 한 문장으로 요약된다. **AWS는 "클라우드 자체(of the cloud)"의 보안을, 고객은 "클라우드 안(in the cloud)"의 보안을 책임진다.** 추상적으로 들리지만 경계선은 의외로 칼같다.

| 책임 주체 | 책임 범위 | 예시 |
|-----------|----------|------|
| **AWS (of the cloud)** | 하드웨어, 물리 시설, 네트워크 인프라, 하이퍼바이저, 관리형 서비스의 OS/패치 | 데이터센터 출입통제, EC2 호스트 펌웨어, S3 내구성, RDS 엔진 패치 |
| **고객 (in the cloud)** | 데이터, IAM, OS·네트워크 설정, 암호화 키 관리, 애플리케이션 | S3 버킷 정책, EC2 게스트 OS 패치, 보안 그룹 규칙, KMS 키 회전 |

핵심 통찰은 이 경계가 **서비스 유형에 따라 움직인다**는 점이다.

- **IaaS (EC2)**: 고객 책임이 가장 크다. 게스트 OS 패치, 미들웨어, 방화벽까지 전부 고객 몫.
- **PaaS (RDS, Lambda)**: AWS가 OS·런타임 패치를 맡고, 고객은 데이터·접근제어·암호화 설정 책임.
- **SaaS (S3, DynamoDB)**: AWS가 인프라 거의 전부를 맡고, 고객은 **데이터 분류와 접근제어**만 책임. 그래도 데이터 책임은 절대 AWS로 넘어가지 않는다.

> 💡 **관련 이론**: 이것을 "shifting line of responsibility"라고 부른다. 같은 "패치"라도 EC2의 OS 패치는 고객 책임이지만 Fargate의 OS 패치는 AWS 책임이다. 시험에서 "누구의 책임인가"를 묻는 문제는 거의 항상 **서비스가 IaaS/PaaS/SaaS 중 무엇인지**를 먼저 판정하면 풀린다. "Lambda 함수의 OS를 패치하라"는 보기는 함정이다 — Lambda 런타임 OS는 AWS가 패치한다.

> ⚠️ **함정**: S3 데이터 유출 사고에서 "AWS가 책임진다"는 보기는 항상 오답이다. S3의 내구성·가용성은 AWS 책임이지만, **버킷을 public으로 열어둔 설정(접근제어)은 100% 고객 책임**이다. Capital One 사고(2019)도 S3 자체가 뚫린 게 아니라 고객 측 IAM·WAF 설정 오류였다.

## 통제의 3가지 유형: 예방·탐지·대응

보안 엔지니어는 모든 통제를 세 범주로 분류하는 습관을 들여야 한다. SCS-C03의 도메인 구조 자체가 이 분류를 따라간다.

| 유형 | 목적 | 질문 | AWS 예시 |
|------|------|------|----------|
| **Preventive(예방)** | 사고가 일어나지 않게 | "이 행위를 애초에 막을 수 있나?" | IAM 정책, SCP, 보안 그룹, KMS 키 정책, WAF |
| **Detective(탐지)** | 일어난 일을 알아채기 | "이상이 생기면 알 수 있나?" | CloudTrail, GuardDuty, Config, Security Hub, Macie |
| **Responsive(대응/복구)** | 일어난 후 빠르게 회복 | "사고 나면 어떻게 자동 대응하나?" | EventBridge → Lambda/SSM 자동 remediation, 백업 복원 |

> 🔍 **더 깊이**: 성숙한 보안 아키텍처는 세 유형을 **계층적으로(defense in depth)** 쌓는다. 예방이 뚫려도 탐지가 잡고, 탐지가 늦어도 대응이 피해를 줄인다. 시험에서 "이 위협을 막을 가장 좋은 방법"을 물을 때, 단일 통제만 고른 보기보다 "예방 + 탐지 + 자동 대응"을 조합한 보기가 정답인 경우가 많다. 단, "가장 먼저(first/immediate)"를 물으면 보통 예방 통제(SCP, 키 정책)가 답이다.

## SCS-C03이 측정하는 6개 도메인

2024년 개정된 SCS-C03은 65문항, 170분, 750/1000점 합격 기준이다. 시험 청사진(exam guide)은 6개 도메인과 가중치를 명시한다.

| # | 도메인 | 가중치 | 한 줄 요약 |
|---|--------|--------|-----------|
| 1 | **Threat Detection and Incident Response** | 14% | GuardDuty·Detective로 위협 탐지, 사고 대응 플레이북, 포렌식 |
| 2 | **Security Logging and Monitoring** | 18% | CloudTrail·Config·CloudWatch·Security Hub로 가시성 확보 |
| 3 | **Infrastructure Security** | 20% | VPC·보안 그룹·NACL·WAF·Shield·네트워크 경계 방어 |
| 4 | **Identity and Access Management** | 16% | IAM·STS·Identity Center·페더레이션·정책 평가 |
| 5 | **Data Protection** | 18% | KMS·암호화·S3 보호·Secrets Manager·인증서 |
| 6 | **Management and Security Governance** | 14% | Organizations·SCP·Control Tower·규정 준수·멀티 계정 거버넌스 |

가중치를 보면 **도메인 3(인프라 20%) + 도메인 2(로깅 18%) + 도메인 5(데이터 18%)**가 시험의 절반 이상이다. 하지만 도메인 4(IAM 16%)는 **다른 모든 도메인의 전제**다. KMS 키 정책도 IAM 평가 로직 위에서 동작하고, cross-account 로깅도 AssumeRole 위에서 동작한다. 그래서 Week 1을 IAM에 통째로 할당하는 것이다.

> 💡 **관련 이론**: 도메인은 따로 외우는 6개의 과목이 아니라 **하나의 사고 흐름**이다. 위협이 들어온다(D1 탐지) → 그게 보이려면 로그가 있어야 하고(D2) → 들어오는 길목은 네트워크(D3) → 그 안에서 권한은 IAM(D4) → 보호 대상은 데이터(D5) → 이 모든 걸 조직 차원에서 강제(D6). 시나리오 문제는 보통 2-3개 도메인을 한 묶음으로 엮는다.

## 데이터 분류와 최소 권한: 보안 사고의 두 출발점

실무에서 보안 사고의 근본 원인을 추적하면 거의 항상 두 가지로 귀결된다. 하나는 **데이터를 분류하지 않아서** 무엇을 얼마나 보호해야 하는지 몰랐던 것, 다른 하나는 **과도한 권한**이다.

데이터 분류(data classification)는 보호 통제의 출발점이다. PII·결제 정보·헬스 데이터는 어디에 있는가? Amazon Macie가 S3의 민감 데이터를 ML로 자동 분류하는 이유가 여기 있다. 분류 없이는 "이 버킷에 KMS 암호화가 필요한가"라는 질문에 답할 수 없다.

최소 권한(least privilege)은 도메인 4의 심장이지만 모든 도메인에 스며 있다. KMS 키 정책의 최소 권한, S3 버킷 정책의 최소 권한, SCP의 최소 권한. **"권한을 줄 때는 명시적으로, 회수할 때는 기본값으로"**가 IAM 평가 로직의 철학이다(이건 Day 2에서 깊이 본다).

> 📚 **사례**: 2017년 다수의 기업이 S3 버킷을 public-read로 열어둔 채 PII를 저장해 대형 유출이 잇따랐다(Verizon, Accenture 등). AWS는 이 패턴을 막으려 2018년 **S3 Block Public Access**를 도입했고, 2023년부터는 신규 버킷에 기본 활성화했다. 이것이 "예방 통제를 플랫폼 기본값으로 강제"하는 거버넌스(도메인 6)의 전형이다.

## 멀티 계정과 거버넌스: 보안의 blast radius

보안 엔지니어가 단일 계정 사고방식에서 벗어나야 하는 이유는 **폭발 반경(blast radius)** 때문이다. 한 계정이 뚫려도 다른 환경으로 번지지 않게 하려면 계정을 경계로 써야 한다.

표준 멀티 계정 보안 구조는 다음과 같다.

```
[ AWS Organizations 보안 기준 구조 ]

  Management 계정 (billing + SCP 관리, 워크로드 금지)
        |
   +----+----+----------------+--------------+
   |         |                |              |
 Security OU  Infrastructure  Workloads OU   Sandbox OU
   |              OU            (Prod/NonProd)
   +-- Log Archive 계정 (CloudTrail/Config 로그 불변 저장)
   +-- Audit/Security Tooling 계정 (GuardDuty·SecurityHub 위임 관리자)
```

- **Log Archive 계정**: 모든 계정의 CloudTrail·Config 로그를 중앙 집중, S3 Object Lock으로 변조 방지. 사람이 거의 로그인하지 않는다.
- **Security Tooling 계정**: GuardDuty·Security Hub·Detective의 **delegated administrator(위임 관리자)**. 조직 전체의 보안 신호를 한곳에서 본다.
- **SCP**: 권한을 주는 게 아니라 **상한선(guardrail)**을 deny로 긋는다. root에도 적용된다(management 계정 root 예외).

> 🔍 **더 깊이**: GuardDuty·Security Hub·Macie·Config 모두 "delegated administrator" 패턴을 지원한다. management 계정에서 직접 운영하지 않고 **Security Tooling 계정에 위임**하는 것이 모범 사례다. 이유는 최소 권한 — management 계정은 billing·조직 관리만 하고, 보안 운영 권한까지 거기 몰아넣으면 그 계정이 뚫렸을 때 조직 전체가 무너진다.

## 통제를 도메인·유형으로 매핑하는 연습

오늘 배운 두 축(통제 유형 × 책임 경계)으로 주요 서비스를 분류해보자. 이 표가 머리에 있으면 시나리오 문제의 보기를 빠르게 거를 수 있다.

| 서비스 | 도메인 | 통제 유형 | 한 줄 역할 |
|--------|--------|----------|-----------|
| IAM / SCP | 4, 6 | 예방 | 누가 무엇을 할 수 있는지 제한 |
| KMS | 5 | 예방 | 암호화 키로 데이터 접근 통제 |
| 보안 그룹 / NACL | 3 | 예방 | 네트워크 트래픽 필터 |
| WAF / Shield | 3 | 예방 | 웹 공격·DDoS 차단 |
| CloudTrail | 2 | 탐지 | API 호출 감사 로그 |
| GuardDuty | 1, 2 | 탐지 | ML 기반 위협 탐지 |
| Config | 2, 6 | 탐지 | 리소스 구성 규정 준수 평가 |
| Macie | 5, 2 | 탐지 | S3 민감 데이터 분류 |
| Security Hub | 2, 1 | 탐지 | 보안 발견 사항 집계·표준 점검 |
| EventBridge + SSM/Lambda | 1 | 대응 | 자동 remediation |

> 🎯 **시나리오**: "S3 버킷에 PII가 암호화 없이 저장돼 있다는 사실을 사후에 알게 됐다. 재발을 막을 통제 조합은?" 단일 답이 아니다. **탐지**(Macie로 민감 데이터 발견 + Config rule `s3-bucket-server-side-encryption-enabled`) + **예방**(SCP로 미암호화 PutObject 차단, S3 Block Public Access) + **대응**(EventBridge → Lambda로 자동 암호화/격리). 세 유형을 한 번에 떠올리는 게 SCS-C03의 사고법이다.

## 정리하며 — 앞으로의 지도

오늘 그린 그림 세 가지를 새기자. 첫째, **공동 책임 모델**은 서비스 유형(IaaS/PaaS/SaaS)에 따라 책임선이 움직이며, 데이터와 접근제어는 어떤 경우에도 고객 책임이다. 둘째, 모든 통제는 **예방·탐지·대응** 세 유형으로 분류되고, 성숙한 아키텍처는 셋을 계층으로 쌓는다. 셋째, **6개 도메인**은 따로 외우는 과목이 아니라 위협 → 가시성 → 네트워크 → 신원 → 데이터 → 거버넌스로 흐르는 하나의 사고 사슬이다.

내일부터는 그 사슬의 척추인 IAM으로 들어간다. 사용자·그룹·역할·정책이 무엇이고, AWS가 한 요청을 허용할지 거부할지 결정하는 평가 로직이 정확히 어떻게 돌아가는지를 파면, 나머지 모든 도메인이 그 위에 얹히는 구조라는 것이 보이기 시작할 것이다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 Amazon RDS for PostgreSQL을 사용 중이다. 공동 책임 모델에서 **AWS의 책임**에 해당하는 것은?

A) 데이터베이스에 저장되는 PII의 분류와 암호화 활성화 결정  
B) 데이터베이스 사용자 계정과 IAM 인증 정책 구성  
C) 데이터베이스 엔진의 보안 패치 적용  
D) 보안 그룹으로 DB 포트 접근을 제한하는 설정  

**정답: C**  
해설: RDS는 관리형(PaaS) 서비스라서 엔진·OS의 패치는 AWS가 책임진다(고객은 유지보수 윈도우만 관리). 데이터 분류·암호화 활성화 여부, DB 사용자/IAM 인증, 보안 그룹 설정은 모두 "클라우드 안(in the cloud)"의 고객 책임이다. 데이터와 접근제어는 어떤 서비스 유형에서도 AWS로 넘어가지 않는다는 점이 핵심이다.

---

**문제 2.** 다음 중 **예방(preventive) 통제**가 아닌 것은?

A) SCP로 특정 리전 외 EC2 실행을 deny  
B) KMS 키 정책으로 특정 계정만 복호화 허용  
C) GuardDuty로 비정상 API 호출 패턴을 탐지  
D) 보안 그룹으로 인바운드 트래픽을 443만 허용  

**정답: C**  
해설: GuardDuty는 이미 발생한(또는 발생 중인) 위협을 알아채는 탐지(detective) 통제다. SCP·KMS 키 정책·보안 그룹은 모두 행위가 일어나기 전에 막는 예방 통제다. "탐지"는 사고를 막지 못하고 알아챌 뿐이라는 차이가 통제 유형 분류의 핵심이며, 시험에서 "가장 먼저 사고를 막을 방법"을 물으면 예방 통제가 답이 된다.

---

**문제 3.** SCS-C03 도메인 중 가중치가 가장 높은 영역과, 그 영역이 다루는 주제로 가장 적절한 조합은?

A) Identity and Access Management — KMS 키 회전 정책  
B) Infrastructure Security — VPC·보안 그룹·WAF 등 네트워크 경계 방어  
C) Data Protection — Organizations SCP로 조직 거버넌스  
D) Threat Detection and Incident Response — CloudTrail 로그 보존 정책  

**정답: B**  
해설: 가중치가 가장 높은 도메인은 Infrastructure Security(20%)이고, VPC·보안 그룹·NACL·WAF·Shield 같은 네트워크 경계 방어를 다룬다. KMS는 Data Protection, SCP는 Management and Governance, CloudTrail 보존은 Logging and Monitoring 영역으로, 나머지 보기는 도메인과 주제가 어긋나 있다.

---

**문제 4.** 멀티 계정 환경에서 GuardDuty와 Security Hub를 운영할 때 AWS 모범 사례로 가장 적절한 것은?

A) Management 계정에서 직접 GuardDuty와 Security Hub를 운영한다  
B) 각 워크로드 계정이 독립적으로 GuardDuty를 켜고 개별 관리한다  
C) 별도의 Security Tooling 계정을 delegated administrator로 지정해 조직 전체를 집계한다  
D) Log Archive 계정에서 GuardDuty를 운영해 로그와 탐지를 한곳에 둔다  

**정답: C**  
해설: GuardDuty·Security Hub·Macie·Config는 delegated administrator(위임 관리자) 패턴을 지원하며, 전용 Security Tooling 계정에 위임하는 것이 모범 사례다. Management 계정은 billing·조직 관리만 맡아야 폭발 반경이 작아지고, 워크로드 계정별 개별 운영은 가시성이 파편화된다. Log Archive 계정은 로그 불변 저장 전용이라 보안 운영 도구를 두지 않는다.

---

**문제 5.** S3 버킷의 PII가 외부에 유출되는 사고가 발생했다. 조사 결과 버킷이 public-read로 설정돼 있었다. 공동 책임 모델 관점에서 가장 정확한 판단은?

A) S3 인프라가 뚫린 것이므로 AWS의 책임이다  
B) 버킷 접근제어 설정은 고객 책임이므로 고객의 구성 오류다  
C) 데이터 내구성 문제이므로 AWS와 고객이 절반씩 책임진다  
D) S3는 SaaS이므로 데이터 보호 책임 전부가 AWS에 있다  

**정답: B**  
해설: S3의 내구성·가용성·물리 인프라는 AWS 책임이지만, 버킷 정책·ACL·Block Public Access 같은 접근제어 설정은 100% 고객 책임이다. SaaS 성격이 강한 S3라도 데이터 분류와 접근제어 책임은 절대 AWS로 넘어가지 않는다. 이런 사고를 막기 위해 AWS는 Block Public Access를 기본 통제로 강제하는 방향으로 발전시켰다.

---
