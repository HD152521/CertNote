# Day 5 - Week 15 종합: 케이스를 가로지르는 단서 독해와 트레이드오프 판단의 기술

Pro 시험의 시나리오 문제는 지식의 양이 아니라 **단서를 읽는 속도와 트레이드오프 판단**으로 갈린다. 같은 "배포" 문제라도 "regulated", "no internet outbound", "no static keys", "minimum operational overhead", "least cost", "across all accounts" 같은 한두 개의 제약 단어가 정답을 결정한다. 네 개의 보기 중 둘은 동작조차 안 하고, 나머지 둘은 모두 동작하지만 하나만 제약에 맞는다. 오늘은 Week 15가 다룬 네 케이스 — 멀티 계정(Day1), 하이브리드(Day2), 컨테이너(Day3), 서버리스 인시던트(Day4) — 를 가로지르며, 단서를 도메인으로, 도메인을 후보로, 후보를 정답으로 좁히는 풀이 체계를 세우고 종합 시나리오로 단련한다.

## 시나리오 풀이 5단계 — 인지 부하를 줄이는 절차

긴 시나리오 앞에서 가장 흔한 실패는 "전체를 한 번에 이해하려다 시간을 태우는" 것이다. 대신 다음 5단계로 인지 부하를 분할한다.

1. **제약 단어에 표시**: "regulated", "zero internet", "no static keys", "minimum overhead", "least cost", "all accounts" 등을 먼저 찾아 밑줄.
2. **도메인 식별**: CI/CD인가, IaC인가, 모니터링·보안·복원력·인시던트인가.
3. **후보 2개로 좁힘**: "동작 가능 + 제약 부합" 후보만 남기고, 동작하지 않거나 명백히 오버킬인 보기를 제거(소거법).
4. **트레이드오프로 최종 1개**: 남은 둘을 운영 부담·비용·보안으로 비교 — Pro는 거의 항상 매니지드·표준·최소 부담을 선호.
5. **확신 50% 이하면 표시 후 패스**: 시간 보존이 합격의 기술이다.

> 💡 **관련 이론**: 이 절차는 인지심리학의 **청킹(chunking)**과 **재인 기반 의사결정(recognition-primed decision)**의 적용이다. 전문가는 문제를 통째로 분석하지 않고, 익숙한 패턴(단서)을 먼저 재인해 해법 공간을 좁힌 뒤 그 안에서만 비교한다(Gary Klein의 RPD 모델). "no internet outbound → PrivateLink", "all accounts → StackSets/Delegated Admin" 같은 단서-정답 매핑을 미리 만들어 두는 것이 곧 전문가의 패턴 라이브러리를 이식하는 것이다. 시험은 75문항 × 180분 = 평균 2분 24초/문항이라, 매 문항을 0에서 추론하면 시간이 부족하다 — 단서 재인으로 후보를 즉시 좁히는 것이 시간 경제학의 핵심이다.

## 단서 → 정답 빠른 매핑 (Week 15 통합)

| 단서 | 정답 키워드 | 출처 |
|------|-------------|------|
| "across all accounts / new accounts auto" | Service-Managed StackSets + Auto-Deployment / Delegated Admin | Day1 |
| "self-service standard pipeline" | Service Catalog Portfolio + CDK Pipelines | Day1 |
| "developer-created Role must not exceed policy" | Permission Boundary(`iam:PermissionsBoundary` 강제) | Day1 |
| "no internet outbound / zero internet" | PrivateLink / VPC Endpoint (+ Route 53 Resolver) | Day2 |
| "no static keys (on-prem/CI)" | IAM Roles Anywhere | Day2 |
| "no OIDC setup, pod IAM (new EKS)" | EKS Pod Identity | Day3 |
| "DX must be encrypted" | MACsec / IPSec over DX | Day2 |
| "EC2 + DC single deploy" | CodeDeploy On-Prem (단일 AppSpec) | Day2 |
| "burst quickly, diverse instances, Spot" | Karpenter | Day3 |
| "Git revert rollback" | GitOps (Argo CD/Flux) | Day3 |
| "container cost 30~40% down" | Graviton + Spot/Fargate Spot | Day3 |
| "auto remediation entry point" | EventBridge → Step Functions/SSM Automation | Day4 |
| "Runbook >5min, audit" | Step Functions Standard | Day4 |
| "DLQ re-drive without infinite loop" | retry count 기록 + 임계 시 사람 | Day4 |
| "Slack restricted CLI" | AWS Chatbot + 제한된 IAM Role | Day4 |
| "minimum operational overhead" | Managed 서비스 / Fargate / GitOps | 공통 |

