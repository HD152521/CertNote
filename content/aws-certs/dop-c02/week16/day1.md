# Day 1 - 도메인 1·2 통합 복습: SDLC 자동화와 IaC를 한 줄기로 꿰는 원리

16주를 달려온 끝에 도착한 마지막 주차의 첫 글은 "복습"이라는 이름을 달고 있지만, 단순한 암기 카드 나열이 아니다. 진짜 복습은 흩어진 서비스 이름을 다시 외우는 일이 아니라, **그 서비스들이 왜 그 자리에 있는지 — 어떤 문제를 풀려고 태어났고, 어떤 다른 도구와 경쟁하며, 어떤 실패에서 교훈을 얻어 지금의 모습이 됐는지 — 를 한 줄기로 꿰는 일**이다. DOP-C02 시험에서 도메인 1(SDLC 자동화, 22%)과 도메인 2(IaC + 구성 관리, 17%)는 합쳐 39%로 가장 큰 비중을 차지한다. 둘은 시험 청사진(blueprint)에서 별개의 도메인으로 나뉘어 있지만, 실무에서는 분리되지 않는다. 파이프라인이 인프라를 배포하고, 인프라가 파이프라인을 정의하며, 구성(configuration)이 둘 사이를 흐른다. 오늘은 이 39%를 "코드가 커밋에서 프로덕션까지 가는 단 하나의 흐름"으로 재구성하면서, 그 흐름의 각 길목에 깔린 역사·내부 원리·실제 사고의 교훈을 함께 판다.

이 통합 관점이 중요한 이유는, Pro 시험의 함정이 대부분 "도메인 경계를 넘나드는" 지점에 있기 때문이다. "CodePipeline이 CloudFormation StackSets를 배포하는데 cross-account에서 KMS 오류가 난다"는 문제는 도메인 1(파이프라인)과 도메인 2(IaC)와 도메인 6(보안)이 동시에 얽힌다. 각 서비스를 따로 외운 사람은 이 교차점에서 무너지고, 흐름으로 이해한 사람은 "아, 아티팩트 암호화 키 정책이 빠졌구나"를 즉시 짚는다.

## SDLC 자동화의 계보 — Code* 제품군은 왜 이렇게 쪼개져 있는가

AWS의 개발자 도구 — CodeCommit, CodeBuild, CodeDeploy, CodePipeline — 가 네 개로 쪼개져 있는 것은 우연이 아니다. 이 분할은 **CI/CD 파이프라인의 정통 단계 모델**을 그대로 반영한다. 소스(source) → 빌드(build) → 테스트(test) → 배포(deploy)라는 단계는 2000년대 중반 Jez Humble과 David Farley가 정립한 **Continuous Delivery** 개념에서 왔고, 그들의 2010년 저서 『Continuous Delivery』가 "배포 파이프라인(deployment pipeline)"이라는 용어를 대중화했다. AWS의 Code* 제품군은 이 책의 파이프라인 모델을 관리형 서비스로 분해한 것이다.

> 💡 **관련 이론**: 파이프라인을 단계로 쪼개는 것은 CS의 **파이프라이닝(pipelining)** 원리와 같은 사상이다. CPU가 명령어 실행을 fetch-decode-execute-writeback 단계로 나눠 각 단계를 서로 다른 명령어가 동시에 점유하게 하듯, CI/CD 파이프라인도 단계를 분리하면 커밋 A가 배포 단계에 있는 동안 커밋 B가 빌드 단계를 점유할 수 있다(이론상). 더 중요한 것은 **관심사 분리(separation of concerns)**다. 빌드의 책임(컴파일·테스트·아티팩트 생성)과 배포의 책임(트래픽 시프트·롤백)을 분리하면, 각 단계를 독립적으로 교체·확장·재시도할 수 있다. CodeBuild를 Jenkins로, CodeDeploy를 Spinnaker로 바꿔도 CodePipeline이라는 오케스트레이터는 그대로 둘 수 있는 것이 이 분리의 힘이다. 시험에서 "CodePipeline의 한 Stage는 실패하면 어떻게 되는가" 같은 질문은 이 단계 독립성을 전제로 한다 — 한 Action이 실패하면 그 Stage에서 멈추고, 이전 Stage의 산출물은 보존된다.

