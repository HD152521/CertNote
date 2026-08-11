# Day 3 - 데이터·모델 보호: KMS 암호화와 Secrets

## 📌 핵심 정리

- 암호화는 **저장 중(at-rest, KMS)** 과 **전송 중(in-transit, TLS·노드 간)** 두 축이며, 규제 시나리오는 거의 항상 둘 다 요구한다.
- 학습 작업에서 외울 세 지점: `OutputDataConfig.KmsKeyId`(아티팩트) · `ResourceConfig.VolumeKmsKeyId`(볼륨) · `EnableInterContainerTrafficEncryption`(노드 간).
- **고객 관리형 키(CMK)** 는 키 정책으로 접근을 통제하고 CloudTrail로 감사·비활성화까지 가능해 규제 환경의 기본값이다.
- KMS 접근은 **IAM 정책 + 키 정책** 두 문을 모두 통과해야 한다. "S3 권한은 줬는데 Access Denied"는 대부분 `kms:Decrypt` 누락이다.
- 자격증명은 코드 밖으로 — 자동 회전이 필요하면 **Secrets Manager**, 단순 설정값·토큰이면 **Parameter Store(SecureString)**.

## 두 가지 암호화 — 저장 중 vs 전송 중

권한(Day1)과 네트워크(Day2)로 "누가 접근하고 어디로 흐르는가"를 통제했다면, 오늘은 데이터와 모델 그 자체를 암호화로 보호한다. 암호화는 데이터가 **어디 있느냐**로 갈린다.

| 구분 | 저장 중 암호화 (at rest) | 전송 중 암호화 (in transit) |
|------|--------------------------|------------------------------|
| 보호 대상 | 디스크·스토리지에 "가만히 있는" 데이터 | 네트워크를 "이동 중인" 데이터 |
| ML의 대표 자산 | S3 학습 데이터, EBS/로컬 볼륨, 모델 아티팩트 | S3↔컨테이너, 분산 학습 노드 간, 엔드포인트 호출 |
| 구현 수단 | KMS 키 (SSE-KMS, `VolumeKmsKeyId`) | TLS/HTTPS, `EnableInterContainerTrafficEncryption` |
| 막는 위협 | 디스크·스냅샷·버킷 유출 | 도청, 중간자 |
| 놓치기 쉬운 점 | 스토리지 권한과 **별개로** 키 사용 권한이 필요 | 노드 간 암호화는 기본이 아니라 **명시 설정** |

```text
[데이터 흐름과 암호화 지점]
S3(at-rest, SSE-KMS) ──TLS──▶ 학습 컨테이너
                                  │  EBS/로컬 볼륨 (at-rest, VolumeKmsKeyId)
                                  │  노드 간 (in-transit, inter-container 암호화)
                                  ▼
S3 모델 아티팩트(at-rest, OutputDataConfig KmsKeyId)
                                  ▼
엔드포인트 볼륨(at-rest, EndpointConfig KmsKeyId) ──HTTPS──▶ 클라이언트
```

> 💡 **관련 이론**: 암호화는 "데이터가 멈춰 있을 때"와 "움직일 때" 둘 다 막아야 완전하다. 저장 중 암호화는 디스크를 누가 훔쳐가도 못 읽게 하고, 전송 중 암호화는 네트워크를 도청해도 못 읽게 한다. 규제(HIPAA, PCI 등)는 거의 항상 둘 다 요구한다. 시험에서 "at-rest만"이나 "in-transit만" 보기는 보통 불완전한 답이다.

## 암호화 대상별 설정 위치

실제로 묻는 건 "이 자산을 암호화하려면 **어느 파라미터**를 건드리나"다.

| 자산 | 설정 위치 | 암호화되는 것 |
|------|-----------|----------------|
| 학습 입력 데이터 | S3 버킷 기본 암호화 / 업로드 시 SSE-KMS | S3에 저장된 데이터셋 |
| 학습 인스턴스 볼륨 | `ResourceConfig.VolumeKmsKeyId` | 인스턴스에 붙는 EBS·로컬 스토리지 |
| 모델 아티팩트 | `OutputDataConfig.KmsKeyId` | `model.tar.gz`가 올라가는 S3 출력 |
| 노드 간 통신 | `EnableInterContainerTrafficEncryption: true` | 분산 학습 컨테이너 간 전송 데이터 |
| 배치 변환 | `TransformOutput.KmsKeyId` / `TransformResources.VolumeKmsKeyId` | 배치 추론 결과 S3 / 작업 볼륨 |
| 추론 엔드포인트 | EndpointConfig의 `KmsKeyId` | 호스팅 인스턴스에 붙는 볼륨 |

