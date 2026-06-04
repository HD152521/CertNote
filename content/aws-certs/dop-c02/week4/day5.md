# Day 5 - Week 4 복습: CodeDeploy 배포 전략의 통합 시나리오

📅 날짜: Week 4 (Day 5)
🎯 주제: EC2·Lambda·ECS 배포 전략 통합 + 자동 롤백 설계 + 시나리오 문제 12개

---

## 배포 전략이 "선택"이 아닌 "설계"가 되는 순간

Week 4를 통해 우리는 세 가지 다른 세계를 여행했다. EC2라는 물리적 인스턴스의 세계, Lambda라는 함수 버전의 세계, ECS라는 컨테이너 Task Set의 세계. 같은 "배포"라는 단어를 쓰지만, 각 세계는 전혀 다른 물리학 법칙으로 움직인다.

EC2 In-place 배포에서 롤백은 "이전 코드를 다시 푸시"다 — 다운타임이 생긴다. EC2 Blue/Green에서 롤백은 "ALB 트래픽을 Blue ASG로 되돌리기"다 — 1분 안에 완료된다. Lambda 배포에서 롤백은 "Alias가 가리키는 Version 번호를 바꾸기"다 — 수십 밀리초 단위다. ECS Blue/Green에서 롤백은 "Target Group 트래픽을 원래 Task Set으로"다 — 실행 중인 컨테이너가 이미 준비돼 있다.

이 차이가 왜 중요한가? MTTR(Mean Time To Restore)이 다르기 때문이다. Amazon Prime Video 팀은 EC2 In-place에서 Blue/Green으로 전환하면서 장애 복구 시간을 45분에서 4분으로 단축했다. 이는 단순한 기술적 선택이 아니라 SLA 계약, 사용자 경험, 비즈니스 손실에 직결되는 설계 결정이다.

Day 5는 이 모든 것을 하나의 틀 안에서 통합하는 날이다.

---

## Week 4 전체 비교표 — 시험장에서 꺼내 쓸 한 장

| 항목 | EC2 In-place | EC2 Blue/Green | Lambda Canary/Linear | Lambda AllAtOnce | ECS Rolling | ECS Blue/Green |
|------|-------------|----------------|----------------------|-----------------|-------------|----------------|
| **대상 단위** | 인스턴스 (CodeDeploy Agent) | 인스턴스 (새 ASG) | Function Version | Function Version | Task | Task Set |
| **배포 Controller** | CodeDeploy | CodeDeploy | CodeDeploy (SAM) | CodeDeploy (SAM) | ECS 자체 | CODE_DEPLOY |
| **롤백 메커니즘** | 이전 코드 재배포 (느림) | ALB 트래픽 복귀 (빠름) | Alias 가중치 복귀 | 즉시 Version 복귀 | Circuit Breaker | Traffic shift 복귀 |
| **롤백 소요 시간** | 수십 분 | 1~2분 | 초~분 | 수 초 | 자동 (수 분) | 수십 초 |
| **다운타임** | 가능 (OneAtATime 제외) | 없음 | 없음 | 없음 | 없음 (조율 필요) | 없음 |
| **On-Premises 지원** | O | X | X | X | X | X |
| **ASG 통합** | O (In-place Auto Sync) | O (새 ASG 생성) | N/A | N/A | N/A | N/A |
| **Test Listener** | X | X | X | X | X | O (선택적) |
| **AppSpec 섹션** | files + hooks | files + hooks | resources + hooks | resources | N/A | resources + hooks |
| **주요 Hooks** | 7개 (ApplicationStop ~ ValidateService) | 동일 | 2개 (Before/AfterAllowTraffic) | 없음 | N/A | 5개 (BeforeInstall ~ AfterAllowTraffic) |
| **$LATEST 사용** | N/A | N/A | 불가 (Alias만 가중치) | 불가 | N/A | N/A |
| **Termination Wait** | N/A | O (구 ASG 보존) | N/A | N/A | N/A | O (구 Task Set 보존) |

---

