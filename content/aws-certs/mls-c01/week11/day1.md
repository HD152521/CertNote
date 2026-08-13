# Day 1 - Model Monitoring: SageMaker Model Monitor and Drift Response

## 📌 핵심 정리

- 배포 직후가 아니라 **몇 달 뒤**가 위험하다. 검증 95%였던 모델이 운영에서 60%로 조용히 무너지는 이유는 세상이 변해 데이터가 드리프트했기 때문이다.
- 드리프트는 **데이터 드리프트(X 분포)·컨셉 드리프트(X→Y 관계)·레이블 드리프트(Y 분포)** 3종. 정답 없이 오늘 잡을 수 있는 건 데이터 드리프트다.
- Model Monitor는 **Data Quality / Model Quality / Bias Drift / Feature Attribution Drift** 4종이고, 정답 레이블이 필요한 건 Model Quality(및 Bias 일부)뿐이다.
- 흐름은 고정이다: **Data Capture → 베이스라인(`statistics.json`·`constraints.json`) → 스케줄 → `constraint_violations.json` → CloudWatch 경보 → EventBridge → 재학습**.
- 의도적으로 재학습해 분포를 바꿨다면 **베이스라인을 반드시 재생성**한다. 안 하면 정당한 변화가 매 실행 오탐으로 쏟아진다.

## 배포 후 모니터링이 필요한 이유

배포된 모델은 학습 시점에 배운 패턴에 의존하는데, 현실의 분포는 배포한 그날부터 이동한다.

| 변화 원인 | 예시 | 결과 |
|---|---|---|
| 사용자 행동 변화 | 계절성, 신규 세그먼트 유입, 위기 상황 | 입력 X의 분포가 이동 |
| 데이터 소스 변화 | 센서 재보정, 상류 ETL 수정, 단위 변경 | 같은 컬럼이 다른 의미의 값을 담음 |
| 타깃 관계 붕괴 | 사기 수법 변화, 정책 변경 | 피처는 그대로인데 정답이 달라짐 |
| 스키마 변경 | 컬럼 추가·삭제, 타입 변경, 결측 급증 | 추론 실패 또는 조용한 성능 저하 |

핵심 제약은 하나다. **정답(ground truth)은 늦게 오거나 아예 안 온다.** 그래서 **레이블 없이 입력 분포를 감시**하는 것이 1차 경보선이 된다.

## 드리프트 3종 비교

| 구분 | 무엇이 변하나 | 수식으로 | 레이블 필요? | 대표 신호 | 대응 |
|---|---|---|---|---|---|
| **데이터 드리프트**(공변량 시프트) | 입력 분포 P(X) | P(X) 변화, P(Y\|X) 유지 | **불필요** | 평균 연령 35→48, 결측률 급증 | Data Quality → 재학습 |
| **컨셉 드리프트** | 입력→정답 관계 P(Y\|X) | P(X) 유지, P(Y\|X) 변화 | **필요**(가장 어려움) | 입력 통계는 정상인데 정확도만 하락 | Model Quality → 재학습·재설계 |
| **레이블 드리프트**(사전확률 시프트) | 정답 분포 P(Y) | P(Y) 변화 | 필요 | 사기 비율 0.5%→3% | 임계값·클래스 가중치 재조정 |

```text
[데이터 드리프트]         [컨셉 드리프트]          [레이블 드리프트]
 ░░▓▓▓░░ → ░░░▓▓▓        ●●●/○○○ 경계선 이동      0.5% ▓ → 3% ▓▓▓▓▓▓
 경계선 그대로, 입력만 이동  입력 통계는 정상으로 보임   양성 비율만 변함
 → 레이블 없이 탐지 가능    → 레이블 없으면 못 봄     → 임계값 재조정
```

> 💡 **관련 이론**: "성능이 떨어지는데 레이블이 늦게 온다. 무엇을 볼 것인가?"의 정답은 **레이블 없는 입력 통계**다. X의 드리프트는 성능 저하의 선행 지표(early warning)일 뿐 인과가 보장되지는 않지만, 오늘 당장 조치할 수 있는 유일한 신호다. 컨셉 드리프트는 가장 위험하면서 레이블 없이는 관측이 불가능하다.

