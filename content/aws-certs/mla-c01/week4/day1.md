# Day 1 - SageMaker 학습 작업(Training Job): Estimator, 입력 채널, 인스턴스, Spot

## 📌 핵심 정리

- **Training Job**은 인스턴스를 띄워 컨테이너로 학습하고 `model.tar.gz`를 S3에 저장한 뒤 인스턴스를 자동 종료하는 **배치성 작업**이다.
- **Estimator**가 설계도 — 컨테이너·IAM 역할·인스턴스·하이퍼파라미터. 내 학습 스크립트를 돌리려면 프레임워크 Estimator의 `entry_point`.
- **입력 채널**은 `fit()`에 채널별 데이터 위치로 전달. 입력 모드는 File(전체 다운로드)·Pipe(스트리밍)·Fast File.
- **인스턴스**는 전통 ML=CPU, 딥러닝=GPU, 한 대로 부족하면 `instance_count`를 올려 분산. 대용량 반복 읽기 I/O 병목은 **FSx for Lustre**.
- **Managed Spot Training**은 최대 90% 절감. 단 중단될 수 있어 **체크포인트가 짝**이며 `max_wait >= max_run`이어야 한다.

## Training Job의 동작 흐름

SageMaker에서 모델 학습의 기본 단위는 **Training Job**이다. 노트북에서 `for epoch in ...`을 직접 돌리는 대신 "이 데이터로, 이 컨테이너에서, 이 인스턴스로 학습해줘"라고 작업을 던지는 방식이다.

```text
① 인스턴스 프로비저닝   (instance_type × instance_count)
        ▼
② 컨테이너 실행        (ECR 이미지: 빌트인 / 프레임워크 / 커스텀)
        ▼
③ 입력 데이터 로드      (S3 · FSx → File / Pipe / Fast File)
        ▼
④ 학습 수행  ──▶ 체크포인트 ──▶ s3://.../checkpoints/   (Spot 중단 대비)
        ▼
⑤ 모델 아티팩트 업로드  (model.tar.gz → output_path)
        ▼
⑥ 인스턴스 자동 종료    (과금 중단)
```

| 단계 | 일어나는 일 | 놓치기 쉬운 점 |
|------|-------------|----------------|
| ① 프로비저닝 | 지정한 타입·개수만큼 EC2 인스턴스를 띄운다 | 여기서부터 과금이 시작된다 |
| ② 컨테이너 실행 | 알고리즘이 담긴 Docker 이미지(ECR)를 내려 실행 | 빌트인·프레임워크·커스텀 세 갈래 |
| ③ 입력 데이터 로드 | S3(또는 FSx)에서 학습 데이터를 인스턴스로 가져옴 | File 모드는 전부 받기 전까지 학습이 시작되지 않는다 |
| ④ 학습 수행 | 컨테이너가 데이터를 읽어 모델을 학습 | 지표는 로그로 방출되어야 튜닝·조기 종료가 작동 |
| ⑤ 아티팩트 저장 | `model.tar.gz`를 `output_path`의 S3에 업로드 | 인스턴스가 사라져도 모델은 S3에 남는다 |
| ⑥ 인스턴스 종료 | 작업이 끝나면 자동으로 내린다 | 과금 중단. 상시 대기하는 엔드포인트와의 결정적 차이 |

핵심은 **학습이 끝나면 인스턴스가 사라진다**는 점이다. 추론 엔드포인트처럼 계속 떠 있지 않다. 그래서 학습은 본질적으로 "잠깐 쓰고 버리는" 배치성 작업이고, 이 특성이 뒤에 나올 Spot 학습과 잘 맞물린다.

