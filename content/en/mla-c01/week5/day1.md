# Day 1 - Custom Training: Script Mode, BYOC, Framework Containers

## 📌 Key Takeaways

- Custom training is a **spectrum of "how much of my own code do I bring"** — built-in algorithm → script mode → requirements extension → BYOC.
- **Script mode**: give only `train.py` and the AWS framework container runs it. No Docker needed → the "minimum effort" answer on the exam.
- **requirements.txt extension**: when you only need more Python packages. Put it in `source_dir` and it is installed automatically when the container starts.
- **BYOC**: only for system packages (apt), special runtimes, or unsupported frameworks. An ECR image + the `/opt/ml/` path conventions.
- If you break the conventions it fails silently — data is read from `SM_CHANNEL_<channel name>`, and the model must be saved to `SM_MODEL_DIR`.

## Three Levels of Customization

In practice, you often need to train a model you wrote yourself in PyTorch or TensorFlow, or you need your own environment that bundles your company's standard libraries. SageMaker training is distinguished by "how much of the AWS-provided container you use as is."

| Approach | What I bring | Container | Suitable situation |
|------|----------------|---------|------------|
| Built-in algorithm | (nothing, only data) | AWS managed | Standard problems, no code needed |
| Script mode | One training script | AWS framework container | Run PyTorch/TF code quickly |
| Framework container extension | Script + extra packages | AWS container + requirements | Framework stays as is, only dependencies added |
| BYOC (own container) | The whole Docker image | An image I built | Special runtime, system dependencies |

- Core intuition: **the higher up, the easier; the lower down, the freer.**
- The exam asks in the form "do X with the least effort" → if the requirement is at the **framework-code level, use script mode**; if it is at the **system-package or special-runtime level, use BYOC**.
- Whichever approach you pick, **the lifecycle of the training job and the path conventions are the same**. These conventions are the real point of exam questions.

This layered structure is a classic case of "separation of concerns." If you separate the training logic (my code) from the execution environment (the container), then when the environment is stable you just swap the code (script mode), and you build the environment yourself only when the environment itself is special (BYOC). Dropping to a lower layer than necessary saddles you with the burden of building and maintaining Docker images, so the principle is "go down only as far as needed."

## The Lifecycle of One Training Job

When you call `fit()`, the sequence below runs regardless of the approach. You need to pinpoint where things break on top of this diagram.

```text
estimator.fit({'training': 's3://.../train/'})
   │
   ├─ ① Provision the training instance      (ml.g5.xlarge etc.; billing starts here)
   ├─ ② Pull the container image             (AWS framework image or my ECR image)
   ├─ ③ S3 → /opt/ml/input/data/<channel>/   (File mode copies everything before starting)
   ├─ ④ Download source_dir + install requirements.txt
   ├─ ⑤ Run entry_point                      (BYOC runs the container with the `train` argument)
   ├─ ⑥ /opt/ml/model/ → model.tar.gz → upload to S3 output_path
   └─ ⑦ Shut down the instance               (billing ends)
```

- If the data is not visible at ③ → **channel name mismatch**.
- If ④ takes a long time → **the dependencies are heavy** (better to bake them into an image).
- If there is no artifact at ⑥ → **violation of the save-path convention**.

## Script Mode: Framework Code As Is

Script mode runs a training script written in PyTorch, TensorFlow, Scikit-learn, and so on inside an AWS-managed framework container. You never touch Docker; all you need is a single `.py` file and an Estimator.

```python
from sagemaker.pytorch import PyTorch

estimator = PyTorch(
    entry_point='train.py',        # my training script
    source_dir='src',              # folder with dependent modules
    role=role,
    framework_version='2.0',       # PyTorch version provided by AWS
    py_version='py310',
    instance_type='ml.g5.xlarge',
    instance_count=1,
    hyperparameters={'epochs': 10, 'lr': 0.001}
)
estimator.fit({'training': 's3://my-bucket/train/'})
```

The training script follows the environment variables and path conventions that SageMaker promises. This table is the contract that applies in common to both script mode and BYOC.

| Environment variable | Container path | Meaning |
|-----------|-------------|------|
| `SM_CHANNEL_<channel name>` | `/opt/ml/input/data/<channel name>/` | Input data per channel given to `fit()`. The variable name is built from the channel name in uppercase |
| `SM_MODEL_DIR` | `/opt/ml/model` | **Only what you save here** is bundled into `model.tar.gz` and uploaded to S3 |
| `SM_OUTPUT_DATA_DIR` | `/opt/ml/output/data` | By-products other than the model (evaluation reports, plots, etc.) |
| (hyperparameters) | `/opt/ml/input/config/hyperparameters.json` | Values passed through `hyperparameters=`. They also reach the script as CLI arguments |
| `SM_NUM_GPUS` | — | Number of GPUs the instance has |
| `SM_HOSTS` / `SM_CURRENT_HOST` | — | In distributed training, the list of all hosts / my host name |

