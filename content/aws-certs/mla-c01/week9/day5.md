# Day 5 - Week 9 종합: 보안·거버넌스·비용 복습

## 📌 핵심 정리

- Week 9의 한 문장: **기본값을 신뢰하지 말고 명시적으로 좁혀라** — 권한은 최소로, 네트워크는 격리로, 데이터는 암호화로, 비용은 유휴 제거로.
- **권한**은 두 경로로 갈린다. 작업 **생성** 실패는 사용자 정책(`sagemaker:*`·`iam:PassRole`), 작업 **실행 중** 실패는 실행 역할(S3·ECR·KMS).
- **네트워크**는 3단계 — VPC 모드(트래픽을 내 VPC로) → VPC 엔드포인트(인터넷 없이 AWS 서비스 도달) → `EnableNetworkIsolation`(모든 아웃바운드 차단).
- **암호화**는 at-rest(KMS/CMK)·in-transit(TLS·노드 간)·Secrets 세 갈래이고, KMS는 IAM 정책과 키 정책 **양쪽 문**을 다 통과해야 한다.
- **비용**은 학습=Spot+체크포인트, 인스턴스=워크로드에 맞게, 추론=유휴 0으로, 운영=자동 종료·태그·Budgets.

## 4개 축 한눈에 보기

"안전하게, 통제 가능하게, 싸게" 운영하는 네 갈래는 따로 보이지만 실제로는 하나의 운영 정책으로 묶인다.

| 축 | 핵심 질문 | 주요 도구 | 대표 설정 키 | 시험 단골 함정 |
|----|-----------|-----------|--------------|----------------|
| 권한(Day1) | 누가 무엇을 하나 | 실행 역할, IAM 정책, PassRole | `RoleArn`, `iam:PassRole` | "S3 거부"=실행 역할 문제, PassRole 누락 |
| 네트워크(Day2) | 트래픽이 어디로 | VPC 모드, 네트워크 격리, VPC 엔드포인트 | `VpcConfig`, `EnableNetworkIsolation` | 엔드포인트 누락=작업 멈춤 |
| 암호화(Day3) | 데이터·모델 보호 | KMS(CMK), at-rest/in-transit, Secrets | `KmsKeyId`, `VolumeKmsKeyId` | `kms:Decrypt` 누락 |
| 비용(Day4) | 어떻게 아끼나 | Spot, right-size, 서버리스/배치, 자동종료, 태그 | `EnableManagedSpotTraining`, `Tags` | 안 끈 리소스, Spot은 학습만 |

> 💡 **관련 이론**: 이 네 축은 AWS Well-Architected의 보안·비용 최적화 기둥을 ML에 적용한 것이다. 공통 사상은 "기본값을 신뢰하지 말고 명시적으로 좁혀라". 시험은 "가장 안전한"·"가장 비용 효율적인" 보기를 고르라고 하며, 거의 항상 가장 좁고 명시적인 보기가 정답이다. 네 축은 독립이 아니라 서로 물린다 — 실행 역할은 KMS 키 정책과 STS 엔드포인트에서, 네트워크는 인터페이스 엔드포인트 과금에서 비용과 만난다.

## 권한 복습 — 사용자 정책 vs 실행 역할

핵심은 두 경로 분리다. **사용자 정책** 은 API 호출 권한(`sagemaker:CreateTrainingJob`)과 `iam:PassRole`을 결정하고, **실행 역할** 은 SageMaker가 작업 중 건드리는 S3·ECR·CloudWatch·KMS를 결정한다.

```text
[권한이 흐르는 경로]
  사용자 / CI
      │ ① sagemaker:CreateTrainingJob  (사용자 정책)
      │ ② iam:PassRole → SageMakerExecutionRole
      ▼
  SageMaker 서비스
      │ ③ sts:AssumeRole  (실행 역할의 신뢰 정책이 허용해야 함)
      ▼
  실행 역할  ── ④ 권한 정책으로 실제 리소스 접근
      ├──▶ S3 (Get/PutObject) · ECR (이미지 pull) · CloudWatch Logs
      └──▶ KMS (Decrypt / GenerateDataKey) ← 키 정책도 이 역할을 허용해야 함
```

①·②가 막히면 **작업이 생성조차 안 되고**(`is not authorized to perform: iam:PassRole`), ③·④가 막히면 **작업은 시작됐다가 실행 중에 실패**한다(S3/KMS `Access Denied`). 오류가 나온 시점이 곧 진단의 첫 갈림길이다.

