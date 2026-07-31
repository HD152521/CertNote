# Day 2 - 침해 인스턴스 대응: 격리, 스냅샷·포렌식 보존, 자격증명 회수

EC2 인스턴스가 침해됐다는 신호(GuardDuty의 C2 통신, 암호화폐 채굴, 백도어 탐지)를 받았을 때 대응자의 머릿속에는 두 개의 상충하는 본능이 동시에 작동한다: *"빨리 끄고 싶다(봉쇄)"*와 *"증거를 잃고 싶지 않다(보존)"*. 침해 인스턴스 대응의 본질은 이 둘을 *올바른 순서와 방법으로 양립*시키는 것이다. 무작정 종료하면 메모리·연결 상태 같은 휘발성 증거가 사라지고, 무작정 방치하면 측면 이동과 데이터 유출이 진행된다. 시험은 "어떤 순서로, 어떤 메커니즘으로 격리·보존·회수하는가"를 묻는다.

표준 절차는 NIST IR의 *Containment → Eradication → Recovery* 단계(Day 4 상세)를 EC2에 매핑한 것이다. 오늘은 그 봉쇄·증거 보존·자격증명 회수의 구체적 메커니즘을 다룬다.

## 격리(Containment): 연결을 끊되 인스턴스는 살린다

격리의 목표는 *침해 인스턴스가 더 이상 통신하지 못하게* 하되, *증거 수집을 위해 인스턴스 자체는 실행 상태로 유지*하는 것이다. 종료(terminate)나 중지(stop)는 메모리 등 휘발성 증거를 파괴하므로 격리의 첫 수단이 아니다.

격리 메커니즘 세 가지:

1. **격리 전용 보안 그룹으로 교체** — 가장 깔끔. 모든 인바운드·아웃바운드를 차단하는(또는 포렌식 도구로의 통신만 허용하는) 빈 보안 그룹을 만들어 인스턴스에 부여. `ModifyInstanceAttribute`로 즉시 적용.
2. **NACL로 서브넷 수준 차단** — 인스턴스가 격리 서브넷에 단독이 아니면 같은 서브넷의 정상 인스턴스에도 영향. 인스턴스 단위 격리에는 보안 그룹이 적합.
3. **격리 서브넷으로 ENI 이동** — 라우팅이 없는 서브넷으로. 복잡하지만 강력.

```bash
# 1) 격리 보안 그룹 생성 (규칙 없음 = 모든 통신 차단)
ISO_SG=$(aws ec2 create-security-group \
  --group-name forensic-isolation \
  --description "IR isolation - no traffic" \
  --vpc-id vpc-0abc123 --query GroupId --output text)

# 2) 인스턴스의 보안 그룹을 격리 SG로 교체 (인스턴스는 계속 실행)
aws ec2 modify-instance-attribute \
  --instance-id i-0deadbeef \
  --groups $ISO_SG

# 3) 포렌식 상태로 태깅 (자동화·추적용)
aws ec2 create-tags --resources i-0deadbeef \
  --tags Key=IR-Status,Value=QUARANTINE Key=IR-Case,Value=INC-2026-0042
```

### 격리 방법 비교: 무엇을 언제 쓰는가

세 가지 격리 수단은 대체재가 아니라 *적용 범위와 즉시성*이 다른 도구다. 시험은 "인스턴스 하나만 격리" vs "이미 수립된 세션까지 즉시 차단" vs "다른 워크로드에 영향 없이"의 조건을 바꿔 가며 어느 것을 고를지 묻는다.

| 축 | 격리 SG 교체 | NACL 차단 | 격리 서브넷/ENI 이동 | 라우팅 제거 |
|---|---|---|---|---|
| 적용 단위 | **인스턴스(정확히는 ENI)** | 서브넷 전체 | 인스턴스 | 서브넷 전체 |
| 상태성 | stateful — 기존 연결이 잠시 유지될 수 있음 | **stateless — 양방향 즉시 차단** | 경로 자체가 사라짐 | 경로 자체가 사라짐 |
| 부수 피해 | 없음(대상만) | **같은 서브넷의 정상 인스턴스도 영향** | 없음 | 서브넷 전체 |
| 적용 속도 | 초 단위, API 한 번 | 초 단위 | 상대적으로 느리고 복잡 | 초 단위 |
| SSM 경로 유지 | 규칙으로 선택적 허용 가능 | 규칙으로 선택적 허용 가능 | 엔드포인트 배치에 의존 | 어려움 |
| 되돌리기 | 원래 SG를 다시 지정하면 끝 | 규칙 삭제 | 이동 되돌리기 필요 | 라우트 복원 |
| 대표 상황 | **표준 첫 수단** | 진행 중 C2 세션을 강제로 끊어야 할 때 | 장기 격리·정밀 분석 | 서브넷 단위 오염 의심 |

**기본값은 언제나 격리 SG 교체다.** 부수 피해가 없고, API 한 번으로 되고, 되돌리기가 쉽다(= 가역적 조치라 자동화해도 안전하다). NACL은 *보조 수단*으로, "보안 그룹을 바꿨는데 세션이 안 끊긴다"는 상황에서만 꺼내는 카드다. 이 우선순위를 뒤집은 보기 — 처음부터 NACL로 서브넷을 잠그는 안 — 은 정상 워크로드까지 끊기 때문에 대개 오답이다.

> ⚠️ **함정 — "빈" 보안 그룹은 비어 있지 않다**: `aws ec2 create-security-group`으로 새로 만든 보안 그룹에는 **모든 아웃바운드를 허용하는 규칙이 기본으로 붙는다.** 인바운드만 비어 있을 뿐이다. 이 상태로 침해 인스턴스에 붙이면 인바운드는 막히지만 **아웃바운드 C2 통신과 데이터 유출은 그대로 계속된다** — 격리했다고 믿는 동안 유출이 진행되는, 이 단원에서 가장 위험한 오해다. 반드시 아웃바운드 기본 규칙을 명시적으로 제거해야 한다.

