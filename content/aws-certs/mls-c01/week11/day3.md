# Day 3 - ML Security: IAM Execution Roles, VPC Isolation, KMS Encryption

## 📌 핵심 정리

- ML 보안은 **IAM 실행 역할**(누가 무엇을 하나) · **VPC 격리**(어디로 통신하나) · **KMS 암호화**(누가 풀 수 있나) 세 기둥이다.
- SageMaker 학습 작업과 엔드포인트는 **사용자 자격증명이 아니라 실행 역할(Execution Role)**로 동작한다. `AccessDenied`는 실행 역할부터 의심한다.
- "인터넷에 절대 나가지 않는다"는 요건은 **프라이빗 서브넷 + VPC 엔드포인트 + `enable_network_isolation`** 조합으로 충족한다.
- 암호화는 켜는 것보다 **누가 키를 쓸 수 있는가**가 핵심이다. KMS 키 정책과 IAM 정책이 **둘 다 허용**해야 복호화된다.
- 팀·프로젝트별 CMK를 분리하면 IAM 권한이 있어도 키 정책에서 막혀 데이터 격리가 강제된다.

## 보안 3기둥 한눈에 보기

ML 시스템은 민감한 학습 데이터, 값비싼 모델 아티팩트, 넓은 권한이 한곳에 모인다. 유출되면 데이터 절도·모델 탈취·권한 남용이 한꺼번에 일어난다.

```text
                    ┌──────────────────────────────────┐
                    │   SageMaker 학습 / 추론 워크로드    │
                    └────────────────┬─────────────────┘
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
  ① IAM 실행 역할               ② VPC 격리                  ③ KMS 암호화
  "누가 무엇을 하나"            "어디로 통신하나"            "누가 풀 수 있나"
        │                            │                            │
  - 최소 권한 정책              - 프라이빗 서브넷            - S3 SSE-KMS
  - 신뢰 정책                  - VPC 엔드포인트             - volume_kms_key
  - S3/KMS 경로 한정            - 보안 그룹                 - output_kms_key
                               - 네트워크 격리              - 노드 간 트래픽 암호화
```

## IAM 실행 역할: 최소 권한 원칙

SageMaker 학습 작업과 엔드포인트는 **실행 역할(Execution Role)** 권한으로 동작한다. 이 역할에 권한을 과하게 주면 침해 시 피해가 그대로 커진다. 필요한 S3 경로와 KMS 키에만 최소 권한을 준다.

| 구분 | 사용자 자격증명 | SageMaker 실행 역할 |
|---|---|---|
| 누가 쓰나 | 콘솔·CLI·SDK를 쓰는 사람 | 학습 컨테이너, 엔드포인트, 처리 작업 |
| 언제 평가되나 | `CreateTrainingJob` 호출 시점 | 작업이 **도는 동안** S3·KMS·ECR 접근 시 |
| 필요한 권한 | `sagemaker:CreateTrainingJob`, `iam:PassRole` | `s3:GetObject`, `kms:Decrypt`, `ecr:GetAuthorizationToken` 등 |
| 흔한 증상 | 작업 생성 자체가 실패 | 작업은 시작되는데 데이터 읽기에서 실패 |

사용자는 콘솔에서 버킷을 잘 읽는데 학습 작업만 `AccessDenied`면 거의 항상 실행 역할 문제다. 사용자가 역할을 서비스에 넘기려면 **`iam:PassRole`**도 따로 필요하다.

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

- 버킷 전체가 아니라 **prefix 단위**로 좁힌 것이 핵심이다.
- SSE-KMS 버킷은 S3 권한만으로 부족하다. **읽기에 `kms:Decrypt`, 쓰기에 `kms:GenerateDataKey`**가 함께 필요하다.

신뢰 정책(Trust Policy)은 "누가 이 역할을 맡을 수 있는가"를 따로 제한한다.

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

### AccessDenied 진단 흐름

```text
학습 작업이 S3에서 AccessDenied
        │
① 사용자가 아니라 "실행 역할" 권한을 보고 있나?
     └ 아니오 → 실행 역할 ARN부터 확인
        │
② 실행 역할 정책에 그 버킷/prefix가 있나?
     └ 아니오 → s3:GetObject 리소스 범위 수정
        │
③ 버킷 정책에 명시적 Deny가 있나?
     └ 있음 → Deny가 항상 우선. 버킷 정책 수정
        │
④ 객체가 SSE-KMS인가?
     └ 예 → kms:Decrypt / GenerateDataKey + 키 정책 확인
        │
⑤ VPC 안에서 도는 작업인가?
     ├ 예   → VPC 엔드포인트 정책 · 라우팅 · 보안 그룹 확인
     └ 아니오 → 조직 SCP · 권한 경계(Permissions Boundary) 확인
```

