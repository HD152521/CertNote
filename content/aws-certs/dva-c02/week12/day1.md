# Day 56 - ECS, Fargate, ECR

📅 날짜: 2026년 8월 2일 (일요일)  
🎯 주제: Amazon ECS & Fargate  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- ECS의 기본 구성 요소를 이해한다
- EC2 시작 유형과 Fargate의 차이를 구분한다
- ECR로 컨테이너 이미지를 관리한다

---

## 📖 이론 내용

### 1. Amazon ECS란?

Docker 컨테이너를 실행하고 관리하는 완전 관리형 컨테이너 오케스트레이션 서비스입니다.

**ECS 구성 요소:**
- **클러스터 (Cluster)**: ECS 리소스의 논리적 그룹
- **태스크 정의 (Task Definition)**: 컨테이너 실행 방법 정의 (CPU, 메모리, 이미지, 포트)
- **태스크 (Task)**: 태스크 정의의 인스턴스
- **서비스 (Service)**: 태스크 개수 유지, 로드밸런서 연결

### 2. EC2 시작 유형 vs Fargate

| 특성 | EC2 시작 유형 | Fargate |
|------|--------------|---------|
| 서버 관리 | EC2 직접 관리 | 서버리스 |
| 가격 | EC2 인스턴스 비용 | 사용한 CPU/메모리만 |
| 제어 수준 | 높음 | 낮음 |
| 시작 시간 | 느림 | 빠름 |
| 용도 | 비용 최적화, 특수 하드웨어 | 간편한 서버리스 컨테이너 |

### 3. ECS 태스크 정의

```json
{
  "family": "my-app",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::...:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::...:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "my-app",
      "image": "123456789.dkr.ecr.ap-northeast-2.amazonaws.com/my-app:latest",
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "DB_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:...:secret:prod/myapp/db"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/my-app",
          "awslogs-region": "ap-northeast-2",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### 4. Amazon ECR (Elastic Container Registry)

Docker 이미지를 저장하고 관리하는 완전 관리형 레지스트리입니다.

```bash
# ECR에 로그인
aws ecr get-login-password --region ap-northeast-2 | \
    docker login --username AWS --password-stdin \
    123456789.dkr.ecr.ap-northeast-2.amazonaws.com

# 이미지 빌드 및 태그
docker build -t my-app .
docker tag my-app:latest 123456789.dkr.ecr.ap-northeast-2.amazonaws.com/my-app:latest

# ECR에 푸시
docker push 123456789.dkr.ecr.ap-northeast-2.amazonaws.com/my-app:latest
```

**ECR 특징:**
- 이미지 취약점 스캔
- 이미지 수명 주기 정책
- 교차 리전/계정 복제
- OCI 아티팩트 지원

### 4-1. 심화 이론 - ECS/Fargate/ECR

#### Task Placement Strategies (EC2 시작 유형, 시험 가끔)

| 전략 | 동작 |
|------|------|
| **binpack** | CPU·메모리 사용량 최대화 (적은 인스턴스에 몰빵) |
| **random** | 무작위 |
| **spread** | 인스턴스/AZ/host 균등 분산 (HA) |

#### Capacity Provider Strategy

- 여러 시작 유형 혼합 (EC2 + Fargate + Spot)
- Auto Scaling Group과 연계
- 시험 시나리오: "비용 절감 + 안정성" → Fargate + Fargate Spot 조합

#### Fargate Spot

- 정규 Fargate보다 **최대 70% 저렴**
- 2분 전 알림 후 회수
- 비-필수 작업 (배치, ML 학습)

#### Network Mode (EC2 시작 유형 시 선택)

| 모드 | 설명 |
|------|------|
| **bridge** | Docker 기본, 호스트 NAT |
| **host** | 호스트 네트워크 직접 사용 |
| **awsvpc** | 태스크마다 ENI (Fargate는 강제) |
| **none** | 네트워크 없음 |

#### ECS Service Discovery (시험 가끔)

- AWS Cloud Map과 통합
- 마이크로서비스끼리 DNS로 발견
- API Gateway HTTP API에서 VPC Link로 연결 가능

#### Service Connect (2022 신규)

- Service Mesh 라이트 버전
- 자동 mTLS, 트래픽 모니터링
- ECS 마이크로서비스 통신 단순화

#### ECS Anywhere & EKS Anywhere

- 온프레미스 서버에 ECS/EKS Agent 설치 → AWS에서 관리
- 하이브리드 워크로드

#### ECR 디테일

| 항목 | 내용 |
|------|------|
| **Image Scanning** | Basic (CVE 무료) / Enhanced (Inspector 통합, 유료) |
| **Lifecycle Policy** | 태그·일수·개수 기준 자동 정리 |
| **Replication** | 리전 간·계정 간 자동 복제 |
| **Pull-through Cache** | Docker Hub·ECR Public 캐시 (속도·rate limit 회피) |
| **Image Signing** | AWS Signer로 서명 |
| **인증** | IAM (12시간 토큰), `aws ecr get-login-password` |

### 5. ECS 서비스와 ALB 통합

```bash
# ECS 서비스 생성 (Fargate)
aws ecs create-service \
    --cluster my-cluster \
    --service-name my-service \
    --task-definition my-app:1 \
    --desired-count 3 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
    --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=my-app,containerPort=8080"
