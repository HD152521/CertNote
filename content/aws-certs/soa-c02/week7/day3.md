# Day 3 - EC2 Image Builder, AMI 수명주기, Golden Image 운영

📅 날짜: Week 7 (Day 3)
🎯 주제: 자동화된 AMI 빌드·검증·배포 파이프라인
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- EC2 Image Builder의 컴포넌트(Recipe/Component/Pipeline)를 이해한다
- Golden AMI 운영 패턴과 보안 baseline 적용 방식을 안다
- AMI Lifecycle Manager로 오래된 AMI를 자동 정리한다

---

## 🧩 사전 지식 (CS 기초)

- **Immutable infrastructure**: 인스턴스는 변경하지 않고 새로 만들어 교체
- **Golden image**: 사내 표준이 적용된 베이스 이미지
- **AMI = Amazon Machine Image**: EC2 부팅용 템플릿 (OS + 앱)
- **Pipeline orchestration**: 빌드 → 테스트 → 배포 자동화
- **Image hardening**: CIS Benchmark 등 보안 강화 적용

---

## 📖 이론 내용

### 1. EC2 Image Builder

#### 왜 필요한가
- 회사 표준 AMI를 매월 새로 만들어야 함 (보안 패치, 에이전트 업데이트)
- 수동으로 만들면 일관성 X, 시간 ↑
- Image Builder는 코드로 정의된 자동 빌드 파이프라인

#### 핵심 구성 요소

| 요소 | 의미 |
|------|------|
| **Component** | 빌드/테스트 단계의 작은 단위 (YAML) |
| **Recipe** | Components 묶음 + 부모 이미지 |
| **Infrastructure Configuration** | 빌드 시 사용할 인스턴스 타입 등 |
| **Distribution Configuration** | 배포할 리전·계정·라이선스 |
| **Pipeline** | Recipe + Infra + Distribution + Schedule |
| **Image** | 빌드된 결과물 (AMI 또는 Container) |

#### Component YAML 예시
```yaml
name: InstallCustomAgent
description: Install company monitoring agent
schemaVersion: 1.0
phases:
  - name: build
    steps:
      - name: DownloadAgent
        action: S3Download
        inputs:
          - source: s3://company-internal/agent/latest.rpm
            destination: /tmp/agent.rpm
      - name: InstallAgent
        action: ExecuteBash
        inputs:
          commands:
            - sudo rpm -ivh /tmp/agent.rpm
            - sudo systemctl enable agent && sudo systemctl start agent
  - name: validate
    steps:
      - name: VerifyAgentRunning
        action: ExecuteBash
        inputs:
          commands:
            - systemctl is-active agent
  - name: test
    steps:
      - name: TestAgentConnectivity
        action: ExecuteBash
        inputs:
          commands:
            - curl -f http://localhost:9090/health
```

#### Pipeline 동작
```
1. Source (Parent AMI 선택)
2. Build (Component 순차 실행)
3. Test (validate phase 실행)
4. Distribute (배포 리전·계정에 복제)
5. (선택) AMI를 Account Sharing or Public
```

### 2. Golden AMI 패턴

#### 구성 요소
- **OS Base**: Amazon Linux 2, RHEL, Ubuntu
- **보안 강화**: CIS Benchmark, SCAP 검증
- **에이전트**: SSM Agent, CloudWatch Agent, AV
- **앱 의존성**: JDK, Node.js, Python 런타임
- **표준 사용자/그룹**
- **로그 디렉토리 + 권한**

#### 운영 흐름
```
[매월 1일]
   ↓
Image Builder Pipeline 자동 실행
   ↓
1. 최신 Amazon Linux 2 AMI fetch
2. 보안 패치 적용
3. 사내 에이전트 설치
4. 테스트
   ↓
새 AMI ID를 SSM Parameter Store에 저장
   ↓
CloudFormation/Launch Template이 SSM 참조
   ↓
신규 EC2는 자동으로 새 AMI 사용
```

### 3. AMI Lifecycle - 정리·공유

