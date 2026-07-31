# Day 3 - Amazon Inspector: EC2/ECR/Lambda 취약점 스캔, CVE, 자동 평가

GuardDuty가 "지금 누군가 악성 행위를 한다"를 본다면, Amazon Inspector는 "악용당하기 *전*에, 어디가 약한가"를 본다. 즉 GuardDuty가 *위협(threat)* 탐지라면 Inspector는 *취약점(vulnerability)* 탐지다. 두 시점은 다르다 — 취약점은 잠재적 약점이고, 위협은 그 약점을 노리는(또는 다른 경로로 들어오는) 실제 활동이다. 보안 운영은 둘 다 필요하다: 약점을 줄이고(Inspector), 뚫리면 잡는다(GuardDuty).

Inspector(현행 Amazon Inspector, 흔히 "Inspector v2")의 본질은 "리소스를 **자동·지속적으로(continuous)** 스캔해 알려진 취약점(CVE)과 위험한 노출을 찾아내고, 환경 컨텍스트를 반영한 **우선순위 점수**를 매긴다"는 것이다. 과거 v1처럼 평가를 수동으로 돌리는 게 아니라, 활성화하면 새 리소스·새 CVE 공시에 맞춰 알아서 다시 스캔한다.

## 무엇을 스캔하는가: 세 가지 대상

```
Amazon Inspector 스캔 대상
  ├─ EC2 인스턴스        → OS 패키지 CVE + 네트워크 도달성(reachability)
  ├─ ECR 컨테이너 이미지 → 이미지 레이어의 OS/언어 패키지 CVE
  └─ Lambda 함수         → 함수 코드 + 의존성 패키지 CVE (+ 코드 취약점)
```

- **EC2**: 두 가지를 본다 — (1) 설치된 OS/애플리케이션 패키지의 **CVE**, (2) **네트워크 도달성 분석**(인터넷에서 이 포트에 닿을 수 있나). 도달 가능한 취약점은 더 위험하다.
- **ECR**: 푸시되는 컨테이너 이미지를 스캔. **on-push**(푸시 시 1회) + **continuous(지속 재스캔)** 옵션. 새 CVE가 공시되면 이미 푸시된 이미지를 다시 평가.
- **Lambda**: 함수의 의존성 패키지 취약점(standard scanning) + 선택적으로 코드 자체의 취약점(code scanning, 예: 하드코딩된 비밀·인젝션 패턴).

### 탐지 서비스들이 각각 답하는 질문

week9의 네 서비스는 같은 계정을 보면서도 완전히 다른 질문에 답한다. Inspector의 자리를 이 좌표 위에서 잡아야 시험의 오답을 피한다.

| 서비스 | 보는 대상 | 답하는 질문 | 신호가 생기는 시점 |
|--------|-----------|-------------|-------------------|
| **Inspector** | 패키지·이미지 레이어·함수 의존성·네트워크 도달성 | "어디가 **악용당할 수 있는가**" | 리소스 생성 시 + 새 CVE 공시 시 |
| **GuardDuty** | CloudTrail·VPC Flow·DNS·(옵션)런타임 | "지금 **악성 행위가 있는가**" | 행위가 일어나는 순간 |
| **Macie** | S3 객체의 내용 | "**민감 데이터**가 어디 있는가" | 스캔 작업 실행 시 |
| **Detective** | 위 신호 + 로그를 연결한 그래프 | "**왜·어디까지** 번졌는가" | 조사할 때 |

핵심 대비는 **"약점 vs 행위"**다. Inspector 핀딩은 아무도 공격하지 않아도 존재하고, GuardDuty 핀딩은 누군가 무언가를 했을 때만 생긴다. 그래서 Inspector 핀딩 수는 *패치하지 않으면 계속 쌓이는 부채*의 성격을 갖고, GuardDuty 핀딩은 *사건*의 성격을 갖는다. 운영 방식도 다르다 — 전자는 백로그로 관리하고, 후자는 온콜로 대응한다.

> ⚠️ **함정**: "EC2가 침해된 것 같으니 Inspector로 스캔하라"는 오답이다. Inspector는 *침해 여부*를 말해 주지 않는다 — 취약한 패키지 목록을 줄 뿐이다. 이미 감염된 호스트의 악성 파일을 찾는 것은 **GuardDuty Malware Protection**이고, 악성 행위를 잡는 것은 GuardDuty 기초·Runtime Monitoring이다. 반대로 "새로 공시된 CVE에 우리 자산이 노출됐는지 확인하라"에 GuardDuty를 고르는 것도 오답이다.

