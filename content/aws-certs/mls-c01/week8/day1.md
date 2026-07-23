# Day 1 - SageMaker 학습 작업: Estimator, 입력 모드, 분산 학습, Spot

Week 8은 도메인 3(Modeling)의 후반부 — 모델을 "어떻게 학습시키고, 어떻게 튜닝하고, 어떻게 일반화시키는가"를 다룬다. 오늘은 학습의 실행 기반인 **SageMaker Training Job**을 파고든다. 알고리즘을 골랐다면(Week 6), 다음 질문은 "이 학습을 어떤 컴퓨트 위에서, 어떤 데이터 전달 방식으로, 얼마나 싸게 돌릴 것인가"다. 시험은 Estimator 설정, 입력 모드(File/Pipe/FastFile), 분산 학습 전략, Spot 학습 비용 절감을 단서로 출제한다.

## Training Job의 동작 모델

SageMaker 학습 작업의 흐름은 항상 동일하다.

```text
1. Estimator 정의 (이미지, 인스턴스, 하이퍼파라미터, 출력 경로)
2. fit() 호출 → 학습 인스턴스 프로비저닝
3. S3에서 학습 데이터를 컨테이너로 전달 (입력 모드)
4. /opt/ml/input/data/<channel> 에 데이터, /opt/ml/model 에 산출물 기록
5. 학습 종료 → /opt/ml/model 을 S3(output_path)로 자동 업로드(tar.gz)
6. 인스턴스 종료 (과금 중단)
```

핵심은 **인스턴스는 작업 동안만 살아 있고**, 모델 산출물은 `/opt/ml/model`에 쓴 것만 S3로 올라간다는 점이다. 학습 컨테이너의 표준 경로를 외워두면 함정형 문제(체크포인트 경로, 산출물 경로)에 강해진다.

```text
/opt/ml/input/data/<channel_name>   ← 입력 데이터 채널
/opt/ml/input/config/               ← 하이퍼파라미터, 리소스 설정(JSON)
/opt/ml/model/                      ← 모델 산출물(S3로 자동 업로드)
/opt/ml/output/                     ← 실패 시 failure 파일
/opt/ml/checkpoints/                ← 체크포인트(설정 시 S3와 동기화)
```

> 💡 **관련 이론**: SageMaker 학습은 "관리형 일회성 배치 잡"이다. 인스턴스가 영구히 떠 있는 EC2가 아니라, fit() 시 떴다가 끝나면 사라지는 구조다. 따라서 학습 중간 상태를 보존하려면 반드시 체크포인트를 S3로 내보내야 한다. 이 일회성 특성이 곧 뒤에 나오는 Spot 학습(저렴하지만 중단 가능)이 자연스럽게 어울리는 이유다.

## Estimator 구성

Python SDK의 `Estimator`(또는 프레임워크별 `PyTorch`, `TensorFlow`, `XGBoost` Estimator)가 학습 작업을 정의한다.

```python
from sagemaker.estimator import Estimator

est = Estimator(
    image_uri=xgboost_image,          # 빌트인/커스텀 컨테이너 이미지
    role=role,
    instance_count=1,
    instance_type="ml.m5.xlarge",
    output_path="s3://bucket/output", # 모델 산출물 위치
    hyperparameters={"max_depth": 5, "num_round": 100},
)
est.fit({"train": train_s3, "validation": val_s3})
```

- **instance_count > 1**이면 분산 학습으로 들어간다(아래 참조).
- 채널 이름(`train`, `validation`)은 컨테이너 안에서 `/opt/ml/input/data/<채널>` 경로가 된다.
- 커스텀 코드를 쓰려면 `entry_point`와 `source_dir`로 스크립트 모드를 사용한다.

## 입력 모드: File vs Pipe vs FastFile

학습 데이터를 S3에서 컨테이너로 어떻게 전달하느냐가 시작 지연·비용·메모리에 직접 영향을 준다. 시험 단골 주제다.

| 모드 | 동작 | 적합한 상황 |
|------|------|------|
| **File** (기본) | 학습 시작 전 전체 데이터를 EBS로 **다운로드 완료** 후 시작 | 데이터가 인스턴스 디스크에 들어가는 중소 규모 |
| **Pipe** | S3에서 데이터를 **스트리밍**으로 흘려보냄(다운로드 대기 없음) | 디스크보다 큰 대용량, 시작 지연·스토리지 절감 |
| **FastFile** | 파일을 로컬처럼 보이게 하되 **읽을 때 지연 로딩(stream)** | Pipe의 스트리밍 + File의 임의 접근 편의 |