> 🔍 **더 깊이**: CodePipeline에는 V1과 V2라는 두 세대가 있고, 이 차이가 Pro 시험의 단골이다. V1은 2015년 출시 당시의 모델로, 트리거가 단순하고(소스 변경 시 전체 실행) 파이프라인 변수가 없다. V2(2023년 도입)는 **동적 변수(variables)**, **세밀한 트리거(filePaths·branches·tags 필터)**, **파이프라인 수준 변수 전달**을 지원한다. 예컨대 "monorepo에서 `services/payment/**` 경로가 바뀔 때만 payment 파이프라인을 실행"하려면 V2의 `filePaths` 트리거가 필요하다. 또 V2는 실행 모드(SUPERSEDED·QUEUED·PARALLEL)를 선택할 수 있어, 동시 커밋이 몰릴 때 큐잉할지 병렬 실행할지 제어한다. 과금 모델도 다르다 — V1은 활성 파이프라인당 월 정액, V2는 실행 시간(action minutes) 과금이라 자주 안 도는 파이프라인은 V2가 싸다. 시험에서 "monorepo 경로 필터" 또는 "동적 변수" 단서가 나오면 답은 V2다.

이 계보를 알면 한 가지 시험 함정이 풀린다 — **CodeCommit은 2024년 7월부터 신규 가입자에게 닫혔다.** AWS는 GitHub·GitLab 같은 외부 Git 호스팅과의 통합(CodeConnections, 구 CodeStar Connections)에 무게를 옮겼다. 따라서 Pro 시험의 최신 시나리오는 "GitHub Actions가 OIDC로 AWS에 배포" 같은 외부 소스 + 페더레이션 패턴을 점점 더 많이 묻는다. CodeCommit을 정답으로 고르기 전에 "이게 신규 환경인가"를 확인하는 습관이 필요하다.

## 배포 전략의 수학 — Blue/Green·Canary·Rolling은 무엇을 다르게 계산하는가

배포 전략은 DOP 시험의 심장이다. 그런데 In-place / Blue/Green / Canary / Linear / Rolling을 "다운타임 있다/없다"로만 외우면 Pro 문제를 놓친다. 각 전략은 **"잘못된 배포가 영향을 미치는 사용자 수 × 그 영향이 지속되는 시간"**을 다르게 최소화하는 서로 다른 수학이다.

| 전략 | 영향받는 사용자(나쁜 배포 시) | 추가 인프라 비용 | 롤백 속도 | 핵심 메커니즘 |
|------|------|------|------|------|
| All-at-once / In-place | 100% 즉시 | 0 | 느림(재배포) | 전체 동시 교체 |
| Rolling | 배치 비율씩 증가 | 0 | 중간 | N대씩 순차 교체 |
| Blue/Green | 0%(스위치 전) / 100%(스위치 후) | 2배(일시) | 즉시(트래픽 되돌림) | 두 환경 + 라우팅 전환 |
| Canary | 카나리 비율(예: 10%)만 | 약간 | 자동(알람) | 소수 → 다수 2단계 |
| Linear | 증분 비율씩 점증 | 약간 | 자동(알람) | N%씩 N분마다 |

> 💡 **관련 이론**: 카나리 배포라는 이름은 **탄광의 카나리아(canary in a coal mine)**에서 왔다. 19세기 광부들이 일산화탄소·메탄을 감지하려고 카나리아 새를 갱도에 데려갔는데, 새가 사람보다 먼저 쓰러져 위험을 경고했다. 카나리 배포의 카나리 그룹(소수 트래픽)은 바로 그 새다 — 전체 사용자가 영향받기 전에 소수가 먼저 새 버전의 문제를 드러낸다. 수학적으로 이는 **순차적 가설 검정(sequential hypothesis testing)**이다. "새 버전이 정상이다"라는 귀무가설을 소량 트래픽으로 검증하고, 에러율·레이턴시 지표(CloudWatch Alarm)가 임계를 넘으면 가설을 기각하고 자동 롤백한다. 핵심 통찰: 카나리는 **나쁜 배포의 기댓값 손실(expected loss) = 영향 사용자 비율 × 노출 시간**을 최소화한다. 10% 카나리를 5분만 노출하면, 최악의 경우 손실이 "전체의 10% × 5분"으로 제한된다. Blue/Green이 "스위치 후 100% 즉시 노출되지만 롤백도 즉시"인 것과 대비된다.