## SageMaker Model Monitor 4종 모니터

| 모니터 | 감시 대상 | 레이블 필요 | 베이스라인 산출물 | 대표 위반 예 |
|---|---|---|---|---|
| **Data Quality** | 입력 피처 통계(결측·타입·범위·분포) | **불필요** | `statistics.json`, `constraints.json` | 결측률 상승, 타입 불일치, 분포 거리 초과 |
| **Model Quality** | 예측 품질(Accuracy·F1·AUC·RMSE 등) | **필요** | 성능 지표 임계값 제약 | 정확도가 임계값 아래로 하락 |
| **Bias Drift** | 그룹 간 공정성 지표(Clarify) | 부분 필요(지표에 따라) | 편향 지표 베이스라인 | 특정 집단 예측 비율 격차 확대 |
| **Feature Attribution Drift** | 피처 기여도(SHAP) 순위·크기 | **불필요** | 기여도 베이스라인 | 상위 기여 피처 순위가 뒤바뀜 |

- Data Quality / Model Quality는 `DefaultModelMonitor`, `ModelQualityMonitor`가 담당한다.
- Bias Drift / Feature Attribution Drift는 **SageMaker Clarify** 기반(`ModelBiasMonitor`, `ModelExplainabilityMonitor`)이다.
- 네 모니터 모두 내부적으로 **Processing Job**으로 실행된다. 스케줄 실행마다 별도 컨테이너가 뜨고 비용이 발생한다.

> 💡 **개념**: 4종을 고르는 기준은 사실상 하나, **"지문에 정답 레이블이 있는가"**다. 레이블이 없으면 Data Quality 또는 Feature Attribution Drift, 있으면 Model Quality, 공정성 이야기면 Bias Drift다.

## 전체 파이프라인 한 장

```text
① 학습/검증 데이터 ─▶ suggest_baseline ─▶ statistics.json + constraints.json
                                                    │ (기준값)
[클라이언트] ─요청─▶ [Endpoint] ─응답─▶ [클라이언트]  │
                        │ ② DataCaptureConfig       │
                        ▼                           │
              s3://.../datacapture/ ────────────────┤
                                                    ▼
                        ③ 스케줄(최소 1시간) ─▶ [Monitoring Execution]
                                                    │
                          ┌─────────────────────────┴──────────────┐
                          ▼                                        ▼
              statistics.json(이번 구간)         constraint_violations.json
                          └────────────┬───────────────────────────┘
                                       ▼ ④ enable_cloudwatch_metrics=True
                              [CloudWatch 지표 · 경보]
                                       ▼ ⑤ ALARM 전이
                                [Amazon EventBridge]
                        ┌──────────────┼──────────────┐
                        ▼              ▼              ▼
                   [SNS 알림]     [Lambda]   [SageMaker Pipeline 재학습]
                                                      ▼
                                        [Model Registry] 새 버전 → 승인 → 재배포
```

## 1단계 — Data Capture

엔드포인트가 실제 요청·응답을 S3에 적재해야 감시할 원본이 생긴다.

```python
from sagemaker.model_monitor import DataCaptureConfig

data_capture_config = DataCaptureConfig(
    enable_capture=True,
    sampling_percentage=100,          # 트래픽이 많으면 20~50%로 낮춘다
    destination_s3_uri="s3://my-bucket/datacapture",
    capture_options=["REQUEST", "RESPONSE"],
)

predictor = model.deploy(..., data_capture_config=data_capture_config)
```

| 파라미터 | 역할 | 실무 판단 |
|---|---|---|
| `enable_capture` | 캡처 on/off | 끄면 모니터가 볼 데이터 자체가 없다 |
| `sampling_percentage` | 캡처 비율(%) | 100%는 S3 비용 증가. 고트래픽은 표본 추출 |
| `destination_s3_uri` | 캡처 저장 경로 | 엔드포인트/변형/날짜/시간 단위로 파티션 저장 |
| `capture_options` | 요청·응답 선택 | 입력 통계만 필요하면 REQUEST만으로도 가능 |

