# Day 2 - Compute Optimizer·Rightsizing — ML 기반 권고의 내부 동작, 도구 비교, 자동화 패턴

비용 최적화에는 두 갈래가 있다. 하나는 "더 싸게 사는 것"(약정·Spot, 어제 다룬 SP·RI), 다른 하나는 "필요한 만큼만 쓰는 것"(rightsizing)이다. 후자가 더 근본적이다 — 아무리 좋은 약정을 사도 m5.4xlarge가 항상 5% CPU만 쓰고 있다면 그건 m5.large를 8배 가격에 사는 것과 같다. 그리고 약정 할인과 rightsizing은 곱셈으로 합쳐진다: 8배 과프로비저닝된 인스턴스에 72% 약정 할인을 얹어 봤자, 먼저 8배를 1배로 줄이는 게 압도적으로 크다. AWS FinOps 백서와 Flexera State of the Cloud 같은 업계 조사가 매년 반복하는 결론도 같다 — 엔터프라이즈 클라우드 지출의 30% 이상이 낭비이고 그 1순위 원인이 과프로비저닝이다. rightsizing은 약정 없이도 즉시 효과가 나는 가장 빠른 레버다.

SAP-C02에서 이 영역은 "어떤 도구가 어떤 권고를 주나", "왜 메모리 권고가 안 나오나", "여러 계정의 권고를 어떻게 통합하나", "권고를 어떻게 안전하게 자동 적용하나"라는 운영 설계로 출제된다. 오늘은 Compute Optimizer의 ML 분석 내부 동작, Trusted Advisor·Cost Explorer와의 정확한 경계, 자동 rightsizing 파이프라인, 그리고 다른 클라우드의 동등 기능까지 정리한다.

## Rightsizing이 어려운 이유 — 관측 가능성의 함정

Rightsizing이 단순해 보여도 실무에서 늘 막히는 이유는 **하이퍼바이저가 게스트 OS 내부를 못 본다**는 구조적 한계 때문이다. EC2의 CPU·네트워크·디스크 I/O는 하이퍼바이저(Nitro) 레벨에서 자동 계측돼 CloudWatch로 흘러간다. 그러나 **메모리 사용량**은 게스트 OS 안에서만 알 수 있다 — 하이퍼바이저 입장에서 VM에 할당된 RAM이 실제로 얼마나 쓰이는지 들여다볼 수 없다. 게스트 OS가 RAM 16GB 중 4GB만 쓰든 15GB를 쓰든, 호스트가 보는 것은 "이 VM에 16GB를 할당했다"는 사실뿐이다. 그래서 메모리 메트릭은 게스트 안에 **CloudWatch Agent**를 설치해야만 수집된다.

이 한 가지 사실이 시험 함정의 절반을 만든다. "Compute Optimizer가 메모리 권고를 안 준다"는 시나리오의 정답은 거의 항상 "CW Agent 미설치로 메모리 메트릭이 없다"이다. CPU 기반 다운사이즈만으로 결정하면 메모리 바운드 워크로드(JVM 힙, 인메모리 캐시, 데이터 파이프라인 등)를 잘못 줄여 OOM(Out of Memory)을 일으킬 수 있으므로, 메모리 메트릭의 유무는 rightsizing 안전성의 핵심이다.

> 💡 **관련 이론**: 이것은 가상화의 **반투명성(semi-opacity)** 문제다. 가상화의 목적은 게스트가 자신이 VM 위에 있다는 걸 모르게 격리하는 것인데(투명성), 그 격리가 거꾸로 호스트가 게스트 내부를 못 보게 만든다. 운영체제 이론에서 이를 **시맨틱 갭(semantic gap)**이라 부른다 — 하이퍼바이저는 물리 페이지(physical frame)의 할당은 알지만 게스트 OS가 그 페이지를 "사용 중·캐시·free" 중 무엇으로 분류하는지 모른다. 게스트가 free한 페이지를 호스트가 회수하려면 balloon driver(virtio-balloon, VMware Tools의 vmmemctl)로 게스트 안에서 협력적으로 메모리를 반환받아야 한다. 같은 이유로 컨테이너 환경(ECS/EKS)에서도 메모리·애플리케이션 메트릭은 별도 에이전트(CloudWatch Agent, ADOT Collector)가 필요하다. 관측 가능성(observability)을 얻으려면 격리 경계를 의도적으로 뚫는 계측을 심어야 한다는 것이 이 도메인의 일반 원리다.