#### 시간 따라 누적되는 AMI 문제
- 오래된 AMI = 보안 위험 + 비용 (EBS Snapshot)
- 수동 정리 = 휴먼 에러

#### AMI 보존 정책 (Image Builder 내장)
- Pipeline 설정에 `imagesToKeep`로 최근 N개만 유지
- 그 이상은 자동 삭제

#### AMI 공유 패턴
- 다른 계정에 AMI 공유 → 멀티 계정 표준 AMI
- KMS 암호화 시 키도 공유 필요
- 또는 RAM (Resource Access Manager)로 공유

### 4. AWS Backup vs Data Lifecycle Manager (DLM)

#### DLM (EBS Snapshot/AMI 전용)
- EBS 스냅샷, AMI 자동 백업·정리
- 태그 기반 스케줄

```bash
aws dlm create-lifecycle-policy \
  --description "Daily AMI backup" \
  --state ENABLED \
  --execution-role-arn arn:aws:iam::123:role/AWSDataLifecycleManagerDefaultRole \
  --policy-details '{
    "PolicyType":"IMAGE_MANAGEMENT",
    "ResourceTypes":["INSTANCE"],
    "TargetTags":[{"Key":"Backup","Value":"daily"}],
    "Schedules":[
      {
        "Name":"Daily AMI",
        "CreateRule":{"CronExpression":"cron(0 3 ? * * *)"},
        "RetainRule":{"Count":7},
        "TagsToAdd":[{"Key":"Type","Value":"DailyAMI"}]
      }
    ]
  }'
```

#### AWS Backup (Week 10에서 자세히)
- DLM보다 광범위 (RDS, DynamoDB, EFS, FSx, S3, ...)
- 컴플라이언스 보고

### 5. Launch Template + Auto Scaling 통합

#### Launch Template
- EC2 인스턴스 생성 옵션 묶음
- AMI ID, 인스턴스 타입, SG, KeyPair, User Data, IAM Role 등
- 버전 관리 (1, 2, 3, ...)

#### Golden AMI 운영 연계
```yaml
# Launch Template에서 SSM Parameter로 AMI 동적 참조
LaunchTemplateData:
  ImageId: '{{resolve:ssm:/golden-ami/amazon-linux-2/latest}}'
  InstanceType: t3.medium
  IamInstanceProfile:
    Name: WebInstanceProfile
```

→ Image Builder가 새 AMI 만들면 SSM Parameter 자동 업데이트 → 다음 Auto Scaling 발동 시 새 AMI 사용.

### 6. Container Image도 Image Builder

- Image Builder가 ECR 이미지도 빌드 가능
- Dockerfile + Component로 정의
- 단, 일반적으로 ECR + CodeBuild가 더 흔함

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **AWS Marketplace AMI** | 외부 벤더 AMI (라이선스 포함) | License Manager 통합 |
| **SCAP Component** | 보안 표준 자동 적용·검증 | 컴플라이언스 |
| **Inspector 통합** | 빌드 시 자동 취약점 스캔 | 보안 강화 |
| **AMI Block Public Access** | 실수 공개 차단 | 계정 단위 설정 |
| **Cross-Region AMI Copy** | 자동 복제 + KMS 키 매핑 | DR |

> ⚠️ **함정 1**: Image Builder 파이프라인은 schedule 가능하지만 cron 단위가 hourly~weekly 권장. 너무 자주는 불필요.
>
> ⚠️ **함정 2**: AMI 공유는 데이터 복사 X. 같은 EBS Snapshot을 참조 — Source 삭제 시 다른 계정에서도 사용 불가.
>
> 💡 **암기 팁**: Recipe(설계도) + Component(부품) + Pipeline(공장) + Image(완제품).

### 관련 서비스 Cross-Reference

- **Image Builder → Week 5 Patch Manager** (패치 AMI 자동화)
- **Image Builder → Week 9 Inspector** (보안 스캔 통합)
- **DLM → Week 10** (AWS Backup과 비교)
- **Launch Template → Week 7 Day 4** (OpsWorks 대신)

---

## 🏗️ 아키텍처 다이어그램

