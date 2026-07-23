# Day 2 - ML용 데이터 저장소: S3·EFS·FSx for Lustre·데이터 포맷

ML 학습에서 GPU가 노는 가장 흔한 이유는 모델이 느려서가 아니라 **데이터가 제때 도착하지 않아서**다. ml.p4d 인스턴스의 GPU는 초당 수 GB를 소화하는데, 스토리지가 그 속도를 못 맞추면 비싼 가속기가 I/O를 기다리며 논다. 그래서 Specialty는 "어떤 데이터를 어디에, 어떤 포맷으로 두는가"를 비용·성능 트레이드오프로 묻는다.

오늘은 ① 데이터레이크 중심인 S3, ② 학습 I/O를 가속하는 EFS와 FSx for Lustre, ③ RecordIO·Parquet 같은 ML 친화 포맷을 다룬다.

## S3: ML 데이터레이크의 중심

거의 모든 SageMaker 학습 데이터는 S3에서 출발한다. S3는 사실상 무한 용량에 11 nine 내구성을 제공하고, SageMaker가 네이티브로 읽기 때문이다. 핵심은 **데이터를 S3로 어떻게 GPU까지 흘려보내느냐**인 입력 모드 선택이다.

| 입력 모드 | 동작 | 적합한 상황 |
|----------|------|------------|
| **File 모드** | 학습 전 전체 데이터를 인스턴스 디스크(EBS)로 복사 | 작은 데이터, 랜덤 접근 필요 |
| **Pipe 모드** | S3에서 스트리밍, 디스크에 안 담음 | 대용량, 순차 접근, 시작 지연 최소화 |
| **FastFile 모드** | 필요한 파일만 on-demand로 POSIX처럼 접근 | 대용량인데 일부만 읽거나 랜덤 접근 |

```python
from sagemaker.inputs import TrainingInput

# Pipe 모드: 전체를 내려받지 않고 스트리밍 → 큰 데이터에서 시작이 빠름
train_input = TrainingInput(
    s3_data="s3://my-lake/features/train/",
    input_mode="Pipe",                 # File | Pipe | FastFile
    distribution="ShardedByS3Key",     # 여러 인스턴스에 데이터 분할
    content_type="application/x-recordio-protobuf",
)
estimator.fit({"train": train_input})
```

`distribution="ShardedByS3Key"`는 다중 인스턴스 분산 학습에서 각 인스턴스가 데이터의 다른 조각만 읽게 해 중복을 없앤다. `FullyReplicated`는 모든 인스턴스가 전체를 받는다(작은 데이터·검증셋에 적합).

> 💡 **관련 이론**: File 모드는 학습 시작 전 전체 복사가 끝나야 첫 스텝이 돈다. 수백 GB면 이 복사만 수십 분이고 비싼 GPU가 그동안 논다. Pipe 모드는 첫 배치가 도착하자마자 학습을 시작하므로 **time-to-first-batch**가 짧다. 단 Pipe는 순차 스트리밍이라 에폭마다 완전한 셔플이 어렵고, 알고리즘이 Pipe를 지원해야 한다. FastFile은 이 둘의 절충으로, 랜덤 접근을 지원하면서 전체 복사를 피한다.

## EFS와 FSx for Lustre: 학습 I/O 가속

S3는 객체 스토리지라 POSIX 파일 시스템처럼 디렉터리·랜덤 읽기를 빠르게 못 한다. 학습이 **같은 데이터를 여러 에폭 반복**하거나 **많은 작은 파일에 랜덤 접근**해야 하면 파일 시스템 스토리지가 유리하다.

| 스토리지 | 특성 | ML 적합 시나리오 |
|---------|------|-----------------|
| **EFS** | 관리형 NFS, 다중 인스턴스 공유, 탄력 확장 | 노트북·여러 잡이 공유하는 중간 규모 데이터셋 |
| **FSx for Lustre** | 고성능 병렬 파일시스템, S3 연동 | 대규모 분산 학습, 고처리량 I/O 요구 |

