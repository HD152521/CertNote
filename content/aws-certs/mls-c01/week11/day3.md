# Day 3 - ML 보안: IAM 실행 역할, VPC 격리, KMS 암호화

ML 시스템은 민감한 학습 데이터, 값비싼 모델 아티팩트, 광범위한 권한을 한곳에 모은다. 이 셋이 새면 데이터 유출·모델 탈취·권한 오남용으로 직결된다. 오늘은 SageMaker를 중심으로 ML 워크로드를 지키는 세 축 — IAM 실행 역할(누가 무엇을 할 수 있나), VPC 격리(어디로 통신하나), KMS 암호화(저장/전송 데이터 보호)를 다룬다.

## IAM 실행 역할: 최소 권한 원칙

SageMaker 학습 작업·엔드포인트는 사용자 자격이 아니라 **실행 역할(Execution Role)**의 권한으로 동작한다. 이 역할에 과도한 권한을 주면 침해 시 피해가 커진다. 최소 권한으로 필요한 S3 경로·KMS 키만 허용한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": [
        "arn:aws:s3:::ml-train-bucket/data/*",
        "arn:aws:s3:::ml-train-bucket/output/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": "arn:aws:kms:us-east-1:111122223333:key/abcd-efgh"
    }
  ]
}
```

신뢰 정책(Trust Policy)으로 누가 이 역할을 맡을 수 있는지도 제한한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "sagemaker.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
```

> 💡 **관련 이론**: 시험에서 "학습 작업이 S3에 접근하지 못한다(AccessDenied)"는 거의 항상 사용자 권한이 아니라 **실행 역할의 권한 부족**이다. 반대로 "역할이 모든 버킷에 접근 가능하다"는 최소 권한 위반이다. 권한 주체가 실행 역할임을 기억하는 것이 출발점이다.

## VPC 격리: 인터넷 없는 학습

기본적으로 SageMaker 작업은 AWS 관리형 네트워크에서 인터넷에 접근할 수 있다. 민감 데이터는 이를 막아야 한다. `VpcConfig`로 작업을 사용자 VPC의 프라이빗 서브넷에 배치하고, S3 등은 **VPC 엔드포인트**로 인터넷을 거치지 않고 접근한다.

```python
estimator = Estimator(
    image_uri=image, role=role,
    instance_count=1, instance_type="ml.m5.xlarge",
    subnets=["subnet-priv-a", "subnet-priv-b"],
    security_group_ids=["sg-0123456789"],
    encrypt_inter_container_traffic=True,   # 분산 학습 노드 간 암호화
    enable_network_isolation=True,          # 컨테이너의 외부 네트워크 차단
)
```

- **Network Isolation**: 컨테이너가 어떤 네트워크 호출도 못 하게 막는다(외부에서 받은 코드/모델을 격리 실행할 때).
- **VPC Endpoint (Gateway)**: S3·DynamoDB는 게이트웨이 엔드포인트로 프라이빗 접근.
- **VPC Endpoint (Interface/PrivateLink)**: SageMaker API/Runtime, CloudWatch 등은 인터페이스 엔드포인트로.

```text
[프라이빗 서브넷]
  학습 컨테이너 ──(VPC Gateway Endpoint)──▶ S3
       │
       └──(Interface Endpoint/PrivateLink)──▶ SageMaker API
  (인터넷 게이트웨이 경로 없음)
```

## KMS 암호화: 저장과 전송 보호

데이터와 모델은 저장 중(at rest)과 전송 중(in transit) 모두 암호화한다. KMS 고객 관리형 키(CMK)로 누가 복호화할 수 있는지까지 통제한다.

```python
estimator = Estimator(
    ...,
    output_kms_key="arn:aws:kms:us-east-1:111122223333:key/abcd-efgh",   # 모델 아티팩트 암호화
    volume_kms_key="arn:aws:kms:us-east-1:111122223333:key/wxyz-1234",   # 학습 EBS 볼륨 암호화
)
```

| 보호 지점 | 방법 |
|-----------|------|
| S3의 학습 데이터/모델 | SSE-KMS(CMK)로 버킷/객체 암호화 |
| 학습 인스턴스 스토리지 | `volume_kms_key`로 EBS 암호화 |
| 모델 아티팩트 출력 | `output_kms_key` |
| 노드 간 분산 학습 트래픽 | `encrypt_inter_container_traffic=True` |
| 엔드포인트 통신 | TLS(전송 중 암호화 기본) |

> 💡 **관련 이론**: "암호화는 켰는데 누가 키를 쓸 수 있나"가 진짜 통제 지점이다. KMS **키 정책**과 IAM이 함께 작동해, 키 정책에서 허용되지 않으면 IAM 권한이 있어도 복호화하지 못한다. 데이터 격리를 위해 팀/프로젝트별로 별도 CMK를 두는 패턴이 자주 출제된다.

## 데이터·모델 보호 보조 서비스

