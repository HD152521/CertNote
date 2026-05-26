# Day 5 - Week 1 종합: 시나리오로 단단해지는 기초와 IAM

한 주 동안 글로벌 인프라부터 멀티 계정 거버넌스까지 훑었다. 머리로는 다 안다고 느껴도, SAA-C03 시험은 항상 한 줄짜리 시나리오로 변형해서 묻는다. "본사 밖으로 데이터가 못 나간다"라는 한 문장에서 Outposts가 떠올라야 하고, "TCP 게임 서버 글로벌 지연 최소화"에서 Global Accelerator가 즉시 튀어나와야 한다. 시험은 키워드를 외운 사람을 거르는 게 아니라 "이 시나리오의 본질이 무엇이냐"를 빠르게 판단할 수 있는 사람을 뽑으려 한다.

이 글은 Week 1을 다시 정리하면서 시나리오 키워드 → 솔루션 매핑을 머리에 새기는 시간이다. 단순 암기가 아니라 "왜 그 답인지"를 한 번 더 짚는다. 시나리오 매핑은 시험 전날 다시 한 번 통독하면 합격선이 확실히 올라가는 영역이기도 하다. 그리고 실무에서는 이 매핑이 곧 "사고가 나기 전에 다른 사람이 짠 설계를 검토하는 능력"이 된다 — 1주차에서 본 모든 사건(Capital One, us-east-1, 도쿄 AZ, SolarWinds, Travis CI)이 결국 누군가가 같은 매핑을 헷갈렸을 때 일어났다.

## Week 1 그림 다시 그리기

```
[ AWS Global Infrastructure ]
       │
       ├── Region (34) ──┬── AZ (3+) ──┬── DC
       │                 │             └── DC
       │                 └── AZ ── DC
       ├── Edge Location (600+) ── CloudFront / R53 / GA / WAF
       ├── Local Zone (30+) ── 미니 리전
       ├── Wavelength ── 5G 엣지
       └── Outposts ── 고객 DC

[ Identity ]
   User / Group / Role / Policy
       │
   AssumeRole (STS) → 임시 자격 증명
       │
   ┌─── External ID (Confused Deputy 방어)
   ├─── Permissions Boundary (권한 상한)
   ├─── ABAC (태그 기반)
   └─── OIDC/SAML (페더레이션)

[ Multi-Account ]
   Organizations → OU 트리
       │
   ┌─── SCP (계정 권한 상한)
   ├─── Control Tower (자동 Landing Zone)
   ├─── RAM (리소스 공유)
   └─── StackSets (일괄 배포)
```

이 세 영역이 Week 1의 결론이고, Week 2 ~ Week 12의 모든 서비스가 이 세 평면 위에 얹어진다고 보면 정확하다. 네트워킹은 AZ 위, 보안은 IAM 위, 다계정 패턴은 Organizations 위에서 동작한다. 그리고 이 세 평면의 교집합 — "어느 계정의 어느 리전 어느 AZ에 있는 리소스에 누가 무엇을 할 수 있는가" — 가 결국 모든 SAA 시나리오의 좌표계가 된다.

> 💡 **관련 이론**: 이 3층 모델은 사실 분산 시스템 보안의 고전적인 3축 — *Where*(위치), *Who*(신원), *What*(자원) — 을 클라우드 운영에 매핑한 것이다. 1985년 NIST가 정의한 보안 3요소(Confidentiality / Integrity / Availability)에 더해, 2003년 NIST SP 800-53이 명문화한 Access Control(AC), Audit & Accountability(AU), System and Communications Protection(SC) 세 영역이 거의 일대일로 매칭된다. AC는 IAM, AU는 CloudTrail/Config, SC는 VPC/네트워크 컨트롤로 구현된다.

> 🔍 **더 깊이**: 이 3층은 실제 AWS의 권한 평가 엔진에서도 그대로 반영된다. AWS Zelkova(IAM 정형 검증)와 Tiros(네트워크 정형 검증)는 각각 IAM/SCP 정책과 VPC 라우팅을 SMT 제약으로 변환해서 "이 요청이 도달 가능한가"를 푼다. 2018년 USENIX Security 논문 "Semantic-based Automated Reasoning for AWS Access Policies"가 Zelkova의 기반이고, 같은 해 발표된 "Reachability Analysis for AWS-based Networks"가 Tiros의 기반이다. Access Analyzer, Reachability Analyzer, IAM Access Advisor가 모두 이 위에서 돌아간다.

