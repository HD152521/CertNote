# Day 1 - SageMaker IAM 보안: 실행 역할과 최소 권한

## 📌 핵심 정리

- SageMaker 권한은 **사용자 정책**(누가 API를 호출하는가)과 **실행 역할**(서비스가 대신 무엇을 하는가) 두 경로로 갈린다.
- 학습 중 `AccessDenied`는 거의 항상 **실행 역할**의 S3·ECR·KMS 권한 문제이지 사용자 정책 문제가 아니다.
- 역할은 **신뢰 정책**(누가 맡을 수 있나 = `sagemaker.amazonaws.com`)과 **권한 정책**(무엇을 할 수 있나)이 둘 다 있어야 작동한다.
- 사용자에게는 API 호출 권한에 더해 **`iam:PassRole`**이 필요하다. 이 누락이 작업 생성 실패의 단골 원인.
- 최소 권한은 **액션·리소스·조건** 세 축으로 좁히고, 가드레일은 명시적 `Deny`로 강제한다.

## 권한이 흐르는 두 경로

이번 주는 ML 솔루션을 "안전하고 책임감 있게, 그리고 싸게" 운영하는 영역이고, 첫날 주제는 권한이다. SageMaker는 **사용자가 직접 호출하는 작업**과 **SageMaker가 사용자를 대신해 수행하는 작업**이 분리되어 있다. 이 둘을 헷갈리면 권한 시나리오를 매번 틀린다.

```text
[사람 · CI 파이프라인 · SDK 호출자]
        │  ① sagemaker:CreateTrainingJob        ← 사용자 IAM 정책
        │  ② iam:PassRole  (역할을 넘겨줌)       ← 사용자 IAM 정책
        ▼
┌────────────────────────────┐
│      SageMaker 서비스       │
└────────────────────────────┘
        │  ③ sts:AssumeRole                     ← 실행 역할의 "신뢰 정책"
        ▼
┌────────────────────────────┐
│    SageMaker 실행 역할      │
└────────────────────────────┘
        │  ④ 실제 리소스 접근                    ← 실행 역할의 "권한 정책"
        ├──▶ S3         : 학습 데이터 읽기 / model.tar.gz 쓰기
        ├──▶ ECR        : 알고리즘 컨테이너 이미지 pull
        ├──▶ CloudWatch : 로그 스트림 · 학습 지표
        └──▶ KMS        : 암호화된 버킷·EBS 볼륨의 키 사용
```

경로 ①②는 **요청을 받아줄지**를, 경로 ③④는 **작업이 실제로 돌아갈지**를 결정한다. 끊긴 지점이 어디냐에 따라 증상이 완전히 달라진다.

| 구분 | 사용자(IAM principal) 권한 | 실행 역할(execution role) 권한 |
|------|---------------------------|-------------------------------|
| 누가 쓰나 | 사람·CI·SDK 호출자 본인 | SageMaker 서비스가 assume해서 사용 |
| 대표 액션 | `sagemaker:CreateTrainingJob`, `sagemaker:CreateEndpoint`, `iam:PassRole` | `s3:GetObject`, `ecr:BatchGetImage`, `logs:PutLogEvents`, `kms:Decrypt` |
| 언제 평가되나 | API를 호출하는 순간 | 작업 컨테이너가 리소스를 실제로 만질 때 |
| 실패하면 언제 터지나 | 작업 생성 요청 자체가 거부됨 | 작업은 생성됐는데 실행 도중 `Failed` |
| 전형적 오류 문구 | `is not authorized to perform: sagemaker:...` / `iam:PassRole` | `AccessDenied` (S3 · ECR · KMS) |
| 붙이는 대상 | IAM 사용자·그룹·사람 쪽 역할 | 역할 하나. SDK의 `role=` 파라미터로 지정 |

핵심은 이것이다 — 학습 작업이 "S3 접근 거부"로 실패하면 그건 사용자 정책 문제가 아니라 **실행 역할**의 S3 권한 문제다. 시험은 이 구분을 반복해서 묻는다.

> 💡 **관련 이론**: 이 구조는 IAM의 "신뢰 정책 + 권한 정책" 분리에서 나온다. 사용자는 자신의 권한으로 SageMaker에 **요청**을 넣을 뿐, 그 뒤에 벌어지는 데이터 접근은 서비스가 떠맡은 역할의 신분으로 일어난다. 사용자에게 S3 권한이 아무리 많아도 실행 역할에 없으면 학습은 실패하고, 반대로 실행 역할이 아무리 세도 사용자에게 `CreateTrainingJob`이 없으면 작업은 만들어지지도 않는다.

## 신뢰 정책 vs 권한 정책 — 역할의 두 얼굴