> 🔍 **더 깊이**: 같은 "Blue/Green"이라도 플랫폼마다 메커니즘이 완전히 다르다. **Lambda**의 Blue/Green은 **Alias + 가중 라우팅**이다 — `prod` Alias가 버전 1에 90%, 버전 2에 10%를 분배하고, CodeDeploy가 이 가중치를 시간에 따라 옮긴다(Canary/Linear). **ECS**의 Blue/Green은 **ALB의 두 Target Group + 두 Listener(프로덕션/테스트)**다 — CodeDeploy가 새 Task Set을 테스트 리스너에 띄워 검증한 뒤 프로덕션 리스너를 새 Target Group으로 전환한다. **EC2**의 Blue/Green은 **새 Auto Scaling Group을 띄우고 ELB 등록을 교체**한다. 시험에서 "ECS Blue/Green"이라는 단서가 나오면 거의 항상 답에 "CodeDeploy + ALB Test/Prod Listener"가 들어가고, "Lambda 5분마다 50% 두 단계"는 `Canary50Percent5Minutes`, "10분마다 10%씩"은 `Linear10PercentEvery10Minutes`다. Canary는 **2단계(소수→전체)**, Linear는 **N단계 균등 증분**이라는 구조 차이를 반드시 구분해야 한다.

> 📚 **사례**: 2017년 영국 **TSB 은행**의 IT 마이그레이션 실패는 배포 전략의 교훈으로 자주 인용된다. TSB는 새 코어뱅킹 플랫폼으로 전체를 한 번에(big-bang) 전환했고, 검증되지 않은 시스템에 190만 고객을 동시에 노출시켰다. 결과는 수주간의 장애, 고객 자금 접근 불능, 약 3억3천만 파운드의 손실과 규제 제재였다. 만약 카나리/점진 전략으로 소수 지점·소수 고객부터 단계적으로 이전했다면 폭발 반경이 그 비율로 제한됐을 것이다. 이 사건의 핵심 교훈은 DOP 시험 철학과 정확히 일치한다 — **"되돌릴 수 없는 big-bang 배포를 피하고, 영향 범위를 점진적으로 키우며, 자동 롤백 경로를 항상 준비하라."** 시험에서 "리스크 최소화", "사용자 영향 최소화" 단서가 나오면 All-at-once는 거의 항상 오답이다.

## 공급망 무결성 — 빌드 파이프라인이 표적이 되는 이유

빌드 단계는 단순히 코드를 컴파일하는 곳이 아니라, **신뢰 사슬(chain of trust)이 시작되는 곳**이다. 여기서 만들어진 아티팩트가 그대로 프로덕션에 배포되므로, 빌드 파이프라인이 오염되면 모든 다운스트림이 오염된다.

> 📚 **사례**: 2020년 **SolarWinds** 사건은 공급망 공격(supply chain attack)의 교과서다. 공격자는 SolarWinds의 Orion 소프트웨어 **빌드 시스템**에 침투해, 컴파일 과정에 악성 코드(SUNBURST)를 주입했다. 그 결과 정상 서명된 업데이트를 통해 약 18,000개 고객 조직에 백도어가 배포됐고, 미 재무부·국토안보부를 포함한 정부 기관이 침해됐다. 핵심 교훈: 소스 코드 저장소가 깨끗해도 **빌드 환경이 오염되면 산출물이 오염된다.** 이 사건 이후 업계는 **SLSA(Supply-chain Levels for Software Artifacts)** 프레임워크를 만들어 빌드 출처(provenance)·격리·서명을 단계화했고, **SBOM(Software Bill of Materials)** — 아티팩트에 포함된 모든 의존성 목록 — 이 컴플라이언스 요건이 됐다(미국 행정명령 14028). AWS에서는 CodeBuild를 격리 VPC에서 돌리고, **AWS Signer**로 아티팩트(Lambda·컨테이너·AMI)를 서명하며, ECR 이미지에 **Notation/Notary** 서명을 붙이고, Inspector로 SBOM 기반 취약점을 스캔하는 조합으로 SLSA 수준을 끌어올린다.