> 💡 **관련 이론**: 이 구조는 "컴퓨팅과 스토리지의 분리"라는 클라우드 설계 원칙의 전형이다. 데이터는 영속적인 S3에 두고, 컴퓨팅은 필요할 때만 띄웠다 내린다. 덕분에 같은 데이터로 인스턴스 타입만 바꿔 여러 실험을 돌릴 수 있고, 학습이 끝난 뒤 비싼 GPU를 계속 켜두는 낭비가 사라진다. 온프레미스에서 GPU 서버를 사두면 안 쓸 때도 감가상각이 도는 것과 정반대다.

## Estimator: 학습 작업의 설계도

Python SDK에서 Training Job은 **Estimator** 객체로 정의한다. Estimator는 "무엇을, 어디서, 어떻게" 학습할지를 담은 설계도다.

- **무엇을**: `image_uri`(알고리즘 컨테이너) 또는 `entry_point`(내 스크립트)
- **어디서**: `instance_type`·`instance_count`·`role`
- **어떻게**: `set_hyperparameters()`로 넘기는 알고리즘 손잡이
- **어디에**: `output_path`(모델 아티팩트가 올라갈 S3 경로)

```python
from sagemaker.estimator import Estimator

estimator = Estimator(
    image_uri=container,          # 알고리즘 컨테이너(ECR 이미지)
    role=role,                    # SageMaker 실행 IAM 역할
    instance_count=1,             # 인스턴스 개수
    instance_type='ml.m5.xlarge', # 인스턴스 타입
    output_path='s3://my-bucket/output/',  # 모델 저장 위치
    sagemaker_session=session,
)

estimator.set_hyperparameters(
    max_depth=5,
    objective='binary:logistic',
    num_round=100,
)
```

Estimator에는 크게 세 종류가 있고, 어느 쪽을 고르느냐가 시험의 단골 갈림길이다.

| Estimator 종류 | 지정 방식 | 고르는 상황 |
|----------------|-----------|-------------|
| **빌트인 알고리즘용** | `Estimator(image_uri=...)`에 AWS 제공 컨테이너 URI | 코드 없이 XGBoost 등으로 바로 학습(내일 다룬다) |
| **프레임워크 Estimator** | `PyTorch`/`TensorFlow`/`SKLearn` + `entry_point='train.py'` | 내가 작성한 학습 스크립트를 돌릴 때 |
| **커스텀 컨테이너** | 직접 빌드한 이미지를 ECR에 올려 `image_uri`로 지정 | 특이한 라이브러리·사내 런타임이 필요할 때 |

> ⚠️ **함정**: "내가 쓴 PyTorch 스크립트를 SageMaker에서 학습시키려면?"의 답은 **프레임워크 Estimator + `entry_point`**다. 빌트인 컨테이너에 스크립트를 밀어 넣는 선택지가 자주 오답으로 나온다. 반대로 "빌트인에도 없고 프레임워크 컨테이너로도 못 담는 특수 의존성"이라야 커스텀 컨테이너로 내려간다.

```python
from sagemaker.pytorch import PyTorch

estimator = PyTorch(
    entry_point='train.py',       # 내 학습 코드
    role=role,
    framework_version='2.0',
    py_version='py310',
    instance_count=1,
    instance_type='ml.g5.xlarge', # GPU 인스턴스
    hyperparameters={'epochs': 10, 'lr': 0.001},
)
```

## 입력 채널: S3와 FSx, 그리고 입력 모드

학습 데이터는 **입력 채널(input channel)**로 넘긴다. `fit()` 호출 시 채널 이름 → 데이터 위치를 딕셔너리로 준다. 보통 `train`, `validation`, `test` 같은 이름을 쓴다.

```python
estimator.fit({
    'train': 's3://my-bucket/train/',
    'validation': 's3://my-bucket/validation/',
})
```

채널마다 데이터가 인스턴스로 어떻게 들어오는지(**입력 모드**)를 정할 수 있고, 이게 시험 단골이다.

