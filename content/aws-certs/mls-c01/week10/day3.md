# Day 3 - 추론 최적화: Neo·Elastic Inference·Inferentia·추론 파이프라인

엔드포인트가 동작하는 것과 엔드포인트가 효율적인 것은 다르다. 추론 비용은 학습 비용과 달리 모델이 살아 있는 내내 발생하므로, 장기적으로는 추론 최적화가 총비용을 좌우한다. SageMaker는 모델을 더 빠르게(지연↓), 더 싸게(비용↓), 더 작게(자원↓) 만드는 여러 도구를 제공한다. 오늘은 SageMaker Neo, Elastic Inference, AWS Inferentia, 그리고 처리량을 높이는 추론 파이프라인/배치 전략을 정리한다.

## SageMaker Neo: 한 번 학습, 어디서나 최적 실행

Neo는 학습된 모델을 특정 하드웨어(인스턴스/엣지 디바이스)에 맞게 컴파일·최적화한다. 프레임워크 모델을 분석해 연산 그래프를 대상 하드웨어에 맞춰 재구성하고, 의존성을 제거한 경량 런타임으로 변환한다.

```python
compiled = model.compile(
    target_instance_family="ml_c5",   # 또는 ml_inf1, 엣지: jetson_nano 등
    input_shape={"data": [1, 3, 224, 224]},
    output_path="s3://my-bucket/neo-output/",
    framework="pytorch",
)
```

- **효과**: 정확도는 유지한 채 추론 속도를 최대 수 배 향상, 메모리 사용량 감소
- **대상**: 클라우드 인스턴스부터 ARM 기반 엣지 디바이스(IoT Greengrass와 연계)까지
- **언어**: TensorFlow, PyTorch, MXNet, XGBoost, ONNX 등 주요 프레임워크 지원

> 💡 **관련 이론**: Neo의 핵심 가치는 "학습은 익숙한 프레임워크로, 배포는 하드웨어 최적화된 형태로"이다. 양자화/프루닝 같은 모델 자체 변경 없이 컴파일러 단계에서 최적화하므로 정확도 손실 없이 속도를 얻는다. "엣지 디바이스 배포 + 지연 감소"라는 키워드가 보이면 Neo를 떠올린다.

## Elastic Inference (EI): GPU 일부만 붙이기

전체 GPU 인스턴스는 비싸지만, 많은 추론 워크로드는 GPU를 100% 쓰지 않는다. Elastic Inference는 CPU 인스턴스에 필요한 만큼의 GPU 가속(accelerator)만 부착해 비용을 낮춘다.

```python
predictor = model.deploy(
    initial_instance_count=1,
    instance_type="ml.m5.large",          # 저렴한 CPU 인스턴스
    accelerator_type="ml.eia2.medium",    # 부분 GPU 가속 부착
)
```

- **언제**: 딥러닝 추론인데 풀 GPU 인스턴스(ml.p3 등)는 과하고 CPU만으로는 느릴 때
- **효과**: 풀 GPU 대비 추론 비용을 크게 절감
- **주의**: AWS는 신규 워크로드에 대해 EI보다 Inferentia/Neo를 권장하는 방향으로 이동했다. 시험에서는 "CPU 인스턴스에 부분 GPU 가속을 붙여 비용 절감"이라는 개념으로 등장한다.

## AWS Inferentia (Inf1/Inf2): 추론 전용 칩

Inferentia는 AWS가 추론 전용으로 설계한 커스텀 가속기다. Inf1/Inf2 인스턴스에 탑재되며, 동일 처리량 기준 GPU 대비 더 낮은 비용과 지연을 목표로 한다.

```text
GPU 인스턴스(p3)      : 학습/추론 범용, 비쌈
Inferentia(Inf1/Inf2) : 추론 전용, 높은 처리량/비용 효율. AWS Neuron SDK로 컴파일
Trainium(Trn1)        : 학습 전용 커스텀 칩(추론 아님 — 비교 대상으로 자주 등장)
```

- **워크플로**: 모델을 Neuron SDK(또는 Neo)로 Inferentia용으로 컴파일 → Inf 인스턴스에 배포
- **언제**: 대규모·고처리량 추론에서 GPU보다 비용/와트 효율을 높이고 싶을 때
- **혼동 주의**: Trainium은 학습용, Inferentia는 추론용이다. 시험에서 자주 짝지어 나온다.

## 모델 자체 최적화: 양자화·프루닝·증류

하드웨어를 바꾸기 전에 모델을 작게 만들 수도 있다.

```text
양자화(Quantization) : FP32 → INT8 등 정밀도 축소. 모델 크기↓, 속도↑, 약간의 정확도 손실 가능
프루닝(Pruning)      : 기여도 낮은 가중치/뉴런 제거로 경량화
지식 증류(Distillation): 큰 teacher 모델의 지식을 작은 student 모델로 이전
```

이 기법들은 Neo 컴파일과 결합해 더 작고 빠른 모델을 만든다. 엣지 배포처럼 자원이 극히 제한된 환경에서 특히 중요하다.

## 추론 파이프라인과 처리량 최적화

어제 본 추론 파이프라인은 정합성뿐 아니라 처리량 관점에서도 의미가 있다.

```text
추론 파이프라인  : 전처리·예측·후처리를 한 컨테이너 체인으로 묶어 네트워크 왕복 제거
배치 추론        : 여러 요청을 묶어 한 번에 처리(throughput↑, per-request latency 일부 희생)
모델 캐싱(MME)   : 자주 쓰는 모델을 메모리에 상주시켜 로딩 지연 제거
```