> ⚠️ **함정**: "컨테이너 이미지 위·변조 방지"를 묻는 문제에서 KMS나 S3 ACL을 고르면 틀린다. KMS는 **암호화(기밀성)**이지 **무결성·출처 증명**이 아니다. 이미지가 빌드된 그대로이고 신뢰된 주체가 만들었음을 증명하는 것은 **서명(signing)** — AWS Signer + ECR Image Signing + 배포 시 Notation 검증 — 이다. 암호화와 서명을 혼동하는 것이 보안 영역의 대표 함정이다. 비유하면 KMS는 "편지를 봉투에 넣고 잠그는 것", 서명은 "편지 끝에 위조 불가능한 도장을 찍는 것"이다.

## IaC의 두 철학 — 선언적 수렴과 명령적 절차, 그리고 드리프트

도메인 2로 넘어가면 핵심은 단 하나의 질문으로 압축된다. **"인프라의 목표 상태를 코드로 선언하고, 도구가 현재 상태와의 차이를 계산해 수렴시킨다"**는 선언적 패러다임이다. CloudFormation·CDK·Terraform이 모두 이 사상 위에 서 있다.

> 💡 **관련 이론**: 선언적 IaC의 핵심은 **수렴 루프(reconciliation loop)** — 제어 이론의 피드백 제어와 같다. "목표 상태(desired state)"와 "관측 상태(observed state)"의 차이(error)를 계산해, 그 차이를 0으로 만드는 액션을 적용한다. Kubernetes의 컨트롤러, Terraform의 plan/apply, CloudFormation의 스택 업데이트가 모두 이 루프다. 이것이 **선언적(declarative) vs 명령적(imperative)** 차이의 본질이다. 명령적 스크립트("이 명령을 순서대로 실행하라")는 실행 순서·실패 처리·부분 적용 후 재시도를 사람이 책임져야 하지만, 선언적 시스템은 **멱등성(idempotency)** — 같은 코드를 몇 번 적용해도 결과가 같음 — 을 보장한다. 멱등성이야말로 IaC가 신뢰할 수 있는 이유다. 같은 템플릿을 100개 계정에 100번 적용해도(StackSets) 각 계정은 동일한 목표 상태로 수렴한다.

> 🔍 **더 깊이**: **드리프트(drift)**는 이 패러다임의 가장 미묘한 적이다. 누군가 콘솔에서 손으로 보안 그룹을 열거나 태그를 지우면, "코드가 선언한 상태"와 "실제 상태"가 벌어진다. CloudFormation **Drift Detection**은 스택의 각 리소스를 실제 상태와 비교해 MODIFIED·DELETED·IN_SYNC로 분류한다. 그런데 시험에서 자주 묻는 것은 "어떻게 **자동으로** 드리프트를 탐지하고 대응하는가"다. 답의 패턴: EventBridge **Scheduled Rule**로 주기적 Drift Detection을 트리거하고, 드리프트 발견 시 SNS 알림 또는 자동 재배포(stack update로 코드 상태로 되돌림)를 건다. 더 강한 거버넌스는 **AWS Config**의 `cloudformation-stack-drift-detection-check` 규칙으로 비준수를 탐지하고 Auto-Remediation을 건다. 핵심 통찰: 드리프트는 "선언적 시스템에 명령적 변경이 끼어든 흔적"이며, 이를 막는 근본책은 **콘솔 쓰기 권한을 막고 모든 변경을 코드로만**(read-only by default + pipeline-only write) 흐르게 하는 것이다.

> 📚 **사례**: 2017년 **AWS S3 us-east-1 대정전**은 명령적 운영의 위험을 보여준다. 엔지니어가 S3 빌링 서브시스템 디버깅 중 **수동 명령(playbook)**을 실행했는데, 의도보다 많은 서버를 제거하는 오타가 있었고, 이것이 연쇄 재시작을 유발해 약 4시간 동안 us-east-1의 상당 부분이 마비됐다(수많은 웹사이트가 함께 다운). AWS의 사후 조치 중 하나가 "이런 위험한 수동 작업에 안전 가드레일과 단계적 적용을 추가"였다 — 바로 명령적 즉시 실행을 선언적·점진적 적용으로 바꾸는 방향이다. 이 사건은 "수동 변경은 폭발 반경이 즉각적이고 통제 불가"라는 교훈을 남겼고, IaC + 파이프라인 기반 변경(코드 리뷰 → Change Set 미리보기 → 점진 적용)의 정당성을 강화했다.

