# Day 3 - ML Security: IAM Execution Roles, VPC Isolation, KMS Encryption

ML systems concentrate sensitive training data, valuable model artifacts, and broad permissions in one place. If these leak, data theft, model stealing, and privilege abuse follow. Today we cover SageMaker-focused three pillars protecting ML workloads — IAM execution roles (who can do what), VPC isolation (where communication goes), KMS encryption (protect data at rest/in transit).

## IAM Execution Roles: Least Privilege Principle

SageMaker training jobs and endpoints operate with **Execution Role** permissions, not user credentials. Over-permissioning this role magnifies breach damage. Grant only minimum privileges to needed S3 paths and KMS keys.

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

Trust Policy further restricts who can assume this role.

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

> 💡 **Related Theory**: On exams, "training job can't access S3 (AccessDenied)" is almost always **execution role permission shortage**, not user permissions. Conversely, "role can access all buckets" = least privilege violation. Remember the permission principal is the execution role.

## VPC Isolation: Training Without Internet

By default, SageMaker jobs can access the internet from AWS-managed networks. Sensitive data must block this. Use `VpcConfig` to place jobs in user VPC private subnets, access S3 etc. via **VPC Endpoints** without internet.

```python
estimator = Estimator(
    image_uri=image, role=role,
    instance_count=1, instance_type="ml.m5.xlarge",
    subnets=["subnet-priv-a", "subnet-priv-b"],
    security_group_ids=["sg-0123456789"],
    encrypt_inter_container_traffic=True,   # encrypt distributed training nodes
    enable_network_isolation=True,          # block container external network
)
```

- **Network Isolation**: Block any network calls from container (isolate-run external code/models).
- **VPC Endpoint (Gateway)**: S3, DynamoDB via gateway endpoints for private access.
- **VPC Endpoint (Interface/PrivateLink)**: SageMaker API/Runtime, CloudWatch via interface endpoints.

```text
[Private Subnet]
  Training container ──(VPC Gateway Endpoint)──▶ S3
       │
       └──(Interface Endpoint/PrivateLink)──▶ SageMaker API
  (no internet gateway route)
```

## KMS Encryption: Protect at Rest and in Transit

Encrypt data and models both at rest and in transit. KMS customer-managed keys (CMK) control who can decrypt.

```python
estimator = Estimator(
    ...,
    output_kms_key="arn:aws:kms:us-east-1:111122223333:key/abcd-efgh",   # encrypt model artifacts
    volume_kms_key="arn:aws:kms:us-east-1:111122223333:key/wxyz-1234",   # encrypt training EBS
)
```

| Protection Point | Method |
|-----------|------|
| Training data/models in S3 | SSE-KMS (CMK) encrypt bucket/objects |
| Training instance storage | `volume_kms_key` encrypts EBS |
| Model artifact output | `output_kms_key` |
| Distributed training traffic between nodes | `encrypt_inter_container_traffic=True` |
| Endpoint communication | TLS (in-transit encryption default) |

> 💡 **Related Theory**: "Encryption is on, but who can use the key?" is the real control point. KMS **key policy** and IAM work together; if key policy denies, decryption fails even with IAM permission. Patterns like separate CMK per team/project for data isolation appear frequently on exams.

## Data & Model Protection Support Services

```text
- Amazon Macie: Auto-detect/classify PII and sensitive info in S3
- SageMaker Clarify: Detect data/model bias (security-adjacent, responsible AI)
- AWS PrivateLink: Private SageMaker calls without internet
- Secrets Manager: Manage external DB/API credentials outside code
- CloudTrail: Audit all API calls (covered tomorrow)
```

## Summary

ML security's three pillars are clear. IAM execution roles enforce least privilege. VPC isolation (private subnets, VPC Endpoints, network isolation) keep data off internet. KMS encrypts data at rest/in transit and model artifacts, with key policy controlling decryption principals. Macie, PrivateLink, Secrets Manager reinforce these.

Tomorrow: the other half of operations — cost optimization, CloudWatch/CloudTrail logging & audit, disaster recovery.

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