학습 작업 요청에서 세 지점이 함께 들어가는 모습:

```json
{
  "OutputDataConfig": {
    "S3OutputPath": "s3://ml-artifacts/output/",
    "KmsKeyId": "arn:aws:kms:us-east-1:123456789012:key/abcd-1234"
  },
  "ResourceConfig": {
    "InstanceType": "ml.m5.xlarge",
    "InstanceCount": 2,
    "VolumeKmsKeyId": "arn:aws:kms:us-east-1:123456789012:key/abcd-1234"
  },
  "EnableInterContainerTrafficEncryption": true
}
```

- `OutputDataConfig.KmsKeyId` → 모델 아티팩트(S3 출력) 암호화
- `ResourceConfig.VolumeKmsKeyId` → 학습 인스턴스의 EBS/로컬 볼륨 암호화
- `EnableInterContainerTrafficEncryption` → 분산 학습 노드 간 전송 암호화

> ⚠️ **함정**: 노드 간 암호화는 인스턴스 2대 이상일 때 의미가 있고, 켜면 통신 오버헤드로 학습이 느려질 수 있다. 또 **네트워크 격리(`EnableNetworkIsolation`)와 다른 설정**이다 — 격리는 외부 통신을 끊는 것, 이건 전송 내용을 암호화하는 것이다.

## KMS — 키 관리의 중심

AWS KMS는 암호화 키를 만들고 관리하는 서비스다. SageMaker의 거의 모든 암호화는 "어떤 KMS 키를 쓸지" 지정하는 방식으로 동작한다. 키는 두 종류고, 어느 쪽을 고르느냐가 단골 갈림길이다.

| 항목 | AWS 관리형 키 (`aws/sagemaker` 등) | 고객 관리형 키 (CMK) |
|------|-----------------------------------|----------------------|
| 생성 주체 | 서비스가 계정 안에 자동 생성 | 내가 직접 생성·명명 |
| 키 정책 편집 | 불가 | 가능 — 누가 쓸 수 있는지 직접 통제 |
| 교차 계정 공유 | 불가 | 가능 (키 정책으로 다른 계정 허용) |
| 비활성화·삭제 | 불가 | 가능 → crypto-shredding |
| 감사 | CloudTrail에 사용 기록 | CloudTrail + 키 단위 접근 통제 |
| 고르는 순간 | 기본 암호화만 빠르게 필요할 때 | 규제·감사·교차 계정·키 통제가 요구될 때 |

> 💡 **관련 이론**: CMK의 진짜 가치는 "키 정책으로 접근을 통제하고, 키를 끄면 데이터가 잠긴다"는 점이다. 데이터 자체를 지우지 않아도 키 접근만 끊으면 사실상 데이터를 못 읽게 만들 수 있다(crypto-shredding). 또 키 사용 내역이 CloudTrail에 남아 "누가 언제 이 데이터를 복호화했는가"를 감사할 수 있다. 이게 AWS 관리형 키 대비 CMK를 쓰는 핵심 이유다.

> 💡 **개념**: KMS는 큰 데이터를 직접 암호화하지 않는다(**봉투 암호화**). `GenerateDataKey`로 받은 일회용 데이터 키로 데이터를 암호화하고, 그 데이터 키는 KMS 키로 감싸 함께 보관한다. 읽을 때는 `Decrypt`로 데이터 키부터 푼다. 권한이 둘로 갈리는 이유다 — **쓸 때 `kms:GenerateDataKey`, 읽을 때 `kms:Decrypt`**.

## 두 개의 문 — IAM 정책과 키 정책

암호화된 S3 데이터를 학습이 읽으려면, **실행 역할이 KMS 키로 복호화할 권한**(`kms:Decrypt`)이 있어야 한다. 그리고 암호화된 출력을 쓰려면 `kms:GenerateDataKey`가 필요하다. 이게 빠지면 "S3 권한은 줬는데 KMS 때문에 Access Denied"가 난다 — 자주 놓치는 함정이다.

