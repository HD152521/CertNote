# Day 5 - Week 4 종합: 모델 개발 1 — SageMaker 학습 복습

## 📌 핵심 정리

- **Training Job**은 인스턴스를 띄워 학습하고 `model.tar.gz`를 S3에 저장한 뒤 자동 종료한다. 설계도는 **Estimator**, 내 스크립트는 `entry_point`.
- **알고리즘 매핑**: 테이블=XGBoost, 고차원 희소=Linear Learner, 이상 탐지=RCF, 시계열=DeepAR, 추천 희소=Factorization Machines, 텍스트=BlazingText.
- **입력**: 대용량 반복 읽기 I/O 병목은 **FSx for Lustre**, 대용량 스트리밍 포맷은 **RecordIO-protobuf**, XGBoost CSV는 첫 열이 라벨·헤더 없음.
- **AMT**: 기본은 Bayesian, 긴 딥러닝은 Hyperband, 비용 절감은 조기 종료, 결과 재사용은 워밍 스타트.
- **비용**: 단가 낮추기(Spot+체크포인트)와 작업량 줄이기(전이학습/JumpStart)는 **축이 달라 함께 적용**할 수 있다.

## 한 장으로 보는 이번 주

이번 주는 "데이터를 모델로 바꾸는" 학습 단계 전체를 다뤘다. 네 글을 하나의 흐름으로 꿰어 시험 직전에 빠르게 훑을 수 있게 정리한다.

```
[데이터(S3/FSx)]
      │ 입력 채널 (File / Pipe / Fast File)
      ▼
[Training Job]  ← Estimator(컨테이너·역할·인스턴스·하이퍼파라미터)
      │           ├─ 빌트인 알고리즘 (XGBoost, Linear Learner, ...)
      │           ├─ 프레임워크 Estimator (entry_point=내 스크립트)
      │           └─ JumpStart (사전학습 모델 미세조정)
      │ 인스턴스: CPU(전통ML) / GPU(딥러닝) / 분산(instance_count↑)
      │ 비용절감: Managed Spot + 체크포인트
      ▼
[모델 아티팩트 (model.tar.gz, S3)]
      ▲
[AMT 튜닝] ── 여러 Training Job 자동 실행 (Bayesian / 조기종료 / 워밍스타트)
```

이 그림 하나에 이번 주가 다 들어 있다. 데이터가 입력 채널로 들어가 Training Job(Estimator로 정의)에서 학습되고, 모델이 S3에 저장되며, 그 위에 AMT가 여러 학습을 띄워 최적 하이퍼파라미터를 찾는 구조다.

## Day별 핵심 한눈에

**Day 1 — Training Job**

- 학습의 기본 단위. 인스턴스를 띄워 컨테이너로 학습하고 모델을 S3에 저장한 뒤 인스턴스를 자동 종료.
- **Estimator**가 설계도. 내 스크립트면 프레임워크 Estimator의 `entry_point`.
- 입력 채널은 `fit()`으로 전달. 입력 모드는 File(전체 다운로드)·Pipe(스트리밍)·Fast File.
- 대용량 반복 읽기 I/O 병목은 **FSx for Lustre**.
- 인스턴스는 전통 ML=CPU, 딥러닝=GPU, 한 대로 부족하면 분산(`instance_count`↑).
- **Managed Spot Training**은 최대 90% 절감하되 중단 가능 → **체크포인트** 필수, `max_wait >= max_run`.

**Day 2 — 빌트인 알고리즘**

- 코드 없이 AWS가 최적화한 알고리즘 컨테이너를 사용.
- 유형 매핑이 핵심 — 테이블 분류/회귀=**XGBoost**, 대규모 선형/희소=**Linear Learner**, 이상 탐지=**RCF**, 시계열=**DeepAR**, 추천 희소=**Factorization Machines**, 고속 텍스트=**BlazingText**.
- 이미지는 분류(라벨 하나)/탐지(위치+클래스)/분할(픽셀 단위) 3종.
- 입력 포맷은 대용량 스트리밍=**RecordIO-protobuf**, 소량=CSV.
- XGBoost CSV는 **첫 열이 라벨·헤더 없음**.

**Day 3 — AMT(하이퍼파라미터 튜닝)**