```

---

## 아키텍처 다이어그램

```
ECS Fargate 아키텍처
================================

[ALB]
  |
  | 요청 분산
  v
[ECS 서비스]
  태스크 1: [Fargate 컨테이너]
  태스크 2: [Fargate 컨테이너]
  태스크 3: [Fargate 컨테이너]
  (Auto Scaling Group 연결)
  
  각 태스크:
    - awsvpc 모드 (각 태스크에 ENI 부여)
    - Secrets Manager에서 비밀번호 주입
    - CloudWatch Logs로 로그 전송

CI/CD 통합
================================

[CodeCommit]
     |
     v
[CodeBuild] → docker build → [ECR]
                                  |
                                  v
                          [ECS 서비스 업데이트]
                          (새 태스크 정의 배포)
```

---

## ⭐ 핵심 포인트

1. ⭐ **Fargate**: 서버리스 컨테이너, EC2 관리 불필요
2. ⭐ **태스크 정의**: CPU/메모리/이미지/포트/환경변수 정의
3. ⭐ **executionRole**: ECR pull, CloudWatch Logs 권한
4. ⭐ **taskRole**: 컨테이너가 AWS 서비스에 접근하는 권한
5. ⭐ **ECR**: 완전 관리형 Docker 레지스트리, 취약점 스캔

---

## 📝 연습 문제

**문제 1.** Fargate와 EC2 시작 유형의 가장 큰 차이점은?

A) 컨테이너 이미지 지원  
B) Fargate는 서버 인프라 관리 불필요  
C) 지원 리전 차이  
D) 네트워킹 방식 차이  

**정답: B** - Fargate는 서버리스로 EC2 인스턴스를 직접 관리할 필요 없이 컨테이너를 실행할 수 있습니다.

---

**문제 2.** ECS 태스크가 DynamoDB에 접근하려면 어떤 역할이 필요한가?

A) executionRoleArn  
B) taskRoleArn  
C) 인스턴스 프로파일  
D) 보안 그룹 설정  

**정답: B** - taskRole은 컨테이너 내 애플리케이션이 AWS 서비스에 접근할 때 사용합니다. executionRole은 ECS 에이전트가 ECR pull, 로그 쓰기에 사용합니다.

---

**문제 3.** ECR에서 오래된 이미지를 자동으로 삭제하려면?

A) S3 수명 주기 정책  
B) ECR 이미지 수명 주기 정책  
C) CloudWatch 이벤트  
D) Lambda 함수 직접 구현  

**정답: B** - ECR 이미지 수명 주기 정책을 설정하면 규칙에 따라 오래된 이미지를 자동으로 삭제합니다.

---

**문제 4.** ECS Fargate 태스크가 사용하는 네트워크 모드는?

A) bridge  
B) host  
C) awsvpc  
D) overlay  

**정답: C** - Fargate는 awsvpc 네트워크 모드를 사용하며 각 태스크에 독립적인 ENI(Elastic Network Interface)가 부여됩니다.

---

**문제 5.** ECS 서비스에서 태스크 수를 자동으로 조정하려면?

A) ECS 수동 업데이트  
B) ECS Service Auto Scaling  
C) EC2 Auto Scaling  
D) Lambda 함수  

**정답: B** - ECS Service Auto Scaling은 CPU, 메모리 사용률 등을 기반으로 태스크 수를 자동 조정합니다.

---

## 📌 오늘의 요약

1. ECS: Docker 컨테이너 오케스트레이션, 클러스터/태스크정의/서비스
2. Fargate: 서버리스, EC2 관리 불필요, awsvpc 네트워크 모드
3. 태스크 정의: CPU/메모리/이미지/포트/환경변수/비밀번호 정의
4. 역할: executionRole(ECR/Logs), taskRole(AWS 서비스 접근)
5. ECR: 완전 관리형 레지스트리, 취약점 스캔, 수명 주기 정책
