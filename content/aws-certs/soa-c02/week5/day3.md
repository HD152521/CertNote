# Day 3 - Patch Manager: 보안 패치를 안전하고 컴플라이언트하게

2017년 5월 12일, WannaCry 랜섬웨어가 전 세계 200개국 20만 대 컴퓨터를 감염시켰다. 영국 국가보건서비스(NHS) 80개 기관이 마비됐고, 스페인의 텔레포니카, 독일 철도 시스템, FedEx 등이 피해를 입었다. 총 피해액은 40억 달러 이상으로 추정된다. 충격적인 사실은 이 취약점(MS17-010, EternalBlue)에 대한 패치가 감염 2개월 전인 2017년 3월 14일 Microsoft Patch Tuesday에 이미 배포됐다는 것이다. 패치를 제때 적용했다면 막을 수 있는 피해였다.

AWS Patch Manager는 이 "패치 적용 지연" 문제를 구조적으로 해결하는 도구다. 어떤 패치를 승인할지(Patch Baseline), 어떤 서버에 적용할지(Patch Group), 언제 적용할지(Maintenance Window), 결과를 어떻게 확인할지(Compliance)까지 하나의 일관된 프레임워크로 관리한다.

## 패치 관리의 기술적 역사

패치 관리 문제는 IT 역사만큼 오래됐다. 1988년 Morris Worm이 fingerd 버퍼 오버플로 취약점을 악용했을 때, 운영자들은 수동으로 패치를 배포해야 했다. 2000년대에 Microsoft의 WSUS(Windows Server Update Services), Red Hat의 RHN(Red Hat Network), Ubuntu의 Landscape 같은 도구들이 패치 중앙 관리를 가능하게 했다. 이들은 공통적으로 "어떤 패치를 승인할지"와 "언제 배포할지"를 분리하는 설계를 택했다. AWS Patch Manager도 이 철학을 계승한다.

> 💡 **관련 이론**: 패치 관리는 보안 분야의 "취약점 관리 라이프사이클"(Vulnerability Management Lifecycle)의 핵심 단계다. NIST SP 800-40 Rev.4 "Guide to Enterprise Patch Management Planning"은 패치 관리를 4단계로 정의한다: Identify(CVE 인지) → Evaluate(우선순위 결정) → Remediate(패치 적용) → Verify(결과 확인). AWS Patch Manager의 Baseline(Evaluate) → Maintenance Window(Remediate) → Compliance(Verify) 구조가 이 프레임워크와 정확히 대응한다. CVSS(Common Vulnerability Scoring System, 버전 3.1, 2019)의 0~10 점수 체계가 패치 우선순위 결정의 사실상 표준이다.

## 다른 클라우드 패치 관리와 비교

| 기능 | AWS Patch Manager | GCP VM Manager | Azure Update Management |
|------|-------------------|----------------|------------------------|
| 기반 | SSM Agent | OSConfig Agent | Azure Arc / MMA |
| 패치 기준 정의 | Patch Baseline (OS별) | OS patch job | Update classification |
| 인스턴스 분류 | Patch Group (태그 기반) | OS policy 그룹 | 컴퓨터 그룹 |
| 스케줄 | Maintenance Window | 즉시/예약 | 업데이트 배포 예약 |
| 점진 배포 | max-concurrency% | — | 최대 동시 머신 수 |
| 컴플라이언스 보고 | SSM Compliance | 준수 상태 | 업데이트 평가 |
| 멀티 OS | O (Linux 12종+, Windows) | O | O |
| 온프레미스 | Hybrid Activations | Anthos | Azure Arc |

AWS Patch Manager의 차별점은 **Patch Group + ApproveAfterDays 조합으로 구현하는 점진적 환경 롤아웃**(Dev→Stage→Prod 자동화)이다. 이 패턴은 GCP/Azure에 없는 기능이다.

> 💡 **관련 이론**: Patch Manager의 OS별 Patch Baseline은 각 OS 벤더의 패치 메타데이터를 파싱한다. Amazon Linux는 `updateinfo.xml`(RPM Advisories), Ubuntu는 `Origin:Ubuntu,Archive:security` APT 레이블, Windows는 Microsoft Update Catalog의 WSUS 분류를 사용한다. 이 메타데이터는 CVE 번호, CVSS 점수, 패치 분류(Security/Critical/Important 등)를 포함하며, AWS가 각 OS 레포지토리에서 주기적으로 동기화한다. 운영자가 패치 분류를 설정할 때 이 메타데이터 구조를 이해하면 Patch Filter를 정확하게 설계할 수 있다.