- 목표 지표 + 범위 + 전략으로 여러 학습 작업을 자동 실행해 최적 조합을 찾는다.
- 전략은 기본 **Bayesian**(이전 결과 반영, 순차 의존), 독립 병렬=Random, 전수=Grid(범주형), 긴 딥러닝 조기 중단=**Hyperband**.
- **조기 종료**(`early_stopping_type='Auto'`)로 가망 없는 학습을 중단해 비용 절감.
- **워밍 스타트**로 이전 튜닝 결과 재사용(동일=IDENTICAL_DATA_AND_ALGORITHM, 데이터 변경=TRANSFER_LEARNING).

**Day 4 — JumpStart·전이학습·비용**

- **JumpStart**는 사전학습 모델 허브. 그대로 `deploy` 또는 `fit → deploy`(미세조정).
- **전이학습**은 적은 데이터·비용·시간으로 높은 성능 → "라벨이 적은데 정확한 분류기"의 답.
- 비용은 **단가 낮추기**(Spot, 적절한 인스턴스, 입력 모드/RecordIO)와 **작업량 줄이기**(전이학습, 조기 종료)로 구분.
- Spot과 전이학습은 축이 달라 결합 가능. `max_run`·노트북 유휴 자동 종료로 방치 과금을 막는다.

## 지문을 읽고 답을 좁히는 순서

시험 지문은 대개 "무엇을 아끼고 싶은가" 또는 "무엇이 부족한가"를 먼저 말한다. 그 단서부터 잡으면 선택지가 빠르게 정리된다.

```text
지문에서 가장 강조된 제약은?
├─ 비용
│   ├─ 중단돼도 재개만 되면 됨      → Spot + 체크포인트
│   ├─ 튜닝 비용이 큼               → 조기 종료(early stopping)
│   └─ 학습량 자체를 줄이고 싶음    → 전이학습 / JumpStart
├─ 시간·속도
│   ├─ 학습 시작까지 대기가 김      → Pipe / Fast File 모드
│   ├─ 매 epoch I/O 병목            → FSx for Lustre
│   └─ 한 대로는 너무 느림          → 분산 학습(instance_count↑)
├─ 데이터
│   ├─ 라벨이 적음                  → 전이학습(미세조정)
│   ├─ 고차원 희소                  → Linear Learner
│   └─ 대용량 스트리밍              → RecordIO-protobuf
└─ 성능·정확도
    ├─ 하이퍼파라미터가 안 맞음      → AMT(Bayesian)
    ├─ 학습 1회가 수 시간            → Hyperband
    └─ 이전 튜닝을 이어서            → 워밍 스타트
```

> 💡 **관련 이론**: 이번 주를 관통하는 큰 그림은 "필요한 만큼만, 가장 효율적으로 계산한다"이다. 학습은 비싼 GPU 시간을 쓰므로, ① 애초에 덜 계산하고(전이학습), ② 똑똑하게 탐색하며(베이지안+조기종료), ③ 싼 자원을 쓰고(Spot), ④ 끝나면 자동으로 끈다(자동 종료). 모델 개발의 ML 지식과 클라우드의 비용 효율 사고가 한데 묶이는 지점이 바로 학습 단계다.

## 자주 헷갈리는 경계 정리

시험에서 헷갈리기 쉬운 선택지들을 경계로 정리한다.

| 상황 | 정답 | 헷갈리는 오답 |
|------|------|----------------|
| 대용량 데이터 반복 읽기 I/O 병목 | FSx for Lustre | S3 File 모드 |
| 대용량 스트리밍 입력 포맷 | RecordIO-protobuf | CSV |
| 비용 절감 + 중단 후 재개 | Spot + 체크포인트 | Spot만 |
| 효율적 하이퍼파라미터 탐색 | Bayesian | Grid(전수) |
| 긴 딥러닝 튜닝 조기 중단 | Hyperband | Random |
| 이전 튜닝 결과 재사용 | 워밍 스타트 | 새 튜닝 |
| 라벨 데이터 적은 분류기 | 전이학습 | 밑바닥 학습 |
| 검증 모델 빠른 배포 | JumpStart | 커스텀 컨테이너 |
| 내 PyTorch 스크립트 학습 | 프레임워크 Estimator | 빌트인 컨테이너 |
| 정형 테이블 분류 | XGBoost | BlazingText |
| 특성 수만 개·희소 분류 | Linear Learner | XGBoost |
| 사용자×아이템 희소 추천 | Factorization Machines | K-Means |
| 이미지 속 객체 위치까지 필요 | Object Detection | Image Classification |
| 학습 시작 대기가 김 | Pipe / Fast File 모드 | 인스턴스 업그레이드 |
| 노트북 방치 과금 | 유휴 자동 종료 lifecycle config | Spot 노트북 |
| 학습이 끝없이 도는 폭주 | `max_run` 상한 설정 | 수동 모니터링 |