## 시나리오 키워드 매핑

| 시나리오 키워드 | 정답 후보 | 이유 |
|---------------|----------|------|
| "본사 안에 데이터 유지" + "AWS API 사용" | Outposts | 고객 DC 안 AWS 하드웨어 |
| "5G", "자율주행", "AR/VR" | Wavelength | 통신사 엣지 |
| "후반 작업 VFX", "LA·마이애미 도시 사용자" | Local Zones | 도시 단위 미니 리전 |
| "TCP/UDP", "게임", "VoIP" | Global Accelerator | L4 가속 |
| "HTTP 정적 콘텐츠 캐시" | CloudFront | L7 캐시 |
| "DNS 페일오버" | Route 53 | DNS 라우팅 |
| "다계정", "Okta SSO" | IAM Identity Center | SAML/SCIM 페더레이션 |
| "GitHub Actions에서 AWS 배포" | OIDC 페더레이션 | 단명 토큰 |
| "외부 SaaS 모니터링" | Cross-Account Role + External ID | Confused Deputy 방어 |
| "개발자가 Role을 만들지만 광범위 권한 금지" | Permissions Boundary | 권한 상한 |
| "모든 계정에서 특정 리전 차단" | SCP | 계정 권한 상한 |
| "새 계정 자동 베이스라인 적용" | Control Tower + StackSets | 자동 Landing Zone |
| "여러 계정에서 VPC 공유" | AWS RAM | 리소스 공유 |
| "EC2가 S3 접근 시 안전한 방법" | Instance Profile + IAM Role | 키 노출 방지 |
| "MFA 강제" | 정책 Condition `aws:MultiFactorAuthPresent` | IAM 강제 |
| "AZ 한 곳 죽어도 서비스 유지" | Multi-AZ ASG + ELB | HA 패턴 |
| "한 리전 죽어도 1초 RPO" | Aurora Global Database | DR 패턴 |
| "데이터 주권 + 한국 금감원 규제" | Outposts / 국내 리전 | 데이터 위치 제한 |
| "기존 IdP를 그대로 쓰면서 AWS 권한 부여" | IAM Identity Center + SAML | 외부 IdP 페더레이션 |
| "Lambda가 다른 계정 S3 접근" | Cross-Account Role + Resource Policy | 양쪽 모두 Allow 필요 |
| "Active Directory 사용자에게 AWS 권한" | AD Trust + IAM Identity Center | 엔터프라이즈 표준 |
| "임시 직원에게 기한 정해 권한" | Session Tag + Permissions Boundary | 자동 만료 + 상한 |
| "S3 버킷 의도치 않은 공개 차단" | Block Public Access (계정+버킷 4단) | 데이터 유출 방지 |

이 표는 시험 전날 30분이면 통독되고, 같은 매핑을 5번 이상 반복해서 보면 시험장에서 시나리오 첫 줄만 보고 후보 답이 떠오른다. 키워드 → 솔루션 매핑은 SAA의 "패턴 인식 시험"적 성격을 가장 잘 보여준다.

> 💡 **관련 이론**: 이런 패턴 매핑 방식은 인지심리학의 *Recognition-Primed Decision Making*(RPD, Gary Klein 1989) 모델과 정확히 같다. 응급실 의사, 소방관, 체스 마스터가 "초보자처럼 모든 옵션을 계산"하지 않고 "이 상황은 X패턴, 그러니 Y해법"으로 즉시 가는 사고방식. AWS SAA도 결국 200개 정도의 시나리오 패턴을 분류하는 시험이다. Daniel Kahneman의 *Thinking, Fast and Slow*(2011)에서 말한 System 1(직관)과 System 2(분석)로 보면, SAA 시험은 System 1을 패턴화시켜 빠르게 후보를 좁힌 뒤 System 2로 검증하는 흐름이 가장 효율적이다.

> ⚠️ **함정**: 같은 키워드가 다른 답으로 가는 경우도 많다. "암호화"는 KMS인가 CloudHSM인가? 단일 회사 사용이면 KMS, FIPS 140-2 Level 3 규제(FedRAMP High, 일부 금융)면 CloudHSM. "DR"은 Multi-AZ인가 Cross-Region인가? AZ 단위 격리는 Multi-AZ, 리전 단위 격리는 Cross-Region. 키워드만 보지 말고 "이 시나리오의 위협 모델이 무엇이냐"를 함께 봐야 한다.

## CAP/PACELC와 AWS 서비스 매핑