> 💡 **관련 이론**: 시험에서 "학습 작업이 S3에 접근하지 못한다(AccessDenied)"는 거의 항상 **실행 역할 권한 부족**이지 사용자 권한 문제가 아니다. 반대로 "역할이 모든 버킷에 접근 가능하다"는 최소 권한 위반이다. 권한의 주체가 실행 역할이라는 점을 기억하자.

> ⚠️ **함정**: IAM에서 명시적 `Deny`는 어떤 `Allow`보다 우선한다. 역할 정책·버킷 정책·SCP 중 한 곳이라도 Deny면 나머지를 다 열어도 통과하지 못한다.

## VPC 격리: 인터넷 없는 학습

기본적으로 SageMaker 작업은 AWS 관리형 네트워크에서 인터넷에 접근할 수 있다. 민감 데이터는 이를 막아야 한다. `VpcConfig`로 작업을 사용자 VPC의 프라이빗 서브넷에 배치하고, **VPC 엔드포인트**로 인터넷 없이 S3 등에 접근한다.

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

### 격리 옵션이 각각 막는 것

| 옵션 | 하는 일 | 막는 것 | 안 막는 것 |
|---|---|---|---|
| `subnets` | 작업을 지정 VPC 서브넷의 ENI에 붙인다 | 관리형 네트워크를 통한 임의 경로 | 서브넷에 인터넷 경로가 있으면 여전히 나감 |
| `security_group_ids` | 인스턴스 단위 인·아웃바운드 필터 | 허용하지 않은 포트·대상 | 이미 허용된 대상으로의 유출 |
| `enable_network_isolation` | 컨테이너의 **모든** 네트워크 호출 차단 | 컨테이너 코드가 밖으로 나가는 통신 전부 | 플랫폼이 대신 하는 입력 다운로드·아티팩트 업로드 |
| `encrypt_inter_container_traffic` | 분산 학습 노드 간 트래픽 암호화 | 노드 간 평문 전송 | 저장 데이터(별도 KMS 필요) |

신뢰할 수 없는 서드파티 코드·모델을 돌릴 때는 네트워크 격리를 켜는 것이 기본이다.

### VPC 엔드포인트 두 종류

| 항목 | Gateway 엔드포인트 | Interface 엔드포인트(PrivateLink) |
|---|---|---|
| 지원 서비스 | **S3, DynamoDB** 두 가지 | SageMaker API/Runtime, CloudWatch, ECR, STS 등 |
| 동작 방식 | 라우팅 테이블에 경로 추가 | 서브넷에 ENI(사설 IP) + 프라이빗 DNS |
| 요금 | 추가 요금 없음 | 시간당 + 데이터 처리 요금 |
| 접근 범위 | 같은 리전·같은 VPC 안 | 온프레미스(Direct Connect·VPN)에서도 가능 |
| 접근 제어 | 엔드포인트 정책 | 엔드포인트 정책 + 보안 그룹 |

> 💡 **개념**: 게이트웨이 엔드포인트는 "S3로 가는 길을 AWS 내부로 돌리는 라우팅 변경"이고, 인터페이스 엔드포인트는 "서비스의 사설 IP 창구를 내 서브넷 안에 만드는 것"이다.

```text
        [VPC]
 ┌────────────────────────────────────────────────────────────┐
 │  [Private Subnet A]                    [Private Subnet B]  │
 │   학습 컨테이너(ENI) ◀─ 분산 학습(SG 자기참조) ─▶ 학습 컨테이너   │
 │        │     │                                             │
 │        │     └─(Interface Endpoint)─▶ SageMaker API        │
 │        │                              CloudWatch Logs      │
 │        └─(Gateway Endpoint · 라우팅)─▶ S3 / DynamoDB        │
 │                                                            │
 │   ✗ 인터넷 게이트웨이 없음        ✗ NAT 게이트웨이 없음         │
 └────────────────────────────────────────────────────────────┘
```

- 분산 학습을 쓰면 보안 그룹에 **자기 자신을 참조하는 규칙**이 필요하다. 노드끼리 통신해야 하기 때문이다.
- 서브넷은 서로 다른 AZ에 2개 이상 두고 IP 여유를 확보한다. 여유가 없으면 인스턴스 배치가 실패한다.

> ⚠️ **함정**: `enable_network_isolation=True`면 컨테이너 **안의 코드**는 S3를 직접 호출하지 못한다. 그래도 학습이 도는 이유는 입력 채널 다운로드와 아티팩트 업로드를 **플랫폼이 컨테이너 밖에서** 대신 처리하기 때문이다. 학습 스크립트가 런타임에 pip 설치를 하거나 외부 URL·S3에서 데이터를 더 받아오면 그 시점에 실패한다.