```python
# inside train.py
import argparse, os

parser = argparse.ArgumentParser()
parser.add_argument('--epochs', type=int, default=10)
parser.add_argument('--lr', type=float, default=0.001)
# standard paths injected by SageMaker
parser.add_argument('--train', default=os.environ['SM_CHANNEL_TRAINING'])
parser.add_argument('--model-dir', default=os.environ['SM_MODEL_DIR'])
args = parser.parse_args()

# ... training ...
# if you save the model to SM_MODEL_DIR, SageMaker uploads it to S3
torch.save(model.state_dict(), os.path.join(args.model_dir, 'model.pth'))
```

> ⚠️ **Pitfall**: If you save the model anywhere else, SageMaker will not upload it to S3. You must save it to `SM_MODEL_DIR` (`/opt/ml/model` inside the container) so that it is automatically compressed and uploaded to the S3 output path when training ends. Likewise, the channel name given to `fit()` and the `SM_CHANNEL_<channel name>` environment variable are paired with each other for the training data.

### Data Input Modes — They Decide the Start-Up Delay

Even with the same script, how the S3 data is read in changes the start-up delay and throughput.

| Input mode | Behavior | Suitable situation |
|-----------|------|------------|
| **File** (default) | Copies the entire dataset to the instance volume and then starts training | The data fits on the volume, and is accessed repeatedly over several epochs |
| **Pipe** | Streams from S3. No wait for copying | Data larger than the volume, sequential reads |
| **FastFile** | Looks like a file system but actually lazy-loads only the parts needed | Large data that needs random access and where you want to cut the start-up delay |

```python
from sagemaker.inputs import TrainingInput

train_input = TrainingInput(
    s3_data='s3://my-bucket/train/',
    input_mode='FastFile'          # start training right away without a full copy
)
estimator.fit({'training': train_input})
```

## Framework Container Extension: requirements.txt

If you use script mode but need extra Python packages, you do not have to build a new Docker image — just put a `requirements.txt` in `source_dir`. SageMaker installs it automatically when the container starts.

```
# src/requirements.txt
transformers==4.35.0
datasets==2.14.0
```

This approach is the most common middle ground: "the framework (PyTorch) stays AWS's, and only a few libraries are added on top."

**The method depends on "what is needed"** — memorize the boundary at which you have to reach for Docker with this table.

| What is needed | Solution | Docker needed? |
|-----------|----------|:---:|
| Python package (pip-installable) | `source_dir/requirements.txt` | ✕ |
| Company-shared Python modules (`.py`) | Place them in `source_dir` or use `dependencies=[...]` | ✕ |
| Environment variables at run time | `Estimator(environment={...})` | ✕ |
| System packages (apt: ffmpeg, libsndfile, etc.) | **BYOC** | ✓ |
| A specific CUDA/driver combination | **BYOC** | ✓ |
| Frameworks/languages AWS does not provide | **BYOC** | ✓ |

> ⚠️ **Pitfall**: A choice that writes an apt package name such as `ffmpeg` into `requirements.txt` is wrong. pip looks only at the Python package index → it will not be installed. "Can pip do it?" is the practical criterion separating script mode from BYOC.

The automatic installation from requirements.txt is a compromise between "immutable infrastructure" and "mutable configuration." The base image stays as AWS validated it (immutable), and only the Python dependencies on top are added declaratively. But since installation happens on every training run, it adds start-up delay. If the dependencies are heavy or rarely change, baking them in with BYOC can actually be faster.

## BYOC: Your Own Container

BYOC (Bring Your Own Container) means building a Docker image yourself, pushing it to ECR, and training with that image. You use it when you need a special runtime (for example a specific CUDA/driver combination), system packages (apt), or a framework or language that AWS does not support.

The convention SageMaker requires of the container is simple. At training time the container must be runnable with the `train` argument, and it follows the paths SageMaker promises.

```dockerfile
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y python3-pip libsndfile1   # system packages
RUN pip3 install torch custom-internal-lib

COPY train.py /opt/program/train.py
# SageMaker runs the container with the 'train' command
ENTRYPOINT ["python3", "/opt/program/train.py"]
```

```
SageMaker's promised paths inside the container:
/opt/ml/input/data/<channel>/  ← input data (copied from S3)
/opt/ml/input/config/          ← hyperparameters (hyperparameters.json), etc.
/opt/ml/model/                 ← where the model is saved (uploaded to S3)
/opt/ml/output/                ← output on failure
```

```python
# train with an ECR image
from sagemaker.estimator import Estimator
estimator = Estimator(
    image_uri='123456789012.dkr.ecr.us-east-1.amazonaws.com/my-train:latest',
    role=role, instance_type='ml.m5.xlarge', instance_count=1
)
estimator.fit({'training': 's3://my-bucket/train/'})
```

A voice AI team needed system libraries (libsndfile, ffmpeg) and a specific CUDA version for audio preprocessing. At first they tried to solve it with script mode plus requirements.txt, but system packages cannot be installed with pip, so it failed. When they pushed an image with ffmpeg and libsndfile baked in via apt to ECR and used BYOC, it ran cleanly. Lesson: for Python packages use script mode + requirements; for system packages or runtimes use BYOC.