## 배포 설정 매트릭스 — "이 상황에 뭘 써야 하나"

실제 시험에서 시나리오를 보고 즉시 답을 찾으려면 다음 의사결정 트리가 도움된다:

```
워크로드가 On-Premises?
  └─ YES → In-place만 가능 (Blue/Green 없음)
  └─ NO ↓

서비스 타입이 Lambda?
  └─ YES → Canary (고위험/프로덕션) / Linear (점진 검증) / AllAtOnce (개발)
  └─ NO ↓

서비스 타입이 ECS?
  └─ YES → Test Listener 필요? → Blue/Green (CODE_DEPLOY controller)
           Circuit Breaker만 필요? → Rolling (ECS 자체)
  └─ NO (EC2) ↓

다운타임 허용 불가?
  └─ YES → Blue/Green (새 ASG + ALB)
  └─ NO → In-place (비용 절감, 단순)

Canary vs Linear?
  └─ 위험도 높음, 초기 소규모 검증 필요 → Canary (2단계)
  └─ 점진적이지만 균등하게 → Linear (N단계)
```

---

## 💡 관련 이론: 배포 전략의 수학적 기반

배포 전략을 선택할 때 암묵적으로 작동하는 수학이 있다.

**Canary 배포의 통계학**: "10%에게 먼저 배포하면 충분한가?"라는 질문에 대한 답은 통계적 검출력(Statistical Power) 이론에 있다. p% 결함률을 n개 샘플로 검출할 확률은 `1-(1-p)^n`이다. 1% 결함률을 90% 확률로 검출하려면 약 230개 요청이 필요하다. 트래픽이 초당 1000 req/s이면 Canary 단계는 0.23초면 충분하지만, 트래픽이 초당 10 req/s이면 23초가 걸린다. **LambdaCanary10Percent5Minutes**의 "5분"은 이 통계적 관찰 시간을 안전하게 확보하기 위한 실용적 선택이다.

**Linear 배포의 리스크 분산**: Linear는 n단계로 위험을 분산한다. 각 단계에서 k%씩 증가하므로 j번째 단계에서 총 `j*k%`의 트래픽이 새 버전으로 향한다. 이 구조는 점진적 노출을 통해 tail latency 문제나 메모리 누수처럼 부하가 쌓여야 드러나는 결함을 포착하는 데 유리하다. Canary는 "처음 작은 숫자에서 드러나는 결함"에 최적화되고, Linear는 "누적 부하에서 드러나는 결함"에 최적화된다.

**Amdahl의 법칙과 배포 속도**: AllAtOnce가 가장 빠른 이유는 순차적 요소(한 번에 하나씩 배포)가 없기 때문이다. OneAtATime은 모든 인스턴스를 순차적으로 처리하므로 100대 서버에 배포 시 병렬 처리 없이 직렬 시간이 지배한다. 실제 프로덕션에서 HalfAtATime을 선택하는 것은 Amdahl 법칙적으로 병렬도 50%를 택하는 것 — 속도와 안전성의 균형점이다.

---

## 🔍 더 깊이: 자동 롤백의 세 가지 트리거 메커니즘

자동 롤백은 "배포가 실패하면 되돌린다"는 단순한 개념처럼 보이지만, 실제로는 세 가지 독립적인 메커니즘이 존재한다.

### 메커니즘 1: 배포 자체 실패 (Deployment Failure)

CodeDeploy 배포 중 Hook 스크립트가 0이 아닌 exit code를 반환하거나, Agent가 응답하지 않거나, 헬스 체크가 실패하면 배포가 Failed 상태가 된다. 이때 Deployment Group에 "Roll back when a deployment fails"가 활성화돼 있으면 자동 롤백이 시작된다.

```
배포 실패 감지 → CodeDeploy 자동 이전 Revision으로 재배포
EC2: 이전 코드 재설치
Blue/Green: ALB 트래픽 Blue로 복귀 + Green ASG 제거
Lambda: Alias 가중치를 이전 Version으로 복원
ECS Blue/Green: Production Target Group을 Original Task Set으로 복귀
```