## 어떻게 스캔하는가: SSM 에이전트와 agentless

EC2 스캔에는 두 방식이 있다:
- **에이전트 기반**: **SSM Agent**(Systems Manager)를 통해 인스턴스 내부 패키지 인벤토리를 수집. SSM이 관리하는 인스턴스라면 추가 설치 없이 동작.
- **Agentless(에이전트리스)**: EBS 스냅샷을 떠서 분석(SSM 없는 인스턴스도 커버). Inspector가 하이브리드로 적절히 선택.

> ⚠️ **함정**: "EC2를 Inspector에 등록했는데 스캔이 안 된다"의 흔한 원인은 **SSM Agent 미설치/미관리 상태**다. 에이전트 기반 스캔은 인스턴스가 SSM으로 관리되어야 한다(SSM Agent 실행 + 적절한 인스턴스 프로파일 IAM 역할 + SSM 연결). 시험에서 "Inspector가 인스턴스를 스캔하지 못함 → SSM 관리 상태 확인"은 단골이다.

```
EC2 ── SSM Agent ── Systems Manager ── Inspector(패키지 인벤토리 수집·CVE 평가)
      또는
EC2 ── (SSM 없음) ── Inspector agentless(EBS 스냅샷 분석)
```

> 💡 **관련 이론**: 취약점 관리는 NIST의 *Identify(ID.RA, 위험 평가)* 기능에 속한다. 핵심은 "발견(discover) → 평가(assess) → 우선순위(prioritize) → 교정(remediate) → 검증(verify)"의 지속 루프다. 옛 Inspector는 *주기적 평가*였으나 현 Inspector는 *지속적*이다 — 이것이 중요한 이유는, 취약점 환경이 정적이지 않기 때문이다. 어제 깨끗하던 이미지가 오늘 새 CVE 공시로 취약해질 수 있다. continuous 스캔만이 "이미 배포된 자산의 새 위험"을 따라잡는다.

## CVE와 우선순위: Inspector score vs CVSS

Inspector는 발견된 취약점에 **CVE** 식별자와 **CVSS** 기본 점수를 붙인다. 그러나 단순 CVSS만으로 우선순위를 매기면 노이즈가 많다. Inspector는 환경 컨텍스트를 반영한 자체 **Inspector score**를 산출한다:

```
Inspector 우선순위 = CVSS 기본 점수
                   × 네트워크 도달성(인터넷에서 닿나?)
                   × 익스플로잇 가능성(알려진 exploit 존재?)
                   × ... 환경 컨텍스트
```

예: 동일 CVSS 9.0이라도 (a) 인터넷에 노출된 포트에서 도달 가능하고 공개 exploit이 있는 취약점은 최우선, (b) 격리된 서브넷의 도달 불가 취약점은 후순위. 이 *컨텍스트 기반 우선순위*가 분석가에게 "무엇부터 패치할지"를 알려준다.

> 💡 **관련 이론**: 이는 *risk-based vulnerability management(위험 기반 취약점 관리)*다. 취약점 수천 개를 한꺼번에 패치할 수는 없으므로, "악용 가능성 × 노출 × 영향"으로 위험을 가중해 우선순위를 정한다. CVSS는 취약점 *자체*의 심각도이고, Inspector score는 *우리 환경에서의* 위험이다 — EPSS(Exploit Prediction Scoring System)·KEV(알려진 악용 취약점) 같은 외부 신호도 이런 가중에 쓰인다.

### 실물 핀딩을 한 줄씩 읽는다 — 무엇을 먼저 패치할지 결정하는 필드들

Inspector 핀딩은 "CVE가 있다"로 끝나지 않는다. **어떤 필드를 보고 우선순위를 정할 것인가**가 실무이자 시험의 내용이다.

