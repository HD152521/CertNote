# Day 1 - 자동 대응 파이프라인: EventBridge + SSM Automation + Lambda로 핀딩 자동 교정

인시던트 대응의 성숙도는 *"얼마나 빨리, 일관되게, 사람의 손을 거치지 않고"* 위협을 봉쇄하느냐로 갈린다. GuardDuty가 EC2 인스턴스의 C2(command-and-control) 통신을 탐지하는 데 5분이 걸려도, 그 핀딩을 사람이 콘솔에서 읽고 격리 조치를 취하는 데 30분이 걸린다면 공격자는 이미 측면 이동(lateral movement)을 끝냈을 것이다. 자동 대응 파이프라인(automated remediation pipeline)의 본질은 *탐지 신호를 결정론적 조치로 변환하는 이벤트 구동 자동화*다. 시험 관점의 핵심은 "어떤 이벤트가, 어떤 라우팅을 거쳐, 어떤 실행 엔진으로, 어떤 권한으로 교정되는가"의 흐름을 정확히 그리는 것이다.

이 파이프라인의 표준 골격은 세 부분이다: **신호원(GuardDuty/Security Hub/Config/Inspector)** → **라우터(EventBridge)** → **실행기(SSM Automation 또는 Lambda)**. 각 단계의 책임과 함정이 시험에 반복 출제된다.

## 신호원: 핀딩은 어디서 와서 어떤 모양인가

자동 대응의 트리거는 대부분 보안 서비스가 EventBridge로 내보내는 이벤트다. 신호원마다 이벤트 패턴(event pattern)의 `source`와 `detail-type`이 다르다.

- **GuardDuty**: `source: aws.guardduty`, `detail-type: "GuardDuty Finding"`. `detail.severity`(0~10 스케일), `detail.type`(예: `UnauthorizedAccess:EC2/SSHBruteForce`), `detail.resource`에 영향받은 리소스.
- **Security Hub**: `source: aws.securityhub`, `detail-type: "Security Hub Findings - Imported"`. ASFF(AWS Security Finding Format) 정규화 포맷이라 *여러 신호원을 한 형태로* 받을 수 있다 — 자동화의 단일 진입점으로 선호.
- **AWS Config**: `source: aws.config`, `detail-type: "Config Rules Compliance Change"`. 규정 위반(NON_COMPLIANT) 전이를 트리거.
- **Inspector**: 취약점 핀딩.

```json
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [{ "numeric": [">=", 7] }],
    "type": [{ "prefix": "UnauthorizedAccess:EC2" }]
  }
}
```

위 이벤트 패턴은 *심각도 7 이상이면서 EC2 무단 접근 계열인* 핀딩만 골라낸다. EventBridge 패턴은 `numeric`, `prefix`, `anything-but` 같은 내용 기반 필터링을 지원해 노이즈를 줄인다. 모든 핀딩에 무차별 대응하면 false positive로 정상 워크로드를 격리하는 사고가 난다.

> 💡 **관련 이론**: 이것은 제어 이론의 *피드백 루프(feedback loop)*를 보안에 적용한 것이다. 센서(GuardDuty)가 시스템 상태를 측정하고, 컨트롤러(EventBridge 규칙)가 임계값과 비교해 액추에이터(SSM/Lambda)를 작동시킨다. 산업 제어에서 임계값을 너무 민감하게 잡으면 *hunting*(불필요한 진동)이 일어나듯, 보안 자동화도 임계값(severity)과 조건을 신중히 설정하지 않으면 정상 변동에 과잉 반응한다. 그래서 처음엔 알림만(human-in-the-loop), 신뢰가 쌓이면 자동 교정으로 단계적 전환하는 것이 정석이다.

## 라우터: EventBridge가 이벤트를 어디로 보내는가

EventBridge 규칙은 *패턴에 매칭된 이벤트를 하나 이상의 타깃으로 라우팅*한다. 자동 대응에서 자주 쓰는 타깃:

- **SSM Automation Document(런북)** — 멱등적·다단계 교정. EventBridge가 직접 `StartAutomationExecution`을 호출.
- **Lambda 함수** — 커스텀 로직, API 호출, 조건 분기.
- **Step Functions** — 다단계 워크플로우(승인 게이트, 병렬 조치, 재시도).
- **SNS** — 사람에게 알림(자동화와 병행).

타깃이 SSM/Lambda면 EventBridge에 *해당 액션을 실행할 IAM 역할*을 부여해야 한다. 이 역할의 권한이 곧 자동화가 할 수 있는 일의 범위다 — 최소 권한(least privilege)이 핵심이다.