최소 권한은 **액션·리소스·조건** 세 축으로 좁힌다. 관리형 `AmazonSageMakerFullAccess`는 학습용으로는 편하지만 프로덕션에는 과도하고, 가드레일은 명시적 `Deny`로 강제한다(명시적 거부가 어떤 허용보다 우선). PassRole은 리소스를 `*`로 열면 권한 상승 경로가 되므로, 넘길 역할 ARN을 특정하고 `iam:PassedToService`로 넘길 서비스까지 못박는다.

## 네트워크 복습 — 격리 3단계

세 단계는 대체재가 아니라 **겹쳐 쓰는 레이어**다. 아래로 갈수록 강하고 제약도 크다.

| 단계 | 설정 | 무엇을 하나 | 대가 |
|------|------|-------------|------|
| ① VPC 모드 | `VpcConfig`(Subnets·SecurityGroupIds) | 컨테이너를 고객 VPC 서브넷(ENI)에 붙여 보안 그룹·라우팅 등 VPC 통제를 적용 | 엔드포인트를 직접 갖춰야 함 |
| ② VPC 엔드포인트 | 게이트웨이 / 인터페이스(PrivateLink) | 인터넷 게이트웨이 없이 S3·SageMaker API·ECR·Logs·STS에 도달 | 인터페이스는 과금 |
| ③ 네트워크 격리 | `EnableNetworkIsolation: true` | 컨테이너의 **모든** 아웃바운드 차단(인터넷·VPC 내부 포함) | 의존성을 이미지에 선탑재해야 함 |

| 구분 | 게이트웨이 엔드포인트 | 인터페이스 엔드포인트(PrivateLink) |
|------|----------------------|------------------------------------|
| 대상 서비스 | S3, DynamoDB **전용** | SageMaker API/Runtime, ECR, Logs, STS 등 대부분 |
| 동작 방식 | 라우팅 테이블에 경로 추가 | 서브넷에 ENI 생성 + 프라이빗 IP 부여 |
| 비용 | 없음 | 시간·데이터 처리량당 과금 |
| 보안 그룹 | 붙지 않음(라우팅 기반) | ENI에 보안 그룹이 붙음 |

```text
[VPC 모드 학습에 필요한 엔드포인트]
com.amazonaws.<region>.s3                  (게이트웨이) → 학습 데이터 / 아티팩트
com.amazonaws.<region>.sagemaker.api       (인터페이스) → 작업 제어
com.amazonaws.<region>.sagemaker.runtime   (인터페이스) → 추론 호출
com.amazonaws.<region>.ecr.dkr / ecr.api   (인터페이스) → 컨테이너 이미지 pull
com.amazonaws.<region>.logs                (인터페이스) → CloudWatch Logs
com.amazonaws.<region>.sts                 (인터페이스) → 역할 assume
```

보안 그룹은 ENI 레벨 방화벽이다. 컨테이너 SG는 **자기 참조 인바운드**(노드 간 통신)와 443 아웃바운드(엔드포인트 SG 대상)를, 엔드포인트 SG는 443 인바운드를 갖는다. 자기 참조 규칙이 없으면 멀티 노드 학습이 시작되지 않는다.

> ⚠️ **함정**: "VPC 모드로 바꿨더니 작업이 시작은 되는데 진행이 안 되고 타임아웃"은 하이퍼파라미터 문제가 아니라 거의 항상 **S3/ECR 엔드포인트 누락**이다. 반대로 작업이 아예 생성되지 않으면 네트워크가 아니라 권한(PassRole) 쪽을 본다.

## 암호화 복습 — at-rest·in-transit·Secrets

보호 대상별로 어디에 무엇을 거는지 굳혀둔다.

| 보호 대상 | 유형 | 거는 곳 |
|-----------|------|---------|
| S3 학습 데이터 | at-rest | SSE-KMS(CMK 권장) + 버킷 정책으로 비암호화 업로드 `Deny` |
| 학습 인스턴스 볼륨 | at-rest | `ResourceConfig.VolumeKmsKeyId` (EBS/로컬 스토리지) |
| 모델 아티팩트 | at-rest | `OutputDataConfig.KmsKeyId` (`model.tar.gz`도 지적 자산) |
| 분산 학습 노드 간 | in-transit | `EnableInterContainerTrafficEncryption` (멀티 노드에서만 의미) |
| S3↔컨테이너·엔드포인트 호출 | in-transit | TLS/HTTPS (호스팅 볼륨은 `KmsKeyId`로 at-rest) |
| DB 비밀번호·API 키 | Secrets | Secrets Manager / Parameter Store (하드코딩 금지) |