> ⚠️ **함정**: 단서 매핑을 기계적으로 적용하다 **복합 단서**를 놓치면 틀린다. 예: "no static keys"만 보고 IAM Roles Anywhere를 골랐는데, 문제가 EKS 파드 컨텍스트면 답은 Pod Identity/IRSA다. "no internet"만 보고 PrivateLink를 골랐는데, DNS 해석이 안 된다는 추가 단서가 있으면 Route 53 Resolver Endpoint가 진짜 핵심일 수 있다. Pro 문제는 종종 **두 번째 단서가 진짜 변별점**이다 — 첫 단서로 도메인을 좁히고, 두 번째 단서로 그 도메인 안의 정확한 서비스를 고른다. 단서를 하나만 보고 멈추지 말고, 모든 제약 단어를 표시한 뒤 교집합을 찾아라.

## 매니지드 vs 자체 구축 — Pro의 기본 편향

> 💡 **관련 이론**: Pro 시험이 매니지드 서비스를 선호하는 데는 명확한 운영 철학이 깔려 있다 — **차별화되지 않는 무거운 작업(undifferentiated heavy lifting)의 제거**. AWS Well-Architected의 운영 우수성(Operational Excellence) 기둥은 "비즈니스 가치를 만들지 않는 운영 작업을 매니지드 서비스로 밀어내라"고 권한다. 자체 구축(Jenkins 자가 운영, 자체 오토스케일러, 커스텀 자격 증명 회전)은 동작은 하지만 패치·확장·장애 대응의 toil을 떠안는다. 그래서 "동작하는 두 보기" 중 하나가 매니지드(CodePipeline·Karpenter·Pod Identity·Incident Manager)면 거의 항상 그것이 정답이다. 단, 예외 단서가 있다 — "기존 Jenkins 자산 유지", "특정 커스텀 제어 필요"처럼 명시적 제약이 있으면 점진 이관(CodePipeline + Jenkins Action)이나 EKS 같은 제어 강한 선택이 답이 된다. 기본은 매니지드, 단서가 있으면 예외.

## 케이스를 가로지르는 공통 축 — 네 도메인을 잇는 다섯 기둥

Week 15의 네 케이스는 표면적으로 달라 보이지만, 실은 같은 다섯 기둥 위에 서 있다. 이 공통 축을 보면 어떤 시나리오가 나와도 분해가 빨라진다.

```
공통 핵심 (네 케이스를 가로지름)
├─ IaC          : CDK / CloudFormation / Terraform로 모든 것을 코드로
├─ 파이프라인    : CodePipeline 표준 (Tooling Account Hub) + 거버넌스 게이트
├─ 관찰성        : CloudWatch + ADOT(OpenTelemetry) + X-Ray (메트릭·로그·트레이스)
├─ 보안          : GuardDuty / Security Hub / Config를 Audit 계정에 집계
└─ 비용          : Tag 강제 + Cost Categories + Anomaly Detection
```