## Patch Baseline: "어떤 패치를 승인할 것인가"

Patch Baseline은 조직의 패치 정책을 코드로 표현한 것이다. "Critical 패치는 7일 내 적용, Important는 30일 내 적용"이라는 회사 정책이 있다면, 이를 Baseline으로 구현한다.

**AWS 기본 베이스라인의 한계:**

AWS는 각 OS별로 기본 베이스라인을 제공한다(`AWS-DefaultPatchBaseline`, `AWS-AmazonLinux2DefaultPatchBaseline` 등). 이 기본 베이스라인은 `Security` 분류의 `Critical`과 `Important` 패치만 공개 후 7일 뒤 자동 승인한다. PCI-DSS나 HIPAA 컴플라이언스를 요구하는 환경에서는 이것만으로 부족하다.

**패치 분류 체계:**

| 분류(Classification) | 내용 | 자동 승인 대상 |
|---------------------|------|---------------|
| `Security` | 보안 취약점 수정 | 기본 베이스라인 포함 |
| `Critical` | 심각한 버그 수정 | 기본 베이스라인 포함 |
| `Important` | 주요 기능 개선 | 커스텀 베이스라인 필요 |
| `Moderate` | 중간 우선순위 | 커스텀 베이스라인 필요 |
| `Low` | 낮은 우선순위 | 일반적으로 제외 |
| `BugFix` | 버그 수정 (비보안) | 선택적 |
| `Enhancement` | 기능 개선 | 선택적 |

**CVSS Score와 Severity의 관계:**

| CVSS 범위 | Severity |
|-----------|----------|
| 9.0 - 10.0 | Critical |
| 7.0 - 8.9 | High/Important |
| 4.0 - 6.9 | Medium/Moderate |
| 0.1 - 3.9 | Low |

> 📚 **사례**: 2023년 금융권 C사의 PCI-DSS 감사에서 "패치 적용 정책 증빙"을 요구받았다. 담당 팀이 수동 관리하던 패치 기록은 엑셀 파일이었고, 일부 서버의 패치 적용 이력이 누락되어 있었다. 이후 Patch Manager와 Compliance를 도입하고 S3에 자동 저장되는 패치 이력을 감사 증빙으로 제출했다. 다음 해 감사에서 "자동화된 패치 관리 프로세스 구축" 항목에서 Good Practice 평가를 받았다. PCI-DSS v4.0 요구사항 6.3.3(모든 시스템 컴포넌트는 보안 취약점으로부터 보호)을 Patch Manager + Compliance 보고서로 직접 충족했다.

**커스텀 Patch Baseline 구성:**

```bash
# 1. Prod 환경용 보수적 Linux 베이스라인
aws ssm create-patch-baseline \
  --name "Prod-AmazonLinux2-Baseline" \
  --operating-system "AMAZON_LINUX_2" \
  --description "Conservative baseline: Security+Critical only, 14-day wait" \
  --approval-rules '{
    "PatchRules": [
      {
        "PatchFilterGroup": {
          "PatchFilters": [
            {"Key": "CLASSIFICATION", "Values": ["Security"]},
            {"Key": "SEVERITY", "Values": ["Critical", "Important"]}
          ]
        },
        "ApproveAfterDays": 14,
        "ComplianceLevel": "CRITICAL",
        "EnableNonSecurity": false
      }
    ]
  }' \
  --rejected-patches "kernel*" \
  --rejected-patches-action "BLOCK" \
  --tags '[{"Key":"Environment","Value":"prod"}]'

# 2. Dev 환경용 공격적 베이스라인 (빠른 적용으로 검증)
aws ssm create-patch-baseline \
  --name "Dev-AmazonLinux2-Baseline" \
  --operating-system "AMAZON_LINUX_2" \
  --description "Aggressive baseline: all patches, immediate approval" \
  --approval-rules '{
    "PatchRules": [
      {
        "PatchFilterGroup": {
          "PatchFilters": [
            {"Key": "CLASSIFICATION", "Values": ["Security", "Bugfix", "Enhancement"]},
            {"Key": "SEVERITY", "Values": ["Critical", "Important", "Medium", "Low"]}
          ]
        },
        "ApproveAfterDays": 0,
        "ComplianceLevel": "MEDIUM",
        "EnableNonSecurity": true
      }
    ]
  }'
```