> 🔍 **더 깊이**: AWS는 이 메모리 사각지대를 줄이려고 두 가지 우회로를 만들었다. (1) CloudWatch Agent의 `mem_used_percent` 메트릭 — 표준 방법. (2) **CloudWatch Application Signals / Application Insights**가 일부 메모리 신호를 보강한다. 하지만 Compute Optimizer가 메모리 권고를 만들려면 결국 CW Agent의 메모리 메트릭이 lookback 기간 내내 있어야 한다. 또한 Compute Optimizer는 메모리 데이터가 없으면 그 인스턴스의 finding 자체를 보수적으로 "권고 데이터 부족"으로 처리하지, 없는 메모리를 추측해서 다운사이즈하라고 하지 않는다 — 이 보수성이 안전장치다.

## Compute Optimizer — 무엇을, 어떻게 분석하나

Compute Optimizer는 14일 이상의 CloudWatch 메트릭을 머신러닝으로 분석해 리소스별 구체적 권고를 만든다. "분석"이 단순 임계값 비교가 아니라는 점이 Trusted Advisor와의 핵심 차이다.

| 리소스 | 권고 내용 |
|--------|----------|
| **EC2 인스턴스** | 다운/업사이즈, family 변경, 세대 현대화(m5→m6i) |
| **Auto Scaling Group** | 권장 인스턴스 타입·크기 |
| **EBS 볼륨** | gp2→gp3 전환, IOPS·Throughput 조정 |
| **Lambda 함수** | 메모리 설정 권고(비용·성능 동시 최적화) |
| **ECS on Fargate** | Task CPU·Memory 권고 |
| **RDS DB 인스턴스** | DB 인스턴스 크기 조정(2024 추가) |
| **상용 SW 라이선스** | SQL Server 등 라이선스 최적화 |

각 EC2 권고는 **finding**으로 분류된다 — Under-provisioned(자원 부족, 업사이즈 필요), Over-provisioned(자원 과다, 다운사이즈 가능), Optimized(적정). 여기에 **performance risk(성능 위험도)** 점수를 붙여 "이 다운사이즈가 성능에 미칠 영향"을 정량화한다.

> 🔍 **더 깊이**: Compute Optimizer의 ML이 단순 평균이 아니라 **시계열 패턴**을 본다는 게 결정적이다. 평균 CPU 10%만 보면 다운사이즈하라고 하겠지만, 하루 한 번 배치가 90%까지 튀는 워크로드라면 다운사이즈 시 그 spike에서 죽는다. CO는 P95·P99 같은 백분위와 시간대별 패턴을 함께 보고 "권장 옵션 최대 3가지 + 각각의 성능 위험도(Very Low~Very High)"를 제시한다. 또 **CPU 외 추가 메트릭(메모리·EBS I/O·네트워크 디스크 I/O)을 켜면(enhanced infrastructure metrics)** lookback을 기본 14일에서 최대 93일(3개월)로 늘려 더 정밀한 권고를 얻는데, 이건 활성 리소스 시간당 과금되는 유료 옵션이다. 시험에서 "더 긴 기간의 정밀 권고"나 "계절성을 반영한 권고"가 필요하면 enhanced metrics가 단서다.

> 🔍 **더 깊이**: Compute Optimizer는 단순히 "더 작게"만 권하지 않는다. **세대 현대화(generation upgrade)** 권고가 비용·성능 양쪽에서 종종 더 크다. 예를 들어 m5.xlarge → m6i.large는 코어당 성능이 올라가 size를 줄여도 성능이 유지되면서 단가도 낮다. Graviton(예: m6g/m7g) 권고는 별도의 **migration effort 등급**(코드 재빌드 필요성)을 함께 표시해, x86 의존성이 있는 워크로드를 무턱대고 ARM으로 옮기라고 하지 않는다. 시험에서 "성능 유지 + 비용 절감 + 아키텍처 변경 최소"가 나오면 같은 ISA 내 세대 업그레이드, "최대 가성비 + 재빌드 가능"이면 Graviton 신호다.

