# Day 4 - 멀티계정 보안 운영: Firewall Manager, 중앙 정책 배포, 비용·태그 거버넌스, 보안 베이스라인 자동화

거버넌스 천장(SCP), 베이스라인 자동화(Control Tower), 증거 수집(Audit Manager)을 갖췄다면, 남은 것은 *일상 운영*이다. 수백 개 계정에 방화벽 정책을 일관되게 깔고, 태그·비용을 통제하고, 새 계정이 태어날 때마다 보안 도구가 자동으로 켜지게 하는 운영 평면이다. 이 날의 핵심은 **AWS Firewall Manager**(중앙 방화벽 정책 배포), **태그·비용 거버넌스**, 그리고 **보안 베이스라인 자동화**다.

세 주제를 관통하는 한 문장이 있다. **"정책은 한 번 선언하고, 시스템이 계속 수렴시킨다."** Day 1의 SCP가 *할 수 없는 것*을 정의했다면, 오늘의 도구들은 *반드시 있어야 하는 것*을 계속 유지시킨다. 전자는 경계, 후자는 수렴이다. 시험 보기에서 "차단해야 하는가, 아니면 자동으로 붙여 줘야 하는가"를 먼저 가르는 것이 정답으로 가는 첫 갈림길이다.

## AWS Firewall Manager: 방화벽 정책의 중앙 배포기

WAF·Shield·Security Group·Network Firewall·Route 53 Resolver DNS Firewall를 계정마다 손으로 설정하면 누락과 드리프트가 불가피하다. **Firewall Manager(FMS)**는 조직 전역에 방화벽 정책을 *한 번 정의해 자동 배포·강제*하는 서비스다.

전제 조건이 중요하다(시험 단골):
1. **AWS Organizations 활성화**(모든 기능 활성화 상태) — FMS는 조직 기반 서비스
2. **Firewall Manager 관리자 계정 지정** — 관리 계정이 위임 관리자 계정(통상 Security 계정)을 FMS 관리자로 지정
3. **AWS Config 활성화** — FMS는 Config로 리소스를 평가해 준수 여부를 판단
4. WAF/Shield 정책이면 해당 서비스 사전 활성화(Shield Advanced는 구독 필요)
5. **Network Firewall·DNS Firewall 정책이면 AWS RAM의 조직 공유 활성화** — 중앙에서 만든 규칙 그룹을 멤버 계정에 공유해야 하기 때문

리전 제약도 하나 있다. **Shield Advanced 정책과 CloudFront 범위의 WAF 정책은 `us-east-1`에서 생성해야 한다.** "서울 리전에서 FMS 정책을 만들었는데 CloudFront 배포에 적용되지 않는다"는 상황의 정체가 대부분 이것이다.

```
                     [ 관리 계정 (Management) ]
                       · Organizations / 결제 / OU 구조
                       · FMS 관리자 계정 "지정"만 수행
                                 │ associate-admin-account
                                 ▼
         ┌────────────────────────────────────────────┐
         │     Security(Audit) 계정 = FMS 관리자        │
         │  · WAF 정책 / SG 감사 정책 / DNS 정책 각 1개  │
         │  · 범위: OU · 계정 · 리소스 태그로 선언       │
         │  · 조직 단일 준수 대시보드 + 자동 교정        │
         └──────────────────┬─────────────────────────┘
                            │ 배포 · 지속 평가 · 교정
      ┌─────────────────────┼─────────────────────┐
      ▼                     ▼                     ▼
   OU: Prod             OU: NonProd           OU: Sandbox
   ├ 계정 A (ALB×12)     ├ 계정 D             └ (범위에서 제외)
   ├ 계정 B (CF×3)       └ 계정 E
   └ 계정 C (API GW×5)
      │
      └─▶ 새 ALB 생성 → FMS 감지 → 공통 Web ACL 자동 연결 (사람 개입 0회)

전제: 각 멤버 계정·리전에서 Config가 켜져 있어야 평가·교정이 성립
```

FMS가 배포·강제할 수 있는 정책 유형:
- **WAF 정책**: 공통 Web ACL(관리형 규칙 그룹 포함)을 ALB/CloudFront/API Gateway 등에 자동 연결.
- **Shield Advanced 정책**: 보호 대상 리소스에 Shield Advanced를 일괄 적용.
- **Security Group 정책**: 공통 SG 또는 *감사형* SG 정책(과도하게 개방된 0.0.0.0/0 인바운드 탐지·교정).
- **Network Firewall 정책**: 중앙 검사 VPC의 방화벽 정책을 다계정 배포.
- **Route 53 Resolver DNS Firewall 정책**: 악성 도메인 차단 규칙 그룹 배포.
- **서드파티 방화벽 정책**: Marketplace 파트너 방화벽도 같은 방식으로 조직 배포.

FMS의 강점은 **신규 리소스 자동 보호**다. 정책 범위(계정·리소스 태그)에 맞는 새 리소스가 생기면 FMS가 자동으로 정책을 적용한다. "WAF를 안 붙인 ALB"가 새로 생겨도 FMS가 자동 연결한다.

> 💡 **관련 이론**: 이것은 *정책의 선언적 강제(declarative enforcement)*와 *지속적 교정(continuous remediation)*이다. 정책을 한 번 선언하면 시스템이 현재 상태를 선언 상태로 *수렴*시킨다(Kubernetes의 reconcile loop와 동일한 사고). 사람이 매번 적용하는 명령형 운영의 누락 확률은 리소스 수 n에 대해 대략 `1-(1-p)^n`으로 커지지만, 선언적 수렴의 실패 확률은 n이 커져도 *정책 정의 1개의 정확성*에 수렴한다. 계정 수가 세 자리로 갈 때 FMS가 선택이 아닌 이유가 이 수식에 있다.

### 개별 관리 vs Firewall Manager