- **멀티 계정(Day1)**은 이 다섯 기둥을 OU/StackSets로 모든 계정에 강제하는 거버넌스 문제다.
- **하이브리드(Day2)**는 같은 다섯 기둥을 인터넷 차단·온프레까지 확장하는(PrivateLink·SSM·Roles Anywhere) 경계 문제다.
- **컨테이너(Day3)**는 파이프라인·관찰성·비용 기둥을 수백 컨테이너 규모로 푸는(Karpenter·GitOps·Container Insights) 스케일 문제다.
- **서버리스 인시던트(Day4)**는 보안·관찰성 기둥의 신호를 받아 자동 복구로 닫는(EventBridge·Step Functions) 대응 문제다.

> 🔍 **더 깊이**: 이 다섯 기둥이 곧 AWS Well-Architected Framework의 운영 축과 거의 일대일로 대응한다 — IaC·파이프라인은 운영 우수성(Operational Excellence), 보안 집계는 보안(Security), 비용은 비용 최적화(Cost Optimization), 관찰성은 운영 우수성과 신뢰성(Reliability)을 가로지른다. Pro 시험이 특정 서비스 지식만이 아니라 "이 다섯 축을 어떻게 한 시스템에 엮는가"를 묻는 이유가 여기 있다. 그래서 한 문항이 여러 도메인을 동시에 건드릴 때(예: "멀티 계정 환경에서 컨테이너 비용을 모든 계정에 걸쳐 가시화") — 정답은 한 축이 아니라 축의 조합(태그 강제 + Cost Categories + Delegated Admin)이 된다. 단일 서비스만 답하는 보기는 대개 함정이다.

## 시간 배분 — 합격은 정답률이 아니라 시간 관리

75문항 180분에서 평균 2분 24초가 주어지지만, 긴 시나리오는 4~5분이 걸리기도 한다. 전략: 모르거나 50% 미만 확신이면 **즉시 Mark for Review하고 패스** — 한 문항에 매달려 5분을 태우면 뒤의 두 문항을 못 본다. 1차로 전체를 빠르게 훑어 확실한 것을 먼저 풀고, 마지막 30분을 표시한 문항 + 매우 긴 시나리오 재검토에 할당한다. "완벽한 한 문항보다 시간 보존이 합격의 기술"이다.

> 🎯 **시나리오**: "한 규제 산업 기업이 60개 계정·온프레 DC·EKS·서버리스를 모두 운영한다. 단일 질문: '신규 마이크로서비스 출시 시 (1)계정·파이프라인 자동 프로비저닝 (2)인터넷 차단 DC 연동 (3)컨테이너 비용 최적화 (4)보안 사고 자동 대응을 모두 표준으로 제공하라.' 어디서부터 분해하나?" → 5단계로: 제약 단어 표시("regulated", "zero internet DC", "cost", "auto response") → 네 도메인으로 쪼갬 → 각 도메인의 단서-정답 매핑 적용: (1) AFT/Control Tower + Service Catalog + Permission Boundary, (2) SSM Hybrid + Roles Anywhere + PrivateLink + (DX 암호화면 MACsec), (3) Karpenter + Graviton/Spot + GitOps, (4) EventBridge → Step Functions → Incident Manager. 공통 기둥(IaC·관찰성·보안 집계·비용)이 네 도메인을 관통. 복합 문항은 단일 서비스가 아니라 축의 조합이 정답임을 기억.

---

## 📝 시나리오 종합 12문항

**문제 1.** 한 핀테크가 60개 AWS 계정을 운영한다. 모든 계정에 동일한 Config Rule 보안 베이스라인을 자동 배포하고, 앞으로 OU에 가입할 신규 계정에도 자동 적용돼야 한다. 가장 적합한 조합은?

A) 각 계정 콘솔에서 IAM 관리자가 동일 Config Rule을 수동 설정하고 신규 계정 가입 시 온보딩 체크리스트로 누락 방지

B) AWS Organizations + CloudFormation StackSets Service-Managed(Auto-Deployment Enabled)를 OU 타깃으로 배포