> ⚠️ **함정**: "Compute Optimizer가 RDS를 지원하지 않는다"는 옛 지식은 틀렸다. 2024년부터 RDS DB 인스턴스(및 스토리지) 권고가 추가됐다. SAP 시험은 종종 학습 데이터보다 최신 기능을 묻는다 — "DB 인스턴스 rightsizing 권고"의 정답이 Compute Optimizer일 수 있다. 반대로 메모리 권고가 "왜 안 나오나"는 항상 CW Agent 메모리 메트릭 부재가 정답이다. 두 함정을 헷갈리지 말 것.

## 도구 삼각형 — Compute Optimizer vs Trusted Advisor vs Cost Explorer

세 도구가 모두 "절감 권고"를 주지만 깊이와 목적이 다르다. 시험은 이 경계를 정확히 묻는다.

| 항목 | Compute Optimizer | Trusted Advisor | Cost Explorer Rightsizing |
|------|-------------------|-----------------|---------------------------|
| 분석 방식 | **ML / 시계열** | 단순 룰(임계값) | CO 데이터 재사용 |
| 깊이 | 정밀(타입·IOPS·메모리) | 요약(미사용·저활용) | 비용 중심 약식 |
| 대상 | EC2·ASG·EBS·Lambda·ECS·RDS | 5개 카테고리 전반 | EC2 위주 |
| 비용 | 무료(기본) / enhanced 유료 | Business+ Support 필요(전체 체크) | 무료 |
| 강점 | 구체적 액션 권고 | 광범위 점검 | 비용 영향 가시화 |

핵심 구분: **Trusted Advisor는 "넓고 얕게"**(Cost·Performance·Security·Fault Tolerance·Service Limits 5개 카테고리를 룰 기반으로 훑음), **Compute Optimizer는 "좁고 깊게"**(컴퓨팅·스토리지 리소스를 ML로 정밀 분석). Cost Explorer Rightsizing은 CO의 권고 데이터를 비용 관점으로 재포장한 것이라, "절감액이 얼마인가"를 보고 싶을 때 쓴다.

> 💡 **관련 이론**: 이 분업은 SRE의 **신호 대 잡음(signal-to-noise)** 트레이드오프와 같다. Trusted Advisor 같은 룰 기반은 빠르고 해석 가능하지만 거짓 양성(false positive)이 많다 — "CPU 10% 미만"이라는 단순 룰은 배치 spike 워크로드를 잘못 잡는다. ML 기반(CO)은 패턴을 학습해 거짓 양성을 줄이지만 14일 데이터·학습 시간이 필요하고 해석이 덜 직관적이다(왜 이 권고가 나왔는지 사람이 추적하기 어렵다). 분류기 평가의 정밀도-재현율(precision-recall) 균형 그 자체다. 운영에서는 둘을 계층으로 쓴다 — TA로 전체를 넓게 스크리닝(높은 재현율)하고, 의심 리소스를 CO로 정밀 분석(높은 정밀도)한 뒤 액션한다.

> 💡 **관련 이론**: 다른 클라우드도 같은 문제를 푼다. **Azure Advisor**(Cost·Security·Reliability·Performance·Operational Excellence 5개 카테고리)는 Trusted Advisor에, **GCP Recommender / Active Assist**(인스턴스 rightsizing, idle 리소스 탐지)는 Compute Optimizer에 대응한다.

| 기능 | AWS | Azure | GCP |
|------|-----|-------|-----|
| 룰 기반 광범위 점검 | Trusted Advisor | Azure Advisor | Recommendation Hub |
| ML rightsizing 권고 | Compute Optimizer | Azure Advisor(VM right-size) | Recommender(machine type) |
| 비용 가시화 | Cost Explorer | Cost Management | Cloud Billing Reports |
| 상세 청구 export | CUR | Cost Management Exports | BigQuery Billing Export |

