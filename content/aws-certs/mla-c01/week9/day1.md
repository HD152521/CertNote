# Day 1 - SageMaker IAM 보안: 실행 역할과 최소 권한

이번 주는 ML 솔루션을 "안전하고 책임감 있게, 그리고 싸게" 운영하는 영역이다. 첫날의 주제는 권한이다. SageMaker는 사용자가 직접 호출하는 작업과, SageMaker 서비스가 사용자를 대신해 수행하는 작업이 분리되어 있고, 이 둘을 헷갈리면 권한 시나리오를 매번 틀린다. 오늘은 **실행 역할(execution role)** 을 중심으로 사용자 권한과 서비스 권한이 어떻게 나뉘는지, 그리고 최소 권한을 어떻게 설계하는지 정리한다.

## 사용자 권한 vs 서비스 권한 — 두 경로를 분리하라

SageMaker에서 권한이 작동하는 경로는 두 가지다.

- **사용자(IAM principal) 권한**: 사람이나 CI 파이프라인이 `sagemaker:CreateTrainingJob`, `sagemaker:CreateEndpoint` 같은 API를 호출할 수 있는가. 이건 사용자에게 붙은 IAM 정책이 결정한다.
- **서비스(실행 역할) 권한**: SageMaker가 학습 작업을 실제로 돌릴 때, S3에서 데이터를 읽고 모델 아티팩트를 쓰고 CloudWatch에 로그를 보내는 작업. 이건 사용자가 아니라 **SageMaker가 떠맡은(assume) 실행 역할** 이 결정한다.

```text
사용자 → sagemaker:CreateTrainingJob 호출 (사용자 IAM 정책 필요)
            │
            ▼
SageMaker 서비스 → 실행 역할을 AssumeRole
            │
            ▼
실행 역할 권한으로 S3 읽기/쓰기, ECR pull, CloudWatch Logs, KMS 등 수행
```

핵심: 학습 작업이 "S3 접근 거부"로 실패하면, 그건 사용자 정책 문제가 아니라 **실행 역할** 의 S3 권한 문제다. 시험은 이 구분을 자주 묻는다.

> 💡 **관련 이론**: 이 구조는 IAM의 "신뢰 정책(trust policy) + 권한 정책(permission policy)" 분리에서 나온다. 실행 역할의 신뢰 정책은 "누가 이 역할을 맡을 수 있는가"(여기서는 `sagemaker.amazonaws.com`)를 정의하고, 권한 정책은 "이 역할이 무엇을 할 수 있는가"를 정의한다. 둘 다 있어야 역할이 작동한다.

## 실행 역할의 신뢰 정책

실행 역할이 SageMaker에 의해 assume되려면 신뢰 정책에 SageMaker 서비스 주체가 있어야 한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "sagemaker.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

`Principal`이 사람이 아니라 `Service`라는 점이 포인트다. 이 줄이 빠지면 SageMaker가 역할을 떠맡지 못해 작업이 시작조차 안 된다.

## 최소 권한 실행 역할 만들기