```json
{
  "findingArn": "arn:aws:inspector2:ap-northeast-2:111122223333:finding/0a1b2c3d4e5f",
  "awsAccountId": "111122223333",
  "type": "PACKAGE_VULNERABILITY",
  "severity": "CRITICAL",
  "status": "ACTIVE",
  "title": "CVE-2021-44228 - org.apache.logging.log4j:log4j-core",
  "firstObservedAt": "2026-02-11T03:20:11Z",
  "lastObservedAt": "2026-03-14T01:02:44Z",
  "inspectorScore": 9.8,
  "inspectorScoreDetails": {
    "adjustedCvss": {
      "score": 9.8,
      "scoringVector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
      "adjustments": [
        { "metric": "Attack Vector", "reason": "Reachable from the internet" }
      ]
    }
  },
  "exploitAvailable": "YES",
  "fixAvailable": "YES",
  "epss": { "score": 0.9741 },
  "packageVulnerabilityDetails": {
    "vulnerabilityId": "CVE-2021-44228",
    "source": "NVD",
    "vulnerablePackages": [
      {
        "name": "log4j-core", "version": "2.14.1",
        "packageManager": "JAR", "filePath": "/opt/app/lib/log4j-core-2.14.1.jar",
        "fixedInVersion": "2.15.0",
        "remediation": "Update log4j-core to 2.15.0 or later"
      }
    ]
  },
  "resources": [
    {
      "type": "AWS_ECR_CONTAINER_IMAGE",
      "id": "arn:aws:ecr:ap-northeast-2:111122223333:repository/payments-api/sha256:abcd...",
      "details": { "awsEcrContainerImage": { "repositoryName": "payments-api", "imageTags": ["prod", "v2026.02.10"] } }
    }
  ]
}
```

| 필드 | 왜 이 필드가 우선순위를 바꾸는가 |
|------|--------------------------------|
| `type: PACKAGE_VULNERABILITY` | 세 유형 중 하나다 — `PACKAGE_VULNERABILITY`(패키지 CVE), `NETWORK_REACHABILITY`(도달 가능한 열린 경로), `CODE_VULNERABILITY`(Lambda 코드 자체). 대응 부서가 다르다: 패치팀 / 네트워크팀 / 개발팀. |
| `severity: CRITICAL` vs `inspectorScore: 9.8` | severity는 라벨, `inspectorScore`는 **환경 보정 점수**다. 같은 CVE라도 인스턴스마다 점수가 달라질 수 있다. |
| `adjustments[].reason: "Reachable from the internet"` | **왜 점수가 조정됐는지가 명시된다.** 이 문장 하나가 "격리 서브넷의 같은 CVE보다 먼저"라는 근거다. |
| `exploitAvailable: "YES"` | 공개 익스플로잇이 존재. 이론적 위험이 아니라 **누구나 실행 가능한 위험**이다. |
| `fixAvailable: "YES"` | 고칠 방법이 *있다*. `NO`면 패치가 아니라 완화(WAF 룰·구성 변경·격리)로 방향이 바뀐다. `PARTIAL`이면 일부 패키지만 고칠 수 있다. |
| `epss.score: 0.9741` | 향후 실제 악용될 확률 추정. **0.97은 "곧 공격받는다"에 가깝다.** CVSS가 심각도라면 EPSS는 임박성이다. |
| `vulnerablePackages[].fixedInVersion` + `filePath` | **정확히 무엇을 어디서 어느 버전으로 올려야 하는지**. 티켓에 그대로 들어갈 정보다. |
| `resources[].imageTags: ["prod", ...]` | 이 이미지가 **프로덕션 태그를 달고 있다**. 같은 CVE라도 dev 태그 이미지보다 우선한다. |
| `firstObservedAt` vs `lastObservedAt` | 처음 발견된 지 한 달이 지났는데 아직 `ACTIVE`다 — **SLA 위반 백로그**임을 드러낸다. |

이 한 건에서 나오는 판단은 "CRITICAL이니 급하다"가 아니라 훨씬 구체적이다: *인터넷 도달 가능 + 공개 익스플로잇 존재 + EPSS 0.97 + 프로덕션 태그 + 고칠 버전이 존재*. 네 가지 가중 요소가 전부 최악이고 해결책까지 명확하므로, 이것은 **논쟁 없이 최우선**이다. 반대로 같은 CVE라도 `exploitAvailable: NO`, 격리 서브넷, dev 태그라면 다음 정기 패치 주기로 미룰 수 있다.

> 💡 **관련 이론**: CVSS·EPSS·KEV는 서로 대체재가 아니라 **다른 질문에 답하는 세 지표**다. CVSS는 "뚫리면 얼마나 나쁜가"(영향), EPSS는 "실제로 뚫릴 확률이 얼마인가"(가능성), KEV(알려진 악용 취약점 목록)는 "이미 실제 공격에 쓰이고 있는가"(현실성)를 말한다. 취약점 관리가 실패하는 전형적 방식은 CVSS 하나로 줄 세우는 것이다 — CVSS 9점대 취약점은 수천 개지만 그중 실제로 악용되는 것은 극히 일부다. 전부 급하다고 하면 아무것도 급하지 않은 것과 같아진다. Inspector score가 도달성과 익스플로잇 존재 여부를 곱하는 이유가 정확히 이것이며, **우선순위를 매기는 능력이 곧 취약점 관리 역량**이다.