"WAF를 각 계정에서 붙이면 되지 않나"는 계정이 5개일 때는 맞고 200개일 때는 틀리다.

| 축 | 계정별 개별 WAF/SG 관리 | Firewall Manager |
|---|---|---|
| 정책 정의 지점 | 계정×리전마다 각각 | **FMS 관리자 계정에서 1회** |
| 신규 리소스 | 사람이 기억해야 붙음 | **범위 매칭 시 자동 연결** |
| 드리프트(누가 떼어냄) | 발견 자체가 어려움 | 비준수 보고 + `RemediationEnabled`면 **자동 복원** |
| 준수 가시성 | 계정별 콘솔 순회 | 조직 단일 준수 대시보드 |
| 신규 계정 | 온보딩 체크리스트에 의존 | OU에 들어오는 순간 정책 상속 |
| 범위 지정 | 불가(수동 판단) | OU·계정·**리소스 태그**로 선언적 지정 |
| 실패 모드 | *조용한 누락* | *가시적 비준수* |

마지막 행이 본질이다. 개별 관리의 실패는 아무 신호도 남기지 않고, FMS의 실패는 대시보드에 뜬다. **보안 운영에서 "조용한 실패"를 "시끄러운 실패"로 바꾸는 것 자체가 통제다.**

## FMS vs WAF vs Network Firewall 역할 구분

| 서비스 | 본질 | 관계 |
|---|---|---|
| **WAF** | 단일 Web ACL을 한 리소스에 적용 | FMS가 *배포*하는 대상 |
| **Network Firewall** | VPC 트래픽 검사(stateful/IPS) | FMS가 *배포*하는 대상 |
| **Firewall Manager** | 위 정책들을 *조직 전역 배포·강제·교정* | 오케스트레이터 |

시험에서 "여러 계정에 WAF를 일관 적용하고 신규 리소스도 자동 보호" → 답은 거의 항상 **Firewall Manager**다. 단일 리소스 보호면 WAF 직접이다.

```json
// FMS WAF 정책 — 범위 축소·생애주기 옵션까지 붙인 실물 형태
{
  "PolicyName": "Org-Common-WAF-Prod",
  "ResourceType": "AWS::ElasticLoadBalancingV2::LoadBalancer",
  "IncludeMap": { "ORG_UNIT": ["ou-xxxx-prod", "ou-xxxx-shared"] },
  "ExcludeMap": { "ACCOUNT": ["999988887777"] },
  "ExcludeResourceTags": true,
  "ResourceTags": [ { "Key": "fms-exempt", "Value": "true" } ],
  "RemediationEnabled": true,
  "DeleteUnusedFMManagedResources": true,
  "SecurityServicePolicyData": {
    "Type": "WAFV2",
    "ManagedServiceData": "{\"type\":\"WAFV2\",\"preProcessRuleGroups\":[{\"managedRuleGroupIdentifier\":{\"vendorName\":\"AWS\",\"managedRuleGroupName\":\"AWSManagedRulesCommonRuleSet\"},\"overrideAction\":{\"type\":\"NONE\"},\"ruleGroupType\":\"ManagedRuleGroup\"}],\"postProcessRuleGroups\":[],\"defaultAction\":{\"type\":\"ALLOW\"}}"
  }
}
```

세 옵션의 의미가 실무·시험 모두에서 갈린다.

- `ExcludeResourceTags: true` + `ResourceTags`: 이 태그가 붙은 리소스를 **범위에서 뺀다**. `false`면 반대로 그 태그가 붙은 리소스만 *포함*한다. 예외 승인 프로세스를 태그로 구현하는 표준 패턴이다.
- `DeleteUnusedFMManagedResources: true`: 정책 삭제·범위 이탈 시 FMS가 만든 Web ACL 같은 관리형 리소스를 **함께 정리**한다. `false`면 고아 Web ACL이 계정마다 남아 요금이 계속 나간다.
- `preProcessRuleGroups` / `postProcessRuleGroups`: 각 멤버 계정 Web ACL의 **앞단·뒷단에 고정되는 규칙 그룹**이고, 그 사이는 계정 소유자가 자기 규칙을 넣도록 남겨 둔다. "조직 필수 규칙은 못 건드리되 앱별 규칙은 각자 추가"라는 절충이 구조로 표현된 것이다.

```bash
# 1) 관리 계정에서 FMS 관리자(위임 관리자) 지정 — 통상 Security/Audit 계정
aws fms associate-admin-account --admin-account 222233334444

# 2) FMS 관리자 계정에서 정책 생성
aws fms put-policy --policy file://org-common-waf.json

# 3) 조직 전역 준수 상태 / 계정별 비준수 원인 확인
aws fms list-compliance-status --policy-id <policy-id>
aws fms get-compliance-detail --policy-id <policy-id> --member-account 111122223333

# Network Firewall / DNS Firewall 정책 전제: 조직 리소스 공유 활성화
aws ram enable-sharing-with-aws-organizations
```

Security Group 정책은 세 종류이며, 시험은 "어느 쪽인가"를 묻는다.

| SG 정책 유형 | 하는 일 | 답이 되는 상황 |
|---|---|---|
| **공통 보안 그룹(Common)** | 조직 표준 SG를 범위 내 리소스에 **붙인다** | "모든 EC2/ENI에 공통 기본 SG를 강제 부착" |
| **콘텐츠 감사(Content audit)** | 기존 SG의 **규칙 내용**을 템플릿과 대조해 판정 | "0.0.0.0/0 인바운드나 22/3389 개방을 조직 전역 금지" |
| **사용 현황 감사(Usage audit)** | **미사용·중복 SG**를 찾아 정리 | "쓰지 않는 보안 그룹이 쌓여 관리 불가" |