AWS가 제공하는 `AmazonSageMakerFullAccess`는 학습용으로는 편하지만 **과도하다**. 프로덕션에서는 작업이 실제로 건드리는 리소스만 허용하는 권한 정책을 직접 작성한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadTrainingData",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::ml-train-data-prod",
        "arn:aws:s3:::ml-train-data-prod/*"
      ]
    },
    {
      "Sid": "WriteModelArtifacts",
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::ml-model-artifacts-prod/*"
    },
    {
      "Sid": "PullContainerImage",
      "Effect": "Allow",
      "Action": ["ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage", "ecr:GetAuthorizationToken"],
      "Resource": "*"
    },
    {
      "Sid": "WriteLogsAndMetrics",
      "Effect": "Allow",
      "Action": ["logs:CreateLogStream", "logs:PutLogEvents", "cloudwatch:PutMetricData"],
      "Resource": "*"
    }
  ]
}
```

여기서 의도적으로 좁힌 부분을 보자. S3는 **특정 버킷의 ARN으로 제한** 했고(읽기 버킷과 쓰기 버킷을 분리), 작업에 필요한 액션만 넣었다. 데이터 버킷에 `s3:DeleteObject`나 `s3:*`를 넣지 않는 것이 최소 권한의 핵심이다.

> 💡 **관련 이론**: 최소 권한(least privilege)은 "필요한 만큼만"이 전부가 아니다. 세 축으로 좁힌다 — ① **액션**(`s3:*` 대신 `GetObject`만), ② **리소스**(`*` 대신 특정 버킷 ARN), ③ **조건**(`Condition` 블록으로 특정 VPC·태그·암호화 강제). 시험에서 "가장 안전한 정책"을 고르라면 보통 액션과 리소스가 가장 좁은 보기가 정답이다.

## 조건(Condition)으로 한 단계 더 좁히기

`Condition` 블록은 정책을 상황에 따라 제한한다. 예를 들어 특정 태그가 붙은 학습 작업만 허용하거나, 암호화되지 않은 S3 업로드를 거부할 수 있다.

```json
{
  "Sid": "DenyUnencryptedUploads",
  "Effect": "Deny",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::ml-model-artifacts-prod/*",
  "Condition": {
    "StringNotEquals": { "s3:x-amz-server-side-encryption": "aws:kms" }
  }
}
```

이 `Deny`는 KMS 암호화 없는 업로드를 원천 차단한다. 명시적 `Deny`는 어떤 `Allow`보다 우선하므로, 가드레일을 강제할 때 강력하다.

## 사용자 정책과 PassRole

사용자가 학습 작업을 만들 때는 실행 역할을 SageMaker에 "넘겨준다(pass)". 그래서 사용자 정책에 `iam:PassRole`이 필요하다. 이게 없으면 사용자가 작업 생성 권한이 있어도 역할을 붙이지 못해 실패한다.

```json
{
  "Effect": "Allow",
  "Action": "iam:PassRole",
  "Resource": "arn:aws:iam::123456789012:role/SageMakerExecutionRole",
  "Condition": {
    "StringEquals": { "iam:PassedToService": "sagemaker.amazonaws.com" }
  }
}
```

`iam:PassedToService` 조건으로 "이 역할은 SageMaker에만 넘길 수 있다"고 못박는다. PassRole을 무제한으로 주면 권한 상승(privilege escalation) 위험이 생기므로 반드시 리소스와 조건을 좁힌다.

> 💡 **관련 이론**: `iam:PassRole`은 시험 단골이다. "사용자가 학습 작업을 만들 권한은 있는데 자꾸 실패한다"는 시나리오의 정답은 대개 PassRole 누락이다. PassRole은 "역할을 떠넘기는 행위"에 대한 권한이지 역할 자체의 권한이 아니라는 점을 기억하자.

## Studio·노트북에서의 권한

SageMaker Studio와 노트북 인스턴스도 각자의 실행 역할로 동작한다. 데이터 사이언티스트가 노트북에서 학습을 돌리면, 그 노트북의 실행 역할 권한으로 S3·학습이 수행된다. 여기서 권한을 너무 넓게 주면(예: `AdministratorAccess`) 노트북이 곧 백도어가 된다. 팀·프로젝트별로 역할을 분리하고, 필요한 데이터 버킷만 허용하는 것이 표준이다.

## 정리하며

오늘의 한 문장: **SageMaker 권한은 "누가 호출하는가(사용자 정책)"와 "서비스가 무엇을 하는가(실행 역할)"를 분리해서 본다.** 사용자에게는 API 호출 권한과 `iam:PassRole`을 주고, 실행 역할에는 작업이 실제 건드리는 S3·ECR·CloudWatch·KMS만 좁게 허용한다. 액션·리소스·조건 세 축으로 좁히고, 가드레일은 명시적 `Deny`로 강제한다. 권한 실패 시나리오는 거의 다 "실행 역할 권한 부족" 또는 "PassRole 누락"으로 귀결된다.

내일은 네트워크 격리 — VPC 모드로 SageMaker를 인터넷에서 떼어내는 방법을 다룬다.

---

## 📝 연습 문제

**문제 1.** SageMaker 학습 작업이 시작되자마자 S3 데이터를 읽지 못해 "Access Denied"로 실패한다. 사용자는 `sagemaker:CreateTrainingJob` 권한을 정상적으로 가지고 있다. 원인으로 가장 적절한 것은?

A) 사용자 IAM 정책에 `s3:GetObject`가 없다  
B) SageMaker 실행 역할의 권한 정책에 해당 S3 버킷에 대한 읽기 권한이 없다  
C) S3 버킷이 다른 리전에 있다  
D) 학습 인스턴스 타입이 잘못되었다  

**정답: B**  
해설: 학습 작업 실행 중의 S3 접근은 사용자가 아니라 SageMaker가 떠맡은 실행 역할의 권한으로 수행되므로, 실행 역할에 버킷 읽기 권한이 없으면 Access Denied가 난다. A는 사용자 정책이 학습 작업 실행 중 S3 접근을 직접 결정하지 않으므로 틀리고, C·D는 권한 거부(Access Denied)가 아니라 다른 종류의 오류를 유발한다.

---

**문제 2.** 데이터 사이언티스트가 학습 작업 생성 권한을 가졌는데도 작업 생성이 "is not authorized to perform: iam:PassRole" 오류로 실패한다. 가장 적절한 해결책은?

A) 실행 역할에 `s3:*`를 추가한다  
B) 사용자 정책에 해당 실행 역할 ARN에 대한 `iam:PassRole` 권한을 추가한다  
C) 실행 역할의 신뢰 정책에서 SageMaker를 제거한다  
D) 사용자에게 `AdministratorAccess`를 부여한다  

**정답: B**  
해설: 학습 작업 생성 시 사용자는 실행 역할을 SageMaker에 넘겨야 하며 이를 위해 `iam:PassRole` 권한이 필요하므로, 오류 메시지대로 PassRole을 추가하면 된다. A는 실행 역할 권한이라 PassRole 오류와 무관하고, C는 역할 신뢰를 깨뜨려 더 악화시키며, D는 최소 권한 원칙에 반하고 근본 원인도 PassRole이라 과잉 대응이다.

---

**문제 3.** 보안팀이 "모델 아티팩트 버킷에는 KMS로 암호화된 객체만 업로드되어야 한다"는 규칙을 강제하려 한다. 실행 역할에 추가할 가장 효과적인 정책 요소는?

A) `s3:PutObject`를 `Allow`로 넓게 부여한다  
B) `s3:x-amz-server-side-encryption`이 `aws:kms`가 아니면 `s3:PutObject`를 `Deny`하는 조건부 명시적 거부  
C) 버킷을 퍼블릭으로 설정한다  
D) `iam:PassRole`을 제거한다  

**정답: B**  
해설: 암호화 헤더 조건을 검사해 KMS가 아닐 때 명시적 `Deny`를 거는 정책은 암호화되지 않은 업로드를 원천 차단하며, 명시적 거부는 어떤 허용보다 우선하므로 가드레일로 강력하다. A는 오히려 제약 없이 허용해 규칙을 무력화하고, C는 보안을 악화시키며, D는 PassRole은 업로드 암호화와 무관하다.

---

**문제 4.** SageMaker 실행 역할의 신뢰 정책에 반드시 포함되어야 하는 것은?

A) `Principal`에 사람 사용자의 ARN  
B) `Principal`의 `Service`로 `sagemaker.amazonaws.com`과 `sts:AssumeRole` 액션  
C) `s3:GetObject` 액션  
D) `Condition`에 특정 IP 주소  

**정답: B**  
해설: 신뢰 정책은 "누가 이 역할을 맡을 수 있는가"를 정의하며, SageMaker가 역할을 떠맡으려면 서비스 주체 `sagemaker.amazonaws.com`이 `sts:AssumeRole`을 할 수 있어야 한다. A는 서비스 역할이 사람이 아닌 서비스에 의해 assume되므로 틀리고, C는 신뢰 정책이 아니라 권한 정책에 들어가며, D는 필수 요소가 아니다.

---

**문제 5.** 최소 권한 원칙에 가장 부합하는 SageMaker 실행 역할 권한 정책은?

A) `AmazonSageMakerFullAccess` 관리형 정책 그대로 사용  
B) 모든 S3 버킷에 `s3:*` 허용  
C) 학습 데이터 버킷에 `s3:GetObject`/`s3:ListBucket`, 아티팩트 버킷에 `s3:PutObject`만 특정 ARN으로 허용  
D) `Action`과 `Resource`를 모두 `*`로 허용  

**정답: C**  
해설: 작업이 실제로 필요한 액션을 특정 버킷 ARN으로 제한하고 읽기/쓰기 버킷을 분리한 정책이 액션·리소스 두 축에서 가장 좁아 최소 권한에 부합한다. A는 학습에 불필요한 광범위 권한을 포함하고, B·D는 액션·리소스가 과도하게 넓어 최소 권한과 정반대다.

---
