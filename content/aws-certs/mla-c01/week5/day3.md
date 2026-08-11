# Day 3 - 디버깅과 프로파일링: SageMaker Debugger와 Profiler

## 📌 핵심 정리

- **Debugger = 모델 내부(텐서)**, **Profiler = 시스템 자원**. 증상이 학습 품질이면 Debugger, 속도·비용이면 Profiler.
- Debugger는 텐서를 S3에 저장하고 **내장 규칙**(vanishing_gradient, exploding_tensor, loss_not_decreasing, overfit 등)으로 이상을 감지한다.
- **감지 ≠ 자동 중단** — 규칙에 `StopTraining` 같은 **action**을 붙여야 비용이 막힌다. 시험 단골 함정.
- Profiler는 GPU 저활용·데이터 로딩·CPU 병목을 찾아낸다. GPU가 노는 것은 대개 **모델이 아니라 데이터 파이프라인** 문제.
- 전반 메트릭·로그·알람은 **CloudWatch**, 학습 곡선 시각화는 TensorBoard가 맡는다.

## Debugger와 Profiler의 역할 분리

손실이 줄지 않거나, 비싸게 빌린 GPU의 활용률이 30%에 머문다면 학습 내부를 들여다봐야 한다. 먼저 두 도구의 관심사를 명확히 가른다.

| 구분 | SageMaker Debugger | SageMaker Profiler |
|------|-------------------|-------------------|
| 보는 것 | 모델 내부 텐서(그래디언트, 가중치, 손실, 활성값) | 시스템 자원(CPU/GPU 활용률, 메모리, I/O) |
| 답하는 질문 | "모델이 왜 잘못 학습되나?" | "왜 느린가/비효율적인가?" |
| 대표 감지 | 그래디언트 소실/폭발, 과적합, 가중치 미갱신 | GPU 저활용, 데이터 로딩 병목, CPU 병목 |
| 동작 방식 | 텐서를 주기적으로 S3에 저장 후 규칙(rule) 평가 | 시스템·프레임워크 메트릭 수집·분석 |
| 자동 조치 | 규칙 위반 시 알림/조기 종료(action) | 병목 리포트·권고 |

- 핵심 직관: **Debugger는 "모델이 잘못됐다"를, Profiler는 "자원이 낭비된다"를 본다.**
- "그래디언트가 0이 됐다/폭발한다" 같은 **학습 품질** 증상 → Debugger.
- "GPU가 놀고 있다/데이터 로딩이 느리다" 같은 **자원** 증상 → Profiler.

```text
증상을 먼저 계층으로 분류한다

  손실·정확도가 이상하다        → 모델 계층      → Debugger (텐서)
        │
  학습은 되는데 느리다/비싸다    → 자원 계층      → Profiler (GPU/CPU/IO)
        │
  작업 상태·전체 추세를 보고 싶다 → 운영 계층      → CloudWatch (메트릭·로그·알람)
```

> 💡 **관련 이론**: 이 분리는 관측가능성(observability)의 두 층위에 대응한다. Debugger는 모델이라는 "수학적 프로세스"의 내부 상태(텐서)를 본다 — 그래디언트가 소실되면 학습이 멈추고 폭발하면 발산한다. Profiler는 그 프로세스가 돌아가는 "물리적 자원"의 사용 패턴을 본다 — GPU가 데이터를 기다리며 노는지, 전처리가 CPU를 묶고 있는지. 두 층위를 같이 봐야 "왜 학습이 안 되는가"와 "왜 비싼가"를 동시에 푼다.

## SageMaker Debugger: 모델 내부를 본다

Debugger는 학습 중 텐서(그래디언트, 가중치, 손실 등)를 정기적으로 S3에 저장하고, 미리 정의된 **내장 규칙(built-in rule)**으로 이상을 감지한다.

```python
from sagemaker.debugger import Rule, rule_configs, DebuggerHookConfig

estimator = PyTorch(
    entry_point='train.py', role=role,
    instance_type='ml.g5.xlarge', instance_count=1,
    framework_version='2.0', py_version='py310',
    rules=[
        Rule.sagemaker(rule_configs.vanishing_gradient()),   # 그래디언트 소실
        Rule.sagemaker(rule_configs.exploding_tensor()),     # 텐서 폭발
        Rule.sagemaker(rule_configs.overfit()),              # 과적합
        Rule.sagemaker(rule_configs.loss_not_decreasing())   # 손실 정체
    ],
    debugger_hook_config=DebuggerHookConfig(
        s3_output_path='s3://my-bucket/debug-tensors/'
    )
)
```

