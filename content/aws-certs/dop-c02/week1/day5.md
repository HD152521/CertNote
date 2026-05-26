# Day 5 - Week 1 종합: DevOps의 사고 프레임을 시나리오로 굳히기

Week 1을 통과하면서 본 그림을 한 번 정리하고 가자. Day 1-4에서 다룬 것들 — DevOps의 본질, CALMS/DORA, Well-Architected, AWS 도구 지도, 멀티 계정 — 이 다섯 가지는 분리된 주제가 아니라 **하나의 사고 프레임**을 다른 각도에서 본 것이다.

이 프레임의 정수는 다음 한 문장으로 요약된다: **"DevOps는 빠르고 안전하게 변경을 흘려보내는 시스템이고, AWS의 도구·계정 구조·메트릭은 그 시스템을 코드로 표현하기 위한 부품이다."**

오늘은 이 프레임을 10개의 종합 시나리오로 검증한다. 각 문제는 Day 1-4의 내용을 두세 가지씩 엮어 출제됐고, 시험장에서 보게 될 형태에 최대한 가깝게 만들었다.

## 한 페이지 핵심 요약

### CALMS 5축 → AWS 도구 매핑
| 축 | 진단 질문 | AWS 도구 |
|----|----------|----------|
| Culture | 사고 시 누가 비난받나? | Blameless COE, Chatbot, Incident Manager |
| Automation | 수동 작업이 얼마나 남았나? | CodePipeline + CDK + SSM Automation |
| Lean | PR 머지까지 며칠? | Trunk-based, AppConfig flag |
| Measurement | 변경의 효과를 어떻게 아나? | CloudWatch + DORA dashboard |
| Sharing | 한 팀의 깨달음이 흐르나? | Service Catalog, Proton, Wiki |

### DORA 4 metrics → 개선 패턴
| 지표 | 약하면 처방 |
|------|------------|
| Deployment Frequency ↓ | CodePipeline 자동화 + 작은 배치 + feature flag |
| Lead Time ↑ | Manual Approval 제거 + CodeBuild 캐싱 + monorepo 분할 |
| Change Failure Rate ↑ | Canary 배포 + CloudWatch alarm 자동 롤백 + pre-deploy 테스트 |
| MTTR ↑ | EventBridge → SSM Automation runbook + Incident Manager |

### W-AF 6 Pillar → 시나리오 키워드
| Pillar | 키워드 |
|--------|--------|
| Operational Excellence | "자동화", "운영 절차", "관찰성" |
| Security | "최소 권한", "감사", "데이터 보호", "shift-left" |
| Reliability | "RTO/RPO", "Multi-AZ/Region", "self-healing" |
| Performance | "지연 시간", "처리량", "글로벌 사용자" |
| Cost | "비용 최적화", "낭비 제거", "예산 통제" |
| Sustainability | "탄소 발자국", "재생 에너지 리전" |

### 멀티 계정 표준 패턴
- **OU 구조**: Security / Infrastructure / Workloads(Prod/Non-Prod) / Sandbox
- **3대 표준 계정**: Management / Log Archive / Audit
- **SCP는 deny-only guardrail**, IAM permission grant 아님
- **Cross-account 접근**: STS AssumeRole + ExternalId / Resource policy / RAM
- **CI/CD는 Shared Services 계정**(Hub) → 환경 계정(Spoke) AssumeRole 배포

---

## 📝 시나리오 문제 10개

**문제 1.** 한 대형 핀테크가 "분기 1회 배포 → 주 1회 배포"로 가속을 추진한다. 현재 상태: 단일 AWS 계정에서 dev/staging/prod를 VPC로 분리, CodePipeline 없이 사람이 콘솔에서 직접 배포, 사고 발생 시 평균 8시간 복구 소요. CALMS 진단 + 우선순위 처방으로 가장 적합한 것은?

A) Lean 축 약함 → 모노레포로 통합
B) Automation 축 약함 → Code* 3종(Pipeline+Build+Deploy) 도입이 최우선, 그 다음 Measurement(CloudWatch)
C) Sharing 약함 → Confluence wiki 구축
D) Culture 약함 → 외부 컨설팅