> ⚠️ **함정**: 프라이빗 서브넷에 두기만 하고 S3 게이트웨이 엔드포인트를 안 만들면 학습이 데이터를 못 받아 멈춘다. "격리했더니 작업이 시작을 못 한다"는 대개 엔드포인트 누락이다.

## KMS 암호화: 저장 중·전송 중 보호

데이터와 모델은 저장 중(at rest)과 전송 중(in transit) 모두 암호화한다. KMS 고객 관리형 키(CMK)는 **누가 복호화할 수 있는지**를 통제한다.

```python
estimator = Estimator(
    ...,
    output_kms_key="arn:aws:kms:us-east-1:111122223333:key/abcd-efgh",   # 모델 아티팩트 암호화
    volume_kms_key="arn:aws:kms:us-east-1:111122223333:key/wxyz-1234",   # 학습 EBS 암호화
)
```

| 보호 지점 | 방법 | 비고 |
|---|---|---|
| S3의 학습 데이터·모델 | SSE-KMS(CMK)로 버킷/객체 암호화 | 읽기 `kms:Decrypt`, 쓰기 `kms:GenerateDataKey` |
| 학습 인스턴스 스토리지 | `volume_kms_key`로 EBS 암호화 | 로컬 NVMe 스토리지 타입은 해당 없음 |
| 모델 아티팩트 출력 | `output_kms_key` | `model.tar.gz`가 지정 CMK로 암호화 |
| 분산 학습 노드 간 트래픽 | `encrypt_inter_container_traffic=True` | 전송 중 암호화 |
| 엔드포인트 통신 | TLS(전송 중 암호화 기본) | 별도 설정 없이 적용 |
| 엔드포인트·처리 작업 볼륨 | 엔드포인트 구성·Processing의 `KmsKeyId` | 추론·전처리도 같은 원칙 |

### 이중 관문: 키 정책 + IAM 정책

```text
   복호화 요청 (kms:Decrypt)
            │
   ┌────────▼────────┐   AND   ┌──────────────────┐
   │  KMS 키 정책     │◀───────▶│  IAM 권한 정책    │
   │ "이 키를 누가?"   │         │ "이 주체가 뭘?"   │
   └────────┬────────┘         └──────────────────┘
            │
   둘 다 Allow → 복호화 성공
   하나라도 미허용 → 실패 (IAM만 열어도 소용없음)
```

- 대부분의 리소스는 IAM 정책만으로 접근되지만 **KMS는 키 정책이 기본 관문**이다. 키 정책이 IAM에 위임하지 않으면 관리자 권한이 있어도 복호화되지 않는다.

### 팀별 CMK 격리 패턴

| 자산 | 키 | 키 정책 허용 주체 | 효과 |
|---|---|---|---|
| A팀 데이터·모델 | `cmk-team-a` | A팀 실행 역할·데이터 과학자 | B팀은 IAM 권한이 있어도 복호화 불가 |
| B팀 데이터·모델 | `cmk-team-b` | B팀 실행 역할·데이터 과학자 | A팀 침해가 B팀으로 번지지 않음 |
| 공용 감사 로그 | `cmk-audit` | 보안팀만 | 운영자가 로그를 읽거나 지우지 못함 |

AWS 관리형 키를 공유하면 계정 안에서 사실상 격리가 되지 않는다. **격리 요건 = CMK + 키 정책 분리**로 기억한다.

> 💡 **관련 이론**: "암호화는 켜져 있는데, 누가 그 키를 쓸 수 있나?"가 진짜 통제 지점이다. KMS **키 정책**과 IAM은 함께 동작하며, 키 정책이 거부하면 IAM 권한이 있어도 복호화에 실패한다. 팀·프로젝트별로 CMK를 나눠 데이터를 격리하는 패턴이 시험에 자주 나온다.

## 데이터·모델 보호 보조 서비스

| 서비스 | 역할 | 대표 지문 |
|---|---|---|
| **Amazon Macie** | S3의 PII·민감정보를 ML로 자동 탐지·분류 | "데이터셋에 신용카드 번호가 섞였는지 찾아라" |
| **SageMaker Clarify** | 데이터·모델 편향 탐지, 예측 설명 | "책임 있는 AI·공정성 근거를 제시하라" |
| **AWS PrivateLink** | 인터넷 없이 SageMaker를 사설 호출 | "온프레미스에서 인터넷 경유 없이 호출" |
| **Secrets Manager** | 외부 DB·API 자격증명을 코드 밖에서 관리·교체 | "노트북 코드에 DB 비밀번호가 하드코딩" |
| **CloudTrail** | 모든 API 호출 감사 기록 | "누가 언제 엔드포인트를 지웠나"(다음 글) |
| **권한 경계 / SCP** | 역할이 넘을 수 없는 권한 상한 | "팀이 스스로 권한을 넓히지 못하게" |

## SageMaker Studio·노트북 보안 옵션

