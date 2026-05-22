# Day 2 - ECS 자동 배포 - Task Definition 자동화

📅 날짜: Week 6 (Day 2)
🎯 주제: ECS 운영 자동화 — Task Definition, Service Auto Scaling, Capacity Provider
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Task Definition revision 자동 갱신 패턴
- ECS Service Auto Scaling (Target Tracking, Step, Scheduled)
- Capacity Provider Strategy (FARGATE, FARGATE_SPOT, EC2)
- ECS Exec, Container Insights 운영

---

## 🧩 사전 지식 (CS 기초)

- **Container vs Task**: 컨테이너 1개 이상이 모여 Task. Task가 ECS의 스케줄링 단위.
- **Pod vs Task**: K8s Pod이 ECS Task에 해당.
- **Target Tracking Auto Scaling**: 지표를 target에 맞춤 (CPU 70%, 요청수 etc).
- **Spot Capacity**: 중단 가능한 저렴한 컴퓨트. 70%까지 할인.

---

## 📖 이론 내용

### 1. Task Definition 자동 갱신 흐름

CodePipeline 표준 패턴:

```
CodeBuild
  ├── docker build & push to ECR
  ├── echo "[{\"name\":\"web\",\"imageUri\":\"$IMAGE_URI\"}]" > imagedefinitions.json
  └── output artifact: imagedefinitions.json

CodePipeline Deploy Action (Amazon ECS, NOT Blue/Green)
  ├── Input: imagedefinitions.json
  └── ECS Service의 Task Definition image 자동 치환 + 새 revision 등록 + Service Update

또는 ECS (Blue/Green) Action:
  ├── Input: taskdef.json + appspec.yaml + imagedefinitions.json
  └── <IMAGE1_NAME> 플레이스홀더 치환
```

**imagedefinitions.json 형식 (Rolling):**
```json
[
  {"name": "web", "imageUri": "111.dkr.ecr.ap-northeast-2.amazonaws.com/myapp:abc123"}
]
```

**imageDetail.json (Blue/Green):**
```json
{"ImageURI": "111.dkr.ecr.ap-northeast-2.amazonaws.com/myapp:abc123"}
```

### 2. ECS Service Auto Scaling

Application Auto Scaling이 ECS Service의 desiredCount 조정.

**Target Tracking:**
```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/prod/myapp \
  --min-capacity 2 --max-capacity 50

aws application-autoscaling put-scaling-policy \
  --policy-name cpu-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/prod/myapp \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {"PredefinedMetricType": "ECSServiceAverageCPUUtilization"}
  }'
```

지원 사전 정의 지표:
- `ECSServiceAverageCPUUtilization`
- `ECSServiceAverageMemoryUtilization`
- `ALBRequestCountPerTarget`

또는 사용자 정의 지표(CloudWatch Metric).

**Step Scaling**: 임계값 구간별 다른 조정량
**Scheduled**: cron으로 시간대별 조정 (점심 12시 +50%)

### 3. Capacity Provider Strategy

```json
{
  "capacityProviderStrategy": [
    {"capacityProvider": "FARGATE", "weight": 1, "base": 2},
    {"capacityProvider": "FARGATE_SPOT", "weight": 4}
  ]
}
```

- `base`: 첫 N Task는 이 provider에 보장
- `weight`: 추가 Task 분배 비율
- 위 예: 처음 2 Task는 On-Demand FARGATE 고정, 이후 1:4 비율 — Spot 80%

EC2 capacity provider는 ASG와 통합 (managed scaling).

### 4. ECS Exec — Container Shell

```bash
aws ecs execute-command \
  --cluster prod \
  --task <task-id> \
  --container web \
  --interactive \
  --command "/bin/sh"
```

**활성화 조건:**
- Task Definition에 `"enableExecuteCommand": true`
- Task Role에 `ssmmessages:CreateControlChannel/CreateDataChannel/OpenControlChannel/OpenDataChannel`
- Service Update Required (이미 실행 중인 Task는 새 Task부터 활성)

### 5. Container Insights