| 선택지 | 고르는 순간 |
|--------|-------------|
| AWS 관리형 키 vs **CMK** | 설정만 간단하면 되면 관리형, 키 정책 통제·CloudTrail 감사·crypto-shredding이 필요하면 CMK(규제 표준) |
| **Secrets Manager** vs Parameter Store(SecureString) | **자동 회전**이 필요하면 Secrets Manager, 단순 설정값·토큰이면 Parameter Store(회전 수동) |

> 💡 **관련 이론**: 권한과 암호화는 KMS에서 만난다. 암호화된 데이터를 읽으려면 IAM 정책의 `kms:Decrypt` AND 키 정책의 역할 허용이 둘 다 필요하고, 쓰기는 `kms:GenerateDataKey`가 추가로 필요하다. "S3는 줬는데 안 된다"의 답이 KMS인 이유다.

## 비용 복습 — 학습·추론·운영

| 영역 | 수단 | 효과 | 쓰면 안 되는 곳 |
|------|------|------|-----------------|
| 학습 | Managed Spot + 체크포인트 | 최대 90% 절감 | 실시간 엔드포인트(회수 시 서비스 중단) |
| 인스턴스 | 트리·선형=CPU, 딥러닝 학습=GPU, 딥러닝 추론=Inferentia | 과프로비저닝·미스매치 제거 | XGBoost에 고성능 GPU(효과 없음) |
| 인스턴스 | Inference Recommender | 부하 테스트로 최적 타입 추천 | — |
| 추론 | 서버리스 / 비동기 / 배치 변환 | 유휴 구간 비용을 0에 근접 | 상시 트래픽(콜드 스타트만 손해) |
| 추론 | 실시간 + 오토스케일 + MME | 상시 트래픽의 단위 비용 절감 | 유휴가 대부분인 워크로드 |
| 운영 | 유휴 노트북 자동 종료, 엔드포인트 정리, `MaxRuntimeInSeconds` | 안 끈 리소스·폭주 작업 차단 | — |
| 운영 | 태그 + Cost Explorer + Budgets | 측정→귀속→예산→알림 | — |
| 운영 | Savings Plans / 예약 인스턴스 | 상시 워크로드 약정 할인 | 간헐적 워크로드(약정만 손해) |

```text
[추론 비용 결정 트리]
유휴 구간(트래픽 0)이 있는가?
 ├─ 예 ─▶ 일괄 처리로 미뤄도 되나?
 │         ├─ 예 ─▶ 배치 변환 (작업 종료 시 인스턴스 내림 → 가장 저렴)
 │         └─ 아니오 ─▶ 페이로드가 큰가?
 │                       ├─ 예 ─▶ 비동기 추론
 │                       └─ 아니오 ─▶ 서버리스 추론 (콜드 스타트 감수)
 └─ 아니오(상시) ─▶ 실시간 + 오토스케일링 + MME(다수 모델) + Inferentia(딥러닝)
```

> ⚠️ **함정**: "비용을 줄여라"만 보고 Spot을 고르면 안 된다. Spot은 **재개 가능한 학습** 전용이고, 실시간 엔드포인트 비용 절감의 정답 후보는 서버리스 전환·오토스케일·MME·Inferentia·Savings Plans다.

## 요구사항 키워드 → 기능 매핑

시험 지문의 키워드는 거의 그대로 기능을 지목한다. 통째로 외우는 게 가장 빠르다.

| 지문 키워드 | 지목되는 기능 |
|-------------|---------------|
| "인터넷을 경유하면 안 된다" | VPC 모드 + VPC 엔드포인트(S3는 게이트웨이, 나머지는 인터페이스) |
| "컨테이너의 외부 통신을 완전히 차단" | `EnableNetworkIsolation: true` + 의존성 이미지 선탑재 |
| "고객이 키를 통제·감사해야" | 고객 관리형 키(CMK) + CloudTrail |
| "저장·전송 데이터 모두 보호" | SSE-KMS + TLS·`EnableInterContainerTrafficEncryption` |
| "비밀번호를 주기적으로 자동 회전" | Secrets Manager (단순 설정값이면 Parameter Store) |
| "암호화 안 된 업로드를 원천 차단" | 버킷/IAM 정책의 조건부 명시적 `Deny` |
| "가장 안전한 정책을 고르시오" | 액션·리소스가 가장 좁고 버킷 ARN이 특정된 보기 |
| "재개 가능한 학습의 비용 최소화" | Managed Spot + `CheckpointConfig` |
| "야간·주말 트래픽이 0" | 서버리스 추론(큰 페이로드면 비동기, 일괄이면 배치 변환) |
| "팀·프로젝트별 비용을 나눠 보고 싶다" | 비용 할당 태그 + Cost Explorer(예산 초과 알림은 Budgets) |