이 표의 "정답" 쪽 키워드가 지문에 어떤 단서(데이터 양/형태, 중단 허용 여부, 예산, 학습 시간)로 등장하는지에 집중하면 대부분 풀린다.

## 이번 주 개념을 한 스크립트로

네 글의 개념은 실제 코드에서 한 흐름으로 이어진다. 이 스니펫의 각 줄이 어느 날 내용인지 짚어 보면 복습이 된다.

```python
from sagemaker.pytorch import PyTorch
from sagemaker.tuner import HyperparameterTuner, ContinuousParameter, IntegerParameter
from sagemaker.inputs import TrainingInput

estimator = PyTorch(                       # Day 1: 프레임워크 Estimator
    entry_point='train.py',                # Day 1: 내 학습 스크립트
    role=role,
    instance_type='ml.g5.xlarge',          # Day 1: 딥러닝이므로 GPU
    instance_count=1,
    use_spot_instances=True,               # Day 1·4: 단가 낮추기
    max_run=3600,
    max_wait=7200,                         # Day 1: max_wait >= max_run
    checkpoint_s3_uri='s3://my-bucket/ckpt/',   # Day 1: 중단 대비
)

tuner = HyperparameterTuner(               # Day 3: AMT
    estimator=estimator,
    objective_metric_name='validation:auc',
    objective_type='Maximize',
    hyperparameter_ranges={
        'lr': ContinuousParameter(1e-4, 1e-2),
        'batch_size': IntegerParameter(16, 128),
    },
    max_jobs=20,
    max_parallel_jobs=3,                   # Day 3: 너무 높이면 Bayesian 이점 감소
    strategy='Bayesian',
    early_stopping_type='Auto',            # Day 3·4: 작업량 줄이기
)

tuner.fit({                                # Day 1·2: 입력 채널과 포맷
    'train': TrainingInput('s3://my-bucket/train/', input_mode='Pipe'),
    'validation': TrainingInput('s3://my-bucket/valid/', input_mode='Pipe'),
})
```

> ⚠️ **함정**: 가장 흔한 함정은 "비용 절감"만 보고 Spot을 고르되 체크포인트를 빠뜨리는 것, 그리고 "튜닝"이면 무조건 Grid를 떠올리는 것이다. Spot은 중단 가능성 때문에 체크포인트와 짝이고, 효율적 튜닝의 기본은 전수 조사인 Grid가 아니라 Bayesian이다. 또 "내 스크립트 학습"에 빌트인 컨테이너를 고르는 실수도 잦다 — 커스텀 코드는 프레임워크 Estimator의 `entry_point`다.

## 이번 주 트러블슈팅 총정리: 증상 → 원인 → 조치

네 글에서 나온 진단표를 한자리에 모았다. 시험 지문은 대개 아래 증상 중 하나의 변형이다.

| 증상 | 원인 | 조치 | 관련 |
|------|------|------|------|
| 학습 시작 전 대기가 길다 | File 모드로 대용량 전체 다운로드 | Pipe / Fast File 모드 | Day 1 |
| 매 epoch I/O가 병목이다 | S3에서 반복 재전송 | FSx for Lustre | Day 1 |
| Spot이 매번 처음부터 다시 돈다 | 체크포인트 미설정·재개 로직 없음 | `checkpoint_s3_uri` + 스크립트 재개 처리 | Day 1 |
| GPU로 바꿔도 안 빨라진다 | 병목이 연산이 아니라 I/O | 입력 모드·FSx로 데이터 로딩부터 개선 | Day 1 |
| XGBoost 예측이 무의미하다 | CSV 헤더가 남았거나 라벨이 마지막 열 | 헤더 제거, 라벨을 첫 열로 | Day 2 |
| 고차원 희소 데이터에서 학습이 버겁다 | 트리 분기가 희소 특성에 불리 | Linear Learner로 교체 | Day 2 |
| 튜닝을 많이 돌려도 성능이 안 오른다 | 탐색 범위가 최적값을 벗어남 | 범위 확대 + 로그 스케일 탐색 | Day 3 |
| Bayesian이 Random과 차이가 없다 | `max_parallel_jobs`가 과도 | 병렬도를 낮춰 순차 이점 확보 | Day 3 |
| 튜닝 후 배포하니 성능이 떨어진다 | 검증셋에 과적합 | 튜닝에 쓰지 않은 테스트셋으로 최종 확인 | Day 3 |
| 라벨이 적어 정확도가 안 나온다 | 데이터 부족으로 과적합 | 사전학습 모델 미세조정(전이학습) | Day 4 |
| 미세조정 후 오히려 나빠졌다 | 적은 데이터로 전체 계층을 흔듦 | 하위 계층 동결 + 학습률 하향 | Day 4 |
| 아무도 안 쓰는데 요금이 나온다 | 노트북 인스턴스 방치 | 유휴 자동 종료 lifecycle config | Day 4 |