> ⚠️ **함정**: `NETWORK_REACHABILITY` 유형 핀딩은 "CVE가 있다"는 말이 아니다. **취약점 없이도 발생한다** — 예컨대 SG가 0.0.0.0/0으로 관리 포트를 열어 두었다는 사실 자체가 핀딩이 된다. "Inspector가 패치할 것이 없다는데 핀딩이 떴다"는 상황의 답이 이것이며, 대응도 패치가 아니라 **네트워크 구성 수정**이다. 이 유형은 SG·NACL·라우팅·IGW를 종합해 "인터넷에서 실제로 이 포트에 도달 가능한가"를 계산한 결과라는 점에서 단순 SG 감사보다 정확하다.

> 📚 **사례**: 2017년 Equifax 침해는 취약점 관리 실패의 표준 교재다. 원인은 제로데이가 아니라 **이미 패치가 나와 있던 Apache Struts 취약점(CVE-2017-5638)**이었고, 공지가 있었음에도 인터넷에 면한 애플리케이션에서 패치가 적용되지 않은 채 남아 있었다. 실패 지점은 "취약점을 몰랐다"가 아니라 **"어느 자산에 그 컴포넌트가 깔려 있는지 몰랐다"**는 인벤토리의 공백이었다. 2021년 Log4Shell(CVE-2021-44228) 때 전 세계 보안팀이 며칠 밤을 새운 이유도 같다 — 취약점 자체보다 "우리 어디에 log4j가 들어 있는가"를 답하는 데 대부분의 시간이 들어갔다. Inspector의 지속 스캔이 해결하는 문제가 정확히 이 지점이다. 새 CVE가 공시되면 **이미 배포된 자산·이미 푸시된 이미지를 소급 재평가**해 "우리 중 무엇이 여기 해당하는가"를 자동으로 답한다. 교훈은 **취약점 관리의 병목은 패치가 아니라 인벤토리**라는 것이다.

## 자동 평가와 통합

Inspector의 운영 가치는 *자동화*에서 나온다:

```
Inspector(지속 스캔)
   │  발견(Finding)
   ├─▶ Security Hub (자동 통합, ASFF 표준화)
   ├─▶ EventBridge ──▶ Lambda/SSM(자동 패치·티켓·격리)
   └─▶ Inspector 콘솔(대시보드, 위험 점수 정렬)
```

- 새 리소스(EC2 시작, ECR 푸시, Lambda 배포) → 자동 스캔.
- 새 CVE 공시 → 영향받는 기존 자산 자동 재평가.
- 발견 → Security Hub 자동 집계 + EventBridge로 대응 자동화(예: SSM Patch Manager로 패치 자동 적용, 또는 Jira 티켓 생성).

> ⚠️ **함정**: ECR 스캔에서 **on-push만** 켜두면, 푸시 *시점*에는 깨끗했지만 *이후* 공시된 CVE에 취약해진 이미지를 놓친다. "오래된 이미지의 새 취약점을 따라잡아라"의 답은 **continuous(enhanced) scanning** 활성화 + 보존 기간 설정이다.

### 실물 CLI: 활성화·조회·게이팅

```bash
# 1) 이 계정·리전에서 Inspector 켜기 — 스캔 대상을 명시적으로 고른다
aws inspector2 enable \
  --resource-types EC2 ECR LAMBDA LAMBDA_CODE

# 2) 스캔 커버리지 확인 = "왜 저 인스턴스는 스캔이 안 되나"의 첫 명령
aws inspector2 list-coverage \
  --filter-criteria '{"resourceType":[{"comparison":"EQUALS","value":"AWS_EC2_INSTANCE"}]}' \
  --query 'coveredResources[].{Id:resourceId,Status:scanStatus.statusCode,
                               Reason:scanStatus.reason,Type:scanType}'
```

