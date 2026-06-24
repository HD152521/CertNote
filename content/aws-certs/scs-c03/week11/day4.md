# Day 4 - 멀티계정 보안 운영: Firewall Manager, 중앙 정책 배포, 비용·태그 거버넌스, 보안 베이스라인 자동화

거버넌스 천장(SCP), 베이스라인 자동화(Control Tower), 증거 수집(Audit Manager)을 갖췄다면, 남은 것은 *일상 운영*이다. 수백 개 계정에 방화벽 정책을 일관되게 깔고, 태그·비용을 통제하고, 새 계정이 태어날 때마다 보안 도구가 자동으로 켜지게 하는 운영 평면이다. 이 날의 핵심은 **AWS Firewall Manager**(중앙 방화벽 정책 배포), **태그·비용 거버넌스**, 그리고 **보안 베이스라인 자동화**다.

## AWS Firewall Manager: 방화벽 정책의 중앙 배포기

WAF·Shield·Security Group·Network Firewall·Route 53 Resolver DNS Firewall를 계정마다 손으로 설정하면 누락과 드리프트가 불가피하다. **Firewall Manager(FMS)**는 조직 전역에 방화벽 정책을 *한 번 정의해 자동 배포·강제*하는 서비스다.

전제 조건이 중요하다(시험 단골):
1. **AWS Organizations 활성화** (FMS는 조직 기반 서비스)
2. **Firewall Manager 관리자 계정 지정** — 관리 계정이 위임 관리자 계정(통상 Security 계정)을 FMS 관리자로 지정
3. **AWS Config 활성화** — FMS는 Config로 리소스를 평가해 준수 여부를 판단
4. WAF/Shield 정책이면 해당 서비스 사전 활성화

```
관리 계정 ──(FMS 관리자 지정)──▶ Security 계정(FMS Admin)
                                     │ 정책 정의 1회
   ┌─────────────┬─────────────┬─────┘
   ▼             ▼             ▼
계정 A          계정 B          계정 C   (정책 자동 배포 + 비준수 자동 교정)
```

FMS가 배포·강제할 수 있는 정책 유형:
- **WAF 정책**: 공통 Web ACL(관리형 규칙 그룹 포함)을 ALB/CloudFront/API Gateway 등에 자동 연결.
- **Shield Advanced 정책**: 보호 대상 리소스에 Shield Advanced를 일괄 적용.
- **Security Group 정책**: 공통 SG 또는 *감사형* SG 정책(과도하게 개방된 0.0.0.0/0 인바운드 탐지·교정).
- **Network Firewall 정책**: 중앙 검사 VPC의 방화벽 정책을 다계정 배포.
- **Route 53 Resolver DNS Firewall 정책**: 악성 도메인 차단 규칙 그룹 배포.

FMS의 강점은 **신규 리소스 자동 보호**다. 정책 범위(계정·리소스 태그)에 맞는 새 리소스가 생기면 FMS가 자동으로 정책을 적용한다. "WAF를 안 붙인 ALB"가 새로 생겨도 FMS가 자동 연결한다.

> 💡 **관련 이론**: 이것은 *정책의 선언적 강제(declarative enforcement)*와 *지속적 교정(continuous remediation)*이다. 정책을 한 번 선언하면 시스템이 현재 상태를 선언 상태로 *수렴*시킨다(Kubernetes의 reconcile loop와 동일한 사고). 사람이 매번 적용하는 명령형 운영의 누락을 구조적으로 제거한다.

## FMS vs WAF vs Network Firewall 역할 구분

| 서비스 | 본질 | 관계 |
|---|---|---|
| **WAF** | 단일 Web ACL을 한 리소스에 적용 | FMS가 *배포*하는 대상 |
| **Network Firewall** | VPC 트래픽 검사(stateful/IPS) | FMS가 *배포*하는 대상 |
| **Firewall Manager** | 위 정책들을 *조직 전역 배포·강제·교정* | 오케스트레이터 |

시험에서 "여러 계정에 WAF를 일관 적용하고 신규 리소스도 자동 보호" → 답은 거의 항상 **Firewall Manager**다. 단일 리소스 보호면 WAF 직접이다.