```bash
# 1) 격리 SG 생성
ISO_SG=$(aws ec2 create-security-group \
  --group-name forensic-isolation \
  --description "IR isolation - deny all" \
  --vpc-id vpc-0abc123 --query GroupId --output text)

# 2) ★ 반드시 기본 아웃바운드 허용 규칙을 제거한다 (이 줄이 없으면 격리가 아니다)
aws ec2 revoke-security-group-egress \
  --group-id $ISO_SG \
  --ip-permissions 'IpProtocol=-1,IpRanges=[{CidrIp=0.0.0.0/0}]'

# 3) (선택) 조사 경로만 되살린다 — SSM VPC 엔드포인트로의 443만 허용
aws ec2 authorize-security-group-egress --group-id $ISO_SG --ip-permissions \
  'IpProtocol=tcp,FromPort=443,ToPort=443,PrefixListIds=[{PrefixListId=pl-ssm-endpoints}]'

# 4) 인스턴스의 보안 그룹을 격리 SG로 교체 (인스턴스는 계속 실행)
aws ec2 modify-instance-attribute --instance-id i-0deadbeef --groups $ISO_SG

# 5) ENI가 여러 개면 ENI 단위로도 교체해야 한다 — 부 ENI가 남으면 통로가 남는다
aws ec2 describe-instances --instance-ids i-0deadbeef \
  --query 'Reservations[].Instances[].NetworkInterfaces[].NetworkInterfaceId'
aws ec2 modify-network-interface-attribute \
  --network-interface-id eni-0secondary --groups $ISO_SG
```

5번이 실무에서 자주 빠지는 단계다. `modify-instance-attribute --groups`는 인스턴스의 **기본 ENI**에 적용된다. 부 ENI가 붙어 있는 인스턴스(멀티홈 어플라이언스, 컨테이너 호스트 등)는 ENI마다 따로 교체하지 않으면 격리에 구멍이 남는다.

기존 세션까지 확실히 끊어야 한다면 NACL을 겹친다. NACL은 번호 순으로 평가되고 낮은 번호가 이긴다는 점, 그리고 **인바운드·아웃바운드를 각각 명시해야 한다**는 점이 핵심이다.

```bash
# 격리 서브넷 전용 NACL: 특정 IP만 명시적 Deny (양방향)
aws ec2 create-network-acl-entry --network-acl-id acl-0iso \
  --rule-number 10 --protocol -1 --rule-action deny --egress \
  --cidr-block 203.0.113.0/24
aws ec2 create-network-acl-entry --network-acl-id acl-0iso \
  --rule-number 10 --protocol -1 --rule-action deny --ingress \
  --cidr-block 203.0.113.0/24
```

> ⚠️ **함정 — 인스턴스가 Auto Scaling 그룹이나 로드밸런서에 속해 있을 때**: 격리 SG로 교체하면 헬스 체크가 실패한다. 그러면 **ASG가 인스턴스를 비정상으로 판정해 스스로 종료하고 새 인스턴스를 띄운다** — 대응자가 손도 대기 전에 증거가 사라진다. 그래서 침해 인스턴스 대응의 실질적 0단계는 *ASG·타깃 그룹에서 인스턴스를 떼어 내는 것*이다. `detach-instances`로 그룹에서 분리하되 `--no-should-decrement-desired-capacity`를 주면 ASG가 대체 인스턴스를 즉시 띄워 서비스 용량도 유지된다. 즉 **증거 보존과 서비스 연속성이 이 한 줄에서 동시에 해결된다.**

```bash
# 0단계: 조사 대상을 ASG의 자동 종료 대상에서 빼고, 용량은 유지한다
aws autoscaling detach-instances \
  --instance-ids i-0deadbeef \
  --auto-scaling-group-name app-asg \
  --no-should-decrement-desired-capacity

# 로드밸런서 타깃 그룹에서도 등록 해제 (사용자 트래픽 유입 차단)
aws elbv2 deregister-targets \
  --target-group-arn arn:aws:elasticloadbalancing:...:targetgroup/app-tg/abc \
  --targets Id=i-0deadbeef
```

`--no-should-decrement-desired-capacity`와 `--should-decrement-desired-capacity`의 차이를 묻는 보기가 나오면, **조사 중 서비스 용량을 유지하려면 감소시키지 않는 쪽**이 정답이다.

### 격리 후에도 조사 통로는 남겨야 한다

완전 차단은 깔끔하지만, 그 순간부터 메모리 덤프도 명령 실행도 불가능해진다. Systems Manager Agent는 `ssm`·`ssmmessages`·`ec2messages` 엔드포인트로 **아웃바운드 443**을 열어야 동작하는데, 격리 SG가 아웃바운드를 전부 막으면 Session Manager와 Run Command가 함께 끊긴다.

해법은 **인터넷 경로는 끊고 조사 경로만 VPC 인터페이스 엔드포인트(PrivateLink)로 남기는 것**이다.

```
         ┌──────────────── 격리된 인스턴스 (i-0deadbeef) ────────────────┐
         │  격리 SG: 인바운드 없음 / 아웃바운드 = SSM 엔드포인트 443 만    │
         └───────────────┬───────────────────────────────┬──────────────┘
                         │ 차단                          │ 허용
                         ▼                               ▼
                  인터넷 / NAT GW                VPC 인터페이스 엔드포인트
                  (C2·유출 경로)                  com.amazonaws.<region>.ssm
                        ✗                          ...ssmmessages
                                                   ...ec2messages
                                                          │
                                                          ▼
                                          SSM Run Command → 메모리 덤프 → S3(Object Lock)
```