`list-coverage`의 `scanStatus.reason`이 진단의 핵심이다. `UNMANAGED_EC2_INSTANCE`는 SSM 관리 상태가 아니라는 뜻이고, `NO_INVENTORY`는 SSM은 붙었지만 인벤토리 수집이 아직 안 됐다는 뜻이며, `SCAN_ELIGIBILITY_EXPIRED`·`RESOURCE_TERMINATED` 등은 자산 쪽 문제다. **"Inspector가 스캔을 안 한다"는 신고를 받으면 콘솔이 아니라 이 명령부터 친다.**

```bash
# 3) 지금 당장 처리해야 할 것만 추리기:
#    Critical + 익스플로잇 존재 + 고칠 방법 있음
aws inspector2 list-findings \
  --filter-criteria '{
    "severity":         [{"comparison":"EQUALS","value":"CRITICAL"}],
    "exploitAvailable": [{"comparison":"EQUALS","value":"YES"}],
    "fixAvailable":     [{"comparison":"EQUALS","value":"YES"}]
  }' \
  --sort-criteria '{"field":"INSPECTOR_SCORE","sortOrder":"DESC"}'

# 4) 감사·보고용 리포트 내보내기 (S3 + KMS 필요)
aws inspector2 create-findings-report \
  --report-format CSV \
  --s3-destination bucketName=sec-reports-111122223333,keyPrefix=inspector/,kmsKeyArn=arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234
```

조직 배포는 GuardDuty와 같은 두 단계 패턴이되, **스캔 유형마다 auto-enable을 따로 지정**한다는 점이 다르다.

```bash
# (관리 계정) Inspector 위임 관리자 지정
aws inspector2 enable-delegated-admin-account \
  --delegated-admin-account-id 999988887777

# (위임 관리자) 신규 계정 자동 포함 + 어떤 스캔을 켤지
aws inspector2 update-organization-configuration \
  --auto-enable ec2=true,ecr=true,lambda=true,lambdaCode=true
```

> ⚠️ **함정**: `--auto-enable`에서 `lambda`와 `lambdaCode`는 **다른 것**이다. `lambda`는 함수의 *의존성 패키지* 취약점(표준 스캔), `lambdaCode`는 *함수 코드 자체*의 취약점(하드코딩된 시크릿·인젝션 패턴 등)이다. "Lambda 스캔을 켰는데 코드에 박힌 자격증명을 못 찾는다"는 증상의 원인이 여기다. 마찬가지로 EC2를 켰다고 ECR이 켜지지 않는다 — **스캔 대상은 각각 독립적으로 활성화된다.**

### CI/CD 게이팅: 취약점을 프로덕션에 도달시키지 않는다

Inspector의 값이 가장 커지는 지점은 발견이 아니라 **배포 차단**이다. ECR 푸시 직후 스캔 결과를 파이프라인이 읽고, 기준을 넘으면 배포를 실패시킨다.

```
[ shift-left 게이팅 파이프라인 ]

  개발자 push
      │
      ▼
  CI 빌드 ──▶ ECR push
                │  (Inspector on-push 스캔 자동 실행)
                ▼
        EventBridge: ECR Image Scan 완료 이벤트
                │
                ├── Critical & exploitAvailable=YES  ──▶ 배포 파이프라인 FAIL
                │                                        + 개발팀 티켓 자동 생성
                └── 통과                              ──▶ 배포 진행
                                                          │
                                                          ▼
                                             continuous 스캔이 계속 감시
                                             (새 CVE 공시 시 이미 배포된 이미지 재평가)
                                                          │
                                                          └─▶ Security Hub → EventBridge
                                                                 → SSM Patch Manager / 재빌드 트리거
```

이 그림의 요점은 **왼쪽 게이트와 오른쪽 감시가 둘 다 필요하다**는 것이다. 게이트만 있으면 배포 시점에 깨끗했던 이미지가 한 달 뒤 취약해지는 것을 놓치고(on-push만 켠 상태), 감시만 있으면 이미 알려진 취약점을 계속 프로덕션에 밀어 넣게 된다. `on-push + continuous`를 함께 켜는 이유가 이것이다.

> 🎯 **시나리오**: "컨테이너 이미지에 critical CVE가 있으면 프로덕션 배포를 막고, 배포 이후에 새로 공시되는 CVE도 놓치지 않으며, 영향받는 EC2는 자동 패치하라"가 나오면 답은 **세 조각의 조합**이다. (1) ECR **on-push 스캔 + CI 게이트**로 배포 차단(shift-left), (2) ECR **continuous 스캔**으로 사후 공시 CVE 소급 재평가, (3) EC2 핀딩 → **Security Hub → EventBridge → SSM Patch Manager**로 교정 자동화. 여기서 "Inspector가 직접 패치한다"는 보기는 항상 오답이다 — Inspector는 진단만 하고 처방은 SSM이 한다. 또 "GuardDuty로 배포를 막는다"도 오답이다(GuardDuty는 취약점을 보지 않는다).