세 클라우드 모두 "넓은 룰 점검 + ML rightsizing + 비용 가시화 + 상세 export"의 동일한 4층 구조를 가진다는 점이 핵심이다. 멀티 클라우드 FinOps 시나리오에서 이 대응을 알면 답이 보인다.

## 자동 Rightsizing 파이프라인 — 권고를 안전하게 적용하기

권고를 사람이 매번 손으로 적용하면 규모가 커질수록 따라잡지 못한다. SAP 시험은 "권고를 자동 적용하는 안전한 파이프라인"을 설계하라고 묻는다. 표준 패턴은 다음과 같다.

```
[CloudWatch + CW Agent 메트릭]  ← 메모리 권고 위해 Agent 필수
        ↓ 14일+ 수집
[Compute Optimizer ML 분석]
        ↓ 일일 Export (recommendation export to S3)
[S3 (권고 CSV/Parquet)]
        ↓ 트리거
[EventBridge Scheduler → Lambda 파싱·필터]
        ↓  performance risk = Very Low + Over-provisioned만 통과
[SNS / Step Functions 승인 게이트] ← 운영 인스턴스는 사람 승인
        ↓ 승인 후
[Stop → ModifyInstanceAttribute → Start]
또는 [ASG Launch Template 갱신 + Instance Refresh]
또는 [EBS gp2 → gp3 ModifyVolume (무중단)]
```

여기서 설계 포인트가 두 가지다. 첫째, **EC2 타입 변경은 stop→modify→start가 필요해 중단을 동반**하지만, EBS gp2→gp3 전환은 ModifyVolume으로 **무중단**이다. 둘째, **운영 워크로드에는 승인 게이트(SNS/수동 approval)**를 둬 ML 권고를 무비판적으로 자동 적용하지 않게 한다. 비프로덕션은 위험이 낮으니 완전 자동, 프로덕션은 사람 승인 — 이 이원화가 SAP 정답의 단골 형태다.

> 🔍 **더 깊이**: ASG 환경에서는 인스턴스를 직접 stop/modify하면 안 된다 — ASG가 헬스 체크에서 "비정상"으로 판단해 종료하고 desired capacity를 맞추려 새로 띄운다. 올바른 방법은 **Launch Template의 새 버전**을 만들어 권장 타입을 넣고, **Instance Refresh**로 롤링 교체하는 것이다. Instance Refresh는 `MinHealthyPercentage`를 지켜가며 점진적으로 교체해 무중단에 가깝고, `checkpoints`로 일부만 교체 후 검증하는 단계적 롤아웃도 가능하다. 더 정교하게는 **Mixed Instances Policy + attribute-based instance selection(ABIS)**으로 "vCPU 4·메모리 8GB 이상" 같은 속성을 주고 ASG가 적합 타입을 알아서 고르게 할 수도 있다. 시험에서 "ASG 인스턴스 rightsizing"의 정답에 "인스턴스 직접 modify"가 있으면 함정이고, "Launch Template 갱신 + Instance Refresh"가 정답이다.

> 📚 **사례**: 한 전자상거래 기업은 수천 대 EC2를 운영하며 분기마다 수동으로 rightsizing을 시도했지만, 검토 속도가 인프라 증가 속도를 못 따라가 만성적으로 30% 이상 과프로비저닝 상태였다(약정만 사고 정작 크기는 안 줄여 약정 위에 낭비가 쌓인 전형). 해법은 Compute Optimizer 권고를 S3로 일일 Export → Lambda가 "performance risk Very Low + Over-provisioned" 권고만 필터 → 비프로덕션은 자동 적용, 프로덕션은 Slack 승인 후 적용하는 파이프라인이었다. 6개월 만에 컴퓨팅 비용 약 22% 절감. 교훈: rightsizing은 일회성 프로젝트가 아니라 **지속 운영(continuous)**이어야 하며, 자동화 없이는 규모에서 반드시 뒤처진다.