```python
from sagemaker.inputs import TrainingInput

train = TrainingInput(
    s3_data="s3://bucket/train/",
    input_mode="Pipe",            # File | Pipe | FastFile
)
est.fit({"train": train})
```

핵심 판별:
- "데이터가 인스턴스 디스크보다 크다 / 다운로드 대기를 줄이고 싶다" → **Pipe** 또는 **FastFile**.
- "전체 데이터를 빠르게 다 받아 디스크에서 임의 접근" → **File**.
- Pipe는 순차 스트리밍에 강하고, FastFile은 임의 접근까지 편한 신형 옵션이다.

> 💡 **관련 이론**: File 모드는 다운로드가 끝나야 학습이 시작되므로 테라바이트급 데이터에선 시작 지연·EBS 비용이 커진다. Pipe 모드는 protobuf RecordIO 같은 스트리밍 친화 포맷과 결합해 첫 배치를 바로 흘려보낸다. FastFile은 POSIX 파일처럼 마운트되지만 실제 바이트는 접근 시점에 S3에서 당겨오므로, 코드를 거의 바꾸지 않으면서 스트리밍 이점을 얻는다.

## 분산 학습: 데이터 병렬 vs 모델 병렬

`instance_count`를 늘리거나 GPU가 여러 개일 때 분산 전략을 고른다.

- **데이터 병렬(Data Parallel)**: 같은 모델 복제본을 여러 디바이스에 두고, 데이터 배치를 나눠 처리한 뒤 그래디언트를 합친다. **모델이 한 디바이스에 들어갈 때** 표준 선택. SageMaker Distributed Data Parallel(SMDDP)이 AllReduce를 최적화.
- **모델 병렬(Model Parallel)**: **모델 자체가 한 디바이스 메모리에 안 들어갈 때**(초대형 모델) 레이어/텐서를 여러 디바이스로 쪼갠다. SageMaker Distributed Model Parallel(SMP).

```python
est = Estimator(
    image_uri=img, role=role,
    instance_count=4, instance_type="ml.p4d.24xlarge",
    distribution={"smdistributed": {"dataparallel": {"enabled": True}}},
)
```

판별 신호:
- "학습이 느려서 더 많은 GPU로 가속" + 모델은 메모리에 들어감 → **데이터 병렬**.
- "모델이 너무 커서 단일 GPU 메모리 초과(OOM)" → **모델 병렬**.

## Managed Spot Training: 비용 절감

Spot 인스턴스를 학습에 쓰면 온디맨드 대비 최대 ~90% 절감이 가능하다. 단, Spot은 중단될 수 있으므로 **체크포인트**가 필수다.

```python
est = Estimator(
    image_uri=img, role=role,
    instance_count=1, instance_type="ml.m5.xlarge",
    use_spot_instances=True,
    max_run=3600,            # 총 학습 허용 시간
    max_wait=7200,           # Spot 대기 포함 최대 시간 (>= max_run)
    checkpoint_s3_uri="s3://bucket/checkpoints/",
)
```

- `use_spot_instances=True`, `max_wait >= max_run`이 필수 조합이다(대기 시간 포함).
- 중단 시 SageMaker가 `checkpoint_s3_uri`에 저장된 체크포인트에서 **재개**한다.
- 체크포인트가 없으면 중단된 학습을 처음부터 다시 해야 하므로 절감 효과가 사라진다.

판별 신호:
- "학습 비용을 크게 줄이되 약간의 시간 지연은 허용" → **Managed Spot Training**.
- "Spot인데 중단되면 처음부터 다시 한다" → 체크포인트 미설정이 원인.

## 시험 팁

- 입력 모드 문제: "디스크보다 큰 데이터 / 시작 지연 감소" → Pipe·FastFile, "전체 다운로드 후 임의 접근" → File.
- 분산 문제: 키워드 "모델이 GPU 메모리 초과" → 모델 병렬, "단순 가속" → 데이터 병렬.
- Spot 문제: "비용 절감"이 보이면 Spot, 그리고 거의 항상 **체크포인트 + checkpoint_s3_uri**가 정답의 짝이다.
- 산출물 경로 함정: 모델은 `/opt/ml/model`에 써야 S3로 올라간다. 다른 경로에 쓰면 사라진다.
- `max_wait >= max_run` 제약을 외워두면 Spot 설정 함정 문제를 거른다.

## 정리하며