> 🔍 **더 깊이**: 배포 게이트를 걸 때 실무에서 가장 어려운 결정은 **기준선을 어디에 둘 것인가**다. "critical이 하나라도 있으면 실패"로 시작하면 대부분의 베이스 이미지가 즉시 걸려 파이프라인이 멈추고, 팀은 곧 게이트를 우회할 방법을 만든다 — 그러면 통제는 존재하지만 작동하지 않는 상태가 된다. 현실적인 진입 경로는 (1) 먼저 *경고만* 하며 현황을 측정하고, (2) `exploitAvailable=YES` **그리고** `fixAvailable=YES`인 것만 차단 대상으로 삼고(고칠 수 있는데 안 고친 것만 막는다), (3) 베이스 이미지를 최소 이미지로 교체해 애초에 패키지 수를 줄인 뒤, (4) 기준을 단계적으로 조인다. **고칠 수 없는 취약점으로 배포를 막는 게이트는 보안을 높이지 않고 우회 문화를 만든다** — 이것이 취약점 관리에서 정책 설계가 도구 선택만큼 중요한 이유다.

## 멀티계정: 위임 관리자 일관성

Inspector도 **Organizations + 위임 관리자** 패턴을 따른다. GuardDuty/Detective/Security Hub와 **동일한 Security Tooling 계정**을 Inspector 위임 관리자로 정렬하는 것이 멀티계정 베이스라인의 권장 구성이다:

```
관리 계정 ──지정──▶ Inspector 위임 관리자(Security Tooling 계정)
                          ├─ 조직 전 계정 Inspector 활성화 + auto-enable
                          ├─ 계정별 스캔 대상(EC2/ECR/Lambda) 중앙 정책
                          └─ 모든 발견 중앙 집계
```

> 🔍 **더 깊이**: Inspector를 단독 취약점 스캐너로 보면 "또 하나의 보고서 생성기"가 된다. 핵심은 *교정 루프*에 연결하는 것이다 — Inspector 발견 → Security Hub 집계 → EventBridge → SSM Patch Manager(자동 패치) 또는 ECR 이미지 재빌드 파이프라인(CI/CD에서 취약 이미지 배포 차단). 특히 CI/CD에서 ECR 스캔 결과를 게이트로 삼으면(critical CVE 있으면 배포 실패) "취약점이 프로덕션에 도달하기 전에" 막는 shift-left가 된다.

## 자주 틀리는 구분

- **Inspector vs GuardDuty**: Inspector는 *취약점*(악용 가능한 약점, 사전 예방), GuardDuty는 *위협*(실제 악성 활동, 탐지). 시점·대상이 다르다.
- **Inspector vs Patch Manager(SSM)**: Inspector는 *발견*(무엇이 취약한가), Patch Manager는 *교정*(패치 적용). Inspector가 진단, Patch Manager가 처방. 둘을 EventBridge로 연결.
- **Inspector vs Config**: Config는 *구성 규정 준수*(설정이 정책에 맞나), Inspector는 *소프트웨어 취약점*(CVE). 다른 축.
- **Inspector v1 vs 현행**: v1은 에이전트·수동 평가·규칙 패키지, 현행은 SSM/agentless·지속 스캔·자동. 현행이 기본.
- **Inspector vs ECR 기본 스캔**: ECR 자체의 basic scanning은 OS 패키지 위주의 제한적 스캔이고, Inspector 연동(enhanced scanning)이 언어 패키지·지속 재평가·컨텍스트 점수를 준다. "사후 공시 CVE"가 조건이면 enhanced 쪽이다.
- **Inspector vs Macie**: 취약점(코드·패키지의 약점) vs 민감 데이터(내용). Lambda code scanning이 "하드코딩된 시크릿"을 찾는다고 해서 Macie의 역할을 대신하지는 않는다 — 대상이 Lambda 코드지 S3 객체가 아니다.

## 스캔 대상별 전제 조건 한눈에

시험이 "왜 스캔이 안 되는가"를 묻는 방식은 대상마다 다르다. 전제 조건을 대상별로 분리해 외우는 것이 가장 안전하다.