> 📚 **사례**: 반대 방향의 실패 사례도 시험 사고에 유용하다. 한 핀테크는 평균 CPU만 보고 야간 배치 인스턴스를 m5.2xlarge → m5.large로 일괄 다운사이즈했다가, 매일 02:00 정산 배치에서 메모리 부족으로 OOM이 연쇄 발생했다. 원인은 CW Agent 미설치로 메모리 메트릭이 없어 Compute Optimizer가 메모리 권고를 못 냈고, 운영팀이 CPU 권고만 보고 사이즈를 줄인 것. 교훈: 메모리 메트릭 없이 CPU만 보고 다운사이즈하는 것은 안티패턴이며, 배치성 spike 워크로드는 백분위·시간대 패턴을 반드시 확인해야 한다.

## Organization 차원 권고 통합

멀티 계정 환경에서는 Compute Optimizer를 **위임 관리자(delegated administrator)**로 지정해 모든 멤버 계정의 권고를 한곳에서 본다. 계정마다 콘솔을 돌아다니지 않고 Org 전체의 절감 기회를 집계하며, 위임 관리자 계정에서 일괄 export·분석할 수 있다.

> ⚠️ **함정**: "여러 계정의 rightsizing 권고를 중앙에서 보려면 어떻게?"의 정답은 Config Aggregator나 Cost Explorer가 아니라 **Compute Optimizer 위임 관리자 + Org 차원 opt-in**이다. Config Aggregator는 리소스 구성 규정 준수(compliance)를 모으는 것이지 rightsizing 권고가 아니다. Cost Explorer는 비용 가시화이지 타입·IOPS 단위 정밀 권고가 아니다. 도구의 목적을 정확히 구분해야 한다. 또 하나 — 멤버 계정이 각자 opt-in해야 하는 게 아니라, 위임 관리자가 Org 차원으로 한 번에 활성화한다는 점도 자주 출제된다.

## 정리하며

Rightsizing의 핵심은 "필요한 만큼만 쓰는 것"이고, 그 엔진은 14일 메트릭을 ML로 분석하는 **Compute Optimizer**다. 메모리 권고는 가상화의 반투명성(시맨틱 갭) 때문에 **CW Agent**가 있어야 나오고, 권고는 **S3 Export → EventBridge → Lambda 필터 → 승인 게이트 → 적용** 파이프라인으로 자동화하되 ASG는 직접 modify가 아니라 **Launch Template + Instance Refresh**로 교체한다. 같은 4층 구조(룰 점검·ML rightsizing·비용 가시화·상세 export)는 Azure·GCP에도 동일하게 존재한다.

SAP 시험 단골 매핑: (1) "정밀한 타입·IOPS·메모리 권고" → **Compute Optimizer**, (2) "메모리 권고가 안 나옴" → **CW Agent 미설치**, (3) "넓고 얕은 5개 카테고리 점검" → **Trusted Advisor(Business+)**, (4) "권고 자동 적용 파이프라인" → **S3 Export + EventBridge + Lambda(+승인)**, (5) "ASG 인스턴스 교체" → **Launch Template + Instance Refresh**, (6) "Org 전체 권고 통합" → **CO 위임 관리자**, (7) "DB 인스턴스 rightsizing" → **Compute Optimizer(RDS 지원)**, (8) "성능 유지 + 최소 변경 절감" → 같은 ISA 세대 업그레이드, "재빌드 가능 + 최대 가성비" → Graviton. 다음 day는 Cost Explorer·Budgets·CUR로 비용 가시성과 통제를 다룬다.

---

## 📝 연습 문제

**문제 1.** 한 팀이 Compute Optimizer를 활성화했는데 EC2 인스턴스에 대해 CPU 기반 권고만 나오고 메모리 기반 권고가 전혀 없다. 가장 가능성 높은 원인은?

A) Compute Optimizer는 메모리를 지원하지 않는다

B) 게스트 OS에 CloudWatch Agent가 없어 메모리 메트릭이 수집되지 않는다