역할 하나에는 서로 다른 질문에 답하는 정책 두 개가 붙는다. 둘 다 있어야 역할이 작동한다.

| 축 | 신뢰 정책 (Trust policy) | 권한 정책 (Permission policy) |
|----|--------------------------|-------------------------------|
| 답하는 질문 | 누가 이 역할을 **맡을** 수 있나 | 이 역할이 **무엇을 할** 수 있나 |
| 콘솔 위치 | 역할 → 신뢰 관계 탭 | 역할 → 권한 탭 |
| 핵심 요소 | `Principal` + `sts:AssumeRole` | `Action` + `Resource` (+ `Condition`) |
| SageMaker에서의 값 | `"Service": "sagemaker.amazonaws.com"` | S3·ECR·CloudWatch·KMS 액션 |
| 개수 | 역할당 정확히 1개 | 관리형·인라인 여러 개 붙일 수 있음 |
| 빠지면 생기는 증상 | 작업이 **시작조차** 못 함(역할 assume 실패) | 작업은 시작되나 실행 중 `AccessDenied` |

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

AWS가 제공하는 `AmazonSageMakerFullAccess`는 학습·실습용으로는 편하지만 프로덕션에는 **과도하다**. 작업이 실제로 건드리는 리소스만 허용하는 권한 정책을 직접 작성한다.

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

의도적으로 좁힌 부분을 보자. S3는 **특정 버킷 ARN으로 제한**했고 읽기 버킷과 쓰기 버킷을 분리했다. 데이터 버킷에 `s3:DeleteObject`나 `s3:*`를 넣지 않는 것이 최소 권한의 핵심이다. 학습 작업이 실제로 필요로 하는 권한은 아래 다섯 갈래로 정리된다.

| 리소스 | 필요한 이유 | 최소 액션 | 더 좁히는 방법 |
|--------|-------------|-----------|----------------|
| 학습 데이터 S3 | 입력 채널에서 데이터 읽기 | `s3:GetObject`, `s3:ListBucket` | 버킷 ARN + prefix까지 지정 |
| 아티팩트 S3 | `model.tar.gz` 업로드 | `s3:PutObject` | 출력 버킷만. 읽기 버킷과 분리 |
| ECR | 알고리즘 컨테이너 이미지 pull | `ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer` | 사내 이미지면 리포지토리 ARN으로 제한 |
| CloudWatch | 로그·학습 지표 방출 | `logs:CreateLogStream`, `logs:PutLogEvents`, `cloudwatch:PutMetricData` | 로그 그룹 ARN으로 제한 |
| KMS | SSE-KMS 버킷·암호화 볼륨 사용 | `kms:Decrypt`, `kms:GenerateDataKey` | 키 ARN 지정. **KMS 키 정책에도** 역할을 넣어야 함 |

> ⚠️ **함정**: KMS는 **역할의 IAM 정책과 KMS 키 정책 양쪽**에서 허용돼야 한다. IAM 정책에만 `kms:Decrypt`를 넣고 키 정책을 손대지 않아 계속 거부되는 사례가 흔하다. "S3 목록은 되는데 객체 읽기만 실패한다"면 십중팔구 SSE-KMS 키 권한이다.

> 💡 **관련 이론**: 최소 권한(least privilege)은 "필요한 만큼만"이 전부가 아니다. 세 축으로 좁힌다 — ① **액션**(`s3:*` 대신 `GetObject`만), ② **리소스**(`*` 대신 특정 버킷 ARN), ③ **조건**(`Condition` 블록으로 특정 VPC·태그·암호화 강제). 시험에서 "가장 안전한 정책"을 고르라면 보통 액션과 리소스가 가장 좁은 보기가 정답이다.

## Condition으로 한 단계 더 좁히기

`Condition` 블록은 정책을 상황에 따라 제한한다. 특정 태그가 붙은 작업만 허용하거나, 암호화되지 않은 업로드를 거부할 수 있다.

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

이 `Deny`는 KMS 암호화 없는 업로드를 원천 차단한다. 명시적 `Deny`는 어떤 `Allow`보다 우선하므로 가드레일을 강제할 때 강력하다.

| Condition 키 | 무엇을 강제하나 | 주로 붙는 자리 |
|--------------|-----------------|----------------|
| `iam:PassedToService` | 역할을 넘길 수 있는 서비스를 한정 | 사용자 정책의 `iam:PassRole` |
| `s3:x-amz-server-side-encryption` | 암호화 헤더 없는 업로드 차단 | 실행 역할 정책 · 버킷 정책 |
| `aws:RequestTag/*` · `aws:ResourceTag/*` | 특정 태그가 붙은 작업·리소스만 다루게 함 | 사용자 정책(프로젝트·팀별 분리) |
| `aws:SourceVpce` · `aws:SourceVpc` | 지정한 VPC 엔드포인트를 통한 접근만 허용 | S3 버킷 정책(내일 주제와 직결) |
| `sagemaker:VpcSubnets` · `sagemaker:VpcSecurityGroupIds` | VPC 설정이 없는 작업 생성 자체를 거부 | 사용자 정책 |
| `sagemaker:NetworkIsolation` | 네트워크 격리를 끈 작업 생성을 거부 | 사용자 정책 |