> ⚠️ **함정**: FMS 정책을 만들어도 아무 일도 일어나지 않는 세 가지 흔한 원인이 있다. ① 대상 계정·리전에서 **Config가 꺼져 있다** — FMS는 Config 인벤토리 위에서 평가하므로 "비준수 0건"이 아니라 "평가 자체가 없음"이 되고, 대시보드가 깨끗해 보여서 더 위험하다. ② `RemediationEnabled`가 `false`다 — 이때 FMS는 *보고만* 하고 아무것도 붙이지 않는다. "정책은 있는데 Web ACL이 안 붙는다"의 1순위 원인. ③ **CloudFront/Shield Advanced 정책을 `us-east-1`이 아닌 리전에서 만들었다** — 정책은 생성되지만 대상이 잡히지 않는다. 셋 다 에러 없이 조용히 실패하는 형태라 진단이 늦어진다.

> 🔍 **더 깊이**: FMS가 WAF 정책을 배포할 때 하는 일은 중앙 Web ACL을 *공유*하는 것이 **아니다**. 각 멤버 계정·리전에 *그 계정 소유의* FMS 관리형 Web ACL을 새로 만들고 정책 규칙 그룹을 앞뒤로 고정한 뒤 대상 리소스에 연결한다. 그래서 ① WAF 요금·용량 단위(WCU)는 각 멤버 계정에 청구되고, ② 멤버 계정 관리자가 FMS 관리 영역을 수정해도 다음 평가 주기에 되돌려진다. 이 되돌림이 곧 *지속적 교정*이며 Control Tower 드리프트와 같은 원리다. 다만 계정 관리자가 Web ACL을 **삭제**하면 FMS가 재생성하기까지 짧은 무방비 구간이 생긴다. 이 구간을 없애려면 SCP로 `wafv2:DeleteWebACL`·`wafv2:DisassociateWebACL`을 Deny해 두는 것이 정석이다 — **FMS(수렴)와 SCP(경계)를 겹쳐 쓰는 전형적 조합**이다.

## 태그 거버넌스

태그는 비용 배분·접근 통제(ABAC)·자동화의 기반이다. 태그가 일관되지 않으면 비용 추적도, 태그 기반 권한도 무너진다. 조직 규모의 태그 거버넌스는 세 축으로 강제한다.

1. **Tag Policies(Organizations)**: 허용 태그 키·값·대소문자 표준을 정의하고 비준수 리소스를 *보고*한다(주로 탐지·표준화).
2. **SCP로 태그 강제**: 생성 시 필수 태그가 없으면 *차단*(예방).
3. **Config 규칙(required-tags)**: 이미 존재하는 리소스의 태그 누락을 탐지·교정.

역할이 겹쳐 보이지만 **차단 시점과 강제력**이 전혀 다르다. 이 표가 판단 축이다.

| | Tag Policy (Organizations) | SCP 태그 조건 | Config `required-tags` |
|---|---|---|---|
| 통제 유형 | 표준화 + (선택적) 강제 | **예방(차단)** | **탐지 + 교정** |
| 작동 시점 | 태그 지정·변경 시 | API 호출 평가 시 | 리소스 생성·변경 후 |
| 무엇을 막나 | *비준수 값·표기*의 태그 부착 | 필수 태그 없는 **생성 자체** | 아무것도 막지 못함(사후) |
| 무태그 생성 | **막지 못함** | 막음 | 사후 탐지 |
| 산출물 | 준수 리포트 | AccessDenied | NON_COMPLIANT + 교정 실행 |

핵심 함정이 4행에 있다. **Tag Policy는 "태그를 아예 안 달고 리소스를 만드는 것"을 막지 못한다.** Tag Policy가 강제하는 것은 *태그가 붙을 때 그 키·값이 표준을 따르는가*이지 *태그가 반드시 있어야 하는가*가 아니다. "필수 태그 없이는 생성 불가"를 원하면 답은 언제나 SCP다. 보기에 둘이 함께 나오면 요구사항의 동사가 "표준화/보고"인지 "차단/강제"인지부터 확인하라.

```json
// SCP: 태그를 "붙이게" 만들고, 붙은 뒤 "떼지 못하게" 만든다 — 두 개가 한 쌍
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyCreateWithoutRequiredTags",
      "Effect": "Deny",
      "Action": ["ec2:RunInstances", "rds:CreateDBInstance", "s3:CreateBucket"],
      "Resource": "*",
      "Condition": {
        "Null": {
          "aws:RequestTag/CostCenter": "true",
          "aws:RequestTag/DataClassification": "true"
        },
        "Bool": { "aws:PrincipalIsAWSService": "false" }
      }
    },
    {
      "Sid": "DenyInvalidDataClassificationValue",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestTag/DataClassification": ["public","internal","confidential","restricted"]
        },
        "Null": { "aws:RequestTag/DataClassification": "false" }
      }
    },
    {
      "Sid": "DenyRemovingGovernanceTags",
      "Effect": "Deny",
      "Action": ["ec2:DeleteTags", "rds:RemoveTagsFromResource", "s3:DeleteBucketTagging"],
      "Resource": "*",
      "Condition": {
        "ForAnyValue:StringEquals": {
          "aws:TagKeys": ["CostCenter", "DataClassification"]
        },
        "ArnNotLike": { "aws:PrincipalARN": "arn:aws:iam::*:role/OrgTagGovernanceRole" }
      }
    }
  ]
}
```

세 Statement가 각각 다른 구멍을 막는다. 첫째는 *무태그 생성*, 둘째는 *비표준 값*, 셋째는 *사후 태그 제거*다. 둘째에서 `Null`을 `"false"`로 둔 것이 포인트다 — "태그가 있을 때만 값 검사"를 뜻하며, 이 조건이 없으면 태그를 지정하지 않은 모든 호출까지 걸려 다른 서비스가 통째로 깨진다. 셋째가 없으면 "만들 때만 태그를 달고 곧바로 지우는" 우회가 성립하는데, 태그로 접근 통제(ABAC)를 하는 조직에서 이 우회는 곧 **권한 상승 경로**다.