**정답: B**
해설: CALMS 진단의 핵심은 "**가장 약한 축이 전체를 끌어내린다**". 이 시나리오에서 콘솔 수동 배포 = Automation 부재. Automation 없이는 Lean(작은 배치)도, MTTR 단축도, 데이터 수집(Measurement)도 다 막힌다. 우선순위 1번은 CodePipeline + CodeBuild + CodeDeploy 3종 도입. 그 다음 멀티 계정 분리(blast radius), CloudWatch (측정), AppConfig (feature flag). 이 순서가 시험의 우선순위 판단 패턴.

---

**문제 2.** 한 회사가 us-east-1과 eu-west-1에 동일 워크로드를 배포한다. 사용자는 글로벌이고 GDPR 준수가 필수. 단일 계정에서 운영 중이라 사고 시 blast radius 우려가 크다. Organizations 도입 후 가장 적합한 OU 구조는?

A) Region 기반 OU (us-east-1 OU, eu-west-1 OU)
B) Environment 기반 OU (Workloads OU 안에 Prod/Non-Prod, 각 계정이 multi-region 운영)
C) Service 기반 OU (Payment OU, User OU)
D) Team 기반 OU (Team-A OU, Team-B OU)

**정답: B**
해설: AWS 권장 OU 구조는 **Environment 기반**(Prod / Non-Prod / Security / Infrastructure / Sandbox). 한 계정 안에 multi-region을 운영하지, region별로 OU를 나누지 않는다. 이유: ① IAM과 SCP가 계정 단위라 region 분리해도 권한 통합이 어려움 ② Region failover 시 다른 region으로 자연스럽게 이동 가능 ③ Cost allocation도 환경 기반이 명확. GDPR은 별도 KMS 키 + S3 bucket region 정책으로 해결, OU 분리와는 무관.

---

**문제 3.** 한 회사가 SaaS 모니터링 도구 Datadog를 도입하려 한다. Datadog가 우리 AWS 계정의 메트릭에 접근해야 한다. 보안 + 자동화 관점에서 가장 적합한 설정은?

A) Datadog용 IAM User를 만들고 access key를 Datadog에 제공
B) Datadog용 IAM Role을 만들고 trust policy에 Datadog의 AWS 계정 + ExternalId(우리만 아는 secret)를 명시
C) Datadog용 root credentials 제공
D) Datadog용 별도 AWS 계정을 만들어 그 안에 모든 리소스 복사

**정답: B**
해설: Cross-account third-party 통합의 정답 패턴이다. ① IAM User access key는 정적 자격증명으로 노출 위험(A의 함정) ② root는 절대 금지(C) ③ 계정 복사는 의미 없음(D) ④ 정답은 **IAM Role + trust policy에 Datadog의 AWS 계정 ARN + ExternalId**. ExternalId는 confused deputy 방지용 — 같은 Datadog AWS 계정을 쓰는 다른 고객이 우리 자원에 접근하지 못하게 격리. Datadog 콘솔에서 자기 고유 ExternalId를 받아 trust policy에 넣는다.

---

**문제 4.** 한 회사가 "배포 빈도는 일 5회로 Elite 수준인데 Change Failure Rate가 40%"라는 문제를 보고했다. 다음 조치 중 가장 효과적인 것은?

A) 배포 빈도를 줄여 일 1회로 한다
B) 모든 배포에 수동 승인 게이트를 추가한다
C) CodeDeploy Blue/Green + CloudWatch alarm 기반 자동 롤백 + Canary 배포 도입
D) DORA 측정을 중단한다

**정답: C**
해설: DORA의 핵심 발견은 "**속도와 안정성은 trade-off가 아니라 양의 상관관계**". 빈도를 줄이는 건 잘못된 처방(A). 수동 승인은 lead time만 늘리지 사고를 진짜로 막진 못함(승인하는 사람도 같은 실수)(B). 정답은 자동화 강화 — CodeDeploy Blue/Green으로 점진적 트래픽 시프트, CloudWatch alarm이 임계치 위반 감지하면 자동 롤백, Lambda alias의 weighted alias로 Canary. D는 본말 전도.

---

**문제 5.** 한 글로벌 회사가 5개 리전에 배포하면서 모든 계정의 CloudTrail 로그를 중앙 집중 + 변조 방지로 관리하려 한다. 가장 적합한 아키텍처는?

A) 각 계정에 CloudTrail trail을 만들고 S3에 저장
B) Organization Trail을 management 계정에서 생성 → Log Archive 계정의 S3 bucket에 저장 → SCP로 bucket 변조 차단
C) 모든 계정의 CloudTrail을 단일 계정의 S3 bucket으로 복제
D) CloudTrail 대신 CloudWatch Logs 사용