```text
학습 컨테이너 ──(1) 실행 역할로 s3:GetObject──▶ S3 객체 (SSE-KMS)
                                                    │
              (2) 객체에 붙은 "암호화된 데이터 키"를 풀어야 본문을 읽는다
                                                    ▼
                                                 KMS 키
   문 A: IAM 정책 ── 실행 역할에 kms:Decrypt 가 붙어 있는가?
   문 B: 키  정책 ── 이 키가 그 역할(또는 그 계정)을 허용하는가?
   → 둘 다 통과해야 성공. 하나라도 막히면 AccessDeniedException (KMS가 거부한 것)
```

문 A — 실행 역할의 IAM 정책:

```json
{
  "Effect": "Allow",
  "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "arn:aws:kms:us-east-1:123456789012:key/abcd-1234"
}
```

문 B — 키 정책. 여기서 `"Resource": "*"`는 "이 정책이 붙은 그 키"를 뜻한다.

```json
{
  "Sid": "AllowSageMakerExecutionRole",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::123456789012:role/SageMakerExecutionRole" },
  "Action": ["kms:Decrypt", "kms:GenerateDataKey", "kms:CreateGrant"],
  "Resource": "*"
}
```

- 키 정책에 **계정 루트를 허용하는 기본 문장**이 남아 있으면 키가 IAM에 판단을 위임하므로 역할의 IAM 정책만으로 통과한다. 그 문장을 지웠거나 교차 계정이면 키 정책에 Principal을 직접 써야 한다.
- `kms:CreateGrant`는 SageMaker가 **볼륨 암호화**를 위해 키 사용을 위임받을 때 쓰인다. `VolumeKmsKeyId`를 줬는데 작업이 시작조차 못 하면 이걸 의심한다.
- **교차 계정**은 양쪽이 다 필요하다 — 키 소유 계정의 키 정책이 사용 계정을 허용하고, 사용 계정의 IAM 정책도 그 키 ARN을 허용해야 한다.

실제로 어떤 키가 걸려 있는지는 describe로 확인한다.

```python
import boto3

sm = boto3.client("sagemaker")
d = sm.describe_training_job(TrainingJobName="my-training-job")
print(d["OutputDataConfig"].get("KmsKeyId"))            # 아티팩트 암호화 키
print(d["ResourceConfig"].get("VolumeKmsKeyId"))        # 볼륨 암호화 키
print(d.get("EnableInterContainerTrafficEncryption"))   # 노드 간 암호화 여부

kms = boto3.client("kms")
print(kms.describe_key(KeyId="alias/ml-artifacts")["KeyMetadata"]["KeyState"])  # Enabled / Disabled
```

> 💡 **관련 이론**: KMS 접근은 "양쪽 문"을 통과해야 한다 — IAM 정책(역할에 kms 액션 허용)과 키 정책(키가 그 역할을 허용). 둘 중 하나만 있으면 거부된다. S3 권한은 멀쩡한데 암호화 데이터 읽기가 실패하면 거의 항상 KMS 권한 문제다. 시험에서 "S3는 줬는데 왜 안 되나"의 정답이 `kms:Decrypt` 누락인 경우가 많다.

## S3 데이터 보호

학습 데이터가 사는 S3는 보호의 1차 관문이다. 서버 측 암호화 방식부터 갈라 보자.

| 방식 | 키를 누가 관리하나 | 성격 |
|------|-------------------|------|
| **SSE-S3** | S3가 관리 | 간단하지만 키 통제·감사 불가 |
| **SSE-KMS** | KMS (관리형 또는 CMK) | 키 정책 통제 + CloudTrail 감사. **ML의 표준** |
| **SSE-C** | 호출자가 요청마다 키 제공 | AWS가 키를 보관하지 않음. 운영 부담이 크다 |

버킷 차원에서 함께 걸어둘 것:

- **버킷 기본 암호화**: 걸어두면 이후 업로드 객체가 자동으로 그 방식으로 암호화된다.
- **버킷 정책으로 비암호화 업로드 거부**: `s3:x-amz-server-side-encryption` 조건으로 암호화 안 된 객체 업로드를 `Deny`(Day1에서 본 패턴).
- **Block Public Access**: 학습 데이터 버킷은 반드시 퍼블릭 접근 차단. **버전 관리·객체 잠금**으로 실수·악의적 삭제도 막는다.
- **`aws:SecureTransport: false` 거부**: HTTP(비TLS) 접근을 막아 전송 중 암호화를 강제.