- 캡처 파일은 **JSON Lines** 형식이며 각 레코드에 `eventId` 등 메타데이터가 붙는다. 이 ID가 나중에 정답 레이블과 조인하는 열쇠다.
- 배치 변환(Batch Transform)에도 캡처를 걸 수 있어 실시간 엔드포인트가 없어도 모니터링이 가능하다.

> ⚠️ **함정**: 캡처를 켠 뒤에는 **트래픽이 실제로 흘러야** 파일이 쌓인다. 호출이 없는 구간의 스케줄 실행은 비교 대상이 없어 실패한다. "모니터링을 만들었는데 결과가 안 나온다"의 1순위 원인이다.

## 2단계 — 베이스라인: statistics.json과 constraints.json

베이스라인은 "무엇이 정상인가"를 학습·검증 데이터에서 뽑아낸 스냅샷이다.

```python
from sagemaker.model_monitor import DefaultModelMonitor
from sagemaker.model_monitor.dataset_format import DatasetFormat

monitor = DefaultModelMonitor(
    role=role, instance_count=1, instance_type="ml.m5.xlarge",
    volume_size_in_gb=20, max_runtime_in_seconds=3600,
)
monitor.suggest_baseline(
    baseline_dataset="s3://my-bucket/baseline/train.csv",
    dataset_format=DatasetFormat.csv(header=True),
    output_s3_uri="s3://my-bucket/baseline-results",
)
# 산출물: statistics.json, constraints.json
```

| 산출물 | 담는 내용 | 모니터가 쓰는 방식 |
|---|---|---|
| **statistics.json** | 피처별 평균·합·표준편차·최소·최대·결측 수·분포 요약 | 운영 구간 통계와 수치를 비교 |
| **constraints.json** | 피처별 데이터 타입, completeness(결측 허용치), 음수 허용 여부, 분포 비교 설정 | 위반 여부를 판정하는 **규칙** |

- `constraints.json`의 `monitoring_config`에서 비교 임계값과 분포 비교 방식을 조정한다. 자동 제안값이 너무 빡빡하면 여기서 완화한다.
- 베이스라인은 **모델이 학습한 그 데이터**로 뜬다. 운영 데이터로 뜨면 이미 드리프트한 상태를 "정상"으로 굳혀 버린다.

## 3단계 — 모니터링 스케줄

```python
from sagemaker.model_monitor import CronExpressionGenerator

monitor.create_monitoring_schedule(
    monitor_schedule_name="data-quality-hourly",
    endpoint_input=predictor.endpoint_name,
    statistics=monitor.baseline_statistics(),
    constraints=monitor.suggested_constraints(),
    schedule_cron_expression=CronExpressionGenerator.hourly(),
    enable_cloudwatch_metrics=True,
)
```

| 주기 헬퍼 | 의미 | 언제 |
|---|---|---|
| `CronExpressionGenerator.hourly()` | 매시간 | 빠른 탐지가 필요할 때(**최소 단위**) |
| `CronExpressionGenerator.daily()` | 매일 정해진 시각 | 일 단위 배치성 서비스, 비용 절감 |
| `CronExpressionGenerator.daily_every_x_hours(x)` | x시간 간격 | 중간 절충 |

| 실행 상태 | 뜻 | 조치 |
|---|---|---|
| `Completed` | 성공, 위반 없음 | 없음 |
| `CompletedWithViolations` | 성공, **위반 발견** | 위반 파일 확인 → 원인 분류 |
| `Failed` | 실행 자체 실패 | 캡처 데이터 없음·권한·스키마 불일치 확인 |
| `Stopped` | 시간 초과 등으로 중단 | 인스턴스·`max_runtime` 상향 |

각 실행은 `constraint_violations.json`과 그 구간의 `statistics.json`을 S3에 남기고, `enable_cloudwatch_metrics=True`면 피처별 지표를 CloudWatch로 발행해 경보를 걸 수 있게 한다.

