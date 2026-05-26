# Day 4 - Audit Manager, License Manager, Resource Explorer: 감사 자동화와 운영 가시성의 설계

어느 금융 스타트업이 처음 ISO 27001 인증을 받으려 한다. 외부 감사관이 요청 목록을 보내왔다. "지난 6개월간 MFA 없이 콘솔에 접근한 사례", "RDS 암호화 적용 현황 전수 조사", "IAM 정책 변경 이력 일체." 운영팀은 CloudTrail 로그를 뒤지고, Config 결과를 엑셀로 내보내고, 수동으로 스크린샷을 찍어 PDF로 정리했다. 두 명이 꼬박 3주를 썼다. 다음 해 다시 감사가 예고됐다. 또 3주를 써야 하나.

이것이 AWS Audit Manager가 해결하려는 문제다. 감사(audit)는 본래 주기적으로 반복되고, 요구하는 증거의 형식은 Framework마다 달라지며, 같은 증거를 여러 Framework에서 중복으로 요청하는 경우도 많다. 수작업으로 이 과정을 처리하면 인적 오류가 생기고, 담당자가 바뀌면 맥락이 사라지며, 무엇보다 "운영하면서 감사를 병행"하는 것 자체가 인력 낭비다. Audit Manager는 이 반복 작업을 자동화하고, 언제 감사가 와도 증거를 즉시 꺼낼 수 있는 상태를 만드는 것을 목표로 설계됐다. 오늘은 Audit Manager의 내부 구조부터 시작해 License Manager의 BYOL 강제 메커니즘, Resource Explorer의 멀티 리전 인덱스 설계까지 "운영자가 실제로 쓰는" 방식으로 파고든다.

## AWS Audit Manager: 증거 수집 자동화의 내부 구조

Audit Manager를 이해하려면 먼저 감사의 구조를 알아야 한다. 감사는 항상 두 가지를 묻는다. "규정이 존재하는가(policy)"와 "규정이 실제로 지켜지고 있는가(evidence)." Audit Manager는 후자, 즉 증거 수집을 자동화한다. 전자는 여전히 조직의 책임이다.

구성 요소는 네 단계 계층으로 이루어진다. **Framework**는 감사 표준 전체다. PCI-DSS Framework에는 수백 개의 개별 통제 항목이 포함된다. **Control**은 Framework 안의 단위 통제다. "콘솔 접근에 MFA가 강제되어야 한다"가 하나의 Control이다. 각 Control은 하나 이상의 **Data Source**를 가진다. Data Source는 증거를 어디서 가져올지 지정한다. AWS Config Rule 결과, CloudTrail API 호출, Security Hub Finding, AWS API 직접 호출 네 가지 유형이 있다. **Assessment**는 특정 Framework를 특정 계정·리전 범위에 적용한 실행 인스턴스다. Assessment를 활성화하면 Audit Manager가 지정된 Data Source에서 주기적으로 증거를 당겨와 각 Control에 연결한다. 증거가 쌓이면 감사관이 콘솔에서 검토하고, 최종적으로 PDF 또는 CSV로 보고서를 내보낸다.

> 💡 **설계 철학**: Audit Manager의 증거 수집은 "지속적 컴플라이언스(continuous compliance)" 개념을 구현한다. 연 1회 스냅샷을 찍는 대신, Assessment가 활성화된 동안 매일 증거를 수집한다. 감사 시점에 "지금 상태"가 아니라 "지난 6개월 내내 어땠는지"를 보여줄 수 있다. NIST SP 800-137 "Information Security Continuous Monitoring"이 이 접근법의 이론적 근거다.

자동 수집 증거(Automated Evidence)와 수동 증거(Manual Evidence)를 구분하는 것이 중요하다. Config Rule 평가 결과, CloudTrail로 기록된 API 호출, Security Hub Finding은 Audit Manager가 자동으로 가져온다. 반면 "임직원 보안 교육 완료 확인서", "재해복구 훈련 결과 보고서", "외부 벤더 계약서" 같은 종이 기반·시스템 외부 문서는 수동으로 콘솔에 업로드해야 한다. 시험에서 "Audit Manager가 자동 수집하지 못하는 것은?" 물으면 정책 문서나 인터뷰 기록이 정답이다.