지연(latency)을 줄이려면 Neo/Inferentia/EI와 모델 경량화를, 처리량(throughput)을 늘리려면 배치·파이프라인·적절한 인스턴스 수평 확장을 조합한다.

> 💡 **관련 이론**: 시험에서 "지연을 줄여라"와 "비용을 줄여라"와 "처리량을 높여라"는 처방이 다르다. 지연↓: Neo 컴파일, 더 빠른 인스턴스. 비용↓: Elastic Inference, Inferentia, Serverless. 처리량↑: 배치 추론, 오토스케일링 증설, Inferentia. 요구 키워드를 정확히 매칭하는 것이 득점 포인트다.

## 인스턴스 선택 요약

```text
ml.m5 / ml.c5      : CPU. 가벼운 추론, Neo 컴파일과 궁합 좋음
ml.g4dn / ml.g5    : GPU. 딥러닝 추론에 보편적
ml.p3 / ml.p4      : 고성능 GPU. 주로 학습, 무거운 추론
ml.inf1 / ml.inf2  : Inferentia. 고처리량·비용 효율 추론
+ Elastic Inference: CPU 인스턴스에 부분 GPU 가속 부착
```

## 마무리

추론 최적화는 "모델을 바꾸는 법(양자화·프루닝·증류·Neo 컴파일)"과 "하드웨어를 바꾸는 법(Inferentia, Elastic Inference, 인스턴스 선택)", 그리고 "구조를 바꾸는 법(추론 파이프라인, 배치)"으로 나뉜다. 시험에서는 비용/지연/처리량 중 무엇을 요구하는지를 먼저 읽고 대응 도구를 매칭하면 된다. 내일은 최적화된 모델을 안전하게 내보내는 방법 — A/B, 블루/그린, 카나리, 섀도, 롤백 — 을 다룬다.

## 📝 연습 문제

**문제 1.** 학습된 PyTorch 모델을 ARM 기반 엣지 디바이스에 배포하면서 추론 지연을 줄이고 메모리 사용을 낮추되 정확도는 유지하고 싶다. 가장 적합한 도구는?

A) Elastic Inference  
B) SageMaker Neo로 대상 하드웨어용 컴파일  
C) Batch Transform  
D) 멀티모델 엔드포인트  

**정답: B**  
해설: Neo는 모델을 대상 하드웨어(엣지 포함)에 맞게 컴파일해 정확도 손실 없이 속도·메모리를 개선한다. Elastic Inference(A)는 클라우드 CPU 인스턴스에 GPU 가속을 붙이는 것이고, Batch(C)는 오프라인 일괄 처리, MME(D)는 다수 모델 호스팅 기법이다.

---

**문제 2.** 대규모 딥러닝 추론 워크로드에서 GPU 인스턴스 대비 더 높은 처리량과 비용 효율을 얻기 위해 AWS가 설계한 추론 전용 칩이 탑재된 인스턴스는?

A) ml.p4 (NVIDIA GPU)  
B) ml.trn1 (Trainium)  
C) ml.inf1/ml.inf2 (Inferentia)  
D) ml.m5 (CPU)  

**정답: C**  
해설: Inferentia는 추론 전용 커스텀 칩으로 Inf1/Inf2 인스턴스에 탑재되어 고처리량·비용 효율을 제공한다. p4(A)는 범용 GPU, Trainium(B)은 학습 전용 칩, m5(D)는 일반 CPU다.

---

**문제 3.** 딥러닝 추론을 하는데 풀 GPU 인스턴스는 사용률이 낮아 비용이 과하고, CPU만으로는 느리다. 별도 칩 컴파일 없이 비용을 낮추는 전통적 방법은?

A) Elastic Inference 가속기를 CPU 인스턴스에 부착  
B) 모든 모델을 INT8로 양자화  
C) Batch Transform으로 전환  
D) Trainium 인스턴스로 이전  

**정답: A**  
해설: Elastic Inference는 저렴한 CPU 인스턴스에 필요한 만큼의 부분 GPU 가속만 붙여, 풀 GPU 대비 비용을 절감하는 방식이다. 양자화(B)는 모델 변경이 필요하고, Batch(C)는 온라인 추론 시나리오가 아니며, Trainium(D)은 학습용이다.

---

**문제 4.** 다음 중 지연(latency) 감소가 아니라 처리량(throughput) 향상을 주목적으로 하는 기법은?

A) Neo 컴파일로 모델 경량화  
B) 더 빠른 단일 인스턴스로 업그레이드  
C) 모델 양자화로 연산량 축소  
D) 여러 추론 요청을 묶는 배치 추론  

**정답: D**  
해설: 배치 추론은 여러 요청을 묶어 한 번에 처리해 단위 시간당 처리량을 높이며, 개별 요청 지연은 일부 희생될 수 있다. Neo 컴파일(A)·빠른 인스턴스(B)·양자화(C)는 주로 개별 요청 지연을 줄이는 데 초점이 있다.

---

**문제 5.** Trainium과 Inferentia를 올바르게 구분한 것은?

A) Trainium은 학습 전용, Inferentia는 추론 전용 칩이다  
B) 둘 다 학습 전용 칩이다  
C) Trainium은 추론 전용, Inferentia는 학습 전용 칩이다  
D) 둘 다 추론 전용이며 차이가 없다  

**정답: A**  
해설: AWS의 커스텀 실리콘에서 Trainium(Trn1)은 학습 전용, Inferentia(Inf1/Inf2)는 추론 전용으로 설계되었다. 둘을 뒤바꾸거나(C) 동일시하는(B, D) 보기는 틀리다.

---