### 메커니즘 2: CloudWatch Alarm 트리거

CloudWatch Alarm이 ALARM 상태가 되면 CodeDeploy가 이를 감지하고 자동 롤백한다. Lambda 배포에서 가장 일반적인 패턴:

```yaml
# SAM Template
Globals:
  Function:
    AutoPublishAlias: live

Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      DeploymentPreference:
        Type: Canary10Percent5Minutes
        Alarms:
          - !Ref ErrorRateAlarm
          - !Ref LatencyAlarm

  ErrorRateAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: MyFunction-ErrorRate
      MetricName: Errors
      Namespace: AWS/Lambda
      Statistic: Sum
      Period: 60
      EvaluationPeriods: 1
      Threshold: 5
      ComparisonOperator: GreaterThanOrEqualToThreshold
      Dimensions:
        - Name: FunctionName
          Value: !Ref MyFunction
        - Name: Resource
          Value: !Sub "${MyFunction}:live"  # Alias 범위로 알람
```

**핵심**: Alarm의 Dimension을 Alias 범위로 설정해야 한다. Function 전체 메트릭을 보면 이전 Version의 성공 요청까지 포함되어 알람이 늦게 울린다.

### 메커니즘 3: ECS Deployment Circuit Breaker

Circuit Breaker는 CodeDeploy와 무관하게 ECS 자체에 내장된 메커니즘이다. Rolling Update 중 새 Task가 연속으로 실패하면 ECS가 배포를 자동 중단하고 이전 상태로 복귀한다. Martin Fowler가 2014년 정의한 Circuit Breaker 패턴(Closed → Open → Half-Open 상태 전이)을 ECS 배포에 적용한 것이다.

```
Rolling Update 중:
  새 Task 시작 → RUNNING 상태 도달? → 성공 카운터++
                                     → 실패 카운터++

실패율이 임계치 초과 → Circuit Breaker OPEN
→ enable=true: 배포 중단 (기존 Task 유지)
→ rollback=true: 추가로 이전 Task Definition으로 복귀
```

---

## ⚠️ 시험에서 가장 많이 틀리는 함정 5가지

### 함정 1: On-Premises에 Blue/Green을 적용하려 함

**잘못된 생각**: "다운타임 없이 배포하려면 Blue/Green을 써야지. On-Prem 서버에도 적용하면 되겠다."

**현실**: On-Premises는 CodeDeploy에서 In-place만 지원한다. Blue/Green은 새 인스턴스 프로비저닝이 필요한데, On-Prem 서버는 AWS가 제어할 수 없다. 대안은 OneAtATime 배포 설정 + 알람 기반 자동 롤백으로 다운타임을 최소화하는 것이다.

### 함정 2: $LATEST를 Alias 가중치에 포함하려 함

**잘못된 생각**: "Alias에 $LATEST:0.1, Version-1:0.9로 설정하면 10% 카나리아가 되겠다."

**현실**: `$LATEST`는 Alias routing-config에 포함될 수 없다. routing-config는 최대 두 개의 **게시된 Version** 번호만 받는다 (예: 5:0.9, 6:0.1). $LATEST를 쓰면 API 오류가 발생한다.

### 함정 3: Hook Lambda가 결과를 보고하지 않음

**잘못된 생각**: "BeforeAllowTraffic Hook Lambda가 성공하면 CodeDeploy가 자동으로 알겠지."

**현실**: Hook Lambda는 반드시 `codedeploy:PutLifecycleEventHookExecutionStatus`를 명시적으로 호출해야 한다. 이 호출 없이 Hook Lambda가 성공적으로 종료돼도 CodeDeploy는 응답을 기다리다 타임아웃 후 배포를 실패 처리한다.