```yaml
# EventBridge Rule → SSM Automation 타깃 (CloudFormation 발췌)
GuardDutyToIsolation:
  Type: AWS::Events::Rule
  Properties:
    EventPattern:
      source: ["aws.guardduty"]
      detail-type: ["GuardDuty Finding"]
      detail:
        severity: [{ "numeric": [">=", 7] }]
    Targets:
      - Arn: !Sub "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:automation-definition/IsolateInstance"
        RoleArn: !GetAtt EventBridgeSsmRole.Arn
        Id: "isolate-target"
        InputTransformer:
          InputPathsMap:
            instanceId: "$.detail.resource.instanceDetails.instanceId"
          InputTemplate: '{"InstanceId": [<instanceId>]}'
```

`InputTransformer`는 이벤트 JSON에서 필요한 필드(인스턴스 ID)를 뽑아 런북 파라미터로 매핑한다. 이것이 *신호 → 조치 대상*을 연결하는 접점이다.

> ⚠️ **함정**: 크로스 리전·크로스 계정 라우팅. GuardDuty는 리전별 서비스이므로 각 리전에 EventBridge 규칙이 필요하다. 다계정 환경에서는 멤버 계정의 핀딩을 *관리 계정의 이벤트 버스로 전달*하거나, Security Hub로 집계한 뒤 중앙에서 대응하는 패턴을 쓴다. "한 리전에 규칙 하나 만들면 전체가 보호된다"는 오답.

## 실행기 1: SSM Automation 런북

SSM Automation Document는 *여러 AWS API 호출과 스크립트를 정해진 순서로 실행하는 선언적 런북*이다. 자동 대응에 선호되는 이유:

- **멱등성·재시도**: 단계별 `onFailure`, `maxAttempts` 제어.
- **승인 게이트**: `aws:approve` 액션으로 사람의 승인을 중간에 삽입(자동화와 사람 판단의 경계 — Day 4 주제).
- **감사성**: 모든 실행이 SSM 콘솔/CloudTrail에 단계별로 기록.
- **AWS 관리형 런북**: `AWS-DisablePublicAccessForSecurityGroup`, `AWSConfigRemediation-*` 등 즉시 사용 가능한 교정 문서 다수.

```yaml
# 침해 인스턴스 격리 런북 (SSM Automation, 발췌)
schemaVersion: '0.3'
description: "EC2 인스턴스를 격리 보안 그룹으로 교체"
assumeRole: "{{ AutomationAssumeRole }}"
parameters:
  InstanceId: { type: String }
  IsolationSgId: { type: String }
mainSteps:
  - name: snapshotVolumes
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: CreateSnapshot
      VolumeId: "{{ ... }}"
  - name: replaceSecurityGroup
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: ModifyInstanceAttribute
      InstanceId: "{{ InstanceId }}"
      Groups: ["{{ IsolationSgId }}"]
  - name: tagForensic
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: CreateTags
      Resources: ["{{ InstanceId }}"]
      Tags: [{ Key: "Status", Value: "QUARANTINE" }]
```

런북은 *순서가 중요한 다단계 교정*에 적합하다. "먼저 스냅샷(증거 보존) → 그 다음 격리(보안그룹 교체) → 태깅" 순서를 강제한다. 격리를 먼저 하면 인스턴스가 종료되며 휘발성 증거가 사라질 수 있다(Day 2 상세).

## 실행기 2: Lambda

런북으로 표현하기 까다로운 *조건 분기·외부 API·복잡한 로직*은 Lambda가 맡는다. 예: "핀딩 타입에 따라 다른 조치", "Slack/PagerDuty 통합", "여러 계정의 STS 역할을 어셈블해 교차 계정 교정".

```python
import boto3

def handler(event, context):
    finding = event["detail"]
    severity = finding["severity"]
    ftype = finding["type"]

    if severity >= 7 and ftype.startswith("UnauthorizedAccess:IAMUser"):
        # 유출된 액세스 키 비활성화 (Day 3 주제)
        iam = boto3.client("iam")
        key_id = finding["resource"]["accessKeyDetails"]["accessKeyId"]
        user = finding["resource"]["accessKeyDetails"]["userName"]
        iam.update_access_key(
            UserName=user, AccessKeyId=key_id, Status="Inactive"
        )
        return {"action": "key_disabled", "key": key_id}
    return {"action": "noop"}
```

Lambda의 실행 역할 권한이 곧 자동화의 폭발 반경(blast radius)이다. `iam:UpdateAccessKey`만 필요한데 `iam:*`를 부여하면, Lambda 침해 시 권한 상승 경로가 된다.

