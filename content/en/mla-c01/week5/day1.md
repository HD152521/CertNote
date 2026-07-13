# Day 1 - Custom Training: Script Mode, BYOC, Framework Containers

Last week we trained models using SageMaker's built-in algorithms. But in practice, you often need to train models written directly in PyTorch or TensorFlow, or train in your own environment bundling company standard libraries. SageMaker offers three custom training modes depending on "how much of my code do I bring".

In the MLA-C01 exam, this topic appears in scenarios like "I want to bring framework code with minimal changes", "I need special dependencies·system packages". Today we clarify the boundaries of three axes: script mode, BYOC, and framework containers.

## Three Customization Levels

SageMaker training divides by "how much of AWS's provided container you keep as-is":

| Method | I Provide | Container | Fits When |
|---|---|---|---|
| Built-in Algorithms | (nothing, data only) | AWS Managed | Standard problems, no code needed |
| Script Mode | One training script | AWS Framework Container | Quick PyTorch/TF code |
| Framework Container Extension | Script + extra packages | AWS Container + requirements | Framework as-is, only add dependencies |
| BYOC (self container) | Entire Docker image | Image I built | Special runtime, system dependencies |

Core intuition: **Higher is easier, lower is freer.** Since exams ask "do X with minimum effort", choosing script mode when requirements are framework code level, and BYOC for system packages or special runtimes, is key.

> 💡 **Related Theory**: This hierarchy exemplifies "separation of concerns". Split training logic (my code) from execution environment (container), so when environment is stable you swap only code (script mode), only when environment itself is special do you build it (BYOC). Dropping unnecessarily to lower tiers incurs Docker build and maintenance burden, so "go down only as needed" is the rule.

## Script Mode: Framework Code As-Is

Script mode runs training scripts written in PyTorch, TensorFlow, Scikit-learn, etc. inside an AWS-managed framework container. No Docker needed—just one `.py` file and an Estimator.

```python
from sagemaker.pytorch import PyTorch

estimator = PyTorch(
    entry_point='train.py',        # My training script
    source_dir='src',              # Folder with dependent modules
    role=role,
    framework_version='2.0',       # AWS-provided PyTorch version
    py_version='py310',
    instance_type='ml.g5.xlarge',
    instance_count=1,
    hyperparameters={'epochs': 10, 'lr': 0.001}
)
estimator.fit({'training': 's3://my-bucket/train/'})
```

The training script follows SageMaker's promised environment variables and path conventions. Data arrives via `SM_CHANNEL_TRAINING`, model save location via `SM_MODEL_DIR` etc.

```python
# Inside train.py
import argparse, os

parser = argparse.ArgumentParser()
parser.add_argument('--epochs', type=int, default=10)
parser.add_argument('--lr', type=float, default=0.001)
# Standard paths SageMaker injects
parser.add_argument('--train', default=os.environ['SM_CHANNEL_TRAINING'])
parser.add_argument('--model-dir', default=os.environ['SM_MODEL_DIR'])
args = parser.parse_args()

# ... training ...
# Saving model to SM_MODEL_DIR triggers SageMaker's auto S3 upload
torch.save(model.state_dict(), os.path.join(args.model_dir, 'model.pth'))
```

> ⚠️ **Pitfall**: Save model anywhere and SageMaker won't upload to S3. Must save to `SM_MODEL_DIR` (`/opt/ml/model` inside container)—only then it auto-compresses and uploads to S3 output path at job end. Likewise, training data channels pair with `SM_CHANNEL_<channelname>` environment variables from the `fit()` call.

## Framework Container Extension: requirements.txt

Using script mode but need extra Python packages? No need to build Docker—just add `requirements.txt` to `source_dir`. SageMaker auto-installs on container start.

```
# src/requirements.txt
transformers==4.35.0
datasets==2.14.0
```

This is the most common middle ground: "framework (PyTorch) as AWS provides it, just add a few libraries on top". System-level packages (apt packages, CUDA version changes) don't work this way and need BYOC.

> 💡 **Related Theory**: Auto-installing requirements.txt is a compromise between "immutable infrastructure" and "mutable config". Base image stays AWS-validated (immutable), only Python dependencies added declaratively on top. But installation happens per training, causing startup lag. If dependencies are heavy or rarely change, baking them into BYOC image may be faster.

## BYOC: Bring Your Own Container

BYOC (Bring Your Own Container) means building a Docker image directly, uploading to ECR, and training with it. Use when you need special runtimes (specific CUDA·driver combos), system packages (apt), or frameworks/languages AWS doesn't support.

SageMaker's container contract is simple: training must run the container with `train` argument, following SageMaker's promised paths.

```dockerfile
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y python3-pip libsndfile1   # System packages
RUN pip3 install torch custom-internal-lib

COPY train.py /opt/program/train.py
# SageMaker runs container with 'train' command
ENTRYPOINT ["python3", "/opt/program/train.py"]
```

```
SageMaker's promised paths inside container:
/opt/ml/input/data/<channelname>/   ← Input data (copied from S3)
/opt/ml/input/config/          ← Hyperparameters (hyperparameters.json), etc.
/opt/ml/model/                 ← Model save location (uploads to S3)
/opt/ml/output/                ← Output on failure
```

```python
# Training with ECR image
from sagemaker.estimator import Estimator
estimator = Estimator(
    image_uri='123456789012.dkr.ecr.us-east-1.amazonaws.com/my-train:latest',
    role=role, instance_type='ml.m5.xlarge', instance_count=1
)
estimator.fit({'training': 's3://my-bucket/train/'})
```

> 📚 **Case**: An audio AI team needed system libraries (libsndfile, ffmpeg) and a specific CUDA version for audio preprocessing. Initially they tried script mode with requirements.txt for the system packages, but pip can't install those—failed. With BYOC, baking ffmpeg and libsndfile via apt into the image and uploading to ECR worked cleanly. Lesson: Python packages → script mode+requirements, system packages·runtime → BYOC.

## How to Choose

Exam decision flow: ① Standard problem, no code needed → built-in algorithms. ② PyTorch/TF code exists, standard environment → script mode. ③ Need just a few Python packages on top → requirements.txt extension. ④ System packages, special runtime, unsupported framework → BYOC. When "minimum effort" appears, pick as high (script mode) as possible.

## Summary

Custom training is a spectrum of "how much of my code I bring". **Script mode** brings only training script, runs in AWS framework container, follows `SM_CHANNEL_*`/`SM_MODEL_DIR` conventions. **requirements.txt extension** adds only Python packages. **BYOC** builds entire Docker image directly, controlling system packages and special runtimes, but respects `/opt/ml/` path and `train` execution contracts. The exam mapping is critical: "framework code minimal changes" → script mode, "system dependencies" → BYOC.

Next we see distributed training when a model doesn't fit one machine or training is too slow.

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