## 증상 → 원인 → 조치

Week 9의 디버깅은 네 갈래로 환원된다 — "사용자냐 실행 역할이냐", "엔드포인트 누락이냐", "`kms:Decrypt`냐", "안 끈 리소스냐".

| 증상 | 원인 | 조치 |
|------|------|------|
| 작업 생성이 `iam:PassRole` 오류로 실패 | 사용자 정책에 PassRole 없음 | 역할 ARN·`iam:PassedToService`를 특정한 PassRole 추가 |
| 작업은 시작됐는데 S3 `Access Denied` | 실행 역할에 버킷 권한 없음 | 해당 버킷 ARN으로 `s3:GetObject`/`PutObject` 부여 |
| S3 권한은 있는데 암호화 객체 읽기 실패 | `kms:Decrypt` 누락 또는 키 정책 미허용 | IAM 정책 + CMK 키 정책 **양쪽** 에 실행 역할 허용 |
| VPC 모드 후 작업이 멈춰 타임아웃 | S3 게이트웨이·ECR 인터페이스 엔드포인트 누락 | 필요한 엔드포인트 생성 + 라우팅·보안 그룹 443 확인 |
| 멀티 노드 학습이 시작되지 않음 | 보안 그룹 자기 참조 인바운드 누락 | 같은 SG를 출처로 하는 인바운드 규칙 추가 |
| Spot 학습이 매번 처음부터 다시 돔 | `CheckpointConfig` 미지정 또는 재개 로직 없음 | 체크포인트 S3 경로 지정 + 스크립트에 재개 로직 |
| Spot 작업이 시작도 못 하고 종료 | `MaxWaitTimeInSeconds` < `MaxRuntimeInSeconds` | 대기 시간을 실행 시간 이상으로 상향 |
| 월 비용이 원인 불명으로 급증 | 방치된 노트북·엔드포인트, 폭주 학습 | 유휴 자동 종료 + 엔드포인트 정리 + `MaxRuntimeInSeconds` |

## 통합 시나리오 — 민감 금융 데이터 사기탐지

"민감 금융 데이터로 딥러닝 사기탐지 모델을 학습·서빙하되 비용을 통제하라"는 요구를 4축으로 분해하면 이렇게 된다.

```text
[요구] 민감 데이터 · 인터넷 경유 금지 · 고객 키 통제 · 비용 절감

권한     데이터 버킷 읽기 / 아티팩트 버킷 쓰기만 허용한 최소 권한 실행 역할
    │    + 그 역할로 한정한 PassRole + 비암호화 업로드 Deny 가드레일
네트워크  VPC 모드(프라이빗 서브넷) + 엔드포인트 6종, IGW 없음
    │    + 분산이면 SG 자기 참조 / 극단적 민감도면 네트워크 격리
암호화    CMK 하나로 볼륨·아티팩트 at-rest + 노드 간 in-transit
    │    + 키 정책에 실행 역할 허용 / DB 자격증명은 Secrets Manager
비용     Spot+체크포인트 / 추론은 트래픽 패턴대로 / 태그·유휴 자동 종료
```

이걸 하나의 학습 작업 요청으로 옮기면 네 축이 전부 파라미터로 나타난다.