SAA에서 직접 묻지는 않지만, 시나리오 해석에 결정적이다. 분산 시스템의 trade-off를 모르면 "왜 이 옵션이 강한 일관성을 못 주는가" 같은 질문에 답을 못 한다. 그리고 이 매핑은 실무에서도 "왜 우리 서비스의 글로벌 일관성이 깨졌는가"를 디버깅할 때 직접 쓰인다.

| 서비스 | 정합성 모델 | 위치 |
|--------|------------|------|
| DynamoDB (default) | Eventually Consistent | AP |
| DynamoDB (strong) | Strong Consistent (단일 리전) | CP |
| DynamoDB Global Table | Multi-Master, Last-Writer-Wins | AP |
| Aurora (single region) | Strong | CP |
| Aurora Global DB | Async replication | AP (리전 간) |
| RDS Multi-AZ | Sync replication | CP |
| S3 | Strong read-after-write (2020.12 이후) | CP |
| EFS | Strong (close-to-open) | CP |
| ElastiCache for Redis (Cluster Mode) | Async replication | AP |
| FSx for Lustre | Strong (POSIX) | CP |
| Neptune | Strong (single writer) | CP |

> 💡 **관련 이론**: CAP 정리(Brewer 2000, Gilbert & Lynch 2002)는 네트워크 분할이 있을 때 Consistency와 Availability 중 하나를 골라야 한다고 말한다. PACELC(Abadi 2012)는 그 위에 "분할이 없을 때도 Latency vs Consistency의 trade-off가 있다"고 덧붙인다. AWS의 거의 모든 글로벌 서비스가 PA/EL(분할 시 가용성, 평상시 지연시간) 쪽으로 기울어 있다. 2020년 12월 S3가 strong read-after-write consistency를 갖게 된 건 분산 시스템 역사상 큰 사건이다. 그 전까지는 새 객체는 즉시 보였지만 update/delete 후에는 eventual이라 SAA 시험 함정 단골이었다. 지금은 모든 S3 작업이 strong consistent다 — 단 객체 메타데이터 캐싱(CloudFront, ALB origin) 레이어는 여전히 eventual.

> 🔍 **더 깊이**: DynamoDB의 strong consistency는 단일 리전 안에서만 옵션으로 제공되고(`ConsistentRead=true`), Global Table은 항상 eventual이다. Global Table의 충돌 해결은 **Last-Writer-Wins**(LWW) 기반이라 동시 쓰기 시 데이터 손실 가능성이 있다. 그래서 멀티 마스터 글로벌 쓰기가 필요하면 DynamoDB Global Table을 쓰되 "타임스탬프 충돌이 비즈니스적으로 허용 가능한가"를 먼저 따져야 한다. 더 엄격한 일관성이 필요하면 CRDT(Conflict-free Replicated Data Type)나 Paxos/Raft 기반 합의 알고리즘이 필요한데, AWS는 이를 Aurora의 quorum-based replication(6-way write across 3 AZ, 4/6 read, 3/6 write 쿼럼)으로 일부 제공한다. Aurora 논문 *Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases*(SIGMOD 2017)가 이 아키텍처의 정수다.

> 📚 **사례**: 2015년 GitHub은 자체 MySQL 클러스터 분할 사고로 24시간 동안 데이터 일관성이 깨졌다. 두 데이터센터 간 네트워크 분할이 발생했고, 양쪽 모두 자신이 primary라고 판단해 쓰기를 받아버린 split-brain 사건이다. 사후 분석 보고서에서 GitHub은 "분할 시 우리는 CP를 선택하고 가용성을 포기한다"고 명시했다. 이런 사례는 CAP의 trade-off가 추상적 이론이 아니라 매일 운영자가 마주하는 결정임을 보여준다. AWS는 RDS Multi-AZ에서 같은 결정을 내렸고, 그래서 failover 동안 60초 정도 가용성이 끊긴다.

> ⚠️ **함정**: "Aurora는 strong consistent이므로 글로벌 DB도 같다"고 가정하면 틀린다. Aurora Global Database는 **storage-level async replication**(보통 1초 RPO)이고 secondary 리전은 read-only다. 글로벌 쓰기를 원하면 DynamoDB Global Table을 써야 하지만 그건 LWW의 충돌 위험을 받아들여야 한다. 또 "ElastiCache Redis Cluster Mode는 ASync replication이지만 multi-AZ failover로 가용성 보장"이라고 보는 것도 부분적으로 틀리다 — failover 시 ack되지 않은 쓰기는 손실될 수 있다.