```text
- Amazon Macie: S3의 PII/민감정보를 자동 탐지·분류
- SageMaker Clarify: 데이터/모델 편향 탐지(보안은 아니지만 책임 있는 AI)
- AWS PrivateLink: SageMaker 호출을 인터넷 없이 사설 연결
- Secrets Manager: 외부 DB/API 자격 증명을 코드에 박지 않고 관리
- CloudTrail: 모든 API 호출 감사(내일 다룸)
```

## 정리하며

ML 보안의 세 축은 명확하다. IAM 실행 역할로 최소 권한을 강제하고, VPC 격리(프라이빗 서브넷·VPC 엔드포인트·네트워크 격리)로 데이터가 인터넷을 거치지 않게 하며, KMS로 저장·전송 데이터와 모델 아티팩트를 암호화하되 키 정책으로 복호화 주체까지 통제한다. Macie·PrivateLink·Secrets Manager가 이를 보강한다.

내일은 운영의 나머지 절반 — 비용 최적화, CloudWatch/CloudTrail 로깅·감사, 재해 복구를 다룬다.

---

## 📝 연습 문제

**문제 1.** 규제 요건상 학습 작업이 인터넷에 절대 접근하지 못하게 하고, 학습 데이터가 든 S3에는 인터넷을 거치지 않고 접근해야 한다. 가장 적절한 구성은?

A) 퍼블릭 서브넷에 배치하고 보안 그룹만 강화  
B) 모든 트래픽을 NAT 게이트웨이로 라우팅  
C) 프라이빗 서브넷 + S3용 VPC(게이트웨이) 엔드포인트 + 네트워크 격리  
D) 엔드포인트에 퍼블릭 IP를 부여  

**정답: C**  
해설: 프라이빗 서브넷에 두고 S3 VPC 엔드포인트로 사설 접근하며 네트워크 격리로 외부 호출을 차단하는 조합이 인터넷 비접근 요건을 충족한다. 퍼블릭 서브넷/IP(A·D)와 NAT(B)는 모두 인터넷 경로를 만든다.

---

**문제 2.** SageMaker 학습 작업이 S3 버킷 접근에서 AccessDenied를 받는다. 사용자는 콘솔에서 같은 버킷을 잘 읽는다. 가장 가능성 높은 원인은?

A) 사용자 IAM 권한 부족  
B) 학습 작업의 실행 역할(Execution Role)에 해당 S3 권한이 없음  
C) 리전이 잘못됨  
D) 인스턴스 타입이 너무 작음  

**정답: B**  
해설: 학습 작업은 사용자 자격이 아니라 실행 역할 권한으로 동작하므로, 사용자가 접근 가능해도 실행 역할에 권한이 없으면 거부된다. 사용자 권한(A)은 작업 실행과 무관, 리전(C)·인스턴스(D)는 AccessDenied 원인이 아니다.

---

**문제 3.** 프로젝트 팀별로 학습 데이터와 모델 아티팩트를 서로 복호화하지 못하도록 격리하려 한다. 가장 효과적인 접근은?

A) 모든 팀이 같은 AWS 관리형 키를 공유  
B) 암호화를 끄고 버킷 정책만 사용  
C) 데이터를 평문으로 두되 IAM 사용자만 분리  
D) 팀별 KMS 고객 관리형 키(CMK)를 두고 키 정책으로 접근을 분리  

**정답: D**  
해설: 팀별 CMK와 키 정책으로 누가 복호화할 수 있는지까지 분리하면 IAM 권한이 있어도 키 정책에서 막혀 데이터 격리가 강제된다. 공유 키(A)는 격리 실패, 암호화 해제(B·C)는 저장 데이터 보호를 포기한다.

---

**문제 4.** 분산 학습에서 여러 노드 간에 오가는 학습 데이터가 네트워크에서 평문으로 흐르지 않게 하려 한다. SageMaker Estimator에서 설정할 옵션은?

A) enable_network_isolation=True  
B) output_kms_key 지정  
C) encrypt_inter_container_traffic=True  
D) sampling_percentage=100  

**정답: C**  
해설: encrypt_inter_container_traffic은 분산 학습 컨테이너 간 트래픽을 암호화한다. network_isolation(A)은 외부 네트워크 차단, output_kms_key(B)는 저장 아티팩트 암호화, sampling(D)은 Data Capture 옵션이다.

---

**문제 5.** S3에 저장된 학습 데이터셋 안에 의도치 않게 신용카드 번호 같은 PII가 포함됐는지 자동으로 탐지·분류하려 한다. 가장 적합한 서비스는?

A) Amazon Macie  
B) AWS KMS  
C) Amazon Comprehend Medical  
D) AWS Shield  

**정답: A**  
해설: Macie는 머신러닝으로 S3의 PII·민감정보를 자동 탐지·분류하는 데이터 보안 서비스다. KMS(B)는 암호화 키 관리, Comprehend Medical(C)은 의료 텍스트 추출, Shield(D)는 DDoS 방어다.

---