## 다음 주 예고

이번 주가 모델을 "만드는" 단계였다면, 다음 주(모델 개발 2)는 만든 모델을 **평가하고 분석**하는 단계로 이어진다. 학습 곡선과 과적합/과소적합 진단, 평가 지표(정확도·정밀도·재현율·F1·AUC), 그리고 SageMaker Debugger와 Experiments로 학습 과정을 들여다보고 비교하는 도구들을 다룬다. 오늘 정리한 "모델을 어떻게 학습시키는가"가 다음 주 "그 모델이 잘 학습됐는가"의 토대가 된다.

## 📖 용어

- **Training Job** : SageMaker에서 모델 학습을 실행하는 기본 단위. 인스턴스를 띄웠다가 끝나면 스스로 내린다.
- **Estimator** : 무엇을·어디서·어떻게 학습할지 담은 설계도 객체. 학습 작업을 코드로 정의하는 방법이다.
- **입력 모드** : 데이터를 인스턴스로 어떻게 들여올지 정하는 방식. File(전부 다운로드) / Pipe(스트리밍) / Fast File.
- **FSx for Lustre** : 초고성능 병렬 파일시스템. 큰 데이터를 여러 번 반복해 읽을 때 S3보다 훨씬 빠르다.
- **RecordIO-protobuf** : 학습 데이터를 이진으로 빽빽이 저장하는 포맷. 크기가 작고 파싱이 빨라 대용량 스트리밍에 유리하다.
- **Managed Spot Training / 체크포인트** : Spot은 AWS의 남는 용량을 싸게 빌려 학습하는 방식으로 최대 90% 저렴하지만 중간에 회수될 수 있다. 체크포인트는 학습 중간 상태를 S3에 저장해 둔 것으로, 중단돼도 마지막 지점부터 이어서 학습하게 해준다.
- **AMT (Automatic Model Tuning)** : 여러 학습 작업을 자동으로 돌려 가장 좋은 하이퍼파라미터 조합을 찾아주는 기능.
- **베이지안 최적화 / Hyperband** : 베이지안은 지금까지의 결과로 유망한 영역을 추정해 다음 시도를 고르는 전략이고, Hyperband는 여러 구성을 조금씩 학습해 보고 성적이 나쁜 쪽을 빨리 탈락시켜 남은 자원을 몰아주는 전략이다.
- **워밍 스타트** : 이전 튜닝 작업의 결과를 물려받아 새 튜닝을 그 지점부터 이어 가는 기능.
- **JumpStart / 전이학습** : JumpStart는 검증된 사전학습 모델과 솔루션 템플릿을 모아 둔 SageMaker의 모델 허브다. 전이학습은 대규모로 학습된 모델의 지식을 내 과제로 옮겨 쓰는 기법으로, 적은 데이터로도 높은 성능을 낸다.

---

## 📝 연습 문제

**문제 1.** 다음 중 SageMaker Training Job과 빌트인 알고리즘에 대한 설명으로 옳은 것은?

A) Training Job은 학습이 끝나도 인스턴스를 계속 유지한다  
B) Training Job은 학습 후 model.tar.gz를 S3에 저장하고 인스턴스를 자동 종료하며, 내 스크립트는 프레임워크 Estimator의 entry_point로 학습한다  
C) 빌트인 알고리즘은 항상 커스텀 컨테이너를 직접 빌드해야 한다  
D) XGBoost는 이미지 분할 전용 알고리즘이다  

