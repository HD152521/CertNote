# Day 5 - Week 1 종합: DevOps 사고 프레임을 시나리오로 굳히기

Week 1은 추상의 주간이었다. CALMS의 다섯 축, DORA의 네 메트릭, Well-Architected의 여섯 기둥, AWS DevOps 도구 지도, 그리고 멀티 계정 거버넌스. 따로 두면 각자 하나의 거대한 책이지만, DOP-C02 시나리오 안에서는 항상 두세 개가 한 묶음으로 등장한다. "분기 1회 배포 → 일 1회"로 가속하는 일에는 Automation 도구만 깔아서 풀리지 않고, blast radius·계정 분리·서명 검증·롤백 자동화·관찰성까지 한 번에 끌려 올라온다.

오늘은 그 묶음 풀이를 12개의 시나리오로 굳힌다. 각 문제는 Day 1-4의 두세 가지 개념을 엮어 만들었고, 시험장에서 정확히 같은 형태의 문제를 만난다고 가정하고 풀이를 적었다. 결국 Week 1이 가르치고 싶은 것은 "**DevOps는 코드를 빠르고 안전하게 흘려보내는 시스템**이고, AWS의 도구·계정 구조·메트릭은 그 시스템을 코드로 옮기기 위한 부품"이라는 한 문장이다.

## 한 페이지 컴팩트 — Week 1 핵심

### CALMS 5축 진단표 (가장 약한 축이 곧 다음 우선순위)

| 축 | 진단 질문 | 약하면 나타나는 증상 | 1순위 AWS 도구 |
|----|----------|-------------------|----------------|
| **C**ulture | 사고 시 누가 비난받나? | 사고 은폐, 동일 사고 반복 | Blameless COE, Incident Manager, Chatbot |
| **A**utomation | 수동 단계가 몇 개 남았나? | 빈도 정체, MTTR 폭증, 휴먼 에러 | CodePipeline + CodeBuild + CodeDeploy + SSM Automation |
| **L**ean | PR 머지까지 며칠? | WIP 누적, lead time 폭주 | Trunk-based dev, AppConfig feature flag |
| **M**easurement | 변경의 효과를 어떻게 아나? | "느낌" 기반 결정, KPI 게이밍 | CloudWatch Metrics + EMF + DORA dashboard |
| **S**haring | 한 팀의 깨달음이 흐르나? | 같은 실수가 다른 팀에서 재발 | Service Catalog, Proton, Wiki |

### DORA 4 metrics → 처방 매핑

| 지표 | 약함의 신호 | 1차 처방 (AWS) |
|------|------------|---------------|
| Deployment Frequency ↓ | 분기 1회, 월 1회 | CodePipeline 자동화 + 작은 배치 + AppConfig flag |
| Lead Time ↑ | commit→prod 2주+ | Manual Approval 제거 + CodeBuild 캐시 + monorepo 분할 |
| Change Failure Rate ↑ | 30%+ 사고율 | Canary + CloudWatch alarm 자동 롤백 + pre-deploy hook |
| MTTR ↑ | 사고 후 며칠 | EventBridge → SSM Runbook + Incident Manager |

### W-AF 6 Pillar → 시나리오 키워드

| Pillar | 시나리오 키워드 | DevOps 관점 |
|--------|----------------|------------|
| Operational Excellence | "자동화", "관찰성", "런북" | CALMS의 A + M |
| Security | "최소 권한", "shift-left", "감사" | DevSecOps |
| Reliability | "RTO/RPO", "Multi-AZ/Region", "self-healing" | 자동 롤백 + chaos |
| Performance | "지연 시간", "처리량" | Profiler, 인스턴스 타입 |
| Cost | "낭비", "예산", "Spot" | Right-sizing, autoscale |
| Sustainability | "탄소", "재생 에너지" | 리전 선택, ARM/Graviton |

### 멀티 계정 표준 구조

- **OU**: Security / Infrastructure / Workloads(Prod/Non-Prod) / Sandbox
- **3대 표준 계정**: Management(billing+SCP), Log Archive(불변), Audit(SecurityHub/GuardDuty 집계)
- **SCP**: deny-only guardrail (permission grant 아님). root에도 적용. `NotAction`으로 글로벌 서비스 제외 필수.
- **Cross-account**: STS AssumeRole + ExternalId / Resource policy / RAM
- **CI/CD**: Shared Services(Hub) → 환경 계정(Spoke) AssumeRole 배포