C) EventBridge Scheduler가 매일 Lambda를 트리거해 신규 계정을 스캔하고 Config Rule을 API로 동기화 배포

D) Config Aggregator를 Audit 계정에 설정해 전 계정 Finding을 한 대시보드로 집계하고 비준수 시 알림

**정답: B**

해설: Service-Managed StackSets는 Organizations와 통합해 실행 Role을 AWS가 관리하고 OU 타깃팅과 Auto-Deployment를 지원한다 — OU에 새 계정이 들어오면 자동으로 베이스라인이 배포된다. "신규 계정에도 자동 적용"은 항상 Service-Managed + Auto-Deployment다. 수동(A)·스크립트(C)는 누락 위험, Config Aggregator(D)는 Finding을 모아 볼 뿐 Rule을 배포하지 않는다.

---

**문제 2.** 인터넷이 완전히 차단된 데이터센터의 5,000대 서버를 EC2와 동일하게 패치 관리하려 한다. DC 서버는 Secrets Manager도 사설 경로로 조회해야 한다. 가장 적합한 조합은?

A) Ansible 자체 운영 + NAT Gateway로 패치 메타데이터를 인터넷에서 받고 Secrets는 환경 변수로 주입

B) SSM Hybrid Activation 후 Patch Manager + Secrets Manager용 Interface VPC Endpoint(PrivateLink)를 DX 경유로 접근

C) CodeDeploy On-Prem 에이전트로 패치 스크립트를 AppSpec hook에 담아 5,000대에 롤링 배포

D) Lambda가 SSH로 각 서버에 접속해 패치 명령을 실행하고 Secrets는 Lambda 환경 변수로 전달

**정답: B**

해설: SSM Hybrid Activation으로 DC 서버를 등록하면 mi-xxxx로 EC2처럼 Patch Manager 대상이 된다. 인터넷 차단 환경에서 Secrets Manager 접근은 Interface VPC Endpoint(PrivateLink)를 DX/TGW 경유로 — 트래픽이 인터넷으로 나가지 않는다(Route 53 Resolver로 DNS 해석). Ansible+NAT(A)는 인터넷 경로를 요구, CodeDeploy(C)는 배포용이지 패치 관리가 아니며, Lambda+SSH(D)는 인바운드를 요구해 보안 환경에 부적합하다.

---

**문제 3.** EKS 클러스터의 트래픽 변동이 매우 커서 분 단위 노드 확장으로는 부족하다. 다양한 인스턴스 타입을 동적으로 띄우고 Spot도 적극 활용하려면?

A) Cluster Autoscaler — 여러 인스턴스 타입별 ASG를 미리 정의해 펜딩 파드 발생 시 해당 ASG를 분 단위로 확장

B) Karpenter

C) Lambda가 CloudWatch 메트릭을 보고 ASG Scheduled Action을 동적으로 갱신해 시간대별 용량을 예약 조정

D) EC2 Fleet으로 Spot/On-Demand 혼합 요청을 수동 구성하고 운영자가 타입 풀을 직접 관리

**정답: B**

해설: Cluster Autoscaler는 ASG 전제·분 단위·타입 고정이다. Karpenter는 ASG 없이 EC2를 직접 띄우며 펜딩 파드 요구 기반 bin-packing으로 가장 싸고 잘 맞는 인스턴스를 초 단위로 동적 선택하고 consolidation으로 비용을 줄인다. "빠른 스케일 + 다양한 인스턴스 + Spot 유연"은 Karpenter다. Scheduled Action(C)·수동 Fleet(D)는 동적 스케줄링이 아니다.

---

**문제 4.** 신규 EKS 클러스터에서 IRSA의 OIDC Provider 셋업 없이 더 간단하게 파드별 IAM을 부여하는 현재 권장 표준은?

A) 노드 Instance Profile에 모든 파드용 권한을 합쳐 부여하고 파드는 IMDS로 그 자격을 공유