**정답: B**
해설: 표준 패턴이다. ① Organization Trail은 management 계정의 단일 trail이 모든 멤버 계정 이벤트 캡처 ② Log Archive 계정의 S3 bucket이 저장소(Account 분리로 권한 격리) ③ SCP로 Log Archive 계정의 bucket 삭제/변조를 차단(아무도 못 끔). A는 계정 분산으로 통합 검색 어려움, C는 복잡한 자체 구현(이미 Organization Trail이 그 일을 함), D는 CloudTrail 자체를 대체할 수 없음(API audit trail 용도).

---

**문제 6.** 한 회사가 멀티 계정 환경에서 CI/CD를 구축한다. CodePipeline은 Shared Services 계정에 있고, 배포 대상은 Prod 계정. Prod 계정의 ECS 서비스로 배포해야 하며, KMS 키로 암호화된 artifact를 사용한다. 가장 정확한 권한 설정은?

A) Shared Services 계정의 pipeline role이 Prod 계정의 ECS와 KMS에 직접 접근
B) Prod 계정에 CrossAccountDeployRole 생성(trust: Shared Services) + Shared Services의 KMS 키 정책에 Prod 계정 사용 허용 + Prod 계정 role이 ECS UpdateService 권한 보유
C) Prod 계정의 root credentials를 Shared Services에 저장
D) IAM Identity Center로 SSO 설정만 하면 자동으로 해결

**정답: B**
해설: Cross-account CI/CD의 정답 패턴. ① **trust 관계**: Prod 계정에 CrossAccountDeployRole 생성, trust policy에 Shared Services 계정 명시 ② **KMS 키**: Shared Services의 KMS 키 정책에 Prod 계정의 role이 Decrypt/GenerateDataKey 가능하다고 명시 ③ **permission**: Prod 계정의 role이 ECS UpdateService, ECR pull 등 배포에 필요한 권한. A는 cross-account 직접 접근 불가, C는 root 금지, D는 IAM Identity Center는 사람 사용자 SSO지 machine workflow가 아님.

---

**문제 7.** 한 회사가 모든 계정에 "ap-northeast-2와 us-east-1 외 리전에서 EC2/RDS/S3 작업 금지"를 강제하려 한다. SCP를 작성할 때 반드시 주의해야 할 점은?

A) SCP는 region을 인식하지 못하므로 불가능
B) `NotAction`으로 글로벌 서비스(IAM, CloudFront, Route 53, Organizations, Support 등) 제외 필수, 안 그러면 IAM 작업까지 막혀 계정 운영 불가
C) SCP는 root에는 적용되지 않음
D) Service Quota 조정 필요

**정답: B**
해설: 시험의 단골 함정이다. IAM, CloudFront, Route 53, Organizations 같은 **글로벌 서비스는 region 개념이 없어서** `aws:RequestedRegion` 조건이 글로벌 서비스 API에서는 일관되게 평가되지 않는다. region restriction SCP를 만들 때 `NotAction`으로 글로벌 서비스를 제외해야 IAM 작업까지 막히지 않는다. 표준 패턴:
```json
"NotAction": ["iam:*", "organizations:*", "cloudfront:*", "route53:*", "support:*", "s3:ListAllMyBuckets", "sts:*"]
```
A는 사실 아님(`aws:RequestedRegion` 조건 키 지원), C는 잘못(SCP는 root에도 적용), D는 무관.

---

**문제 8.** 한 회사가 EKS 클러스터를 Prod 계정에 운영하고, ArgoCD를 통해 GitOps 방식으로 배포한다. ArgoCD는 어디에 두는 게 가장 적합한가?

A) Prod 계정 안에 같이 두기
B) 별도 Shared Services 계정에 두고 Prod 계정의 EKS API에 cross-account로 접근
C) 각 환경 계정마다 별도 ArgoCD 설치
D) ArgoCD 대신 CodePipeline 사용

**정답: A 또는 B (실무에서는 두 패턴 다 존재)**
해설: 까다로운 문제. 일반적으로 GitOps pull-based 모델의 장점은 "**클러스터 안에 controller가 있어 클러스터가 Git을 polling**". 그래서 ArgoCD는 같은 클러스터 안에 있는 게 자연스럽다(A). 다만 멀티 클러스터 환경에서는 중앙 ArgoCD(B) 패턴도 흔하다 — Hub ArgoCD가 여러 Spoke 클러스터를 관리. 시험에서 "보안 경계 최소화 + 단순 운영"이 강조되면 A, "멀티 클러스터 중앙 관리"가 강조되면 B. 둘 다 ArgoCD 자체가 답이지 CodePipeline으로 대체하는 건 GitOps 원칙에 안 맞음(D).