## 4단계 — 위반에서 재학습까지

| 단계 | 구성 요소 | 하는 일 |
|---|---|---|
| 탐지 | Monitoring Schedule | 위반 판정, `constraint_violations.json` 생성 |
| 계량화 | CloudWatch 지표 | 피처별 위반·통계 지표 발행 |
| 판단 | CloudWatch 경보 | 임계값·평가 기간을 넘으면 ALARM 전이 |
| 라우팅 | **EventBridge** | 경보 상태 변화 이벤트를 받아 대상 호출 |
| 실행 | SageMaker Pipeline / Lambda | 재학습·재평가·모델 등록 |
| 통제 | Model Registry | 새 버전 등록 후 **승인 게이트** |
| 알림 | SNS | 담당자에게 통보 |

```json
{
  "violations": [
    { "feature_name": "age",
      "constraint_check_type": "baseline_drift_check",
      "description": "Baseline drift distance exceeded threshold" },
    { "feature_name": "income",
      "constraint_check_type": "completeness_check",
      "description": "Completeness dropped below required value" }
  ]
}
```

> ⚠️ **함정**: 위반 1건마다 즉시 재학습을 돌리면 비용이 폭발하고 모델이 흔들린다. CloudWatch 경보의 **평가 기간(연속 N회 위반)** 을 두어 일시적 튐과 지속적 드리프트를 구분하라.

## Model Quality 모니터링과 레이블 지연

Model Quality 모니터는 정답이 있어야 동작한다. 그래서 **나중에 도착하는 레이블을 캡처 데이터와 조인**하는 단계가 먼저 필요하다.

```text
[캡처된 예측]  eventId=abc  pred=0.87 ─┐
                                       ├─▶ [Ground Truth Merge] ─▶ [Model Quality]
[뒤늦게 온 정답] eventId=abc  label=1 ─┘        (eventId로 조인)     Accuracy·F1·AUC
```

- 정답 레이블을 지정된 S3 경로에 업로드하면 모니터가 `eventId`로 예측과 짝지어 성능 지표를 계산한다.
- 레이블이 늦을수록 Model Quality의 **탐지 지연**도 그만큼 늦어진다. 그 공백을 Data Quality가 메운다.

| 레이블 상황 | 1차 방어선 | 보조 수단 | 하면 안 되는 것 |
|---|---|---|---|
| 몇 시간 내 도착 | Model Quality(일 단위 스케줄) | Data Quality 병행 | 없음 |
| 수 주~수 개월 지연 | **Data Quality** | Feature Attribution Drift, 예측 분포 감시 | 정답을 기다리며 무감시 방치 |
| 표본으로만 확보 | 표본 기반 Model Quality | Data Quality 상시 감시 | 표본 정확도를 전체 성능으로 단정 |
| 영원히 없음 | Data Quality + Feature Attribution Drift | 비즈니스 대리지표(전환율 등) | Model Quality 도입 시도 |

> 💡 **개념**: Feature Attribution Drift는 레이블 없이도 "모델이 판단 근거로 삼는 피처의 순위·크기"가 베이스라인 대비 얼마나 흔들렸는지를 본다. 입력 평균은 그대로인데 의사결정 구조만 바뀐 상황을 잡아 주는, Data Quality와 상호 보완적인 신호다.

## 베이스라인 재생성 함정

```text
[t0] 학습셋 A로 학습 → 베이스라인(A) → 배포·감시           ✅ 정상
[t1] 드리프트 탐지 → 새 데이터 B 포함해 재학습 → 재배포
[t2] 베이스라인은 여전히 A  →  매 실행 위반 폭주            ❌ 오탐
[t2'] 베이스라인을 B로 재생성  →  다시 조용해짐             ✅ 정답
```