## 공동 책임 모델 재정리

```
       추상화 ↑                              AWS 책임 ↑
┌─────────────────────────────────────┐
│ S3, DynamoDB, Lambda (완전 관리)    │ 데이터 분류·IAM만 고객
│ RDS, Fargate (PaaS)                 │ + 네트워크 설정 고객
│ ECS on EC2, EKS Self-Managed        │ + OS 패치 고객
│ EC2 + EBS (IaaS)                    │ OS·앱 전부 고객
└─────────────────────────────────────┘
       추상화 ↓                              고객 책임 ↑
```

서비스 추상화가 올라갈수록 책임 경계선이 위로. **그래도 데이터 분류·IAM·암호화 키 관리는 항상 고객**이라는 점이 핵심. 이 원칙은 Capital One 사고가 가장 명확하게 보여준다 — AWS는 자기 인프라 책임을 다했고, 사고는 고객 영역의 IMDSv1·과한 IAM 권한에서 났다.

> 📚 **사례**: 2022년 6월 Toyota 자회사가 GitHub 공개 저장소에 5년간 액세스 키가 노출된 사고가 있었다. 약 30만 명 고객 데이터가 위험에 노출됐고, 원인은 개발자가 코드와 함께 자격 증명을 푸시한 것이었다. AWS 책임은 0% — 모든 게 고객 책임 영역에서 일어났다. 사후 표준 권고는 ① IAM User 대신 IAM Role + IRSA/Instance Profile, ② Access Key를 발급해야 한다면 IAM Identity Center의 임시 자격 증명, ③ Git pre-commit hook(git-secrets, truffleHog)으로 커밋 차단. 같은 패턴의 사고가 Uber(2016), Imperva(2019), Codecov(2021)에서도 반복됐다.

> 🔍 **더 깊이**: 공동 책임 모델은 서비스마다 미묘하게 다르다. RDS는 DB 엔진 패치(minor version)는 AWS, major version 업그레이드는 고객 선택. Lambda는 런타임 패치는 AWS, 런타임 EOL 후 마이그레이션은 고객(Node 14 → 18 등). ECS Fargate는 컨테이너 OS·런타임은 AWS, 이미지 안의 OS 패키지 패치는 고객. 이 미묘한 차이가 시험 함정에 자주 등장한다. AWS Trusted Advisor와 AWS Security Hub의 Foundational Security Best Practices(FSBP)가 이런 책임 경계를 자동 점검해준다.

## 정책 평가 결정 트리

```
요청 → SCP(Org) → Resource Policy → Identity Policy → Permissions Boundary → Session Policy
   각 단계에서 명시 Deny → 즉시 DENY
   모든 단계 통과 → ALLOW
   어느 곳도 Allow 없음 → DENY (default)
```

같은 계정 = 합집합, 교차 계정 = 교집합, KMS = Key Policy 명시 위임 필수. 이 세 줄이 IAM 평가 로직의 전부다. 면접에서 "AWS IAM 평가 로직을 1분 안에 설명해보라"는 질문을 받았다면 이 세 줄이 답이다.

> ⚠️ **함정**: "Resource Policy만 Allow하면 Cross-Account가 된다"는 게 가장 흔한 오답. 같은 계정이면 그게 맞지만, 교차 계정에서는 호출자 계정의 Identity Policy에서도 Allow가 있어야 한다. 시험 단골 함정. 또 KMS는 별격이다 — Key Policy에서 명시적으로 IAM에게 위임("Enable IAM User Permissions" statement)하지 않으면 IAM 정책에서 Allow를 줘도 KMS 키를 못 쓴다. 이는 KMS가 "키 소유자가 최종 권한자"라는 모델이기 때문이다.

> 🔍 **더 깊이**: 정책 평가는 사실 6개 정책 타입의 교차로 결정된다 — SCP, Resource Policy, Identity Policy, Permissions Boundary, Session Policy, VPC Endpoint Policy. AWS 공식 문서의 "Policy Evaluation Logic" 흐름도가 가장 정확한 레퍼런스다. 각 정책 타입의 "Allow 필요 vs 선택"이 시나리오마다 다르다. 한 마디 요약: **명시 Deny는 항상 최종, Allow는 모든 경계를 통과해야**.

