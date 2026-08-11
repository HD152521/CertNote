# Day 1 - 커스텀 학습: 스크립트 모드, BYOC, 프레임워크 컨테이너

## 📌 핵심 정리

- 커스텀 학습은 **"내 코드를 어디까지 가져오느냐"의 스펙트럼**이다 — 내장 알고리즘 → 스크립트 모드 → requirements 확장 → BYOC.
- **스크립트 모드**: `train.py`만 주면 AWS 프레임워크 컨테이너가 실행한다. Docker 불필요 → 시험의 "최소 노력" 정답.
- **requirements.txt 확장**: 파이썬 패키지만 더 필요할 때. `source_dir`에 넣으면 컨테이너 시작 시 자동 설치된다.
- **BYOC**: 시스템 패키지(apt)·특수 런타임·미지원 프레임워크일 때만. ECR 이미지 + `/opt/ml/` 경로 규약.
- 규약을 어기면 조용히 실패한다 — 데이터는 `SM_CHANNEL_<채널명>`, 모델은 반드시 `SM_MODEL_DIR`에 저장.

## 세 가지 커스터마이징 수준

실무에서는 PyTorch·TensorFlow로 직접 짠 모델을 학습하거나 회사 표준 라이브러리를 묶은 자체 환경이 필요할 때가 많다. SageMaker 학습은 "AWS가 제공하는 컨테이너를 얼마나 그대로 쓰느냐"로 구분된다.

| 방식 | 내가 가져오는 것 | 컨테이너 | 적합한 상황 |
|------|----------------|---------|------------|
| 내장 알고리즘 | (없음, 데이터만) | AWS 관리 | 표준 문제, 코드 작성 불요 |
| 스크립트 모드 | 학습 스크립트 1개 | AWS 프레임워크 컨테이너 | PyTorch/TF 코드를 빠르게 |
| 프레임워크 컨테이너 확장 | 스크립트 + 추가 패키지 | AWS 컨테이너 + requirements | 프레임워크는 그대로, 의존성만 추가 |
| BYOC (자체 컨테이너) | Docker 이미지 전체 | 내가 만든 이미지 | 특수 런타임·시스템 의존성 |

- 핵심 직관: **위로 갈수록 편하고, 아래로 갈수록 자유롭다.**
- 시험은 "최소한의 노력으로 X를 하라"는 식으로 묻는다 → 요구가 **프레임워크 코드 수준이면 스크립트 모드**, **시스템 패키지·특수 런타임 수준이면 BYOC**.
- 어느 방식을 골라도 **학습 작업의 수명주기와 경로 규약은 동일**하다. 이 규약이 시험의 실제 출제 지점이다.

> 💡 **관련 이론**: 이 계층 구조는 "관심사 분리(separation of concerns)"의 전형이다. 학습 로직(내 코드)과 실행 환경(컨테이너)을 분리하면, 환경이 안정적일 때는 코드만 갈아끼우고(스크립트 모드) 환경 자체가 특수할 때만 환경을 직접 만든다(BYOC). 불필요하게 낮은 계층으로 내려가면 Docker 빌드·유지보수 부담을 떠안게 되므로, "필요한 만큼만 내려간다"가 원칙이다.

## 학습 작업 한 번의 수명주기

`fit()`을 호출하면 방식과 무관하게 아래 순서가 돌아간다. 어디서 무엇이 깨지는지 이 그림 위에서 짚어야 한다.

```text
estimator.fit({'training': 's3://.../train/'})
   │
   ├─ ① 학습 인스턴스 프로비저닝            (ml.g5.xlarge 등, 여기서부터 과금)
   ├─ ② 컨테이너 이미지 pull                (AWS 프레임워크 이미지 or 내 ECR 이미지)
   ├─ ③ S3 → /opt/ml/input/data/<채널명>/   (File 모드는 전체 복사 후 시작)
   ├─ ④ source_dir 내려받기 + requirements.txt 설치
   ├─ ⑤ entry_point 실행                    (BYOC는 컨테이너를 `train` 인자로 실행)
   ├─ ⑥ /opt/ml/model/ → model.tar.gz → S3 output_path 업로드
   └─ ⑦ 인스턴스 종료                        (과금 종료)
```