- 재학습으로 분포를 **의도적으로 바꿨다면** 베이스라인도 새 학습 데이터로 다시 뜬다.
- 반대로 재학습하지 않았는데 위반이 뜬다고 베이스라인을 운영 데이터로 갱신하면, 드리프트를 정상으로 세탁해 경보가 영원히 울리지 않는다.
- 즉 **베이스라인 갱신은 "재학습을 했는가"에 종속**된다. 이 인과를 뒤집는 보기는 항상 오답이다.

## 지문 단서 → 정답 매핑

| 지문 단서 | 고를 답 | 이유 |
|---|---|---|
| "정답 레이블이 며칠 뒤에야 온다 / 없다" | **Data Quality 모니터링** | 입력 통계만으로 판정, 레이블 불필요 |
| "정확도·F1이 떨어졌는지 알고 싶다, 레이블 있음" | **Model Quality 모니터링** | 예측과 정답을 비교해야 나오는 지표 |
| "SHAP 기여도 순위가 바뀌었는지 감시" | **Feature Attribution Drift** | Clarify 기반 기여도 드리프트 감시 |
| "특정 집단에 대한 예측 격차가 커졌다" | **Bias Drift** | Clarify 공정성 지표 감시 |
| "모니터링을 설정하려면 가장 먼저?" | **베이스라인 생성** | 비교 기준이 없으면 판정 자체가 불가 |
| "엔드포인트 입력·출력을 S3에 남겨야 한다" | **DataCaptureConfig** | 감시할 원본을 만드는 단계 |
| "위반 시 사람 개입 없이 재학습 시작" | **EventBridge → SageMaker Pipeline** | 경보 이벤트를 받아 워크플로 호출 |
| "재학습 후 위반이 매번 발생한다" | **베이스라인 재생성** | 새 분포를 정상으로 다시 정의 |
| "S3 캡처 비용·지연이 부담된다" | `sampling_percentage` 하향 | 전량 대신 표본만 캡처 |
| "모니터링 스케줄을 삭제한다 / 캡처를 끈다" | **오답 보기** | 증상이 아니라 감시를 없애는 행위 |

## 운영 체크리스트

- [ ] 캡처가 켜져 있고 S3에 파일이 실제로 쌓이는가
- [ ] 베이스라인이 **모델이 학습한 데이터**로 생성되었는가
- [ ] 경보에 **평가 기간**이 설정되어 일시적 튐을 걸러 내는가
- [ ] 위반 → EventBridge → 재학습 경로와 베이스라인 재생성이 파이프라인에 포함되었는가

다음 글에서는 이 재학습을 사람 손 없이 굴리는 **MLOps** — SageMaker Pipelines, Model Registry, CI/CD를 다룬다.

## 📖 용어

- **드리프트(drift)** : 배포 후 데이터나 정답의 분포가 학습 시점과 달라지는 현상. 모델 성능이 조용히 무너지는 주범이다.
- **데이터 드리프트(공변량 시프트)** : 입력 X의 분포만 이동한 상태. 정답 없이도 탐지할 수 있어 1차 경보선이 된다.
- **컨셉 드리프트** : 입력은 그대로인데 입력과 정답의 관계가 달라진 상태. 레이블 없이는 볼 수 없어 가장 까다롭다.
- **레이블 드리프트(사전확률 시프트)** : 정답 Y의 비율이 변한 상태. 사기 비율이 0.5%에서 3%로 뛰는 경우가 예다.
- **Data Capture** : 엔드포인트가 실제 요청·응답을 S3에 자동 저장하는 기능. 모니터링의 원재료를 만든다.
- **베이스라인(baseline)** : 학습·검증 데이터로 뽑은 "정상" 스냅샷. `statistics.json`과 `constraints.json` 한 쌍으로 나온다.
- **constraint_violations.json** : 스케줄 실행마다 나오는 위반 목록 파일. 어떤 피처가 어떤 규칙을 어겼는지 적힌다.
- **Ground Truth Merge** : 뒤늦게 도착한 정답을 캡처된 예측과 `eventId`로 짝지어 성능 지표를 계산할 수 있게 만드는 단계.
- **Feature Attribution Drift** : SHAP 기여도의 순위·크기가 베이스라인 대비 얼마나 변했는지 감시하는 Clarify 기반 모니터.
- **EventBridge** : CloudWatch 경보 같은 이벤트를 받아 Lambda·Pipeline 등 대상을 호출하는 이벤트 라우팅 서비스.