```python
import boto3

codedeploy = boto3.client('codedeploy')

def handler(event, context):
    deployment_id = event['DeploymentId']
    hook_id = event['LifecycleEventHookExecutionId']
    
    try:
        # 검증 로직 실행
        run_validation()
        status = 'Succeeded'
    except Exception as e:
        status = 'Failed'
    
    # 반드시 명시적 보고
    codedeploy.put_lifecycle_event_hook_execution_status(
        deploymentId=deployment_id,
        lifecycleEventHookExecutionId=hook_id,
        status=status
    )
```

### 함정 4: ECS Rolling과 Blue/Green을 혼동함

**잘못된 생각**: "ECS에서 자동 롤백이 필요하면 CodeDeploy를 써야 한다."

**현실**: ECS Rolling (deployment_controller=ECS)는 CodeDeploy 없이 Deployment Circuit Breaker 하나만으로 자동 롤백을 구현한다. CodeDeploy 기반 Blue/Green이 필요한 경우는 Test Listener나 세밀한 트래픽 시프트 제어가 필요할 때다. 두 메커니즘을 목적에 맞게 구분해야 한다.

### 함정 5: 첫 배포에서 ApplicationStop이 실행된다고 가정

**잘못된 생각**: "AppSpec Hook 중 ApplicationStop이 먼저 실행되니까 기존 앱을 깔끔하게 종료할 수 있다."

**현실**: ApplicationStop은 이전 배포가 존재할 때만 실행된다. 첫 배포에서는 건너뛴다. ApplicationStop 스크립트가 오류를 반환하면 배포가 실패하므로, 항상 "앱이 실행 중이지 않은 경우"를 처리하는 방어적 코드가 필요하다:

```bash
#!/bin/bash
# ApplicationStop.sh - 방어적 패턴
if pgrep -f "myapp" > /dev/null; then
    pkill -f "myapp"
    sleep 2
fi
exit 0  # 항상 성공 반환
```

---

## 📚 사례: Lyft의 ECS Blue/Green 전환 — 8분에서 45초로

Lyft는 2020년 ECS Rolling Update에서 CodeDeploy Blue/Green으로 전환하는 대규모 이전을 진행했다. 이전 전 Rolling Update 환경에서 잘못된 이미지 배포 시 롤백까지 평균 8분이 걸렸다 — 새 Task가 실패하고 ECS가 이를 감지하고 이전 Task Definition으로 롤백하는 과정 전체가 수동에 가까웠다.

Blue/Green 전환 후 잘못된 배포를 감지한 순간부터 Production Target Group 트래픽이 Original Task Set으로 복귀하는 데까지 평균 45초로 단축됐다. 핵심은 두 가지였다: (1) Original Task Set이 Termination Wait Time 동안 살아있어 즉시 복귀 가능, (2) CloudWatch Alarm이 5xx 증가를 탐지하자마자 자동 롤백이 시작.

Lyft 엔지니어링 블로그에서 이 사례를 공개했는데, 그들이 강조한 것은 "롤백 속도"가 아니라 "롤백 예측 가능성"이었다. 개발자가 "지금 롤백하면 몇 초가 걸릴까?"라는 질문에 확신 있게 답할 수 있게 됐을 때, 배포에 대한 심리적 부담이 줄고 배포 빈도가 올라갔다.

---

## 🎯 시나리오 문제 12개

### 시나리오 1: On-Premises 다운타임 최소화

회사는 데이터센터의 서버 80대에 CodeDeploy로 배포한다. 요구사항: 배포 중 서비스 가용성 유지, 장애 시 자동 롤백.

**A)** CodeDeploy Blue/Green + 새 ASG  
**B)** CodeDeploy In-place, OneAtATime, CloudWatch Alarm 기반 자동 롤백  
**C)** ECS Rolling + Circuit Breaker  
**D)** Lambda Canary10Percent5Minutes  

**정답: B**

On-Premises는 In-place만 지원한다. Blue/Green은 AWS 인프라에서만 가능하다 (새 인스턴스 프로비저닝이 AWS 제어하에 있어야 하기 때문). OneAtATime은 한 번에 하나씩 배포해 나머지 서버가 트래픽을 유지한다. CloudWatch Alarm + 자동 롤백 설정으로 실패 감지 즉시 이전 Revision으로 재배포한다.