## Week 1 시나리오 풀이 4단계 흐름

시험장에서는 다음 4단계를 의식적으로 거쳐야 한다.

1. **W-AF Pillar 분류**: "이 시나리오가 어느 Pillar를 묻는가" (Reliability? Cost? Security?)
2. **CALMS/DORA 진단**: 어느 축이 약하고 어느 메트릭이 깨졌는가
3. **AWS 도구 후보 추리기**: 도메인별 도구 지도에서 3-4개 후보
4. **trade-off로 단일 정답 선택**: 우선순위·blast radius·비용·운영 부담

> 🎯 **시나리오**: "Slack 알림이 너무 많아 무시당한다"는 보고가 올라온다. 무엇이 문제인가? 도구가 아니라 **Measurement 정의가 잘못된 상태**다. SLO/SLI 없이 모든 메트릭을 alert로 만든 결과 alert fatigue가 생긴 것. 정답은 도구 추가가 아니라 SLO 정의 + Composite Alarm으로 노이즈 축소 + Error Budget 기반 분류다. CALMS의 M 축이 양적으로는 충족됐지만 질적으로 무너진 사례.

---

## 📝 종합 시나리오 12개

**문제 1.** 한 대형 핀테크가 "분기 1회 배포 → 주 1회 배포"로 가속을 추진한다. 현재 상태: 단일 AWS 계정에서 dev/staging/prod를 VPC로만 분리, CodePipeline 없이 사람이 콘솔에서 직접 배포, 사고 발생 시 평균 8시간 복구 소요. CALMS 진단 + 우선순위 처방으로 가장 적합한 것은?

A) Lean 축 약함 → 모노레포로 통합해 PR 머지 리드타임을 줄이고 trunk-based dev 전환이 최우선
B) Automation 축 약함 → Code* 3종(Pipeline+Build+Deploy) 도입이 최우선, 그 다음 멀티 계정 분리 → Measurement(CloudWatch)
C) Sharing 약함 → Confluence wiki + Service Catalog로 팀 간 지식 공유 체계를 먼저 구축
D) Culture 약함 → 외부 컨설팅으로 blameless postmortem 문화를 도입하는 것이 8시간 MTTR의 근본 처방

**정답: B**
해설: 가장 약한 축이 전체를 끌어내린다. 콘솔 수동 배포 = Automation 부재. Automation 없이는 Lean(작은 배치)도 MTTR 단축도 데이터 수집도 다 막힌다. 우선순위 1번은 CodePipeline + CodeBuild + CodeDeploy. **단, 단일 계정에서 prod까지 운영하는 것 자체가 blast radius 위험**이므로 같은 단계에서 Organizations + Account-per-stage로 분리해야 한다(사고 시 한 계정 폭발이 다른 환경으로 안 번지게). 그 다음 CloudWatch 측정, AppConfig flag. 이 순서가 시험의 우선순위 패턴.

---

**문제 2.** 한 회사가 us-east-1과 eu-west-1에 동일 워크로드를 배포한다. 사용자는 글로벌이고 GDPR 준수가 필수. 단일 계정에서 운영 중이라 사고 시 blast radius 우려가 크다. Organizations 도입 후 가장 적합한 OU 구조는?

A) Region 기반 OU (us-east-1 OU, eu-west-1 OU로 나눠 GDPR 데이터 주권을 region 단위로 격리)
B) Environment 기반 OU (Workloads OU 안에 Prod/Non-Prod, 각 계정이 multi-region 운영)
C) Service 기반 OU (Payment OU, User OU로 도메인별 SCP·과금 경계를 분리)
D) Team 기반 OU (Team-A OU, Team-B OU로 조직도와 1:1 매핑해 ownership을 명확히)

**정답: B**
해설: AWS 권장 OU 구조는 **Environment 기반**(Prod / Non-Prod / Security / Infrastructure / Sandbox). 한 계정 안에 multi-region을 운영하지, region별로 OU를 나누지 않는다. ① IAM·SCP가 계정 단위라 region 분리해도 권한 통합이 어렵고 ② Region failover 시 다른 region으로 자연스럽게 이동 가능하며 ③ Cost allocation도 환경 기반이 명확하다. GDPR은 별도 KMS 키 + S3 bucket region 정책 + Macie로 해결, OU 분리와는 무관. Region별 OU가 의미 있는 유일한 경우는 **데이터 주권 규제로 region 자체를 격리 운영해야 할 때**이고, 그조차도 보통 계정 단위 분리로 충분하다.