**Concept: a compromise — the container is mine, the interface is SageMaker's**
If you install the `sagemaker-training` toolkit in a BYOC image, you can pass `entry_point` and run it inside your own image just like script mode. The system dependencies are baked into the image, and the training code is still swapped as a `.py` file. The sense that "BYOC does not mean everything by hand" — **only the environment goes down while the code interface stays on top** — is closer to the standard in practice.

## Choosing the Training Instance

Separately from the customization level, which instance to run on is also a judgment point on the exam.

| Family | Characteristics | Suitable training |
|------|------|------------|
| `ml.m5` / `ml.c5` | CPU general purpose / compute optimized | Tree-based and traditional ML, small tabular data |
| `ml.g5` | NVIDIA A10G GPU | Small and medium deep learning, fine-tuning. A reasonable default for the cost |
| `ml.p4d` | 8 NVIDIA A100 + EFA support | Large-scale distributed training |
| `ml.p5` | NVIDIA H100 | Training very large models |
| `ml.trn1` | AWS Trainium (training-only accelerator) | Deep learning training, when cost efficiency matters |

The standard way to cut cost is **managed Spot training**. In exchange it can be interrupted, so it is paired with checkpoints.

```python
estimator = PyTorch(
    entry_point='train.py', source_dir='src', role=role,
    framework_version='2.0', py_version='py310',
    instance_type='ml.g5.2xlarge', instance_count=1,
    output_path='s3://my-bucket/output/',
    use_spot_instances=True,                    # managed Spot: large savings vs. on-demand
    max_run=3600,                               # max time of the training itself (seconds)
    max_wait=7200,                              # total wait including Spot waiting (seconds). Must be >= max_run
    checkpoint_s3_uri='s3://my-bucket/ckpt/',   # resume from here on interruption
)
```

If you turn on Spot and do not set `checkpoint_s3_uri`, it trains **from scratch** every time it is interrupted. A reversal in which the retraining cost exceeds the savings really does happen. Spot + checkpoints are one set.

## Roundup of Situations That Frequently Blow Up

| Symptom | Cause | Action |
|------|------|------|
| Training succeeds but there is no `model.tar.gz` in S3 | Saved to a path other than `SM_MODEL_DIR` | Save to `/opt/ml/model` |
| `FileNotFoundError: /opt/ml/input/data/train` | The channel name in `fit()` does not match the one the code references | Match the channel name with `SM_CHANNEL_<channel name>` |
| `ModuleNotFoundError: transformers` | `requirements.txt` is outside `source_dir` | Move it inside `source_dir` |
| An apt package is not installed | pip cannot install system packages | Bake it into the image with BYOC |
| Several minutes of delay before training starts | Heavy dependency installs on every run + File mode full copy | Put dependencies in the image, consider FastFile/Pipe for input |
| Restarts from scratch after a Spot interruption | No checkpoint configured | `checkpoint_s3_uri` + resume logic in the script |
| BYOC training fails immediately | The container cannot handle being run with the `train` argument | Check the ENTRYPOINT/CMD convention |

## How to Choose

```text
Do I have my own code?
 ├─ No (standard problem)                   → built-in algorithm
 └─ Yes
     ├─ Standard PyTorch/TF/SKLearn environment  → script mode          ← "minimum effort" keyword
     ├─ + only pip-installable packages added    → requirements.txt extension
     └─ + apt, CUDA, unsupported runtime         → BYOC (ECR image)
```

- "Minimum effort," "minimize code changes" → pick as **high up** as possible.
- "System dependencies," "specific driver," "SageMaker does not support the language we use" → **BYOC**.
- Whichever path you take, the `/opt/ml/` conventions remain the same.

In the next lesson we look at distributed training, used when the model does not fit on one machine or training is too slow.

## 📖 Glossary

- **Script mode**: A way of passing only my training script (`.py`) and leaving the execution environment to the AWS container. You do not have to deal with Docker.
- **BYOC**: Bring Your Own Container. A way of building a Docker image yourself, pushing it to ECR, and training with it.
- **ECR**: AWS's container image registry. If you push a BYOC image here, SageMaker pulls and uses it.
- **Estimator**: A SageMaker SDK object that holds "train this code, on this instance, with these settings." You run it with `fit()`.
- **Channel**: The label for a bundle of input data passed to `fit()`. You name it like `training` or `validation`, and the container path is built from that name.
- **`SM_MODEL_DIR`**: `/opt/ml/model` inside the container. Only files saved here are uploaded to S3 after training ends.
- **`model.tar.gz`**: The artifact archive SageMaker builds by bundling the model directory. It becomes the input for later deployment.
- **Input mode**: How S3 data is put into the container. File (copy everything), Pipe (streaming), FastFile (lazy loading when needed).
- **Managed Spot training**: A training mode that uses spare capacity cheaply but can be interrupted. Used together with checkpoints.
- **Checkpoint**: The intermediate training state saved periodically. Even after an interruption, training can resume from that point rather than from the start.

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