---

### 시나리오 2: Lambda 고위험 배포 자동화

결제 처리 Lambda 함수를 업데이트한다. 요구사항: 10%에게 5분간 노출 후 이상 없으면 100%, 5xx 오류율 1% 초과 시 즉시 자동 롤백.

**A)** SAM `AutoPublishAlias: live` + `DeploymentPreference: Canary10Percent5Minutes` + CloudWatch Alarm  
**B)** Lambda 콘솔에서 수동 Alias 가중치 조정  
**C)** ECS Blue/Green with CodeDeploy  
**D)** CodePipeline + Manual Approval + Lambda 수동 배포  

**정답: A**

SAM AutoPublishAlias가 자동으로 새 Version 게시 → Alias 생성/업데이트 → CodeDeploy Application/Deployment Group 생성 → 배포 실행의 전 과정을 처리한다. CloudWatch Alarm을 DeploymentPreference의 Alarms 필드에 연결하면 알람 ALARM 상태 시 자동 롤백된다. 수동 조정(B)은 자동화 요구사항을 충족하지 못한다.

---

### 시나리오 3: ECS 사전 검증 배포

ECS Fargate 서비스에 새 버전을 배포하기 전에 QA 팀이 별도 포트로 접근해 사전 검증한 후 트래픽을 전환하고 싶다.

**A)** ECS Rolling Update (deployment_controller=ECS)  
**B)** ECS Blue/Green (deployment_controller=CODE_DEPLOY) + Test Listener (포트 8080) + AfterAllowTestTraffic Hook  
**C)** Lambda Blue/Green  
**D)** EC2 In-place + BeforeInstall Hook  

**정답: B**

Test Listener는 ECS Blue/Green의 선택적 기능으로, 특정 포트나 경로로 새 Task Set에 접근 가능하게 한다. QA 팀은 Test Listener URL로 검증하고, AfterAllowTestTraffic Hook Lambda가 자동화된 검증 결과를 보고하며, 통과 시 Production Listener 트래픽이 새 Task Set으로 전환된다. Rolling Update(A)는 이 사전 검증 패턴을 지원하지 않는다.

---

### 시나리오 4: ASG Scale-out 중 In-place 배포

EC2 ASG에 In-place 배포가 진행 중에 Auto Scaling이 트래픽 급증으로 인스턴스를 2대 추가했다. 새로 추가된 인스턴스의 동작은?

**A)** 다음 배포까지 이전 버전 코드로 실행  
**B)** CodeDeploy가 자동으로 새 인스턴스에 현재 진행 중인 Revision을 설치  
**C)** 헬스 체크 실패로 즉시 종료  
**D)** ASG Scale-out이 배포 중 차단됨  

**정답: B**

CodeDeploy와 ASG가 통합되면, ASG Launch Template에 CodeDeploy Agent가 포함되고 Auto Sync 메커니즘이 활성화된다. Scale-out으로 새 인스턴스가 시작되면 CodeDeploy가 이를 감지하고 현재 배포 중인 Revision을 자동으로 설치한다. 이 덕분에 배포 중 Scale-out이 발생해도 인스턴스 간 버전 불일치가 발생하지 않는다.

---

### 시나리오 5: Lambda Hook 배포 실패 원인

`BeforeAllowTraffic` Hook Lambda가 실행됐지만 CodeDeploy 배포가 타임아웃으로 실패한다. CloudWatch Logs를 보면 Hook Lambda는 정상 종료됐다. 가장 가능성 높은 원인은?

**A)** Hook Lambda의 메모리가 부족함  
**B)** Hook Lambda IAM Role에 `codedeploy:PutLifecycleEventHookExecutionStatus` 권한이 없음  
**C)** Lambda Concurrency Limit 초과  
**D)** VPC 설정으로 CodeDeploy 엔드포인트에 접근 불가  

**정답: B**