> ⚠️ **함정**: `rejected-patches-action: "BLOCK"`은 해당 패치가 이미 설치된 인스턴스도 NON_COMPLIANT로 표시한다. 커널 패치(`kernel*`)를 BLOCK하면 커널 업데이트 없이 운영하는 회사들이 있는데, 이 경우 `InstalledRejectedCount`가 올라가며 컴플라이언스 점수에 영향을 준다. 반면 `rejected-patches-action: "ALLOW_AS_DEPENDENCY"`는 의존성 때문에 설치되는 경우를 허용한다. Rejected Patches 목록이 Approved Patches 명시 목록보다 낮은 우선순위를 가지므로, 명시적 Approved에 있는 패치는 Rejected 목록과 관계없이 적용된다.

**베이스라인의 Approved/Rejected 목록:**

Approval Rules로 자동 승인이 정의되지만, 특정 패치를 명시적으로 승인하거나 거부할 수도 있다. 이 명시적 목록이 Rule보다 우선한다.

```bash
# 특정 패치 명시적 승인 (Rule에 해당 안 돼도 적용)
aws ssm update-patch-baseline \
  --baseline-id pb-0123456789abcdef0 \
  --approved-patches "kernel-5.10.209-198.812.amzn2.x86_64"

# 특정 패치 명시적 거부 (알려진 문제 있는 패치)
aws ssm update-patch-baseline \
  --baseline-id pb-0123456789abcdef0 \
  --rejected-patches "kernel-5.10.162-141.795.amzn2.x86_64" \
  --rejected-patches-action "BLOCK"
```

## Patch Group: "어느 서버에 어느 정책을"

Patch Group은 인스턴스를 특정 Patch Baseline에 연결하는 태그 기반 매핑이다.

**핵심 규칙 (시험 빈출):**

1. 태그 키는 **정확히 `Patch Group`** (대소문자 구분, 공백 포함) — 다른 이름은 인식되지 않는다
2. 한 인스턴스는 정확히 한 Patch Group에만 속할 수 있다 (단 하나의 값)
3. 한 Patch Baseline에 여러 Patch Group을 연결할 수 있다

```bash
# 인스턴스에 Patch Group 태그 추가 (공백 포함 주의!)
aws ec2 create-tags \
  --resources i-0123456789abcdef0 i-0987654321fedcba0 \
  --tags 'Key=Patch Group,Value=prod-web'

# Patch Group을 Baseline에 연결
aws ssm register-patch-baseline-for-patch-group \
  --baseline-id "pb-0123456789abcdef0" \
  --patch-group "prod-web"

# 같은 Baseline에 다른 그룹도 연결 가능
aws ssm register-patch-baseline-for-patch-group \
  --baseline-id "pb-0123456789abcdef0" \
  --patch-group "prod-api"
```

**표준 환경별 Patch Group 설계:**

| Patch Group 값 | Baseline | ApproveAfterDays | 의미 |
|----------------|----------|------------------|------|
| `dev` | Dev-Baseline | 0 | 새 패치 즉시 Dev에서 검증 |
| `stage` | Stage-Baseline | 3 | Dev에서 3일 검증 후 Stage 적용 |
| `prod-web` | Prod-Baseline | 14 | Stage에서 11일 더 검증 후 Prod 적용 |
| `prod-db` | Prod-DB-Baseline | 21 | DB는 더 보수적으로 |

이 설계로 같은 패치가 자연스럽게 Dev → Stage → Prod 순서로 롤아웃된다.

> 🔍 **더 깊이**: ApproveAfterDays 기반의 점진적 패치 적용은 소프트웨어 배포의 "Canary Release" 패턴을 패치 관리에 적용한 것이다. Martin Fowler가 2010년 정의한 Canary Release는 "변경을 전체 사용자에 즉시 배포하지 않고, 일부 환경/사용자에 먼저 배포해 문제가 없으면 확대"하는 방식이다. 패치 베이스라인의 ApproveAfterDays가 0일(Dev), 3일(Stage), 14일(Prod)로 차이를 두는 것이 이 패턴의 구현이다. 패치로 인한 커널 패닉, 서비스 중단, 호환성 문제가 Dev에서 먼저 발견되고 Prod에는 영향이 없도록 설계된다. 실제로 2024년 7월 CrowdStrike 업데이트 사고처럼 잘못된 소프트웨어 업데이트가 대규모 장애를 야기한 사례에서, 점진 배포가 있었다면 전체 8.5백만 대가 아닌 일부만 영향받았을 것이다.