---

**문제 3.** 한 회사가 SaaS 모니터링 도구 Datadog를 도입한다. Datadog가 우리 AWS 계정의 메트릭에 접근해야 한다. 보안 + 자동화 관점에서 가장 적합한 설정은?

A) Datadog용 IAM User를 만들고 access key를 Datadog에 제공
B) Datadog용 IAM Role을 만들고 trust policy에 Datadog의 AWS 계정 + ExternalId(우리만 아는 secret)를 명시
C) Datadog용 root credentials 제공
D) Datadog용 별도 AWS 계정을 만들어 그 안에 모든 리소스 복사

**정답: B**
해설: Cross-account third-party 통합의 정답 패턴. ① IAM User access key는 정적 자격증명으로 노출 위험(A의 함정) ② root는 절대 금지(C) ③ 계정 복사는 의미 없음(D) ④ 정답은 **IAM Role + trust policy에 Datadog의 AWS 계정 ARN + ExternalId**. ExternalId는 **confused deputy 공격** 방지용 — 같은 Datadog 계정을 쓰는 다른 고객이 우리 자원에 접근하지 못하게 격리하는 secret. Datadog 콘솔에서 자기 고유 ExternalId를 받아 trust policy에 넣는다. 이 패턴은 PagerDuty, New Relic, Sumo Logic 등 모든 third-party SaaS 통합에 동일하게 적용된다.

```json
{
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::464622532012:root"},
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": {"sts:ExternalId": "DD-abc123xyz-our-secret"}
  }
}
```

---

**문제 4.** 한 회사가 "배포 빈도는 일 5회로 Elite 수준인데 Change Failure Rate가 40%"라는 문제를 보고했다. 다음 조치 중 가장 효과적인 것은?

A) 배포 빈도를 줄여 일 1회로 묶고 배치 크기를 키워 QA 검증 시간을 확보한다
B) 모든 배포에 수동 승인 게이트 + 변경자문위원회(CAB) 리뷰를 추가해 실패를 사전 차단한다
C) CodeDeploy Blue/Green + CloudWatch alarm 기반 자동 롤백 + Canary 배포 도입
D) DORA 측정을 중단하고 CFR 대신 배포당 평균 코드 변경량을 추적 지표로 전환한다

**정답: C**
해설: DORA의 핵심 발견은 "**속도와 안정성은 trade-off가 아니라 양의 상관관계**". 빈도를 줄이는 건 잘못된 처방(A). 수동 승인은 lead time만 늘리고 사고를 진짜로 막진 못한다 — 승인하는 사람도 같은 실수를 하기 때문(B). 정답은 자동화 강화: CodeDeploy Blue/Green으로 점진적 트래픽 시프트(예: `Linear10PercentEvery1Minute`), CloudWatch alarm이 임계치 위반 감지하면 자동 롤백, Lambda alias의 weighted alias로 Canary. 수학적으로 보면 Canary 10%에서 5분 노출 시 사용자 영향은 전체 배포의 **1/20 미만**으로 떨어지고, 동시에 자동 롤백이 사람 개입 없이 동작한다. D는 본말 전도.

> 🎯 **시나리오**: 새벽 2시 47분, prod에 배포된 결제 서비스가 메모리 누수를 일으켜 12분 만에 ECS 태스크가 OOM으로 다 죽었다. 사람은 자고 있었지만 CloudWatch Composite Alarm(에러율 + 메모리 사용률)이 9분 만에 트리거됐고, CodeDeploy가 직전 task definition으로 자동 롤백. MTTR 11분. 같은 사고가 작년에는 4시간 걸렸다. 차이는 단 한 가지 — **Blue/Green + Auto-rollback**의 도입 여부였다.

---

**문제 5.** 한 글로벌 회사가 5개 리전에 배포하면서 모든 계정의 CloudTrail 로그를 중앙 집중 + 변조 방지로 관리하려 한다. 가장 적합한 아키텍처는?