이 구조가 **"격리하면 조사도 못 한다"는 딜레마의 표준 해답**이며, 준비(Preparation) 단계에서 미리 만들어 둬야 하는 인프라다. 사고가 난 뒤에 엔드포인트를 만들면 그 사이의 시간이 그대로 유출 시간이 된다.

> ⚠️ **함정 — 보안 그룹의 stateful 특성**: 보안 그룹은 stateful이라 *이미 수립된(established) 연결*은 보안 그룹을 교체해도 한동안 유지될 수 있다. 진행 중인 C2 세션을 즉시 끊으려면 NACL(stateless, 양방향 명시적 차단)을 보조로 쓰거나, 인스턴스의 ENI를 분리/재연결한다. "보안 그룹만 바꾸면 즉시 모든 연결이 끊긴다"는 오답.

> 💡 **관련 이론**: 격리는 디지털 포렌식의 *order of volatility(휘발성 순서)* 원칙과 충돌하지 않게 설계해야 한다. RFC 3227은 증거를 *가장 휘발성 높은 것부터*(CPU 레지스터·캐시 → RAM → 네트워크 상태 → 디스크 → 백업) 수집하라고 권한다. 인스턴스를 종료하면 RAM·네트워크 상태가 즉시 소실되므로, *실행 상태를 유지한 채 네트워크만 격리*하는 것이 휘발성 증거 보존과 봉쇄를 양립시키는 핵심이다.

## IMDS·자격증명 회수: 인스턴스가 가진 권한을 무력화

EC2 인스턴스 침해의 가장 위험한 측면은 *인스턴스 프로파일(instance profile)*을 통해 발급된 임시 자격증명이다. 공격자가 IMDS(Instance Metadata Service)에서 STS 임시 키를 탈취하면, 그 키로 *인스턴스 밖에서도* 역할 권한을 행사할 수 있다. 따라서 격리만으로는 부족하다 — *발급된 자격증명 자체를 회수*해야 한다.

임시 자격증명은 폐기(revoke) API가 따로 없다. 대신 *역할 신뢰 정책 또는 권한 정책에 시점 기반 거부(deny by date)*를 추가해 무력화한다.

```json
// 역할에 인라인 정책 추가: 특정 시점 이전 발급 토큰 전부 거부
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Action": "*",
    "Resource": "*",
    "Condition": {
      "DateLessThan": { "aws:TokenIssueTime": "2026-06-24T10:00:00Z" }
    }
  }]
}
```

이것이 IAM 콘솔의 "Revoke active sessions" 버튼이 하는 일이다 — `aws:TokenIssueTime`이 지정 시점 이전인 모든 임시 자격증명을 즉시 무효화한다. 새 자격증명은 인스턴스가 격리·교체되면 더 발급되지 않는다.

> 💡 **관련 이론**: STS 임시 자격증명은 *발급 후 독립적으로 존재*하는 bearer token이다. 인스턴스를 격리해도 이미 IMDS에서 빠져나간 키는 인터넷 어디서든 만료 시점까지 유효하다. 이 "탈취된 토큰은 인스턴스와 분리되어 산다"는 성질이 IMDSv2(세션 지향·hop limit·PUT 토큰)가 SSRF를 통한 자격증명 탈취를 어렵게 만든 이유이며, 침해 시 *세션 폐기(revoke)*가 격리와 별개로 반드시 필요한 이유다.

세션 폐기 정책은 *역할에 붙이는 인라인 정책*이라는 점이 중요하다. 신뢰 정책이 아니라 권한 정책이며, 조건이 참인 모든 호출을 거부한다.

```bash
# 인스턴스 역할의 기존 세션 전부 폐기 (콘솔의 "Revoke active sessions"와 동일)
aws iam put-role-policy \
  --role-name app-instance-role \
  --policy-name AWSRevokeOlderSessions \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Deny", "Action": "*", "Resource": "*",
      "Condition": { "DateLessThan": { "aws:TokenIssueTime": "2026-06-24T10:00:00Z" } }
    }]
  }'

# 새 세션 발급 자체를 막아야 한다면 신뢰 정책을 좁힌다(역할은 유지)
aws iam update-assume-role-policy --role-name app-instance-role \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Deny", "Principal": { "Service": "ec2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }'

# 또는 인스턴스에서 프로파일을 분리해 IMDS 자격증명 공급 자체를 끊는다
aws ec2 describe-iam-instance-profile-associations \
  --filters Name=instance-id,Values=i-0deadbeef
aws ec2 disassociate-iam-instance-profile --association-id iip-assoc-0abc123
```

세 가지 조치의 효과가 각각 다르다는 점이 시험 포인트다.

| 조치 | 이미 유출된 토큰 | 새 토큰 발급 | 부수 영향 |
|---|---|---|---|
| `aws:TokenIssueTime` Deny | **즉시 무효화** | 여전히 발급됨(새 토큰은 조건에 안 걸림) | 같은 역할을 쓰는 다른 인스턴스의 기존 세션도 함께 끊김 |
| 신뢰 정책 축소·비우기 | 그대로 유효 | **차단** | 같은 역할을 쓰는 모든 워크로드가 자격증명을 못 받음 |
| 인스턴스 프로파일 분리 | 그대로 유효 | **해당 인스턴스만 차단** | 대상 인스턴스에 한정 — 부수 피해 최소 |

**완전한 회수는 "기존 무효화 + 신규 차단"의 조합이다.** 하나만 하면 반쪽이다. 그리고 세 번째 행이 실무적으로 가장 유용하다 — 역할을 여러 인스턴스가 공유할 때, 프로파일 분리는 침해된 한 대만 정확히 끊는다. 보기에서 "다른 정상 워크로드에 영향을 최소화하면서"라는 단서가 붙으면 이 축을 보라.