ECS Cluster/Service/Task별 메트릭:
- 활성화: `aws ecs update-cluster-settings --cluster prod --settings name=containerInsights,value=enabled`
- 자동 수집: CPU/Memory/Network/Storage 분포
- CloudWatch Dashboards 자동 생성
- 추가 비용 발생

### 6. ECS Anywhere

온프레미스 EC2에 ECS Agent 설치 → AWS에서 통합 관리:
- 활성화 코드 생성 → 온프레미스 머신에 설치
- AWS Fargate는 불가, EC2/External만
- Hybrid CI/CD 시나리오에 자주 등장

### 7. ECS Service Connect (vs App Mesh)

서비스 간 통신을 Cloud Map + Envoy로 추상화:
- App Mesh보다 단순
- Service-to-Service 트래픽 모니터링
- 로드 밸런서 없이 직접 통신 가능

---

## 🧠 알아두면 좋은 심화 이론

### Task Definition Revision 자동 갱신 vs 명시 ARN

- CodePipeline ECS Action: ECS Service의 task-definition 필드를 자동 갱신
- 외부 CI(GitHub Actions): `aws ecs register-task-definition` → `aws ecs update-service --task-definition <new-arn>`
- `:latest` 같은 tag로 두면 cache 발생 → 항상 새 revision 등록 권장

### Force New Deployment

이미지 태그가 변하지 않았는데 새 이미지 pull하려면:
```bash
aws ecs update-service --cluster prod --service myapp --force-new-deployment
```

`:latest` tag로 같은 이미지의 새 버전 사용 시.

### 작업 종료 시 PreStop Hook

Container Definition의 `stopTimeout` + `SIGTERM` 처리:
- ECS가 SIGTERM 보냄 → stopTimeout 후 SIGKILL
- Graceful shutdown 시간 확보

### Service Discovery (Cloud Map)

```bash
aws ecs create-service \
  --service-registries "registryArn=arn:aws:servicediscovery:..."
```

DNS 이름으로 Task IP 자동 해석. ALB 없이 직접 통신 가능.

### Fargate Spot 중단 처리

- Spot 중단 2분 전 SIGTERM
- ECS Agent가 Task를 graceful 종료
- Stateless 워크로드에만 적합
- Aurora/RDS connection pool 등은 reconnect 로직 필수

### 관련 서비스 Cross-Reference

- **CodePipeline ECS Action** → Week 5 Day 1
- **CodeDeploy ECS Blue/Green** → Week 4 Day 4
- **EKS** → Week 6 Day 3
- **App Mesh** → Week 11 Day 4

---

## 🏗️ 아키텍처 다이어그램

```
ECS Auto Deployment + Auto Scaling
==================================================

  CodePipeline
   ├── Source ─► CodeBuild ─► ECR push
   ├──            └─ imagedefinitions.json
   ├──                       │
   ├──                       ▼
   └── Deploy (ECS Action) ─► ECS Service updates Task Definition
                              │
                              ▼
                        New Task Set (Rolling or Blue/Green)
                              │
                              ▼
                      Capacity Provider Strategy:
                        FARGATE base=2 weight=1
                        FARGATE_SPOT weight=4
                              │
                              ▼
                      Application Auto Scaling:
                        Target CPU 70%
                        Min 2 / Max 50
                              │
                              ▼
                      Cloud Map / Service Connect (optional)
                              │
                              ▼
                      Container Insights → CloudWatch
                              │
                              ▼
                      ECS Exec for debugging (SSM session)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Rolling 배포는 imagedefinitions.json, Blue/Green은 taskdef.json + `<IMAGE1_NAME>`
2. ⭐ Service Auto Scaling은 Application Auto Scaling 서비스 사용
3. ⭐ Capacity Provider Strategy의 base + weight 의미
4. ⭐ ECS Exec는 Task Role + Task Definition + Service Update 모두 필요
5. ⭐ Container Insights 활성화는 클러스터 수준 설정

---

## 💻 실제 예시 - CodePipeline + ECS Rolling Update

```yaml
# buildspec.yml (마지막 단계에서 imagedefinitions.json 출력)
version: 0.2
phases:
  pre_build:
    commands:
      - export IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
  build:
    commands:
      - docker build -t $ECR_URI:$IMAGE_TAG .
  post_build:
    commands:
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
      - docker push $ECR_URI:$IMAGE_TAG
      - printf '[{"name":"web","imageUri":"%s"}]' "$ECR_URI:$IMAGE_TAG" > imagedefinitions.json