FSx for Lustre의 킬러 기능은 **S3 리포지토리 연동**이다. S3 버킷을 백엔드로 두고, FSx가 고성능 캐시처럼 동작한다. 데이터는 S3에 두되(저렴·내구성), 학습 시엔 Lustre의 수백 GB/s 처리량으로 읽는다.

```python
from sagemaker.inputs import FileSystemInput

# FSx for Lustre를 학습 입력으로 직접 마운트
fsx_input = FileSystemInput(
    file_system_id="fs-0123456789abcdef0",
    file_system_type="FSxLustre",
    directory_path="/fsx/imagenet/train",
    file_system_access_mode="ro",
)
estimator.fit({"train": fsx_input})
```

> 💡 **관련 이론**: 같은 데이터셋으로 하이퍼파라미터 튜닝(HPO)을 수십~수백 번 반복하면 매번 S3에서 다운로드하는 비용이 누적된다. FSx for Lustre에 한 번 올려두면 모든 튜닝 잡이 고속으로 공유 접근해 전체 시간과 비용을 크게 줄인다. EFS는 처리량이 Lustre보다 낮지만 설정이 단순하고 영구 공유에 좋다. 핵심 판단 기준: **반복·고처리량 = Lustre, 공유·범용 = EFS, 1회성 대용량 스트리밍 = S3 Pipe**.

## 데이터 포맷: RecordIO와 Parquet

원시 CSV·JSON·이미지를 그대로 학습에 쓰면 파싱 오버헤드와 작은 파일 문제로 I/O가 느려진다. ML은 두 가지 포맷을 선호한다.

**RecordIO-protobuf**: SageMaker 내장 알고리즘의 권장 포맷. 여러 레코드를 하나의 큰 바이너리로 묶어 순차 읽기와 Pipe 모드 스트리밍에 최적이다.

```python
import io, numpy as np
import sagemaker.amazon.common as smac

# numpy 행렬을 RecordIO-protobuf로 직렬화해 S3 업로드
buf = io.BytesIO()
smac.write_numpy_to_dense_tensor(buf, X_train.astype("float32"), y_train.astype("float32"))
buf.seek(0)

import boto3
boto3.client("s3").upload_fileobj(buf, "my-lake", "features/train/data.recordio")
```

**Parquet**: 컬럼형(columnar) 저장 포맷. 행 단위가 아니라 컬럼 단위로 저장해 ① 필요한 컬럼만 읽고(projection pushdown), ② 컬럼별 압축률이 높고, ③ Athena·Glue·Spark가 네이티브로 읽는다. 정형 피처 데이터의 사실상 표준이다.

```python
import pandas as pd
# CSV 대비 Parquet은 컬럼 선택 읽기 + 높은 압축 → ETL·분석 I/O 절감
df.to_parquet("s3://my-lake/features/train.parquet", engine="pyarrow", compression="snappy")
# 학습 시 일부 컬럼만 필요하면 그 컬럼만 스캔 → I/O 대폭 감소
cols = pd.read_parquet("s3://my-lake/features/train.parquet", columns=["age", "amount", "label"])
```

> 💡 **관련 이론**: 행 기반 포맷(CSV)은 한 행을 통째로 읽어야 해서 50개 컬럼 중 3개만 필요해도 전부 스캔한다. 컬럼형 포맷(Parquet)은 컬럼별로 따로 저장돼 필요한 3개만 읽는다. 게다가 같은 컬럼의 값은 타입·분포가 비슷해 압축이 잘 된다. 그래서 정형 데이터 분석·ETL은 Parquet, SageMaker 내장 알고리즘의 대용량 순차 학습은 RecordIO-protobuf가 정답으로 자주 나온다.

## 작은 파일 문제와 통합

수백만 개의 작은 이미지·JSON을 S3에 그대로 두면 객체당 요청 오버헤드로 학습이 느려진다. 해결책은 **샤딩(sharding)**: 작은 파일을 RecordIO·TFRecord·tar 같은 큰 묶음으로 합치는 것이다. 묶음 하나당 수백 MB가 되도록 만들면 순차 I/O가 효율적이고 Pipe 모드와도 잘 맞는다.

## 📝 연습 문제