```
Golden AMI 자동화 파이프라인
==========================================================

   [Image Builder Pipeline]  (매월 cron)
            │
            ├─ Source: Amazon Linux 2 latest AMI
            ├─ Components:
            │   1. UpdatePatches
            │   2. InstallCloudWatchAgent
            │   3. InstallSSMAgent
            │   4. InstallAVAgent
            │   5. ApplyCIS-Benchmark
            ├─ Build: t3.medium 임시 인스턴스
            ├─ Test: SCAP 검증, 헬스체크
            └─ Distribute:
                ap-northeast-2 (Source)
                us-east-1 (DR)
                  │
                  ▼
   [신규 AMI 생성]
            │
            ▼
   [SSM Parameter Store]
   /golden-ami/amazon-linux-2/latest = ami-XXXX
            │
            ▼
   [Launch Template] → '{{resolve:ssm:...}}'
            │
            ▼
   [Auto Scaling Group] 신규 인스턴스
            ↓
   자동으로 최신 골든 AMI 사용
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Image Builder = Recipe + Component + Infra + Distribution + Pipeline**
2. ⭐ **Golden AMI를 SSM Parameter로 참조** → Launch Template이 동적 사용
3. ⭐ **DLM = EBS/AMI 전용 자동 백업·정리** (태그 기반)
4. ⭐ **AMI 공유는 EBS Snapshot 참조** — KMS 암호화 시 키도 같이 공유
5. ⭐ **Image Builder Test phase에서 자동 검증** — 실패 시 배포 안 됨

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Component 생성 (사내 모니터링 에이전트 설치)
aws imagebuilder create-component \
  --name install-cw-agent \
  --semantic-version 1.0.0 \
  --platform Linux \
  --data file://component.yaml

# 2. Recipe 생성
aws imagebuilder create-image-recipe \
  --name golden-amazon-linux-2 \
  --semantic-version 1.0.0 \
  --parent-image arn:aws:imagebuilder:ap-northeast-2:aws:image/amazon-linux-2-x86/x.x.x \
  --components componentArn=arn:aws:imagebuilder:ap-northeast-2:123:component/install-cw-agent/1.0.0

# 3. Infrastructure Configuration
aws imagebuilder create-infrastructure-configuration \
  --name builder-infra \
  --instance-types t3.medium \
  --instance-profile-name EC2InstanceProfileForImageBuilder \
  --terminate-instance-on-failure

# 4. Distribution Configuration
aws imagebuilder create-distribution-configuration \
  --name distribute-prod \
  --distributions 'region=ap-northeast-2,amiDistributionConfiguration={name="golden-{{ imagebuilder:buildDate }}",targetAccountIds=[111122223333]}'

# 5. Pipeline 생성 (매월 첫째 화요일 새벽)
aws imagebuilder create-image-pipeline \
  --name monthly-golden-ami \
  --image-recipe-arn arn:aws:imagebuilder:ap-northeast-2:123:image-recipe/golden-amazon-linux-2/1.0.0 \
  --infrastructure-configuration-arn arn:aws:imagebuilder:ap-northeast-2:123:infrastructure-configuration/builder-infra \
  --distribution-configuration-arn arn:aws:imagebuilder:ap-northeast-2:123:distribution-configuration/distribute-prod \
  --schedule 'scheduleExpression="cron(0 3 ? * 1#1 *)",timezone=Asia/Seoul,pipelineExecutionStartCondition=EXPRESSION_MATCH_AND_DEPENDENCY_UPDATES_AVAILABLE'

# 6. 수동 실행
aws imagebuilder start-image-pipeline-execution \
  --image-pipeline-arn arn:aws:imagebuilder:ap-northeast-2:123:image-pipeline/monthly-golden-ami

# 7. 새 AMI를 SSM Parameter에 저장 (EventBridge + Lambda 자동화)
NEW_AMI=$(aws imagebuilder list-images --filters name=name,values=golden-amazon-linux-2 --query 'imageVersionList[0].arn' --output text)
aws ssm put-parameter \
  --name "/golden-ami/amazon-linux-2/latest" \
  --type String \
  --value "$NEW_AMI" \
  --overwrite

# 8. DLM 정책 (매일 AMI 백업, 7개 보관)
aws dlm create-lifecycle-policy \
  --description "Daily AMI 7-day retention" \
  --state ENABLED \
  --execution-role-arn arn:aws:iam::123:role/AWSDataLifecycleManagerDefaultRole \
  --policy-details '{
    "PolicyType":"IMAGE_MANAGEMENT",
    "ResourceTypes":["INSTANCE"],
    "TargetTags":[{"Key":"Backup","Value":"daily"}],
    "Schedules":[{
      "Name":"Daily AMI",
      "CreateRule":{"CronExpression":"cron(0 4 ? * * *)"},
      "RetainRule":{"Count":7}
    }]
  }'
```

