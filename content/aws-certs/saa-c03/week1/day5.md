# Day 5 - Week 1 종합: 시나리오로 단단해지는 기초와 IAM

한 주 동안 글로벌 인프라부터 멀티 계정 거버넌스까지 훑었다. 머리로는 다 안다고 느껴도, SAA-C03 시험은 항상 한 줄짜리 시나리오로 변형해서 묻는다. "본사 밖으로 데이터가 못 나간다"라는 한 문장에서 Outposts가 떠올라야 하고, "TCP 게임 서버 글로벌 지연 최소화"에서 Global Accelerator가 즉시 튀어나와야 한다.

이 글은 Week 1을 다시 정리하면서 시나리오 키워드 → 솔루션 매핑을 머리에 새기는 시간이다. 단순 암기가 아니라 "왜 그 답인지"를 한 번 더 짚는다. 시나리오 매핑은 시험 전날 다시 한 번 통독하면 합격선이 확실히 올라가는 영역이기도 하다.

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

이 세 영역이 Week 1의 결론이고, Week 2 ~ Week 12의 모든 서비스가 이 세 평면 위에 얹어진다고 보면 정확하다. 네트워킹은 AZ 위, 보안은 IAM 위, 다계정 패턴은 Organizations 위에서 동작한다.

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

## CAP/PACELC와 AWS 서비스 매핑

SAA에서 직접 묻지는 않지만, 시나리오 해석에 결정적이다. 분산 시스템의 trade-off를 모르면 "왜 이 옵션이 강한 일관성을 못 주는가" 같은 질문에 답을 못 한다.

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

> 💡 **관련 이론**: CAP 정리(Brewer 2000, Gilbert & Lynch 2002)는 네트워크 분할이 있을 때 Consistency와 Availability 중 하나를 골라야 한다고 말한다. PACELC(Abadi 2012)는 그 위에 "분할이 없을 때도 Latency vs Consistency의 trade-off가 있다"고 덧붙인다. AWS의 거의 모든 글로벌 서비스가 PA/EL(분할 시 가용성, 평상시 지연시간) 쪽으로 기울어 있다. 2020년 12월 S3가 strong read-after-write consistency를 갖게 된 건 분산 시스템 역사상 큰 사건이다. 그 전까지는 새 객체는 즉시 보였지만 update/delete 후에는 eventual이라 SAA 시험 함정 단골이었다. 지금은 모든 S3 작업이 strong consistent다 — 단 객체 메타데이터 캐싱(CloudFront, ALB origin) 레이어는 여전히 eventual.

> 🔍 **더 깊이**: DynamoDB의 strong consistency는 단일 리전 안에서만 옵션으로 제공되고(`ConsistentRead=true`), Global Table은 항상 eventual이다. Global Table의 충돌 해결은 **Last-Writer-Wins** 기반이라 동시 쓰기 시 데이터 손실 가능성이 있다. 그래서 멀티 마스터 글로벌 쓰기가 필요하면 DynamoDB Global Table을 쓰되 "타임스탬프 충돌이 비즈니스적으로 허용 가능한가"를 먼저 따져야 한다.

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

## 정책 평가 결정 트리

```
요청 → SCP(Org) → Resource Policy → Identity Policy → Permissions Boundary → Session Policy
   각 단계에서 명시 Deny → 즉시 DENY
   모든 단계 통과 → ALLOW
   어느 곳도 Allow 없음 → DENY (default)
```

같은 계정 = 합집합, 교차 계정 = 교집합, KMS = Key Policy 명시 위임 필수. 이 세 줄이 IAM 평가 로직의 전부다. 면접에서 "AWS IAM 평가 로직을 1분 안에 설명해보라"는 질문을 받았다면 이 세 줄이 답이다.

> ⚠️ **함정**: "Resource Policy만 Allow하면 Cross-Account가 된다"는 게 가장 흔한 오답. 같은 계정이면 그게 맞지만, 교차 계정에서는 호출자 계정의 Identity Policy에서도 Allow가 있어야 한다. 시험 단골 함정.

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

이 토폴로지는 AWS Security Reference Architecture(SRA) 문서에 권장 형태로 명시되어 있다. 모든 대기업 고객이 이 변형을 쓴다고 보면 정확하다.

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

## 정리하며

Week 1은 "AWS라는 우주의 좌표계"를 머리에 박는 시간이었다. Region/AZ/Edge의 격리 모델, IAM의 정책 평가, 다계정의 거버넌스. 이 셋이 나머지 11주 모든 주제의 배경이 된다. 다음 주는 그 위에 **네트워킹**(VPC, 서브넷, 라우팅)을 얹는다. 한 번에 다 이해하려 하지 말고, 시나리오 문제 풀 때마다 이 표를 다시 펴서 매핑하는 습관을 들이면 시험 직전엔 키워드 → 솔루션 매핑이 자동 반사로 박힌다.