오늘은 학습의 실행 인프라 — Estimator 구성, 입력 모드, 분산 전략, Spot 비용 절감 — 를 정리했다. 핵심 흐름은 **데이터 규모로 입력 모드 선택 → 모델 크기/속도 요구로 분산 전략 선택 → 비용 목표에 따라 Spot + 체크포인트**다. 내일은 이 학습 작업을 자동으로 여러 번 돌려 최적 하이퍼파라미터를 찾는 Automatic Model Tuning(AMT)을 다룬다.

---

## 📝 연습 문제

**문제 1.** 학습 데이터가 8TB로 학습 인스턴스의 EBS 볼륨보다 훨씬 크다. 다운로드 대기 없이 바로 학습을 시작하고 스토리지 비용을 줄이려 한다. 가장 적절한 입력 모드는?

A) Pipe 모드로 S3에서 스트리밍  
B) File 모드로 전체 다운로드 후 시작  
C) 데이터를 EFS로 복사 후 File 모드  
D) 데이터를 인스턴스에 수동으로 복사  

**정답: A**  
해설: Pipe 모드는 S3에서 데이터를 스트리밍해 다운로드 완료를 기다리지 않고 학습을 시작하며, 전체를 EBS에 담지 않아 스토리지도 절감한다. File 모드(B, C)는 디스크에 전체를 받아야 하므로 8TB에선 시작 지연·비용이 크고, 수동 복사(D)는 관리형 학습 흐름과 맞지 않는다.

---

**문제 2.** 한 팀이 매우 큰 트랜스포머 모델을 학습하려는데 단일 GPU 메모리를 초과해 OOM이 발생한다. 가장 적절한 분산 전략은?

A) 데이터 병렬(Data Parallel)  
B) 모델 병렬(Model Parallel)  
C) 인스턴스 수만 늘리고 배치 크기 축소  
D) CPU 인스턴스로 전환  

**정답: B**  
해설: 모델 자체가 단일 디바이스 메모리에 들어가지 않는 경우 모델을 여러 디바이스로 쪼개는 모델 병렬이 정답이다. 데이터 병렬(A)은 모델 복제본을 각 디바이스에 두므로 OOM을 해결하지 못하고, 배치 축소(C)는 근본적 모델 크기 문제를 해결하지 못하며, CPU 전환(D)은 비현실적으로 느리다.

---

**문제 3.** Managed Spot Training으로 학습 비용을 절감하려 한다. Spot 중단 후에도 학습을 처음부터 다시 하지 않고 이어서 진행하려면 반드시 필요한 설정은?

A) instance_count를 2 이상으로 설정  
B) 입력 모드를 Pipe로 변경  
C) checkpoint_s3_uri로 체크포인트를 S3에 저장  
D) max_run을 max_wait보다 크게 설정  

**정답: C**  
해설: Spot 인스턴스는 중단될 수 있으므로 체크포인트를 S3(checkpoint_s3_uri)에 저장해야 중단 후 그 지점부터 재개된다. 인스턴스 수(A)·입력 모드(B)는 재개와 무관하고, Spot에서는 오히려 max_wait가 max_run보다 크거나 같아야 하므로 D는 반대로 서술되어 틀렸다.

---

**문제 4.** SageMaker 학습 컨테이너에서 학습이 끝난 뒤 모델 산출물이 자동으로 S3(output_path)로 업로드되도록 하려면 모델 파일을 어느 경로에 기록해야 하는가?

A) /opt/ml/input/data/  
B) /tmp/output/  
C) /opt/ml/checkpoints/  
D) /opt/ml/model/  

**정답: D**  
해설: SageMaker는 학습 종료 시 `/opt/ml/model/` 디렉터리의 내용을 tar.gz로 묶어 output_path로 자동 업로드한다. 입력 채널 경로(A)·임의 경로(B)·체크포인트 경로(C)에 쓴 산출물은 모델 아티팩트로 업로드되지 않는다.

---

**문제 5.** Managed Spot Training을 설정할 때 반드시 만족해야 하는 파라미터 제약으로 옳은 것은?

A) max_wait는 max_run 이상이어야 한다  
B) max_wait는 max_run보다 작아야 한다  
C) use_spot_instances는 분산 학습에서만 가능하다  
D) Spot은 GPU 인스턴스에서만 지원된다  

**정답: A**  
해설: max_wait는 Spot 용량 확보 대기 시간까지 포함하므로 실제 학습 시간 상한인 max_run 이상으로 설정해야 한다. B는 부등호가 반대라 틀렸고, Spot은 분산 여부와 무관하게 쓸 수 있으며(C), CPU/GPU 모두에서 지원되므로(D) 틀렸다.

---