## 📝 연습 문제

**문제 1.** 운영 중인 SageMaker 엔드포인트의 입력 트래픽에서 특정 수치 피처의 평균과 분산이 학습 시점과 크게 달라졌다. 정답 레이블은 며칠 뒤에야 수집된다. 즉시 이 변화를 탐지하기에 가장 적합한 Model Monitor 유형은?

A) Model Quality 모니터링  
B) Data Quality 모니터링  
C) A/B 테스트 트래픽 분할  
D) Hyperparameter Tuning  

**정답: B**  
해설: 정답 없이 입력 피처의 통계적 분포 변화를 감지하는 것은 Data Quality 모니터링이다. Model Quality(A)는 정답 레이블이 있어야 하고, A/B 테스트(C)는 배포 비교용, 튜닝(D)은 학습 단계 작업이다.

---

**문제 2.** Model Monitor의 데이터 품질 모니터링을 설정하려 한다. 가장 먼저 수행해야 하는 단계는?

A) EventBridge 규칙 생성  
B) 학습/검증 데이터로 베이스라인(통계·제약) 생성  
C) 모델을 재학습  
D) CloudWatch 대시보드 구성  

**정답: B**  
해설: 모니터링은 "정상 기준"인 베이스라인 statistics.json/constraints.json이 있어야 비교가 가능하므로 베이스라인 생성이 선행된다. EventBridge(A)와 CloudWatch(D)는 위반 발생 후 대응 단계, 재학습(C)은 드리프트 탐지 결과다.

---

**문제 3.** 모델을 의도적으로 재학습해 새로운 데이터 분포를 반영했다. 그런데 기존 모니터링이 매 실행마다 드리프트 위반을 발행한다. 가장 적절한 조치는?

A) 모니터링 스케줄을 영구 삭제한다  
B) sampling_percentage를 0으로 낮춘다  
C) 새 학습 데이터로 베이스라인을 다시 생성한다  
D) 엔드포인트 인스턴스 타입을 키운다  

**정답: C**  
해설: 새 분포를 정상으로 받아들였으므로 베이스라인을 재생성해야 정당한 변화를 오탐하지 않는다. 모니터링 삭제(A)는 감시 포기, 샘플링 0(B)은 캡처 중단, 인스턴스 변경(D)은 무관하다.

---

**문제 4.** 데이터 품질 위반이 발생하면 사람 개입 없이 재학습 파이프라인을 자동으로 시작하고 싶다. CloudWatch 경보 발동을 받아 SageMaker Pipeline을 호출하기에 가장 적합한 서비스는?

A) Amazon EventBridge  
B) Amazon Macie  
C) AWS Glue DataBrew  
D) Amazon Comprehend  

**정답: A**  
해설: EventBridge는 CloudWatch 경보 상태 변화 같은 이벤트를 받아 Pipeline/Lambda를 트리거하는 이벤트 라우팅 서비스다. Macie(B)는 데이터 분류/보안, Glue DataBrew(C)는 데이터 준비, Comprehend(D)는 NLP 서비스다.

---

**문제 5.** Feature Attribution Drift 모니터링이 감지하는 변화로 가장 정확한 설명은?

A) 엔드포인트의 응답 지연(latency) 증가  
B) 예측에 대한 각 피처의 기여도(SHAP) 순위/크기 변화  
C) S3 버킷의 저장 용량 변화  
D) IAM 역할 권한 변경  

**정답: B**  
해설: Feature Attribution Drift는 SageMaker Clarify의 SHAP 기여도가 운영 트래픽에서 베이스라인 대비 어떻게 변했는지를 감시한다. 지연(A)은 CloudWatch 성능 지표, 저장 용량(C)·IAM(D)은 모니터 대상이 아니다.

---
