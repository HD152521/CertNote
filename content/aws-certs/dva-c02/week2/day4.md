# Day 9 - 로드 밸런싱(ALB/NLB/CLB), Auto Scaling

📅 날짜: 2026년 5월 27일 (수요일)  
🎯 주제: 고가용성 아키텍처  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Elastic Load Balancing의 유형(ALB, NLB, CLB)을 구분한다
- Auto Scaling Group의 동작 방식과 확장 정책을 이해한다
- 로드 밸런서와 Auto Scaling을 결합한 고가용성 아키텍처를 설계한다

---

## 📖 이론 내용

### 1. Elastic Load Balancing (ELB)

로드 밸런서는 들어오는 트래픽을 여러 EC2 인스턴스에 분산시켜 가용성과 성능을 높입니다.

#### Application Load Balancer (ALB) - 7계층
- HTTP/HTTPS 트래픽 처리
- URL 경로 기반 라우팅 (`/api/*` → API 서버, `/static/*` → S3)
- 호스트 기반 라우팅 (api.example.com → API 서버)
- 쿼리 문자열, HTTP 헤더 기반 라우팅
- WebSocket 지원
- Lambda 함수를 타겟으로 등록 가능
- **⭐ 컨테이너(ECS)와 마이크로서비스에 최적**

#### Network Load Balancer (NLB) - 4계층
- TCP, UDP, TLS 트래픽 처리
- 초당 수백만 요청 처리 (Ultra-high Performance)
- 고정 IP 주소 (Static IP, Elastic IP 지원)
- 매우 낮은 지연 시간
- **⭐ 극도로 높은 성능이 필요한 게임 서버, 금융 앱에 적합**

#### Classic Load Balancer (CLB) - 구형
- 레거시 ELB (4계층과 7계층 모두 지원)
- **현재는 거의 사용하지 않음 (ALB/NLB로 마이그레이션 권장)**

### 2. ALB 핵심 기능

**타겟 그룹 (Target Group):**
- EC2 인스턴스, ECS 태스크, Lambda, IP 주소 등을 타겟으로 등록
- 헬스 체크로 비정상 타겟 자동 제거

**리스너 규칙:**
```
리스너 (HTTPS:443)
  |
  +-- 규칙 1: IF 경로=/api/* THEN 포워드 → API-TG
  |
  +-- 규칙 2: IF 호스트=admin.* THEN 포워드 → Admin-TG
  |
  +-- 규칙 3: IF 경로=/old THEN 리다이렉트 → /new
  |
  +-- 기본 규칙: THEN 포워드 → Web-TG
```

**⭐ ALB 고정 세션(Sticky Session):**
- 쿠키를 사용하여 동일 클라이언트를 동일 인스턴스로 라우팅
- Application-based cookie vs Duration-based cookie

### 3. Auto Scaling Group (ASG)

ASG는 EC2 인스턴스를 자동으로 확장/축소합니다.

**ASG 핵심 설정:**
- **최소 크기**: 항상 유지되는 최소 인스턴스 수
- **최대 크기**: 생성 가능한 최대 인스턴스 수
- **희망 용량**: 현재 목표 인스턴스 수
- **시작 템플릿/구성**: 새 인스턴스 시작 방법 정의

**확장 정책 유형:**

1. **동적 확장 (Dynamic Scaling)**
   - 대상 추적(Target Tracking): CPU 60% 유지 등 지표 기반
   - 단계 확장(Step Scaling): 임계값별 단계적 확장
   - 단순 확장(Simple Scaling): 단일 조정 (쿨다운 기간 후)

2. **예약 확장 (Scheduled Scaling)**
   - 정해진 시간에 인스턴스 수 조정
   - 예: 매일 오전 9시에 min=5로 증가

3. **예측 확장 (Predictive Scaling)**
   - ML로 향후 트래픽 예측, 사전에 확장

**ASG 헬스 체크:**
- EC2 상태 체크 (기본)
- ELB 헬스 체크 (ALB의 헬스 체크 사용)
- 비정상 인스턴스 종료 후 새 인스턴스 시작

---

## 🧠 알아두면 좋은 심화 이론

### ELB 4종 비교 (시험 매우 빈출)