(참고로 시험 단일 정답을 골라야 한다면 단일 클러스터 시나리오는 A.)

---

**문제 9.** 한 회사가 "DORA 메트릭을 dashboard로 시각화하라"는 요구를 받았다. AWS 환경에서 가장 적합한 데이터 파이프라인은?

A) Lambda에서 hard-coded 값 출력
B) CodePipeline/CodeDeploy 이벤트 → EventBridge → Firehose → S3 → Athena/QuickSight (또는 CloudWatch Custom Metric → CloudWatch Dashboard)
C) Excel 파일에 수동 입력
D) Amazon Forecast

**정답: B**
해설: DORA는 AWS가 직접 측정해주지 않으므로 자체 파이프라인 필요. 표준 패턴 ① CodePipeline/CodeDeploy/CodeBuild 이벤트를 EventBridge로 캡처 ② Firehose가 S3로 batch ③ Athena로 쿼리, QuickSight로 dashboard. 또는 ② Lambda가 EventBridge 이벤트를 받아 CloudWatch Custom Metric(EMF 포맷)으로 출력 ③ CloudWatch Dashboard. Google의 Four Keys 프로젝트(github.com/GoogleCloudPlatform/fourkeys)가 reference. C는 자동화 부재, D는 ML 예측 도구(DORA 측정과 무관).

---

**문제 10.** 한 회사가 Production 계정의 "특정 시간(주말, 새벽)에 자동으로 read-only mode"를 강제하려 한다. 가장 적합한 메커니즘은?

A) IAM Policy에 datetime condition을 넣어 모든 user에게 적용
B) SCP에 `Deny` + `aws:CurrentTime` condition으로 작성, 해당 OU에 적용 → 그 시간대 모든 write API 차단 (단, 글로벌 서비스 제외 + 비상 access role은 명시적 제외)
C) Route 53 라우팅 비활성화
D) EC2 인스턴스 자동 종료

**정답: B**
해설: SCP의 `aws:CurrentTime` condition으로 시간 기반 차단 구현 가능. 실무 예: 주말/새벽에는 emergency role 외 모든 write 차단. IAM 정책으로도 가능하지만 모든 user에 일일이 적용해야 하므로 SCP가 훨씬 효율적(B). A는 user별 적용이라 누락 가능, C/D는 의도와 무관. 단, 이 패턴 도입 시 **비상 access role을 SCP의 NotPrincipal로 제외**해야 한다 — 새벽에 사고 났을 때 SRE가 들어갈 수 있게.

```json
// 주말 차단 SCP 예시
{
  "Effect": "Deny",
  "NotAction": ["iam:*", "organizations:*", "cloudfront:*", "route53:*"],
  "Resource": "*",
  "Condition": {
    "DateGreaterThan": {"aws:CurrentTime": "2024-06-15T00:00:00Z"},
    "DateLessThan": {"aws:CurrentTime": "2024-06-17T00:00:00Z"},
    "ArnNotLike": {
      "aws:PrincipalArn": "arn:aws:iam::*:role/EmergencyAccessRole"
    }
  }
}
```

---

## Week 1 마무리 — 시험 시나리오 풀이 4단계 흐름

이번 주 내용을 시험장에서 어떻게 활용할까. 4단계로 정리해두자.

1. **시나리오의 W-AF Pillar 분류**: 키워드로 어느 Pillar가 강조되는지 잡기 (Reliability? Cost?)
2. **CALMS/DORA 진단**: 어느 축이 약하고 어느 메트릭이 깨졌나
3. **AWS 도구 후보 추리기**: 도메인별 도구 지도에서 3-4개 후보
4. **trade-off로 단일 정답 선택**: 보기 중 시나리오 우선순위에 가장 정확히 맞는 것

이 흐름이 익숙해지면 시나리오 문제가 패턴 매칭 작업이 된다. 다음 Week부터 도메인 1(SDLC)을 본격적으로 파고든다 — 소스 제어, 빌드, 배포, 파이프라인 순서로.