사전 제공 Framework 목록은 실제 시험에서 중요하다. AWS는 HIPAA, PCI-DSS, SOC 2, ISO 27001, NIST 800-53, NIST CSF, AWS Foundational Security Best Practices, GDPR, FedRAMP, CIS Benchmark 등을 내장 Framework로 제공한다. 커스텀 Framework를 직접 만들 수도 있다. 내장 Framework를 쓰면 각 통제 항목에 어떤 AWS 서비스 증거가 필요한지 이미 매핑이 돼 있어, Assessment를 만들고 활성화하기만 하면 증거 수집이 시작된다.

> 🔍 **내부 동작**: Assessment 생성 시 Audit Manager는 IAM Service-Linked Role(`AWSServiceRoleForAuditManager`)을 자동으로 만든다. 이 Role이 Config, CloudTrail, Security Hub, 각종 AWS API에 Read 권한을 갖고 증거를 S3 버킷에 저장한다. 기본적으로 Audit Manager가 관리하는 S3 버킷을 사용하지만, 커스텀 S3 버킷과 KMS CMK를 지정할 수 있다. 증거 파일은 JSON 형식으로 저장되며, 각각 어느 Control에 매핑됐는지, 언제 수집됐는지, 평가 결과가 Pass인지 Fail인지를 담는다.

```bash
# Audit Manager Assessment 생성 (PCI-DSS)
FRAMEWORK_ID=$(aws auditmanager list-available-prebuilt-frameworks \
  --query 'frameworkMetadataList[?name==`PCI DSS v3.2.1`].id' \
  --output text)

aws auditmanager create-assessment \
  --name "2026-Q2-PCI-DSS-Audit" \
  --description "2026년 2분기 PCI-DSS 외부 감사 준비" \
  --framework-id "$FRAMEWORK_ID" \
  --assessment-reports-destination '{
    "destinationType": "S3",
    "destination": "s3://company-audit-reports-bucket"
  }' \
  --roles '[{
    "roleType": "PROCESS_OWNER",
    "roleArn": "arn:aws:iam::123456789012:role/AuditProcessOwner"
  }]' \
  --scope '{
    "awsAccounts": [
      {"id": "123456789012", "name": "Production"},
      {"id": "234567890123", "name": "Staging"}
    ],
    "awsServices": [
      {"serviceName": "ec2"},
      {"serviceName": "s3"},
      {"serviceName": "rds"},
      {"serviceName": "iam"}
    ]
  }'

# Assessment 상태 확인
aws auditmanager get-assessment \
  --assessment-id "assessment-uuid-here" \
  --query 'assessment.metadata.{name:name,status:status,complianceType:complianceType}'

# 보고서 생성 요청
aws auditmanager create-assessment-report \
  --assessment-id "assessment-uuid-here" \
  --name "PCI-DSS-2026-Q2-Final-Report" \
  --description "외부 감사관 제출용 최종 보고서"
```

**Audit Manager와 다른 서비스의 관계**를 명확히 구분해야 한다. Config는 리소스 상태를 평가하고 Rule 위반을 감지한다. Audit Manager는 Config의 평가 결과를 증거로 수집해 Framework의 특정 Control에 연결한다. Security Hub는 다양한 보안 도구의 Finding을 집계한다. Audit Manager는 Security Hub Finding도 증거로 수집할 수 있다. Trusted Advisor는 비용·성능·보안·가용성에 대한 권고를 준다. Audit Manager는 Trusted Advisor와 직접 통합되지 않는다. 이 관계를 혼동하면 시험에서 틀린다.

> 📚 **실제 사례**: 2023년 국내 핀테크 A사는 연간 SOC 2 Type II 감사를 받는데, 이전에는 운영팀 2명이 3주간 수동으로 증거를 정리했다. Audit Manager 도입 후 SOC 2 Framework로 Assessment를 상시 운영했더니, 감사 직전에 "보고서 생성" 버튼 한 번으로 12개월치 증거가 정리된 PDF가 나왔다. 보고서 준비 시간이 3주에서 2시간으로 줄었다. 핵심은 "감사가 올 때 준비하는 게 아니라 항상 준비된 상태를 유지한다"는 사고방식의 전환이다.