| 항목 | ALB | NLB | GWLB | CLB(레거시) |
|------|-----|-----|------|------------|
| OSI 계층 | 7 | 4 | 3/4 | 4/7 |
| 프로토콜 | HTTP, HTTPS, gRPC, WebSocket | TCP, UDP, TLS | IP (GENEVE) | HTTP, HTTPS, TCP |
| 고정 IP | ❌ | ✅ EIP | ❌ | ❌ |
| 타겟 유형 | EC2, IP, Lambda, ECS | EC2, IP, ALB | EC2 (보안 어플라이언스) | EC2 |
| 라우팅 | URL/Host/Header | 포트 기반 | 6-tuple 해시 | 기본 |
| 비용 | 중간 | 낮음 (LCU) | 높음 | 비싸지만 권장X |

> 💡 **GWLB**: 보안 어플라이언스(방화벽, IDS, DPI)를 투명하게 삽입할 때 사용. 시험에 가끔 출제.

### Sticky Session (세션 고정) 상세

| 유형 | ALB 지원 | NLB 지원 | 동작 |
|------|---------|---------|------|
| **Duration-based** (`AWSALB`) | ✅ | ❌ | ALB가 쿠키 자동 생성 |
| **Application-based** (`AWSALBAPP`) | ✅ | ❌ | 앱이 발급한 쿠키 기반 |
| **Source IP affinity** | ❌ | ✅ | NLB는 IP 기반 sticky만 |

> ⚠️ **함정**: "NLB에 sticky session 설정" → Source IP 기반만 가능. 쿠키 기반은 ALB 전용.

### ALB SSL/TLS 설정 (시험 출제)

- **SNI (Server Name Indication)**: 한 ALB에 여러 SSL 인증서 부착 가능 (호스트별 다른 인증서)
- **ACM (Certificate Manager)**: 인증서 무료 발급 + 자동 갱신
- **SSL Policy**: TLS 버전·암호화 스위트 선택
- **HTTP → HTTPS 리다이렉트**: 리스너 규칙으로 설정

### Connection Draining / Deregistration Delay

- 인스턴스 종료/제거 시 진행 중 요청 완료 대기 시간
- 기본 300초, 0~3600초 설정 가능
- ASG의 라이프사이클 훅과 함께 동작
- 짧으면 502/504 발생 위험, 길면 종료 지연

### ASG Lifecycle Hook (자주 출제)

```
Pending → [Pending:Wait] → InService
                ↓ 사용자 작업 (S/W 설치, 워밍업)
                ↓ CompleteLifecycleAction

InService → [Terminating:Wait] → Terminated
                ↓ 종료 전 작업 (로그 수집, 그레이스풀 종료)
```

| 훅 타입 | 트리거 |
|---------|--------|
| `autoscaling:EC2_INSTANCE_LAUNCHING` | 시작 시 일시 정지 |
| `autoscaling:EC2_INSTANCE_TERMINATING` | 종료 시 일시 정지 |

> 💡 **사용**: SNS/SQS/EventBridge로 알림 보내고 Lambda가 처리 후 `complete-lifecycle-action`.

### Termination Policy (인스턴스 종료 순서)

기본 우선순위:
1. **OldestLaunchConfiguration**: 가장 오래된 시작 구성
2. **OldestLaunchTemplate**: 가장 오래된 템플릿
3. **AllocationStrategy**: Spot/온디맨드 비율 맞춤
4. **ClosestToNextInstanceHour**: 시간당 과금 종료 직전
5. **NewestInstance**: 가장 최신 (롤백 시나리오)
6. **OldestInstance**: 가장 오래된 (롤링 갱신)
7. **Default**: AZ 균형 우선, 그다음 위 정책 조합

### Mixed Instance Policy + Spot/온디맨드 조합

```
ASG Mixed Policy
  Base capacity: 2 인스턴스 = 온디맨드 (안정)
  Above base: 70% Spot, 30% 온디맨드
  Spot Allocation: capacity-optimized (가장 안정적인 풀)
```

> 시험 시나리오: "비용 절감 + 안정성" → Mixed Instance Policy.

### 확장 정책 비교 (간단 정리)

| 정책 | 키워드 | 사용 예시 |
|------|--------|-----------|
| **Target Tracking** | "CPU 50% 유지" | 일반 권장 |
| **Step Scaling** | "단계별 추가" | 임계값별 차등 대응 |
| **Simple Scaling** | "쿨다운 후 1회" | 거의 안 씀 |
| **Scheduled** | "매일 9시 5대로" | 트래픽 예측 가능 |
| **Predictive** | "ML 기반 사전 확장" | 패턴이 명확한 워크로드 |