자주 나오는 내장 규칙을 "무엇을 보고 → 무엇을 의심하고 → 무엇을 하는가"로 묶어 외운다.

| 내장 규칙 | 감지하는 것 | 의심할 원인 | 1차 조치 |
|-----------|-----------|-----------|---------|
| `vanishing_gradient` | 그래디언트가 0에 수렴 | 층이 깊고 활성함수·초기화가 부적절 | 활성함수 교체, 정규화 층, 초기화 변경 |
| `exploding_tensor` | 텐서 값이 발산 | 학습률 과대, 스케일링 누락 | 학습률↓, 그래디언트 클리핑, 입력 정규화 |
| `loss_not_decreasing` | 손실이 일정 스텝 동안 정체 | 학습률 부적절, 데이터·레이블 문제 | 학습률 조정, 데이터 점검 후 **조기 중단** |
| `overfit` / `overtraining` | 검증 손실만 악화 | 과적합 | 정규화·증강·조기 종료 |
| `dead_relu` | 죽은 뉴런 비율 과다 | 활성함수·초기화·학습률 | 활성함수 변경, 학습률↓ |
| `weight_update_ratio` | 가중치 갱신 폭이 비정상 | 학습률이 너무 크거나 작음 | 학습률 재조정 |
| `class_imbalance` | 클래스 분포 편중 | 데이터 수집 편향 | 리샘플링·클래스 가중치 |

수집할 텐서를 직접 고르고 저장 주기를 조절할 수도 있다. 텐서를 촘촘히 저장하면 진단은 정밀해지지만 S3 쓰기와 학습 오버헤드가 늘어난다.

```python
from sagemaker.debugger import DebuggerHookConfig, CollectionConfig

debugger_hook_config = DebuggerHookConfig(
    s3_output_path='s3://my-bucket/debug-tensors/',
    collection_configs=[
        CollectionConfig(name='losses',    parameters={'save_interval': '50'}),
        CollectionConfig(name='gradients', parameters={'save_interval': '100'}),
        CollectionConfig(name='weights',   parameters={'save_interval': '500'}),
    ]
)
```

> 💡 **개념: 규칙은 학습 밖에서 돈다.** Debugger 내장 규칙은 학습 컨테이너 안이 아니라 **별도의 평가 작업**으로 실행된다. 학습은 텐서를 S3에 쓰기만 하고, 규칙은 그 텐서를 읽어 판정한다. 덕분에 규칙 평가가 학습 속도를 크게 갉아먹지 않지만, 그만큼 **판정에 약간의 지연**이 있고 별도 리소스 비용도 붙는다는 점을 같이 기억한다.

> ⚠️ **함정**: 규칙은 기본적으로 "감지 후 보고"만 한다. 규칙이 위반됐을 때 학습을 자동으로 멈추려면 **action**을 따로 연결해야 한다. 예를 들어 그래디언트가 폭발하는데도 학습이 끝까지 돌면서 비용만 태우는 사고를 막으려면 `StopTraining` 액션을 건다. "감지=자동중단"이라고 착각하지 않는 게 핵심.

```python
from sagemaker.debugger import Rule, rule_configs
from sagemaker.debugger import CollectionConfig

# 규칙 위반 시 학습 자동 중단 + 알림
rule = Rule.sagemaker(
    rule_configs.loss_not_decreasing(),
    actions=rule_configs.ActionList(
        rule_configs.StopTraining(),          # 학습 중단(비용 절약)
        rule_configs.Email("ml-team@example.com")
    )
)
```

## SageMaker Profiler: 자원을 본다

Profiler는 학습 중 시스템 자원(CPU·GPU 활용률, GPU 메모리, 네트워크·I/O)과 프레임워크 동작을 수집해, 병목을 찾아 리포트한다. 비싼 GPU 인스턴스를 빌렸는데 활용률이 낮으면 그만큼 돈을 버리는 것이므로 비용 최적화와 직결된다.

```python
from sagemaker.debugger import ProfilerConfig, FrameworkProfile

estimator = PyTorch(
    entry_point='train.py', role=role,
    instance_type='ml.p4d.24xlarge', instance_count=1,
    framework_version='2.0', py_version='py310',
    profiler_config=ProfilerConfig(
        system_monitor_interval_millis=500,
        framework_profile_params=FrameworkProfile()
    )
)
```