A) 각 계정에 개별 CloudTrail trail을 만들어 같은 계정 S3에 저장하고 bucket versioning으로 변조에 대비
B) Organization Trail을 management 계정에서 생성 → Log Archive 계정의 S3 bucket에 저장 → SCP로 bucket 변조 차단 + S3 Object Lock(Compliance mode)
C) 모든 계정의 CloudTrail을 단일 계정 S3 bucket으로 cross-account 복제 + 야간 배치 동기화
D) CloudTrail 대신 CloudWatch Logs에 API 호출을 직접 기록하고 Logs Insights로 감사

**정답: B**
해설: 표준 패턴. ① **Organization Trail**은 management 계정의 단일 trail이 모든 멤버 계정·모든 region 이벤트를 자동 캡처(신규 계정·신규 region 자동 포함) ② **Log Archive 계정**의 S3 bucket이 저장소(계정 분리로 권한 격리, root조차도 SCP로 차단) ③ **SCP**로 Log Archive 계정의 bucket 삭제/변조 차단 ④ **S3 Object Lock Compliance mode**로 retention 기간 내 객체 삭제 자체를 물리적으로 차단(root도 못 지움). A는 계정 분산으로 통합 검색 어려움, C는 복잡한 자체 구현(이미 Organization Trail이 그 일을 함), D는 CloudTrail 자체를 대체할 수 없음(API audit trail 용도).

> 🔍 **더 깊이**: Object Lock에는 Governance와 Compliance 두 모드가 있다. Governance는 `s3:BypassGovernanceRetention` 권한을 가진 사용자가 삭제 가능(IAM으로 회피 가능). Compliance는 retention 기간 동안 **AWS root account조차도 삭제 불가**다. 감사·소송 대응(legal hold) 시나리오에서는 Compliance가 정답. 단, 잘못 설정하면 영원히 못 지우니 retention 기간을 신중히.

---

**문제 6.** 한 회사가 멀티 계정 환경에서 CI/CD를 구축한다. CodePipeline은 Shared Services 계정에 있고, 배포 대상은 Prod 계정. Prod 계정의 ECS 서비스로 배포해야 하며, KMS 키로 암호화된 artifact를 사용한다. 가장 정확한 권한 설정은?

A) Shared Services 계정의 pipeline role이 Prod 계정의 ECS와 KMS에 직접 접근
B) Prod 계정에 CrossAccountDeployRole 생성(trust: Shared Services) + Shared Services의 KMS 키 정책에 Prod 계정 사용 허용 + Prod 계정 role이 ECS UpdateService 권한 보유 + S3 artifact bucket policy에 Prod 계정 read 권한
C) Prod 계정의 root credentials를 Shared Services에 저장
D) IAM Identity Center로 SSO 설정만 하면 자동으로 해결

**정답: B**
해설: Cross-account CI/CD의 정답 패턴. 네 가지 권한 경계를 모두 정렬해야 한다. ① **trust 관계**: Prod 계정에 CrossAccountDeployRole 생성, trust policy에 Shared Services 계정 명시 ② **KMS 키 정책**: Shared Services의 KMS 키 정책에 Prod 계정의 role이 `Decrypt`/`GenerateDataKey` 가능하다고 명시(IAM 정책만으로는 KMS cross-account 접근 안 됨, 키 정책이 게이트) ③ **IAM permission**: Prod 계정의 role이 ECS UpdateService, ECR pull 등 배포 권한 ④ **S3 bucket policy**: artifact bucket이 Prod 계정 read를 허용. A는 cross-account 직접 접근 불가(AssumeRole 필요), C는 root 절대 금지, D는 IAM Identity Center는 사람 사용자 SSO지 machine workflow가 아님(CodePipeline은 자기 service role로 작동).

---

**문제 7.** 한 회사가 모든 계정에 "ap-northeast-2와 us-east-1 외 리전에서 EC2/RDS/S3 작업 금지"를 강제하려 한다. SCP를 작성할 때 반드시 주의해야 할 점은?

A) SCP는 `aws:RequestedRegion` 조건 키를 지원하지 않으므로 region 제한은 IAM 경계 정책으로만 가능
B) `NotAction`으로 글로벌 서비스(IAM, CloudFront, Route 53, Organizations, Support 등) 제외 필수, 안 그러면 IAM 작업까지 막혀 계정 운영 불가
C) SCP는 멤버 계정의 root 사용자에는 적용되지 않으므로 root로 우회 배포가 가능해 무력화됨
D) 대상 region에서 EC2/RDS Service Quota를 0으로 조정해야 SCP가 region 차단을 강제할 수 있음