| 입력 모드 | 동작 | 적합한 상황 |
|-----------|------|-------------|
| **File 모드** (기본) | 데이터 전체를 인스턴스 디스크로 다운로드 후 학습 시작 | 데이터가 작아 디스크에 다 들어갈 때 |
| **Pipe 모드** | S3에서 데이터를 스트리밍으로 흘려보냄(다운로드 대기 없음) | 대용량 데이터, 시작 지연·디스크 절약 |
| **Fast File 모드** | 파일을 즉시 접근하되 필요한 만큼만 스트리밍 | File의 편의 + 스트리밍 이점 |

데이터 저장소도 선택지가 있다.

| 저장소 | 성격 | 고르는 순간 |
|--------|------|-------------|
| **S3** | 가장 일반적. 대부분의 학습 데이터 출발점 | 기본값. 데이터 규모가 보통이거나 반복 읽기가 적을 때 |
| **FSx for Lustre** | 초고성능 병렬 파일시스템. 한 번 올려두면 저지연 반복 접근 | 데이터가 매우 크고 여러 epoch에서 같은 데이터를 반복해 읽어 I/O가 병목일 때 |
| **EFS** | 공유 파일시스템을 마운트해 사용 | 이미 데이터가 EFS에 올라가 있을 때 |

> ⚠️ **함정**: "수 TB 데이터를 매 epoch 반복해 읽는 대규모 분산 학습에서 데이터 로딩이 병목"이라는 시나리오가 나오면 답은 **FSx for Lustre**다. S3 File 모드는 시작 때 전부 다운로드하느라 느리고, Pipe 모드도 매 epoch마다 다시 스트리밍한다. FSx는 한 번 올려두면 저지연 병렬 접근이 되어 반복 읽기에 강하다. 반대로 데이터가 작으면 굳이 FSx를 쓸 필요 없이 S3 File 모드가 단순하고 충분하다.

## 인스턴스 선택: CPU vs GPU, 단일 vs 분산

인스턴스 선택은 비용과 속도를 동시에 좌우한다. 기본 원칙은 알고리즘 성격에 맞추는 것이다.

| 인스턴스 계열 | 성격 | 적합한 학습 |
|---------------|------|-------------|
| **ml.m5 (범용 CPU)** | CPU·메모리 균형 | XGBoost, Linear Learner 등 전통 ML의 기본값 |
| **ml.c5 (컴퓨트 최적화 CPU)** | 연산 성능 위주 | CPU 연산이 지배적인 가벼운 학습 |
| **ml.g5 (GPU)** | 중급 GPU 단일/다중 | 중소형 딥러닝, 사전학습 모델 미세조정 |
| **ml.p4 (GPU)** | 대형 다중 GPU 노드 | 대형 신경망, 본격 분산 학습 |

**분산 학습**은 `instance_count`를 2 이상으로 주면 시작된다. 쪼개는 대상이 무엇이냐로 두 방식이 갈린다.

| 분산 방식 | 무엇을 쪼개나 | 쓰는 순간 |
|-----------|---------------|-----------|
| **데이터 병렬** | 데이터를 나눠 각 인스턴스가 같은 모델을 학습 | 모델은 GPU 한 대에 들어가는데 데이터가 많아 느릴 때 |
| **모델 병렬** | 모델 자체를 나눠 여러 GPU에 배치 | 모델이 GPU 한 대의 메모리에 안 들어갈 때 |

```python
estimator = PyTorch(
    entry_point='train.py',
    role=role,
    instance_count=4,             # 4대로 분산 학습
    instance_type='ml.p4d.24xlarge',
    distribution={'torch_distributed': {'enabled': True}},
    ...
)
```

> 💡 **관련 이론**: GPU가 딥러닝에서 빠른 이유는 신경망 학습의 핵심이 거대한 행렬 곱셈이고, GPU는 수천 개 코어로 이런 병렬 연산을 동시에 처리하기 때문이다. 반대로 트리 기반 알고리즘(XGBoost)은 분기 판단이 순차적이라 GPU 이득이 제한적이다(다만 XGBoost도 GPU 가속 옵션은 있다). "딥러닝이면 GPU, 전통 ML이면 CPU"가 기본값이고, 데이터·모델 크기가 한 대를 넘으면 분산을 고려한다는 순서로 외운다.