C) 14일이 지나지 않았다

D) IAM 권한이 부족하다

**정답: B**
해설: 하이퍼바이저는 게스트 OS 내부의 메모리 사용량을 볼 수 없다(가상화의 시맨틱 갭). 따라서 메모리 메트릭은 CloudWatch Agent를 인스턴스에 설치해야만 수집되며, Agent가 없으면 Nitro가 자동 계측하는 CPU·네트워크·디스크 권고는 나오지만 메모리 권고는 생성되지 않는다. A는 틀림(CO는 메모리 권고 제공). C는 가능성이 있으나 "메모리만 없고 CPU는 나온다"는 단서가 메트릭 종류 문제(특정 메트릭 부재)임을 가리킨다 — 14일 미달이면 CPU 권고도 안 나온다. D도 권고 자체가 아예 안 나올 것이다. 함정: "메모리 권고만 부재"의 정답은 거의 항상 CW Agent 미설치다.

---

**문제 2.** 운영팀이 수천 대 EC2의 rightsizing을 일회성이 아니라 지속적으로 자동화하려 한다. 권고를 안전하게 적용하는 파이프라인으로 가장 적합한 것은?

A) Trusted Advisor 콘솔에서 매주 수동 검토

B) Compute Optimizer 권고를 S3로 Export → EventBridge → Lambda 필터 → 비프로덕션 자동 적용, 프로덕션은 승인 게이트 후 적용

C) 모든 권고를 즉시 자동 적용하는 Lambda

D) CloudWatch Alarm으로 CPU 낮으면 자동 종료

**정답: B**
해설: 지속적·안전한 rightsizing은 CO 권고를 S3로 Export하고 Lambda가 performance risk 낮은 Over-provisioned 권고만 필터링한 뒤, 위험이 낮은 비프로덕션은 자동 적용하고 프로덕션에는 승인 게이트를 둬 적용하는 파이프라인이다. A는 규모에서 검토 속도가 인프라 증가를 못 따라간다. C는 ML 권고를 무비판적으로 적용해 spike 워크로드를 잘못 줄일 위험이 있다. D는 평균 CPU만 보는 단순 룰이라 배치 spike를 죽일 수 있다. 함정: 운영 워크로드에는 반드시 승인 게이트를 두고, 위험도에 따라 자동/수동을 이원화한다.

---

**문제 3.** ASG로 관리되는 인스턴스들을 Compute Optimizer 권고에 따라 더 작은 타입으로 교체하려 한다. 올바른 방법은?

A) 각 인스턴스를 stop → ModifyInstanceAttribute → start

B) Launch Template 새 버전에 권장 타입을 넣고 Instance Refresh로 롤링 교체

C) ASG를 삭제하고 새로 생성

D) 인스턴스를 직접 종료하면 ASG가 알아서 새 타입으로 띄운다

**정답: B**
해설: ASG 환경에서 인스턴스를 직접 stop/modify하면 ASG가 헬스 체크에서 비정상으로 판단해 종료·재생성하며, 이때 옛 Launch Template의 기존 타입으로 다시 뜬다. 올바른 방법은 Launch Template의 새 버전에 권장 타입을 넣고 Instance Refresh로 MinHealthyPercentage를 지키며 점진적으로 무중단 교체하는 것이다. A는 ASG가 간섭해 실패한다. C는 불필요하게 파괴적이다. D는 기존 Launch Template의 옛 타입으로 다시 띄워져 교체가 안 된다. 함정: "ASG 인스턴스 직접 modify"는 오답이며 Launch Template + Instance Refresh가 정답이다.

---

**문제 4.** 보안·성능·내결함성·비용·서비스 한도를 아우르는 넓은 점검을 룰 기반으로 빠르게 받고 싶다. 어떤 도구인가?

A) Compute Optimizer

B) Trusted Advisor (Business 이상 Support)

C) CUR

D) X-Ray