- ③에서 데이터가 안 보이면 → **채널 이름 불일치**.
- ④에서 오래 걸리면 → **의존성이 무겁다**(이미지로 굽는 편이 낫다).
- ⑥에서 산출물이 없으면 → **저장 경로 규약 위반**.

## 스크립트 모드: 프레임워크 코드를 그대로

스크립트 모드는 PyTorch·TensorFlow·Scikit-learn 등으로 작성한 학습 스크립트를 AWS가 관리하는 프레임워크 컨테이너 안에서 실행한다. Docker를 전혀 다루지 않고 `.py` 파일 하나와 추정기(Estimator)만 있으면 된다.

```python
from sagemaker.pytorch import PyTorch

estimator = PyTorch(
    entry_point='train.py',        # 내 학습 스크립트
    source_dir='src',              # 의존 모듈이 있는 폴더
    role=role,
    framework_version='2.0',       # AWS가 제공하는 PyTorch 버전
    py_version='py310',
    instance_type='ml.g5.xlarge',
    instance_count=1,
    hyperparameters={'epochs': 10, 'lr': 0.001}
)
estimator.fit({'training': 's3://my-bucket/train/'})
```

학습 스크립트는 SageMaker가 약속한 환경 변수와 경로 규약을 따른다. 이 표가 스크립트 모드·BYOC 양쪽에 공통으로 적용되는 계약이다.

| 환경 변수 | 컨테이너 경로 | 의미 |
|-----------|-------------|------|
| `SM_CHANNEL_<채널명>` | `/opt/ml/input/data/<채널명>/` | `fit()`에 준 채널별 입력 데이터. 채널명 대문자로 변수명이 만들어진다 |
| `SM_MODEL_DIR` | `/opt/ml/model` | **여기 저장한 것만** `model.tar.gz`로 묶여 S3에 올라간다 |
| `SM_OUTPUT_DATA_DIR` | `/opt/ml/output/data` | 모델 외 부산물(평가 리포트·플롯 등) |
| (하이퍼파라미터) | `/opt/ml/input/config/hyperparameters.json` | `hyperparameters=`로 넘긴 값. 스크립트에는 CLI 인자로도 들어온다 |
| `SM_NUM_GPUS` | — | 인스턴스가 가진 GPU 개수 |
| `SM_HOSTS` / `SM_CURRENT_HOST` | — | 분산 학습 시 전체 호스트 목록 / 내 호스트 이름 |

```python
# train.py 내부
import argparse, os

parser = argparse.ArgumentParser()
parser.add_argument('--epochs', type=int, default=10)
parser.add_argument('--lr', type=float, default=0.001)
# SageMaker가 주입하는 표준 경로
parser.add_argument('--train', default=os.environ['SM_CHANNEL_TRAINING'])
parser.add_argument('--model-dir', default=os.environ['SM_MODEL_DIR'])
args = parser.parse_args()

# ... 학습 ...
# 모델을 SM_MODEL_DIR에 저장하면 SageMaker가 S3로 업로드
torch.save(model.state_dict(), os.path.join(args.model_dir, 'model.pth'))
```

> ⚠️ **함정**: 모델을 아무 곳에나 저장하면 SageMaker가 S3로 올려주지 않는다. 반드시 `SM_MODEL_DIR`(컨테이너 안 `/opt/ml/model`)에 저장해야 학습 종료 시 자동으로 S3 출력 경로로 압축·업로드된다. 마찬가지로 학습 데이터는 `fit()`에 준 채널 이름과 `SM_CHANNEL_<채널명>` 환경 변수가 짝을 이룬다.

### 데이터 입력 모드 — 시작 지연을 좌우한다

같은 스크립트라도 S3 데이터를 어떻게 읽어 오느냐로 시작 지연과 처리량이 달라진다.