B) IAM User를 파드마다 만들어 장기 액세스 키를 Kubernetes Secret으로 주입

C) EKS Pod Identity

D) 파드가 시작 시 STS GetSessionToken을 수동 호출해 MFA 기반 임시 자격을 받아 캐싱

**정답: C**

해설: EKS Pod Identity는 Pod Identity Agent 애드온 + association으로 OIDC 셋업 없이 namespace/ServiceAccount/Role을 직접 연결하며, 신뢰 정책에 `pods.eks.amazonaws.com`만 두면 돼 여러 클러스터에서 Role 재사용이 쉽다 — 신원 간소화의 후속 표준이다. 노드 프로파일(A)은 최소 권한 위배, IAM User 키(B)·수동 STS(D)는 안티패턴이다.

---

**문제 5.** GuardDuty가 EC2 인스턴스 자격 증명 유출(InstanceCredentialExfiltration)을 탐지했다. 사람 개입 없이 ①키 즉시 비활성화 ②CloudTrail로 영향 분석 ③인시던트 자동 오픈까지 가야 한다.

A) Lambda 단독으로 키 비활성화·CloudTrail 쿼리·인시던트 오픈을 한 함수에 순차 구현

B) EventBridge → Step Functions(Runbook) → Incident Manager Response Plan

C) Config Auto-Remediation 규칙으로 유출된 자격의 리소스 설정을 자동 교정하고 SNS로 통보

D) CloudTrail에 메트릭 필터 + CloudWatch 알람을 걸어 유출 의심 API 호출 시 SRE에게 경보

**정답: B**

해설: EventBridge가 GuardDuty Finding을 받아 Step Functions Runbook으로 라우팅하고, Runbook이 키 비활성화 → CloudTrail Lake 영향 쿼리 → Incident Manager 인시던트 오픈을 순서대로(재시도·감사 보장) 실행한다. Lambda 단독(A)은 부분 실행·감사 부족, Config(C)는 리소스 설정 교정용, CloudTrail 알람만(D)은 대응을 실행하지 못한다.

---

**문제 6.** 50개 마이크로서비스 팀에 표준 파이프라인을 제공하되, 팀이 직접(셀프서비스) 만들 수 있어야 하고 회사 표준을 벗어나면 안 된다.

A) GitOps(Argo CD)로 파이프라인 정의를 Git에 두고 각 팀이 매니페스트를 복제해 셀프서비스로 운영

B) Jenkins를 중앙에서 운영하고 팀별 폴더 권한 + 공유 라이브러리로 표준 파이프라인 강제

C) AWS Service Catalog Portfolio + CDK Pipelines 템플릿

D) 각 팀이 CodeCatalyst Blueprint를 수동 작성하되 보안팀이 PR로 표준 준수를 매번 리뷰

**정답: C**

해설: Service Catalog Portfolio에 검증된 CDK Pipelines 템플릿을 게시하면 개발자가 Product를 골라 셀프서비스로 파이프라인을 생성하면서도 승인된 템플릿만 쓰이는 표준이 유지된다(Golden Path). GitOps만(A)은 파이프라인 표준 셀프서비스 메커니즘이 아니고, Jenkins 중앙(B)·수동 작성(D)은 셀프서비스·표준화를 동시에 만족하지 못한다.

---

**문제 7.** Direct Connect 10Gbps를 쓰는데 규제상 회선 암호화가 필수다. 최소 변경으로 만족시키려면?

A) S3 SSE-KMS를 켜서 전송 데이터가 저장될 때 CMK로 암호화되게 한다

B) 모든 애플리케이션 트래픽에 TLS 1.3을 강제하고 mTLS로 양방향 인증을 추가한다

C) MACsec 또는 IPSec over DX를 적용한다

D) DX를 해지하고 Site-to-Site VPN으로 전면 교체해 IPSec 터널로 회선을 암호화한다

**정답: C**

