# Day 1 - In-place vs Blue/Green, AppSpec: 배포 전략의 물리학

배포는 "새 코드를 서버에 올리는 것"처럼 들리지만, 실제로는 두 버전이 공존하는 기간을 얼마나 짧게, 얼마나 안전하게 만드느냐의 문제다. In-place는 같은 서버에 새 코드를 덮어쓴다. Blue/Green은 새 서버 군을 완전히 준비한 뒤 트래픽을 통째로 넘긴다. 두 전략은 근본적으로 다른 위험 프로파일을 가진다.

CodeDeploy는 AWS에서 이 두 전략을 EC2, Lambda, ECS에 걸쳐 일관된 인터페이스로 제공하는 서비스다. 하지만 "일관된 인터페이스"라는 말이 "동일한 동작"을 의미하지는 않는다. EC2의 Blue/Green과 Lambda의 Blue/Green은 물리적으로 완전히 다르게 동작한다. AppSpec 파일도 타깃 플랫폼마다 형식이 다르다.

## In-place vs Blue/Green: 본질 비교

| 항목 | In-place | Blue/Green |
|------|----------|------------|
| 배포 대상 | 기존 인스턴스에 덮어쓰기 | 새 인스턴스/Version/Task Set 생성 |
| 다운타임 | OneAtATime이면 거의 0, AllAtOnce는 발생 | 0 (트래픽 시프트만) |
| 롤백 속도 | 느림 (다시 배포 필요) | 즉시 (트래픽 시프트 되돌리기) |
| 비용 | 인스턴스 그대로 | 일시적으로 2× 비용 |
| EC2 | ✅ | ✅ (새 ASG 생성) |
| On-Premises | ✅ | ❌ (지원 안 함) |
| Lambda | ❌ | ✅ (Alias weighted routing) |
| ECS | ❌ | ✅ (두 Target Group) |

**핵심 차이**: 롤백 속도. In-place 롤백은 "이전 버전을 다시 배포"하는 과정이라 수분이 걸린다. Blue/Green 롤백은 "트래픽 시프트를 되돌리는 것"이라 수초다. 이 차이가 MTTR에 직접 영향을 준다.

> 💡 **관련 이론**: Blue/Green 배포는 **Two-Phase Commit**의 배포 버전이다. 2PC에서 모든 참여자가 준비됐다는 확인을 받고 나서야 커밋하듯, Blue/Green도 Green 환경이 완전히 준비되고 검증된 후에만 트래픽을 전환한다. 전환 전까지는 언제든 "롤백(abort)"이 가능하다. 이것이 In-place보다 본질적으로 안전한 이유다.

> 📚 **사례**: 2017년 Amazon Prime Video 팀이 공개한 배포 개선 사례: In-place 배포에서 Blue/Green으로 전환 후 배포 관련 MTTR이 평균 45분에서 4분으로 줄었다. 핵심은 롤백이 "트래픽 전환 되돌리기"라는 즉각적 작업이 됐다는 것이다. 구 버전 인스턴스가 Termination Wait Time 동안 살아있어 ALB 규칙만 바꾸면 즉시 복원됐다.

## Deployment Configuration: 배포 속도와 안전의 수학

**EC2/On-Premises:**
- `AllAtOnce`: 모든 인스턴스 동시. 가장 빠름, 가장 위험. 실패하면 모두 다운.
- `HalfAtATime`: 50%씩 두 번. 중간 절충.
- `OneAtATime`: 한 대씩. 가장 안전, 가장 느림. 실패하면 나머지 보호.
- Custom: `minimumHealthyHosts` 절댓값 또는 비율로 직접 정의.

**Lambda:**
- `LambdaAllAtOnce`: 즉시 100% 전환 (개발/낮은 위험 환경)
- `LambdaCanary10Percent5Minutes`: 10% → 5분 관찰 → 90% (가장 흔히 사용)
- `LambdaCanary10Percent30Minutes`: 10% → 30분 → 90% (금융권 표준)
- `LambdaLinear10PercentEvery1Minute`: 매 1분마다 10%씩 증가 (총 10분)
- `LambdaLinear10PercentEvery10Minutes`: 매 10분마다 10%씩 (총 100분)

**Canary vs Linear 수학적 차이:**
- Canary: 2단계 (소수% 검증 → 나머지 전부). 검증 기간 동안 "작은 폭발 반경(blast radius)".
- Linear: N단계 점진. 매 단계마다 증분. 문제 발생 시 더 많은 체크포인트.