| 입력 모드 | 동작 | 적합한 상황 |
|-----------|------|------------|
| **File** (기본) | 데이터셋 전체를 인스턴스 볼륨에 복사한 뒤 학습 시작 | 데이터가 볼륨에 들어가고, 여러 에폭 반복 접근 |
| **Pipe** | S3에서 스트리밍으로 흘려보냄. 복사 대기 없음 | 볼륨보다 큰 데이터, 순차 읽기 |
| **FastFile** | 파일시스템처럼 보이되 실제로는 필요한 부분만 지연 로딩 | 대용량인데 랜덤 접근이 필요하고 시작 지연을 줄이고 싶을 때 |

```python
from sagemaker.inputs import TrainingInput

train_input = TrainingInput(
    s3_data='s3://my-bucket/train/',
    input_mode='FastFile'          # 전체 복사 없이 바로 학습 시작
)
estimator.fit({'training': train_input})
```

## 프레임워크 컨테이너 확장: requirements.txt

스크립트 모드를 쓰되 추가 파이썬 패키지가 필요하면, Docker를 새로 만들 필요 없이 `source_dir`에 `requirements.txt`를 넣으면 된다. SageMaker가 컨테이너 시작 시 자동으로 설치한다.

```
# src/requirements.txt
transformers==4.35.0
datasets==2.14.0
```

이 방식은 "프레임워크(PyTorch)는 AWS 것 그대로, 그 위에 라이브러리 몇 개만" 추가하는 가장 흔한 중간 지점이다.

**"무엇이 필요한가"로 방법이 갈린다** — Docker를 꺼내야 하는 경계를 이 표로 외운다.

| 필요한 것 | 해결 방법 | Docker 필요? |
|-----------|----------|:---:|
| 파이썬 패키지(pip 설치 가능) | `source_dir/requirements.txt` | ✕ |
| 사내 공용 파이썬 모듈(`.py`) | `source_dir`에 함께 두거나 `dependencies=[...]` | ✕ |
| 실행 시 환경 변수 | `Estimator(environment={...})` | ✕ |
| 시스템 패키지(apt: ffmpeg, libsndfile 등) | **BYOC** | ✓ |
| 특정 CUDA·드라이버 조합 | **BYOC** | ✓ |
| AWS가 제공하지 않는 프레임워크·언어 | **BYOC** | ✓ |

> ⚠️ **함정**: `requirements.txt`에 `ffmpeg` 같은 apt 패키지 이름을 적는 보기가 자주 나온다. pip는 파이썬 패키지 인덱스만 본다 → 설치되지 않는다. "pip로 되는가"가 스크립트 모드와 BYOC를 가르는 실질적 기준이다.

> 💡 **관련 이론**: requirements.txt 자동 설치는 "불변 인프라(immutable infrastructure)"와 "가변 설정"의 절충이다. 기반 이미지는 AWS가 검증한 채로 두고(불변), 그 위 파이썬 의존성만 선언적으로 추가한다. 다만 매 학습마다 설치가 일어나므로 시작 지연이 생긴다. 의존성이 무겁거나 자주 바뀌지 않으면 차라리 BYOC로 굽는 편이 빠를 수 있다.

## BYOC: 자체 컨테이너

BYOC(Bring Your Own Container)는 Docker 이미지를 직접 만들어 ECR에 올리고, 그 이미지로 학습한다. 특수 런타임(예: 특정 CUDA·드라이버 조합), 시스템 패키지(apt), AWS가 지원하지 않는 프레임워크나 언어가 필요할 때 쓴다.

SageMaker가 컨테이너에 요구하는 규약은 단순하다. 학습 시 컨테이너를 `train` 인자로 실행할 수 있어야 하고, SageMaker가 약속한 경로를 따른다.

```dockerfile
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y python3-pip libsndfile1   # 시스템 패키지
RUN pip3 install torch custom-internal-lib

COPY train.py /opt/program/train.py
# SageMaker는 'train' 명령으로 컨테이너를 실행한다
ENTRYPOINT ["python3", "/opt/program/train.py"]
```