---

## 📝 종합 연습 문제

**문제 1.** 한 글로벌 게임 회사가 전 세계 사용자에게 일관된 TCP 기반 게임 서버 응답 시간을 제공하려 한다. 가장 적합한 솔루션은?

A) CloudFront + Lambda@Edge
B) Global Accelerator
C) Route 53 Latency Routing
D) ElastiCache Global Datastore

**정답: B**
해설: TCP/UDP면 무조건 L4 가속인 Global Accelerator. CloudFront는 HTTP L7만, Route 53은 DNS 응답만 다르게 줄 뿐 트래픽 가속 X. ElastiCache는 캐시 서비스로 무관. Global Accelerator는 BGP Anycast 2개의 정적 IP를 제공하므로 DNS TTL과 무관하게 라우팅이 변경되고, 백본망을 거치기 때문에 패킷 손실률·jitter도 줄어든다.

---

**문제 2.** 한 금융 회사가 한국 금융감독원 규정으로 일부 데이터를 본사 내부에 보관하면서도 AWS API로 운영해야 한다. 가장 적합한 솔루션은?

A) Direct Connect만 사용
B) Local Zones
C) Outposts
D) Snowball Edge

**정답: C**
해설: 고객 데이터센터 안에 AWS 하드웨어 + 동일 API. 전자금융감독규정·GDPR Schrems II 같은 규제 시나리오의 정답. Local Zones는 AWS 운영 시설, Direct Connect는 전용선, Snowball Edge는 일회성 데이터 이전용. Outposts는 "내 건물 + AWS API"가 동시에 필요한 거의 유일한 시나리오에 쓴다 — 그렇지 않으면 Direct Connect로 충분한 경우가 많다.

---

**문제 3.** 한 회사가 50개 AWS 계정에서 us-east-1 외 모든 리전 사용을 차단하려 한다. 가장 효율적인 방법은?

A) 각 계정마다 IAM 정책 추가
B) Organizations SCP로 `aws:RequestedRegion` 조건 Deny
C) CloudTrail 알림
D) VPC를 us-east-1에만 생성

**정답: B**
해설: 다계정 권한 상한 = SCP. `aws:RequestedRegion` Deny가 표준 패턴. 단 Management 계정엔 SCP 미적용이라 운영 워크로드 두면 안 됨. 글로벌 서비스(IAM, CloudFront, Route 53)는 `aws:RequestedRegion`이 `us-east-1`로 보여서 예외 처리가 필요하다는 미묘한 함정도 같이 챙겨야 한다.

---

**문제 4.** EC2가 S3에 접근하는 가장 안전한 방식은?

A) Access Key를 ~/.aws/credentials에 저장
B) IAM Role을 Instance Profile로 attach + IMDSv2
C) root Access Key 사용
D) S3 Public Read 허용

**정답: B**
해설: Instance Profile + IMDSv2. SDK가 임시 자격 증명을 자동 갱신, SSRF도 방어. A는 키 유출 위험, C는 절대 금기, D는 데이터 노출. Capital One 사고의 직접 원인이 IMDSv1이었음을 떠올리면 "왜 IMDSv2를 명시적으로 적어야 하는지"가 분명해진다.

---

**문제 5.** GitHub Actions가 AWS에 배포할 때 키 회전 부담을 없애려면?

A) IAM User Access Key를 Secret으로 저장
B) OIDC 페더레이션으로 Role 단명 자격 증명
C) EC2를 띄워 SSH 키
D) root 자격 증명

**정답: B**
해설: GitHub OIDC → STS AssumeRoleWithWebIdentity → 단명 토큰. Trust Policy에서 `sub` claim으로 repo·branch 제한. Travis CI 침해 사례가 OIDC 표준화의 결정적 계기. 같은 패턴이 GitLab, Bitbucket, Buildkite 등에도 확장 적용되고 있어서, 이제는 CI 전반의 표준이라 봐도 무방하다.

---

**문제 6.** 한 SaaS가 우리 AWS의 CloudWatch 로그를 수집한다. Confused Deputy 방어를 위해 필요한 것은?

A) Cross-Account Role + External ID 조건
B) IAM User에 Access Key 부여
C) S3 Public Read
D) VPN 연결

**정답: A**
해설: External ID는 사전 공유 비밀로 다른 SaaS 고객이 우리 Role ARN을 알아도 빌릴 수 없게 차단. Marketplace ISV 인증의 필수 요건. External ID에 더해 `aws:SourceAccount`나 `aws:SourceArn` 조건을 같이 거는 게 더 안전하다.