> 💡 **관련 이론**: 이 모델은 보안 이론의 *Mandatory Access Control*(MAC)과 *Discretionary Access Control*(DAC)의 혼합이다. SCP와 Permissions Boundary는 MAC(상위 권한자가 강제하는 한도), Identity/Resource Policy는 DAC(소유자가 자유롭게 설정). 미국 군사 보안 표준 *Bell-LaPadula Model*(1973)의 multilevel security 개념과 유사하다. AWS가 정책 평가를 SMT solver로 푸는 것도 이 모델이 형식 검증 가능한 구조를 갖기 때문.

## 다계정 표준 토폴로지

| 계정 | 역할 |
|------|------|
| Management | Org 관리, 결제. 워크로드 금지 |
| Log Archive | CloudTrail/Config 중앙 저장. WORM |
| Audit/Security | GuardDuty, Security Hub 위임 관리자 |
| Networking | 중앙 VPC + Transit Gateway, RAM 공유 |
| Shared Services | 공통 도구(CI/CD, Artifactory 등) |
| Prod | 운영 워크로드 |
| Staging | 운영 직전 검증 |
| Dev | 개발 워크로드 |
| Sandbox | 개인 실험. SCP로 비용·리전 강제 제한 |

이 토폴로지는 AWS Security Reference Architecture(SRA) 문서에 권장 형태로 명시되어 있다. 모든 대기업 고객이 이 변형을 쓴다고 보면 정확하다. Netflix, Capital One, Airbnb, Slack 등의 공개 발표 자료를 보면 거의 같은 패턴이 반복된다.

> 📚 **사례**: 2019년 Netflix Tech Blog는 자사 다계정 전략을 공개했는데, 1,000개 이상의 AWS 계정을 운영하면서 워크로드별·팀별·환경별로 계정을 잘게 쪼개는 "Account per Workload" 패턴을 표준화했다고 밝혔다. 이유는 ① 블래스트 반경 제한, ② 비용·태그 자동화, ③ IAM 권한 단순화. 같은 패턴을 Spotify, Lyft, Stripe도 채택했고, 이게 SRA가 권장하는 토폴로지의 실제 모델이다. 2023년 기준 큰 회사는 보통 100~5,000 계정을 운영하고, AWS Organizations의 한도(10,000 계정/Org)가 사실상 상한이다.

> 🔍 **더 깊이**: 다계정 운영의 실무 핵심은 두 가지 자동화다. ① 계정 발급 자동화 — Control Tower의 Account Factory 또는 Account Factory for Terraform(AFT)으로 새 계정 생성 → 베이스라인 적용 → 권한 부여 → 알림이 GitOps 흐름으로 묶인다. ② 베이스라인 자동 배포 — CloudFormation StackSets의 `SERVICE_MANAGED + auto-deployment=Enabled` 옵션으로 새 계정에 자동으로 보안 베이스라인(GuardDuty, Config Rules, IAM Password Policy, S3 BPA 등)이 들어간다. 이 두 자동화가 없으면 100계정 운영은 사람으로 불가능하다.

## 자주 헷갈리는 핵심 비교

| 항목 | A | B | 차이 |
|------|---|---|------|
| Local Zones | LA·마이애미 등 도시 미니 리전 | Wavelength: 통신사 5G 엣지 | LZ는 일반 인터넷, WL은 모바일 5G |
| CloudFront | L7 HTTP 캐시 | Global Accelerator: L4 가속 | HTTP면 CF, TCP/UDP면 GA |
| IAM User | 영구 자격 증명 | IAM Identity Center: 임시 SSO | 다계정·외부 IdP면 IC |
| ZoneName | 계정별 셔플 | ZoneId: 계정 무관 동일 | 다계정 동기화는 ZoneId |
| Permissions Boundary | 신원 권한 상한 | SCP: 계정 권한 상한 | 적용 단위가 다름 |
| Cross-Region Read Replica | Async, 수동 promote | Aurora Global DB: Async + Fast failover (~1분) | RPO·RTO 차이 |
| CloudFront Functions | 엣지 PoP, 1ms 제약 | Lambda@Edge: Regional Edge, 더 무거움 | 위치·런타임 차이 |
| KMS | 멀티 테넌트 HSM | CloudHSM: 단독 HSM, FIPS 140-2 L3 | 규제 강도 |
| STS AssumeRole | 일반 cross-account | AssumeRoleWithWebIdentity: OIDC | 외부 IdP 페더레이션 |
| Resource Policy Allow | Same-account 충분 | Cross-account: 양쪽 Allow 필요 | 평가 로직 |