```
컨테이너 내부의 SageMaker 약속 경로:
/opt/ml/input/data/<채널명>/   ← 입력 데이터 (S3에서 복사됨)
/opt/ml/input/config/          ← 하이퍼파라미터(hyperparameters.json) 등
/opt/ml/model/                 ← 모델 저장 위치 (S3로 업로드됨)
/opt/ml/output/                ← 실패 시 출력
```

```python
# ECR 이미지로 학습
from sagemaker.estimator import Estimator
estimator = Estimator(
    image_uri='123456789012.dkr.ecr.us-east-1.amazonaws.com/my-train:latest',
    role=role, instance_type='ml.m5.xlarge', instance_count=1
)
estimator.fit({'training': 's3://my-bucket/train/'})
```

> 📚 **사례**: 한 음성 AI 팀이 오디오 전처리에 시스템 라이브러리(libsndfile, ffmpeg)와 특정 버전 CUDA가 필요했다. 처음엔 스크립트 모드에 requirements.txt로 해결하려 했지만 시스템 패키지는 pip로 설치되지 않아 실패했다. BYOC로 ffmpeg·libsndfile을 apt로 구운 이미지를 ECR에 올리니 깔끔하게 돌았다. 교훈: 파이썬 패키지면 스크립트 모드+requirements, 시스템 패키지·런타임이면 BYOC.

> 💡 **개념: 절충안 — 컨테이너는 내 것, 인터페이스는 SageMaker 것**
> BYOC 이미지에 `sagemaker-training` 툴킷을 설치하면, 내가 만든 이미지 안에서도 스크립트 모드처럼 `entry_point`를 넘겨 실행할 수 있다. 시스템 의존성은 이미지로 굽고, 학습 코드는 계속 `.py`로 갈아끼우는 구성이다. "BYOC = 전부 직접"이 아니라 **환경만 내려가고 코드 인터페이스는 위에 남긴다**는 감각이 실무 표준에 가깝다.

## 학습 인스턴스 선택

커스터마이징 수준과 별개로, 어떤 인스턴스에서 돌릴지도 시험 판단 지점이다.

| 계열 | 특징 | 적합한 학습 |
|------|------|------------|
| `ml.m5` / `ml.c5` | CPU 범용 / 연산 최적화 | 트리 기반·전통 ML, 소규모 표 데이터 |
| `ml.g5` | NVIDIA A10G GPU | 중소규모 딥러닝, 파인튜닝. 비용 대비 무난한 기본값 |
| `ml.p4d` | NVIDIA A100 8장 + EFA 지원 | 대규모 분산 학습 |
| `ml.p5` | NVIDIA H100 | 초대형 모델 학습 |
| `ml.trn1` | AWS Trainium(학습 전용 가속기) | 딥러닝 학습, 비용 효율 중시 |

비용을 줄이는 표준 수단은 **관리형 스팟 학습**이다. 대신 중단될 수 있으므로 체크포인트가 짝을 이룬다.

```python
estimator = PyTorch(
    entry_point='train.py', source_dir='src', role=role,
    framework_version='2.0', py_version='py310',
    instance_type='ml.g5.2xlarge', instance_count=1,
    output_path='s3://my-bucket/output/',
    use_spot_instances=True,                    # 관리형 스팟: 온디맨드 대비 큰 폭 절감
    max_run=3600,                               # 학습 자체의 최대 시간(초)
    max_wait=7200,                              # 스팟 대기 포함 총 대기(초). max_run 이상이어야 함
    checkpoint_s3_uri='s3://my-bucket/ckpt/',   # 중단 시 여기서 재개
)
```

> ⚠️ **함정**: 스팟을 켜고 `checkpoint_s3_uri`를 안 걸면, 중단될 때마다 **처음부터 다시** 학습한다. 절감액보다 재학습 비용이 커지는 역전이 실제로 일어난다. 스팟 + 체크포인트는 한 세트다.

## 자주 터지는 상황 정리