```bash
# Organizations Tag Policy: 키 표기·허용값 표준화, 지정 리소스 타입에 한해 강제
aws organizations enable-policy-type --root-id r-exam --policy-type TAG_POLICY
aws organizations create-policy \
  --name "Org-Standard-Tags" --type TAG_POLICY \
  --content '{ "tags": { "CostCenter": {
      "tag_key":   { "@@assign": "CostCenter" },
      "tag_value": { "@@assign": ["CC-1001","CC-1002","CC-2001"] },
      "enforced_for": { "@@assign": ["ec2:instance","rds:db","s3:bucket"] } } } }'
aws organizations attach-policy --policy-id p-tagpolicy --target-id ou-xxxx-prod

# 조직 전역 태그 실태 조사와 일괄 보정
aws resourcegroupstaggingapi get-tag-keys
aws resourcegroupstaggingapi get-resources \
  --tag-filters Key=DataClassification,Values=restricted \
  --resource-type-filters ec2:instance rds:db s3
aws resourcegroupstaggingapi tag-resources \
  --resource-arn-list arn:aws:ec2:ap-northeast-2:111122223333:instance/i-0abc123 \
  --tags CostCenter=CC-1001,Owner=platform-team
```

태그는 **ABAC(Attribute-Based Access Control)**의 핵심이기도 하다. `aws:ResourceTag`/`aws:PrincipalTag`로 "같은 팀 태그를 가진 리소스만 접근" 같은 동적 권한을 줄 수 있어, 계정·리소스가 늘어도 정책 수가 폭발하지 않는다. 아래 정책 하나가 팀이 3개든 300개든 그대로 동작한다.

```json
{
  "Effect": "Allow",
  "Action": ["ec2:StartInstances","ec2:StopInstances"],
  "Resource": "arn:aws:ec2:*:*:instance/*",
  "Condition": {
    "StringEquals": { "aws:ResourceTag/Team": "${aws:PrincipalTag/Team}" }
  }
}
```

**다만 ABAC의 안전성은 전적으로 태그의 무결성에 의존한다.** 위 SCP의 셋째 Statement(태그 제거 차단)와 "자기 프린시펄 태그를 스스로 바꾸지 못하게" 하는 통제가 없으면, 사용자가 자기 `Team` 태그를 바꿔 남의 리소스를 만지는 권한 상승이 성립한다. ABAC를 도입할 때 `iam:TagRole`·`iam:TagUser`·`sts:TagSession`을 함께 잠그는 이유다.

> 💡 **관련 이론**: 태그 거버넌스는 *신뢰할 수 있는 식별자(trusted identifier)* 문제다. 태그는 사용자가 자유롭게 쓰는 문자열이므로 본질적으로 신뢰할 수 없는 필드인데, ABAC와 비용 배분은 그것을 신뢰한다고 가정한다. 그 간극을 메우는 것이 "누가 태그를 쓰고 지울 수 있는가"에 대한 통제다. 즉 **태그 거버넌스의 절반은 태그 값이 아니라 태그 변경 권한의 거버넌스**다. 예방(SCP)·표준화(Tag Policy)·교정(Config)을 함께 써야 "garbage in, garbage out"을 끊을 수 있다.

> ⚠️ **함정**: `aws:RequestTag/*` 조건은 **해당 API가 생성 시 태그 지정(tag-on-create)을 지원할 때만** 의미가 있다. 지원하지 않는 API에 이 `Null` 조건을 걸면 태그를 요청에 실을 방법이 없으므로 그 액션은 *항상* 거부된다. 그래서 실무 SCP는 액션 목록을 넓게 잡지 말고 tag-on-create 지원 액션만 골라 명시한다. 하나 더 — `ec2:RunInstances`에서 태그를 강제하려면 사용자의 IAM 정책이 인스턴스 리소스에 대해 `ec2:CreateTags`를 허용하고 있어야 한다. SCP는 통과했는데 IAM에 `CreateTags`가 없어 생성이 실패하는, 원인을 찾기 어려운 조합이 자주 나온다.

### 태그 강제가 새는 지점: 정책 평가 순서로 확인

"SCP로 막았는데 왜 리소스가 태그 없이 생겼나"의 답은 언제나 평가 규칙에 있다. Day 1의 판정 규칙을 태그 맥락에서 압축하면 이렇다.

```
유효 권한 = (SCP ∩ RCP ∩ 권한경계 ∩ 세션정책) ∩ (IAM Allow ∪ 리소스정책 Allow) − (모든 Deny)

① 명시적 Deny 하나면 종료 → 태그 SCP의 Deny는 AdministratorAccess도 이긴다
⑦ 어디에도 Allow가 없으면 암묵적 Deny
```

| 정책 유형 | 태그 거버넌스에서의 역할 | 힘의 크기 |
|---|---|---|
| **SCP** | 계정·OU 전체의 무태그 생성 차단 | Deny면 **무조건 이김**(단 관리 계정 프린시펄엔 미적용) |
| **IAM 아이덴티티 정책** | 실제 권한 부여 + 태그 조건 부가 | SCP Deny를 못 이김 |
| **권한 경계** | 특정 역할 하나의 상한 | 좁히기만 가능, Allow를 넓히지 못함 |
| **리소스 기반 정책** | 교차 계정 접근 시 태그 조건 부과 | 동일 계정에서만 단독 Allow 성립 |