**문제 1.** 800GB 학습 데이터를 ml.p3 인스턴스 4대로 분산 학습하려 한다. GPU가 데이터 복사를 기다리며 노는 시간을 최소화하면서 각 인스턴스가 데이터의 다른 조각만 읽게 하려면?

A) Pipe 모드 + ShardedByS3Key  
B) File 모드 + FullyReplicated  
C) File 모드 + ShardedByS3Key  
D) FastFile 모드 + FullyReplicated  

**정답: A**  
해설: Pipe 모드는 전체를 디스크에 복사하지 않고 스트리밍해 time-to-first-batch를 줄이므로 GPU 유휴를 최소화하고, ShardedByS3Key는 각 인스턴스가 서로 다른 데이터 조각만 읽게 해 중복과 메모리를 줄인다. FullyReplicated는 모든 인스턴스가 전체를 받아 비효율적이고, File 모드는 대용량에서 시작 복사가 길다.

---

**문제 2.** 같은 ImageNet 데이터셋으로 하이퍼파라미터 튜닝을 200회 반복하는데, 매번 S3에서 다운로드하는 시간이 누적되어 비용이 크다. 가장 적절한 스토리지 전략은?

A) 매번 File 모드로 다시 다운로드한다  
B) FSx for Lustre에 한 번 올려 모든 튜닝 잡이 고속 공유 접근하게 한다  
C) 데이터를 더 작게 줄인다  
D) EBS 볼륨 크기를 늘린다  

**정답: B**  
해설: 동일 데이터를 다수의 잡이 반복 사용하는 고처리량 시나리오는 FSx for Lustre의 대표 사용처다. S3를 백엔드로 두고 Lustre가 고속 캐시처럼 동작해 반복 다운로드 비용을 없앤다. 매번 다운로드는 문제의 원인 그 자체이고, 데이터 축소는 품질을 해치며 EBS 확장은 공유·처리량 문제를 풀지 못한다.

---

**문제 3.** 50개 컬럼의 정형 피처 테이블에서 분석·ETL 시 매번 3~5개 컬럼만 읽는다. I/O와 저장 비용을 동시에 줄이는 포맷은?

A) CSV  
B) 압축하지 않은 JSON  
C) Parquet (컬럼형)  
D) 일반 텍스트  

**정답: C**  
해설: Parquet은 컬럼형 저장이라 필요한 컬럼만 스캔(projection pushdown)하고, 같은 컬럼의 유사한 값 덕에 압축률도 높다. CSV·JSON·텍스트는 행 기반이라 한 행 전체를 읽어야 하고 압축 효율도 낮다.

---

**문제 4.** SageMaker 내장 알고리즘으로 대용량 데이터를 Pipe 모드 순차 스트리밍 학습할 때 권장되는 직렬화 포맷은?

A) 개별 PNG 이미지 파일 수백만 개  
B) 행마다 별도 CSV 파일  
C) 압축된 ZIP 아카이브  
D) RecordIO-protobuf  

**정답: D**  
해설: RecordIO-protobuf는 여러 레코드를 하나의 큰 바이너리로 묶어 순차 읽기와 Pipe 스트리밍에 최적화돼 있어 SageMaker 내장 알고리즘이 권장한다. 수백만 개의 작은 파일은 객체 요청 오버헤드가 크고, 행마다 별도 CSV는 더 심하며, ZIP은 스트리밍 학습에 부적합하다.

---

**문제 5.** 여러 데이터 사이언티스트의 노트북과 여러 처리 잡이 동일한 중간 규모 데이터셋을 POSIX 파일 시스템처럼 동시에 공유·수정해야 한다. 설정이 단순하고 탄력적으로 확장되는 선택은?

A) 각자 EBS 볼륨에 따로 복사  
B) Amazon EFS  
C) S3 Glacier  
D) 로컬 인스턴스 스토어  

**정답: B**  
해설: EFS는 관리형 NFS로 다중 인스턴스가 동시에 마운트·공유하고 용량이 탄력적으로 늘어나며 설정이 단순해, 노트북·잡이 공유하는 범용 데이터에 적합하다. EBS는 단일 인스턴스 전용이고, Glacier는 아카이브용 콜드 스토리지이며, 인스턴스 스토어는 휘발성이라 공유에 부적합하다.

---