> 💡 **관련 이론**: SSM Automation vs Lambda 선택은 *선언형(declarative) vs 명령형(imperative)* 자동화 패러다임의 선택이다. 런북은 "무엇을 하라"를 단계로 선언하고 감사·승인·재시도를 플랫폼이 관리한다 — 규정 준수·증거 능력이 중요한 보안 조치에 유리. Lambda는 "어떻게 하라"를 코드로 표현해 유연하지만, 감사·재시도·승인 게이트를 직접 구현해야 한다. 시험의 "best" 답은 *표준 교정 + 감사 필요*면 SSM, *복잡 로직·외부 통합*이면 Lambda로 갈린다.

## 권한 모델: 자동화는 무엇을 할 수 있는가

자동 대응의 보안성은 *실행 역할의 권한 경계*에 달렸다. 두 가지 역할이 등장한다:

1. **EventBridge가 타깃을 호출하는 역할** — `ssm:StartAutomationExecution` 또는 `lambda:InvokeFunction`만.
2. **SSM/Lambda가 실제 교정을 수행하는 역할** — 격리·키 비활성화 등 *실제 변경 권한*.

두 번째 역할이 광범위하면 자동화 파이프라인 자체가 공격 표적이 된다. 모범:
- 역할에 *정확히 필요한 액션*만(예: `ec2:ModifyInstanceAttribute`, `ec2:CreateSnapshot`).
- 리소스·조건으로 범위 제한(`Condition`에 태그 기반 제약).
- CloudTrail로 자동화 역할의 모든 호출 감사.

## 전체 흐름 종합

```
GuardDuty 핀딩(severity≥7)
   │  (EventBridge 이벤트 발행)
   ▼
EventBridge 규칙 (패턴 매칭 + InputTransformer)
   ├──► SNS  → 보안팀 즉시 알림 (사람)
   └──► SSM Automation 런북 (EventBridge 역할로 호출)
            │  (자동화 역할로 실행)
            ├─ 1. 스냅샷 생성 (증거 보존)
            ├─ 2. 격리 SG로 교체 (봉쇄)
            ├─ 3. QUARANTINE 태깅
            └─ 4. Step Functions로 후속(포렌식 EC2 기동 등)
```

핵심 통찰: *알림(사람)과 교정(자동)을 병행*한다. 자동 봉쇄로 시간을 벌고, 사람은 동시에 상황을 파악한다. 완전 자동화가 위험한 고영향 조치(예: 프로덕션 인스턴스 종료)는 `aws:approve` 게이트로 사람의 승인을 받는다.

> 🔍 **더 깊이**: 성숙한 조직은 자동 대응을 *신뢰 등급별로 차등*한다. 명백한 위협(공개된 RDP에 대한 brute force 성공)은 완전 자동 격리, 모호한 신호(비정상 API 호출 패턴)는 알림만, 고영향 조치는 승인 게이트. 이를 "graduated automation"이라 한다. 또한 자동화 자체의 실패에 대비해 *dead-letter queue(DLQ)*를 EventBridge 타깃에 붙여 실패한 이벤트를 보존하고, 자동 교정이 작동하지 않았을 때 사람에게 escalate하는 안전망을 둔다.

## 한 줄 요약 체크리스트

- [ ] 신호원(GuardDuty/Security Hub/Config)의 이벤트 패턴을 severity·type으로 필터링했는가
- [ ] EventBridge InputTransformer로 이벤트에서 대상 리소스를 추출해 런북에 매핑했는가
- [ ] 교정이 표준·다단계·감사 필요면 SSM Automation, 복잡 로직이면 Lambda를 골랐는가
- [ ] EventBridge 호출 역할과 실제 교정 역할을 분리하고 최소 권한으로 제한했는가
- [ ] 자동 교정과 사람 알림(SNS)을 병행하고, 고영향 조치엔 승인 게이트를 뒀는가
- [ ] 다계정·다리전 핀딩을 Security Hub/중앙 버스로 집계해 일관 대응하는가
- [ ] 증거 보존(스냅샷)을 봉쇄(격리)보다 먼저 수행하는가
- [ ] 자동화 실패에 대비한 DLQ·escalation 경로가 있는가

---

## 📝 연습 문제

**문제 1.** GuardDuty가 심각도 8의 EC2 C2 통신 핀딩을 생성할 때만 자동으로 인스턴스를 격리하고, 동시에 보안팀에 알리고 싶다. 가장 적절한 구성은?

