# Day 4 - 비지도·이상탐지: RCF, PCA, IP Insights, 토픽 모델(LDA/NTM)

오늘은 레이블 없이 구조·이상·차원·주제를 다루는 비지도 빌트인을 정리한다. 시험은 "레이블이 없다 / 드문 사건 / 차원이 너무 크다 / 주제를 발견" 같은 단서로 이 알고리즘들을 가리킨다. 각각의 입력·핵심 파라미터·헷갈리는 짝을 구분하는 것이 요점이다.

## Random Cut Forest (RCF) — 이상 탐지

데이터를 무작위로 잘라 트리를 만들고, 격리하기 쉬운(=드문) 포인트에 높은 **anomaly score**를 매긴다.

- **용도**: 이상 탐지(비지도). 시계열의 급변, 스파이크, 드문 패턴.
- **입력**: CSV, RecordIO-protobuf.
- **출력**: 각 레코드의 이상 점수(높을수록 이상).
- **스트리밍**: Kinesis Data Analytics에 `RANDOM_CUT_FOREST` 함수로 내장 → 실시간 이상 탐지.

```text
주요 하이퍼파라미터:
  num_trees          트리 수 (많을수록 안정)
  num_samples_per_tree   트리당 샘플 수
  feature_dim        피처 차원
```

> 💡 **관련 이론**: RCF의 직관은 "이상치는 정상보다 트리에서 빨리 격리된다"이다. 정상 포인트는 빽빽한 영역에 있어 여러 번 잘라야 분리되지만, 드문 포인트는 몇 번의 무작위 절단으로 홀로 남는다. 이 격리 깊이를 점수로 환산한다. 레이블이 필요 없고 새로운 형태의 이상에도 반응하므로, Day1에서 본 "레이블이 거의 없는 / 변하는 이상" 문제의 대표 해법이다. 실시간이면 Kinesis Data Analytics의 RCF SQL 함수를 떠올리자.

## PCA — 차원 축소

상관된 많은 피처를 분산을 최대한 보존하는 소수의 **주성분**으로 압축한다.

- **용도**: 차원 축소(비지도). 시각화, 다운스트림 모델 입력 경량화, 다중공선성 완화.
- **입력**: RecordIO-protobuf, CSV.
- **모드**: `regular`(중간 차원), `randomized`(매우 큰 차원에서 근사·고속).

```text
주요 하이퍼파라미터:
  num_components     유지할 주성분 수
  algorithm_mode     regular | randomized
  subtract_mean      평균 제거(센터링)
```

- 스케일에 민감하므로 보통 **스케일링/센터링 후** 적용.
- PCA는 비지도라 레이블을 쓰지 않는다 — 레이블을 활용한 차원 축소가 필요하면 LDA(선형판별분석)지만, 여기서의 SageMaker LDA는 토픽 모델(Latent Dirichlet Allocation)이라는 점에 주의(이름 충돌).

## IP Insights — 엔티티-IP 이상 탐지

(사용자/계정 같은) **엔티티와 IPv4 주소의 연관**을 학습해, 평소와 다른 조합을 이상으로 탐지한다.

- **용도**: 비정상 로그인, 계정 탈취, 봇 탐지(비지도).
- **입력**: CSV — `(엔티티, IP)` 쌍.
- **출력**: 해당 엔티티가 그 IP를 쓸 가능성에 대한 점수(낮으면 이상).
- **기법**: 신경망 임베딩으로 엔티티-IP 패턴 학습, 무작위 음성 샘플로 대조.

```text
주요 하이퍼파라미터:
  num_entity_vectors   엔티티 임베딩 해시 공간 크기
  vector_dim           임베딩 차원
  num_ip_encoder_layers
  random_negative_sampling_rate
```

RCF vs IP Insights: 둘 다 이상 탐지지만, **RCF는 일반 수치 데이터의 이상**, **IP Insights는 "엔티티-IP" 관계 특화**다. 로그인 IP 이상이면 IP Insights, 일반 메트릭 스파이크면 RCF.

## 토픽 모델: LDA와 NTM

레이블 없이 문서 집합에서 **잠재 주제**와 주제별 단어 분포를 찾는다. 둘 다 토픽 모델이지만 구현이 다르다.

| 항목 | LDA (Latent Dirichlet Allocation) | NTM (Neural Topic Model) |
|------|------|------|
| 기반 | 확률적 생성 모델 | 신경망(오토인코더) |
| 학습 | CPU 단일, 비교적 단순 | GPU 활용, 대규모·복잡 |
| 입력 | BoW(문서-단어 카운트) | BoW |
| 특징 | 해석 쉬움, 작은~중간 데이터 | 더 풍부한 표현, 대규모 |

- 공통 입력: **Bag-of-Words**(어휘 인덱스별 카운트), RecordIO-protobuf 또는 CSV.
- 사용자는 주제 수(LDA: `num_topics`, NTM: `num_topics`)를 지정.

> 💡 **관련 이론**: 토픽 모델은 "각 문서는 여러 주제의 혼합이고, 각 주제는 단어들의 분포다"라는 가정에서 출발한다. LDA는 이를 베이지안 확률 모델로 추정하고, NTM은 신경망으로 같은 목표를 근사한다. 둘 다 비지도이므로 정답 주제 레이블이 없고, 주제 수를 하이퍼파라미터로 준다. 시험에서 "둘 중 무엇?"을 물으면 데이터 규모·GPU 활용·해석성으로 가른다(대규모/GPU=NTM, 단순/해석=LDA). 그리고 이 LDA(토픽 모델)는 차원 축소용 선형판별분석(LDA)과 이름만 같을 뿐 다른 것임을 반드시 구분하라.