> ⚠️ **절대 혼동 금지**: Audit Manager는 "AWS가 대신 컴플라이언트하게 만들어주는 서비스"가 아니다. 증거 수집·정리 자동화 도구다. PCI-DSS Framework로 Assessment를 만들었다고 PCI-DSS 인증이 되는 것이 아니다. 실제 인증은 외부 QSA(Qualified Security Assessor)가 증거를 검토하고 판단한다. Audit Manager는 그 검토에 필요한 증거를 자동으로 모아주는 역할이다.

## AWS License Manager: BYOL의 강제 메커니즘

기업이 Oracle Database 라이선스를 100개 코어 분 구매했다고 가정하자. AWS에서 EC2 인스턴스를 만들 때마다 수동으로 라이선스 사용량을 추적할 수는 없다. 인스턴스가 늘어날수록 추적이 누락되고, 어느 순간 라이선스 감사에서 "미신고 사용"이 발각돼 고액의 추가 청구를 받는다. Oracle, Microsoft, SAP 같은 벤더의 라이선스 감사는 실제로 기업에 수억 원의 추가 비용을 발생시킨 사례가 많다.

License Manager는 이 문제를 소프트웨어 수준에서 해결한다. **License Configuration**을 정의하면, 그것이 연결된 AMI로 EC2를 시작할 때 License Manager가 라이선스 카운트를 자동으로 증감시킨다. 인스턴스를 시작하면 카운트가 올라가고, 인스턴스를 종료하면 카운트가 내려간다. 핵심은 `LicenseCountHardLimit` 설정이다.

> 💡 **Hard Limit의 의미**: `LicenseCountHardLimit: true`로 설정하면 라이선스 한도에 도달했을 때 EC2 RunInstances API 호출 자체가 실패한다. 인스턴스 시작이 차단된다. `false`로 설정하면 한도 초과 시 알림만 보내고 시작은 허용한다. 시험에서 "라이선스 초과 사용을 기술적으로 차단하려면?" 물으면 Hard Limit이 정답이다.

```bash
# Windows Server 2022 Datacenter BYOL License Configuration 생성
aws license-manager create-license-configuration \
  --name "Windows-Server-2022-Datacenter-BYOL" \
  --description "Windows Server 2022 Datacenter BYOL 라이선스 추적" \
  --license-counting-type Core \
  --license-count 200 \
  --license-count-hard-limit \
  --license-rules "#allowedTenancy=EC2-DedicatedHost,EC2-DedicatedInstance" \
  --tags Key=Project,Value=license-governance

# AMI에 License Configuration 연결 (이 AMI로 만든 EC2는 자동 추적)
aws license-manager update-license-specifications-for-resource \
  --resource-arn "arn:aws:ec2:ap-northeast-2:123456789012:image/ami-0abc12345" \
  --add-license-specifications '[{
    "LicenseConfigurationArn": "arn:aws:license-manager:ap-northeast-2:123456789012:license-configuration:lic-abc123"
  }]'

# 현재 라이선스 사용량 확인
aws license-manager list-usage-for-license-configuration \
  --license-configuration-arn "arn:aws:license-manager:ap-northeast-2:123456789012:license-configuration:lic-abc123" \
  --query 'LicenseConfigurationUsageList[*].{Resource:ResourceArn,Status:ResourceStatus,Consumed:ConsumedLicenses}'

# License Manager CloudWatch 알람 - 80% 사용 시 경보
aws cloudwatch put-metric-alarm \
  --alarm-name "LicenseUsage-Windows-80pct" \
  --metric-name "LicenseConfigurationConsumedLicenses" \
  --namespace "AWS/LicenseManager" \
  --dimensions Name=LicenseConfigurationArn,Value="arn:aws:license-manager:ap-northeast-2:123456789012:license-configuration:lic-abc123" \
  --statistic Maximum \
  --period 3600 \
  --threshold 160 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --alarm-actions "arn:aws:sns:ap-northeast-2:123456789012:license-alert"
```