## 구성 관리의 분리 — Parameter Store, Secrets Manager, AppConfig는 무엇이 다른가

코드와 인프라 사이를 흐르는 것이 **구성(configuration)**이다. AWS는 이를 세 갈래로 나눠 제공하는데, 이 분리를 이해하면 시험에서 즉답이 나온다.

| 항목 | Parameter Store | Secrets Manager | AppConfig |
|------|------|------|------|
| 본질 | 설정·파라미터 저장 | 비밀의 생명주기 관리 | 런타임 동적 구성·피처 플래그 |
| 자동 회전 | 없음(직접 구현) | **내장**(Rotation Lambda) | 해당 없음 |
| 검증 | 없음 | 없음 | **Validator**(JSON Schema/Lambda) |
| 점진 배포 | 없음 | 없음 | **Deployment Strategy**(점진 롤아웃 + 자동 롤백) |
| 비용 | 표준 무료 | 시크릿당 ~$0.40/월 | 구성 가져오기 기준 |
| 대표 용도 | 비밀 아닌 설정·환경값 | DB/외부 API 자격 | 피처 플래그·동적 임계값 |

> 💡 **관련 이론**: 이 셋의 분리는 **"구성은 코드가 아니다(config is not code)"**라는 12-Factor App 원칙의 정교화다. 12-Factor App(Heroku, 2011)은 "환경별로 바뀌는 값은 코드에서 분리해 환경에 둔다"고 했지만, 현대 시스템은 그 "구성"을 다시 세 종류로 나눈다. (1) **정적 설정**(거의 안 바뀜, 비밀 아님) → Parameter Store. (2) **비밀**(회전·감사가 필요한 자격) → Secrets Manager. (3) **동적 행동 제어**(런타임에 바뀌고, 잘못되면 즉시 위험) → AppConfig. AppConfig가 특별한 이유는 **구성 변경 자체를 배포처럼 다룬다**는 점이다 — Validator로 사전 검증하고, Deployment Strategy로 점진 롤아웃하고, CloudWatch Alarm 연동으로 자동 롤백한다. 즉 "잘못된 피처 플래그 한 줄"이 일으킬 사고를 코드 배포와 동일한 안전망으로 막는다. 시험에서 "피처 플래그를 점진 롤아웃 + 잘못된 값 사전 차단" 단서는 AppConfig + Validator + Deployment Strategy의 3종 세트가 정답이다.

> ⚠️ **함정**: AppConfig는 **푸시(push)가 아니라 폴링(poll)** 모델이다. 애플리케이션이 AppConfig Agent(또는 Lambda Extension)를 통해 주기적으로 구성을 가져온다(polling interval 설정 가능). "구성이 바뀌면 AWS가 애플리케이션에 즉시 푸시한다"고 적힌 보기는 함정이다. 또 Parameter Store의 SecureString도 KMS 암호화를 하지만 **자동 회전이 없다** — "RDS 자격을 90일마다 자동 회전"에서 Parameter Store를 고르면 틀린다. 회전이 핵심이면 무조건 Secrets Manager + Rotation Lambda다.

## 39%를 하나로 — 통합 흐름 다이어그램

도메인 1과 2를 분리하지 말고, 커밋 하나가 프로덕션까지 가는 단일 흐름으로 묶어 보면 모든 서비스의 자리가 보인다.

```
개발자 커밋 (GitHub / CodeCommit-레거시)
   │  CodeConnections(OIDC, 정적 키 없음)
   ▼
CodePipeline V2 (Tooling 계정 Hub)
   ├─ Source   : 변수/트리거(filePaths·branch 필터)
   ├─ Build    : CodeBuild(격리 VPC + VPC Endpoint)
   │              → CodeArtifact(패키지) / ECR(이미지)
   │              → Inspector 스캔 + Signer/Notation 서명 [공급망 무결성]
   ├─ Test     : 단위/통합 + CodeGuru/SAST
   ├─ Deploy   : CloudFormation/CDK (Change Set 미리보기)
   │              cross-account AssumeRole → Spoke
   │              [아티팩트 S3 + KMS CMK 키 정책에 Spoke 허용 필수]
   │              CodeDeploy(Lambda Canary / ECS Blue-Green)
   │              + CloudWatch Alarm 연동 자동 롤백
   └─ Config 주입: Parameter Store(설정) / Secrets Manager(자격) / AppConfig(플래그)

거버넌스 게이트: SSM Change Calendar(freeze) · Manual Approval · Drift Detection(EventBridge)
```