> ⚠️ **함정**: ZoneName vs ZoneId는 시험에 자주 안 나오지만, 실무에서는 "다른 계정과 같은 AZ 쓰기"를 묻는 보안·비용 시나리오에서 결정적이다. CloudFront vs Global Accelerator는 시험 단골이고, 키워드 "TCP/UDP", "게임", "VoIP", "MQTT", "WebRTC 시그널링"이 보이면 무조건 GA. CloudFront Functions vs Lambda@Edge도 같은 비교 축인데, "수 ms 미만 응답"이면 Functions, "Node.js/Python 런타임 풀 사용"이면 Lambda@Edge.

> 🔍 **더 깊이**: AWS는 같은 기능을 여러 서비스로 제공할 때 항상 trade-off 축이 다르다. KMS vs CloudHSM은 **추상화 vs 격리도**, ALB vs NLB는 **L7 기능 vs L4 throughput**, SQS vs SNS vs EventBridge는 **point-to-point vs fanout vs schema-routing**. SAA 시험은 항상 "어느 축에서 trade-off를 묻고 있느냐"를 식별해야 한다. 이 사고법을 익히면 모르는 새 서비스도 동일한 축 위에 매핑해서 후보 답을 좁힐 수 있다.

## 정리하며

Week 1은 "AWS라는 우주의 좌표계"를 머리에 박는 시간이었다. Region/AZ/Edge의 격리 모델, IAM의 정책 평가, 다계정의 거버넌스. 이 셋이 나머지 11주 모든 주제의 배경이 된다. 다음 주는 그 위에 **네트워킹**(VPC, 서브넷, 라우팅)을 얹는다. 한 번에 다 이해하려 하지 말고, 시나리오 문제 풀 때마다 이 표를 다시 펴서 매핑하는 습관을 들이면 시험 직전엔 키워드 → 솔루션 매핑이 자동 반사로 박힌다. 그리고 그 자동 반사가 SAA 합격뿐 아니라 실무 설계에서도 "30분 미팅 안에 솔루션 후보 3개를 그릴 수 있는" 시니어 엔지니어의 핵심 역량이다.

---

## 📝 종합 연습 문제

**문제 1.** 한 글로벌 게임 회사가 전 세계 사용자에게 일관된 TCP 기반 게임 서버 응답 시간을 제공하려 한다. 가장 적합한 솔루션은?

A) CloudFront + Lambda@Edge
B) Global Accelerator
C) Route 53 Latency Routing
D) ElastiCache Global Datastore

**정답: B**
해설: TCP/UDP면 무조건 L4 가속인 Global Accelerator. CloudFront는 HTTP L7만, Route 53은 DNS 응답만 다르게 줄 뿐 트래픽 가속 X. ElastiCache는 캐시 서비스로 무관. Global Accelerator는 BGP Anycast 2개의 정적 IP를 제공하므로 DNS TTL과 무관하게 라우팅이 변경되고, 백본망을 거치기 때문에 패킷 손실률·jitter도 줄어든다. 실측치로 보면 글로벌 사용자의 p99 latency가 30-60% 줄어드는 경우가 흔하다.

---

**문제 2.** 한 금융 회사가 한국 금융감독원 규정으로 일부 데이터를 본사 내부에 보관하면서도 AWS API로 운영해야 한다. 가장 적합한 솔루션은?

A) Direct Connect만 사용
B) Local Zones
C) Outposts
D) Snowball Edge

**정답: C**
해설: 고객 데이터센터 안에 AWS 하드웨어 + 동일 API. 전자금융감독규정·GDPR Schrems II 같은 규제 시나리오의 정답. Local Zones는 AWS 운영 시설, Direct Connect는 전용선, Snowball Edge는 일회성 데이터 이전용. Outposts는 "내 건물 + AWS API"가 동시에 필요한 거의 유일한 시나리오에 쓴다 — 그렇지 않으면 Direct Connect로 충분한 경우가 많다. 비용으로는 Outposts가 3년 약정 기준 EC2 대비 1.5~2배 비싼 편이라 규제 외 이유로는 잘 안 쓴다.

---

**문제 3.** 한 회사가 50개 AWS 계정에서 us-east-1 외 모든 리전 사용을 차단하려 한다. 가장 효율적인 방법은?

A) 각 계정마다 IAM 정책 추가
B) Organizations SCP로 `aws:RequestedRegion` 조건 Deny
C) CloudTrail 알림
D) VPC를 us-east-1에만 생성