```python
import boto3
sm = boto3.client("sagemaker")

sm.create_training_job(
    TrainingJobName="fraud-dl-2026-01",
    RoleArn=EXEC_ROLE_ARN,                       # 권한: 최소 권한 실행 역할
    OutputDataConfig={"S3OutputPath": "s3://ml-artifacts/fraud/",
                      "KmsKeyId": CMK_ARN},      # 암호화: 아티팩트 at-rest
    ResourceConfig={"InstanceType": "ml.g5.xlarge", "InstanceCount": 2,
                    "VolumeKmsKeyId": CMK_ARN},  # 암호화: 볼륨 at-rest
    VpcConfig={"Subnets": ["subnet-0a1b2c3d", "subnet-4e5f6a7b"],
               "SecurityGroupIds": ["sg-0123456789abcdef0"]},   # 네트워크
    EnableNetworkIsolation=True,                 # 네트워크: 아웃바운드 전면 차단
    EnableInterContainerTrafficEncryption=True,  # 암호화: 노드 간 in-transit
    EnableManagedSpotTraining=True,              # 비용: Spot
    CheckpointConfig={"S3Uri": "s3://ml-checkpoints/fraud/"},
    StoppingCondition={"MaxRuntimeInSeconds": 86400,
                       "MaxWaitTimeInSeconds": 90000},          # 비용: 폭주 차단
    Tags=[{"Key": "Team", "Value": "risk"},      # 거버넌스: 비용 귀속
          {"Key": "Project", "Value": "fraud-ml"}],
)
```

절감분은 `describe_training_job` 응답의 `TrainingTimeInSeconds`(실제 학습 시간)와 `BillableTimeInSeconds`(과금 시간) 차이로 확인한다.

> 💡 **개념**: 이 스니펫이 Week 9의 압축판이다 — `RoleArn`(권한) → `VpcConfig`·`EnableNetworkIsolation`(네트워크) → `KmsKeyId`·`VolumeKmsKeyId`(암호화) → `EnableManagedSpotTraining`·`Tags`(비용·거버넌스). 지문을 읽을 때 "이 요구가 어느 파라미터로 떨어지는가"를 떠올리면 보기 판별이 즉시 끝난다.

이로써 ML 솔루션의 운영 영역까지 한 바퀴를 돌았다. 다음은 그동안 쌓은 지식을 실전 모의고사로 다지는 단계다.

## 📖 용어

- **실행 역할(execution role)** : SageMaker가 사용자를 대신해 떠맡는 IAM 역할. 작업 중 S3·ECR·KMS 접근은 전부 이 역할 권한으로 이뤄진다.
- **iam:PassRole** : 사용자가 역할을 서비스에 "넘겨주는" 행위에 대한 권한. 역할 자체의 권한이 아니라 넘기는 권한이라는 점이 핵심이다.
- **신뢰 정책(trust policy)** : "누가 이 역할을 맡을 수 있는가"를 정의하는 정책. SageMaker 실행 역할이면 `sagemaker.amazonaws.com`이 들어가야 한다.
- **VPC 모드** : 컨테이너를 고객 VPC 서브넷에 ENI로 붙여, 보안 그룹·라우팅 등 익숙한 VPC 통제를 적용하게 하는 설정.
- **EnableNetworkIsolation** : 컨테이너의 모든 아웃바운드 호출을 끊는 가장 강한 격리. 대신 의존성을 이미지에 미리 다 넣어야 한다.
- **VPC 엔드포인트** : 인터넷을 거치지 않고 AWS 서비스에 닿는 통로. S3·DynamoDB는 무료인 게이트웨이, 그 외는 과금되는 인터페이스(PrivateLink) 방식.
- **고객 관리형 키(CMK)** : 직접 만들어 키 정책으로 접근을 통제하고 CloudTrail로 감사할 수 있는 KMS 키. 규제 환경의 사실상 표준.
- **crypto-shredding** : 데이터를 지우지 않고 키 접근만 끊어 사실상 못 읽게 만드는 방식. CMK를 쓰는 이유 중 하나다.
- **Managed Spot Training** : 남는 용량을 싸게 빌려 학습하는 방식(최대 90% 절감). 회수될 수 있으므로 체크포인트가 짝이다.
- **비용 할당 태그** : 리소스에 붙이는 `Team`·`Project` 같은 태그. 이게 있어야 Cost Explorer에서 팀·프로젝트별 비용을 쪼개 볼 수 있다.

---

## 📝 연습 문제

**문제 1.** 민감 데이터로 학습하는 워크로드에서 "컨테이너가 인터넷으로 데이터를 유출할 수 없게 하라"와 "학습 데이터·아티팩트를 고객이 통제하는 키로 암호화하라"를 동시에 만족해야 한다. 가장 적절한 조합은?

A) 퍼블릭 서브넷 + AWS 관리형 키  
B) VPC 모드(또는 네트워크 격리) + 고객 관리형 키(CMK)로 at-rest 암호화  
C) 인터넷 게이트웨이 추가 + 암호화 없음  
D) 실시간 엔드포인트 + Spot  