**정답: B**  
해설: Training Job은 학습 완료 후 모델을 S3에 저장하고 인스턴스를 자동으로 내리며, 사용자 스크립트는 프레임워크 Estimator의 entry_point로 실행한다. A는 인스턴스를 유지한다는 점에서 틀리고, C는 빌트인이 미리 만들어진 컨테이너라는 사실과 반대이며, D는 XGBoost가 정형 데이터 분류/회귀용이라는 점과 어긋난다.

---

**문제 2.** 학습 비용을 줄이려는 여러 시나리오에서 가장 적절하게 짝지어진 것은?

A) 중단 후 재개 필요 → Spot만 켜기  
B) 라벨 데이터가 적은 분류기 → 처음부터 학습  
C) 중단 후 재개 필요 → Spot + 체크포인트, 라벨 적은 분류기 → 전이학습  
D) 효율적 하이퍼파라미터 탐색 → Grid Search  

**정답: C**  
해설: Spot은 중단 가능성 때문에 체크포인트와 함께 써야 재개가 보장되고, 라벨 데이터가 적을 때는 전이학습이 적합하다. A는 체크포인트 누락으로 진행분이 날아갈 수 있고, B는 데이터 부족으로 과적합되기 쉬우며, D는 효율적 탐색의 기본이 전수 조사가 아닌 베이지안이라는 점과 어긋난다.

---

**문제 3.** 수 TB 데이터를 여러 epoch 반복해 읽는 분산 학습에서 I/O가 병목이고, 입력 데이터는 대용량 스트리밍으로 효율적으로 넣고 싶다. 가장 적절한 조합은?

A) FSx for Lustre + RecordIO-protobuf  
B) S3 File 모드 + CSV  
C) 로컬 디스크 + JSON  
D) DynamoDB + XML  

**정답: A**  
해설: FSx for Lustre는 대용량 데이터의 반복 읽기 I/O 병목을 해소하고, RecordIO-protobuf는 대용량 스트리밍 입력에 가장 효율적인 포맷이다. B는 매 시작 전체 다운로드와 텍스트 파싱으로 비효율적이고, C는 대규모 분산 학습 규모에 맞지 않으며, D는 학습 데이터 소스/포맷으로 부적합하다.

---

**문제 4.** AMT(하이퍼파라미터 튜닝)에 대한 설명으로 옳은 것은?

A) Bayesian은 이전 시도 결과를 활용해 다음 시도를 선택하며, 조기 종료로 가망 없는 학습을 중단해 비용을 줄일 수 있다  
B) Grid Search가 가장 적은 횟수로 최적값을 찾는 전략이다  
C) 워밍 스타트는 항상 데이터가 동일할 때만 사용 가능하다  
D) max_parallel_jobs를 높이면 Bayesian의 순차 학습 이점이 커진다  

**정답: A**  
해설: Bayesian은 이전 결과로 다음 시도를 똑똑하게 고르고, early stopping은 진행 중 가망 없는 학습을 끊어 비용을 절감한다. B는 Grid가 전수 조사라 비효율적이고, C는 데이터가 변경돼도 TRANSFER_LEARNING 타입으로 워밍 스타트가 가능하며, D는 병렬을 높이면 순차 의존 이점이 오히려 줄어든다는 점과 반대다.

---

**문제 5.** 검증된 사전학습 텍스트 모델을 내 도메인 데이터로 미세조정해 빠르고 저렴하게 배포하려 한다. 가장 적합한 접근은?

A) 빌트인 K-Means를 처음부터 학습한다  
B) JumpStart 사전학습 모델을 fit으로 미세조정한 뒤 deploy한다  
C) Feature Store에 모델을 적재해 배포한다  
D) AMT로 하이퍼파라미터만 튜닝한다  

**정답: B**  
해설: JumpStart는 사전학습 모델을 제공하며 fit으로 내 데이터에 미세조정(전이학습)한 뒤 deploy로 배포할 수 있어 빠르고 저렴하다. A는 무관한 군집화의 밑바닥 학습이고, C는 특성 저장소로 모델 배포 수단이 아니며, D는 사전학습 모델 활용 없이 튜닝만 하는 것이라 요구를 충족하지 못한다.

---