## Patch 작업: Scan과 Install의 차이

```bash
# Scan: 점검만 (실제 패치 적용 X)
aws ssm send-command \
  --document-name "AWS-RunPatchBaseline" \
  --parameters '{"Operation":["Scan"]}' \
  --targets '[{"Key":"tag:Patch Group","Values":["prod-web"]}]' \
  --max-concurrency "20%"

# 결과: 어떤 패치가 누락됐는지 Compliance 데이터 업데이트
# 실제 패치 적용 없이 "만약 지금 Install하면 어떻게 되는가" 파악

# Install: 점검 + 적용
aws ssm send-command \
  --document-name "AWS-RunPatchBaseline" \
  --parameters '{
    "Operation":["Install"],
    "RebootOption":["RebootIfNeeded"]
  }' \
  --targets '[{"Key":"tag:Patch Group","Values":["prod-web"]}]' \
  --max-concurrency "10%" \
  --max-errors "5%"
```

**Reboot 옵션 비교:**

| 옵션 | 동작 | 위험 |
|------|------|------|
| `RebootIfNeeded` (기본) | 패치가 재부팅을 요구하면 즉시 재부팅 | 갑작스러운 재부팅으로 서비스 중단 |
| `NoReboot` | 재부팅 하지 않음 | `InstalledPendingReboot` 상태가 남고 다음 점검 시 적용 안 됨으로 보고될 수 있음 |

운영 모범 사례는 Maintenance Window + ELB deregistration 조합이다. 패치 전에 ALB/NLB Target Group에서 인스턴스를 제거하고, 패치 + 재부팅 후 다시 등록한다. 이 패턴을 SSM Automation Runbook으로 구현할 수 있다.

**무중단 패치 Automation Runbook 개념:**

```yaml
# 무중단 패치 Runbook 구조 (개념)
mainSteps:
  - name: DeregisterFromELB
    action: aws:executeAwsApi
    inputs:
      Service: elbv2
      Api: DeregisterTargets
      TargetGroupArn: '{{ TargetGroupArn }}'
      Targets: [{"Id": "{{ InstanceId }}"}]

  - name: WaitForDeregistration
    action: aws:waitForAwsResourceProperty
    inputs:
      Service: elbv2
      Api: DescribeTargetHealth
      DesiredValues: ["unused"]

  - name: InstallPatches
    action: aws:runCommand
    inputs:
      DocumentName: AWS-RunPatchBaseline
      Parameters:
        Operation: [Install]
        RebootOption: [RebootIfNeeded]

  - name: WaitForReboot
    action: aws:sleep
    inputs:
      Duration: PT3M  # 재부팅 + 서비스 시작 대기

  - name: HealthCheck
    action: aws:assertAwsResourceProperty
    inputs:
      Service: ec2
      Api: DescribeInstanceStatus
      DesiredValues: ["ok"]

  - name: RegisterToELB
    action: aws:executeAwsApi
    inputs:
      Service: elbv2
      Api: RegisterTargets
      TargetGroupArn: '{{ TargetGroupArn }}'
      Targets: [{"Id": "{{ InstanceId }}"}]
```

> 💡 **관련 이론**: ELB Deregister → 패치 → 재부팅 → 재등록 패턴은 분산 시스템 "rolling update" 패턴의 정확한 구현이다. Kubernetes의 RollingUpdate 배포 전략이 Pod를 하나씩 교체하는 것과 동일하다. 핵심은 "Connection Draining"으로, AWS ELB에서는 Deregistration Delay(기본 300초)가 이미 연결된 클라이언트 세션이 완료될 때까지 트래픽을 유지한다. 패치 전 `WaitForDeregistration` 단계가 이 300초 내로 기존 세션이 완료되기를 기다리는 것이다. Connection Draining 없이 즉시 패치하면 진행 중인 HTTP 트랜잭션이 강제 종료된다.

## Patch Compliance: 결과를 수치로