Profiler가 흔히 잡아내는 병목을 증상 → 원인 → 조치로 정리하면 이렇다.

| 증상 | 원인 | 조치 |
|------|------|------|
| GPU 활용률이 낮고 톱니 모양으로 오르내림 | GPU가 데이터를 기다린다 | 로더 워커 증가, FSx for Lustre 캐시, 프리페치로 겹치기 |
| CPU 사용률만 100%에 붙어 있음 | 전처리가 무겁다 | 전처리를 사전 배치 처리로 분리, 경량화, GPU 전처리 검토 |
| GPU 활용률은 높은데 스텝이 느림 | 연산 자체가 무겁다 | 혼합 정밀도, 배치·모델 구조 조정, 상위 인스턴스 |
| GPU 메모리는 남는데 배치가 작음 | 배치 설정이 보수적 | 배치 확대(단, 학습률 동반 조정) |
| 다중 GPU 중 일부만 바쁨 | 부하 불균형·분산 설정 오류 | 분산 설정·샤드 분배 점검 |
| 학습 시작까지 오래 걸림 | File 모드 전체 복사, 무거운 의존성 설치 | FastFile/Pipe, 의존성을 이미지에 굽기 |

전형적 처방: GPU 활용률이 낮고 데이터 로딩이 병목이면 → DataLoader worker 수 증가, 데이터를 FSx for Lustre로 캐시, 전처리를 학습과 비동기로(프리페치).

> ⚠️ **함정**: "학습이 느리다 → 더 비싼 GPU 인스턴스로 바꾼다"는 보기는 대부분 오답이다. GPU가 이미 놀고 있다면 더 빠른 GPU를 붙여도 **노는 시간만 늘 뿐**이고 비용만 오른다. 인스턴스 업그레이드는 Profiler로 "GPU 연산 자체가 포화"임을 확인한 뒤의 선택이다.

> 💡 **관련 이론**: GPU 저활용의 본질은 "GPU가 노는 시간"이다. 학습 한 스텝은 데이터 로딩 → 전처리 → forward → backward → 옵티마이저로 이어지는데, GPU는 forward/backward만 한다. 나머지 단계가 느리면 GPU는 기다린다. 그래서 데이터 파이프라인(로딩·전처리)을 GPU 연산과 겹치게(overlap) 만드는 프리페치·비동기 로딩이 활용률을 끌어올린다. Profiler는 이 "기다리는 시간"을 가시화해 어느 단계를 고칠지 알려준다.

## 학습 모니터링: CloudWatch와의 관계

Debugger/Profiler는 학습 작업 내부의 정밀 분석이고, 전체 운영 모니터링은 CloudWatch가 맡는다.

| 도구 | 보여 주는 것 | 대표 용도 |
|------|-------------|----------|
| CloudWatch **Metrics** | CPU/GPU/메모리 활용률, 내가 정의한 학습 지표 | 시계열 추세 확인, 임계치 **알람** |
| CloudWatch **Logs** | 학습 스크립트의 stdout/stderr | 예외 스택 추적, 사후 원인 파악 |
| **EventBridge** 이벤트 | 학습 작업의 상태 변화(완료·실패 등) | 실패 시 알림·후속 파이프라인 자동 실행 |
| **TensorBoard** | 손실·정확도 곡선, 히스토그램 | 학습 곡선 시각적 비교 |

내가 찍는 로그를 CloudWatch 메트릭으로 올리려면 **정규식으로 뽑아내는 규칙**을 Estimator에 등록한다. 이래야 여러 학습 작업의 손실 곡선을 한 화면에서 비교하고 알람을 걸 수 있다.

```python
estimator = PyTorch(
    entry_point='train.py', role=role,
    instance_type='ml.g5.xlarge', instance_count=1,
    framework_version='2.0', py_version='py310',
    enable_sagemaker_metrics=True,
    metric_definitions=[                       # 로그 한 줄에서 숫자를 뽑는 규칙
        {'Name': 'train:loss',      'Regex': r'train_loss: ([0-9\.]+)'},
        {'Name': 'validation:loss', 'Regex': r'val_loss: ([0-9\.]+)'},
        {'Name': 'validation:acc',  'Regex': r'val_acc: ([0-9\.]+)'},
    ],
)
```