| 대상 | 스캔되려면 | 안 될 때의 전형적 원인 |
|------|-----------|------------------------|
| **EC2 (에이전트 기반)** | SSM Agent 실행 + SSM 권한 인스턴스 프로파일 + SSM 연결(엔드포인트 도달) | 인스턴스 프로파일 미부착, 프라이빗 서브넷에 SSM VPC 엔드포인트 없음 |
| **EC2 (agentless)** | 지원되는 OS·볼륨 상태, EBS 스냅샷 접근 | 고객 관리형 KMS 키 권한 부족 |
| **ECR** | 리포지토리에 enhanced scanning 구성 | on-push만 켜짐(사후 CVE 누락), 스캔 대상 필터에서 제외됨 |
| **Lambda** | 함수가 지원 런타임 | 코드 취약점은 `lambdaCode`를 따로 켜야 함 |

> ⚠️ **함정**: 프라이빗 서브넷의 EC2가 스캔되지 않는 문제의 실제 원인은 대개 "Inspector 설정"이 아니라 **SSM 연결 경로**다. SSM Agent가 Systems Manager 엔드포인트에 도달하려면 NAT 게이트웨이나 `ssm`·`ssmmessages`·`ec2messages` VPC 엔드포인트가 필요하다. Inspector 화면에서 아무리 설정을 바꿔도 이 경로가 없으면 인벤토리가 올라오지 않는다. 시험에서 "인터넷 접근이 없는 서브넷"이라는 조건이 붙으면 이 사슬을 떠올려야 한다.

## 정리하며

Inspector는 "CVE 스캐너"라는 한 줄로 요약되지만, 시험이 실제로 묻는 것은 그 앞뒤다.

- **경계** — Inspector는 *약점*을 보고 *행위*는 보지 않는다. 침해 여부·악성 파일·민감 데이터는 각각 GuardDuty·Malware Protection·Macie의 몫이다. 그리고 발견만 하고 **고치지 않는다** — 교정은 SSM Patch Manager나 이미지 재빌드 파이프라인이 한다.
- **전제** — EC2는 SSM 관리(또는 agentless), ECR은 continuous, Lambda 코드 스캔은 별도 활성화. "켰는데 안 나온다"는 문제는 거의 전부 이 전제 중 하나가 빠진 것이다.
- **우선순위** — CVSS만으로 줄 세우면 실패한다. 도달성·익스플로잇 존재·수정 가능 여부·프로덕션 태그를 곱해 *우리 환경의 위험*으로 환산하는 것이 Inspector score의 취지이고, 그것이 곧 실무의 판단 방식이다.
- **루프** — 발견 → Security Hub 집계 → EventBridge → 자동 교정 → 재스캔으로 닫히는 순환이 있어야 취약점 수가 줄어든다. 리포트만 쌓이고 백로그가 늘어나는 상태는 도구가 아니라 프로세스의 실패다.

Equifax도 Log4Shell도 "패치가 없었던 것"이 아니라 **"어디에 있는지 몰랐던 것"**이 문제였다. 지속 스캔의 본질은 새 CVE가 나올 때마다 인벤토리 질문에 자동으로 답하는 것이며, 그래서 Inspector는 스캐너이기 이전에 **자산 가시성 도구**다.

## 한 줄 요약 체크리스트

- [ ] EC2/ECR/Lambda 스캔을 필요에 맞게 켜고, EC2는 SSM 관리 상태(또는 agentless)를 확인했는가
- [ ] ECR은 continuous 스캔으로 사후 공시 CVE까지 따라잡는가
- [ ] Inspector score(컨텍스트 기반 우선순위)로 도달 가능·익스플로잇 취약점부터 처리하는가
- [ ] 발견을 Security Hub·EventBridge·SSM Patch Manager에 연결해 교정을 자동화했는가
- [ ] 조직 위임 관리자(Security Tooling 계정)를 다른 탐지 서비스와 정렬했는가

---

## 📝 연습 문제

**문제 1.** 보안팀이 EC2 인스턴스를 Amazon Inspector에 등록했지만 일부 인스턴스가 스캔되지 않는다. 에이전트 기반 스캔을 사용 중일 때 가장 먼저 확인할 것은?

A) 인스턴스의 보안 그룹이 모든 포트를 열고 있는지  
B) 인스턴스가 SSM Agent 실행 + 적절한 IAM 인스턴스 프로파일로 Systems Manager 관리 상태인지  
C) 인스턴스에 퍼블릭 IP가 있는지  
D) 인스턴스가 us-east-1에 있는지  