Patch Manager가 Scan 또는 Install을 실행하면 각 인스턴스의 패치 상태가 SSM Compliance 데이터베이스에 업데이트된다.

**Compliance 상태 지표:**

| 지표 | 의미 | 운영 조치 |
|------|------|-----------|
| `InstalledCount` | 베이스라인 승인 패치 중 설치된 수 | — |
| `InstalledOtherCount` | 베이스라인 외 설치된 패치 수 | 감사 필요 |
| `InstalledPendingRebootCount` | 설치됐지만 재부팅 대기 중 | 재부팅 스케줄 필요 |
| `InstalledRejectedCount` | Rejected 목록의 패치가 설치됨 | 즉시 제거 검토 |
| `MissingCount` | 베이스라인 승인됐지만 미설치 | NON_COMPLIANT |
| `FailedCount` | 설치 시도 실패 | 원인 분석 |
| `NotApplicableCount` | 이 OS에 해당 없는 패치 | — |

```bash
# 전체 인스턴스 패치 상태 요약
aws ssm describe-instance-patch-states-for-patch-group \
  --patch-group "prod-web" \
  --query 'InstancePatchStates[*].[InstanceId,MissingCount,FailedCount,InstalledPendingRebootCount]' \
  --output table

# MissingCount > 0인 인스턴스만 필터
aws ssm describe-instance-patch-states \
  --instance-ids $(aws ssm describe-instance-information \
    --query 'InstanceInformationList[*].InstanceId' --output text) \
  --query 'InstancePatchStates[?MissingCount>`0`].[InstanceId,PatchGroup,MissingCount,FailedCount]' \
  --output table

# 특정 인스턴스의 누락된 패치 목록
aws ssm describe-instance-patches \
  --instance-id i-0123456789abcdef0 \
  --filters 'Key=State,Values=Missing'
```

> 🔍 **더 깊이**: `InstalledPendingRebootCount`가 올라가는 경우가 시험에 자주 출제된다. 이 상태는 패치 파일이 디스크에 설치됐지만 재부팅 후 커널/시스템에 로드되어야 하는 패치가 있을 때 발생한다. Linux에서는 `needs-restarting -r` 명령으로 재부팅 필요 여부를 확인할 수 있다. Windows에서는 `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired` 레지스트리 키로 확인한다. `RebootIfNeeded` 옵션 없이 `NoReboot`로 패치하거나, ELB deregister 없이 재부팅을 피한 경우 이 상태가 지속된다.

## Patch Policy (Quick Setup): 멀티 계정 패치 거버넌스

2023년에 출시된 Patch Policy는 Organizations와 통합되어 멀티 계정·멀티 리전에 패치 정책을 한 번에 배포한다.

```bash
# Quick Setup Patch Policy (콘솔 또는 CLI)
# Organizations 관리 계정에서 실행
aws ssm create-resource-data-sync \
  --sync-name "OrgPatchCompliance" \
  --s3-destination '{
    "BucketName": "org-patch-compliance",
    "Region": "ap-northeast-2",
    "SyncFormat": "JsonSerDe"
  }'

# 각 계정의 컴플라이언스를 중앙 S3에 집계 후 Athena 분석
# SELECT account_id, instance_id, missing_count, patch_group
# FROM "org_patch_compliance"."aws_patchcompliancesummary"
# WHERE missing_count > 0
# ORDER BY missing_count DESC
```

> 📚 **사례**: 2024년, 글로벌 제조업체 D사가 AWS Organizations 기반 멀티 계정 환경(23개 계정, 3개 리전)에서 Patch Policy를 도입했다. Quick Setup에서 Patch Policy를 한 번 설정하자 StackSets가 자동으로 모든 계정·리전에 Patch Baseline, Patch Group 설정, Maintenance Window를 배포했다. 중앙 S3 + Athena 대시보드에서 전사 패치 컴플라이언스율을 실시간으로 확인할 수 있게 됐다. 이전에는 각 계정 팀이 독자적으로 패치를 관리해 전사 컴플라이언스율을 파악하는 데 2주가 걸렸는데, 도입 후 실시간 확인이 가능해졌다. NIST 800-171의 SI-2(Flaw Remediation) 요건을 충족하는 증빙으로 감사관이 이 대시보드를 직접 확인했다.

## 트러블슈팅: 패치가 적용 안 될 때