## Managed Spot Training: 학습 비용을 최대 90% 절감

학습은 잠깐 쓰고 버리는 배치 작업이라 했다. 이 특성을 가장 잘 살리는 게 **Managed Spot Training**이다. Spot 인스턴스는 AWS의 남는 용량을 크게 할인해 쓰는 방식으로, 온디맨드 대비 최대 90%까지 저렴하다.

단점은 AWS가 용량을 회수하면 인스턴스가 중간에 종료(interruption)될 수 있다는 것이다. SageMaker는 이를 **체크포인트**로 해결한다. 학습 중간 상태를 주기적으로 S3에 저장해두면, 인스턴스가 회수돼 재시작돼도 마지막 체크포인트부터 이어서 학습한다.

```python
estimator = Estimator(
    image_uri=container,
    role=role,
    instance_count=1,
    instance_type='ml.m5.xlarge',
    use_spot_instances=True,          # Spot 학습 활성화
    max_run=3600,                     # 최대 학습 시간(초)
    max_wait=7200,                    # Spot 대기 포함 최대 대기 시간(초)
    checkpoint_s3_uri='s3://my-bucket/checkpoints/',  # 체크포인트 저장
)
```

- `max_wait`는 반드시 `max_run`보다 **크거나 같아야** 한다. Spot은 가용 용량을 기다리는 시간이 추가로 필요하기 때문이다.
- `checkpoint_s3_uri`를 지정하지 않으면 중단 시 처음부터 다시 학습해 오히려 손해일 수 있다.
- 체크포인트는 저장만으로 끝나지 않는다. 학습 스크립트가 **재시작 시 그 경로를 읽어 이어받도록** 짜여 있어야 실제로 재개된다.

실제로 얼마나 아꼈는지는 작업 설명(describe)에서 확인한다. boto3로 학습 작업 상태와 과금 시간을 직접 조회할 수 있다.

```python
import boto3

sm = boto3.client('sagemaker')
desc = sm.describe_training_job(TrainingJobName='my-training-job')

print(desc['TrainingJobStatus'])                    # InProgress / Completed / Failed
print(desc['ModelArtifacts']['S3ModelArtifacts'])   # model.tar.gz 위치
print(desc['TrainingTimeInSeconds'])                # 학습에 쓴 시간
print(desc['BillableTimeInSeconds'])                # 실제 과금된 시간
```

Spot을 켜면 `BillableTimeInSeconds`가 `TrainingTimeInSeconds`보다 크게 작아진다. 이 두 값의 차이가 곧 절감분이다.

> ⚠️ **함정**: "비용을 줄이되 학습이 중단되어도 손실 없이 재개돼야 한다"는 시나리오의 답은 **Spot + 체크포인트**다. Spot만 켜고 체크포인트를 안 두면 중단 시 진행분이 날아간다. 반대로 "학습이 절대 중단되면 안 되고 마감이 빡빡하다"면 온디맨드를 쓴다. Spot은 시간에 여유가 있고 재시작이 허용되는 학습에 적합하다는 점이 판단 기준이다.

## 학습이 꼬일 때: 증상 → 원인 → 조치

시험은 종종 "학습이 이런 식으로 잘못되고 있다"는 상황을 던지고 조치를 묻는다. 오늘 배운 네 축이 그대로 진단표가 된다.

