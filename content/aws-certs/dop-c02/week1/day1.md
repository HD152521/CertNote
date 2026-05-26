# Day 1 - DevOps라는 운영 모델: CALMS의 다섯 축과 DORA가 측정해 보여준 진실

DevOps라는 단어를 처음 들었을 때 대부분은 "Jenkins랑 Ansible 같은 도구들"로 이해한다. 그렇게 시작해서 시험까지 그 수준으로 끝나면 Professional 시나리오 문제 앞에서 멈춰선다. DOP-C02가 묻는 것은 도구의 이름이 아니라 **"왜 이 조합인가, 왜 이 순서인가, 왜 이 메트릭으로 측정하는가"**다. 그 답을 만들어내는 사고 프레임이 바로 CALMS와 DORA 4 metrics다.

이 글에서는 DevOps가 왜 등장했고, 왜 단순한 도구 모음이 아니라 운영 모델이 되었는지, 그리고 그 운영 모델을 측정 가능하게 만든 DORA 연구가 AWS 도구 선택과 어떻게 맞물리는지를 정리한다. 새벽 3시에 알람이 울렸을 때 어떤 자동화가 켜졌어야 했는지를 떠올릴 수 있다면, 시험의 시나리오는 자연스럽게 풀린다.

## DevOps의 탄생: 사일로가 깨질 수밖에 없던 순간

2009년 6월 23일 벨기에 헨트(Ghent)에서 열린 첫 DevOpsDays. 그 자리에서 Patrick Debois가 만든 "DevOps"라는 단어는 갑자기 튀어나온 게 아니다. 그 전 해인 2008년 토론토 Agile 컨퍼런스에서 Andrew Shafer가 "Agile Infrastructure"라는 주제로 BoF 세션을 열었지만 정작 발표장에 사람이 거의 오지 않았다. Debois 혼자 와서 그와 대화하며 "왜 Dev는 Agile을 하는데 Ops는 못 따라가는가"라는 질문이 생겼고, 그게 1년 뒤 DevOpsDays로 이어졌다.

그 시점의 산업 맥락이 중요하다. 2007-2008년 Flickr의 John Allspaw와 Paul Hammond는 "**10+ Deploys Per Day**"라는 발표(Velocity 2009)로 폭탄을 던졌다. 당시 엔터프라이즈는 분기에 한 번 배포가 정상이었는데, Flickr는 하루에 10번을 배포하면서도 안정적이었다. 어떻게 가능했나? 답이 "Dev와 Ops가 같은 팀처럼 일하면, 같은 도구를 쓰면, 같은 메트릭을 보면 가능하다"였다. 이게 DevOps 운동의 출발점이다.

> 💡 **관련 이론**: Conway의 법칙(1968) — "시스템 아키텍처는 그 조직의 커뮤니케이션 구조를 반영한다". 즉 Dev팀과 Ops팀이 분리되어 있으면 코드와 운영 인프라가 분리된 형태로 굳어지고, 둘 사이에 "throw it over the wall"이라는 안티패턴이 자연스럽게 생긴다. DevOps는 **역방향 Conway 법칙(Inverse Conway Maneuver)**을 적용해, "원하는 아키텍처에 맞춰 조직을 먼저 재설계"한다. Team Topologies(Skelton & Pais, 2019)는 이 아이디어를 4가지 팀 유형(Stream-aligned, Platform, Enabling, Complicated-subsystem)으로 정형화했다.

> 📚 **사례**: 2010년 Etsy의 John Allspaw가 CTO로 부임하며 "blameless postmortem"(비난 없는 사후 분석) 문화를 정착시켰다. 이는 단순한 친절함이 아니라 SRE의 핵심 원칙이다. 사람을 비난하는 문화에서는 엔지니어가 사고를 숨기고, 시스템 결함이 드러나지 않아 같은 사고가 반복된다. Etsy는 매주 "Postmortem of the Week"를 공유하며 학습 조직 문화를 만들었고, 이게 곧 산업 표준 SRE 프랙티스가 됐다. AWS의 Correction of Errors(COE) 프로세스가 정확히 이 패턴을 차용한다.

## CALMS: 다섯 축으로 분해한 DevOps 성숙도

Jez Humble과 Damon Edwards가 2010년경 정리한 CALMS 프레임워크는 "DevOps가 되었다"는 게 무슨 뜻인지를 측정 가능한 5축으로 분해한다.