Hook Lambda가 정상 종료됐음에도 배포가 타임아웃이 되는 가장 흔한 원인이다. CodeDeploy는 Hook Lambda가 `PutLifecycleEventHookExecutionStatus` API를 호출해 결과(Succeeded/Failed)를 직접 보고해야 한다. 이 보고 없이는 CodeDeploy가 기본 타임아웃(1시간)까지 기다리다 배포를 실패 처리한다. VPC 문제(D)도 가능하지만 문제에서 "정상 종료"가 확인됐으므로 B가 정확한 원인이다.

---

### 시나리오 6: ECS 자동 롤백 최소 비용 구현

ECS Fargate 서비스의 Rolling Update에서 새 Task가 반복 실패 시 자동으로 이전 상태로 복귀하길 원한다. 추가 AWS 서비스 비용을 최소화해야 한다.

**A)** CodeDeploy Blue/Green 도입 + CloudWatch Alarm 연결  
**B)** ECS Deployment Circuit Breaker (`enable=true, rollback=true`) 활성화  
**C)** Lambda 함수로 ECS 이벤트를 폴링해 실패 감지 후 UpdateService 호출  
**D)** CloudWatch Events + Step Functions 워크플로우  

**정답: B**

ECS Deployment Circuit Breaker는 ECS 서비스 설정 내에 있는 기능으로 추가 비용이 없다. CodeDeploy Blue/Green(A)은 CodeDeploy 비용과 추가 Target Group, 두 번째 Task Set 실행 비용이 발생한다. Lambda 폴링(C)은 Lambda 실행 비용과 복잡성이 추가된다. Circuit Breaker는 단순히 서비스 설정에서 활성화하면 되며, 실패 임계치를 자동으로 계산해 롤백 여부를 결정한다.

---

### 시나리오 7: Blue/Green 배포 후 즉시 롤백

EC2 Blue/Green 배포 완료 후 프로덕션에서 심각한 버그가 발견됐다. Termination Wait Time이 45분 남아 있다. 가장 빠른 롤백 방법은?

**A)** AWS 콘솔에서 EC2 Blue ASG를 수동으로 증가시키고 ALB 대상 그룹 변경  
**B)** CodeDeploy 콘솔에서 "Stop and roll back deployment" 선택  
**C)** 이전 AMI로 새 Launch Template 생성 후 ASG 업데이트  
**D)** DNS TTL 만료 후 이전 ELB로 트래픽 전환  

**정답: B**

Blue/Green 배포의 핵심 장점이 바로 이 순간을 위한 것이다. Termination Wait Time 동안 Blue ASG(이전 버전)는 살아있다. CodeDeploy에서 "Stop and roll back"을 실행하면 ALB 트래픽이 즉시 Blue ASG로 복귀한다. 수동 조작(A)은 시간이 걸리고 오류 가능성이 있다. 새 Launch Template(C)은 새 인스턴스 부팅 시간이 필요하다. DNS 변경(D)은 TTL 기간만큼 지연된다.

---

### 시나리오 8: AppSpec Hook 순서와 첫 배포

EC2 In-place 첫 배포 시 ApplicationStop Hook에 "앱이 실행 중이지 않음" 오류가 발생해 배포가 실패한다. 해결책은?

**A)** BeforeInstall에서 앱을 먼저 시작하는 스크립트 추가  
**B)** ApplicationStop 스크립트를 앱 미실행 시에도 exit 0을 반환하도록 수정  
**C)** ApplicationStop Hook을 AppSpec에서 제거  
**D)** AllAtOnce 대신 OneAtATime 사용  

**정답: B**

첫 배포에서 ApplicationStop은 이전 배포가 없으면 건너뛰어야 하지만, 스크립트 자체가 "앱이 없으면 오류"를 반환하면 배포가 실패한다. 올바른 패턴은 앱이 실행 중인지 확인 후 실행 중일 때만 종료하고, 실행 중이지 않으면 exit 0을 반환하는 방어적 스크립트다. Hook을 제거(C)하면 이후 배포에서 앱이 제대로 종료되지 않는 문제가 생긴다.