| 증상 | 원인 | 조치 |
|------|------|------|
| 학습은 성공인데 S3에 `model.tar.gz`가 없다 | `SM_MODEL_DIR`가 아닌 경로에 저장 | `/opt/ml/model`에 저장 |
| `FileNotFoundError: /opt/ml/input/data/train` | `fit()` 채널명과 코드가 참조하는 채널명 불일치 | 채널명과 `SM_CHANNEL_<채널명>`을 짝맞춤 |
| `ModuleNotFoundError: transformers` | `requirements.txt`가 `source_dir` 밖에 있음 | `source_dir` 안으로 이동 |
| apt 패키지가 설치되지 않는다 | pip로는 시스템 패키지 설치 불가 | BYOC로 이미지에 굽는다 |
| 학습 시작까지 수 분씩 지연 | 매 실행마다 무거운 의존성 설치 + File 모드 전체 복사 | 의존성은 이미지로, 입력은 FastFile/Pipe 검토 |
| 스팟 중단 후 처음부터 재시작 | 체크포인트 미설정 | `checkpoint_s3_uri` + 스크립트의 재개 로직 |
| BYOC 학습이 즉시 실패 | 컨테이너가 `train` 인자 실행을 처리하지 못함 | ENTRYPOINT/CMD 규약 점검 |

## 어떻게 고르는가

```text
내 코드가 있는가?
 ├─ 없다(표준 문제)                    → 내장 알고리즘
 └─ 있다
     ├─ 표준 PyTorch/TF/SKLearn 환경    → 스크립트 모드          ← "최소 노력" 키워드
     ├─ + pip로 되는 패키지만 추가       → requirements.txt 확장
     └─ + apt·CUDA·미지원 런타임        → BYOC (ECR 이미지)
```

- "최소 노력", "코드 수정 최소화" → 가능한 한 **위쪽**을 고른다.
- "시스템 의존성", "특정 드라이버", "우리가 쓰는 언어를 SageMaker가 지원하지 않음" → **BYOC**.
- 어떤 경로를 택하든 `/opt/ml/` 규약은 그대로다.

다음 글에서는 모델이 한 대 장비에 담기지 않거나 학습이 너무 느릴 때 쓰는 분산 학습을 본다.

## 📖 용어

- **스크립트 모드** : 내 학습 스크립트(`.py`)만 넘기고 실행 환경은 AWS 컨테이너에 맡기는 방식. Docker를 안 다뤄도 된다.
- **BYOC** : Bring Your Own Container. Docker 이미지를 직접 만들어 ECR에 올리고 그걸로 학습하는 방식.
- **ECR** : AWS의 컨테이너 이미지 저장소. BYOC 이미지를 여기 올려두면 SageMaker가 받아 쓴다.
- **추정기(Estimator)** : "이 코드를, 이 인스턴스에서, 이 설정으로 학습해 달라"를 담은 SageMaker SDK 객체. `fit()`으로 실행한다.
- **채널(channel)** : `fit()`에 넘기는 입력 데이터 묶음의 이름표. `training`, `validation` 처럼 붙이고 컨테이너 경로가 그 이름으로 만들어진다.
- **`SM_MODEL_DIR`** : 컨테이너 안 `/opt/ml/model`. 여기 저장한 파일만 학습 종료 후 S3로 올라간다.
- **`model.tar.gz`** : SageMaker가 모델 디렉터리를 묶어 만든 산출물 압축 파일. 이후 배포의 입력이 된다.
- **입력 모드** : S3 데이터를 컨테이너에 어떻게 넣을지의 방식. File(전부 복사)·Pipe(스트리밍)·FastFile(필요할 때 지연 로딩).
- **관리형 스팟 학습** : 남는 용량을 싸게 쓰는 대신 중단될 수 있는 학습 모드. 체크포인트와 함께 쓴다.
- **체크포인트** : 학습 중간 상태를 주기적으로 저장해 둔 것. 중단돼도 처음부터가 아니라 그 지점부터 재개할 수 있다.

## 📝 연습 문제

**문제 1.** 한 팀이 PyTorch로 작성한 학습 코드를 SageMaker에서 최소한의 노력으로 돌리려 한다. 환경은 표준 PyTorch면 충분하고 특수한 시스템 패키지는 없다. 가장 적합한 방식은?