**정답: B**
해설: 시험의 단골 함정이다. IAM, CloudFront, Route 53, Organizations 같은 **글로벌 서비스는 region 개념이 없어서** `aws:RequestedRegion` 조건이 글로벌 서비스 API에서는 의도와 다르게 평가된다(글로벌 서비스는 내부적으로 us-east-1로 라우팅된다). region restriction SCP를 만들 때 `NotAction`으로 글로벌 서비스를 제외해야 IAM 작업까지 막히지 않는다. A는 사실 아님(`aws:RequestedRegion` 조건 키 지원), C는 잘못(SCP는 root에도 적용 — 단, management 계정의 root는 예외), D는 무관.

```json
{
  "Effect": "Deny",
  "NotAction": [
    "iam:*", "organizations:*", "cloudfront:*",
    "route53:*", "support:*", "sts:*",
    "s3:ListAllMyBuckets", "globalaccelerator:*"
  ],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": {
      "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
    }
  }
}
```

> ⚠️ **함정**: 2022년 한 대기업이 region SCP를 잘못 적용해 IAM 작업이 막혀 6시간 동안 계정 운영 불가 상태가 됐다. management 계정의 root로 SCP를 detach 해서 복구했는데, 만약 management 계정에도 같은 SCP가 적용됐다면 이마저도 막혀 AWS Support를 통한 복구가 필요했을 것이다. **SCP 변경 전에는 반드시 sandbox OU에서 먼저 테스트하라.**

---

**문제 8.** 한 회사가 EKS 클러스터를 Prod 계정에 운영하고, ArgoCD를 통해 GitOps 방식으로 배포한다. 단일 클러스터 시나리오에서 ArgoCD는 어디에 두는 게 가장 적합한가?

A) 같은 Prod 클러스터 안에 두기 (pull-based GitOps 원형)
B) 별도 Shared Services 계정에 두고 IRSA로 Prod 계정 EKS API에 cross-account 접근 (Hub-Spoke)
C) 각 환경 계정마다 별도 ArgoCD 설치 + ApplicationSet으로 중복 동기화 운영
D) ArgoCD 대신 CodePipeline + kubectl ECS deploy action으로 push-based 배포

**정답: A**
해설: 단일 클러스터·단일 환경에서 GitOps의 정통 패턴은 **같은 클러스터 안에 ArgoCD를 두는 것**이다. ① ArgoCD가 Git을 polling 하고 ② 같은 클러스터의 Kubernetes API에 in-cluster service account로 접근 ③ credential이 클러스터 밖으로 나가지 않음 ④ 클러스터 멀티 테넌시 격리도 ArgoCD Project로 가능. 멀티 클러스터·멀티 계정에서는 B(Hub-Spoke)도 흔한 패턴이지만, 그 경우 Shared Services의 ArgoCD가 각 클러스터의 credential을 들고 있어야 해서 보안 경계가 복잡해진다. C는 중복 운영 부담. D는 GitOps 원칙(pull-based, Git as SSOT) 자체를 위반.

> 🔍 **더 깊이**: ArgoCD Hub-Spoke의 가장 까다로운 부분은 **EKS API 접근 경로**다. 옵션 ① Shared Services의 ArgoCD가 각 Spoke 클러스터의 `aws-auth` ConfigMap에 등록된 IAM Role을 AssumeRole → kubeconfig 갱신 ② EKS Pod Identity 또는 IRSA로 ArgoCD pod가 cross-account role을 받음 ③ ArgoCD ApplicationSet의 cluster generator로 등록. 모든 옵션에서 Spoke 클러스터의 RBAC을 신중히 분리해야 — 한 ArgoCD가 모든 클러스터의 cluster-admin이 되면 보안 사고 한 번에 전체가 무너진다.

---

**문제 9.** 한 회사가 "DORA 메트릭을 dashboard로 시각화하라"는 요구를 받았다. AWS 환경에서 가장 적합한 데이터 파이프라인은?

A) Lambda에서 hard-coded 값 출력
B) CodePipeline/CodeDeploy 이벤트 → EventBridge → Lambda(가공) → CloudWatch Custom Metric(EMF) → CloudWatch Dashboard, 또는 EventBridge → Firehose → S3 → Athena → QuickSight
C) Excel 파일에 수동 입력
D) Amazon Forecast로 메트릭 예측