여기서 두 개의 실전 결론이 나온다. 첫째, **SCP는 관리 계정 프린시펄에 적용되지 않으므로** 관리 계정에서 워크로드를 돌리면 태그·리전 강제가 통째로 샌다(관리 계정에 워크로드를 두지 말라는 규칙의 또 다른 근거). 둘째, **AWS 서비스가 자기 이름으로 만드는 리소스**는 요청에 태그를 싣지 않는 경우가 있어 SCP Deny에 걸린다 — 그래서 위 JSON 첫째 Statement에 `aws:PrincipalIsAWSService` 조건이 붙어 있다.

> 🎯 **시나리오**: 태그 강제 SCP를 Prod OU에 붙인 다음 날, Auto Scaling 스케일아웃이 전부 실패하고 CloudFormation 스택 업데이트가 롤백된다. 원인과 해법은? → ASG가 인스턴스를 만드는 `ec2:RunInstances` 호출에 `CostCenter` 태그가 실리지 않았기 때문이다. 해법은 세 갈래다. ① ASG의 **태그 전파(PropagateAtLaunch)** 를 켜서 그룹 태그가 인스턴스 요청에 실리게 한다. ② CloudFormation 스택 레벨 태그를 표준화해 하위 리소스에 상속시킨다. ③ 그래도 남는 서비스 프린시펄 경로만 `aws:PrincipalIsAWSService` 조건으로 예외한다. 중요한 판단은 **③을 먼저 하면 안 된다**는 것이다 — 예외를 먼저 열면 아무도 ①을 하지 않고, 태그 누락이 서비스 경로로 영구히 새어 나간다. 강제 정책을 도입할 때는 항상 *예외를 열기 전에 정상 경로를 먼저 고친다*.

## 비용 거버넌스 (보안 관점)

비용은 보안과 무관해 보이지만, **비정상 비용 급증은 침해의 신호**일 수 있다(암호화폐 채굴 인스턴스, 데이터 유출 송신, 탈취된 키로 대량 리소스 생성). 보안 운영은 비용 신호를 위협 탐지에 활용한다.

- **AWS Budgets**: 계정·태그·서비스별 예산 임계 경보. 급증 시 알림.
- **Cost Anomaly Detection**: ML 기반 이상 지출 탐지 → 침해·구성 오류 조기 신호.
- **SCP로 비싼 인스턴스 타입·리전 제한**: 채굴용 대형 GPU 인스턴스 생성을 SCP로 차단해 *피해 한계(blast radius)*를 줄인다.
   ```json
   {
     "Sid": "DenyExpensiveGPUInstances",
     "Effect": "Deny",
     "Action": "ec2:RunInstances",
     "Resource": "arn:aws:ec2:*:*:instance/*",
     "Condition": {
       "ForAnyValue:StringLike": { "ec2:InstanceType": ["p4d.*","p5.*","x2*"] }
     }
   }
   ```
- **태그 기반 비용 배분**: 일관된 태그로 비용을 팀·환경별로 귀속해 이상 소유를 빠르게 추적.

GuardDuty의 일부 발견 유형(예: 암호화폐 채굴 관련 EC2/Kubernetes 발견)도 이 맥락과 직접 연결된다.

여기에 **리전 제한**을 겹치면 피해 한계가 한 번 더 줄어든다. 채굴 공격의 전형적 행태는 *조직이 쓰지 않는 리전*에 인스턴스를 띄우는 것이다 — 기본 리전만 보는 운영자에게 오래 발각되지 않기 때문이다.

```json
{
  "Sid": "DenyAllOutsideApprovedRegions",
  "Effect": "Deny",
  "NotAction": [
    "iam:*", "organizations:*", "sts:*", "cloudfront:*", "route53:*",
    "support:*", "budgets:*", "ce:*", "waf:*", "wafv2:*", "shield:*", "fms:*"
  ],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": { "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"] }
  }
}
```

`NotAction`에 글로벌 서비스를 예외로 두어야 한다는 점, 그리고 CloudFront·WAF(글로벌 범위)·Shield·FMS의 제어 평면이 `us-east-1`이라 그 리전을 허용 목록에 남겨야 한다는 점이 이 패턴의 두 함정이다. SCP 하나가 "우리는 서울만 쓴다"는 정책을 **미사용 리전에서의 채굴·데이터 유출까지 차단하는 보안 통제**로 바꾼다.

```bash
# 조직 전체를 하나의 비용 이상 모니터로 두고, 알림을 보안 채널로 흘린다
aws ce create-anomaly-monitor --anomaly-monitor \
  '{"MonitorName":"OrgWideCostMonitor","MonitorType":"DIMENSIONAL","MonitorDimension":"SERVICE"}'
aws ce create-anomaly-subscription --anomaly-subscription '{
  "SubscriptionName": "SecOps-Cost-Spike",
  "MonitorArnList": ["arn:aws:ce::111122223333:anomalymonitor/<id>"],
  "Subscribers": [{"Type":"SNS","Address":"arn:aws:sns:us-east-1:222233334444:secops-alerts"}],
  "Frequency": "IMMEDIATE" }'
aws ce get-anomalies --date-interval StartDate=2026-07-01,EndDate=2026-07-31
```

> 📚 **사례**: 2018년 2월, 클라우드 보안 업체 RedLock(현 Palo Alto Networks) 연구팀은 **테슬라의 AWS 환경에서 암호화폐 채굴이 진행 중이던 것**을 발견해 보고했다. 침투 경로는 정교한 취약점이 아니라 **인증이 걸려 있지 않은 Kubernetes 관리 콘솔**이었고, 그 콘솔 안에 AWS 자격증명이 노출돼 있었다. 이 사건이 거버넌스 교재에 계속 인용되는 이유는 채굴 자체가 아니라 **은닉 기법** 때문이다 — 공격자는 ① 공개 채굴 풀 대신 자체 마이닝 풀 서버를 쓰고, ② 그 서버를 CDN 뒤에 숨겨 목적지 IP 평판 기반 탐지를 회피했으며, ③ 비표준 포트를 사용하고, ④ **CPU 사용률을 의도적으로 낮게 유지**해 "사용률 급등" 기반 탐지에 걸리지 않게 했다. 전통적 임계값 탐지를 전부 우회한 것이다. 남는 신호는 결국 *비용*과 *권한 경계 위반*이었다. 실무 결론은 명확하다 — 채굴 탐지를 CPU 사용률 하나에 걸지 말고 **비용 이상 탐지 + GuardDuty 발견 유형 + 미사용 리전·대형 인스턴스 SCP 차단**을 겹쳐야 한다. 그리고 근본 원인은 언제나 "자격증명이 놓여 있던 자리"였다는 점도 잊으면 안 된다.