**카운팅 단위**는 라이선스 계약에 따라 다르게 설정한다. vCPU 기준이면 `vCPU`, 물리 소켓 기준이면 `Socket`, 코어 기준이면 `Core`, 인스턴스 수 기준이면 `Instance`를 선택한다. Oracle의 경우 Standard Edition은 소켓당 라이선스, Enterprise Edition은 코어당 라이선스라 카운팅 유형이 다르다. License Manager는 이 차이를 Configuration에서 지정한다.

> 🔍 **멀티 계정 BYOL 관리**: AWS Organizations를 통해 License Manager를 멤버 계정에 공유할 수 있다. 관리 계정에서 License Configuration을 만들고, Organizations를 통해 멤버 계정에 공유하면, 각 멤버 계정의 라이선스 사용량이 관리 계정에 집계된다. 멤버 계정 사용자는 공유받은 License Configuration을 자기 AMI에 연결할 수 있지만, 전체 카운트 한도는 관리 계정에서 제어한다. 이것이 엔터프라이즈 BYOL 거버넌스의 표준 구조다.

License Manager가 추적하는 라이선스 유형은 두 가지다. **BYOL(Bring Your Own License)**은 기업이 이미 구매한 라이선스를 AWS에서 쓰는 경우다. 앞서 설명한 Windows, Oracle이 이에 해당한다. **License Entitlement**는 AWS Marketplace나 다른 경로로 AWS를 통해 구매한 라이선스로, 이미 AWS 내에서 디지털 방식으로 관리된다. SOA-C02 시험에서는 주로 BYOL 추적·강제가 출제된다.

> ⚠️ **운영 주의**: Hard Limit이 켜진 상태에서 라이선스 한도가 꽉 차면, Auto Scaling 그룹이 스케일 아웃을 시도할 때 새 인스턴스 시작이 차단된다. 트래픽이 폭증하는 상황에서 오토스케일링이 막혀 서비스 장애로 이어질 수 있다. 반드시 80-90% 사용 시 CloudWatch 알람을 걸어두고, 한도 도달 전에 추가 라이선스를 확보하는 프로세스를 만들어야 한다.

## AWS Resource Explorer: 멀티 리전 리소스 인덱스의 설계

멀티 리전, 멀티 계정 환경에서 "지금 우리 AWS에 있는 EC2 인스턴스가 몇 개야?"라는 질문에 답하는 것이 생각보다 어렵다. 각 리전의 콘솔에 들어가 확인하거나, `describe-instances`를 리전별로 반복 호출하거나, 서드파티 CMDB를 써야 했다. Resource Explorer는 이 문제를 AWS 내장 인덱스로 해결한다.

Resource Explorer의 핵심 개념은 **인덱스(Index)**다. 리전별로 로컬 인덱스를 활성화하면 해당 리전의 리소스가 인덱싱된다. 그 중 하나의 리전을 **Aggregator Index**로 지정하면 모든 다른 리전의 로컬 인덱스 데이터가 이 리전으로 모인다. 검색 시 Aggregator Index 리전에서 쿼리하면 모든 리전의 리소스를 한 번에 검색할 수 있다.

> 📚 **설계 이론**: Resource Explorer의 인덱스 구조는 분산 검색 시스템의 **집중형 집계(centralized aggregation)** 패턴을 따른다. Elasticsearch의 Master Node가 모든 Shard의 인덱스 메타데이터를 모으는 것과 유사하다. 리전별 로컬 인덱스가 Shard 역할을 하고, Aggregator Index가 Master 역할을 한다. 차이점은 AWS 서비스이므로 인덱스 동기화와 내결함성을 AWS가 관리한다는 것이다.