> 🎯 **시나리오**: "한 핀테크가 monorepo로 30개 서비스를 운영한다. 요구사항: ① `services/X/**` 경로 변경 시에만 해당 서비스 파이프라인 실행 ② 빌드 아티팩트의 위·변조 방지 ③ Lambda 함수는 10% 카나리 5분 후 전체 ④ 배포 시 DB 자격은 코드에 노출 없이 90일 자동 회전 ⑤ prod는 변경 freeze 기간에 차단." → ① CodePipeline **V2 + filePaths 트리거**. ② **Signer/ECR 서명 + Inspector SBOM 스캔**(KMS 아님). ③ CodeDeploy **`Canary10Percent5Minutes`** + CloudWatch Alarm 자동 롤백. ④ **Secrets Manager + Rotation Lambda**(Parameter Store 아님). ⑤ **SSM Change Calendar** 게이트. 이 다섯 단서가 각각 도메인 1·6·1·2·1을 넘나든다 — 통합 흐름으로 외운 사람만 한 번에 매핑한다.

## 정리하며

오늘 도메인 1+2의 39%를 다섯 줄기로 묶었다. 첫째, **Code\* 제품군의 분할은 Continuous Delivery의 단계 모델 + 관심사 분리**이며, V2의 변수·트리거·실행 모드가 Pro의 단골이고 CodeCommit은 신규 환경에서 빠진다. 둘째, **배포 전략은 "영향 사용자 × 노출 시간"을 다르게 최소화하는 수학**이며, Canary(2단계)와 Linear(균등 증분)의 구조 차이, 플랫폼별(Lambda Alias / ECS ALB Listener / EC2 ASG) 메커니즘 차이가 핵심이고, TSB·big-bang의 교훈처럼 리스크 최소화 단서에 All-at-once는 오답이다. 셋째, **빌드는 신뢰 사슬의 시작점**이며 SolarWinds·SLSA·SBOM의 맥락에서 무결성은 KMS(암호화)가 아니라 서명(Signer/Notation)으로 보장한다. 넷째, **IaC는 선언적 수렴 루프 + 멱등성**이며 드리프트는 명령적 변경이 끼어든 흔적이라 EventBridge/Config로 자동 탐지·교정한다. 다섯째, **구성은 Parameter Store(설정)·Secrets Manager(회전)·AppConfig(폴링·검증·점진)로 분리**되며 각 단서가 곧 정답이다.

다음 글에서는 도메인 3(복원력)과 4(모니터링/로깅)를 RTO/RPO의 수학과 관찰성 이론으로 다시 꿴다.

---

## 📝 연습 문제

**문제 1.** monorepo에서 `services/payment/**` 경로가 변경될 때만 payment 파이프라인을 실행하고, 동시에 들어오는 커밋은 큐잉하려 한다. 어떤 구성이 필요한가?

A) CodePipeline V1의 단순 소스 트리거

B) CodePipeline V2의 `filePaths` 트리거 필터 + 실행 모드(QUEUED) 설정

C) Lambda Custom Action으로 경로를 직접 파싱

D) EventBridge로 모든 커밋을 받아 전체 파이프라인 실행

**정답: B**

해설: CodePipeline V2는 V1에 없던 세밀한 트리거(`filePaths`·branches·tags 필터)와 실행 모드(SUPERSEDED/QUEUED/PARALLEL)를 지원한다. 특정 경로 변경 시에만 실행하려면 V2의 `filePaths` 트리거가 필요하고, 동시 커밋 큐잉은 QUEUED 실행 모드다. V1(A)은 경로 필터·변수가 없다. Lambda 파싱(C)·EventBridge 전체 실행(D)은 V2가 네이티브로 제공하는 기능을 굳이 손으로 재구현하는 안티패턴이다.

---

