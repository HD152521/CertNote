# Day 3 - 디버깅과 프로파일링: SageMaker Debugger와 Profiler

학습 작업이 돌긴 도는데 손실이 줄지 않거나, GPU를 비싸게 빌렸는데 활용률이 30%밖에 안 된다면, 무슨 일이 벌어지는지 학습 내부를 들여다봐야 한다. SageMaker Debugger와 Profiler는 학습 중 텐서와 시스템 자원을 실시간으로 수집·분석해 "왜 안 되는지"와 "어디서 느린지"를 알려준다.

MLA-C01 시험에서 이 주제는 "그래디언트 소실/폭발을 자동 감지", "GPU 활용률이 낮은 원인을 찾는다", "학습이 발산할 때 자동으로 멈춘다" 같은 상황으로 등장한다. 오늘은 Debugger(모델 내부)와 Profiler(시스템 자원) 두 축을 구분한다.

## Debugger와 Profiler의 역할 분리

먼저 둘의 관심사를 명확히 가른다.

| 구분 | SageMaker Debugger | SageMaker Profiler |
|------|-------------------|-------------------|
| 보는 것 | 모델 내부 텐서(그래디언트, 가중치, 손실, 활성값) | 시스템 자원(CPU/GPU 활용률, 메모리, I/O) |
| 답하는 질문 | "모델이 왜 잘못 학습되나?" | "왜 느린가/비효율적인가?" |
| 대표 감지 | 그래디언트 소실/폭발, 과적합, 가중치 미갱신 | GPU 저활용, 데이터 로딩 병목, CPU 병목 |
| 동작 방식 | 텐서를 주기적으로 S3에 저장 후 규칙(rule) 평가 | 시스템·프레임워크 메트릭 수집·분석 |
| 자동 조치 | 규칙 위반 시 알림/조기 종료(action) | 병목 리포트·권고 |

핵심 직관: **Debugger는 "모델이 잘못됐다"를, Profiler는 "자원이 낭비된다"를 본다.** 시험에서 "그래디언트가 0이 됐다/폭발한다" 같은 학습 품질 증상은 Debugger, "GPU가 놀고 있다/데이터 로딩이 느리다" 같은 자원 증상은 Profiler다.

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

자주 나오는 내장 규칙:

- `vanishing_gradient` / `exploding_tensor`: 그래디언트 소실·폭발
- `loss_not_decreasing`: 손실이 일정 스텝 동안 안 줄어듦
- `overfit` / `overtraining`: 검증 손실 악화(과적합 신호)
- `dead_relu` / `weight_update_ratio`: 죽은 뉴런, 가중치 갱신 비율 이상

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

Profiler가 흔히 잡아내는 병목:

- **낮은 GPU 활용률**: GPU가 데이터를 기다리며 논다 → 데이터 로딩/전처리 병목 의심
- **데이터 로딩 병목**: DataLoader worker 부족, 느린 스토리지(S3 직접 읽기 등)
- **CPU 병목**: 전처리가 무거워 GPU에 데이터를 못 따라 줌
- **GPU 메모리 부족·불균형**: 배치 크기 조정 필요

전형적 처방: GPU 활용률이 낮고 데이터 로딩이 병목이면 → DataLoader worker 수 증가, 데이터를 FSx for Lustre로 캐시, 전처리를 학습과 비동기로(프리페치).

> 💡 **관련 이론**: GPU 저활용의 본질은 "GPU가 노는 시간"이다. 학습 한 스텝은 데이터 로딩 → 전처리 → forward → backward → 옵티마이저로 이어지는데, GPU는 forward/backward만 한다. 나머지 단계가 느리면 GPU는 기다린다. 그래서 데이터 파이프라인(로딩·전처리)을 GPU 연산과 겹치게(overlap) 만드는 프리페치·비동기 로딩이 활용률을 끌어올린다. Profiler는 이 "기다리는 시간"을 가시화해 어느 단계를 고칠지 알려준다.

## 학습 모니터링: CloudWatch와의 관계

Debugger/Profiler는 학습 작업 내부의 정밀 분석이고, 전체 운영 모니터링은 CloudWatch가 맡는다.

- **CloudWatch Metrics**: 학습 작업의 CPU/GPU/메모리 활용률, 손실 같은 메트릭을 시계열로. 알람 설정 가능.
- **CloudWatch Logs**: 학습 스크립트의 stdout/stderr 로그.
- **TensorBoard**: SageMaker가 텐서를 TensorBoard로도 시각화 지원.

```
[학습 작업]
   ├─ Debugger  → 텐서를 S3에 저장, 규칙 평가, 액션(중단/알림)
   ├─ Profiler  → 시스템·프레임워크 메트릭, 병목 리포트
   └─ CloudWatch → 메트릭/로그(전반 모니터링·알람)
```

> 📚 **사례**: 한 팀이 ml.p4d 인스턴스로 학습하는데 GPU 활용률이 25%에 머물러 학습이 예상보다 4배 느렸다. Profiler 리포트를 보니 GPU가 대부분 데이터 로딩을 기다리고 있었다. 원인은 매 배치를 S3에서 직접 읽고 CPU 전처리가 무거웠던 것. DataLoader worker를 늘리고 데이터를 FSx for Lustre에 캐시한 뒤 전처리를 프리페치로 겹치자 GPU 활용률이 85%로 올라 학습 시간이 1/3로 줄었다. 교훈: 느린 학습이 항상 GPU 성능 문제는 아니다 — Profiler로 진짜 병목을 먼저 본다.

## 어떻게 고르는가

판단 흐름: ① 증상이 "모델이 학습이 안 됨"(손실 정체, 그래디언트 소실/폭발, 과적합)이면 → **Debugger** + 필요 시 StopTraining 액션. ② 증상이 "느리다/GPU가 논다/비싸다"이면 → **Profiler**로 병목 진단 후 데이터 파이프라인·배치 조정. ③ 전반적 메트릭·로그·알람은 **CloudWatch**. 자동 중단으로 비용을 막고 싶으면 Debugger 규칙에 액션을 붙인다.

## 정리하며

학습 내부 관측은 두 도구로 나뉜다. **Debugger**는 모델 내부 텐서(그래디언트·가중치·손실)를 저장하고 내장 규칙(vanishing_gradient, exploding_tensor, loss_not_decreasing, overfit 등)으로 학습 품질 문제를 감지하며, 액션을 붙이면 발산 시 자동 중단·알림으로 비용을 막는다. **Profiler**는 시스템·프레임워크 자원을 수집해 GPU 저활용·데이터 로딩·CPU 병목을 찾아 비용·속도를 최적화한다. 전반 모니터링은 CloudWatch. 시험에서 "모델 품질 이상"은 Debugger, "자원 비효율"은 Profiler라는 매핑이 핵심이다.

다음 글에서는 학습이 끝난 모델이 정말 좋은지 판단하는 모델 평가 — 지표 선택과 과적합·교차검증 —를 본다.

---

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