```bash
# 1. 현재 리전에 Aggregator Index 생성 (검색 허브 리전)
aws resource-explorer-2 create-index \
  --type AGGREGATOR \
  --region ap-northeast-2

# 2. 다른 리전에 Local Index 생성
for region in us-east-1 us-west-2 eu-west-1 ap-southeast-1; do
  aws resource-explorer-2 create-index \
    --type LOCAL \
    --region "$region"
  echo "Local index created in $region"
done

# 3. View 생성 (검색 범위 정의)
aws resource-explorer-2 create-view \
  --view-name "all-resources-view" \
  --included-properties '[{"Name":"tags"}]' \
  --region ap-northeast-2

# View ARN 확인
VIEW_ARN=$(aws resource-explorer-2 list-views \
  --region ap-northeast-2 \
  --query 'Views[?contains(@, `all-resources-view`)]' \
  --output text | head -1)

# 4. 검색 쿼리 예시
# 모든 리전의 prod 환경 EC2 중 running 상태
aws resource-explorer-2 search \
  --view-arn "$VIEW_ARN" \
  --query-string "service:ec2 resourcetype:instance tag.Environment=prod" \
  --region ap-northeast-2

# 특정 리전의 Lambda 함수
aws resource-explorer-2 search \
  --view-arn "$VIEW_ARN" \
  --query-string "service:lambda region:us-east-1" \
  --region ap-northeast-2

# 암호화되지 않은 EBS 볼륨 찾기 (태그 기반)
aws resource-explorer-2 search \
  --view-arn "$VIEW_ARN" \
  --query-string "service:ec2 resourcetype:volume tag.Encrypted!=true" \
  --region ap-northeast-2
```

검색 문법은 직관적이다. `service:ec2`는 EC2 리소스, `resourcetype:instance`는 EC2 인스턴스로 범위를 좁힌다. `tag.Key=Value`는 태그 필터, `region:ap-northeast-2`는 특정 리전으로 제한한다. 여러 조건을 공백으로 연결하면 AND 검색이 된다.

> 💡 **Organizations 통합**: AWS Organizations를 통해 멤버 계정의 Resource Explorer를 관리 계정에서 한 번에 활성화할 수 있다. 신규 계정이 Organizations에 추가되면 자동으로 Resource Explorer가 활성화되고 Aggregator로 데이터가 집계된다. 이것이 대규모 멀티 계정 환경에서 Resource Explorer를 운영하는 표준 방식이다.

## Tag Editor와 Resource Groups: 운영 자동화의 연결 고리

Resource Explorer가 "찾기" 도구라면, Tag Editor는 "정리하기" 도구다. 기업이 AWS를 수년간 쓰다 보면 태그 체계가 엉망이 된다. 어떤 팀은 `env`, 어떤 팀은 `Environment`, 어떤 팀은 `Env`를 쓴다. Tag Editor는 여러 리전·서비스의 리소스에 태그를 일괄 검색하고 수정하는 콘솔 도구다. AWS CLI로는 `aws resourcegroupstaggingapi` 명령으로 동일 작업을 자동화할 수 있다.

```bash
# 태그 일괄 적용 - 여러 리소스에 동시에
aws resourcegroupstaggingapi tag-resources \
  --resource-arn-list \
    "arn:aws:ec2:ap-northeast-2:123456789012:instance/i-0abc123" \
    "arn:aws:ec2:ap-northeast-2:123456789012:instance/i-0xyz456" \
    "arn:aws:rds:ap-northeast-2:123456789012:db:production-db" \
    "arn:aws:s3:::company-production-bucket" \
  --tags '{
    "Environment": "production",
    "Project": "payment-platform",
    "Owner": "platform-team",
    "CostCenter": "CC-2024-PLATFORM"
  }'

# 태그 없는 리소스 찾기 (Environment 태그 없는 것)
aws resourcegroupstaggingapi get-resources \
  --tag-filters 'Key=Environment' \
  --resource-type-filters ec2:instance \
  --query 'ResourceTagMappingList[?Tags[?Key!=`Environment`] || !Tags].ResourceARN' \
  --output text
```

**Resource Groups**는 태그 기반으로 리소스를 동적으로 그룹화한다. 그룹 정의는 태그 조건이고, 그 조건에 맞는 리소스는 자동으로 그룹에 포함된다. 새 리소스에 태그만 붙이면 자동으로 그룹에 들어온다. Resource Groups의 진짜 가치는 **SSM과의 연동**이다. SSM Run Command, State Manager, Patch Manager에서 "대상(Target)"으로 Resource Group을 지정하면, 그룹 안의 모든 인스턴스에 일괄 적용된다.