| 글자 | 의미 | 핵심 질문 | AWS 매핑 |
|------|------|----------|----------|
| **C** Culture | 협업, 책임 공유, blameless 문화 | "사고 났을 때 누가 야단맞는가?" | Cross-account IAM, ChatOps(Chatbot+Slack), AWS Incident Manager |
| **A** Automation | 수동 절차 제거, Pipeline-as-Code | "사람이 손으로 하는 일이 몇 단계나 되는가?" | CodePipeline, CodeBuild, CDK, SSM Automation Runbook |
| **L** Lean | 작은 배치, WIP 제한, 낭비 제거 | "한 PR이 며칠 동안 떠 있는가?" | Trunk-based dev, CodeCommit + Feature flag(AppConfig) |
| **M** Measurement | 모든 것 측정, 데이터 기반 결정 | "이 변경이 좋은지 어떻게 아는가?" | CloudWatch Metrics, Container Insights, DORA dashboards |
| **S** Sharing | 지식·도구·실패 공유 | "한 팀의 깨달음이 다른 팀에 흘러가는가?" | AWS Service Catalog, Internal Developer Platform(IDP), Wiki/Confluence |

이 다섯 축은 독립적이지 않다. **Automation 없이 Lean이 불가능**하고(수동 작업이 많으면 배치를 작게 못 만든다), **Measurement 없이 Culture가 변하지 않는다**(데이터 없이는 "느낌"으로만 싸우게 된다). 그래서 DOP-C02 시나리오에서 "이 회사가 막힌 지점은 무엇인가"를 물으면 보통 한 축의 결손이 다른 축까지 도미노로 끌어내린 상황이다.

> 🔍 **더 깊이**: CALMS의 "Lean"은 도요타 생산방식(TPS)의 직계 후손이다. TPS의 두 기둥인 **Jidoka(자동화에 인간의 지혜를 더함)**와 **Just-in-Time**이 DevOps의 "automation + small batch"로 그대로 번역된다. 특히 TPS의 "Andon cord"(작업자가 라인을 멈출 권한) 개념은 DevOps의 "누구나 배포를 멈출 수 있다"는 원칙으로 이어진다. 이게 Google의 SRE Error Budget으로 형식화되면서, "팀이 정의한 SLO를 깨면 자동으로 배포 동결" 같은 메커니즘이 만들어진다.

> 💡 **관련 이론**: WIP(Work In Progress) 제한은 Kanban의 핵심이다. Little's Law(평균 처리 시간 = WIP / Throughput)에 의하면 WIP가 늘수록 한 작업의 처리 시간(lead time)이 선형으로 증가한다. 그래서 PR이 10개 동시에 떠 있는 팀은 PR 1개씩 머지하는 팀보다 lead time이 길어진다. Trunk-based development가 추구하는 것이 이 Little's Law의 산술적 귀결이다.

```
[ DevOps Maturity Surface — CALMS 5축 ]

       Culture
         /\
        /  \
   Sharing  Automation
       \    /
        \  /
   Measurement — Lean

각 축의 짧은 변이 그 조직의 진짜 DevOps 성숙도 (가장 약한 축이 전체 한계).
"Automation만 잘하면 DevOps"가 아닌 이유.
```

## DORA 4 metrics: 측정 가능한 DevOps의 결정타

2013년부터 Nicole Forsgren, Jez Humble, Gene Kim이 이끈 DORA(DevOps Research and Assessment) 연구는 6년 동안 32,000명 이상의 엔지니어를 설문해 "DevOps가 비즈니스 성과와 어떻게 연결되는지"를 통계적으로 입증했다. 이 결과가 2018년 "Accelerate"라는 책과 매년 발표되는 "State of DevOps Report"로 정리된다. 그리고 측정 지표가 단 4개로 응축됐다.

| 지표 | 정의 | Elite 기준 | High | Medium | Low |
|------|------|-----------|------|--------|-----|
| **Deployment Frequency** | 운영 배포 빈도 | 온디맨드(하루 여러 번) | 일 1회 ~ 주 1회 | 주 1회 ~ 월 1회 | 월 1회 미만 |
| **Lead Time for Changes** | commit → prod 시간 | 1시간 미만 | 1일 미만 | 1일 ~ 1주 | 1주 ~ 1개월 |
| **Change Failure Rate (CFR)** | 배포 중 사고 비율 | 0-15% | 16-30% | 16-30% | 16-30% |
| **MTTR (Time to Restore)** | 사고 복구 시간 | 1시간 미만 | 1일 미만 | 1일 ~ 1주 | 1주 이상 |