**정답: B**
해설: DORA는 AWS가 직접 측정해주지 않으므로 자체 파이프라인이 필요하다. AWS는 "측정 프레임"만 정의하고 구현은 고객 몫이다. 두 표준 패턴 모두 정답이다.

**경로 1 (실시간):** EventBridge → Lambda → CloudWatch Custom Metric(EMF format)
- 장점: 거의 실시간, 알람과 직결, 운영 부담 낮음
- 단점: CloudWatch Metric 보존 15개월 한계, 복잡한 join 어려움

**경로 2 (분석형):** EventBridge → Kinesis Firehose → S3 → Athena → QuickSight
- 장점: 무기한 보존, 복잡한 SQL 가능, 비용 효율
- 단점: 지연 분 단위, 인프라 복잡

Google의 **Four Keys** 프로젝트(`github.com/GoogleCloudPlatform/fourkeys`)가 reference implementation — 원래 GCP 기반이지만 AWS로 포팅 가능. C는 자동화 부재, D는 ML 예측 도구(DORA 측정과 무관).

---

**문제 10.** 한 회사가 Production 계정의 "특정 시간(주말, 새벽 0-6시)에 자동으로 read-only mode"를 강제하려 한다. 가장 적합한 메커니즘은?

A) IAM Policy에 `aws:CurrentTime` datetime condition을 넣어 계정의 모든 user에 일일이 attach
B) SCP에 `Deny` + `aws:CurrentTime` condition으로 작성, 해당 OU에 적용 → 그 시간대 모든 write API 차단. 단, 글로벌 서비스 제외 + 비상 access role은 ArnNotLike로 제외
C) EventBridge 스케줄로 그 시간대에 Route 53 라우팅을 비활성화해 트래픽 자체를 차단
D) Lambda 스케줄로 그 시간대에 Prod EC2/ECS 인스턴스를 자동 종료해 변경 자체를 봉쇄

**정답: B**
해설: SCP의 `aws:CurrentTime` condition으로 시간 기반 차단 구현. SCP는 계정 전체에 영향을 주는 거버넌스 도구라 모든 user/role에 일관 적용된다. A(IAM Policy)도 가능하지만 모든 user에 일일이 적용해야 하므로 누락 위험. 핵심 함정 — **비상 access role을 반드시 ArnNotLike로 제외**해야 한다. 새벽에 진짜 사고가 났을 때 SRE가 들어갈 수 있어야 한다.

```json
{
  "Effect": "Deny",
  "NotAction": ["iam:*", "organizations:*", "cloudfront:*", "route53:*"],
  "Resource": "*",
  "Condition": {
    "DateGreaterThan": {"aws:CurrentTime": "2026-06-15T00:00:00Z"},
    "DateLessThan": {"aws:CurrentTime": "2026-06-17T00:00:00Z"},
    "ArnNotLike": {
      "aws:PrincipalArn": "arn:aws:iam::*:role/EmergencyAccessRole"
    }
  }
}
```

> 🎯 **시나리오**: 한 게임 회사가 금요일 17시 이후 prod 배포를 SCP로 차단했다. 그런데 토요일 새벽 보안 패치가 필요한 상황이 발생했고, 모든 배포가 막혀 있어 30분간 노출됐다. 교훈 — **"deploy freeze"는 단방향이 아니라 양방향 정책**이어야 한다. 정기 변경은 막되, 보안 hotfix용 별도 role(예: `SecurityHotfixRole`)은 ArnNotLike로 빼두는 것이 표준 패턴이다.

---

**문제 11.** Werner Vogels의 "You Build It, You Run It" 원칙을 AWS 환경에서 가장 정확히 구현하는 조직 모델은?

A) 중앙 DevOps팀이 모든 서비스의 파이프라인과 CloudWatch 알람을 관리
B) Stream-aligned 팀(2-Pizza Team)이 자기 서비스의 CodePipeline·CloudWatch·X-Ray·SLO를 모두 소유, Platform 팀이 공통 인프라(Service Catalog, IDP, Account Vending)를 제공
C) 외부 MSP에 운영 위탁
D) 개발팀과 운영팀을 명확히 분리

