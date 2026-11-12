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

## 📝 Practice Questions

**Question 1.** A team wants to run training code written in PyTorch on SageMaker with minimal effort. A standard PyTorch environment is sufficient and there are no special system packages. What is the most suitable approach?

A) A fully custom-built Docker image (BYOC)  
B) Pass train.py to the PyTorch Estimator in script mode  
C) Use only built-in algorithms  
D) Manually install PyTorch on EC2 and train there  

**Answer: B**  
Explanation: When you have a standard PyTorch environment and only a training script, script mode is the fastest and you do not need to deal with Docker. A is excessive work that builds a container unnecessarily when there are no system dependencies, C cannot use your own PyTorch code, and D is a manual approach that gives up the benefits of SageMaker managed training.

---

**Question 2.** In script mode training, the model artifacts were not automatically uploaded to S3 after training ended. What is the most likely cause?

A) instance_count was set to 1  
B) The model was saved to an arbitrary path instead of SM_MODEL_DIR (/opt/ml/model)  
C) framework_version was specified explicitly  
D) Hyperparameters were passed  

**Answer: B**  
Explanation: SageMaker compresses and uploads to S3 at the end of training only the artifacts saved in `/opt/ml/model` (SM_MODEL_DIR). A, C, and D are all normal training settings unrelated to artifact upload, and violating the save path convention is the direct cause.

---

**Question 3.** You use script mode, but the training code needs additional Python packages such as transformers and datasets. How can you solve this without building Docker yourself?

A) Build the image from scratch with BYOC  
B) Put requirements.txt in source_dir so SageMaker installs it automatically  
C) Include the packages in the training data  
D) Switch to a built-in algorithm  

**Answer: B**  
Explanation: AWS framework containers automatically install the requirements.txt in source_dir at startup, so no Docker build is needed to add Python packages. A is excessive work when only Python packages are needed, C confuses data with dependencies, and D means giving up your own code.

---

**Question 4.** The training code requires system-level packages (apt) such as ffmpeg and libsndfile and a specific CUDA driver combination. What is the suitable approach?

A) Write ffmpeg in requirements.txt  
B) Handle it with script mode alone  
C) Use BYOC: upload to ECR your own Docker image with the system packages and runtime baked in  
D) Pass ffmpeg as a hyperparameter  

**Answer: C**  
Explanation: System-level packages and special runtimes cannot be installed with pip, so they must be baked directly into a Docker image with BYOC and uploaded to ECR. A cannot install apt packages because it is pip-only, B has the same limitation, and D has nothing to do with the purpose of hyperparameters.

---

**Question 5.** When building a training container with BYOC, what is the standard path where SageMaker copies input data inside the container?

A) /opt/ml/input/data/<channel-name>/  
B) /home/user/data/  
C) /tmp/sagemaker/  
D) /var/log/training/  

**Answer: A**  
Explanation: SageMaker copies the data of the channels specified in fit() to `/opt/ml/input/data/<channel-name>/` inside the container, and follows the convention of saving the model to `/opt/ml/model`. B, C, and D are arbitrary paths that are not SageMaker conventions, so data is not automatically placed there.

---