> 🔍 **더 깊이**: GuardDuty에는 인스턴스 역할 자격증명이 *그 인스턴스가 아닌 곳에서 사용될 때* 발화하는 핀딩 계열이 있다(`UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration` 계열). 이것이 강력한 이유는 탐지 원리에 있다 — GuardDuty는 STS 자격증명이 발급된 인스턴스의 네트워크 정체성과 실제 API 호출의 출처를 비교한다. 즉 **자격증명이 인스턴스 밖으로 나갔다는 사실 자체**를 신호로 삼는다. 실무 의미는 두 가지다. 첫째, 이 핀딩이 뜨면 "인스턴스 격리만으로는 절대 부족하다"는 확정 신호이므로 세션 폐기가 즉시 따라와야 한다. 둘째, IMDSv2를 `http-tokens required`로 강제하고 `http-put-response-hop-limit 1`로 두면 컨테이너·프록시를 통한 SSRF 경유 탈취가 크게 어려워진다 — 이 설정은 대응이 아니라 *준비* 단계의 항목이며, 조직 전역에 Config 규칙과 SCP로 강제하는 것이 표준이다.

```bash
# 침해 대응 중에도, 그리고 평시 베이스라인으로도 걸어 두는 설정
aws ec2 modify-instance-metadata-options --instance-id i-0deadbeef \
  --http-tokens required --http-put-response-hop-limit 1 --http-endpoint enabled
```

## 증거 보존: 스냅샷과 메모리

봉쇄·자격증명 회수와 *병행*해 증거를 보존한다. 두 종류:

- **디스크 증거 — EBS 스냅샷**: 침해 인스턴스의 모든 EBS 볼륨을 `CreateSnapshot`(또는 멀티볼륨 일관 스냅샷 `CreateSnapshots`)으로 보존. 스냅샷에 케이스 번호 태깅. 스냅샷은 *불변 증거*이므로 별도 포렌식 계정으로 공유·복사해 원본 계정 침해 시에도 보존되게 한다.
- **메모리 증거 — 휘발성 덤프**: SSM Run Command로 메모리 캡처 도구(LiME, AVML 등)를 실행해 RAM 덤프를 S3로 업로드. 인스턴스가 실행 중일 때만 가능 — 그래서 격리는 종료가 아니라 *네트워크 차단*이어야 한다.

```bash
# 멀티볼륨 일관 스냅샷 + 증거 태깅
aws ec2 create-snapshots \
  --instance-specification InstanceId=i-0deadbeef,ExcludeBootVolume=false \
  --description "Forensic image INC-2026-0042" \
  --tag-specifications 'ResourceType=snapshot,Tags=[{Key=IR-Case,Value=INC-2026-0042},{Key=Evidence,Value=true}]'

# 메모리 덤프를 SSM Run Command로 (인스턴스 격리 후에도 SSM 경로 유지 시)
aws ssm send-command \
  --instance-ids i-0deadbeef \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["avml /tmp/mem.lime","aws s3 cp /tmp/mem.lime s3://forensic-bucket/INC-2026-0042/"]'
```

> ⚠️ **함정 — 증거 보존의 무결성(chain of custody)**: 증거 스냅샷·덤프는 *읽기 전용·변경 불가*로 다뤄야 법적 효력이 있다. 스냅샷을 별도 포렌식 계정으로 공유하고, S3 버킷에 Object Lock(WORM)을 걸며, 모든 접근을 CloudTrail로 기록한다. "스냅샷을 원본 계정에만 두고 누구나 삭제 가능"하면 증거 능력이 깨진다.

### 증거를 포렌식 계정으로 옮기는 실제 절차

"별도 계정에 보존한다"는 원칙은 쉽지만, 암호화가 끼면 한 단계가 더 붙는다. **AWS 관리형 키(`aws/ebs`)로 암호화된 스냅샷은 다른 계정과 공유할 수 없다.** 고객 관리형 KMS 키로 다시 암호화한 사본을 만들어야 하고, 그 키를 포렌식 계정이 쓸 수 있게 키 정책으로 허용해야 한다. 이 제약을 모르면 대응 한복판에서 막힌다.

```bash
# 1) (필요 시) 고객 관리형 키로 재암호화한 사본 생성
aws ec2 copy-snapshot \
  --source-region ap-northeast-2 --source-snapshot-id snap-0original \
  --encrypted --kms-key-id arn:aws:kms:ap-northeast-2:111122223333:key/forensic-cmk \
  --description "Forensic copy INC-2026-0042"

# 2) 포렌식 계정에 스냅샷 사용 권한 부여
aws ec2 modify-snapshot-attribute \
  --snapshot-id snap-0forensiccopy \
  --attribute createVolumePermission --operation-type add \
  --user-ids 444455556666

# 3) 증거 버킷에 Object Lock (버전 관리 선행 필수)
aws s3api put-object-lock-configuration --bucket forensic-evidence-bucket \
  --object-lock-configuration '{
    "ObjectLockEnabled":"Enabled",
    "Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Years":7}}}'
```

```json
// 포렌식 CMK의 키 정책: 포렌식 계정에 "복호화해 볼 권한"만 준다
{
  "Sid": "AllowForensicAccountUse",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::444455556666:role/ForensicAnalystRole" },
  "Action": ["kms:Decrypt", "kms:DescribeKey", "kms:CreateGrant", "kms:ReEncryptFrom"],
  "Resource": "*",
  "Condition": {
    "StringEquals": { "kms:ViaService": "ec2.ap-northeast-2.amazonaws.com" }
  }
}
```