DORA가 통계적으로 보여준 가장 큰 발견은 **속도(Deployment Frequency, Lead Time)와 안정성(CFR, MTTR)이 trade-off가 아니라 양의 상관관계**라는 점이다. 자주 배포하는 팀은 동시에 사고도 적고 복구도 빠르다. 직관에 반하지만, 작은 변경을 자주 배포하면 ① 변경 범위가 작아 디버깅이 쉽고 ② 자동화·롤백이 잘 구축되어 있어 복구가 빠르며 ③ 배포가 일상이라 위험 감각이 둔감해지지 않기 때문이다.

> 📚 **사례**: Amazon은 2011년 발표 시점에 평균 **11.6초마다 1회 배포**, 즉 1년에 약 270만 회 배포를 한다고 공개했다(Jon Jenkins, Velocity 2011). 이게 가능한 이유는 마이크로서비스 + 2-Pizza Team(8명 이하) + 완전 자동 파이프라인 조합이다. 같은 시기 평균 엔터프라이즈는 분기 1회였다. 이 격차가 곧 DevOps 운동의 정당화 근거가 됐다.

> 🔍 **더 깊이**: 2021년 DORA 리포트부터 5번째 메트릭 **Reliability**(SLO 달성률)가 추가됐다. 처음엔 "MTTR이 SLO와 비슷하지 않나?"라는 반박이 있었지만, MTTR은 "사고 후 회복"만 보는 반면 Reliability는 "사고가 안 나는 상태"를 본다. 둘은 다른 차원이다. 이게 DOP-C02에서 자주 보이는 "SLO 기반 자동 롤백" 시나리오로 연결된다(예: CloudWatch Alarm → CodeDeploy auto-rollback).

> ⚠️ **함정**: DORA 메트릭을 KPI로 강제하면 반드시 게이밍이 발생한다. "Deployment Frequency 늘리려고 의미 없는 commit을 작은 단위로 쪼개기", "MTTR 좋게 보이려고 incident를 incident로 안 부르기" 같은 안티패턴이다. DORA 본인들도 "메트릭은 진단 도구지 평가 도구가 아니다"라고 명시한다. 회사가 DORA를 인사평가에 연결하는 순간 그 데이터는 거짓말이 된다.

## DORA → AWS 도구로의 매핑 — 시험이 진짜 묻는 것

DOP-C02 시나리오는 "회사가 X라는 문제를 겪고 있다. 가장 적합한 AWS 솔루션은?" 형태로 나온다. 그 X를 DORA 메트릭으로 번역하면 답이 보인다.

**시나리오 1: "배포가 분기 1회. 빈도를 올리고 싶다"** → Deployment Frequency 개선
- CodePipeline으로 trunk-based 자동 파이프라인 구축
- Feature flag(AppConfig)로 배포와 릴리스 분리(dark launch)
- 작은 배치로 쪼개기 위해 Lambda 단위 마이크로서비스화 검토

**시나리오 2: "commit하고 prod 반영까지 2주 걸린다"** → Lead Time 개선
- 수동 승인 게이트 제거 (CodePipeline Manual Approval 최소화)
- CodeBuild 캐싱(S3/Local)으로 빌드 시간 단축
- 멀티 계정 Cross-Account IAM으로 환경 간 마찰 제거

**시나리오 3: "배포 후 사고가 30%에서 일어난다"** → Change Failure Rate 개선
- Canary 배포 (Lambda alias + traffic shifting, CodeDeploy Blue/Green)
- CloudWatch Alarm 기반 자동 롤백
- Pre-deploy hook으로 테스트 강제(CodeDeploy AppSpec hooks)

**시나리오 4: "사고 나면 복구가 며칠 걸린다"** → MTTR 개선
- EventBridge → Lambda → SSM Automation으로 자동 remediation
- AWS Incident Manager + Chatbot(Slack)로 알림·런북 일원화
- X-Ray + Container Insights로 root cause 빠르게 파악

이 매핑이 머리에 있으면 시험에서 "딱 봐도 이거다" 싶은 답이 보이고, 동시에 보기 중 2-3개가 다 동작은 하지만 "어느 게 묻고 있는 문제에 가장 정확한가"가 구분된다.