Canary가 적합한 경우: 빠른 검증이 가능한 워크로드, "Go/No-Go" 판단이 명확한 경우.
Linear가 적합한 경우: 점진적 부하 증가를 관찰해야 하는 경우, 부하 의존적 버그가 의심되는 경우.

> 💡 **관련 이론**: Canary 배포는 탄광의 카나리아(Canary in a coal mine)에서 유래했다. 독성 가스를 먼저 감지하기 위해 카나리아를 소수 노출시키는 것처럼, 전체 트래픽의 소수를 새 버전에 먼저 노출시켜 문제를 조기 감지한다. Google의 SRE Book은 이를 "progressive delivery"라고 부르며, 배포 실패 폭발 반경(blast radius)을 시간에 따라 통제하는 핵심 메커니즘으로 설명한다.

## AppSpec 파일: 플랫폼마다 다른 언어

AppSpec은 배포 절차의 선언문이다. 파일을 어디에 놓고, 어떤 순서로 스크립트를 실행하고, 트래픽을 언제 전환할지를 기술한다. 타깃 플랫폼(EC2, Lambda, ECS)마다 형식이 다르다.

**EC2/On-Premises AppSpec:**
```yaml
version: 0.0
os: linux
files:
  - source: /                         # 아티팩트 루트
    destination: /var/www/myapp       # EC2 대상 경로
permissions:
  - object: /var/www/myapp
    owner: www-data
    mode: '644'
hooks:
  ApplicationStop:          # 1. 구 버전 앱 종료
    - location: scripts/stop.sh
      timeout: 60
  BeforeInstall:            # 2. 설치 전 준비 (디렉토리 생성, 의존성 etc.)
    - location: scripts/before_install.sh
  AfterInstall:             # 3. 설치 후 설정 (퍼미션, 심볼릭 링크)
    - location: scripts/after_install.sh
  ApplicationStart:         # 4. 새 버전 앱 시작
    - location: scripts/start.sh
      timeout: 120
  ValidateService:          # 5. 헬스체크 (실패하면 자동 롤백)
    - location: scripts/health_check.sh
      timeout: 180
```

**Hook 실행 순서 (외워야 함):**
```
ApplicationStop → DownloadBundle → BeforeInstall → Install →
AfterInstall → ApplicationStart → ValidateService
```

> ⚠️ **함정**: 첫 번째 배포에는 `ApplicationStop`이 실행되지 않는다. 이전 버전이 없으므로 "멈출 앱"이 없기 때문이다. 스크립트가 이 상황을 가정하고 작성돼 있지 않으면, 두 번째 배포부터 `ApplicationStop`이 실행될 때 에러가 난다. `stop.sh`는 "앱이 실행 중일 때만 멈춘다"는 idempotent 패턴이어야 한다.

**Lambda AppSpec:**
```yaml
version: 0.0
Resources:
  - myFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: MyLambda
        Alias: live
        CurrentVersion: "1"       # 현재 트래픽 받는 버전
        TargetVersion: "2"        # 배포 목표 버전
Hooks:
  - BeforeAllowTraffic: PreTrafficHookFn    # 트래픽 시프트 전 검증
  - AfterAllowTraffic: PostTrafficHookFn    # 시프트 완료 후 검증
```

**ECS AppSpec:**
```yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: "arn:aws:ecs:...:task-definition/myapp:42"
        LoadBalancerInfo:
          ContainerName: "web"
          ContainerPort: 80
Hooks:
  - BeforeInstall: BeforeInstallHookFn
  - AfterInstall: AfterInstallHookFn
  - AfterAllowTestTraffic: TestTrafficHookFn    # Test Listener 검증 후
  - BeforeAllowTraffic: BeforeProdHookFn
  - AfterAllowTraffic: AfterProdHookFn
```

> 🔍 **더 깊이**: EC2 AppSpec의 `files` 블록은 rsync와 유사한 방식으로 동작한다. `source: /`는 S3 아티팩트 번들의 루트를 의미하고, `destination`은 EC2 내 경로다. `permissions` 블록은 chmod/chown과 동일하다. Lambda/ECS AppSpec에는 `files`가 없다 — Lambda는 코드 자체가 이미 버전화되어 있고, ECS는 Task Definition이 이미지를 포함하기 때문이다. 배포 모델의 차이가 AppSpec 형식의 차이로 드러난다.

## 자동 롤백: 세 가지 트리거