### Cross-Zone Load Balancing (시험 함정)

| 로드 밸런서 | 기본값 | 변경 시 |
|------------|--------|---------|
| ALB | **활성화** (무료) | 비활성화 불가 (LB 수준) |
| NLB | **비활성화** (기본) | 활성화 시 데이터 전송 비용 |
| CLB | 비활성화 | API/CLI로만 활성화 |

### ALB → Lambda 직접 호출

- Lambda 함수를 ALB 타겟으로 등록 가능
- 시험 시나리오: "API Gateway 없이 Lambda 노출" → ALB + Lambda 타겟
- API Gateway보다 비용 ↓, 단 기능은 제한적

### 실무 사례 - 무중단 배포 패턴

```
[Blue 환경 ASG]    [Green 환경 ASG]
       ↓                  ↓
       └──── [ALB Target Group Weighted Routing] ──→ 사용자
              (Blue 100% → Green 100% 점진 전환)
```

ALB 가중치 기반 라우팅 + 2개 타겟 그룹으로 Blue/Green 또는 Canary 배포 구현.

### 관련 서비스 Cross-Reference

- **ALB ↔ ECS / Fargate** → [Week 12]
- **ALB ↔ Lambda 타겟** → [Week 3]
- **ASG ↔ CloudWatch 경보** → [Week 10]
- **ASG Lifecycle Hook ↔ SNS/EventBridge** → [Week 11]
- **ALB Cognito 통합** → [Week 9 Day 3] (인증 위임)

---

## 아키텍처 다이어그램

```
ALB + ASG 고가용성 아키텍처
================================

           인터넷
              |
              v
     [Route 53 DNS]
              |
              v
   [Application Load Balancer]
   (멀티-AZ 배포, 고가용성)
    /api/*  |  /  |  /admin/*
     |      |      |
     v      v      v
  [API-TG][Web-TG][Admin-TG]
     |        |
     v        v
  +--AZ-a---+  +--AZ-b---+
  |          |  |          |
  |[EC2 #1] |  |[EC2 #3] |
  |[EC2 #2] |  |[EC2 #4] |
  |          |  |          |
  +----------+  +----------+
       <Auto Scaling Group>
       Min: 2, Max: 8, Desired: 4

ALB 라우팅 규칙
================================

[요청: GET api.example.com/users]
     |
     v
[ALB 리스너 HTTPS:443]
     |
     v
[규칙 1]: HOST = api.example.com?
     | YES
     v
[포워드] → API 타겟 그룹 (EC2 #1, #2, #3)
     |
     v
[헬스 체크 통과한 인스턴스에 분산]

Auto Scaling 동작
================================

     CloudWatch 지표
     CPU 사용률 > 80%
          |
          v
     [Scale Out 알람]
          |
          v
  [ASG: 인스턴스 추가]
  Desired: 4 → 6
          |
          v
  [새 EC2 인스턴스 시작]
  (시작 템플릿 기반)
          |
          v
  [ALB 타겟 그룹에 등록]
          |
          v
  [헬스 체크 통과 후 트래픽 수신]
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **ALB = 7계층**: URL/호스트 기반 라우팅, Lambda 타겟, 마이크로서비스
2. ⭐ **NLB = 4계층**: 극고성능, 고정 IP, 낮은 지연 시간
3. ⭐ **ASG 헬스 체크**: ELB 헬스 체크 활성화 시 ALB가 비정상으로 판단한 인스턴스도 교체
4. ⭐ **대상 추적 확장**: 가장 권장되는 방식, 지표를 목표값으로 자동 조정
5. ⭐ **예열 기간(Warm-up)**: 새 인스턴스가 준비되는 동안 확장 결정에서 제외

---

## 💻 실제 예시 - ELB & ASG CLI

```bash
# 타겟 그룹 생성
aws elbv2 create-target-group \
  --name my-web-tg \
  --protocol HTTP \
  --port 80 \
  --vpc-id vpc-12345678 \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3

# ALB 생성
aws elbv2 create-load-balancer \
  --name my-alb \
  --subnets subnet-11111111 subnet-22222222 \
  --security-groups sg-12345678 \
  --scheme internet-facing \
  --type application

# 리스너 생성
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:... \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:...