Object Lock의 `COMPLIANCE` 모드는 **루트 사용자조차 보존 기간 내 삭제할 수 없다**는 점에서 증거 보관의 최종 방어선이다. `GOVERNANCE` 모드는 특별 권한을 가진 주체가 해제할 수 있어 편리하지만, 법정에서 "누군가는 지울 수 있었다"는 반박 여지를 남긴다. 시험에서 *법적 증거 능력*이나 *규제 요건*이 언급되면 COMPLIANCE 쪽이 정답이다.

```
              [ 워크로드 계정 111122223333 ]
                        │
         침해 인스턴스 i-0deadbeef (격리 SG, 실행 유지)
                        │
        ┌───────────────┼────────────────────────┐
        ▼               ▼                        ▼
  EBS 멀티볼륨      메모리 덤프              CloudTrail·VPC Flow Logs
  스냅샷            (SSM Run Command)        (이미 중앙 로그 계정으로 전달됨)
        │               │
        │ copy-snapshot │ s3 cp
        │ (포렌식 CMK)   │
        ▼               ▼
   ═══════════ 계정 경계 ═══════════════════════════════
        ▼               ▼
              [ 포렌식 계정 444455556666 ]
        │                         │
  스냅샷 → 새 EBS 볼륨       증거 S3 버킷
        │  (read-only 마운트)   (Object Lock COMPLIANCE)
        ▼                         │
  분석용 EC2 (도구 사전 탑재 AMI)  │
   · 인터넷 없는 격리 VPC          │
   · 별도 SCP로 외부 공유 금지      ▼
   · 모든 접근이 CloudTrail에 기록 ─┘

원본 계정이 완전히 침해되어도 증거는 계정 경계 너머에 남는다 ← 이것이 분리의 유일한 이유
```

이 그림의 마지막 줄이 포렌식 계정 분리의 본질이다. 공격자가 워크로드 계정의 관리 권한을 가졌다면 그 계정 안의 스냅샷·로그는 *언제든 지워질 수 있는 것*이다. Code Spaces가 백업까지 잃은 이유가 정확히 이것이었다. **증거의 무결성은 암호화가 아니라 소유 경계가 만든다.**

> 🔍 **더 깊이**: 디스크 이미지를 분석에 붙이는 방법은 두 갈래이고 증거 능력이 다르다. ① *스냅샷 → 새 볼륨 → 읽기 전용 마운트*: AWS가 관리하는 복제라 원본이 변형되지 않고, 여러 분석가가 각자 사본으로 작업할 수 있다. 표준 경로다. ② *침해 인스턴스의 볼륨을 분리해 분석 인스턴스에 직접 연결*: 루트 볼륨을 분리하려면 인스턴스를 중지해야 하므로 **휘발성 증거를 파괴한다** — 실행 중 대응에서는 사실상 금지다. 한편 마운트 시점에도 함정이 있다. 리눅스에서 저널링 파일 시스템을 그냥 마운트하면 커널이 저널을 재생(replay)하며 **파일 시스템에 쓰기가 발생**해 해시가 달라진다. 그래서 실무 포렌식은 `ro,noload` 같은 옵션이나 별도의 쓰기 차단 장치를 쓰고, *마운트 전에* 이미지 해시를 계산해 기록으로 남긴다. AWS에서는 "스냅샷 ID + 생성 시각 + CloudTrail 기록"이 사실상 이 역할을 하지만, 규제 산업이라면 해시 기록을 별도로 남기는 절차를 런북에 넣는다.

## 포렌식 분석 환경: 격리된 곳에서 본다

보존한 스냅샷을 *분석용 포렌식 EC2*에 볼륨으로 연결해 조사한다. 분석 환경 원칙:

- **별도 격리 VPC/계정**: 분석 인스턴스가 다시 침해되지 않게, 또 분석 행위가 프로덕션에 영향 없게.
- **스냅샷 → 새 볼륨 → read-only 마운트**: 원본 변경 방지.
- **분석 도구 사전 탑재 AMI**: 침해 후 도구를 설치하느라 시간 낭비하지 않게.

```
침해 인스턴스 (i-0deadbeef, 격리 SG)
   ├─ [병행] EBS 멀티볼륨 스냅샷 ──► 포렌식 계정으로 공유
   ├─ [병행] 메모리 덤프(SSM) ──► S3(Object Lock) 
   ├─ [병행] 인스턴스 역할 세션 폐기(aws:TokenIssueTime deny)
   ▼
포렌식 계정 / 격리 VPC
   └─ 스냅샷 → 새 볼륨 → 포렌식 AMI에 read-only 마운트 → 분석
```

## 전체 런북 순서

침해 EC2 대응의 정석 순서를 한 흐름으로:

```
1. 식별·분류    : GuardDuty 핀딩 확인, 영향 범위·심각도 판단, 케이스 생성
2. 증거 보존    : EBS 멀티볼륨 스냅샷 + 메모리 덤프(인스턴스 실행 중)
3. 봉쇄(격리)   : 격리 SG로 교체 (필요 시 NACL/ENI로 established 연결 차단)
4. 자격증명 회수 : 인스턴스 역할 세션 폐기(TokenIssueTime deny), 키 노출 시 회전
5. 근절·복구    : 침해 벡터 제거, 패치된 골든 AMI로 재배포, 인스턴스 종료
6. 사후         : 스냅샷·로그로 근본 원인 분석, 런북·통제 개선
```

핵심: **증거 보존(2)이 봉쇄(3)보다, 또는 적어도 종료보다 앞선다.** 격리는 종료가 아니므로 보존과 양립한다. 자동화로 이 순서를 SSM 런북에 고정하면 대응자가 압박 속에서도 순서를 틀리지 않는다(Day 1 자동 파이프라인과 연결).