| 대상 | 옵션 | 효과 |
|---|---|---|
| Studio 도메인 | 네트워크 접근 모드를 **VPC 전용**으로 | Studio 트래픽이 사용자 VPC로만 흐름 |
| Studio 도메인 | 사용자 프로필별 실행 역할 분리 | 사용자별 데이터 접근 범위 분리 |
| 노트북 인스턴스 | 직접 인터넷 접근 비활성화 | 엔드포인트/NAT 경로만 사용 |
| 노트북 인스턴스 | 루트 접근 비활성화 + 수명 주기 구성 | 표준 보안 설정을 기동 시 강제 |

**보안 점검 체크리스트**

- [ ] 실행 역할이 버킷 전체가 아니라 prefix 단위로 제한돼 있는가
- [ ] SSE-KMS 버킷이면 `kms:Decrypt` / `kms:GenerateDataKey`가 함께 있는가
- [ ] 프라이빗 서브넷에 S3 게이트웨이 엔드포인트가 있는가
- [ ] 분산 학습이면 보안 그룹에 자기참조 규칙이 있는가
- [ ] 노트북·Studio가 인터넷에 직접 노출돼 있지 않은가

## 지문 단서 → 정답 매핑

| 지문 단서 | 고를 답 | 이유 |
|---|---|---|
| "학습 작업만 AccessDenied, 사용자는 잘 읽는다" | 실행 역할에 S3 권한 추가 | 작업은 실행 역할 권한으로 동작 |
| "학습이 인터넷에 절대 나가면 안 된다" | 프라이빗 서브넷 + VPC 엔드포인트 + 네트워크 격리 | 셋이 함께여야 인터넷 경로가 사라짐 |
| "S3·DynamoDB만 사설 접근하면 된다" | Gateway 엔드포인트 | 두 서비스 전용, 추가 요금 없음 |
| "온프레미스에서 SageMaker API 사설 호출" | Interface 엔드포인트(PrivateLink) | ENI 기반이라 DX/VPN에서 접근 가능 |
| "분산 학습 노드 간 데이터가 평문으로 흐른다" | `encrypt_inter_container_traffic=True` | 전송 중 암호화 옵션 |
| "모델 아티팩트를 특정 키로 암호화" | `output_kms_key` | 출력 아티팩트 전용 파라미터 |
| "학습 인스턴스 디스크를 암호화" | `volume_kms_key` | 부착 EBS 볼륨 암호화 |
| "팀끼리 서로 복호화하지 못하게" | 팀별 CMK + 키 정책 분리 | IAM만으로는 키 사용을 못 막음 |
| "IAM 권한을 줬는데도 복호화 실패" | KMS 키 정책 확인 | 키 정책과 IAM이 둘 다 허용해야 함 |
| "데이터셋에 PII가 섞였는지 자동 탐지" | Amazon Macie | S3 민감정보 탐지·분류 전용 |
| "신뢰할 수 없는 서드파티 모델을 실행" | `enable_network_isolation=True` | 컨테이너의 외부 통신 전면 차단 |

다음 글에서는 운영의 나머지 절반 — 비용 최적화, CloudWatch/CloudTrail 로깅·감사, 재해 복구를 다룬다.

## 📖 용어

- **실행 역할(Execution Role)** : 학습 작업·엔드포인트가 "자기 대신" 사용하는 IAM 역할. 사람 자격증명과 별개다.
- **신뢰 정책(Trust Policy)** : "누가 이 역할을 맡을 수 있는가"를 정하는 역할 쪽 정책. 권한 정책과 짝을 이룬다.
- **iam:PassRole** : 사용자가 서비스에 역할을 넘겨줄 수 있게 하는 권한. 없으면 작업 생성 자체가 막힌다.
- **네트워크 격리(Network Isolation)** : 컨테이너가 밖으로 어떤 네트워크 호출도 못 하게 막는 설정. 입출력은 플랫폼이 대신 옮긴다.
- **VPC 엔드포인트** : 인터넷을 거치지 않고 AWS 서비스에 닿는 사설 통로. S3·DynamoDB용 게이트웨이형과 ENI 기반 인터페이스형이 있다.
- **고객 관리형 키(CMK)** : 사용자가 직접 만들고 키 정책까지 통제하는 KMS 키. 팀별 격리의 핵심 도구다.
- **키 정책(Key Policy)** : KMS 키에 붙는 리소스 정책. IAM 권한과 별개로, 여기서 막히면 복호화되지 않는다.
- **SSE-KMS** : S3가 KMS 키로 객체를 서버 측 암호화하는 방식. 읽고 쓰려면 KMS 권한이 함께 필요하다.
- **전송 중 암호화(in transit)** : 네트워크를 흐르는 동안의 암호화. 엔드포인트는 TLS, 분산 학습 노드 간은 별도 옵션으로 켠다.

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