해설: DX는 사설 전용선이지만 그 자체로 암호화되지 않는다 — 회선 암호화가 필요하면 MACsec(레이어 2) 또는 IPSec over DX(레이어 3)를 추가한다. SSE-KMS(A)는 S3 저장 암호화, TLS(B)는 애플리케이션 계층이라 "회선 암호화 필수"를 직접 충족한다고 보기 어렵고, VPN 전면 교체(D)는 DX의 대역폭·지연 이점을 버리는 과한 변경이다.

---

**문제 8.** SQS DLQ가 누적되면 자동 Re-drive를 하되 무한 루프(poison message)를 방지해야 한다.

A) Lambda 타임아웃과 메모리를 늘려 처리 시간을 확보하고 배치 크기를 줄여 부하를 분산한다

B) DLQ 메시지에 짧은 TTL을 걸어 오래된 poison message가 자동 만료돼 사라지게 한다

C) 메시지 속성에 재처리 카운트를 기록하고 임계 초과 시 자동 재처리를 멈추고 사람에게 넘긴다

D) Re-drive를 Step Functions Express 워크플로로 감싸 빠른 재시도와 상태 추적을 더한다

**정답: C**

해설: at-least-once 전달이라 같은 메시지가 반복될 수 있고 exactly-once는 이론적으로 불가능하다. retry count를 메시지 속성에 기록해 임계 초과 시 멈추는 것은 dedup 가드로 무한 루프를 막는다("적어도 한 번 + 멱등 = effectively-once"). 타임아웃(A)·TTL(B)·Express(D)는 무한 루프 자체를 막지 못한다.

---

**문제 9.** SRE가 Slack 채널에서 제한된 AWS CLI를 안전하게 실행할 수 있어야 한다.

A) Slack Incoming Webhook으로 명령을 Lambda에 보내고 Lambda가 Assume한 Role로 CLI를 실행

B) AWS Chatbot + 제한된 IAM Role

C) Slack Bot OAuth 토큰을 EC2에 저장하고 봇이 그 토큰으로 채널 명령을 받아 CLI를 실행

D) IAM Identity Center 콘솔 SSO 링크를 채널에 공유해 SRE가 클릭 후 콘솔에서 조치

**정답: B**

해설: AWS Chatbot은 Slack/Teams 채널에서 제한된 IAM Role 범위 안의 AWS CLI를 직접 실행하게 해준다 — 콘솔을 열지 않고 채팅에서 진단·조치. Webhook+Lambda(A)는 임의 명령 실행에 별도 권한 통제가 필요하고, OAuth 토큰 저장(C)은 정적 비밀 안티패턴, Console SSO 공유(D)는 채팅 내 제한 실행이 아니다.

---

**문제 10.** 컨테이너 워크로드 비용을 30% 이상 줄이라는 압박이 있다. 단일 최고의 액션은?

A) 1년 또는 3년 Compute Savings Plan/Reserved Instance를 대량 약정 구매해 온디맨드 단가를 낮춘다

B) Graviton(arm64) 노드 그룹 + Spot/Fargate Spot 적용

C) 워크로드를 us-east-1 같은 더 싼 Region으로 이전해 리전 단가 차이로 절감한다

D) 컨테이너 로그를 CloudWatch에서 S3 Infrequent Access로 전환하고 보존 기간을 단축한다

**정답: B**

해설: Graviton은 ARM(RISC) 기반 전력 효율 + AWS 자체 설계로 단가가 낮아 30~40% 절감을 주고, Spot은 최대 90% 할인이다(PDB·Topology Spread로 중단 대비). 둘의 조합이 컨테이너 컴퓨트 비용의 단일 최고 레버다. RI 단독(A)은 유연성 손실, Region 이동(C)·S3 IA(D)는 컴퓨트 단가의 핵심 레버가 아니다.

---