| 증상 | 흔한 원인 | 조치 |
|------|-----------|------|
| 학습이 시작되기까지 대기가 길다 | File 모드로 대용량 데이터를 전부 다운로드하는 중 | Pipe / Fast File 모드로 전환, 반복 읽기가 많으면 FSx for Lustre |
| Spot 학습이 매번 처음부터 다시 돈다 | `checkpoint_s3_uri` 미지정, 또는 스크립트가 체크포인트를 읽지 않음 | 체크포인트 경로 지정 + 재개 로직 구현 |
| Spot 작업이 시작도 못 하고 종료된다 | `max_wait`가 `max_run`보다 작거나 용량 대기 시간을 넘김 | `max_wait >= max_run`으로 상향, 인스턴스 타입 후보를 넓힘 |
| 학습이 끝나지 않고 계속 돈다 | 하이퍼파라미터 설정 오류로 수렴하지 않음 | `max_run`으로 상한을 걸어 폭주 비용을 차단 |
| S3 데이터 접근이 거부된다 | 실행 IAM 역할에 해당 버킷 읽기 권한이 없음 | `role`에 입력·출력 S3 경로 권한 부여 |
| GPU로 바꿨는데 빨라지지 않는다 | 트리 계열이라 GPU 이득이 작거나, 병목이 연산이 아니라 I/O | CPU로 되돌리거나 입력 모드·FSx로 데이터 로딩부터 개선 |

> 💡 **개념**: 학습 속도 문제는 **연산 병목**과 **I/O 병목**을 먼저 갈라 보는 게 순서다. GPU 사용률이 낮은데 학습이 느리면 십중팔구 데이터가 늦게 도착하는 것이고, 이때 더 비싼 GPU로 바꾸는 건 돈만 쓰고 효과가 없다. 인스턴스 업그레이드는 연산이 진짜 병목일 때만 답이 된다.

다음 글에서는 이 Training Job에서 실제로 돌릴 수 있는 빌트인 알고리즘들과 그 입력 포맷을 본다.

## 📖 용어

- **Training Job** : SageMaker에서 모델 학습을 실행하는 기본 단위. 인스턴스를 띄웠다가 끝나면 스스로 내린다.
- **Estimator** : 무엇을·어디서·어떻게 학습할지 담은 설계도 객체. Python SDK에서 학습 작업을 정의하는 방법.
- **entry_point** : 프레임워크 Estimator에 넘기는 내 학습 스크립트 파일명. 이게 있으면 커스텀 코드 학습이다.
- **입력 채널** : `fit()`에 넘기는 "이름 → 데이터 위치" 짝. 보통 `train`, `validation` 같은 이름을 쓴다.
- **입력 모드 (File / Pipe / Fast File)** : 데이터를 인스턴스로 들여오는 방식. File은 전체를 먼저 내려받고, Pipe는 S3에서 흘려보내며 학습하고, Fast File은 파일에 바로 접근하되 필요한 부분만 스트리밍한다.
- **FSx for Lustre** : 초고성능 병렬 파일시스템. 큰 데이터를 여러 번 반복해 읽을 때 S3보다 훨씬 빠르다.
- **모델 아티팩트** : 학습 결과물인 `model.tar.gz` 파일. `output_path`의 S3에 저장되어 인스턴스가 사라져도 남는다.
- **Managed Spot Training** : AWS의 남는 용량을 싸게 빌려 학습하는 방식. 최대 90% 저렴하지만 중간에 회수될 수 있다.
- **체크포인트** : 학습 중간 상태를 S3에 저장해 둔 것. 중단돼도 마지막 지점부터 이어서 학습할 수 있게 해준다.
- **데이터 병렬 / 모델 병렬** : 데이터를 쪼개 여러 대가 같은 모델을 학습하는 방식 / 모델 자체를 쪼개 여러 GPU에 나눠 싣는 방식.

---

## 📝 연습 문제

**문제 1.** 학습 비용을 최대한 줄이고 싶지만, 인스턴스가 중간에 회수되어 학습이 중단되어도 진행 상황을 잃지 않고 재개되어야 한다. 가장 적합한 구성은?

A) 온디맨드 인스턴스로 학습하고 인스턴스 수를 늘린다  
B) Managed Spot Training을 켜고 checkpoint_s3_uri로 체크포인트를 저장한다  
C) Spot 인스턴스만 켜고 체크포인트는 설정하지 않는다  
D) 학습을 여러 번 반복 실행한다  