> 💡 **개념**: 마지막 세 줄이 중요한 이유는 **거버넌스를 사후 점검이 아니라 생성 시점에 막는 방식**이기 때문이다. "VPC 밖에서 학습을 돌리지 마세요"라고 문서로 공지하는 대신, VPC 설정 없는 `CreateTrainingJob` 요청 자체를 IAM에서 거부하면 규칙이 우회될 여지가 없다.

## 사용자 정책과 PassRole

사용자가 학습 작업을 만들 때는 실행 역할을 SageMaker에 "넘겨준다(pass)". 그래서 사용자 정책에 `iam:PassRole`이 필요하다. 이게 없으면 작업 생성 권한이 있어도 역할을 붙이지 못해 실패한다.

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

- `Resource`를 특정 역할 ARN으로 못박는다. `"Resource": "*"`는 사실상 계정 내 아무 역할이나 서비스에 실어 보낼 수 있다는 뜻이다.
- `iam:PassedToService` 조건으로 "이 역할은 SageMaker에만 넘길 수 있다"고 한정한다.
- 두 가지를 다 빼면 권한 상승(privilege escalation) 통로가 된다 — 권한이 약한 사용자가 강한 역할을 골라 서비스에 실어 보내고, 그 역할의 신분으로 코드를 실행할 수 있다.

> 💡 **관련 이론**: `iam:PassRole`은 시험 단골이다. "사용자가 학습 작업을 만들 권한은 있는데 자꾸 실패한다"는 시나리오의 정답은 대개 PassRole 누락이다. PassRole은 **"역할을 떠넘기는 행위"에 대한 권한**이지 역할 자체의 권한이 아니라는 점을 기억하자. 오류 메시지에 `iam:PassRole`이 그대로 찍히므로 식별도 쉽다.

## Studio·노트북에서의 권한 분리

SageMaker Studio와 노트북 인스턴스도 각자의 실행 역할로 동작한다. 데이터 사이언티스트가 노트북에서 학습을 돌리면 그 노트북의 실행 역할 권한으로 S3 접근과 학습이 수행된다. 권한을 너무 넓게 주면(예: `AdministratorAccess`) 노트북이 곧 백도어가 된다.

| 주체 | 어떤 역할로 도나 | 흔한 실수 |
|------|------------------|-----------|
| Studio 도메인 | 도메인 생성 시 지정한 기본 실행 역할 | 팀 전체가 한 역할을 공유해 데이터 경계가 무너짐 |
| Studio 사용자 프로필 | 프로필별 실행 역할로 도메인 기본값을 덮어씀 | 프로필 역할을 안 나눠 최소 권한이 무력화됨 |
| 노트북 인스턴스 | 인스턴스 생성 시 지정한 역할 | `AdministratorAccess` 부여 → 노트북이 사실상 백도어 |
| 학습·처리·배치 작업 | SDK의 `role=`로 넘긴 역할 | 노트북 역할을 그대로 재사용해 권한이 뒤섞임 |
| 엔드포인트 | 모델 생성 시 지정한 역할 | 학습용 역할을 재사용해 불필요한 쓰기 권한을 안고 감 |

팀·프로젝트별로 역할을 분리하고, 각 역할이 필요한 데이터 버킷만 허용하는 것이 표준이다. 태그 기반 `Condition`을 쓰면 "프로젝트 태그가 내 것인 작업만 볼 수 있다" 같은 경계를 정책 하나로 만들 수 있다.

## 권한 문제를 진단하는 순서

권한 사고가 났을 때 추측 대신 확인부터 한다. 작업 설명에는 실제로 사용된 역할 ARN과 실패 사유가 그대로 들어 있다.

```python
import boto3

sm = boto3.client('sagemaker')
desc = sm.describe_training_job(TrainingJobName='my-training-job')

print(desc['RoleArn'])        # 이 작업이 실제로 사용한 실행 역할
print(desc['FailureReason'])  # AccessDenied면 어떤 리소스인지 여기에 찍힌다

# 그 역할에 실제로 붙어 있는 정책 확인
iam = boto3.client('iam')
role_name = desc['RoleArn'].split('/')[-1]
print(iam.list_attached_role_policies(RoleName=role_name))  # 관리형 정책
print(iam.list_role_policies(RoleName=role_name))           # 인라인 정책
```