**문제 11.** 인터넷이 차단된 DC의 5,000대 서버에 정적 액세스 키를 두지 않고, 사내 PKI(X.509 인증서)로 AWS API 호출용 임시 자격 증명을 부여하려면?

A) IAM User 장기 키를 발급해 각 서버에 배포하고 90일마다 회전 스크립트로 교체

B) IAM Roles Anywhere — 사내 CA를 Trust Anchor로 등록, 서버 인증서로 인증해 STS 단명 자격 증명 획득

C) Cognito Identity Pool에 사내 PKI를 OIDC IdP로 연동해 서버가 임시 자격을 받게 구성

D) EC2 Instance Profile을 흉내내 IMDS 프록시를 DC에 세우고 서버가 그 엔드포인트로 자격 조회

**정답: B**

해설: IAM Roles Anywhere는 사내 PKI의 X.509 인증서로 신원을 증명해 임시 자격 증명을 받는다 — 정적 키가 서버에 존재하지 않는다(PKI 신뢰 사슬 RFC 5280, 단명 자격 증명 원칙). 장기 키(A)는 Codecov류 유출 위험, Cognito(C)는 앱 사용자용, Instance Profile(D)은 EC2 전용이라 온프레 DC 서버엔 쓸 수 없다.

---

**문제 12.** 한 조직이 EKS(결제계)와 ECS Fargate(일반계)를 혼합 운영한다. 매니페스트 변경을 Git revert 한 번으로 자동 롤백시키고, ECS Fargate에는 Canary 트래픽 시프트와 즉시 롤백이 필요하다. 각각의 표준 조합은?

A) EKS는 운영자가 kubectl apply로 직접 롤백하고, ECS는 서비스 기본 Rolling Update로 점진 교체

B) EKS는 GitOps(Argo CD/Flux)로 매니페스트 reconcile(롤백=git revert), ECS Fargate는 CodeDeploy Blue/Green + ALB 두 Target Group/Listener

C) 둘 다 CloudFormation Drift Detection으로 변경을 감지하고 이전 스택 버전으로 update-stack 롤백

D) EKS는 Lambda Alias 가중치로, ECS는 Route 53 Weighted 레코드로 Canary 트래픽을 분할

**정답: B**

해설: EKS는 GitOps로 Git을 단일 진실로 두면 매니페스트를 이전 커밋으로 git revert할 때 Argo CD가 클러스터를 자동으로 되돌린다(폐루프 reconciliation). ECS Fargate의 Canary 트래픽 시프트와 즉시 롤백은 CodeDeploy 컨트롤러(`type=CODE_DEPLOY`) + ALB의 두 Target Group/Listener를 요구한다(기본 Rolling으로는 부족). 수동 kubectl·Rolling(A), Drift Detection(C), Lambda Alias·Route 53(D)은 각 요구의 표준이 아니다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, Pro 시나리오는 단서 표시 → 도메인 식별 → 후보 2개 → 트레이드오프 → (확신 낮으면) 표시 후 패스의 5단계로 푼다 — 단서 재인(RPD)으로 해법 공간을 즉시 좁히는 것이 시간 경제학의 핵심이다. 둘째, "all accounts/new accounts"는 Service-Managed StackSets + Auto-Deployment/Delegated Admin, "no internet"은 PrivateLink(+Resolver), "no static keys"는 Roles Anywhere/Pod Identity, "burst+Spot"은 Karpenter, "git revert"는 GitOps, "auto remediation"은 EventBridge→Step Functions가 매핑이다. 셋째, 복합 단서에서 두 번째 단서가 진짜 변별점일 수 있으니 모든 제약을 표시하고 교집합을 찾는다. 넷째, Pro는 차별화되지 않는 무거운 작업 제거(매니지드 선호)가 기본이되 "기존 자산 유지·커스텀 제어" 단서가 있으면 예외다. 다섯째, 합격은 정답률이 아니라 시간 관리 — Mark for Review로 패스하고 시간을 보존하는 습관이 결정적이다.