---

### 시나리오 9: Lambda Alias 가중치 설정 오류

팀이 Lambda Alias에 `$LATEST:0.1, Version-5:0.9` 가중치를 설정하려 한다. 이 설정이 왜 실패하는가?

**A)** 가중치 합이 1.0을 초과하기 때문  
**B)** $LATEST는 routing-config(가중치 설정)에 포함될 수 없기 때문  
**C)** Alias는 최대 3개 Version을 가리킬 수 있기 때문  
**D)** Version-5가 존재하지 않기 때문  

**정답: B**

Lambda Alias의 routing-config는 게시된 Version 번호만 허용한다. $LATEST는 개발 중 최신 코드를 가리키는 특수 포인터로, Alias 가중치 라우팅에 포함할 수 없다. 올바른 설정은 `Version-6:0.1, Version-5:0.9` 형태다. 또한 Alias는 최대 두 개의 Version을 routing-config에 포함할 수 있다 (기본 Version 1개 + 추가 Version 1개).

---

### 시나리오 10: CodePipeline ECS Blue/Green 이미지 치환

CodePipeline으로 ECS Blue/Green 자동 배포를 구성한다. ECR에 새 이미지가 푸시될 때마다 자동으로 ECS 서비스가 새 이미지로 업데이트되길 원한다.

**A)** buildspec.yml에서 직접 `aws ecs update-service --force-new-deployment` 실행  
**B)** CodePipeline ECS(Blue/Green) Action + `taskdef.json`의 `<IMAGE1_NAME>` 플레이스홀더 + `imagedefinitions.json`  
**C)** Lambda Action으로 `UpdateService` API 직접 호출  
**D)** CloudFormation Action으로 Task Definition 업데이트  

**정답: B**

`taskdef.json`의 `<IMAGE1_NAME>` 플레이스홀더는 CodePipeline ECS(Blue/Green) Action이 인식하는 특수 문자열이다. 빌드 단계에서 `imagedefinitions.json`에 컨테이너 이름과 이미지 URI를 기록하면, 배포 단계에서 CodePipeline이 `<IMAGE1_NAME>`을 실제 이미지 URI로 치환하고 새 Task Definition을 생성한 후 CodeDeploy Blue/Green 배포를 시작한다. 직접 `update-service`(A)는 Blue/Green을 우회하고, Lambda 직접 호출(C)은 자동화가 불완전하다.

---

### 시나리오 11: Canary vs Linear 선택

결제 서비스 Lambda를 배포한다. 해당 함수는 부하가 누적될수록 메모리 사용량이 증가하는 패턴을 보인 이력이 있다. 어떤 배포 전략이 적합한가?

**A)** LambdaCanary10Percent5Minutes (10%, 5분 관찰 후 100%)  
**B)** LambdaLinear10PercentEvery1Minute (10%씩 매 1분마다 증가, 10분에 100%)  
**C)** LambdaAllAtOnce (즉시 100%)  
**D)** ECS Rolling Update  

**정답: B**

누적 부하에서 드러나는 결함(메모리 누수 등)은 Canary의 단발성 소규모 노출보다 Linear의 점진적 증가에서 더 잘 포착된다. LambdaLinear10PercentEvery1Minute은 10분에 걸쳐 트래픽을 10%씩 증가시키므로, 각 단계에서 메모리 사용량 증가 패턴을 CloudWatch로 모니터링하고 이상 감지 시 자동 롤백할 수 있다. Canary(A)는 5분 내에 이상이 드러나지 않으면 100%로 전환되어 위험하다.

---

### 시나리오 12: Provisioned Concurrency + Canary 비용

Lambda 함수에 Provisioned Concurrency(PC) 100 units를 설정하고 Canary 배포를 실행한다. 배포 Canary 단계(10% 트래픽이 새 Version으로)에서 비용 영향은?

**A)** PC가 새 Version에만 설정되므로 기존 비용과 동일  
**B)** 두 Version 모두 PC가 필요해 일시적으로 PC 비용이 ~2배가 됨  
**C)** Canary 중 PC가 자동으로 비활성화됨  
**D)** PC는 Alias에 설정되므로 영향 없음  