**정답: B**  
해설: Inspector의 EC2 에이전트 기반 스캔은 인스턴스가 SSM으로 관리되어야 패키지 인벤토리를 수집할 수 있다. 따라서 SSM Agent 실행 여부와 SSM 권한을 가진 인스턴스 프로파일, SSM 연결 상태를 먼저 점검한다(또는 agentless 스캔으로 대체). 보안 그룹 개방·퍼블릭 IP·특정 리전은 스캔 가능 여부의 핵심 조건이 아니다.

---

**문제 2.** ECR에 저장된 컨테이너 이미지가 푸시 당시에는 취약점이 없었으나, 이후 새로 공시된 CVE에 취약해졌다. 이를 자동으로 따라잡으려면?

A) ECR 스캔을 on-push(1회)만 활성화한다  
B) ECR continuous(지속) 스캔을 활성화해 새 CVE 공시 시 기존 이미지를 자동 재평가한다  
C) 이미지를 매번 수동으로 다시 푸시한다  
D) GuardDuty Malware Protection을 켠다  

**정답: B**  
해설: on-push 스캔은 푸시 시점만 평가하므로 사후 공시 CVE를 놓친다. continuous 스캔은 새 CVE가 나올 때 이미 푸시된 이미지를 자동 재평가해 사후 취약점을 따라잡는다. 수동 재푸시는 비현실적이고, GuardDuty Malware Protection은 멀웨어 스캔이지 CVE 취약점 관리가 아니다.

---

**문제 3.** 동일하게 CVSS 9.0인 두 취약점 중 하나만 우선 패치하라는 요구가 있다. Amazon Inspector가 우선순위를 더 높게 매기는 쪽은?

A) 격리된 프라이빗 서브넷에 있어 인터넷에서 도달 불가능한 취약점  
B) 인터넷에서 도달 가능한 포트에 노출되고 공개 익스플로잇이 존재하는 취약점  
C) 두 취약점의 우선순위는 항상 동일하다  
D) 최근에 발견된 취약점이 무조건 우선이다  

**정답: B**  
해설: Inspector score는 CVSS 기본 점수에 네트워크 도달성과 익스플로잇 가능성 등 환경 컨텍스트를 곱해 위험을 가중한다. 같은 CVSS라도 인터넷 도달 가능 + 공개 exploit이 있는 취약점이 실제 위험이 훨씬 크므로 우선순위가 높다. 도달 불가능한 취약점은 후순위이고, 단순 발견 시점만으로 우선순위가 정해지지 않는다.

---

**문제 4.** Inspector 취약점 발견을 받아 영향받는 EC2 인스턴스에 자동으로 패치를 적용하는 교정 파이프라인을 구성하려 한다. 가장 적절한 연계는?

A) Inspector 발견 → EventBridge → SSM Patch Manager로 자동 패치 적용  
B) Inspector가 직접 인스턴스를 패치한다  
C) Inspector 발견 → Macie → 자동 패치  
D) Inspector → Detective → 자동 패치  

**정답: A**  
해설: Inspector는 발견(진단)만 하고 교정은 다른 서비스가 한다. 발견을 EventBridge로 받아 SSM Patch Manager(또는 Lambda)로 자동 패치를 적용하는 것이 정석적인 교정 자동화 파이프라인이다. Inspector가 직접 패치하지 않으며, Macie는 데이터 분류, Detective는 조사 도구로 패치 교정과 무관하다.

---

**문제 5.** Amazon Inspector와 GuardDuty의 역할 차이를 가장 정확히 설명한 것은?

A) 둘 다 동일하게 실시간 악성 트래픽을 차단한다  
B) Inspector는 악용 가능한 취약점(CVE 등)을 사전에 발견하고, GuardDuty는 실제 악성 활동(위협)을 탐지한다  
C) Inspector는 위협을, GuardDuty는 취약점을 다룬다  
D) Inspector는 S3 PII를 분류하고 GuardDuty는 CVE를 스캔한다  

**정답: B**  
해설: Inspector는 EC2/ECR/Lambda의 취약점(약점)을 사전에 찾아 우선순위화하고, GuardDuty는 자격증명 오남용·악성 통신 등 실제 위협 활동을 탐지한다 — 예방(약점 축소)과 탐지(공격 포착)의 보완 관계다. C는 역할이 뒤바뀌었고, 둘 다 트래픽을 차단하지 않으며, PII 분류는 Macie의 몫이다.

---