> 🎯 **시나리오**: 한 핀테크 회사가 "월 1회 배포, 배포 시 30% 확률로 장애, 복구는 평균 2일"이라고 보고했다. DORA 등급은 모든 축에서 Low. 어디부터 손을 댈까? 정답은 **Automation부터**. 왜? 자동화 없이는 작은 배치가 불가능하고(Lean이 안 됨), 빠른 롤백이 불가능하고(MTTR 안 줄어듦), 데이터 수집도 어렵다(Measurement 안 됨). CALMS의 A축이 무너지면 다른 4축이 다 끌려간다. AWS에서는 CodePipeline + CodeBuild + CodeDeploy 3종 세트가 그 시작점이다.

## Werner Vogels의 "You Build It, You Run It" — 책임 경계의 재정의

2006년 Werner Vogels(AWS CTO)가 ACM Queue 인터뷰에서 던진 이 한마디가 AWS 조직 운영 모델의 압축이다. 개발팀이 자기 코드의 **운영 책임까지 진다**는 뜻인데, 이게 단순한 슬로건이 아니라 구조적 강제장치다. Amazon의 Two-Pizza Team(8명 이하 단일 팀이 한 서비스의 전체 lifecycle을 소유)은 이 원칙의 실체이고, AWS의 마이크로서비스 아키텍처는 그 결과물이다.

이게 왜 DevOps의 결정적 요소인가? 운영 책임이 분리되면 개발자는 "내 코드가 새벽 3시에 알람 울리는지" 모르고, 운영자는 "이 코드를 누가 왜 짰는지" 모른다. 둘 다 모르면 사고는 반복되고 시스템은 늘 깨진 상태로 유지된다. You Build It, You Run It은 이 정보 비대칭을 제거한다.

AWS 도구들도 이 철학에 정확히 맞춰져 있다. CodePipeline은 개발자가 자기 파이프라인을 직접 정의하게 하고, CloudWatch는 자기 서비스의 메트릭을 자기 대시보드에 띄우게 하며, X-Ray는 자기 코드의 trace를 자기 콘솔에서 보게 한다. **"플랫폼 팀이 인프라를 관리하고 개발팀은 코드만 짜는" 모델은 AWS의 기본 설계 가정이 아니다.** 시험에서 "전담 운영팀 신설"이 보기로 나오면 거의 다 함정이다.

> 💡 **관련 이론**: Conway's Law + You Build It, You Run It이 합쳐지면 **Service-oriented organization**(서비스 단위 조직)이 된다. Amazon은 1990년대 말 모놀리스를 부수면서 "한 서비스 = 한 팀, 한 팀 = 한 서비스" 1:1 매핑을 강제했고, 그 결과 마이크로서비스 아키텍처가 자연 발생했다. 즉 AWS의 마이크로서비스는 "분산 시스템 책에서 좋다고 해서"가 아니라 "조직 구조의 부산물"로 등장한 것이다.

> 📚 **사례**: Netflix는 2008년 데이터 센터 장애로 3일간 DVD 배송을 못 한 사건 이후, AWS로 마이그레이션하면서 동시에 **Chaos Monkey**(2010)를 만들었다. 이게 후일 Chaos Engineering이라는 분야로 발전했고, AWS Fault Injection Simulator(FIS)의 직계 조상이다. "사고가 나기 전에 일부러 깨뜨려본다"는 발상은 You Build It, You Run It의 극단적 형태다 — 운영 책임을 진 팀만이 사고를 미리 일으킬 결심을 한다.

## SRE와 DevOps의 관계 — 같은 것의 다른 측면

Google이 2003년 Ben Treynor Sloss 주도로 만든 SRE(Site Reliability Engineering)는 DevOps와 거의 동시대에 다른 곳에서 자란 쌍둥이다. 외부에서 보면 둘은 비슷해 보이는데, 내부 정의가 다르다.

| 차원 | DevOps | SRE |
|------|--------|-----|
| 출신 | 산업 운동(2009 Ghent) | 단일 회사(Google, 2003) |
| 핵심 원칙 | CALMS | Error Budget, SLO/SLI, Toil 제거 |
| 측정 지표 | DORA 4 metrics | SLO 달성률, Error Budget 소진율 |
| 조직 모델 | "Dev + Ops 통합" | "Dev팀과 별도 SRE팀 (50% 코딩, 50% 운영)" |
| 책임 경계 | You build it, you run it | SLO 기반 책임 분담 |
| 자동화 정의 | Pipeline-as-Code | Toil < 50% 강제 |