A) Lambda를 1분마다 실행해 GuardDuty API를 폴링하고 조건을 검사  
B) EventBridge 규칙(severity≥7 + type 필터)을 두 타깃(SSM Automation 격리 런북 + SNS 알림)에 연결  
C) GuardDuty 콘솔에서 핀딩을 보고 사람이 수동 격리  
D) Config 규칙으로 인스턴스를 평가  

**정답: B**  
해설: EventBridge 규칙은 이벤트 패턴으로 심각도·타입을 필터링하고, 하나의 규칙을 여러 타깃에 라우팅할 수 있다. SSM Automation 런북으로 격리를 자동 실행하고 SNS로 동시에 알림을 보내면 봉쇄와 통보가 병행된다. Lambda 폴링은 지연·비용·중복 처리 문제가 있고, 수동 격리는 자동화가 아니며, Config는 구성 규정 준수용이지 위협 핀딩 트리거가 아니다.

---

**문제 2.** 자동 대응 파이프라인에서 SSM Automation 런북을 Lambda보다 선호하게 되는 결정적 요인은?

A) Lambda보다 항상 더 빠르게 실행되므로  
B) 다단계 교정의 순서 보장, 단계별 재시도, 사람 승인 게이트(aws:approve), CloudTrail 단계별 감사가 플랫폼 제공되므로  
C) Lambda는 AWS API를 호출할 수 없으므로  
D) 런북은 IAM 권한이 필요 없으므로  

**정답: B**  
해설: SSM Automation은 선언적 다단계 런북으로 순서·재시도·승인 게이트·감사 기록을 플랫폼이 관리해, 증거 능력과 규정 준수가 중요한 보안 교정에 유리하다. 실행 속도가 항상 빠른 것은 아니고, Lambda도 당연히 AWS API를 호출하며, 런북 역시 assumeRole로 IAM 권한이 필요하다.

---

**문제 3.** 자동 교정 역할에 `ec2:*`, `iam:*` 같은 광범위 권한을 부여한 설계의 가장 큰 위험은?

A) 비용이 증가한다  
B) 자동화 파이프라인이나 실행기가 침해되면 광범위 권한이 권한 상승·측면 이동 경로가 되어 폭발 반경이 커진다  
C) 런북이 실행되지 않는다  
D) EventBridge 패턴이 매칭되지 않는다  

**정답: B**  
해설: 자동 교정 역할의 권한은 곧 자동화의 폭발 반경이다. 광범위 권한은 파이프라인이 표적이 됐을 때 공격자에게 강력한 권한을 넘겨준다. 정확히 필요한 액션(예: ec2:ModifyInstanceAttribute)만, 태그·리소스 조건으로 범위를 제한하는 최소 권한이 정답이다. 권한 폭은 비용·런북 실행·이벤트 매칭과 직접 관련이 없다.

---

**문제 4.** 침해 인스턴스 격리 런북에서 단계 순서를 설계할 때 모범은?

A) 인스턴스를 즉시 종료한 뒤 스냅샷을 생성  
B) 스냅샷(증거 보존)을 먼저 만든 뒤 격리 보안 그룹으로 교체하고 태깅  
C) 격리만 하고 증거는 보존하지 않음  
D) 태깅만 하고 봉쇄는 사람이 나중에  

**정답: B**  
해설: 휘발성·디스크 증거 보존을 위해 스냅샷을 먼저 생성한 뒤 보안 그룹 교체로 봉쇄하고 태깅하는 순서가 모범이다. 인스턴스를 먼저 종료하면 메모리 등 휘발성 증거가 소실되고, 증거 미보존이나 봉쇄 누락은 포렌식·대응 실패로 이어진다.

---

**문제 5.** 다계정·다리전 환경에서 GuardDuty 핀딩에 일관된 자동 대응을 적용하려 한다. 가장 적절한 접근은?

A) 한 리전에 EventBridge 규칙 하나만 만든다  
B) 멤버 계정 핀딩을 Security Hub로 집계(또는 중앙 이벤트 버스로 전달)하고 각 리전 규칙을 IaC로 일관 배포해 중앙에서 대응  
C) 계정마다 사람이 수동으로 콘솔을 확인  
D) GuardDuty를 끄고 Config만 사용  

**정답: B**  
해설: GuardDuty는 리전별 서비스라 리전마다 규칙이 필요하고, 다계정은 Security Hub 집계나 중앙 이벤트 버스 전달로 단일 대응 지점을 만든 뒤 IaC로 일관 배포하는 것이 정답이다. 한 리전 규칙 하나로는 전체가 보호되지 않고, 수동 확인은 자동화가 아니며, GuardDuty 비활성화는 탐지 자체를 포기하는 것이다.

---