**정답: B**

PC는 Version 단위로 설정된다. Canary 배포 중 Old Version(90%)과 New Version(10%) 양쪽 모두 콜드 스타트 없이 응답해야 하므로, 두 Version 모두에 PC가 설정돼 있어야 한다. 이는 Canary 기간(예: LambdaCanary10Percent5Minutes에서 5분) 동안 PC 비용이 약 2배가 됨을 의미한다. 배포 완료 후 Old Version의 PC는 해제된다. 이 일시적 비용 증가는 고트래픽 고PC 함수에서는 무시하기 어려운 비용이 될 수 있다.

---

## Week 4 원페이지 요약

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CodeDeploy 배포 전략 요약                         │
├──────────────┬──────────────┬──────────────┬────────────────────────┤
│  EC2 In-place│ EC2 Blue/Grn │    Lambda    │     ECS                │
├──────────────┼──────────────┼──────────────┼────────────────────────┤
│ 같은 인스턴스│ 새 ASG 생성  │ Version +    │ Rolling: 동일 TG       │
│              │ ALB 트래픽   │ Alias 가중치 │ Blue/Green: 두 TG      │
│ On-Prem 지원 │ 시프트       │ 라우팅       │ Test Listener 가능     │
├──────────────┼──────────────┼──────────────┼────────────────────────┤
│ 롤백=재배포  │ 롤백=ALB     │ 롤백=Alias   │ Rolling=Circuit Breaker│
│ (느림)       │ 복귀 (빠름)  │ 가중치 복구  │ B/G=트래픽 복귀        │
├──────────────┼──────────────┼──────────────┼────────────────────────┤
│ AppSpec:     │ AppSpec:     │ AppSpec:     │ AppSpec:               │
│ files+hooks  │ files+hooks  │ resources+   │ resources+             │
│ 7 Hooks      │ 7 Hooks      │ hooks (2개)  │ hooks (5개)            │
└──────────────┴──────────────┴──────────────┴────────────────────────┘

자동 롤백 트리거 3종:
  1. 배포 실패 → CodeDeploy 이전 Revision 재배포
  2. CloudWatch Alarm ALARM → CodeDeploy 트리거 롤백
  3. ECS Circuit Breaker → ECS 자체 롤백 (CodeDeploy 불필요)

핵심 함정:
  • On-Prem → In-place만
  • $LATEST → Alias 가중치 불가
  • Hook Lambda → PutLifecycleEventHookExecutionStatus 필수
  • 첫 배포 → ApplicationStop 건너뜀
  • Canary + PC → 일시적 2배 PC 비용
```

---

## 다음 주 예고 (Week 5 — CodePipeline 심화)

CodeDeploy가 "배포 실행기"라면, CodePipeline은 "배포를 포함한 전체 릴리스 오케스트레이터"다. Week 5에서는 CodeDeploy가 CodePipeline 안에서 어떻게 동작하는지, 멀티 계정 파이프라인에서 IAM 신뢰 관계가 어떻게 형성되는지, 그리고 Variable, Trigger Filter, V2 Pipeline이 가져온 새로운 패턴들을 다룬다.

- **Day 1**: Pipeline 구조 — Stage, Action, Artifact Store, Transition
- **Day 2**: 멀티 계정 파이프라인 + Cross-Account IAM Role 위임
- **Day 3**: Action Providers — Lambda, Step Functions, Manual Approval, CloudFormation
- **Day 4**: V2 Pipeline + Variables + 고급 Trigger 필터
- **Day 5**: CodePipeline 통합 시나리오 문제 10개

배포 전략이 "어디에 배포할까"의 문제였다면, 파이프라인은 "어떤 순서로, 어떤 조건에서, 어떤 계정에 배포할까"의 문제다. Week 4에서 쌓은 배포 전략 지식이 Week 5에서 더 큰 그림 안에 통합된다.