핵심 통찰은 Ben Treynor의 한마디: "**Class SRE implements DevOps**". 즉 DevOps는 추상 인터페이스(원칙)이고, SRE는 그 구체적 구현체다. 두 운동은 충돌하지 않고, AWS 도구 생태계는 두 패러다임 모두를 지원한다.

DOP-C02 시험은 둘을 명시적으로 구분하진 않지만, "Error Budget", "SLO 기반 자동 롤백", "Toil 제거" 같은 키워드가 나오면 SRE 색깔이 더 강한 문제이고, "CI/CD 파이프라인 설계", "Cross-account 자동화" 같은 키워드는 DevOps 색깔이 강한 문제다.

> 🔍 **더 깊이**: SRE의 Error Budget은 직관적이다. "월 SLO 99.9%면 한 달에 43.2분의 다운타임 예산이 있다. 이 예산을 다 쓰면 그 달은 새 기능 배포 금지, 안정성 작업만." 이게 자동화되면 어떻게 될까? CloudWatch Alarm으로 SLO 위반을 감지하고 → EventBridge → Lambda가 CodePipeline 배포 stage를 disable → Slack에 통보. AWS에서 이 패턴이 자주 시험에 나온다.

> 💡 **관련 이론**: SLO(Service Level Objective)는 SLA(외부 계약)와 다르다. SLA는 법적 계약(보통 99.9%), SLO는 내부 목표(보통 99.95%, SLA보다 약간 높게 설정). 그 사이 0.05% buffer가 "운영 안전 마진"이다. 그리고 SLI(Indicator)는 SLO를 측정하는 실제 지표 — 예를 들어 "5xx 응답 비율 < 0.1%". AWS CloudWatch Metric Math + Composite Alarm으로 SLI를 계산해 SLO를 모니터링한다.

## Pipeline-as-Code와 GitOps — 자동화의 두 번째 진화

CALMS의 Automation 축이 처음 자리잡을 때 Jenkins UI 기반의 GUI 파이프라인이 표준이었다. 그런데 이게 문제였다 — 파이프라인 자체가 코드가 아니라서 **버전 관리도 안 되고, 리뷰도 안 되고, 한 사람이 GUI에서 실수로 클릭하면 끝**이었다. 이 한계를 깬 게 Jenkinsfile(2016)이고, 그게 확장된 게 GitOps(2017, Weaveworks)다.

**Pipeline-as-Code**의 정의는 단순하다: **파이프라인 정의 자체가 Git 저장소에 코드로 들어간다**. CodePipeline은 콘솔에서 만들면 GUI 도구처럼 보이지만 내부적으로는 JSON definition으로 export 되며, CDK Pipelines나 Terraform으로 코드화할 수 있다. GitHub Actions의 `.github/workflows/*.yml`, GitLab CI의 `.gitlab-ci.yml`도 같은 발상이다.

**GitOps**는 한 발 더 나간다: **운영 환경의 desired state도 Git이 곧 단일 진실의 원천**(Single Source of Truth, SSOT). 누가 prod에 어떤 변경을 했는지가 모두 git commit으로 남고, drift가 발생하면 자동으로 desired state로 reconcile된다. Kubernetes 생태계의 ArgoCD, Flux가 대표적이고, AWS는 EKS + ArgoCD 조합이 가장 흔하다.

> 💡 **관련 이론**: GitOps는 Kubernetes의 **declarative API + control loop** 패러다임에서 자연스럽게 자라났다. K8s 컨트롤러는 "desired state"와 "current state"를 끊임없이 비교하며 reconcile 하는데, 이 desired state를 Git에 두면 git push가 곧 배포가 된다. Pull-based GitOps(ArgoCD)는 클러스터가 git을 polling 하는 방식이라, push-based보다 보안 경계가 명확하다(클러스터 credential을 외부에 노출 안 함).

> 🔍 **더 깊이**: AWS Code* 시리즈는 push-based 모델이다. CodePipeline이 Git/ECR/S3를 감시하다가 변화를 감지하면 push 한다. EKS에 ArgoCD를 같이 쓰면 pull-based로 바뀐다. 두 모델은 보안 trade-off가 다르다 — push는 중앙 파이프라인이 모든 클러스터 credential을 들고 있어야 하고, pull은 각 클러스터가 Git에 read 권한만 있으면 된다. 멀티 클러스터 멀티 계정 환경에서는 pull-based가 거의 항상 이긴다.