---

## 📝 연습 문제

**문제 1.** 회사가 매월 새 Golden AMI를 만들고 신규 EC2가 자동으로 사용하길 원한다. 어떤 패턴?

A) 수동 AMI 생성 후 콘솔 업데이트
B) Image Builder Pipeline cron 실행 → 새 AMI를 SSM Parameter에 저장 → Launch Template이 `{{resolve:ssm:...}}`로 참조
C) Lambda 주기 실행
D) Beanstalk Custom Platform

**정답: B**
해설: 표준 운영 패턴. Image Builder + SSM Parameter + Launch Template 조합. Launch Template이 항상 최신 AMI 참조 → Auto Scaling 발동 시 새 AMI 사용.

---

**문제 2.** Image Builder가 만든 AMI가 보안 표준 미달이면 배포되지 않게 하려면?

A) 수동 검증
B) Recipe의 Component에 `test` phase 추가 + SCAP 검증
C) GuardDuty
D) Inspector

**정답: B**
해설: Image Builder Component는 build/validate/test 3단계. Test phase에서 SCAP/CIS Benchmark 검증 실패 시 파이프라인 중단 → 잘못된 AMI 배포 안 됨.

---

**문제 3.** 회사가 EBS Snapshot이 1년치 누적돼 비용 폭증했다. 어떻게 자동 정리?

A) 수동 삭제
B) DLM (Data Lifecycle Manager) - 태그 기반 자동 백업 + retention
C) S3 라이프사이클
D) Backup만

**정답: B**
해설: DLM이 EBS Snapshot/AMI 전용 자동 정리. 태그 기반 스케줄(생성)과 retention(보관 개수/기간). AWS Backup도 가능하지만 DLM이 가벼움.

---

**문제 4.** 다른 AWS 계정에 KMS로 암호화된 AMI를 공유하려 한다. 추가로 해야 할 일은?

A) 그냥 share-image
B) KMS Key Policy에 대상 계정 추가 + Snapshot/AMI 공유 + 대상 계정의 IAM 권한
C) IAM Role 추가
D) S3 권한

**정답: B**
해설: 암호화된 AMI는 EBS Snapshot의 KMS 키도 공유해야 동작. Key Policy에 다른 계정 ARN 추가, 그 계정도 Decrypt 권한 필요.

---

**문제 5.** Image Builder Pipeline의 빌드 인스턴스가 어디서 실행되나?

A) AWS 관리 환경
B) Infrastructure Configuration에 지정한 사용자 계정의 임시 EC2 인스턴스
C) Lambda
D) Fargate

**정답: B**
해설: Image Builder는 사용자 계정에 임시 빌드 인스턴스 생성. 빌드 후 자동 종료. 인스턴스 타입·서브넷·SG·IAM 모두 Infrastructure Configuration에 지정.

---

## 📌 오늘의 요약

1. Image Builder: Recipe + Component + Infra + Distribution + Pipeline. 자동 AMI 빌드
2. Golden AMI 패턴: 패치 + 사내 에이전트 + 보안 강화. SSM Parameter로 참조
3. Launch Template + `{{resolve:ssm:...}}`로 최신 AMI 자동 사용
4. DLM = EBS Snapshot/AMI 자동 백업·정리. 태그 기반 스케줄
5. 암호화 AMI 공유는 KMS Key Policy도 함께 — Snapshot 키 접근 권한 필요