**정답: B**
해설: Trusted Advisor는 Cost·Performance·Security·Fault Tolerance·Service Limits 5개 카테고리를 룰 기반으로 넓게 점검하며, 전체 체크는 Business 이상 Support에서 활성화된다. A(Compute Optimizer)는 컴퓨팅·스토리지를 ML로 좁고 깊게 분석하지 정책·내결함성 전반을 보지 않는다. C(CUR)는 청구 데이터이지 점검 도구가 아니다. D(X-Ray)는 분산 추적이다. 함정: "넓고 얕게 5개 카테고리"는 Trusted Advisor, "좁고 깊게 정밀 권고"는 Compute Optimizer. (참고: Azure는 Azure Advisor, GCP는 Recommender가 대응.)

---

**문제 5.** 50개 멤버 계정으로 구성된 Organization에서 모든 계정의 rightsizing 권고를 한 화면에서 통합해 보려 한다. 가장 적합한 방법은?

A) 각 계정 콘솔을 순회하며 확인

B) Compute Optimizer를 위임 관리자로 지정하고 Org 차원에서 활성화(opt-in)

C) Config Aggregator로 권고 수집

D) Cost Explorer에서 계정별 필터

**정답: B**
해설: Compute Optimizer를 위임 관리자로 지정하면 Org 전체 멤버 계정의 권고를 중앙에서 집계해 보고 일괄 export·분석할 수 있다. A는 규모에서 비현실적이다. C(Config Aggregator)는 리소스 구성 규정 준수를 모으는 것이지 rightsizing 권고가 아니다. D(Cost Explorer)는 비용 가시화이지 정밀 rightsizing 권고 통합이 아니다. 함정: "여러 계정 rightsizing 권고 통합"은 CO 위임 관리자이며, compliance 통합(Config Aggregator)·비용 통합(Cost Explorer)과 구분해야 한다.

---

**문제 6.** EBS 볼륨을 gp2에서 gp3로 전환하라는 Compute Optimizer 권고를 받았다. 이 전환의 특징으로 옳은 것은?

A) 볼륨을 분리·재생성해야 하므로 긴 다운타임이 필요하다

B) ModifyVolume으로 무중단 전환이 가능하며 보통 비용·성능이 개선된다

C) 인스턴스를 stop해야만 변경된다

D) 데이터가 손실되므로 스냅샷에서 복원해야 한다

**정답: B**
해설: gp2→gp3 전환은 ModifyVolume API로 볼륨을 떼지 않고 무중단(online)으로 수행되며, gp3는 동일 성능 기준 보통 약 20% 더 저렴하고 IOPS·Throughput을 용량과 독립적으로 설정할 수 있다(gp2는 용량에 IOPS가 연동). A·C는 EC2 타입 변경(stop→modify→start)과 혼동한 것으로, EBS 타입 변경은 인스턴스 중단이 불필요하다. D는 틀림(데이터 보존). 함정: EC2 타입 변경은 중단을 동반하지만 EBS gp2→gp3는 무중단이다.

---

**문제 7.** 한 워크로드를 더 긴 lookback과 메모리·디스크 I/O를 반영한 정밀 권고로 분석하고 싶다. 계절성(월말 spike)이 있어 14일로는 부족하다. 어떻게 해야 하나?

A) Trusted Advisor로 전환한다

B) Compute Optimizer의 enhanced infrastructure metrics를 활성화해 lookback을 최대 93일로 늘린다

C) Cost Explorer Forecast를 본다

D) 인스턴스를 더 크게 키운다

**정답: B**
해설: Compute Optimizer의 enhanced infrastructure metrics를 켜면 추가 메트릭(메모리·디스크 I/O 등)을 반영하고 lookback을 기본 14일에서 최대 93일(3개월)로 확장해 월말 spike 같은 계절성을 반영한 정밀 권고를 얻는다. 활성 리소스 시간당 과금되는 유료 옵션이다. A는 룰 기반이라 계절성 패턴을 못 본다. C는 비용 예측이지 rightsizing 권고가 아니다. D는 문제 해결이 아니다. 함정: "더 긴 기간·계절성 반영 정밀 권고"는 enhanced infrastructure metrics가 단서다.