## AWS DevOps 도구 지도의 4개 축

AWS의 DevOps 도구는 단순히 Code* 시리즈만이 아니다. 다음 4개 축으로 분류하면 시험에서 무엇이 무엇과 맞물려야 하는지가 보인다.

```
[ AWS DevOps 도구 4축 ]

  [Source/Build]           [Deploy]
   CodeCommit               CodeDeploy
   CodeArtifact             CodePipeline (orchestration)
   CodeBuild                Elastic Beanstalk
   GitHub/GitLab(OIDC)      AppRunner
        |                       |
        +-----[ IaC ]-----------+
        |   CloudFormation      |
        |   CDK / SAM           |
        |   Terraform           |
        +-----[ Operate ]-------+
            CloudWatch
            X-Ray / ADOT
            SSM (Automation, Patch, AppConfig)
            EventBridge / Chatbot / Incident Manager
            Config / GuardDuty / Security Hub
```

이 4축이 "도메인 1~6"과 정확히 맞물린다. Source/Build/Deploy는 도메인 1(SDLC 자동화), IaC는 도메인 2(구성 관리), Operate의 모니터링은 도메인 4, 인시던트는 도메인 5, 보안은 도메인 6, 그리고 도메인 3(복원력)은 4축 전체에 걸쳐 있다.

## CLI로 보는 DORA 측정의 시작점

이론만 보면 추상적이니까, 실제로 DORA의 "Deployment Frequency"를 측정하려면 어디서 데이터를 뽑는지 보자.

```bash
# CodePipeline의 실행 이력에서 SUCCEEDED 상태 카운트 — 지난 30일
aws codepipeline list-pipeline-executions \
  --pipeline-name prod-pipeline \
  --max-items 1000 \
  --query "pipelineExecutionSummaries[?status=='Succeeded' && startTime>=\`$(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ)\`]" \
  | jq 'length'

# CodeDeploy의 배포 이력 — Lead Time 측정에 필요
aws deploy list-deployments \
  --application-name prod-app \
  --include-only-statuses Succeeded \
  --create-time-range start=2026-04-01,end=2026-04-30 \
  | jq '.deployments | length'

# CloudWatch metric으로 직접 기록 (커스텀)
aws cloudwatch put-metric-data \
  --namespace "DevOps/DORA" \
  --metric-name DeploymentFrequency \
  --value 1 \
  --dimensions Pipeline=prod,Env=prod
```

여기서 한 가지 통찰: AWS는 DORA를 "직접 측정해주는 dashboard"를 제공하지 않는다. **DORA는 도구가 아니라 측정 프레임이라서**, 회사가 자기 데이터 소스(CodePipeline, GitHub, Jira, PagerDuty)에서 직접 뽑아 합성해야 한다. 이게 시험에서 "How would you measure DevOps maturity?"가 나올 때의 정답 — CloudWatch Metrics + Custom Metric + QuickSight나 Grafana로 자체 dashboard 구성.

> 📚 **사례**: Google이 2018년 오픈소스로 공개한 **Four Keys** 프로젝트(github.com/GoogleCloudPlatform/fourkeys)는 GitHub/Jira/PagerDuty 데이터를 BigQuery에 모아 DORA 메트릭을 자동 계산하는 reference implementation이다. AWS 환경에서는 같은 패턴을 EventBridge → Firehose → S3 → Athena → QuickSight 파이프라인으로 구축한다. 시험에서 직접 묻진 않지만, 이런 파이프라인의 부품이 시나리오 선지로 자주 등장한다.

## 정리하며 — 시험과 실무의 같은 그림

오늘 본 그림 세 가지를 마음에 새기자. 첫째, DevOps는 **도구가 아니라 운영 모델**이다. CALMS의 5축 중 어느 하나라도 약하면 나머지가 다 끌려가고, 시험 시나리오는 거의 항상 "어느 축이 무너졌고 어떻게 회복하나"를 묻는다. 둘째, **DORA 4 metrics는 측정 가능한 DevOps**다. 속도와 안정성은 trade-off가 아니라 같이 가는 것이며, AWS Code* + CloudWatch 조합이 그 측정의 기반이다. 셋째, AWS의 도구 철학은 "**You Build It, You Run It**" — 개발팀이 자기 코드의 운영까지 책임지는 모델로 일관되게 설계되어 있다.