**정답: B**
해설: 다계정 권한 상한 = SCP. `aws:RequestedRegion` Deny가 표준 패턴. 단 Management 계정엔 SCP 미적용이라 운영 워크로드 두면 안 됨. 글로벌 서비스(IAM, CloudFront, Route 53)는 `aws:RequestedRegion`이 `us-east-1`로 보여서 예외 처리가 필요하다는 미묘한 함정도 같이 챙겨야 한다. 또 SCP 적용 후 기존 리소스는 그대로 남고 새 API 호출만 차단되므로, 기존 다른 리전 리소스 정리는 별도 작업이 필요하다.

---

**문제 4.** EC2가 S3에 접근하는 가장 안전한 방식은?

A) Access Key를 ~/.aws/credentials에 저장
B) IAM Role을 Instance Profile로 attach + IMDSv2
C) root Access Key 사용
D) S3 Public Read 허용

**정답: B**
해설: Instance Profile + IMDSv2. SDK가 임시 자격 증명을 자동 갱신, SSRF도 방어. A는 키 유출 위험, C는 절대 금기, D는 데이터 노출. Capital One 사고의 직접 원인이 IMDSv1이었음을 떠올리면 "왜 IMDSv2를 명시적으로 적어야 하는지"가 분명해진다. 더 완벽한 방어는 EC2 Launch Template에서 `HttpTokens=required` + `HttpPutResponseHopLimit=1`을 강제하고 SCP로 IMDSv1 호출을 차단하는 조합이다.

---

**문제 5.** GitHub Actions가 AWS에 배포할 때 키 회전 부담을 없애려면?

A) IAM User Access Key를 Secret으로 저장
B) OIDC 페더레이션으로 Role 단명 자격 증명
C) EC2를 띄워 SSH 키
D) root 자격 증명

**정답: B**
해설: GitHub OIDC → STS AssumeRoleWithWebIdentity → 단명 토큰. Trust Policy에서 `sub` claim으로 repo·branch 제한. Travis CI 침해 사례가 OIDC 표준화의 결정적 계기. 같은 패턴이 GitLab, Bitbucket, Buildkite 등에도 확장 적용되고 있어서, 이제는 CI 전반의 표준이라 봐도 무방하다. 보안 강화로는 trust policy에 `token.actions.githubusercontent.com:sub` claim을 `repo:org/repo:ref:refs/heads/main`처럼 브랜치까지 잠그는 게 정석이다.

---

**문제 6.** 한 SaaS가 우리 AWS의 CloudWatch 로그를 수집한다. Confused Deputy 방어를 위해 필요한 것은?

A) Cross-Account Role + External ID 조건
B) IAM User에 Access Key 부여
C) S3 Public Read
D) VPN 연결

**정답: A**
해설: External ID는 사전 공유 비밀로 다른 SaaS 고객이 우리 Role ARN을 알아도 빌릴 수 없게 차단. Marketplace ISV 인증의 필수 요건. External ID에 더해 `aws:SourceAccount`나 `aws:SourceArn` 조건을 같이 거는 게 더 안전하다. 2022년 AWS가 발견한 "Confused Deputy" 패턴 점검 결과에 따르면, 다수 ISV가 External ID만 적용하고 SourceArn을 빠뜨려 부분적으로 취약한 상태였다.

---

**문제 7.** 한 회사가 새 AWS 계정을 매주 10개씩 발급하면서 동일한 보안 베이스라인을 적용하려 한다. 가장 적합한 방법은?

A) 운영자가 매번 수동 설정
B) Control Tower Account Factory + StackSets auto-deployment
C) CloudFormation을 각 계정에서 수동 실행
D) Terraform Apply를 매번 실행

**정답: B**
해설: Control Tower가 표준 Landing Zone을 자동 생성, StackSets `SERVICE_MANAGED + auto-deployment Enabled`가 새 계정에 베이스라인을 자동 배포. 운영자 개입 없이 일관성 유지. 더 큰 조직은 Account Factory for Terraform(AFT)으로 GitOps 흐름까지 묶는다. AFT는 새 계정 요청을 PR로 받고, 머지되면 Terraform Cloud가 자동으로 계정 생성·베이스라인 적용·SSO 권한 부여까지 처리한다.

---

**문제 8.** 한 회사가 신입 개발자에게 IAM Role을 자유롭게 만들 권한을 주되, AdministratorAccess급 Role 생성은 막고 싶다. 가장 적절한 방법은?