> 🔍 **더 깊이**: 성숙한 조직은 침해 EC2 대응을 *완전 자동화 런북*으로 구현해, GuardDuty 핀딩 → EventBridge → SSM Automation이 스냅샷·격리·세션 폐기·태깅·포렌식 인스턴스 기동까지 수 초 내 수행한다. 사람은 그 결과를 검토하고 근절·복구를 판단한다. 다만 *프로덕션 영향이 큰 인스턴스*는 자동 격리가 서비스 중단을 일으킬 수 있어, 핀딩 신뢰도·태그(예: `Environment=prod`)에 따라 자동 vs 승인 게이트를 차등하는 graduated automation이 권장된다.

### 순서를 세분화한 실행 플레이북과 그 근거

시험은 "가장 먼저 무엇을 하는가"를 반복해 묻는다. 아래는 위 6단계를 실제 조작 단위로 쪼개고, **각 단계가 왜 그 자리에 있는지**를 붙인 것이다. 근거를 외우면 순서를 외울 필요가 없어진다.

```
① ASG·타깃 그룹에서 분리          → 안 하면 헬스체크 실패로 ASG가 인스턴스를 종료한다.
                                    대응자가 조작하기 전에 증거가 사라지는 유일한 경로.
② 삭제 방지·태깅                   → i-xxx에 IR-Case 태그, 종료 방지(disable-api-termination).
                                    이후 모든 자동화·조회의 기준점이자 실수 방지 장치.
③ 메모리 덤프                      → RAM은 가장 휘발성이 높다. 격리로 SSM 경로가 흔들리기 전에,
                                    그리고 인스턴스가 살아 있는 동안에만 가능하다.
④ EBS 멀티볼륨 스냅샷              → 디스크는 메모리보다 덜 휘발적이라 뒤. 다만 봉쇄보다는 앞에 두는
                                    편이 안전하다 — 격리 후 공격자가 원격 와이프를 실행할 수 있다.
⑤ 격리 SG로 교체(아웃바운드 제거 확인) → 여기서 비로소 통신이 끊긴다. 부 ENI까지 교체했는지 확인.
⑥ 필요 시 NACL 보조                → SG는 stateful이라 기존 C2 세션이 남을 수 있다. 확인 후에만 추가.
⑦ 인스턴스 프로파일 분리            → IMDS에서 새 자격증명이 더 나오지 않게 한다.
⑧ 역할 세션 폐기(TokenIssueTime)    → 이미 밖으로 나간 토큰을 무효화한다. ⑦과 ⑧은 한 쌍이다.
⑨ 범위 확정(CloudTrail·Flow Logs)   → 그 자격증명·그 IP가 무엇을 했는지 전수 조사. 여기서 사고의
                                    실제 크기가 정해진다. 이 단계 전에 복구를 시작하면 안 된다.
⑩ 근절·복구                        → 패치된 골든 AMI 재배포. 침해 인스턴스 종료는 증거 확보가
                                    끝났음을 확인한 뒤, 그리고 승인 게이트를 거쳐서.
⑪ 사후                            → 타임라인 재구성, 런북 개선, 통제 추가.
```

세 개의 경계선만 기억하면 어떤 변형 문제도 풀린다. **㉠ 증거는 봉쇄보다 앞이다**(단, 격리는 종료가 아니므로 둘은 대부분 병행 가능하다). **㉡ 자격증명 회수는 네트워크 격리와 별개로 반드시 따로 한다**. **㉢ 종료·삭제 같은 비가역 조치는 범위 확정 이후, 그리고 마지막이다.**

```bash
# ② 종료 방지 — 대응 중 누군가의 실수나 자동화 오작동을 구조적으로 막는다
aws ec2 modify-instance-attribute --instance-id i-0deadbeef --disable-api-termination
aws ec2 create-tags --resources i-0deadbeef \
  --tags Key=IR-Status,Value=QUARANTINE Key=IR-Case,Value=INC-2026-0042

# ⑨ 범위 확정 — 인스턴스 역할 세션이 한 일을 시간순으로
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=app-instance-role \
  --start-time 2026-06-20T00:00:00Z --max-results 50
```

> 📚 **사례**: 2019년 공개된 **Capital One 침해**는 이 단원의 모든 개념이 한 줄로 꿰이는 사건이다. 공격자는 잘못 구성된 웹 방화벽을 통해 **SSRF**를 성립시켰고, 그 경로로 EC2의 **인스턴스 메타데이터 서비스(IMDS)**에 접근해 인스턴스 역할의 임시 자격증명을 획득했다. 그 자격증명으로 S3의 데이터를 대량으로 조회·유출했다. 회사가 사실을 알게 된 계기는 자체 탐지가 아니라 **외부인의 제보**였고, 실제 유출과 인지 사이에는 상당한 시간 간격이 있었다. 여기서 뽑을 교훈은 네 가지다. ① 침해의 실질은 서버 장악이 아니라 **자격증명 탈취**였다 — 인스턴스를 격리해도 이미 나간 토큰은 계속 유효했을 것이다(그래서 세션 폐기가 별도 단계다). ② IMDSv2 강제와 hop limit 축소는 이 경로를 직접 겨냥한 통제다. ③ 데이터 접근 자체는 *정상 권한으로 이뤄진 정상 API 호출*처럼 보였다 — 권한이 과도하면 탐지가 어려워진다는 최소 권한의 실전적 근거다. ④ 탐지가 외부에서 왔다는 사실이 곧 Day 1의 자동 탐지·대응 루프가 필요한 이유다. 세부 수치나 내부 대응 절차는 공개 정보에 따라 서술이 갈리므로, 시험 준비에는 **SSRF → IMDS → 역할 자격증명 → 데이터 유출**이라는 연쇄만 정확히 기억하면 충분하다.