- 스크립트는 그냥 `print(f"val_loss: {loss:.4f}")` 처럼 찍기만 하면 된다.
- 여기서 만든 지표는 뒤에 배울 **하이퍼파라미터 튜닝의 목표 지표**로도 그대로 쓰인다.

```
[학습 작업]
   ├─ Debugger  → 텐서를 S3에 저장, 규칙 평가, 액션(중단/알림)
   ├─ Profiler  → 시스템·프레임워크 메트릭, 병목 리포트
   └─ CloudWatch → 메트릭/로그(전반 모니터링·알람)
```

> 📚 **사례**: 한 팀이 ml.p4d 인스턴스로 학습하는데 GPU 활용률이 25%에 머물러 학습이 예상보다 4배 느렸다. Profiler 리포트를 보니 GPU가 대부분 데이터 로딩을 기다리고 있었다. 원인은 매 배치를 S3에서 직접 읽고 CPU 전처리가 무거웠던 것. DataLoader worker를 늘리고 데이터를 FSx for Lustre에 캐시한 뒤 전처리를 프리페치로 겹치자 GPU 활용률이 85%로 올라 학습 시간이 1/3로 줄었다. 교훈: 느린 학습이 항상 GPU 성능 문제는 아니다 — Profiler로 진짜 병목을 먼저 본다.

## 비용을 자동으로 막는 고리

관측의 실질적 효용은 "사람이 보고 있지 않아도 낭비가 끊긴다"에 있다. 감지와 조치를 하나의 고리로 묶는다.

```text
학습 작업
   │  텐서 저장(S3)                     시스템 메트릭
   ├──────────────► Debugger 규칙        ├──────► Profiler 리포트
   │                     │                        │
   │              위반 감지                   병목 진단
   │                     │                        │
   │              ┌──────┴───────┐                └─► 파이프라인 개선(사람)
   │              │              │
   │        StopTraining      Email/SNS 알림
   │              │
   └──────────────┘  ← 남은 학습 시간만큼 비용 절감
```

- 규칙만 걸고 액션을 안 붙이면 이 고리가 **끊긴 채** 돌아간다 — 리포트는 쌓이는데 돈은 계속 나간다.
- 반대로 액션을 너무 공격적으로 걸면 정상적인 손실 정체 구간(플래토)에서도 학습이 끊긴다. 규칙 임계값과 최소 학습 스텝을 함께 본다.

## 어떻게 고르는가

```text
증상이 무엇인가?
 ├─ 손실 정체 / 그래디언트 소실·폭발 / 과적합
 │     → Debugger 내장 규칙  (+ StopTraining action으로 비용 차단)
 ├─ 느리다 / GPU가 논다 / 비용 대비 비효율
 │     → Profiler로 병목 진단 → 데이터 파이프라인·배치·정밀도 조정
 │        (GPU 연산 포화가 확인된 뒤에야 인스턴스 업그레이드)
 └─ 전체 추세·실패 알림·여러 작업 비교
       → CloudWatch 메트릭/로그/알람 (+ EventBridge로 후속 자동화)
```

다음 글에서는 학습이 끝난 모델이 정말 좋은지 판단하는 모델 평가 — 지표 선택과 과적합·교차검증 —를 본다.

## 📖 용어

- **텐서(tensor)** : 모델이 계산에 쓰는 숫자 덩어리. 가중치·그래디언트·손실 값이 모두 여기에 해당한다.
- **그래디언트** : 손실을 줄이려면 가중치를 어느 방향으로 얼마나 바꿔야 하는지 알려주는 값.
- **그래디언트 소실** : 그래디언트가 0에 가까워져 가중치가 사실상 갱신되지 않는 상태. 학습이 멈춘 것처럼 보인다.
- **그래디언트 폭발** : 반대로 값이 너무 커져 학습이 발산하는 상태. 손실이 `NaN`이 되기도 한다.
- **내장 규칙(built-in rule)** : SageMaker가 미리 만들어 둔 이상 감지 조건. 이름만 지정하면 바로 쓸 수 있다.
- **액션(action)** : 규칙이 위반됐을 때 실행할 조치. `StopTraining`(학습 중단), 이메일 알림 등.
- **프로파일링** : 프로그램이 시간을 어디에 쓰는지 측정하는 일. 여기서는 GPU·CPU·I/O가 각각 얼마나 바쁜지를 본다.
- **GPU 활용률** : GPU가 실제로 계산하고 있던 시간의 비율. 낮으면 대개 데이터를 기다리고 있다는 뜻이다.
- **프리페치(prefetch)** : 다음에 쓸 데이터를 미리 준비해 두어, GPU가 계산하는 동안 로딩이 함께 진행되게 하는 기법.
- **`metric_definitions`** : 학습 로그에서 정규식으로 숫자를 뽑아 CloudWatch 지표로 올리는 설정.