**문제 2.** Lambda 함수를 "5분 동안 50%만 라우팅 후 문제없으면 나머지 50%로 전환"하는 두 단계 배포로 구성하려 한다. 또 다른 함수는 "10분마다 10%씩 점증"이 요구된다. 각각의 배포 구성은?

A) 둘 다 AllAtOnce

B) 50% 두 단계 = `Canary50Percent5Minutes`, 10%씩 점증 = `Linear10PercentEvery10Minutes`

C) 둘 다 Rolling

D) 50% = Linear, 10%씩 = Canary

**정답: B**

해설: Canary는 **2단계(소수 비율 → 나머지 전체)** 구조이고, Linear는 **N%씩 N분마다 균등 증분**이다. "5분 50% 두 단계"는 Canary의 정의에 정확히 맞고(`Canary50Percent5Minutes`), "10분마다 10%씩"은 Linear(`Linear10PercentEvery10Minutes`)다. 이 둘의 구조 차이를 뒤집은 D가 대표 오답이다. AllAtOnce·Rolling(A·C)은 점진/2단계 요건을 충족하지 못한다. 두 전략 모두 Lambda에서는 Alias 가중 라우팅 + CloudWatch Alarm 자동 롤백과 결합된다.

---

**문제 3.** 컨테이너 이미지가 빌드된 이후 위·변조되지 않았고 신뢰된 주체가 만들었음을 배포 시점에 검증하려 한다. 가장 적절한 메커니즘은?

A) KMS로 이미지를 암호화

B) AWS Signer + ECR Image Signing으로 서명하고 배포 시 Notation으로 서명 검증

C) S3 버킷 ACL로 접근 제한

D) IAM 정책으로 push 권한 제한

**정답: B**

해설: 위·변조 방지(무결성·출처 증명)는 **서명(signing)**의 영역이다. AWS Signer로 아티팩트를 서명하고 ECR Image Signing/Notation으로 배포 시점에 서명을 검증하면, 이미지가 빌드된 그대로이고 신뢰된 서명자가 만들었음을 보장한다. KMS(A)는 기밀성(암호화)이지 무결성·출처가 아니다 — SolarWinds류 공급망 공격의 교훈이 바로 "암호화·서명된 채널이라도 빌드가 오염되면 무력"이며, 그래서 SLSA/SBOM/서명 검증이 표준이 됐다. ACL(C)·push 제한(D)은 접근 통제일 뿐 무결성 증명이 아니다.

---

**문제 4.** CloudFormation으로 관리되는 리소스를 누군가 콘솔에서 수동 변경했을 가능성을 주기적으로 자동 탐지하고, 발견 시 알림을 보내려 한다. 가장 적절한 패턴은?

A) Change Set을 매번 생성

B) EventBridge Scheduled Rule로 주기적 Drift Detection 실행 + 드리프트 발견 시 SNS 알림(또는 Config 규칙 + Auto-Remediation)

C) Stack Policy로 모든 변경 차단

D) Rollback Configuration 설정

**정답: B**

해설: 드리프트는 "선언적 코드 상태와 실제 상태의 차이"이며, 자동 탐지는 EventBridge Scheduled Rule로 Drift Detection을 주기 실행하고 결과를 SNS로 알리거나, AWS Config의 stack drift 규칙 + Auto-Remediation으로 코드 상태로 되돌리는 패턴이다. Change Set(A)은 적용 전 변경 미리보기일 뿐 사후 드리프트 탐지가 아니다. Stack Policy(C)는 스택 업데이트 시 특정 리소스 보호이지 콘솔 수동 변경 탐지가 아니다. Rollback Configuration(D)은 배포 실패 시 롤백 트리거다.

---

**문제 5.** 애플리케이션의 피처 플래그를 점진적으로 롤아웃하되, 잘못된 구성 값이 들어오면 배포 전에 차단하고, 문제 발생 시 자동 롤백하려 한다. 가장 적절한 조합은?

A) Parameter Store SecureString에 플래그 저장

B) AppConfig + Validator(JSON Schema/Lambda) + Deployment Strategy(점진 롤아웃) + CloudWatch Alarm 자동 롤백

C) Secrets Manager에 플래그 저장 후 회전

D) DynamoDB에 플래그를 두고 애플리케이션이 직접 폴링