> 🎯 **시나리오**: 새벽 2시, GuardDuty가 프로덕션 웹 계층 인스턴스 한 대에서 `CryptoCurrency:EC2/BitcoinTool.B!DNS` 계열 핀딩을 올렸다. 그 인스턴스는 Auto Scaling 그룹에 속해 있고 ALB 타깃 그룹에 등록돼 있으며, 인스턴스 역할은 S3 읽기 권한을 갖고 있다. 대응자가 콘솔에 접속해 가장 먼저 눌러야 할 것은 무엇인가. → **인스턴스 종료도, 격리 SG 교체도 아니다.** 첫 조치는 ASG에서 인스턴스를 분리(`detach-instances --no-should-decrement-desired-capacity`)하고 타깃 그룹에서 등록 해제하는 것이다. 이유는 단순하다 — 격리 SG를 먼저 붙이면 그 순간부터 헬스 체크가 실패하고, ASG가 "비정상 인스턴스"로 판정해 **스스로 종료**한다. 증거를 지키려던 조치가 증거를 없애는 방아쇠가 되는 것이다. 분리한 뒤에야 ② 종료 방지·태깅 → ③ 메모리 덤프 → ④ 스냅샷 → ⑤ 격리 SG → ⑦⑧ 프로파일 분리와 세션 폐기 순으로 진행한다. 그리고 채굴 핀딩이라면 **역할이 S3에 무엇을 했는지**를 CloudTrail로 반드시 확인해야 한다 — 채굴은 눈에 띄는 소음이고, 같은 자격증명으로 조용히 이뤄진 데이터 접근이 진짜 피해인 경우가 많다.

> ⚠️ **함정**: 대응 도중 자주 나오는 세 가지 자충수. ① **인스턴스를 stop한다** — 중지는 종료보다 안전해 보이지만 RAM은 똑같이 사라지고, 인스턴스 스토어 볼륨이 있다면 그 데이터도 함께 사라진다. ② **키 페어를 지우거나 비밀번호를 바꿔 "접근을 막는다"** — 공격자는 이미 자기 통로(백도어·크론·서비스)를 심어 두었고, 이 조치는 아무것도 막지 못하면서 *대응이 시작됐다는 신호*만 준다. 공격자가 그 신호를 받으면 증거를 지우거나 더 깊이 숨는다. ③ **격리 후 곧바로 스냅샷에서 새 인스턴스를 띄워 서비스를 복구한다** — 근본 원인을 모르는 상태에서 이미지를 재사용하면 백도어까지 함께 복원된다. 복구는 언제나 *패치된 골든 이미지*에서 출발해야지 침해 이미지에서 출발하면 안 된다.

## 함정 정리

- 새로 만든 보안 그룹에는 **아웃바운드 전체 허용 규칙이 기본으로 붙는다** — 제거하지 않으면 격리가 아니다.
- 부 ENI가 있는 인스턴스는 ENI마다 SG를 교체해야 한다 — `modify-instance-attribute`는 기본 ENI만 바꾼다.
- ASG·타깃 그룹에서 먼저 떼어 내지 않으면 헬스 체크 실패로 ASG가 인스턴스를 종료해 증거가 사라진다.
- 보안 그룹은 stateful이라 기존 C2 세션이 잠시 유지될 수 있다 — 필요하면 NACL·ENI로 보조한다.
- 서브넷 단위 NACL 차단을 첫 수단으로 쓰면 같은 서브넷의 정상 인스턴스까지 끊긴다.
- 아웃바운드를 전부 막으면 SSM Agent 경로도 끊겨 메모리 덤프가 불가능해진다 — VPC 엔드포인트로 조사 경로를 남긴다.
- 인스턴스 격리와 자격증명 회수는 **별개의 조치**다 — 유출된 STS 토큰은 인스턴스 밖에서 만료까지 유효하다.
- `TokenIssueTime` Deny는 *기존 세션*만 끊는다 — 신규 발급 차단은 프로파일 분리나 신뢰 정책 축소가 필요하다.
- AWS 관리형 키로 암호화된 스냅샷은 **다른 계정과 공유할 수 없다** — 고객 관리형 CMK로 복사해야 한다.
- 증거를 원본 계정에만 두면 계정이 완전히 침해됐을 때 함께 사라진다.
- Object Lock은 버전 관리가 켜져 있어야 설정할 수 있고, 법적 증거 능력은 COMPLIANCE 모드가 강하다.
- 루트 볼륨을 분리해 분석하려면 인스턴스를 중지해야 하므로 휘발성 증거가 파괴된다 — 스냅샷 경로를 쓴다.
- 침해 이미지에서 복구하면 백도어까지 복원된다 — 복구는 패치된 골든 AMI에서 출발한다.
- 키 페어 삭제·비밀번호 변경 같은 조치는 공격자에게 대응 개시 신호만 주고 실효가 없다.

## 한 줄 요약 체크리스트

- [ ] 종료가 아니라 격리(네트워크 차단)로 휘발성 증거를 보존하며 봉쇄했는가
- [ ] 격리 전에 ASG·타깃 그룹에서 분리해 자동 종료로 증거가 사라지는 것을 막았는가
- [ ] 격리 SG의 **기본 아웃바운드 허용 규칙을 제거**하고 부 ENI까지 교체했는가
- [ ] 조사 경로(SSM VPC 엔드포인트)를 남겨 격리 후에도 메모리 덤프가 가능한가
- [ ] 인스턴스 프로파일 분리(신규 차단)와 세션 폐기(기존 무효화)를 **한 쌍으로** 수행했는가
- [ ] 암호화 스냅샷을 고객 관리형 CMK로 복사한 뒤 포렌식 계정에 공유했는가
- [ ] 증거 버킷에 Object Lock을 걸고 버전 관리를 먼저 활성화했는가
- [ ] 격리 전용 보안 그룹으로 교체하고, established 연결 차단이 필요하면 NACL/ENI를 보조했는가
- [ ] EBS 멀티볼륨 스냅샷과 메모리 덤프를 봉쇄와 병행해 보존했는가
- [ ] 증거를 별도 포렌식 계정·Object Lock·CloudTrail로 무결성(chain of custody)을 지켰는가
- [ ] 인스턴스 역할의 임시 자격증명을 aws:TokenIssueTime 거부로 폐기했는가
- [ ] 포렌식 분석을 별도 격리 VPC/계정의 read-only 마운트로 수행하는가
- [ ] 근절 후 패치된 골든 AMI로 재배포하고 침해 인스턴스를 종료했는가
- [ ] 이 순서를 SSM 런북으로 고정해 압박 속 실수를 방지했는가