```bash
# Resource Group 생성 (payment-prod 태그 기반)
aws resource-groups create-group \
  --name "payment-prod-instances" \
  --description "Payment platform 프로덕션 EC2 인스턴스 그룹" \
  --resource-query '{
    "Type": "TAG_FILTERS_1_0",
    "Query": "{\"ResourceTypeFilters\":[\"AWS::EC2::Instance\"],\"TagFilters\":[{\"Key\":\"Project\",\"Values\":[\"payment-platform\"]},{\"Key\":\"Environment\",\"Values\":[\"production\"]}]}"
  }'

# SSM Run Command를 Resource Group 전체에 실행
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --targets '[{
    "Key": "resource-groups:Name",
    "Values": ["payment-prod-instances"]
  }]' \
  --parameters '{"commands":["systemctl status nginx","df -h","free -m"]}' \
  --comment "payment-prod 전체 상태 점검"
```

> 🔍 **CloudFormation Stack 기반 Resource Groups**: 태그 외에 CloudFormation Stack ID를 기준으로도 Resource Group을 만들 수 있다. 한 Stack이 만든 모든 리소스를 그룹으로 묶어 SSM 명령을 실행하거나, 스택 단위로 비용을 추적하는 데 유용하다. CloudFormation은 스택 안의 모든 리소스에 자동으로 `aws:cloudformation:stack-name` 태그를 붙이기 때문에 이 태그를 Resource Group 조건으로 쓰면 된다.

## 서비스 비교: 감사·가시성 도구 선택 가이드

운영자가 가장 혼동하는 것은 "이 시나리오에서 Audit Manager를 써야 하는가, Config를 써야 하는가, Trusted Advisor를 써야 하는가"다. 세 도구의 역할을 명확히 구분해야 한다.

| 질문 | 적합한 도구 |
|------|-------------|
| 특정 리소스가 Config Rule을 위반하고 있는가? | AWS Config |
| 외부 감사관에게 제출할 컴플라이언스 보고서가 필요한가? | AWS Audit Manager |
| AWS 비용 최적화, 보안 권고사항이 필요한가? | AWS Trusted Advisor |
| BYOL 라이선스 초과 사용을 기술적으로 차단해야 하는가? | AWS License Manager (Hard Limit) |
| 모든 리전에서 특정 태그를 가진 리소스를 찾아야 하는가? | AWS Resource Explorer |
| 여러 리소스에 태그를 일괄 수정해야 하는가? | Tag Editor (resourcegroupstaggingapi) |
| EC2 100대에 SSM 명령을 한 번에 실행해야 하는가? | Resource Groups + SSM |
| AWS 서비스 장애나 예정 변경을 사전에 알아야 하는가? | AWS Health Dashboard |
| 계정의 서비스 한도(Quota)를 확인하고 증가 요청해야 하는가? | AWS Service Quotas |

**Audit Manager vs Config 비교**:

| 관점 | AWS Config | AWS Audit Manager |
|------|-----------|-------------------|
| 주요 역할 | 리소스 상태 평가·Rule 위반 감지 | 컴플라이언스 증거 수집·보고서 자동화 |
| 출력물 | Rule 평가 결과, 타임라인 | PDF/CSV 감사 보고서, Control별 증거 |
| Framework 개념 | 없음 (Conformance Pack이 비슷) | 핵심 (HIPAA, PCI-DSS, SOC 2 등) |
| 감사관 지원 | 직접적 지원 없음 | 감사관 계정 초대, 검토 워크플로우 |
| 수동 증거 | 불가 | 가능 (콘솔 업로드) |
| 상호 관계 | Config 결과가 Audit Manager 증거 원천 | Config를 Data Source로 사용 |

> 📚 **ISO 27001 A.12.4 감사 로그 요건**: ISO 27001의 A.12.4는 "이벤트 로그 작성, 로그 보호, 관리자·운영자 활동 로그"를 요구한다. AWS 환경에서 이를 충족하려면 CloudTrail(API 감사), Config(리소스 상태 추적), VPC Flow Logs(네트워크 로그), CloudWatch Logs(애플리케이션 로그)가 모두 활성화돼야 한다. Audit Manager의 ISO 27001 Framework는 이 각각의 통제 항목에 대한 증거 수집을 자동화한다.

## 실제 운영 패턴: 거버넌스 스택의 조합

대형 금융사의 거버넌스 스택이 실제로 어떻게 구성되는지 살펴본다. 국내 한 대형 금융지주는 2024년 AWS 환경의 ISMS-P 인증을 위해 다음 조합을 사용했다.