```json
{
  "Sid": "RequireKmsEncryption",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::ml-train-data/*",
  "Condition": {
    "StringNotEquals": { "s3:x-amz-server-side-encryption": "aws:kms" }
  }
}
```

> ⚠️ **함정**: SSE-KMS는 객체를 읽고 쓸 때마다 KMS 호출이 일어난다. 학습 데이터가 **작은 파일 수백만 개**면 KMS 요청 요금·스로틀링이 실제 문제가 된다. 답은 암호화 해제가 아니라 **S3 Bucket Keys 활성화**(버킷 수준 키 재사용으로 KMS 호출 감소)와 파일 병합이다.

## 모델 아티팩트와 추론 엔드포인트

학습이 끝나면 모델 아티팩트(`model.tar.gz`)가 S3에 저장되는데, 이것도 지적 자산이므로 암호화해야 한다.

- 아티팩트는 `OutputDataConfig.KmsKeyId`로 출력 암호화를 지정한다.
- 엔드포인트는 EndpointConfig의 `KmsKeyId`로 호스팅 인스턴스 볼륨을 암호화하고, 호출은 HTTPS(TLS)로 전송 암호화된다.
- 암호화된 아티팩트로 엔드포인트를 만들 때는 **호스팅 실행 역할에도** 그 키의 `kms:Decrypt`가 있어야 한다. 학습만 통과시켜 두고 배포에서 막히는 사례가 여기서 나온다.

## Secrets 관리 — 자격증명을 코드에 박지 마라

학습·추론 코드가 외부 DB, 서드파티 API, 프라이빗 데이터 소스에 접근할 때 비밀번호·API 키가 필요할 수 있다. 이걸 코드나 환경변수에 하드코딩하면 안 된다.

| 항목 | AWS Secrets Manager | SSM Parameter Store (SecureString) |
|------|---------------------|-------------------------------------|
| 주 용도 | DB 자격증명, API 키 등 진짜 "비밀" | 설정값·파라미터, 가벼운 비밀 |
| **자동 회전** | **지원** | 없음 — 수동 갱신 |
| 암호화 | 항상 KMS로 암호화 | SecureString 타입일 때 KMS로 암호화 |
| 비용 | 시크릿당 월 요금 + API 호출 | 표준 파라미터는 추가 비용 없음 |
| 필요한 권한 | `secretsmanager:GetSecretValue` | `ssm:GetParameter` (+ `WithDecryption`) |
| 고르는 순간 | 요구사항에 **회전**이 들어 있으면 | 회전이 필요 없고 비용을 아끼고 싶으면 |

```python
# 코드에서 런타임에 비밀을 가져온다 (하드코딩 금지)
import boto3, json
client = boto3.client("secretsmanager")
resp = client.get_secret_value(SecretId="prod/ml/db-credentials")
creds = json.loads(resp["SecretString"])
# creds["username"], creds["password"]

# 가벼운 설정값·토큰은 Parameter Store로 충분하다
ssm = boto3.client("ssm")
token = ssm.get_parameter(Name="/ml/prod/api-token", WithDecryption=True)["Parameter"]["Value"]
```

실행 역할에는 `secretsmanager:GetSecretValue` 권한(특정 시크릿 ARN으로 제한)과, 시크릿이 CMK로 암호화돼 있으면 그 키의 `kms:Decrypt`가 필요하다.

> ⚠️ **함정**: 비밀을 **하이퍼파라미터나 환경변수로 넘기는 것**도 하드코딩만큼 위험하다. 하이퍼파라미터는 `describe_training_job` 응답에 그대로 드러나고, 로그에 찍히면 CloudWatch Logs에 평문으로 남는다. 비밀은 런타임에 API로 가져와 메모리에서만 쓴다.

> 💡 **관련 이론**: Secrets Manager vs Parameter Store는 시험 단골 비교다. 핵심 차이는 "자동 회전"이다 — DB 비밀번호처럼 주기적 회전이 필요하면 Secrets Manager, 단순 설정값이나 토큰이면 Parameter Store(SecureString)로 비용을 아낀다. 공통점은 "비밀을 코드 밖에 두고 런타임에 가져온다"이다. 하드코딩된 자격증명을 본 상황은 거의 항상 이 둘 중 하나가 정답이다.

## 암호화가 막힐 때: 증상 → 원인 → 조치

