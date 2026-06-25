# Day 3 - 데이터·모델 보호: KMS 암호화와 Secrets

권한(Day1)과 네트워크(Day2)로 "누가 접근하고 어디로 흐르는가"를 통제했다면, 오늘은 데이터와 모델 그 자체를 암호화로 보호한다. ML 파이프라인에는 보호해야 할 자산이 곳곳에 있다 — S3의 학습 데이터, 학습 중인 디스크/볼륨, 노드 간 통신, S3의 모델 아티팩트, 그리고 외부 자격증명. 오늘은 **저장 중 암호화(at-rest)**, **전송 중 암호화(in-transit)**, **KMS 키 관리**, **Secrets 관리** 를 정리한다.

## 두 가지 암호화 — 저장 중 vs 전송 중

암호화는 데이터가 어디 있느냐로 나뉜다.

- **저장 중 암호화(encryption at rest)**: 디스크나 스토리지에 "가만히 있는" 데이터. S3 객체, EBS 볼륨, 학습 인스턴스의 로컬 스토리지. KMS 키로 암호화.
- **전송 중 암호화(encryption in transit)**: 네트워크를 "이동 중인" 데이터. S3↔컨테이너, 분산 학습 노드 간 통신. TLS/HTTPS와 노드 간 암호화.

```text
[데이터 흐름과 암호화 지점]
S3(at-rest, SSE-KMS) ──TLS──▶ 학습 컨테이너
                                  │  EBS/로컬 볼륨 (at-rest, VolumeKmsKeyId)
                                  │  노드 간 (in-transit, inter-container 암호화)
                                  ▼
S3 모델 아티팩트(at-rest, OutputDataConfig KmsKeyId)
```

> 💡 **관련 이론**: 암호화는 "데이터가 멈춰 있을 때"와 "움직일 때" 둘 다 막아야 완전하다. 저장 중 암호화는 디스크를 누가 훔쳐가도 못 읽게 하고, 전송 중 암호화는 네트워크를 도청해도 못 읽게 한다. 규제(HIPAA, PCI 등)는 거의 항상 둘 다 요구한다. 시험에서 "at-rest만"이나 "in-transit만" 보기는 보통 불완전한 답이다.

## KMS — 키 관리의 중심

AWS KMS는 암호화 키를 만들고 관리하는 서비스다. SageMaker의 거의 모든 암호화는 KMS 키를 지정하는 방식으로 동작한다.

- **AWS 관리형 키(aws/sagemaker 등)**: 기본 제공. 설정이 간단하지만 키 정책을 세밀하게 통제하기 어렵다.
- **고객 관리형 키(CMK, Customer Managed Key)**: 직접 만든 키. **키 정책으로 누가 키를 쓸 수 있는지 통제**, 키 회전·삭제·감사 가능. 규제 환경에서는 거의 CMK를 쓴다.

학습 작업에서 암호화를 지정하는 곳:

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

> 💡 **관련 이론**: CMK의 진짜 가치는 "키 정책으로 접근을 통제하고, 키를 끄면 데이터가 잠긴다"는 점이다. 데이터 자체를 지우지 않아도 키 접근만 끊으면 사실상 데이터를 못 읽게 만들 수 있다(crypto-shredding). 또 키 사용 내역이 CloudTrail에 남아 "누가 언제 이 데이터를 복호화했는가"를 감사할 수 있다. 이게 AWS 관리형 키 대비 CMK를 쓰는 핵심 이유다.

## S3 데이터 보호

학습 데이터가 사는 S3는 보호의 1차 관문이다.

- **SSE-KMS**: KMS 키로 서버 측 암호화. CMK를 쓰면 키 접근까지 통제. ML에서 표준.
- **SSE-S3**: S3 관리형 키. 간단하지만 키 통제 불가.
- **버킷 정책으로 비암호화 업로드 거부**: `s3:x-amz-server-side-encryption` 조건으로 암호화 안 된 객체 업로드를 `Deny`(Day1에서 본 패턴).
- **Block Public Access**: 학습 데이터 버킷은 반드시 퍼블릭 접근 차단.
- **버전 관리·객체 잠금**: 실수·악의적 삭제로부터 데이터 보호.

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

## 실행 역할이 KMS 키를 쓸 권한