**체계적인 확인 순서:**

```bash
# 1. Managed Instance 확인
aws ssm describe-instance-information \
  --filters "Key=InstanceIds,Values=i-0123456789abcdef0" \
  --query 'InstanceInformationList[0].[PingStatus,PlatformName,PlatformVersion]'

# 2. Patch Group 태그 확인 (공백 포함 정확한 이름!)
aws ec2 describe-tags \
  --filters "Name=resource-id,Values=i-0123456789abcdef0" "Name=key,Values=Patch Group"

# 3. Patch Group이 어느 Baseline에 연결됐는지
aws ssm get-patch-baseline-for-patch-group \
  --patch-group "prod-web"

# 4. Baseline의 승인 규칙 확인
aws ssm get-patch-baseline \
  --baseline-id pb-0123456789abcdef0

# 5. 패치 컴플라이언스 상세 조회 (어떤 패치가 누락인지)
aws ssm list-compliance-items \
  --resource-ids i-0123456789abcdef0 \
  --resource-types ManagedInstance \
  --filters 'Key=ComplianceType,Values=Patch' \
           'Key=STATUS,Values=NON_COMPLIANT'

# 6. SSM Agent 로그 확인 (인스턴스 내부)
# sudo tail -100 /var/log/amazon/ssm/amazon-ssm-agent.log
# sudo tail -100 /var/log/amazon/ssm/errors.log
```

> ⚠️ **함정**: Patch Group 태그가 올바르게 설정됐는데도 패치가 안 되는 경우, Patch Group과 Baseline의 연결(`register-patch-baseline-for-patch-group`)이 누락된 경우가 있다. 태그와 Baseline 연결은 별개 작업이다. `get-patch-baseline-for-patch-group` 명령으로 연결 상태를 반드시 확인한다. 또 다른 함정: Patch Group이 지정되지 않은 인스턴스는 OS별 **AWS 기본 베이스라인**을 자동으로 사용한다. 의도치 않게 기본 베이스라인이 적용되어 "왜 모든 패치가 아니라 일부만 적용됐지?" 하는 혼란이 생긴다.

## Inspector와의 연계: CVE 기반 우선순위 패치

AWS Inspector(v2)는 EC2 인스턴스의 취약점을 CVE 기준으로 스캔하고 CVSS Score로 우선순위를 매긴다. Inspector 발견 사항을 Patch Manager와 연계하면 가장 위험한 CVE부터 우선 패치하는 워크플로를 구축할 수 있다.

```bash
# Inspector 발견 사항 조회 (CRITICAL CVE 중 패치 가능한 것)
aws inspector2 list-findings \
  --filter-criteria '{
    "severity":[{"comparison":"EQUALS","value":"CRITICAL"}],
    "findingType":[{"comparison":"EQUALS","value":"PACKAGE_VULNERABILITY"}],
    "fixAvailable":[{"comparison":"EQUALS","value":"YES"}]
  }' \
  --query 'findings[*].[findingArn,packageVulnerabilityDetails.cvss[0].score,packageVulnerabilityDetails.vulnerabilityId,resources[0].id]'
```

Inspector가 발견한 CVE의 패키지 버전 정보를 Patch Baseline의 Approved Patches에 명시적으로 추가하거나, Inspector 알람을 EventBridge로 받아 Patch Manager를 자동 트리거하는 패턴이 보안 운영의 미래 방향이다.

> 💡 **관련 이론**: Inspector + Patch Manager 통합은 "Risk-Based Patching"의 AWS 구현이다. 전통적 패치 관리가 "모든 패치를 분류 기준으로 적용"하는 정책 기반이라면, Risk-Based Patching은 CVSS Score + 실제 환경 노출도(인터넷 facing 여부, 데이터 민감도)를 고려해 우선순위를 동적으로 결정한다. CISA(미국 사이버보안청)의 KEV(Known Exploited Vulnerabilities) 목록과 Inspector를 연계하면 "실제 공격에 사용되는 취약점"을 최우선으로 패치하는 파이프라인을 구축할 수 있다. Tenable.io, Qualys, Rapid7 등 상용 취약점 스캐너가 같은 원리를 구현한다.

## 전체 흐름 정리