암호화 실패는 대부분 "권한을 어디에 안 줬나"로 수렴한다.

| 증상 | 흔한 원인 | 조치 |
|------|-----------|------|
| S3 읽기 권한이 있는데 AccessDenied | SSE-KMS 객체인데 역할에 `kms:Decrypt`가 없음 | 역할 정책에 해당 키 ARN으로 `kms:Decrypt` 추가 |
| IAM에 kms 권한을 줬는데도 거부 | 키 정책이 그 역할(또는 계정 루트)을 허용하지 않음 | 키 정책에 역할 Principal을 명시적으로 추가 |
| 다른 계정의 암호화 데이터 복호화 실패 | 교차 계정은 키 정책·IAM 정책 **양쪽** 필요 | 키 소유 계정 키 정책에 사용 계정 허용 + 사용 계정 역할에 kms 권한 |
| 학습 결과 저장 단계에서만 실패 | 출력 키에 대한 `kms:GenerateDataKey` 누락 | 역할·키 정책에 `kms:GenerateDataKey` 추가 |
| `VolumeKmsKeyId` 지정 작업이 시작조차 못 함 | `kms:CreateGrant` 누락 또는 키 상태가 Disabled | 권한 추가 후 `describe_key`로 `KeyState` 확인 |
| 업로드가 갑자기 거부됨 | 버킷 정책이 비암호화 업로드를 `Deny` | 업로드 시 SSE-KMS 지정 또는 버킷 기본 암호화 설정 |
| KMS 요청 요금·스로틀 급증 | 소형 객체 다량을 SSE-KMS로 반복 접근 | S3 Bucket Keys 활성화, 파일 병합 |

> 💡 **개념**: 접근 실패를 만나면 **"어느 서비스가 거부했나"부터 가른다.** CloudTrail의 이벤트 소스를 보면 S3가 막은 것인지 KMS가 막은 것인지 드러나고, 그것만으로 조치가 갈린다. 이 구분을 건너뛰면 멀쩡한 S3 권한만 계속 넓히다가 보안까지 약해진다.

내일은 보안에서 비용으로 넘어가 — ML 워크로드를 싸게 운영하는 법을 다룬다.

## 📖 용어

- **저장 중 암호화 (at rest)** : 디스크·스토리지에 저장된 상태의 데이터를 암호화하는 것. S3 객체, EBS 볼륨, 모델 아티팩트가 대상이다.
- **전송 중 암호화 (in transit)** : 네트워크로 이동하는 데이터를 암호화하는 것. TLS/HTTPS와 노드 간 트래픽 암호화가 여기 속한다.
- **KMS** : AWS의 키 관리 서비스. SageMaker 암호화는 "어떤 KMS 키를 쓸지" 지정하는 방식으로 동작한다.
- **고객 관리형 키 (CMK)** : 내가 직접 만들고 키 정책으로 통제하는 KMS 키. 교차 계정 공유·비활성화·감사가 가능하다.
- **키 정책 (key policy)** : KMS 키 자체에 붙는 정책. 역할에 IAM 권한이 있어도 키 정책이 막으면 복호화는 거부된다.
- **봉투 암호화 (envelope encryption)** : 데이터는 일회용 데이터 키로 암호화하고, 그 데이터 키를 다시 KMS 키로 감싸 보관하는 방식.
- **SSE-KMS / SSE-S3** : S3 서버 측 암호화 방식. SSE-KMS는 키 통제·감사가 되고, SSE-S3는 간단하지만 키를 통제할 수 없다.
- **VolumeKmsKeyId** : 학습·배치 작업 인스턴스에 붙는 EBS/로컬 볼륨을 암호화할 KMS 키를 지정하는 파라미터.
- **EnableInterContainerTrafficEncryption** : 분산 학습에서 노드(컨테이너) 사이 데이터를 암호화하는 스위치. 네트워크 격리와는 다른 설정이다.
- **crypto-shredding** : 데이터를 지우는 대신 암호화 키를 없애거나 접근을 끊어 사실상 읽을 수 없게 만드는 기법.

---

## 📝 연습 문제

**문제 1.** 학습 작업의 실행 역할에 학습 데이터 버킷에 대한 `s3:GetObject` 권한을 줬는데도, KMS로 암호화된 객체를 읽을 때 Access Denied가 발생한다. 가장 적절한 해결책은?