**구성**: AWS Config (리소스 상태 상시 평가) + CloudTrail (모든 API 감사) + Security Hub (보안 Finding 집계) → Audit Manager (ISMS-P Custom Framework로 증거 자동 수집) + Resource Explorer (전 계정 리소스 인벤토리) + License Manager (Windows, Oracle BYOL 강제). 인증 심사 시 감사관은 Audit Manager 콘솔에서 각 통제 항목의 증거를 직접 확인했고, 보고서 생성에 걸린 시간은 30분이었다. 이전 인증 주기에는 같은 작업에 4주가 걸렸다.

> 💡 **Quick Setup 활용**: AWS Systems Manager Quick Setup을 사용하면 Config Recording, SSM Agent 설치, CloudWatch Agent 배포를 멀티 계정·멀티 리전에 한 번에 적용할 수 있다. 신규 계정이 Organizations에 추가될 때마다 수동으로 설정하는 대신, Quick Setup이 자동으로 기본 거버넌스 설정을 배포한다. 이것이 OU(Organizational Unit) 전체에 일관된 거버넌스 기준선을 유지하는 방법이다.

이제 세 도구를 연결하면 거버넌스의 큰 그림이 보인다. Resource Explorer로 "무엇이 있는지" 파악하고, Tag Editor와 Resource Groups로 "체계적으로 정리"하며, Config와 CloudTrail로 "상태와 행위를 지속적으로 감시"하고, Audit Manager로 "감사 증거를 자동 수집"한다. License Manager는 이 과정에서 "라이선스 규정 준수"를 기술적으로 강제한다. 각 도구는 독립적으로도 가치가 있지만, 조합했을 때 비로소 "항상 감사 준비가 된 AWS 환경"이라는 목표가 달성된다.

운영자 시험의 관점에서 이 날의 핵심은 세 가지다. 첫째, Audit Manager는 증거 수집 자동화 도구이지 컴플라이언스를 보장하는 도구가 아니다. 둘째, License Manager의 Hard Limit은 라이선스 초과 시 인스턴스 시작 자체를 막는 강력한 강제 메커니즘이다. 셋째, Resource Explorer는 Aggregator Index가 있어야 멀티 리전 검색이 가능하다. 이 세 가지를 시나리오 문제와 연결하면 틀리지 않는다.

---

## 연습 문제

**문제 1.** 외부 감사 회사가 PCI-DSS 감사를 위해 지난 6개월간의 IAM 정책 변경 이력, RDS 암호화 상태, MFA 적용 현황을 모두 요청했다. 운영팀이 최소 노력으로 이 요구사항을 충족하는 방법은?

A) CloudTrail 로그를 S3에서 수동으로 다운로드해 정리한다  
B) Config Rule 평가 결과를 엑셀로 내보낸다  
C) Audit Manager에서 PCI-DSS Framework로 Assessment를 생성하고, 6개월치 증거 수집 후 보고서를 자동 생성한다  
D) Security Hub에서 Finding을 PDF로 내보낸다  

**정답: C**  
Audit Manager는 PCI-DSS를 포함한 주요 컴플라이언스 Framework를 내장하고 있으며, Assessment 활성화 후 CloudTrail, Config, Security Hub에서 자동으로 증거를 수집한다. 보고서는 PDF/CSV로 생성된다. A와 B는 수동 작업으로 오류 가능성이 높다. D는 Security Hub Finding만 포함되어 전체 요구사항을 충족하지 못한다.

---

**문제 2.** 회사가 Microsoft Windows Server Enterprise 라이선스 500코어 분을 구매했다. AWS에서 EC2를 시작할 때 이 한도를 초과하면 인스턴스 시작 자체를 차단해야 한다. 어떤 서비스와 설정을 사용해야 하는가?

A) AWS Config Rule로 EC2 인스턴스 수를 제한  
B) Service Quotas로 EC2 인스턴스 수 제한  
C) License Manager에서 License Configuration을 만들고 `LicenseCountHardLimit: true`로 설정한 후 해당 AMI에 연결  
D) IAM Permission Boundary로 RunInstances 횟수 제한  