```
Patch Manager 표준 운영 흐름
============================================================

[1단계] 정책 수립
  Patch Baseline 생성
    ├── Dev: 모든 패치, 0일 대기 (빠른 검증)
    ├── Stage: Sec/Critical/Important, 3일 대기
    └── Prod: Sec/Critical, 14일 대기 (안전 우선)

[2단계] 인스턴스 분류
  EC2 태그: Key="Patch Group", Value="prod-web"
  → register-patch-baseline-for-patch-group으로 연결

[3단계] 사전 점검 (선택 사항)
  AWS-RunPatchBaseline, Operation=Scan
  → 어떤 패치가 누락인지 파악 (적용 없음)

[4단계] 패치 적용
  Maintenance Window
  ├── Task 1: EBS Snapshot (Priority 1)
  ├── Task 2: ELB Deregister (Priority 2)
  ├── Task 3: AWS-RunPatchBaseline Install (Priority 3)
  ├── Task 4: Health Check (Priority 4)
  └── Task 5: ELB Register (Priority 5)
  Concurrency: 10%, Error Tolerance: 5%

[5단계] 결과 확인
  Compliance 대시보드
  ├── MissingCount > 0 → NON_COMPLIANT
  └── Inspector 연계로 CVE 우선순위 패치
```

## 📝 연습 문제

**문제 1.** 회사 보안팀이 "EC2에 Critical 보안 패치를 공개 후 7일 이내에 적용해야 한다"는 정책을 수립했다. Patch Baseline에서 이 정책을 어떻게 구현하는가?

A) Approval Rules에서 SEVERITY를 Critical, ApproveAfterDays를 7로 설정한다
B) Approval Rules에서 CLASSIFICATION을 Security, SEVERITY를 Critical, ApproveAfterDays를 7로 설정한다
C) Approved Patches에 모든 Critical 패치를 수동으로 추가한다
D) AWS 기본 베이스라인이 이 정책을 자동으로 처리한다

**정답: B**
해설: CLASSIFICATION과 SEVERITY를 함께 지정해야 한다. CLASSIFICATION=Security는 보안 관련 패치만 대상으로 하고, SEVERITY=Critical은 그 중 Critical만 선택한다. ApproveAfterDays=7은 공개 후 7일이 지난 패치를 자동 승인한다. AWS 기본 베이스라인(D)은 7일이 아닌 패치마다 다른 대기 기간을 사용하며, Important는 포함하지 않는다.

---

**문제 2.** EC2 인스턴스에 `Patch Group=prod-web` 태그가 있고 베이스라인도 이 Patch Group에 연결되어 있는데, 패치가 적용되지 않는다. SSM Managed Instances 목록에는 정상적으로 나타난다. 가장 가능성 높은 원인은?

A) 보안 그룹에서 443 포트가 막혀 있다
B) 태그 이름이 "PatchGroup"으로 잘못 설정되어 있다 (정확한 이름은 "Patch Group", 공백 포함)
C) Maintenance Window가 설정되지 않았다
D) AWS 기본 베이스라인만 사용할 수 있다

**정답: B**
해설: SSM Patch Manager는 태그 키가 정확히 `Patch Group`(대소문자 구분, 공백 포함)이어야만 인식한다. `PatchGroup`, `patchgroup`, `patch-group`, `Patch_Group` 모두 인식하지 못한다. 인스턴스가 Managed Instance 목록에 나타나므로(A) 네트워크는 문제없다. C는 즉시 Scan 실행으로 우회 가능하다. D는 사실이 아니다.

---

**문제 3.** 운영팀이 패치 적용 전에 어떤 패치가 누락되어 있는지 파악하고, 실제로 적용하지 않고 영향도를 평가하려 한다. 어떤 방법을 사용해야 하는가?

A) AWS-RunPatchBaseline Document를 Operation=Install로 실행하고 결과를 확인한다
B) AWS-RunPatchBaseline Document를 Operation=Scan으로 실행하고 Compliance 데이터를 조회한다
C) Inspector를 실행해 취약점을 스캔한다
D) CloudTrail에서 패치 이력을 조회한다

**정답: B**
해설: Scan 작업은 실제 패치를 설치하지 않고 베이스라인 대비 누락된 패치 목록을 파악한다. 결과는 SSM Compliance 데이터로 저장되어 `describe-instance-patch-states`나 `list-compliance-items`로 조회한다. 이후 영향도를 검토하고 Install 여부를 결정하는 것이 운영 모범 사례다.

---