```bash
aws deploy update-deployment-group \
  --application-name MyApp \
  --deployment-group-name prod \
  --auto-rollback-configuration \
    "enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM,DEPLOYMENT_STOP_ON_REQUEST" \
  --alarm-configuration \
    "enabled=true,alarms=[{name=HighErrorRate},{name=HighLatency}]"
```

**롤백 트리거 3가지:**
1. `DEPLOYMENT_FAILURE`: 배포 자체 실패 (Hook exit code 비0, 인스턴스 등록 실패 등)
2. `DEPLOYMENT_STOP_ON_ALARM`: 지정된 CloudWatch Alarm이 ALARM 상태
3. `DEPLOYMENT_STOP_ON_REQUEST`: 사용자/자동화가 배포 중단 요청

**좋은 알람 설계:**
| 알람 메트릭 | CloudWatch 네임스페이스 |
|------------|------------------------|
| 5xx 비율 | `AWS/ApplicationELB` HTTPCode_Target_5XX_Count |
| 응답 시간 p99 | `AWS/ApplicationELB` TargetResponseTime |
| Lambda 에러 | `AWS/Lambda` Errors |
| 비즈니스 지표 | Custom Namespace (주문 성공률, 결제 실패 등) |

알람이 너무 민감하면 정상 배포도 롤백된다(False Positive). 알람이 너무 느슨하면 장애를 못 잡는다. 알람 Threshold와 EvaluationPeriods를 배포 패턴에 맞게 튜닝하는 것이 중요하다.

> 🎯 **시나리오**: "Canary 10% 5분 배포 중 자동 롤백 설계"가 시험에서 자주 나온다. 올바른 설계: (1) CloudWatch Alarm: `Errors > 5 for 2 consecutive 1-minute periods` (너무 민감하지 않게), (2) Deployment Group에 alarm-configuration으로 이 알람 등록, (3) auto-rollback에 `DEPLOYMENT_STOP_ON_ALARM` 추가. Canary 10% 기간(5분) 중 알람이 울리면 자동 롤백 — Alias가 구 Version으로 즉시 복귀.

## EC2 Blue/Green 배포 흐름: 단계별 이해

```
1. CodeDeploy가 새 ASG 생성 (또는 기존 ASG 기반으로 새 인스턴스 N개)
2. 새 인스턴스에 CodeDeploy Agent가 동작하며 새 버전 설치
3. 새 인스턴스가 ELB Target Group(Green)에 등록
4. Health Check 통과 대기
5. 트래픽 시프트 시작 (Canary/Linear/AllAtOnce)
6. [Termination Wait Time 시작 — 기본 1시간, 최대 2일]
   - 이 기간 동안 구 인스턴스(Blue)가 살아있어 즉시 롤백 가능
7. Wait Time 경과 → 구 인스턴스 종료
```

`Termination Wait Time`은 "배포 성공 후 구 환경을 얼마나 보존할 것인가"다. 길게 설정하면 안전망이 되지만 비용이 발생한다(구 인스턴스가 계속 과금됨). 보통 30분~1시간이 표준.

## Lambda Blue/Green의 실제 동작: Alias 가중치 시프트

Lambda Blue/Green은 인스턴스가 없다. 트래픽 시프트는 **Alias의 weighted routing**으로 구현된다.

```bash
# Version 6을 새로 게시
aws lambda publish-version --function-name MyFn
# → Version 6

# Alias "live" 가중치 시프트 (Canary 10%)
aws lambda update-alias \
  --function-name MyFn \
  --name live \
  --function-version 5 \              # Primary (현재 90%)
  --routing-config AdditionalVersionWeights={"6"=0.1}  # Secondary (새 10%)
```

CodeDeploy가 이 API 호출 시퀀스를 자동화하고, 알람 모니터링과 롤백을 함께 처리한다.

```
배포 전: Alias "live" → Version 5: 100%
Canary 10% 시작: Alias "live" → Version 5: 90%, Version 6: 10%
    ↓ 5분 대기, CloudWatch Alarm 모니터링
알람 없음: Alias "live" → Version 6: 100%
알람 발생: Alias "live" → Version 5: 100% (즉시 롤백)
```

한 Alias에 동시에 routing-config로 추가할 수 있는 Version은 단 1개다. "A/B 테스트로 3개 버전 동시 트래픽 분배"는 Alias 단위에서는 불가능하다.

## Pre/Post Traffic Hook: 배포의 자동 검증 게이트

Lambda AppSpec의 `BeforeAllowTraffic`(PreTrafficHook)과 `AfterAllowTraffic`(PostTrafficHook)은 별도의 Lambda 함수로 구현된다.