## 비지도 빌트인 매핑 요약

| 알고리즘 | 과제 | 핵심 단서 | 입력 |
|------|------|------|------|
| Random Cut Forest | 이상 탐지(일반 수치) | "드문 사건 / 스파이크 / 실시간" | CSV, protobuf |
| IP Insights | 이상 탐지(엔티티-IP) | "비정상 로그인 / 계정 IP" | (엔티티, IP) CSV |
| PCA | 차원 축소 | "피처가 너무 많다 / 압축 / 시각화" | protobuf, CSV |
| LDA | 토픽 모델(확률) | "주제 발견 / 작은 데이터 / 해석" | BoW |
| NTM | 토픽 모델(신경망) | "주제 발견 / 대규모 / GPU" | BoW |

## 시험 팁

- "레이블 없는 드문 이상 / 실시간 스트림" → RCF(실시간은 Kinesis Data Analytics RCF).
- "사용자/계정이 평소와 다른 IP" → IP Insights.
- "피처가 수백~수천, 모델 입력을 줄이자" → PCA(매우 크면 randomized 모드).
- "문서에서 주제 발견" → LDA/NTM, 규모·GPU·해석성으로 둘 중 선택.
- LDA의 이름 함정: 토픽 모델 LDA ≠ 차원축소 선형판별분석 LDA.

## 정리하며

오늘은 비지도·이상탐지 빌트인을 정리했다. RCF(일반 이상), IP Insights(엔티티-IP 이상), PCA(차원 축소), LDA/NTM(토픽 모델)이 각각의 정답 신호다. 레이블이 없을 때 "무엇을 발견·탐지·압축하려는가"를 먼저 묻는 것이 핵심이다. 내일은 Week 6 전체를 묶어 알고리즘 선택 의사결정을 종합 복습한다.

---

## 📝 연습 문제

**문제 1.** 서버 메트릭 스트림에서 평소와 다른 급변(스파이크)을 실시간으로, 레이블 없이 탐지하려 한다. 가장 적합한 조합은?

A) PCA로 차원 축소 후 K-Means  
B) Kinesis Data Analytics의 Random Cut Forest  
C) IP Insights  
D) BlazingText supervised  

**정답: B**  
해설: 레이블 없는 수치 스트림의 실시간 이상 탐지는 Kinesis Data Analytics에 내장된 RANDOM_CUT_FOREST 함수가 정석이다. PCA+K-Means(A)는 이상탐지 전용이 아니고, IP Insights(C)는 엔티티-IP 관계 특화, BlazingText(D)는 텍스트 분류용이다.

---

**문제 2.** 한 웹 서비스가 "특정 사용자 계정이 평소와 전혀 다른 IP 주소에서 로그인"하는 비정상을 탐지하려 한다. 가장 특화된 빌트인은?

A) Random Cut Forest  
B) PCA  
C) IP Insights  
D) LDA  

**정답: C**  
해설: IP Insights는 엔티티(사용자/계정)와 IPv4 주소의 연관 패턴을 학습해 평소와 다른 조합을 탐지하도록 특화돼 있다. RCF(A)는 일반 수치 이상, PCA(B)는 차원 축소, LDA(D)는 토픽 모델이다.

---

**문제 3.** 상관관계가 높은 500개의 수치 피처를 분산을 최대한 보존하며 30개 정도로 압축해 다운스트림 모델의 입력으로 쓰려 한다. 가장 적합한 빌트인은?

A) PCA  
B) Factorization Machines  
C) DeepAR  
D) IP Insights  

**정답: A**  
해설: 상관된 다수 피처를 분산 보존 소수 주성분으로 압축하는 것은 PCA의 정의 그대로다(매우 큰 차원이면 randomized 모드). FM(B)은 희소 추천, DeepAR(C)는 시계열, IP Insights(D)는 이상 탐지용이다.

---

**문제 4.** 라벨이 없는 대규모 문서 코퍼스에서 잠재 주제를 발견하려 한다. 데이터가 매우 크고 GPU로 학습을 가속하고 싶다. LDA와 NTM 중 더 적합한 것과 그 이유로 옳은 것은?

A) LDA — 신경망 기반이라 GPU에서 빠르다  
B) LDA — 항상 NTM보다 정확하다  
C) NTM — 확률적 생성 모델이라 항상 해석이 더 쉽다  
D) NTM — 신경망 기반으로 대규모·GPU 활용에 유리하다  

**정답: D**  
해설: NTM은 신경망(오토인코더) 기반 토픽 모델로 대규모 데이터와 GPU 활용에 유리하다. LDA가 신경망 기반(A)이라는 설명은 틀렸고(LDA는 확률 모델), "항상 더 정확/해석 쉽다"(B, C)는 단정도 근거가 없다.

---

**문제 5.** SageMaker에서 "LDA"라는 이름과 관련해 가장 정확한 설명은?

A) SageMaker 빌트인 LDA는 차원 축소용 선형판별분석이다  
B) LDA와 NTM은 모두 지도학습 분류 알고리즘이다  
C) LDA는 이미지 분류 전용이다  
D) SageMaker 빌트인 LDA는 토픽 모델(Latent Dirichlet Allocation)이며, 차원축소의 선형판별분석과 이름만 같다  

**정답: D**  
해설: SageMaker의 빌트인 LDA는 토픽 모델(Latent Dirichlet Allocation)이며, 차원 축소에 쓰는 선형판별분석(Linear Discriminant Analysis)과는 약어만 같고 다른 것이다. 따라서 A는 혼동, LDA/NTM은 비지도 토픽 모델이므로 지도 분류(B)·이미지 전용(C)도 틀렸다.

---