---

**문제 7.** 한 회사가 새 AWS 계정을 매주 10개씩 발급하면서 동일한 보안 베이스라인을 적용하려 한다. 가장 적합한 방법은?

A) 운영자가 매번 수동 설정
B) Control Tower Account Factory + StackSets auto-deployment
C) CloudFormation을 각 계정에서 수동 실행
D) Terraform Apply를 매번 실행

**정답: B**
해설: Control Tower가 표준 Landing Zone을 자동 생성, StackSets `SERVICE_MANAGED + auto-deployment Enabled`가 새 계정에 베이스라인을 자동 배포. 운영자 개입 없이 일관성 유지. 더 큰 조직은 Account Factory for Terraform(AFT)으로 GitOps 흐름까지 묶는다.

---

**문제 8.** 한 회사가 신입 개발자에게 IAM Role을 자유롭게 만들 권한을 주되, AdministratorAccess급 Role 생성은 막고 싶다. 가장 적절한 방법은?

A) CloudTrail로 사후 감지
B) Permissions Boundary를 강제 첨부 조건으로 정책에 명시
C) 신입 권한을 모두 회수
D) Organizations SCP만 사용

**정답: B**
해설: `iam:CreateRole` 호출 시 `iam:PermissionsBoundary` 조건 강제. 만든 Role의 실효 권한은 Boundary와 교집합으로 제한. SCP는 더 큰 단위(계정·OU)라 같은 계정 안 개별 Role마다 다른 한도를 두는 데 부적합하다.

---

**문제 9.** 한 AZ에서 냉방 장애로 EC2가 다운된다. 이미 ASG가 multi-AZ로 구성되어 있다면?

A) 모든 서비스 다운
B) ASG가 다른 AZ에 자동으로 인스턴스 보충, 서비스 유지
C) RDS Multi-AZ도 같이 다운
D) 수동 페일오버 필요

**정답: B**
해설: 2019년 도쿄 리전 사고 그대로의 시나리오. ASG가 health check 실패 인스턴스를 떨어뜨리고 살아있는 AZ에 새 인스턴스 추가. RDS Multi-AZ는 30-60초 안에 standby로 자동 페일오버. 단 EBS·EFS가 한 AZ에만 묶여 있으면 그 부분은 같이 죽으므로, EFS는 Multi-AZ Standard 클래스로 잡거나 S3/DynamoDB 쪽 저장으로 옮기는 게 안전하다.

---

**문제 10.** 다음 중 AWS 책임이 아닌 것은?

A) 하이퍼바이저 보안
B) 게스트 OS 패치 (EC2)
C) 물리 시설 보안
D) AZ 간 네트워크 암호화

**정답: B**
해설: EC2의 게스트 OS는 고객 책임. IaaS 추상화 레벨 때문에 OS 위 모든 게 고객. Fargate로 바꾸면 OS 패치도 AWS 책임으로 넘어간다. 같은 워크로드를 Lambda로 옮기면 런타임까지 AWS 책임이 된다 — 추상화가 올라갈수록 책임 경계선이 위로 올라간다.

---

**문제 11.** 한 시스템이 트랜잭션당 1ms 미만 RPO를 요구하고 한 리전 안에서만 운영된다. RDS는?

A) Single-AZ Standard
B) Multi-AZ Synchronous Replication
C) Cross-Region Read Replica
D) Aurora Global Database

**정답: B**
해설: 동일 리전 동기 복제로 RPO ≈ 0. AZ 간 1-2ms latency 안에서 commit ack. C는 async라 RPO 초 단위, D는 리전 간 async. RDS Multi-AZ는 standby가 read 트래픽을 받지 않는다는 점(Aurora와 다름)도 같이 알아두면 좋다 — read 분산이 필요하면 Read Replica를 별도로 띄워야 한다.

---

**문제 12.** 한 회사가 Organizations 안에서 중앙 Networking 계정의 VPC 서브넷을 다른 30개 워크로드 계정에 공유하려 한다. 가장 적합한 솔루션은?

A) VPC Peering을 30번
B) AWS RAM으로 서브넷 공유
C) Transit Gateway만 사용
D) Direct Connect

**정답: B**
해설: RAM으로 서브넷 공유 → 받는 계정은 ENI/EC2를 만들 수 있지만 라우팅·NACL은 못 건드림. 네트워크 설계와 워크로드 운영의 깔끔한 분리. Peering은 점대점, TGW는 라우팅 허브로 보완재. 실제 운영에서는 RAM(서브넷 공유) + Transit Gateway(VPC 간 라우팅 허브) 조합을 같이 쓰는 경우가 가장 많다.