> 🎯 **시나리오**: 새벽 3시에 Cost Anomaly Detection이 특정 계정에서 평소 대비 40배 지출을 알렸다. 조직이 쓰지 않는 3개 리전에서 대형 인스턴스 수십 대가 떠 있고, 생성 주체는 6개월 전 발급된 IAM 사용자 액세스 키였다. 순서대로 무엇을 하는가. → ① **자격증명 무력화 먼저**: 액세스 키를 `Inactive`로 바꾼다(삭제보다 비활성화가 포렌식에 유리하다). ② **격리**: 인스턴스를 종료하지 말고 격리 SG로 교체 + 스냅샷 확보 — 종료하면 메모리·디스크 증거가 사라진다. ③ **범위 확정**: CloudTrail에서 그 키의 전체 호출 이력을 뒤져 `CreateUser`·`AttachUserPolicy`·`PutBucketPolicy` 같은 지속성·확산 행위를 찾는다. ④ **재발 차단**: 리전 제한·인스턴스 타입 제한 SCP를 적용하고, 장기 액세스 키를 IAM Identity Center 기반 임시 자격증명으로 대체한다. 순서의 핵심은 **멈춤 → 보존 → 조사 → 예방**이며, 흔한 실수는 ②에서 인스턴스를 곧바로 삭제해 조사를 불가능하게 만드는 것이다.

## 보안 베이스라인 자동화

새 계정이 태어날 때마다 보안 도구가 자동으로 켜지고, 비준수가 자동 교정되게 만드는 것이 다계정 보안 운영의 종착점이다. 구성 요소:

- **GuardDuty / Security Hub / Config 자동 활성화**: 위임 관리자에서 "자동 등록(auto-enable)"을 켜면 신규 계정이 조직에 들어오는 즉시 활성화된다.
- **EventBridge 기반 자동 대응**: GuardDuty/Security Hub findings → EventBridge 규칙 → Lambda/SSM Automation으로 자동 격리·교정.
- **Config 자동 교정(remediation)**: 비준수 리소스에 SSM Automation 문서를 자동 실행(예: 퍼블릭 S3 버킷의 퍼블릭 액세스 차단 재적용).
- **계정 팩토리 후처리**: 신규 계정 발급 직후 베이스라인(추가 SCP·로그 구독·태그·IAM 역할)을 IaC로 자동 적용(AFT/CfCT).

자동 등록은 **서비스마다 별도로** 켜야 한다는 점이 실무에서 자주 빠진다. 하나라도 놓치면 그 서비스만 신규 계정에서 조용히 꺼진 채 남는다.

```bash
# GuardDuty: 위임 관리자에서 조직 신규 계정 자동 등록
aws guardduty update-organization-configuration \
  --detector-id <detector-id> --auto-enable-organization-members ALL

# Security Hub: 신규 계정 자동 등록 + 기본 표준 자동 활성화
aws securityhub update-organization-configuration \
  --auto-enable --auto-enable-standards DEFAULT

# Config 자동 교정: 비준수 감지 시 SSM Automation 실행
aws configservice put-remediation-configuration --remediation-configurations '[{
  "ConfigRuleName": "s3-bucket-public-read-prohibited",
  "TargetType": "SSM_DOCUMENT",
  "TargetId": "AWS-DisableS3BucketPublicReadWrite",
  "Automatic": true, "MaximumAutomaticAttempts": 5, "RetryAttemptSeconds": 60,
  "Parameters": {
    "AutomationAssumeRole": {"StaticValue":{"Values":["arn:aws:iam::111122223333:role/ConfigRemediationRole"]}},
    "S3BucketName": {"ResourceValue":{"Value":"RESOURCE_ID"}} } }]'
```

EventBridge 규칙은 "무엇을 잡을 것인가"를 이벤트 패턴으로 선언한다. 심각도로 걸러 노이즈를 줄이는 것이 표준이다.

```json
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [ { "numeric": [">=", 7] } ],
    "type": [ { "prefix": "CryptoCurrency:" }, { "prefix": "UnauthorizedAccess:" } ]
  }
}
```

닫힌 루프 전체를 그리면 이렇게 된다.

```
[ 계정 발급 경로 ]                    [ 상시 운영 루프 ]

Account Factory / AFT                워크로드 계정에서 이벤트 발생
   │ 계정 생성                                 │
   ▼                                           ▼
OU 배치 + 표준 태그             GuardDuty / Security Hub / Config
   │                                           │ finding · NON_COMPLIANT
   ▼                                           ▼
auto-enable 상속                       EventBridge 규칙(심각도 필터)
 ├ GuardDuty                                   │
 ├ Security Hub                    ┌───────────┼───────────┐
 ├ Config + 조직 규칙                ▼           ▼           ▼
 └ FMS 정책(OU 상속)            Lambda 격리   SSM 교정   SNS/Slack
   │                            (키 비활성화) (설정 복원) (사람 판단분)
   ▼                                 │           │
베이스라인 IaC 후처리                  └─────┬─────┘
 (역할·로그 구독·네트워크)                    ▼
   │                              Security Hub에 결과 반영
   └─────────────────────────────▶  (준수 상태 재평가)
```

