# Day 1 - 커스텀 학습: 스크립트 모드, BYOC, 프레임워크 컨테이너

지난 주에는 SageMaker의 내장 알고리즘으로 모델을 학습했다. 하지만 실무에서는 PyTorch나 TensorFlow로 직접 짠 모델을 학습하거나, 회사 표준 라이브러리를 묶은 자체 환경에서 학습해야 할 때가 많다. SageMaker는 "내 코드를 어디까지 가져오느냐"에 따라 세 가지 커스텀 학습 방식을 제공한다.

MLA-C01 시험에서 이 주제는 "프레임워크 코드를 최소 수정으로 가져오고 싶다", "특수한 의존성·시스템 패키지가 필요하다" 같은 상황으로 등장한다. 오늘은 스크립트 모드, BYOC, 프레임워크 컨테이너 세 축의 경계를 명확히 한다.

## 세 가지 커스터마이징 수준

SageMaker 학습은 "AWS가 제공하는 컨테이너를 얼마나 그대로 쓰느냐"로 구분된다.

| 방식 | 내가 가져오는 것 | 컨테이너 | 적합한 상황 |
|------|----------------|---------|------------|
| 내장 알고리즘 | (없음, 데이터만) | AWS 관리 | 표준 문제, 코드 작성 불요 |
| 스크립트 모드 | 학습 스크립트 1개 | AWS 프레임워크 컨테이너 | PyTorch/TF 코드를 빠르게 |
| 프레임워크 컨테이너 확장 | 스크립트 + 추가 패키지 | AWS 컨테이너 + requirements | 프레임워크는 그대로, 의존성만 추가 |
| BYOC (자체 컨테이너) | Docker 이미지 전체 | 내가 만든 이미지 | 특수 런타임·시스템 의존성 |

핵심 직관: **위로 갈수록 편하고, 아래로 갈수록 자유롭다.** 시험은 "최소한의 노력으로 X를 하라"는 식으로 묻기 때문에, 요구사항이 프레임워크 코드 수준이면 스크립트 모드, 시스템 패키지나 특수 런타임 수준이면 BYOC를 고르는 판단이 중요하다.

> 💡 **관련 이론**: 이 계층 구조는 "관심사 분리(separation of concerns)"의 전형이다. 학습 로직(내 코드)과 실행 환경(컨테이너)을 분리하면, 환경이 안정적일 때는 코드만 갈아끼우고(스크립트 모드) 환경 자체가 특수할 때만 환경을 직접 만든다(BYOC). 불필요하게 낮은 계층으로 내려가면 Docker 빌드·유지보수 부담을 떠안게 되므로, "필요한 만큼만 내려간다"가 원칙이다.

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

학습 스크립트는 SageMaker가 약속한 환경 변수와 경로 규약을 따른다. 데이터는 `SM_CHANNEL_TRAINING`, 모델 저장 위치는 `SM_MODEL_DIR` 같은 환경 변수로 전달된다.

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

## 프레임워크 컨테이너 확장: requirements.txt

스크립트 모드를 쓰되 추가 파이썬 패키지가 필요하면, Docker를 새로 만들 필요 없이 `source_dir`에 `requirements.txt`를 넣으면 된다. SageMaker가 컨테이너 시작 시 자동으로 설치한다.

```
# src/requirements.txt
transformers==4.35.0
datasets==2.14.0
```

이 방식은 "프레임워크(PyTorch)는 AWS 것 그대로, 그 위에 라이브러리 몇 개만" 추가하는 가장 흔한 중간 지점이다. 시스템 레벨 패키지(apt 패키지, CUDA 버전 변경 등)는 이 방식으로 안 되고 BYOC가 필요하다.

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

## 어떻게 고르는가

시험 판단 흐름은 이렇다. ① 표준 문제이고 코드가 필요 없으면 → 내장 알고리즘. ② PyTorch/TF 코드가 있고 환경은 표준이면 → 스크립트 모드. ③ 거기에 파이썬 패키지 몇 개만 더 필요하면 → requirements.txt 확장. ④ 시스템 패키지·특수 런타임·미지원 프레임워크면 → BYOC. "최소 노력" 키워드가 보이면 가능한 한 위쪽(스크립트 모드)을 고른다.

## 정리하며

커스텀 학습은 "내 코드를 어디까지 가져오느냐"의 스펙트럼이다. **스크립트 모드**는 학습 스크립트만 가져와 AWS 프레임워크 컨테이너에서 돌리며, `SM_CHANNEL_*`/`SM_MODEL_DIR` 규약을 따른다. **requirements.txt 확장**은 파이썬 패키지만 추가한다. **BYOC**는 Docker 이미지 전체를 직접 만들어 시스템 패키지·특수 런타임까지 통제하되, `/opt/ml/` 경로 규약과 `train` 실행 규약을 지킨다. 시험에서 "프레임워크 코드 최소 수정"은 스크립트 모드, "시스템 의존성"은 BYOC라는 매핑이 핵심이다.

다음 글에서는 모델이 한 대 장비에 담기지 않거나 학습이 너무 느릴 때 쓰는 분산 학습을 본다.

---

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