다음 글에서는 Well-Architected Framework를 DevOps 관점에서 재해석한다. 6개 Pillar가 단순한 체크리스트가 아니라 "어떤 도메인의 문제든 어느 Pillar로 분류하면 답이 보이는" 사고 프레임이라는 점을 같이 확인할 것이다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 다음 상태를 보고했다: 배포 주기 월 1회, commit-to-prod 평균 14일, 배포 시 사고 발생률 28%, 사고 평균 복구 시간 36시간. DORA 등급으로 분류하면?

A) Elite
B) High
C) Medium
D) Low

**정답: D**
해설: 모든 4개 지표가 Low 구간이다. 배포 빈도 월 1회(Low: 월 1회 미만 ~ 미만), Lead time 14일(Low: 1주~1개월), CFR 28%(Low/Medium 경계지만 다른 지표가 다 Low면 Low), MTTR 36시간(Low: 1일~1주). 더 중요한 분석은 "어디부터 손을 댈까?"인데, Automation부터다. CALMS의 A축이 무너진 상태에서는 Lean(작은 배치)도, Measurement(데이터)도, MTTR 개선도 다 막힌다. CodePipeline + CodeBuild + CodeDeploy 3종 자동화부터 깔고, 그 위에 CloudWatch 메트릭 수집을 더해야 한다.

---

**문제 2.** Werner Vogels의 "You Build It, You Run It" 원칙이 AWS 도구 설계에 반영된 결과로 가장 거리가 먼 것은?

A) CodePipeline은 팀이 자기 파이프라인을 직접 정의하게 한다
B) CloudWatch는 서비스별 대시보드를 팀이 직접 만들 수 있다
C) AWS에서는 전담 운영팀이 모든 서비스 알람을 받는 중앙 NOC 모델이 권장된다
D) X-Ray는 trace 데이터를 개발자가 직접 분석한다

**정답: C**
해설: AWS의 기본 가정은 "서비스를 만든 팀이 그 서비스의 운영도 한다"이지 "중앙 NOC가 모든 알람을 받는다"가 아니다. 시험에서 "전담 운영팀 신설", "중앙 모니터링 팀" 같은 보기는 거의 다 함정이다. SRE 모델에서는 별도 SRE팀이 있지만 그것도 SLO 기반으로 책임이 분담되지, 모든 운영을 떠맡지 않는다.

---

**문제 3.** 한 팀이 Deployment Frequency는 일 5회로 Elite 수준인데 Change Failure Rate가 45%로 매우 높다. 가장 우선해야 할 개선 조치는?

A) 배포 빈도를 일 1회로 줄인다
B) Canary 배포 + 자동 롤백을 도입한다
C) 모든 배포에 수동 승인을 강제한다
D) DORA 측정을 중단한다

**정답: B**
해설: 속도와 안정성은 trade-off가 아니라 양의 상관관계라는 게 DORA의 핵심 발견이다. 빈도를 줄이는 건 잘못된 처방이다. CFR 45%는 "배포 자동화는 되어 있지만 검증 자동화가 부족하다"는 신호이고, 답은 Canary 배포(Lambda alias + traffic shifting, CodeDeploy Blue/Green)와 CloudWatch Alarm 기반 자동 롤백이다. 수동 승인은 Lead Time을 늘리면서도 사고를 진짜로 막진 못한다(승인하는 사람도 결국 사람이라 같은 실수를 한다). DORA 측정 중단은 본말 전도.

---

**문제 4.** 어떤 회사가 EKS 환경에서 GitOps 모델을 도입하려 한다. push-based(CodePipeline이 클러스터에 배포)와 pull-based(ArgoCD가 Git을 polling) 중 멀티 계정·멀티 클러스터 환경에서 더 유리한 모델과 그 이유는?

A) push-based — 중앙 통제로 일관성 보장
B) push-based — 빠른 배포
C) pull-based — 클러스터마다 git read 권한만 있으면 됨, credential 노출 최소화
D) pull-based — 무조건 더 빠름