> ⚠️ **함정**: 자동 교정은 켜는 순간 *운영 사고의 새로운 원인*이 된다. ① **교정 루프**: 교정이 리소스를 바꾸면 그것이 다시 구성 변경 이벤트를 만들고 다른 규칙이 또 교정하는 진동이 생긴다(`MaximumAutomaticAttempts`와 규칙 간 충돌 검토가 필요한 이유). ② **의도된 예외를 부수는 교정**: 승인받은 퍼블릭 배포용 버킷이 자동 교정으로 닫혀 서비스가 중단된다 — 예외를 태그로 선언하고 교정 대상에서 빼는 설계가 먼저 있어야 한다. ③ **권한 부족으로 조용히 실패**: `AutomationAssumeRole`에 권한이 없으면 교정이 실패하는데 대시보드에는 여전히 "교정 구성됨"으로 보인다. 자동 교정은 반드시 *교정 실패 자체*를 알림 대상으로 삼아야 한다.

> 🔍 **더 깊이**: 자동 대응을 설계할 때 판단 기준은 "이 조치가 **되돌릴 수 있는가**"다. 가역적 조치(액세스 키 비활성화, 격리 SG 교체, 스냅샷 생성, 세션 무효화)는 자동화해도 안전하다 — 오탐이어도 몇 분 안에 복구된다. 비가역적 조치(인스턴스 종료, 사용자 삭제, 리소스 삭제)는 자동화하면 오탐 한 번이 곧 장애다. 그래서 성숙한 조직은 **가역적 조치는 자동, 비가역적 조치는 승인 게이트**(Step Functions 대기 상태 + 승인 콜백)로 나눈다. 하나 더 — 자동 대응 Lambda가 멤버 계정에서 조치하려면 각 계정에 *교차 계정 대응 역할*이 미리 배포돼 있어야 하고, 그 역할은 매우 강력하다. 신뢰 정책을 보안 계정의 특정 Lambda 실행 역할로 좁히고 SCP로 그 역할의 삭제·수정을 막는 것이 정석이다. **대응 역할이 곧 최고 권한 통로이므로, 대응 자동화의 보안이 조직 전체 보안의 상한이 된다.**

## 함정 정리

- Firewall Manager는 *Config가 활성화*되어 있어야 동작한다. Config 없이는 준수 평가·교정 불가.
- FMS는 관리 계정이 아니라 *위임 관리자(보통 Security 계정)*를 FMS 관리자로 두는 것이 모범.
- "여러 계정에 WAF/SG/Network Firewall 일관 적용 + 신규 자동 보호" → WAF 직접이 아니라 *Firewall Manager*.
- `RemediationEnabled: false`면 FMS는 *보고만* 한다 — "정책은 있는데 안 붙는다"의 1순위 원인.
- CloudFront 범위 WAF·Shield Advanced 정책은 **us-east-1**에서 만들어야 한다.
- Network Firewall·DNS Firewall 정책은 **AWS RAM 조직 공유**가 선행돼야 한다.
- `DeleteUnusedFMManagedResources`를 끄면 정책 삭제 후 고아 Web ACL이 계정마다 남아 요금이 계속 나간다.
- 태그 거버넌스는 예방(SCP)·표준화(Tag Policy)·교정(Config) 세 가지를 함께 써야 완성된다.
- **Tag Policy는 "무태그 생성"을 막지 못한다** — 차단이 필요하면 답은 SCP다.
- 태그 강제 SCP는 *생성 시 부착*과 *사후 제거 차단*이 한 쌍이어야 우회가 막힌다.
- `aws:RequestTag`는 tag-on-create 지원 API에서만 유효하다 — 미지원 액션에 걸면 항상 거부된다.
- ABAC의 안전성은 태그 무결성에 의존한다 — `iam:TagRole`·`sts:TagSession`도 함께 잠가야 한다.
- SCP는 *관리 계정 프린시펄에 적용되지 않는다* — 관리 계정 워크로드는 태그·리전 강제를 통째로 샌다.
- 강제 SCP 도입 시 서비스 연결 역할 경로(ASG·CFN)를 먼저 정상화하고, 예외는 마지막에 연다.
- 비정상 비용 급증은 *보안 신호*일 수 있다 — Budgets/Cost Anomaly Detection을 침해 탐지에 연계.
- 채굴 탐지를 CPU 사용률 하나에 걸지 마라 — 공격자는 사용률을 낮게 유지해 회피한다.
- auto-enable은 서비스마다 따로 켜야 한다 — 하나 빠지면 그 서비스만 신규 계정에서 조용히 꺼진다.
- 자동 대응은 *가역적 조치만 자동*, 비가역적 조치는 승인 게이트로 분리한다.
- 침해 대응 순서는 **멈춤 → 보존 → 조사 → 예방** — 인스턴스 즉시 삭제는 증거를 없앤다.

## 한 줄 요약 체크리스트

- [ ] FMS 관리자를 관리 계정이 아닌 **Security/Audit 계정**으로 지정했는가
- [ ] 정책 범위 내 **모든 계정·리전에서 Config가 켜져** 있는가
- [ ] `RemediationEnabled`와 `DeleteUnusedFMManagedResources`를 의도대로 설정했는가
- [ ] CloudFront·Shield Advanced 정책을 `us-east-1`에서 만들었는가
- [ ] 예외 리소스를 태그(`ExcludeResourceTags`)로 선언해 승인 프로세스와 연결했는가
- [ ] FMS 관리형 Web ACL의 삭제·해제를 SCP로 함께 막아 무방비 구간을 없앴는가
- [ ] 필수 태그를 **SCP로 차단**하고, Tag Policy는 값·표기 표준화에 쓰고 있는가
- [ ] 태그 *제거* 차단(`aws:TagKeys` + `ec2:DeleteTags`)까지 한 쌍으로 걸었는가
- [ ] 리전 제한 SCP에 글로벌 서비스와 `us-east-1` 예외를 정확히 넣었는가
- [ ] Cost Anomaly Detection 알림이 **재무 채널이 아니라 보안 채널로도** 흐르는가
- [ ] GuardDuty·Security Hub·Config의 auto-enable을 **각각** 켰는가
- [ ] Config 자동 교정에 `AutomationAssumeRole` 권한이 있고, *교정 실패*가 알림 대상인가
- [ ] 자동 대응에서 가역·비가역 조치를 분리하고, 교차 계정 대응 역할을 SCP로 보호했는가