A) 모든 것을 직접 만든 Docker 이미지(BYOC)  
B) 스크립트 모드로 train.py를 PyTorch Estimator에 전달  
C) 내장 알고리즘만 사용  
D) EC2에 수동으로 PyTorch를 설치해 학습  

**정답: B**  
해설: 표준 PyTorch 환경에 학습 스크립트만 있으면 스크립트 모드가 가장 빠르며 Docker를 다룰 필요가 없다. A는 시스템 의존성이 없는데 불필요하게 컨테이너를 직접 빌드하는 과잉 작업이고, C는 자체 PyTorch 코드를 쓸 수 없으며, D는 SageMaker의 관리형 학습 이점을 버리는 수동 방식이다.

---

**문제 2.** 스크립트 모드 학습에서 학습 종료 후 모델 산출물이 S3에 자동으로 업로드되지 않았다. 가장 가능성 높은 원인은?

A) instance_count를 1로 설정했다  
B) 모델을 SM_MODEL_DIR(/opt/ml/model)이 아닌 임의 경로에 저장했다  
C) framework_version을 명시했다  
D) 하이퍼파라미터를 전달했다  

**정답: B**  
해설: SageMaker는 `/opt/ml/model`(SM_MODEL_DIR)에 저장된 산출물만 학습 종료 시 압축해 S3로 업로드한다. A·C·D는 모두 정상적인 학습 설정으로 산출물 업로드와 무관하며, 저장 경로 규약을 어긴 것이 직접 원인이다.

---

**문제 3.** 스크립트 모드를 쓰되 학습 코드가 transformers, datasets 같은 추가 파이썬 패키지를 필요로 한다. Docker를 직접 만들지 않고 해결하는 방법은?

A) BYOC로 처음부터 이미지를 만든다  
B) source_dir에 requirements.txt를 넣어 SageMaker가 자동 설치하게 한다  
C) 패키지를 학습 데이터에 포함시킨다  
D) 내장 알고리즘으로 전환한다  

**정답: B**  
해설: AWS 프레임워크 컨테이너는 source_dir의 requirements.txt를 시작 시 자동 설치하므로 파이썬 패키지 추가에 Docker 빌드가 필요 없다. A는 파이썬 패키지만 필요한데 과한 작업이고, C는 데이터와 의존성을 혼동한 것이며, D는 자체 코드를 포기하는 선택이다.

---

**문제 4.** 학습 코드가 ffmpeg, libsndfile 같은 시스템 레벨 패키지(apt)와 특정 CUDA 드라이버 조합을 요구한다. 적합한 접근은?

A) requirements.txt에 ffmpeg를 적는다  
B) 스크립트 모드만으로 처리한다  
C) BYOC로 시스템 패키지와 런타임을 구운 자체 Docker 이미지를 ECR에 올려 사용한다  
D) 하이퍼파라미터로 ffmpeg를 전달한다  

**정답: C**  
해설: 시스템 레벨 패키지와 특수 런타임은 pip로 설치되지 않으므로 BYOC로 Docker 이미지에 직접 구워 ECR에 올려야 한다. A는 pip 전용이라 apt 패키지 설치가 안 되고, B도 같은 한계가 있으며, D는 하이퍼파라미터의 용도와 무관하다.

---

**문제 5.** BYOC로 학습 컨테이너를 만들 때 SageMaker가 입력 데이터를 컨테이너 내부에 복사하는 표준 경로는?

A) /opt/ml/input/data/<채널명>/  
B) /home/user/data/  
C) /tmp/sagemaker/  
D) /var/log/training/  

**정답: A**  
해설: SageMaker는 fit()에 지정한 채널의 데이터를 컨테이너 내 `/opt/ml/input/data/<채널명>/`에 복사하며, 모델은 `/opt/ml/model`에 저장하는 규약을 따른다. B·C·D는 임의 경로로 SageMaker 규약이 아니어서 해당 위치에 데이터가 자동 배치되지 않는다.

---