**정답: C**
해설: pull-based GitOps의 핵심 장점은 **보안 경계의 명확성**이다. push-based는 중앙 CI/CD 시스템이 모든 클러스터의 admin credential을 들고 있어야 하는데, 이게 노출되면 모든 클러스터가 한꺼번에 위험해진다. pull-based는 각 클러스터가 Git에 대해 read-only 권한만 가지면 되고, 클러스터 credential은 클러스터 내부에만 존재한다. 멀티 계정 환경에서는 cross-account IAM 경계도 단순해진다(중앙 → 각 계정으로의 push 권한이 필요 없음). 속도는 polling interval에 좌우되지만 보통 큰 차이가 아니다. AWS에서는 EKS + ArgoCD가 가장 흔한 조합.

---

**문제 5.** CALMS의 다섯 축 중 "Measurement"가 충족되지 않으면 직접적으로 영향을 받는 다른 축은?

A) Culture만
B) Culture와 Lean
C) Automation만
D) Sharing만

**정답: B**
해설: Measurement가 없으면 ① 문화(Culture)가 데이터 기반이 아니라 "느낌" 기반이 되고(사고 원인을 객관적으로 못 잡으니 blameless가 어렵고, 누가 잘했는지 측정 불가), ② Lean이 무너진다(WIP, cycle time 같은 Lean 지표가 측정 안 되니 개선 우선순위를 못 잡음). Sharing도 영향받지만 직접적이진 않고, Automation은 측정 없이도 도구로 깔 수는 있다(다만 효과 검증이 안 될 뿐). 시험에서 "데이터 없이 운영을 개선" 같은 함정 보기가 자주 등장한다.

---

**문제 6.** SRE의 Error Budget 개념을 AWS에서 구현할 때 적절한 패턴은?

A) CloudWatch Alarm → EventBridge → Lambda → CodePipeline stage disable
B) CodeBuild에서 매 빌드마다 SLO 계산
C) S3에 SLO 정책 파일을 두고 매일 사람이 확인
D) Route 53에서 SLO 미달 시 DNS 차단

**정답: A**
해설: Error Budget의 핵심은 "**SLO 위반이 자동으로 배포 동결로 이어진다**". CloudWatch Composite Alarm으로 SLO 위반을 감지하고, EventBridge로 이벤트를 받아 Lambda가 CodePipeline의 배포 stage를 disable(또는 Manual Approval 강제). 이게 자동화되어 있어야 사람이 "한 번만 더..." 하다가 사고를 키우는 걸 막을 수 있다. B는 의미가 없고(SLO는 배포 단위가 아니라 시간 단위), C는 자동화 안 됨, D는 Route 53이 트래픽을 막을 수는 있지만 배포를 막진 않는다.

---

**문제 7.** 한 조직이 "분기 1회 배포 → 일 1회 배포"로 가속하는 과정에서 가장 먼저 깔아야 할 AWS 도구 조합은?

A) CodePipeline + CodeBuild + CodeDeploy
B) GuardDuty + Security Hub + Config
C) X-Ray + CloudWatch + Container Insights
D) Route 53 + CloudFront + WAF

**정답: A**
해설: 빈도 증가는 Automation 축의 강화이고, AWS에서 그 시작점은 Code* 3종 세트다. CodePipeline(orchestration) + CodeBuild(빌드/테스트) + CodeDeploy(배포). 이게 깔리지 않은 상태에서 X-Ray나 GuardDuty부터 시작하면 "모니터링은 멋진데 정작 배포는 여전히 분기 1회"가 된다. 시험에서 시나리오 우선순위 판단 문제가 자주 나오고, 답은 거의 항상 "CALMS의 약한 축부터" 패턴이다.

---

**문제 8.** Blameless Postmortem의 본질적 효과로 가장 정확한 것은?

A) 사고 책임자에 대한 처벌을 약화시킨다
B) 사고를 숨기지 않게 해서 시스템 결함의 가시화와 재발 방지가 가능해진다
C) 법적 책임에서 자유로워진다
D) 사고 발생 빈도 자체를 줄인다

**정답: B**
해설: Blameless의 진짜 가치는 "친절함"이 아니라 "**정보 노출 인센티브 정렬**"이다. 비난 문화에서는 엔지니어가 사고를 숨기고, 그러면 시스템 결함이 안 보이고, 같은 사고가 반복된다. Blameless는 "사람이 아닌 시스템 결함을 본다"는 약속이라서 엔지니어가 자기 실수까지 솔직히 드러낼 수 있고, 그 결과 시스템 개선이 가능해진다. AWS의 Correction of Errors(COE) 프로세스가 이 모델을 정확히 따른다. A는 부차적, C는 사실 아님, D는 결과적으로 따라오지만 직접 원인은 아님.