**정답: B**  
해설: 인터넷 유출 차단은 VPC 모드(혹은 더 강한 네트워크 격리)로, 고객이 통제하는 키 암호화는 CMK로 데이터·아티팩트를 at-rest 암호화해 두 요구를 함께 만족한다. A는 퍼블릭 서브넷이 유출 경로를 열고 관리형 키는 통제력이 약하며, C는 두 요구 모두 위반하고, D는 보안 요구와 무관한 학습 비용 옵션이다.

---

**문제 2.** 사용자는 `sagemaker:CreateTrainingJob` 권한이 있고 실행 역할도 적절한 S3 권한을 가졌다. 그런데 작업 생성이 "is not authorized to perform: iam:PassRole"로 실패한다. 원인과 해결로 맞는 것은?

A) 실행 역할에 KMS 권한이 없다 → kms:Decrypt 추가  
B) 사용자 정책에 해당 실행 역할에 대한 `iam:PassRole`이 없다 → PassRole 추가  
C) VPC 엔드포인트가 없다 → 엔드포인트 추가  
D) Spot 설정이 잘못됐다 → Spot 비활성화  

**정답: B**  
해설: 작업 생성 시 사용자는 실행 역할을 SageMaker에 넘겨야 하며 이를 위해 `iam:PassRole`이 필요하므로, 오류 메시지대로 사용자 정책에 PassRole을 추가하면 된다. A는 KMS 권한 문제는 작업 실행 중 복호화에서 나타나고, C는 엔드포인트 누락은 작업이 멈추는 증상이며, D는 Spot은 PassRole 오류와 무관하다.

---

**문제 3.** 여러 데이터 사이언스 팀이 한 계정에서 SageMaker를 사용하는데, 매월 비용이 통제 불능으로 늘고 누가 얼마 쓰는지 알 수 없다. 비용을 가시화하고 통제하는 가장 적절한 조치 조합은?

A) 모든 리소스를 삭제한다  
B) 비용 할당 태그(Team/Project)로 Cost Explorer 집계 + AWS Budgets로 한도·알림 + 유휴 리소스 자동 종료  
C) 인스턴스를 모두 GPU로 통일한다  
D) 모든 엔드포인트를 항상 켜둔다  

**정답: B**  
해설: 비용을 팀·프로젝트에 귀속시키는 태그와 Cost Explorer로 가시화하고, Budgets로 한도와 알림을 두며, 유휴 리소스 자동 종료로 낭비를 막는 조합이 측정·귀속·예산·차단을 모두 충족한다. A는 업무를 중단시키고, C는 비용을 키우며, D는 유휴 비용을 늘려 문제를 악화시킨다.

---

**문제 4.** SSE-KMS(CMK)로 암호화된 S3 학습 데이터를 VPC 모드 학습 작업이 읽으려 한다. 실행 역할에 S3 읽기 권한은 있는데 작업이 KMS 관련 Access Denied로 실패한다. 점검할 항목으로 가장 적절한 것은?

A) 학습 알고리즘의 하이퍼파라미터  
B) 실행 역할의 `kms:Decrypt` 권한과 해당 CMK 키 정책에서의 역할 허용  
C) 노트북 인스턴스 타입  
D) Cost Explorer 태그  

**정답: B**  
해설: SSE-KMS 데이터 복호화는 IAM 정책의 `kms:Decrypt`와 키 정책의 역할 허용이 둘 다 있어야 하므로, KMS Access Denied는 이 둘 중 하나의 누락을 점검해야 한다. A·C는 권한 거부와 무관하고, D는 비용 도구라 복호화 권한과 관련이 없다.

---

**문제 5.** 다음 중 Week 9에서 다룬 시나리오와 권장 조치의 연결로 잘못된 것은?

A) 재개 가능한 딥러닝 학습 비용 절감 → Managed Spot Training + 체크포인트  
B) 야간 트래픽 0인 간헐적 엔드포인트 비용 → 서버리스 추론으로 전환  
C) DB 비밀번호 자동 회전 → AWS Secrets Manager  
D) 실시간 추론 엔드포인트 비용 절감 → 엔드포인트를 Spot 인스턴스로 실행  

**정답: D**  
해설: 실시간 추론 엔드포인트는 Spot이 회수되면 서비스가 중단되므로 Spot이 부적절하며, Spot은 재개 가능한 학습에만 적합하다. A·B·C는 각각 재개 가능 학습=Spot+체크포인트, 유휴 0 구간=서버리스, 자동 회전 자격증명=Secrets Manager로 모두 올바른 연결이다.

---