```python
import boto3

deploy = boto3.client('codedeploy')
fn = boto3.client('lambda')

def handler(event, context):
    deployment_id = event['DeploymentId']
    hook_id = event['LifecycleEventHookExecutionId']
    target_version = event.get('TargetVersion')

    try:
        # 새 Version을 직접 호출해 검증
        result = fn.invoke(
            FunctionName=f'MyFn:{target_version}',
            Payload=b'{"action":"smoke-test"}'
        )
        ok = result['StatusCode'] == 200

        deploy.put_lifecycle_event_hook_execution_status(
            deploymentId=deployment_id,
            lifecycleEventHookExecutionId=hook_id,
            status='Succeeded' if ok else 'Failed'
        )
    except Exception as e:
        deploy.put_lifecycle_event_hook_execution_status(
            deploymentId=deployment_id,
            lifecycleEventHookExecutionId=hook_id,
            status='Failed'
        )
```

Hook Lambda의 IAM Role에 `codedeploy:PutLifecycleEventHookExecutionStatus` 권한이 필수다. 이 권한 없이 Hook이 결과를 보고하지 못하면 CodeDeploy가 Hook을 대기 중으로 처리하다 Timeout으로 배포 실패가 된다.

## GCP Cloud Deploy vs AWS CodeDeploy 비교

| 항목 | AWS CodeDeploy | GCP Cloud Deploy |
|------|--------------|------------------|
| 지원 타깃 | EC2, Lambda, ECS | GKE, Cloud Run, GCE |
| AppSpec 형식 | YAML/JSON | Skaffold 기반 |
| Canary 전략 | 내장 (2단계) | Canary 배포 내장 |
| 자동 롤백 | CloudWatch Alarm 연동 | Cloud Monitoring 연동 |
| Blue/Green | EC2(ASG), Lambda(Alias), ECS(TG) | GKE Service 기반 |
| 승인 게이트 | Manual Approval (CodePipeline) | Approval Gate 내장 |
| 멀티 환경 파이프라인 | CodePipeline으로 조합 | 내장 (stages) |

GCP Cloud Deploy는 멀티 스테이지 파이프라인이 서비스 안에 내장되어 있고, Kubernetes 생태계(Skaffold)와 통합이 자연스럽다. CodeDeploy는 EC2/Lambda/ECS를 포괄하는 넓은 범위를 지원하지만, 멀티 환경 파이프라인은 CodePipeline을 별도로 구성해야 한다.

---

## 📝 연습 문제

**문제 1.** EC2 Blue/Green 배포에서 롤백이 In-place보다 빠른 근본 이유는?

A) EC2 인스턴스가 더 빠르기 때문
B) Blue/Green은 구 인스턴스(Blue)가 Termination Wait Time 동안 살아있어, 롤백이 ALB 트래픽 전환만으로 즉시 가능하기 때문
C) CodeDeploy Agent가 더 최신 버전이기 때문
D) S3 아티팩트가 더 작기 때문

**정답: B**
해설: Blue/Green의 핵심 이점이 즉시 롤백이다. 구 인스턴스(Blue ASG)가 Termination Wait Time 동안 그대로 유지되므로, 문제 발생 시 ALB Target Group 가중치만 Blue로 되돌리면 수초 내 복원된다. In-place는 롤백을 위해 이전 버전 아티팩트를 다시 다운로드하고 설치하는 전체 배포 과정을 반복해야 한다.

---

**문제 2.** Lambda AppSpec에서 `BeforeAllowTraffic` Hook이 "Failed" 상태를 반환하면 어떻게 되는가?

A) 트래픽 시프트를 10%만 진행하고 멈춤
B) 트래픽 시프트 자체가 시작되지 않고 배포가 실패 처리됨, 자동 롤백 설정 시 구 버전 유지
C) Hook을 무시하고 배포를 계속 진행
D) 다음 Hook으로 넘어감

**정답: B**
해설: `BeforeAllowTraffic`은 트래픽 시프트 이전에 실행된다. 이 Hook이 Failed를 반환하면 Alias 가중치 변경이 일어나지 않는다 — 실사용자 트래픽은 여전히 구 버전을 받는 상태로 배포가 종료된다. 자동 롤백이 설정돼 있으면 배포 실패 이벤트로 롤백 처리된다.

---

**문제 3.** EC2 AppSpec에서 Hook 실행 순서로 올바른 것은?