artifacts:
  files:
    - imagedefinitions.json
```

```bash
# CodePipeline Deploy Action 설정 (CLI 발췌)
aws codepipeline update-pipeline --cli-input-json '{
  "pipeline": {
    "stages": [
      ...,
      {
        "name": "Deploy",
        "actions": [{
          "name": "DeployECS",
          "actionTypeId": {
            "category": "Deploy", "owner": "AWS",
            "provider": "ECS", "version": "1"
          },
          "configuration": {
            "ClusterName": "prod",
            "ServiceName": "myapp",
            "FileName": "imagedefinitions.json"
          },
          "inputArtifacts": [{"name": "BuildArtifact"}]
        }]
      }
    ]
  }
}'
```

---

## 📝 연습 문제

**문제 1.** ECS Rolling 배포에 CodePipeline ECS Action을 사용한다. CodeBuild가 출력해야 하는 파일은?

A) appspec.yaml
B) imagedefinitions.json
C) buildspec.yml
D) taskdef.json

**정답: B**
해설: Rolling용 imagedefinitions.json. Blue/Green은 taskdef + appspec + imageDetail.

---

**문제 2.** ECS Service에 자동 스케일링을 설정하려면?

A) ECS Auto Scaling 옵션
B) Application Auto Scaling 서비스 사용 (RegisterScalableTarget + PutScalingPolicy)
C) EC2 Auto Scaling
D) Lambda 호출

**정답: B**
해설: Application Auto Scaling이 ECS 외 여러 서비스에 통합.

---

**문제 3.** Capacity Provider Strategy `FARGATE base=2 weight=1, FARGATE_SPOT weight=4`의 의미는?

A) On-Demand 80%, Spot 20%
B) 처음 2 Task On-Demand 고정 + 이후 1:4 비율 (On-Demand 1, Spot 4) → Spot 80%
C) 모두 Spot
D) 모두 On-Demand

**정답: B**
해설: base + weight의 정확한 해석.

---

**문제 4.** ECS Exec로 컨테이너에 접속하려면 필수가 아닌 것은?

A) Task Definition에 enableExecuteCommand
B) Task Role에 SSM messages 권한
C) Service Update 후 새 Task
D) EC2 Bastion

**정답: D**
해설: SSM 통합으로 Bastion 불필요. 가장 자주 출제.

---

**문제 5.** 동일 이미지 tag로 새 이미지를 강제 pull하려면?

A) 새 Task Definition revision 필요
B) `aws ecs update-service --force-new-deployment`
C) IAM 권한 변경
D) Cluster 재시작

**정답: B**
해설: force-new-deployment가 표준.

---

**문제 6.** ECS Service의 Spot 워크로드 사용 시 주의점은?

A) 비용 증가
B) 2분 전 SIGTERM 도착 — Graceful shutdown 로직 필수
C) 자동 종료 불가
D) Multi-AZ 불가

**정답: B**
해설: Spot 중단 처리가 핵심.

---

**문제 7.** Container Insights를 활성화하는 위치는?

A) Task Definition
B) ECS Cluster Settings
C) Service 설정
D) IAM Role

**정답: B**
해설: 클러스터 수준 설정.

---

## 📌 오늘의 요약

1. Rolling 배포는 imagedefinitions.json, Blue/Green은 taskdef + appspec + imageDetail
2. Application Auto Scaling으로 ECS Service desiredCount 자동 조정
3. Capacity Provider Strategy의 base + weight로 Spot/On-Demand 비율
4. ECS Exec는 Task Definition + Task Role + Service Update 3종 필요
5. Container Insights는 Cluster 수준 설정