**정답: B**

해설: AppConfig는 구성 변경을 "배포처럼" 다루는 유일한 서비스다 — Validator로 사전 검증(잘못된 값 차단), Deployment Strategy로 점진 롤아웃, CloudWatch Alarm 연동으로 자동 롤백을 제공한다. Parameter Store(A)·Secrets Manager(C)·자체 DynamoDB(D)는 검증·점진 배포·자동 롤백을 내장하지 않는다. 단, AppConfig는 폴링 모델임을 기억해야 한다(푸시 아님).

---

**문제 6.** Tooling(CICD) 계정의 CodePipeline이 cross-account로 Spoke 계정에 CloudFormation 스택을 배포하려는데 "Access Denied (KMS)" 오류로 실패한다. 가장 흔한 근본 원인은?

A) Spoke 계정에 CloudFormation 권한이 없어서

B) 아티팩트가 Tooling 계정의 KMS CMK로 암호화돼 있는데, Spoke 계정의 배포 Role이 그 키로 복호화할 권한이 KMS 키 정책에 없어서 (S3 버킷 정책과 KMS 키 정책 둘 다 Spoke를 허용해야 함)

C) 파이프라인이 V1이라서

D) Change Set을 안 만들어서

**정답: B**

해설: cross-account 파이프라인의 대표 함정이다. Tooling 계정 S3의 아티팩트가 KMS CMK로 암호화돼 있으면, Spoke의 배포 Role이 그걸 읽으려면 (1) S3 버킷 정책이 Spoke를 허용하고 (2) **KMS 키 정책도 Spoke의 복호화를 허용**해야 한다. 둘 중 하나라도 빠지면 KMS Access Denied가 난다. 초심자는 S3만 고치고 KMS를 잊는다. CloudFormation 권한(A)·V1 여부(C)·Change Set(D)은 KMS 오류의 원인이 아니다.

---

**문제 7.** 신규 AWS 환경에서 GitHub Actions가 정적 액세스 키 없이 AWS 리소스에 배포하도록 구성하려 한다. 가장 적절한 방법은?

A) IAM User를 만들고 액세스 키를 GitHub Secrets에 저장

B) IAM OIDC Identity Provider를 등록하고 GitHub Actions가 `AssumeRoleWithWebIdentity`로 단기 자격을 발급받도록 구성

C) 루트 계정 자격을 사용

D) CodeCommit으로 마이그레이션

**정답: B**

해설: 정적 키는 유출·회전 부담의 근원이다. GitHub Actions는 GitHub의 OIDC 토큰을 발급하고, AWS에 OIDC Identity Provider를 등록한 뒤 신뢰 정책에서 특정 repo/branch만 허용하면, `AssumeRoleWithWebIdentity`로 단기 STS 자격을 받아 배포할 수 있다 — 장기 키가 아예 없다. IAM User 키(A)는 정적 키 안티패턴, 루트 자격(C)은 심각한 보안 위반, CodeCommit 마이그레이션(D)은 신규 가입이 막혀 부적절하다. 온프레미스 머신에서 같은 목적(정적 키 제거)은 IAM Roles Anywhere를 쓴다.

---

## 📌 오늘의 요약

1. 도메인 1+2(39%)는 분리된 두 도메인이 아니라 "커밋→프로덕션" 단일 흐름이며, 함정은 도메인 경계 교차점(파이프라인+IaC+KMS)에 있다.
2. Code* 분할은 Continuous Delivery 단계 모델 + 관심사 분리이고, V2 변수·트리거·실행 모드가 Pro 단골, CodeCommit은 신규 환경에서 제외된다.
3. 배포 전략은 "영향 사용자 × 노출 시간"의 수학 — Canary(2단계)/Linear(균등 증분) 구분, 플랫폼별 메커니즘, big-bang 회피(TSB 교훈).
4. 빌드는 신뢰 사슬의 시작점 — 무결성은 KMS(암호화)가 아니라 Signer/Notation 서명 + Inspector SBOM(SolarWinds/SLSA 맥락).
5. IaC는 선언적 수렴 루프·멱등성이고 드리프트는 EventBridge/Config로 자동 탐지, 구성은 Parameter Store/Secrets Manager/AppConfig로 분리된다.