`FailureReason`에 찍힌 리소스 ARN이 정책의 `Resource`와 한 글자라도 다르면(버킷 이름 오타, prefix 누락) 그게 원인이다. 정책이 맞는데도 거부된다면 명시적 `Deny`를 의심한다.

> 💡 **개념**: IAM 평가 순서는 **명시적 Deny > 명시적 Allow > 암묵적 Deny**다. 역할 정책이 완벽해도 조직의 SCP, 역할에 걸린 권한 경계(permissions boundary), S3 버킷 정책 중 어느 하나가 `Deny`면 거부된다. "권한을 다 줬는데 왜 안 되지"의 답은 대개 이 세 곳 중 하나다.

## 권한이 막힐 때: 증상 → 원인 → 조치

| 증상 | 흔한 원인 | 조치 |
|------|-----------|------|
| 작업 생성이 `iam:PassRole` 거부로 실패 | 사용자 정책에 PassRole이 없음 | 해당 역할 ARN 한정으로 PassRole 부여 + `iam:PassedToService` 조건 |
| 작업이 시작도 못 하고 즉시 실패 | 실행 역할 신뢰 정책에 `sagemaker.amazonaws.com`이 없음 | 신뢰 관계에 서비스 주체 + `sts:AssumeRole` 추가 |
| 학습 시작 직후 S3 `AccessDenied` | 실행 역할에 데이터 버킷 읽기 권한 없음, 또는 버킷·prefix 불일치 | `s3:GetObject`+`s3:ListBucket`을 정확한 버킷 ARN에 부여 |
| 버킷 목록은 되는데 객체 읽기만 실패 | 버킷이 SSE-KMS인데 KMS 권한이 없음 | `kms:Decrypt`·`kms:GenerateDataKey` 부여 + **KMS 키 정책**에도 역할 추가 |
| 컨테이너 이미지 pull 실패 | ECR 액션 누락, 또는 다른 계정의 리포지토리 | ECR 액션 부여. 교차 계정이면 리포지토리 정책도 함께 수정 |
| 로그·지표가 CloudWatch에 안 보임 | `logs:CreateLogStream`·`PutLogEvents` 누락 | 로그·지표 액션 부여. 지표가 없으면 튜닝·조기 종료도 작동하지 않는다 |
| 아티팩트 업로드만 거부됨 | 암호화 강제 `Deny` 조건에 걸림 | 작업에 KMS 키를 지정해 SSE-KMS로 업로드되게 함 |
| 정책을 다 줬는데도 계속 거부 | SCP·권한 경계·버킷 정책 어딘가의 명시적 `Deny` | 명시적 Deny 우선 규칙. 세 곳을 순서대로 점검 |
| 사용자가 남의 프로젝트 작업까지 조회·중단 가능 | 사용자 정책이 리소스 `*`로 열려 있음 | `aws:ResourceTag` 조건으로 프로젝트 태그 경계 설정 |

내일은 네트워크 격리 — VPC 모드로 SageMaker를 인터넷에서 떼어내는 방법을 다룬다.

## 📖 용어

- **실행 역할 (execution role)** : SageMaker가 사용자를 대신해 떠맡는 IAM 역할. 학습 중의 S3·ECR·CloudWatch 접근은 전부 이 역할의 신분으로 일어난다.
- **신뢰 정책 (trust policy)** : "누가 이 역할을 맡을 수 있는가"를 정의하는 정책. SageMaker 역할이면 `sagemaker.amazonaws.com`이 들어간다.
- **권한 정책 (permission policy)** : "이 역할이 무엇을 할 수 있는가"를 정의하는 정책. 액션·리소스·조건으로 구성된다.
- **AssumeRole** : 어떤 주체가 역할의 신분을 잠시 빌려 쓰는 동작. 신뢰 정책이 허락해야 가능하다.
- **iam:PassRole** : 역할을 다른 서비스에 넘겨주는 행위에 대한 권한. 역할 자체의 권한이 아니라 "넘기기"에 대한 권한이다.
- **최소 권한 (least privilege)** : 필요한 액션·리소스만 허용하는 원칙. 액션·리소스·조건 세 축으로 좁힌다.
- **Condition 블록** : 정책이 언제 적용될지 상황을 제한하는 부분. 태그·암호화·VPC 같은 조건을 걸 수 있다.
- **명시적 Deny** : `Effect: Deny`로 직접 적은 거부. 어떤 `Allow`보다 우선하므로 가드레일 용도로 쓴다.
- **권한 경계 (permissions boundary)** : 역할이 가질 수 있는 권한의 상한선. 정책이 허용해도 경계 밖이면 거부된다.
- **권한 상승 (privilege escalation)** : 약한 권한의 사용자가 강한 역할을 손에 넣는 것. 무제한 PassRole이 대표적 통로다.

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