암호화된 S3 데이터를 학습이 읽으려면, **실행 역할이 KMS 키로 복호화할 권한**(`kms:Decrypt`)이 있어야 한다. 그리고 암호화된 출력을 쓰려면 `kms:GenerateDataKey`가 필요하다. 이게 빠지면 "S3 권한은 줬는데 KMS 때문에 Access Denied"가 난다 — 자주 놓치는 함정이다.

```json
{
  "Effect": "Allow",
  "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "arn:aws:kms:us-east-1:123456789012:key/abcd-1234"
}
```

추가로, 해당 **KMS 키의 키 정책** 에서도 실행 역할을 허용해야 한다(KMS는 IAM 정책과 키 정책이 둘 다 작동).

> 💡 **관련 이론**: KMS 접근은 "양쪽 문"을 통과해야 한다 — IAM 정책(역할에 kms 액션 허용)과 키 정책(키가 그 역할을 허용). 둘 중 하나만 있으면 거부된다. S3 권한은 멀쩡한데 암호화 데이터 읽기가 실패하면 거의 항상 KMS 권한 문제다. 시험에서 "S3는 줬는데 왜 안 되나"의 정답이 `kms:Decrypt` 누락인 경우가 많다.

## 모델 아티팩트 암호화

학습이 끝나면 모델 아티팩트(`model.tar.gz`)가 S3에 저장되는데, 이것도 지적 자산이므로 암호화해야 한다. `OutputDataConfig.KmsKeyId`로 출력 암호화를 지정한다. 추론 엔드포인트도 마찬가지로 `KmsKeyId`로 호스팅 인스턴스 볼륨을 암호화하고, 엔드포인트 호출은 HTTPS(TLS)로 전송 암호화된다.

## Secrets 관리 — 자격증명을 코드에 박지 마라

학습·추론 코드가 외부 DB, 서드파티 API, 프라이빗 데이터 소스에 접근할 때 비밀번호·API 키가 필요할 수 있다. 이걸 코드나 환경변수에 하드코딩하면 안 된다.

- **AWS Secrets Manager**: 비밀번호·API 키·DB 자격증명 저장. **자동 회전** 지원. 런타임에 코드가 API로 가져온다.
- **SSM Parameter Store (SecureString)**: 더 가벼운 설정값·비밀. KMS로 암호화. 회전은 수동.

```python
# 코드에서 런타임에 비밀을 가져온다 (하드코딩 금지)
import boto3, json
client = boto3.client("secretsmanager")
resp = client.get_secret_value(SecretId="prod/ml/db-credentials")
creds = json.loads(resp["SecretString"])
# creds["username"], creds["password"]
```

실행 역할에는 `secretsmanager:GetSecretValue` 권한(특정 시크릿 ARN으로 제한)과, 시크릿이 CMK로 암호화돼 있으면 그 키의 `kms:Decrypt`가 필요하다.

> 💡 **관련 이론**: Secrets Manager vs Parameter Store는 시험 단골 비교다. 핵심 차이는 "자동 회전"이다 — DB 비밀번호처럼 주기적 회전이 필요하면 Secrets Manager, 단순 설정값이나 토큰이면 Parameter Store(SecureString)로 비용을 아낀다. 공통점은 "비밀을 코드 밖에 두고 런타임에 가져온다"이다. 하드코딩된 자격증명을 본 문제는 거의 항상 이 둘 중 하나가 정답이다.

## 정리하며

오늘의 한 문장: **데이터와 모델은 저장 중(KMS at-rest)·전송 중(TLS·노드 간 암호화) 양쪽을 막고, 키는 CMK로 통제·감사하며, 자격증명은 코드 밖 Secrets Manager/Parameter Store에 둔다.** 학습 작업에서는 `OutputDataConfig.KmsKeyId`(아티팩트)·`VolumeKmsKeyId`(볼륨)·`EnableInterContainerTrafficEncryption`(노드 간) 세 곳을 기억하자. 암호화 데이터 읽기 실패는 거의 항상 실행 역할의 `kms:Decrypt` 누락이거나 키 정책 미허용이다.

내일은 보안에서 비용으로 넘어가 — ML 워크로드를 싸게 운영하는 법을 다룬다.

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