**문제 4.** WannaCry와 유사한 취약점이 발표됐다. 조직의 모든 Windows 서버에 긴급 패치를 즉시 적용해야 한다. Maintenance Window를 기다릴 수 없다. 어떻게 하는가?

A) Maintenance Window 스케줄을 지금 시각으로 변경한다
B) Run Command로 AWS-RunPatchBaseline(Operation=Install)을 직접 실행하고, max-concurrency와 max-errors를 설정해 점진 배포한다
C) 각 서버에 SSH로 접속해 수동으로 패치한다
D) Inspector를 통해 자동으로 패치를 적용한다

**정답: B**
해설: 긴급 상황에서는 Maintenance Window를 기다리지 않고 Run Command로 즉시 실행할 수 있다. `Operation=Install`, `max-concurrency 10%`, `max-errors 5%`로 점진적으로 적용하면 서비스 영향을 최소화한다. Patch Group 태그가 있으면 베이스라인이 자동 적용된다. Maintenance Window는 예약된 시간에만 실행되므로 긴급 시에는 Run Command가 더 적합하다.

---

**문제 5.** Patch Compliance 보고서에서 특정 인스턴스가 `InstalledPendingRebootCount=3`으로 표시되어 있다. 이 의미는?

A) 3개의 패치가 설치에 실패했다
B) 3개의 패치가 설치됐지만 재부팅이 완료되어야 완전히 적용된다
C) 3개의 패치가 아직 베이스라인에 승인되지 않았다
D) 3개의 패치가 Rejected 목록에 있지만 설치됐다

**정답: B**
해설: `InstalledPendingRebootCount`는 패치 파일은 설치됐지만 재부팅 후에야 실제 적용되는 패치의 수다. Linux 커널 패치나 일부 Windows 시스템 업데이트가 이에 해당한다. RebootOption=NoReboot으로 패치했거나 재부팅이 지연된 경우 발생한다. 다음 Maintenance Window에서 재부팅을 포함한 Install을 실행하거나, 별도로 인스턴스 재부팅을 계획해야 한다.

---

**문제 6.** 회사가 Dev → Stage → Prod 환경 순서로 동일한 보안 패치가 자동으로 점진 적용되게 하려 한다. 코드나 Manual 작업 없이 이를 구현하는 방법은?

A) 환경별로 다른 Maintenance Window 스케줄을 사용한다
B) 환경별로 다른 ApproveAfterDays를 가진 Patch Baseline을 생성하고 Patch Group으로 연결한다 (Dev=0일, Stage=3일, Prod=14일)
C) 각 환경의 IAM Role을 다르게 설정한다
D) Patch Policy를 사용해 순서를 지정한다

**정답: B**
해설: ApproveAfterDays의 차이가 자동 점진 배포의 핵심이다. 패치가 공개되면 Dev는 즉시(0일), Stage는 3일 후, Prod는 14일 후 자동 승인된다. Maintenance Window가 각 환경마다 주기적으로 실행되면 해당 시점에 베이스라인이 승인한 패치만 적용된다. 14일 동안 Dev와 Stage에서 문제가 없으면 Prod에 자동으로 적용되는 완전 자동화 흐름이다.

---

**문제 7.** OS별 Patch Baseline에서 Amazon Linux 2, Ubuntu 22.04, Windows Server 2022를 모두 관리하는 환경에서 각 OS에 맞는 Patch Baseline을 효율적으로 운영하는 방법은?

A) 하나의 Baseline으로 모든 OS를 관리한다
B) OS별로 별도 Baseline을 생성하고, 각 인스턴스의 `Patch Group` 태그에 OS 정보를 포함시킨다 (예: `prod-web-al2`, `prod-web-ubuntu`, `prod-web-win`)
C) OS마다 별도 AWS 계정을 사용한다
D) AWS 기본 베이스라인만 사용하면 자동으로 OS를 구분한다

**정답: B**
해설: Patch Baseline은 OS별로 생성해야 한다 (하나의 Baseline은 하나의 OS 타입만 지원). 각 OS 타입에 맞는 Baseline을 만들고(AMAZON_LINUX_2, UBUNTU, WINDOWS), 인스턴스 Patch Group 태그로 올바른 Baseline에 연결한다. AWS 기본 Baseline은 OS를 자동 구분하지만 커스텀 정책을 반영하지 못한다.

---