```json
// FMS WAF 정책 (개념). resourceType 대상에 공통 Web ACL 자동 연결
{
  "PolicyName": "Org-Common-WAF",
  "ResourceType": "AWS::ElasticLoadBalancingV2::LoadBalancer",
  "SecurityServicePolicyData": {
    "Type": "WAFV2",
    "ManagedServiceData": "{ \"preProcessRuleGroups\":[{\"managedRuleGroupIdentifier\":{\"vendorName\":\"AWS\",\"managedRuleGroupName\":\"AWSManagedRulesCommonRuleSet\"}}], \"defaultAction\":{\"type\":\"ALLOW\"} }"
  },
  "RemediationEnabled": true,
  "IncludeMap": { "ORG_UNIT": ["ou-xxxx-prod"] }
}
```

`RemediationEnabled: true`면 비준수 리소스를 FMS가 자동 교정한다.

## 태그 거버넌스

태그는 비용 배분·접근 통제(ABAC)·자동화의 기반이다. 태그가 일관되지 않으면 비용 추적도, 태그 기반 권한도 무너진다. 조직 규모의 태그 거버넌스는 세 축으로 강제한다.

1. **Tag Policies(Organizations)**: 허용 태그 키·값·대소문자 표준을 정의하고 비준수 리소스를 *보고*한다(주로 탐지·표준화).
2. **SCP로 태그 강제**: 생성 시 필수 태그가 없으면 *차단*(예방).
   ```json
   {
     "Sid": "RequireCostCenterTag",
     "Effect": "Deny",
     "Action": ["ec2:RunInstances","rds:CreateDBInstance"],
     "Resource": "*",
     "Condition": { "Null": { "aws:RequestTag/CostCenter": "true" } }
   }
   ```
3. **Config 규칙(required-tags)**: 이미 존재하는 리소스의 태그 누락을 탐지·교정.

태그는 **ABAC(Attribute-Based Access Control)**의 핵심이기도 하다. `aws:ResourceTag`/`aws:PrincipalTag`로 "같은 팀 태그를 가진 리소스만 접근" 같은 동적 권한을 줄 수 있어, 계정·리소스 증가에도 정책 수가 폭발하지 않는다.

> 💡 **관련 이론**: 태그 일관성은 *데이터 거버넌스*의 클라우드판이다. 일관된 메타데이터(태그)가 없으면 비용·보안·운영의 모든 후속 자동화가 신뢰할 수 없는 입력 위에 서게 된다 — "garbage in, garbage out". 예방(SCP)·표준화(Tag Policy)·교정(Config)을 함께 써야 한다.

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

## 보안 베이스라인 자동화

새 계정이 태어날 때마다 보안 도구가 자동으로 켜지고, 비준수가 자동 교정되게 만드는 것이 다계정 보안 운영의 종착점이다. 구성 요소:

- **GuardDuty / Security Hub / Config 자동 활성화**: 위임 관리자에서 "자동 등록(auto-enable)"을 켜면 신규 계정이 조직에 들어오는 즉시 활성화된다.
- **EventBridge 기반 자동 대응**: GuardDuty/Security Hub findings → EventBridge 규칙 → Lambda/SSM Automation으로 자동 격리·교정.
   ```
   GuardDuty finding(예: 노출된 액세스 키) 
     → EventBridge 규칙 매칭 
     → Lambda: 키 비활성화 + SNS 알림 + 인스턴스 격리 SG로 교체
   ```
- **Config 자동 교정(remediation)**: 비준수 리소스에 SSM Automation 문서를 자동 실행(예: 퍼블릭 S3 버킷의 퍼블릭 액세스 차단 재적용).
- **계정 팩토리 후처리**: 신규 계정 발급 직후 베이스라인(추가 SCP·로그 구독·태그·IAM 역할)을 IaC로 자동 적용(AFT/CfCT).

이로써 "탐지 → 알림 → 자동 교정"의 닫힌 루프가 조직 전역에서 동작한다.

## 함정 정리

- Firewall Manager는 *Config가 활성화*되어 있어야 동작한다. Config 없이는 준수 평가·교정 불가.
- FMS는 관리 계정이 아니라 *위임 관리자(보통 Security 계정)*를 FMS 관리자로 두는 것이 모범.
- "여러 계정에 WAF/SG/Network Firewall 일관 적용 + 신규 자동 보호" → WAF 직접이 아니라 *Firewall Manager*.
- 태그 거버넌스는 예방(SCP)·표준화(Tag Policy)·교정(Config) 세 가지를 함께 써야 완성된다.
- 비정상 비용 급증은 *보안 신호*일 수 있다 — Budgets/Cost Anomaly Detection을 침해 탐지에 연계.
- 신규 계정 보안은 자동 등록(auto-enable)으로 깔고, 비준수는 EventBridge+Lambda/SSM으로 자동 교정.

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