## 📝 연습 문제

**문제 1.** 학습 중 그래디언트가 0에 수렴(소실)하거나 발산(폭발)하는지를 자동으로 감지하려 한다. 가장 적합한 SageMaker 기능은?

A) SageMaker Profiler로 GPU 활용률을 본다  
B) SageMaker Debugger의 vanishing_gradient/exploding_tensor 내장 규칙  
C) CloudFront 캐시 히트율 확인  
D) Athena 쿼리  

**정답: B**  
해설: Debugger는 학습 중 텐서를 수집해 그래디언트 소실·폭발 같은 모델 내부 이상을 내장 규칙으로 감지한다. A는 자원 활용률을 보는 도구로 그래디언트 값을 보지 않고, C는 CDN 지표, D는 데이터 쿼리로 모두 학습 텐서 분석과 무관하다.

---

**문제 2.** 비싼 ml.p4d 인스턴스로 학습하는데 GPU 활용률이 25%로 낮아 비용 대비 비효율적이다. 원인을 진단하는 데 가장 적합한 것은?

A) SageMaker Debugger의 overfit 규칙  
B) SageMaker Profiler로 시스템 자원·병목(데이터 로딩, CPU)을 분석  
C) 모델 파라미터 수를 센다  
D) S3 버킷 정책을 점검한다  

**정답: B**  
해설: GPU 저활용은 자원 효율 문제이므로 Profiler가 데이터 로딩·CPU 병목 등 GPU가 노는 원인을 찾아준다. A는 모델 과적합을 보는 규칙으로 활용률과 무관하고, C·D는 GPU가 노는 원인 진단과 직접 관계가 없다.

---

**문제 3.** Debugger의 loss_not_decreasing 규칙이 위반됐을 때 학습을 자동으로 중단해 비용을 아끼고 싶다. 필요한 것은?

A) 규칙만 등록하면 자동으로 중단된다  
B) 규칙에 StopTraining 같은 action을 연결한다  
C) instance_count를 0으로 설정한다  
D) Profiler를 비활성화한다  

**정답: B**  
해설: Debugger 규칙은 기본적으로 감지·보고만 하므로 자동 중단하려면 StopTraining 등의 action을 명시적으로 연결해야 한다. A는 흔한 오해로 규칙만으로는 중단되지 않고, C는 학습을 아예 못 돌리며, D는 자원 프로파일링과 무관한 조치다.

---

**문제 4.** Profiler 리포트 결과 GPU가 대부분 데이터 로딩을 기다리며 노는 것으로 나타났다. 적절한 개선 조치로 가장 거리가 먼 것은?

A) DataLoader worker 수를 늘려 데이터 공급을 빠르게 한다  
B) 데이터를 FSx for Lustre에 캐시해 로딩을 빠르게 한다  
C) 전처리를 학습과 겹치도록 프리페치·비동기 로딩한다  
D) 학습률을 10배로 올린다  

**정답: D**  
해설: GPU가 데이터를 기다리는 로딩 병목은 데이터 공급 파이프라인을 빠르게(worker 증가, FSx 캐시, 프리페치) 해서 푼다. 학습률 변경은 수렴 동작에 영향을 줄 뿐 데이터 로딩 병목과 무관하므로 가장 거리가 멀다.

---

**문제 5.** 학습 작업의 전반적 메트릭(GPU/CPU 활용률, 손실)을 시계열로 모니터링하고 임계치 초과 시 알람을 받으려 한다. 적합한 서비스는?

A) Amazon CloudWatch (메트릭/알람)  
B) Amazon Macie  
C) AWS Config  
D) Amazon Comprehend  

**정답: A**  
해설: CloudWatch는 학습 작업 메트릭을 시계열로 수집하고 알람을 설정할 수 있어 전반 모니터링에 적합하다. B는 데이터 프라이버시 탐지, C는 리소스 구성 추적, D는 NLP 서비스로 학습 메트릭 모니터링·알람 용도가 아니다.

---