# 시작 템플릿 생성
aws ec2 create-launch-template \
  --launch-template-name my-web-template \
  --launch-template-data '{
    "ImageId": "ami-0c9c942bd7bf113a2",
    "InstanceType": "t3.micro",
    "SecurityGroupIds": ["sg-12345678"],
    "UserData": "base64encodedscript"
  }'

# Auto Scaling Group 생성
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name my-web-asg \
  --launch-template LaunchTemplateName=my-web-template,Version='$Latest' \
  --min-size 2 \
  --max-size 10 \
  --desired-capacity 4 \
  --vpc-zone-identifier "subnet-11111111,subnet-22222222" \
  --target-group-arns arn:aws:elasticloadbalancing:... \
  --health-check-type ELB \
  --health-check-grace-period 300

# 대상 추적 확장 정책 (CPU 50% 유지)
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name my-web-asg \
  --policy-name cpu-target-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ASGAverageCPUUtilization"
    },
    "TargetValue": 50.0
  }'
```

---

## 📝 연습 문제

**문제 1.** ALB(Application Load Balancer)의 기능이 아닌 것은?

A) URL 경로 기반 라우팅  
B) 호스트 기반 라우팅  
C) 고정 IP 주소 제공  
D) Lambda 함수를 타겟으로 등록  

**정답: C**  
해설: 고정 IP 주소는 NLB(Network Load Balancer)의 기능입니다. ALB는 고정 IP를 제공하지 않으며, DNS 이름을 사용합니다.

---

**문제 2.** Auto Scaling Group에서 비정상 인스턴스를 ELB 헬스 체크로 감지하려면?

A) ASG에 CloudWatch 경보 연결  
B) ASG의 헬스 체크 유형을 "ELB"로 설정  
C) ALB에 별도 Lambda 함수 연결  
D) EC2 인스턴스에 헬스 체크 에이전트 설치  

**정답: B**  
해설: ASG 헬스 체크 유형을 "ELB"로 설정하면 ALB/NLB의 헬스 체크 결과를 사용하여 비정상 인스턴스를 감지하고 교체합니다.

---

**문제 3.** NLB(Network Load Balancer)에 대한 올바른 설명은?

A) HTTP/HTTPS 트래픽만 처리한다  
B) URL 기반 라우팅을 지원한다  
C) 초당 수백만 요청을 처리하는 고성능 로드 밸런서이다  
D) Lambda 함수를 타겟으로 지원하지 않는다  

**정답: C**  
해설: NLB는 4계층에서 동작하며 초당 수백만 요청을 처리하는 극고성능 로드 밸런서입니다. TCP/UDP/TLS 트래픽을 처리합니다.

---

**문제 4.** ASG의 대상 추적(Target Tracking) 확장 정책이란?

A) 특정 시간에 인스턴스를 추가하는 정책  
B) CloudWatch 임계값을 단계별로 지정하는 정책  
C) 지정된 지표를 목표값으로 유지하도록 자동 확장/축소하는 정책  
D) 수동으로 인스턴스 수를 조정하는 정책  

**정답: C**  
해설: 대상 추적 정책은 CPU 사용률, 요청 수 등의 지표를 지정된 목표값으로 유지하도록 인스턴스 수를 자동으로 조정합니다. 가장 간편하고 권장되는 확장 방식입니다.

---

**문제 5.** 마이크로서비스 아키텍처에서 각 서비스로 트래픽을 라우팅하기에 가장 적합한 로드 밸런서는?

A) Classic Load Balancer (CLB)  
B) Network Load Balancer (NLB)  
C) Application Load Balancer (ALB)  
D) Gateway Load Balancer (GWLB)  

**정답: C**  
해설: ALB는 URL 경로(/api/, /auth/, /orders/)와 호스트명 기반 라우팅을 지원하여 마이크로서비스 아키텍처에서 각 서비스로 트래픽을 효과적으로 분산할 수 있습니다.

---

## 📌 오늘의 요약

1. ALB(7계층): URL/호스트 기반 라우팅, Lambda 지원, 마이크로서비스/컨테이너에 최적
2. NLB(4계층): 극고성능(수백만 RPS), 고정 IP, 낮은 지연 시간
3. ASG: 최소/최대/희망 용량으로 자동 확장, 비정상 인스턴스 자동 교체
4. 확장 정책: 대상 추적(권장), 단계 확장, 단순 확장, 예약 확장, 예측 확장
5. ELB + ASG 조합으로 고가용성과 탄력적 확장을 동시에 달성할 수 있다