**정답: C**  
License Manager의 `LicenseCountHardLimit: true` 설정이 라이선스 한도 초과 시 EC2 RunInstances를 직접 차단하는 유일한 방법이다. A는 Rule이 위반을 감지하지만 차단하지 않는다. B는 인스턴스 유형별 수량 한도이지 라이선스 추적이 아니다. D는 IAM으로 API 호출 자체를 막을 수 있지만 라이선스 카운팅 로직이 없다.

---

**문제 3.** 기업이 20개 AWS 계정, 6개 리전에 걸쳐 `Project=payment-platform` 태그가 붙은 EC2 인스턴스 수를 빠르게 파악해야 한다. 가장 효율적인 방법은?

A) 각 계정에 로그인해 리전별로 EC2 콘솔을 확인  
B) AWS Config 집계 보기에서 리소스 목록 확인  
C) Resource Explorer를 Aggregator Index로 설정하고 `service:ec2 resourcetype:instance tag.Project=payment-platform` 검색  
D) CloudTrail Lake SQL로 EC2 생성 이벤트 집계  

**정답: C**  
Resource Explorer는 멀티 리전·멀티 계정 리소스 검색을 위한 도구다. Aggregator Index를 설정하면 모든 리전의 데이터가 집계되어 단일 쿼리로 검색 가능하다. A는 수작업이다. B는 Config도 리소스 목록을 볼 수 있지만 검색 기능이 Resource Explorer보다 제한적이고 실시간 태그 검색에 최적화되지 않았다. D는 현재 상태가 아닌 이벤트 기록 조회다.

---

**문제 4.** Audit Manager Assessment를 활성화했는데 특정 Control의 증거가 수집되지 않는다. 원인으로 가장 가능성 높은 것은?

A) AWS Config가 해당 리소스 타입을 기록하지 않도록 설정되어 있다  
B) CloudTrail이 비활성화되어 있다  
C) S3 버킷 권한이 잘못 설정되어 있다  
D) A 또는 B, 해당 Control의 Data Source가 Config이면 A, CloudTrail이면 B  

**정답: D**  
Audit Manager는 Data Source에서 증거를 가져온다. Config Rule 결과를 Data Source로 쓰는 Control은 Config가 해당 리소스를 기록하고 있어야 하고, CloudTrail 이벤트를 Data Source로 쓰는 Control은 CloudTrail이 활성화되어야 한다. C는 보고서 저장에 영향을 주지만 증거 수집 자체를 막지는 않는다. 따라서 해당 Control의 Data Source 유형에 따라 A 또는 B가 원인이다.

---

**문제 5.** Resource Group을 SSM Patch Manager의 대상으로 사용하면 어떤 장점이 있는가?

A) 인스턴스 ID를 일일이 나열할 필요 없이 태그 조건에 맞는 인스턴스가 자동으로 포함된다  
B) 패치 속도가 빨라진다  
C) 패치 실패 알림이 자동으로 생성된다  
D) 인스턴스가 자동으로 재시작된다  

**정답: A**  
Resource Groups의 핵심 가치는 동적 그룹핑이다. 태그 조건을 정의하면, 조건에 맞는 리소스가 자동으로 그룹에 포함되고 제거된다. 새 EC2를 시작할 때 태그만 붙이면 자동으로 그룹에 들어와 Patch Manager 대상이 된다. B, C, D는 Resource Groups이 아닌 Patch Manager 자체의 기능이거나 잘못된 설명이다.

---

**문제 6.** Audit Manager가 자동으로 증거를 수집할 수 없는 항목은?

A) AWS Config Rule 평가 결과  
B) CloudTrail에 기록된 API 호출  
C) Security Hub Finding  
D) 외부 감사관과 나눈 인터뷰 내용 및 수기로 작성한 정책 문서  

**정답: D**  
Audit Manager의 자동 증거 수집은 AWS API를 통해 접근 가능한 데이터에 한정된다. Config Rule 결과(A), CloudTrail 이벤트(B), Security Hub Finding(C)은 모두 자동 수집된다. 종이 문서, 인터뷰 기록, 외부 시스템 데이터, 수기 서명 문서 등은 수동으로 콘솔에 업로드해야 한다. 이것이 Automated Evidence와 Manual Evidence의 구분이다.