## 📝 연습 문제

**문제 1.** 200개 계정의 모든 ALB에 공통 WAF 관리형 규칙을 적용하고, 앞으로 새로 생기는 ALB도 자동으로 보호되게 하려 한다. 가장 적절한 서비스는?

A) 각 계정에서 WAF Web ACL을 수동으로 ALB에 연결  
B) AWS Firewall Manager로 WAF 정책을 정의해 조직 전역 ALB에 자동 배포·교정하고 신규 리소스도 자동 적용  
C) Security Group으로 HTTP를 제한  
D) CloudFront만 사용  

**정답: B**  
해설: 조직 전역에 방화벽 정책을 일관 배포·강제하고 신규 리소스를 자동 보호하는 것은 Firewall Manager의 핵심 기능이다. WAF 정책으로 관리형 규칙 그룹을 정의하면 범위 내 모든 ALB에 자동 연결되고, 교정을 켜면 비준수도 자동 수정된다. 계정별 수동 연결은 누락·드리프트가 불가피하고, SG는 7계층 WAF 통제를 못 하며, CloudFront 단독은 ALB 보호 일괄화와 무관하다.

---

**문제 2.** Firewall Manager 정책을 만들었는데 일부 계정에서 준수 평가·자동 교정이 동작하지 않는다. 가장 가능성 높은 전제 조건 누락은?

A) 해당 계정에서 AWS Config가 비활성 상태  
B) CloudFront가 비활성  
C) Route 53이 비활성  
D) S3 버킷이 없음  

**정답: A**  
해설: Firewall Manager는 AWS Config로 리소스를 평가해 준수 여부를 판단하고 교정한다. 대상 계정에서 Config가 꺼져 있으면 평가·교정이 동작하지 않는다. FMS의 전제는 Organizations·FMS 관리자 지정·Config 활성화이며, CloudFront·Route 53·S3 존재 여부는 정책 유형에 따른 부수 사항일 뿐 보편적 전제 조건이 아니다.

---

**문제 3.** 모든 EC2/RDS 생성 시 CostCenter 태그를 반드시 갖도록 *강제(차단)*하려 한다. 가장 직접적인 방법은?

A) Tag Policies로 보고만 한다  
B) SCP로 RunInstances/CreateDBInstance에서 aws:RequestTag/CostCenter가 없으면 Deny  
C) Config 규칙으로 탐지만 한다  
D) IAM 사용자에게 교육한다  

**정답: B**  
해설: 생성 시점에 태그 부재를 차단하는 예방 통제는 SCP의 Null 조건으로 구현한다. 필수 태그가 없으면 생성 액션 자체가 거부된다. Tag Policies와 Config 규칙은 표준화·탐지 중심이라 생성을 막지는 않고, 교육은 강제력이 없다. 실무에서는 셋을 함께 쓰되 "강제 차단"의 직접 수단은 SCP다.

---

**문제 4.** 한 계정에서 평소의 10배에 달하는 GPU 인스턴스 비용이 갑자기 발생했다. 보안 운영 관점의 가장 적절한 해석과 통제 조합은?

A) 정상적인 사용 증가이므로 무시  
B) 침해(예: 채굴) 신호일 수 있으므로 Cost Anomaly Detection/Budgets 경보로 조기 탐지하고, SCP로 대형 GPU 인스턴스 타입을 제한해 피해 한계를 줄인다  
C) 인스턴스를 더 늘려 처리량을 높인다  
D) 비용은 보안과 무관하므로 재무팀에만 통보  

**정답: B**  
해설: 비정상 비용 급증, 특히 대형 GPU 인스턴스 급증은 탈취된 자격증명에 의한 암호화폐 채굴 같은 침해의 전형적 신호다. Cost Anomaly Detection·Budgets로 조기 탐지하고, SCP로 채굴용 대형 인스턴스 타입 생성을 차단해 blast radius를 줄이는 것이 보안 운영의 정석이다. 무시·확장은 위험을 키우고, 비용을 보안과 분리해 재무팀에만 넘기는 것은 탐지 기회를 놓친다.

---

**문제 5.** 신규로 조직에 합류하는 모든 계정에서 GuardDuty·Security Hub·Config가 자동으로 켜지고, 발견된 비준수가 자동 교정되게 하려 한다. 가장 적절한 설계는?

A) 계정마다 수동으로 서비스를 켠다  
B) 위임 관리자에서 자동 등록(auto-enable)을 켜고, findings를 EventBridge 규칙으로 받아 Lambda/SSM Automation으로 자동 격리·교정하는 닫힌 루프를 구성  
C) 보안 도구를 끄고 비용을 절감한다  
D) 루트 사용자로 각 계정을 점검한다  

**정답: B**  
해설: 위임 관리자에서 auto-enable을 켜면 신규 계정이 조직에 들어오는 즉시 보안 서비스가 활성화되고, findings를 EventBridge→Lambda/SSM으로 연결하면 탐지·알림·자동 교정의 닫힌 루프가 완성된다. 계정별 수동 활성화는 누락이 생기고, 보안 도구 비활성화는 거버넌스를 무너뜨리며, 루트 점검은 직무 분리·최소 권한에 반한다.

---