**정답: B**
해설: AWS Werner Vogels 모델 + Team Topologies(Skelton & Pais)의 결합. ① **Stream-aligned 팀**이 자기 서비스 lifecycle 전체 소유(개발 + 배포 + 운영 + on-call) ② **Platform 팀**이 그 위의 마찰을 줄이는 공통 도구 제공(Service Catalog로 표준 stack, Proton으로 IDP, AFT/Control Tower로 Account Vending) ③ **Enabling 팀**이 신기술 도입 컨설팅(예: ML platform 도입) ④ **Complicated-subsystem 팀**이 특수 영역(예: 결제 PCI-DSS). A는 중앙집중으로 ownership 분산, C는 책임 외주화로 학습 단절, D는 DevOps 운동이 깨고자 했던 사일로 그 자체.

> 💡 **관련 이론**: Platform 팀이 만드는 IDP(Internal Developer Platform)는 Backstage(Spotify, 2020 오픈소스)가 대표적이다. AWS는 AWS Proton으로 비슷한 기능을 제공하며, "stream-aligned 팀이 self-service로 인프라를 받아갈 수 있어야 한다"는 Team Topologies의 cognitive load reduction 원칙을 구현한다.

---

**문제 12.** 한 회사가 "한 팀이 sandbox 계정에서 비용을 한 달에 \$30,000 쓴 사고가 발생했다. 같은 일이 재발하지 않게 하라"는 요구를 받았다. 가장 효과적인 조치 조합은?

A) AWS Budgets로 \$5,000 임계 시 SNS·이메일 알림을 보내고 팀 리드가 수동 대응
B) ① Service Catalog로 instance type 제한 ② SCP로 `ec2:RunInstances` 시 InstanceType condition(`t3.*`, `t4g.*`만 허용) ③ AWS Budgets Action으로 \$5,000 초과 시 IAM 정책 자동 attach(추가 권한 차단) ④ Cost Anomaly Detection 활성화
C) 사람이 매일 Cost Explorer를 열어 비용을 확인하고 이상 시 슬랙으로 에스컬레이션
D) sandbox 계정을 폐쇄하고 실험 워크로드를 승인제 Non-Prod 계정으로 이관

**정답: B**
해설: **다층 방어(defense in depth)**가 비용 거버넌스의 정답이다. ① Service Catalog는 권장 path만 제공(but 우회 가능) ② SCP는 강제 가드레일(우회 불가) ③ Budgets Action은 사후 자동 대응 ④ Anomaly Detection은 ML 기반 이상 탐지. A(알림만)는 사람이 잘 때 무용지물, C(수동)는 휴먼 에러 누적, D(폐쇄)는 sandbox의 존재 이유 자체를 부정. 핵심은 "**예방(SCP) + 탐지(Anomaly) + 자동 대응(Budgets Action)**" 3단 구조.

> 📚 **사례**: 2020년 한 스타트업이 sandbox에서 `p4d.24xlarge` 인스턴스 8대를 실수로 켜뒀고, 주말 동안 \$58,000이 청구됐다. 사후 분석 결과 ① 알람은 있었지만 메일로만 와서 못 봄 ② Budgets Action 미설정 ③ SCP로 instance type 제한 없음. AWS Support와 협상으로 일부 환불받았지만, 그 이후 SCP에 `Deny` + `ec2:InstanceType` condition을 표준 적용했다. 시험에서 "비용 사고 재발 방지"가 나오면 거의 항상 SCP + Budgets Action 조합이 정답이다.

---

## Week 1 마무리 — 다음 주로 가는 다리

오늘까지 본 다섯 가지 — DevOps 운영 모델, CALMS/DORA, W-AF, 도구 지도, 멀티 계정 — 는 **DOP-C02 도메인 1~6 전부의 배경**이 된다. 도메인 1(SDLC)을 다음 주부터 본격적으로 들어가는데, 그때 만나게 될 CodePipeline / CodeBuild / CodeDeploy 시나리오는 모두 다음 두 질문 위에서 풀린다.

1. "이 변경을 **얼마나 빠르고 안전하게** 흘려보낼 것인가" (DORA)
2. "사고가 나면 **얼마나 좁은 범위에서** 멈출 것인가" (blast radius + 멀티 계정)

이 두 질문을 잊지 않으면 다음 주 트렁크 기반 개발, OIDC 페더레이션, CodeArtifact, 코드 서명 같은 주제들이 "각각 따로 외워야 할 도구"가 아니라 "같은 사고 프레임의 다른 부품"으로 보이기 시작할 것이다.