A) BeforeInstall → ApplicationStop → Install → ApplicationStart → ValidateService
B) ApplicationStop → DownloadBundle → BeforeInstall → Install → AfterInstall → ApplicationStart → ValidateService
C) ApplicationStart → ValidateService → BeforeInstall → ApplicationStop
D) Install → BeforeInstall → ApplicationStop → ApplicationStart

**정답: B**
해설: EC2 AppSpec Hook 순서는 반드시 암기해야 하는 시험 빈출 항목이다. Stop → Download → BeforeInstall → Install → AfterInstall → Start → Validate. "내리고, 받고, 준비하고, 설치하고, 정리하고, 올리고, 확인한다"는 논리적 순서다. 첫 배포에는 ApplicationStop이 건너뛰어진다.

---

**문제 4.** Lambda Canary 배포에서 `CodeDeployDefault.LambdaCanary10Percent5Minutes`와 `LambdaLinear10PercentEvery1Minute`의 차이는?

A) Canary는 10% → 5분 후 90%, Linear는 1분마다 10%씩 증가해 10분에 100%
B) 동일하다
C) Canary는 EC2 전용, Linear는 Lambda 전용
D) Canary는 AllAtOnce와 동일

**정답: A**
해설: Canary는 2단계다. 10%를 5분 관찰한 뒤 문제없으면 남은 90%를 즉시 전환한다. Linear는 매 1분마다 10%씩 점진 증가해 10분에 100%에 도달한다. Canary가 적합한 경우: 빠른 Go/No-Go 판단이 가능할 때. Linear가 적합한 경우: 점진적 부하 증가를 관찰해야 할 때.

---

**문제 5.** On-Premises 서버에 CodeDeploy로 Blue/Green 배포를 설정하려 한다. 가능한가?

A) 가능하다, 동일한 방식으로 동작한다
B) 불가능하다. On-Premises는 CodeDeploy In-place만 지원한다
C) VPN 연결이 있으면 가능하다
D) CodeDeploy Agent 최신 버전을 설치하면 가능하다

**정답: B**
해설: On-Premises 인스턴스는 EC2처럼 CodeDeploy가 새 인스턴스를 자동 생성할 수 없다. Blue/Green은 새 환경을 프로비저닝하는 것이 전제인데, 온프레미스 서버는 AWS가 제어하지 않는다. 따라서 On-Premises는 In-place 배포만 지원한다. 이것은 시험에서 매우 자주 나오는 함정 문제다.

---

**문제 6.** EC2 Blue/Green의 Termination Wait Time을 1시간으로 설정한 의미는?

A) 배포 시작까지 1시간 기다린다
B) 트래픽 100% 시프트 완료 후 1시간 동안 구 인스턴스를 보존 — 이 기간에 롤백하면 즉시 구 버전으로 복원 가능
C) Hook 실행에 최대 1시간을 허용한다
D) 알람 모니터링을 1시간 동안 한다

**정답: B**
해설: Termination Wait Time은 "트래픽이 100% 새 버전으로 넘어간 후, 구 인스턴스(Blue)를 몇 시간 동안 살려둘 것인가"다. 이 기간 동안 문제가 발견되면 CodeDeploy 콘솔이나 CLI에서 Stop + Rollback을 실행하면 트래픽이 즉시 구 버전으로 복원된다. 1시간 후에는 구 인스턴스가 자동 종료된다(비용 절감).

---

**문제 7.** "배포 중 5xx가 1% 초과하면 자동 롤백"을 구현하는 가장 적절한 방법은?

A) PreTrafficHook에서 매 분마다 5xx를 체크하는 루프를 실행
B) CloudWatch Alarm(5xx > 1%) 생성 → Deployment Group의 alarm-configuration에 등록 → auto-rollback events에 DEPLOYMENT_STOP_ON_ALARM 포함
C) X-Ray를 활성화하면 자동으로 롤백된다
D) Lambda Destination으로 실패 이벤트를 처리

**정답: B**
해설: CodeDeploy의 자동 롤백은 CloudWatch Alarm과 직접 통합된다. ALB의 `HTTPCode_Target_5XX_Count` 메트릭으로 Alarm을 만들고, Deployment Group에 이 Alarm을 등록하면, 배포 중 Alarm이 ALARM 상태가 되는 순간 CodeDeploy가 자동으로 배포를 중단하고 롤백을 실행한다. PreTrafficHook(A)은 배포 시작 전 1회 검증이라 배포 중 지속 모니터링이 아니다.

---