A) 버킷을 퍼블릭으로 전환한다  
B) 실행 역할에 해당 KMS 키에 대한 `kms:Decrypt` 권한을 부여하고, 키 정책에서도 그 역할을 허용한다  
C) S3 버전 관리를 끈다  
D) 인스턴스 타입을 키운다  

**정답: B**  
해설: SSE-KMS로 암호화된 객체를 읽으려면 S3 권한 외에 KMS 키 복호화 권한이 IAM 정책과 키 정책 양쪽에서 허용돼야 하므로, `kms:Decrypt`를 역할에 주고 키 정책에서도 역할을 허용해야 한다. A는 보안을 악화시키고, C·D는 암호화 복호화 권한과 무관해 문제를 해결하지 못한다.

---

**문제 2.** 규제 요건상 모델 아티팩트와 학습 인스턴스 볼륨을 모두 고객이 통제·감사 가능한 키로 암호화해야 한다. 가장 적절한 설정은?

A) AWS 관리형 키로 아티팩트만 암호화  
B) 고객 관리형 키(CMK)를 `OutputDataConfig.KmsKeyId`와 `ResourceConfig.VolumeKmsKeyId`에 지정  
C) 암호화 없이 IAM 정책만 강화  
D) 전송 중 암호화만 활성화  

**정답: B**  
해설: 고객이 키 정책으로 접근을 통제하고 CloudTrail로 사용을 감사하려면 CMK가 필요하며, 아티팩트는 `OutputDataConfig.KmsKeyId`, 볼륨은 `ResourceConfig.VolumeKmsKeyId`로 각각 지정해 둘 다 저장 중 암호화한다. A는 볼륨이 빠지고 통제력이 약한 관리형 키이며, C는 암호화 자체가 없고, D는 저장 중 암호화 요구를 충족하지 못한다.

---

**문제 3.** 분산(멀티 노드) 학습에서 노드 간 통신 데이터까지 암호화하라는 요구가 있다. 적절한 설정은?

A) `EnableInterContainerTrafficEncryption`을 true로 설정  
B) `OutputDataConfig.KmsKeyId`만 설정  
C) S3 버킷 정책으로 처리  
D) `EnableNetworkIsolation`을 true로 설정  

**정답: A**  
해설: 분산 학습 노드 간(컨테이너 간) 전송 데이터를 암호화하는 전용 설정은 `EnableInterContainerTrafficEncryption`이다. B는 출력 아티팩트(저장 중) 암호화이고, C는 S3 저장 데이터에 관한 것이며, D는 아웃바운드 차단이지 노드 간 전송 암호화가 아니다.

---

**문제 4.** 학습 코드가 외부 데이터베이스에 접근해야 해서 자격증명이 필요하다. DB 비밀번호는 주기적으로 자동 회전되어야 한다. 가장 적절한 방법은?

A) DB 비밀번호를 학습 코드에 하드코딩한다  
B) AWS Secrets Manager에 자격증명을 저장하고 자동 회전을 설정한 뒤 런타임에 가져온다  
C) 환경변수에 평문으로 넣는다  
D) S3에 평문 파일로 저장한다  

**정답: B**  
해설: 자격증명을 코드 밖에 두고 자동 회전까지 지원하는 서비스는 Secrets Manager이므로, 여기에 저장하고 런타임에 API로 가져오는 것이 적절하다. A·C·D는 모두 자격증명을 평문으로 노출하고 회전 기능도 없어 보안 원칙에 정면으로 반한다.

---

**문제 5.** 학습 데이터 S3 버킷에 "암호화되지 않은 객체 업로드를 막아라"는 요구가 있다. 가장 효과적인 조치는?

A) 버킷 정책에 `s3:x-amz-server-side-encryption`이 `aws:kms`가 아니면 `s3:PutObject`를 `Deny`하는 조건을 추가  
B) 버킷의 버전 관리를 활성화  
C) CloudWatch 알람을 설정  
D) 객체를 나중에 수동으로 암호화  

**정답: A**  
해설: 업로드 시 암호화 헤더를 검사해 KMS가 아니면 거부하는 버킷 정책이 비암호화 객체의 업로드를 원천 차단하는 가장 효과적인 방법이다. B는 삭제 보호이지 암호화 강제가 아니고, C는 사후 탐지일 뿐 차단이 아니며, D는 이미 평문으로 저장된 뒤의 수동 작업이라 예방이 되지 못한다.

---