A) CloudTrail로 사후 감지
B) Permissions Boundary를 강제 첨부 조건으로 정책에 명시
C) 신입 권한을 모두 회수
D) Organizations SCP만 사용

**정답: B**
해설: `iam:CreateRole` 호출 시 `iam:PermissionsBoundary` 조건 강제. 만든 Role의 실효 권한은 Boundary와 교집합으로 제한. SCP는 더 큰 단위(계정·OU)라 같은 계정 안 개별 Role마다 다른 한도를 두는 데 부적합하다. 이게 "권한을 위임하면서도 위임받은 자가 권한을 확장하지 못하게" 만드는 표준 패턴이고, AWS 공식 가이드의 *Delegated Administrator* 모델의 핵심이다.

---

**문제 9.** 한 AZ에서 냉방 장애로 EC2가 다운된다. 이미 ASG가 multi-AZ로 구성되어 있다면?

A) 모든 서비스 다운
B) ASG가 다른 AZ에 자동으로 인스턴스 보충, 서비스 유지
C) RDS Multi-AZ도 같이 다운
D) 수동 페일오버 필요

**정답: B**
해설: 2019년 도쿄 리전 사고 그대로의 시나리오. ASG가 health check 실패 인스턴스를 떨어뜨리고 살아있는 AZ에 새 인스턴스 추가. RDS Multi-AZ는 30-60초 안에 standby로 자동 페일오버. 단 EBS·EFS가 한 AZ에만 묶여 있으면 그 부분은 같이 죽으므로, EFS는 Multi-AZ Standard 클래스로 잡거나 S3/DynamoDB 쪽 저장으로 옮기는 게 안전하다. ALB도 cross-zone load balancing이 기본 활성화되어 다른 AZ로 트래픽이 자동 재분산된다.

---

**문제 10.** 다음 중 AWS 책임이 아닌 것은?

A) 하이퍼바이저 보안
B) 게스트 OS 패치 (EC2)
C) 물리 시설 보안
D) AZ 간 네트워크 암호화

**정답: B**
해설: EC2의 게스트 OS는 고객 책임. IaaS 추상화 레벨 때문에 OS 위 모든 게 고객. Fargate로 바꾸면 OS 패치도 AWS 책임으로 넘어간다. 같은 워크로드를 Lambda로 옮기면 런타임까지 AWS 책임이 된다 — 추상화가 올라갈수록 책임 경계선이 위로 올라간다. 참고로 D의 AZ 간 트래픽 암호화는 2018년 이후 Nitro 인스턴스 간에는 자동 적용되며 고객이 추가 작업할 필요가 없다.

---

**문제 11.** 한 시스템이 트랜잭션당 1ms 미만 RPO를 요구하고 한 리전 안에서만 운영된다. RDS는?

A) Single-AZ Standard
B) Multi-AZ Synchronous Replication
C) Cross-Region Read Replica
D) Aurora Global Database

**정답: B**
해설: 동일 리전 동기 복제로 RPO ≈ 0. AZ 간 1-2ms latency 안에서 commit ack. C는 async라 RPO 초 단위, D는 리전 간 async. RDS Multi-AZ는 standby가 read 트래픽을 받지 않는다는 점(Aurora와 다름)도 같이 알아두면 좋다 — read 분산이 필요하면 Read Replica를 별도로 띄워야 한다. Aurora는 같은 리전 내 6-way replication을 storage layer에서 자동으로 하기 때문에 별도 Multi-AZ 토글이 없다.

---

**문제 12.** 한 회사가 Organizations 안에서 중앙 Networking 계정의 VPC 서브넷을 다른 30개 워크로드 계정에 공유하려 한다. 가장 적합한 솔루션은?

A) VPC Peering을 30번
B) AWS RAM으로 서브넷 공유
C) Transit Gateway만 사용
D) Direct Connect

**정답: B**
해설: RAM으로 서브넷 공유 → 받는 계정은 ENI/EC2를 만들 수 있지만 라우팅·NACL은 못 건드림. 네트워크 설계와 워크로드 운영의 깔끔한 분리. Peering은 점대점, TGW는 라우팅 허브로 보완재. 실제 운영에서는 RAM(서브넷 공유) + Transit Gateway(VPC 간 라우팅 허브) 조합을 같이 쓰는 경우가 가장 많다. RAM은 같은 Organization 안에서만 적용 가능(Resource Sharing Sharing Outside Organization을 켜면 외부 계정도 가능하지만 보안상 거의 안 씀).