**정답: B**  
해설: Spot은 최대 90% 비용을 절감하지만 회수로 중단될 수 있어, 체크포인트를 S3에 저장하면 마지막 지점부터 재개해 진행분을 잃지 않는다. A는 비용 절감 효과가 없고, C는 중단 시 처음부터 다시 학습해 손실이 발생하며, D는 매번 처음부터 시작하는 비효율적 방식이다.

---

**문제 2.** 수 TB 규모의 학습 데이터를 여러 epoch에 걸쳐 반복적으로 읽는 대규모 분산 학습에서, 매 epoch마다 S3에서 데이터를 다시 받느라 I/O가 병목이다. 가장 적합한 데이터 소스는?

A) S3 File 모드  
B) FSx for Lustre  
C) 로컬 노트북 디스크  
D) DynamoDB  

**정답: B**  
해설: FSx for Lustre는 고성능 병렬 파일시스템으로, 한 번 올려두면 저지연으로 반복 접근할 수 있어 대용량 데이터를 여러 epoch 반복 읽는 학습의 I/O 병목을 해소한다. A는 매 시작 시 전체 다운로드가 필요하고, C는 학습 규모에 맞지 않으며, D는 key-value 저장소로 대량 학습 데이터 스트리밍에 부적합하다.

---

**문제 3.** 직접 작성한 PyTorch 학습 스크립트(train.py)를 SageMaker Training Job으로 실행하려 한다. 올바른 접근은?

A) 빌트인 XGBoost 컨테이너에 스크립트를 넣는다  
B) PyTorch 프레임워크 Estimator의 entry_point에 train.py를 지정한다  
C) 추론 엔드포인트를 먼저 생성한다  
D) Feature Store에 스크립트를 적재한다  

**정답: B**  
해설: 프레임워크 Estimator(PyTorch 등)는 entry_point로 사용자 학습 스크립트를 받아 해당 프레임워크 컨테이너에서 실행하므로 커스텀 PyTorch 코드 학습에 적합하다. A는 무관한 알고리즘 컨테이너이고, C는 추론용이라 학습 단계와 맞지 않으며, D는 특성 저장소로 학습 코드 실행과 무관하다.

---

**문제 4.** SageMaker Training Job이 정상 완료된 직후의 동작으로 옳은 것은?

A) 학습 인스턴스가 계속 떠 있으면서 추론 요청을 처리한다  
B) 모델 아티팩트를 output_path의 S3에 저장하고 학습 인스턴스를 자동 종료한다  
C) 인스턴스가 종료되며 모델도 함께 삭제된다  
D) 데이터를 자동으로 Feature Store에 적재한다  

**정답: B**  
해설: Training Job은 학습 완료 후 model.tar.gz를 지정한 S3에 업로드하고 인스턴스를 자동으로 내려 과금을 멈춘다. A는 추론 엔드포인트의 동작이고, C는 모델이 S3에 보존되므로 틀리며, D는 학습 작업이 자동으로 수행하지 않는다.

---

**문제 5.** Managed Spot Training을 설정할 때 max_run과 max_wait의 관계로 올바른 것은?

A) max_wait는 항상 max_run보다 작아야 한다  
B) max_wait는 max_run보다 크거나 같아야 한다(Spot 용량 대기 시간 포함)  
C) 둘은 항상 같아야 한다  
D) max_wait는 Spot에서 의미가 없다  

**정답: B**  
해설: Spot은 가용 용량을 기다리는 시간이 추가로 필요하므로 대기 포함 총 시간인 max_wait가 실제 학습 시간 상한인 max_run보다 크거나 같아야 한다. A는 반대로 설정한 것이고, C는 대기 시간을 고려하지 못하며, D는 Spot 학습에서 max_wait가 필수 파라미터라는 점과 어긋난다.

---