---

## 📝 연습 문제

**문제 1.** GuardDuty가 EC2 인스턴스의 활성 C2 통신을 탐지했다. 휘발성 증거를 잃지 않으면서 즉시 봉쇄하려면 첫 조치로 가장 적절한 것은?

A) 인스턴스를 즉시 terminate한다  
B) 인스턴스를 stop한다  
C) 인스턴스를 실행 상태로 유지한 채 격리 전용 보안 그룹으로 교체해 네트워크를 차단한다  
D) 인스턴스의 IAM 사용자를 삭제한다  

**정답: C**  
해설: 종료나 중지는 RAM·네트워크 상태 등 휘발성 증거를 파괴하므로 첫 수단이 아니다. 실행 상태를 유지한 채 격리 보안 그룹으로 교체해 통신만 끊으면 봉쇄와 휘발성 증거 보존을 양립할 수 있다. EC2는 IAM 사용자가 아니라 인스턴스 역할로 권한을 받으므로 사용자 삭제는 핵심 조치가 아니다.

---

**문제 2.** 침해 EC2가 인스턴스 프로파일을 통해 STS 임시 자격증명을 발급받았고, 공격자가 IMDS에서 이를 탈취했을 가능성이 있다. 인스턴스를 격리한 것만으로 부족한 이유와 추가 조치는?

A) 격리하면 임시 키도 자동 만료되므로 추가 조치 불필요  
B) 탈취된 임시 키는 인스턴스와 분리되어 만료 전까지 외부에서도 유효하므로, 역할에 aws:TokenIssueTime 기반 Deny를 추가해 기존 세션을 폐기한다  
C) 인스턴스를 재부팅한다  
D) 보안 그룹을 하나 더 추가한다  

**정답: B**  
해설: STS 임시 자격증명은 발급 후 인스턴스와 독립적으로 존재하는 bearer token이라, 격리해도 이미 유출된 키는 만료 시점까지 외부에서 유효하다. 역할에 aws:TokenIssueTime DateLessThan Deny를 추가하면(콘솔의 Revoke active sessions) 지정 시점 이전 발급 토큰을 즉시 무효화한다. 재부팅·보안 그룹 추가는 유출된 토큰을 무력화하지 못한다.

---

**문제 3.** 포렌식 증거로 사용할 EBS 스냅샷의 무결성(chain of custody)을 보장하기 위한 모범은?

A) 스냅샷을 원본 계정에 두고 운영팀 누구나 접근 가능하게 둔다  
B) 스냅샷을 별도 포렌식 계정으로 공유하고, 증거 S3에 Object Lock(WORM)을 걸며 모든 접근을 CloudTrail로 기록한다  
C) 스냅샷을 즉시 삭제하고 메모만 남긴다  
D) 스냅샷을 공개 공유한다  

**정답: B**  
해설: 증거는 변경 불가·접근 추적이 가능해야 법적 효력이 있다. 별도 포렌식 계정 공유로 원본 침해 시에도 보존하고, Object Lock으로 변경·삭제를 막으며, CloudTrail로 접근을 기록하는 것이 chain of custody의 모범이다. 누구나 접근·삭제·공개 공유는 증거 능력을 파괴한다.

---

**문제 4.** 격리 보안 그룹으로 교체했는데도 진행 중이던 공격자 C2 세션이 한동안 끊기지 않았다. 원인과 보조 조치는?

A) 보안 그룹은 stateless라 즉시 끊겨야 하는데 버그다  
B) 보안 그룹은 stateful이라 이미 established된 연결이 유지될 수 있으므로, NACL(stateless 양방향 차단)이나 ENI 분리/재연결로 기존 세션을 강제 종료한다  
C) 인스턴스 타입이 작아서다  
D) NACL은 connection을 더 오래 유지하므로 NACL을 제거한다  

**정답: B**  
해설: 보안 그룹은 stateful이라 응답 트래픽을 자동 허용하고 기존 established 연결을 즉시 끊지 않을 수 있다. 진행 중 세션을 강제 종료하려면 stateless로 양방향을 명시 차단하는 NACL을 보조하거나 ENI를 분리/재연결한다. stateless인 것은 NACL이고, 인스턴스 타입과 무관하다.

---

**문제 5.** 침해 EC2 대응 런북의 단계 순서로 가장 적절한 것은?

A) 종료 → 스냅샷 → 격리 → 분석  
B) 식별/분류 → 증거 보존(스냅샷·메모리 덤프) → 격리(봉쇄) → 자격증명 세션 폐기 → 근절/복구  
C) 격리 → 종료 → IAM 사용자 삭제  
D) 분석 → 격리 → 식별  

**정답: B**  
해설: 정석은 식별·분류로 시작해, 인스턴스가 실행 중일 때 휘발성·디스크 증거를 보존하고, 네트워크 격리로 봉쇄한 뒤, 유출 가능한 임시 자격증명 세션을 폐기하고, 마지막에 근절·복구로 패치된 AMI 재배포 후 종료한다. 종료를 먼저 하면 휘발성 증거가 소실되고, 분석을 식별보다 앞세우는 순서는 성립하지 않는다.

---
