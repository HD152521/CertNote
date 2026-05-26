# Day 22 - S3: 버전 관리, 수명 주기 정책, 그리고 복제의 내부 동작

처음 S3 버전 관리를 배울 때 많은 개발자들이 "그냥 백업 기능이구나"하고 넘어간다. 그러다 운영 환경에서 버전 관리 활성화 후 스토리지 비용이 갑자기 10배가 되는 상황을 만나거나, 삭제했다고 생각한 파일이 감사 시스템에 여전히 보이는 상황을 겪으면서 버전 관리의 실제 동작 방식을 비로소 이해하게 된다. 이 day에서는 버전 관리의 내부 메커니즘, 수명 주기 정책의 전환 그래프, 그리고 복제가 비동기로 동작하는 이유와 그 함의를 깊이 파고든다.

## 버전 관리의 내부 구조 — 삭제 마커와 버전 ID

버전 관리를 활성화한 S3 버킷에서 객체는 단순한 키-값 쌍이 아니라 **키 + 버전 ID**의 조합으로 저장된다. 버전 ID는 S3가 자동 생성하는 불투명한 문자열(예: `versionId: "3/L4kqtJlcpXrALLEAjahyKwzSEFI.B`)이며, 모든 PUT 요청마다 새로운 버전이 생성된다.

버전 관리가 활성화되지 않았을 때 업로드된 객체의 버전 ID는 `null`이다. 버전 관리를 나중에 활성화해도 기존 객체의 버전 ID는 `null`로 유지된다. 이 점이 실무에서 자주 혼동을 만든다 — 버전 관리를 켰는데 왜 기존 파일에 버전이 없냐는 것이다.

```
[버전 관리 활성화 시 객체 타임라인]

PUT report.pdf  → 버전 abc123 (최신)
PUT report.pdf  → 버전 def456 (최신)
DELETE report.pdf → 삭제 마커 ghi789 (최신, 내용 없음)

버킷 목록에서: report.pdf 안 보임 (마커가 최신)
GET report.pdf  → 404 Not Found

마커 삭제 (DELETE marker ghi789):
  → 버전 def456 다시 최신이 됨
  → GET report.pdf → 정상 동작
```

> 💡 **관련 이론**: 삭제 마커 패턴은 분산 데이터베이스에서 **tombstone** 기법과 동일하다. Apache Cassandra, Amazon DynamoDB도 같은 원리를 사용한다 — 데이터를 실제로 즉시 삭제하는 대신 "이 키는 삭제됐다"는 표시만 남기고, 나중에 compaction이나 정리 과정에서 실제 데이터를 제거한다. S3에서 삭제 마커가 최신 버전이 되면 해당 객체는 논리적으로 삭제된 상태지만, 이전 버전들은 물리적으로 존재하며 버전 ID를 명시해야만 접근할 수 있다.

## 버전 관리의 3가지 상태와 그 함의

S3 버전 관리에는 정확히 세 가지 상태가 있다.

**Unversioned(미활성화, 기본값)**: 새 PUT이 이전 객체를 완전히 덮어쓴다. 이전 데이터는 복구 불가능하다. 버전 ID가 없으며 모든 객체의 버전 ID는 `null`이다.

**Enabled(활성화)**: 모든 버전이 보존된다. PUT마다 새 버전 ID가 생성된다. 삭제는 삭제 마커를 추가한다. 이 상태는 **비활성화(Unversioned로 되돌리기)가 불가능하다.** 한번 켜면 끌 수 없다.

**Suspended(일시 중지)**: 새 PUT은 버전 ID `null`로 저장되며 이전의 `null` 버전을 덮어쓴다. 기존 버전들은 유지된다. 새로운 버전은 생성되지 않는다.

> ⚠️ **함정**: "버전 관리를 비활성화하고 싶다"는 요구사항이 있을 때, 정확한 답은 Suspend(일시 중지)뿐이다. Disabled로 되돌아가는 방법은 없다. 시험에서 "버전 관리를 끄는 방법"을 물으면 "Suspended 상태로 설정"이 정답이다.

## MFA Delete — 루트 계정의 마지막 보루

MFA Delete는 두 가지 작업에 MFA 인증을 요구한다. ① 버전의 영구 삭제(버전 ID를 명시한 DELETE), ② 버전 관리 상태 변경(Enabled ↔ Suspended). 이 기능은 **루트 계정만 활성화/비활성화**할 수 있다.

왜 루트 계정만인가? 관리자 IAM 사용자의 자격증명이 탈취됐을 때 공격자가 버전 데이터를 모두 삭제하는 시나리오를 막기 위해서다. 루트 계정은 별도의 MFA 디바이스를 가지고, 일상적인 운영에는 사용하지 않는다 — 이 조합이 "마지막 보루"를 형성한다.

MFA Delete를 활성화하려면 CLI로만 가능하며 콘솔에서는 안 된다.

```bash
# MFA Delete 활성화 (루트 계정으로만 실행 가능)
aws s3api put-bucket-versioning \
  --bucket my-critical-bucket \
  --versioning-configuration Status=Enabled,MFADelete=Enabled \
  --mfa "arn:aws:iam::123456789012:mfa/root-account-mfa-device 123456"
```

> 📚 **사례**: 2019년 한 SaaS 기업의 DevOps 엔지니어가 피싱 공격으로 자격증명을 탈취당했다. 공격자는 탈취한 관리자 권한으로 S3의 버전 관리된 데이터를 모두 영구 삭제했다. 당시 버킷에 MFA Delete가 설정되어 있지 않았기 때문에 복구가 불가능했다. 이후 이 기업은 모든 중요 버킷에 MFA Delete를 설정하고, Object Lock Compliance 모드를 추가 적용했다. 교훈: 버전 관리만으로는 충분하지 않다 — 버전 자체를 삭제로부터 보호하는 별도 레이어가 필요하다.

## 수명 주기 정책 — 전환 방향과 불가능한 역방향

수명 주기 정책(Lifecycle Policy)은 두 종류의 규칙으로 구성된다. **전환 규칙(Transition Action)**: 시간이 지나면 스토리지 클래스를 변경한다. **만료 규칙(Expiration Action)**: 시간이 지나면 삭제(또는 삭제 마커 추가)한다.

중요한 것은 전환이 단방향이라는 점이다. 더 "저렴한" 방향으로만 이동할 수 있고, 역방향은 불가능하다. 역방향이 필요하다면 객체를 복원(Restore)하거나 복사해야 한다.

```
[가능한 전환 방향]

Standard 
  → Standard-IA (30일 이상 경과 후)
  → Intelligent-Tiering
  → Glacier Instant Retrieval (90일 이상)
  → Glacier Flexible Retrieval
  → Glacier Deep Archive

Standard-IA
  → Intelligent-Tiering
  → Glacier Instant Retrieval
  → Glacier Flexible Retrieval  
  → Glacier Deep Archive

Intelligent-Tiering
  → Glacier Instant Retrieval
  → Glacier Flexible Retrieval
  → Glacier Deep Archive

Glacier Instant Retrieval
  → Glacier Flexible Retrieval
  → Glacier Deep Archive

Glacier Flexible → Glacier Deep Archive

[불가능한 전환]
Glacier → Standard (역방향 불가)
Deep Archive → 그 외 모두 (역방향 불가)
Standard-IA → Standard (역방향 불가)
```

> ⚠️ **함정**: "Intelligent-Tiering에서 Standard로 돌아갈 수 있느냐"는 시험 함정이다. 수명 주기 정책으로는 불가능하다. 수동으로 객체를 복사(COPY 작업)하면서 스토리지 클래스를 Standard로 지정해야 한다. 이 복사는 API 요청 비용이 발생한다.

## 수명 주기 정책 예시 — 전형적인 기업 패턴

```json
{
  "Rules": [
    {
      "ID": "LogArchiveRule",
      "Status": "Enabled",
      "Filter": { "Prefix": "logs/" },
      "Transitions": [
        { "Days": 30, "StorageClass": "STANDARD_IA" },
        { "Days": 90, "StorageClass": "GLACIER" },
        { "Days": 365, "StorageClass": "DEEP_ARCHIVE" }
      ],
      "Expiration": { "Days": 2555 },
      "NoncurrentVersionTransitions": [
        { "NoncurrentDays": 30, "StorageClass": "STANDARD_IA" }
      ],
      "NoncurrentVersionExpiration": { "NoncurrentDays": 90 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }
  ]
}
```

여기서 `NoncurrentVersionExpiration`이 핵심이다. 버전 관리 활성화 버킷에서 이전 버전(NonCurrent Version)을 자동으로 삭제하지 않으면, 매 PUT마다 스토리지가 쌓인다. 파일을 100번 덮어쓰면 100개의 버전이 모두 저장되어 있다. 이것이 "버전 관리 켰더니 비용 폭증" 문제의 원인이다.

`AbortIncompleteMultipartUpload`도 중요하다. 멀티파트 업로드를 시작했지만 완료하지 않은 경우, 업로드된 파트들은 완료 작업 없이는 S3에 남아서 비용이 계속 발생한다. 7일 후 자동 중단으로 이 "좀비 멀티파트"를 정리해야 한다.

> 🔍 **더 깊이**: S3 수명 주기 정책은 자정(UTC) 기준으로 하루에 한 번 평가된다. "30일 후 전환"이라고 해도 정확히 30일 후가 아니라 30일이 지난 다음 번 평가 시점(자정)에 전환이 시작된다. 그리고 전환 자체도 즉시 완료되지 않고 수 시간이 걸릴 수 있다. 이 지연은 SLA 문서에 명시되어 있지 않으므로, 수명 주기 정책은 "정확한 시간" 제어가 아니라 "대략적인 기간" 관리에 사용해야 한다.

## Object Lock — WORM 스토리지의 구현

Object Lock은 객체를 **한번 쓰면 수정·삭제 불가(WORM: Write Once Read Many)** 로 만드는 기능이다. 금융 규제(SEC Rule 17a-4), 의료 규제(HIPAA), 법적 증거 보존에 필수다.

두 가지 보존 모드가 있다. **Governance 모드**는 특별한 IAM 권한(`s3:BypassGovernanceRetention`)이 있는 사용자가 보존을 우회하거나 기간을 조정할 수 있다. **Compliance 모드**는 루트 계정을 포함한 **누구도** 보존 기간 전에 객체를 삭제하거나 모드를 변경할 수 없다. AWS 지원도 불가능하다.

**Legal Hold**는 기간과 무관하게 객체를 보존하는 토글이다. 소송이 진행 중인 동안 데이터를 잠그고, 소송 종료 시 해제하는 패턴으로 사용된다.

> 💡 **관련 이론**: WORM 스토리지는 1990년대 광학 디스크(CD-R, DVD-R)에서 시작된 개념이다. 당시 금융 기관들은 수정 불가능한 감사 로그를 광학 미디어에 저장했다. S3 Object Lock은 이 개념을 클라우드 네이티브로 구현한 것으로, WORM 스토리지 어플라이언스(NetApp SnapLock, EMC Centera)를 대체할 수 있다. SEC Rule 17a-4(f)(2) 요건을 충족하기 위해 Compliance 모드를 사용하고 AWS와의 컴플라이언스 서한을 받아야 한다.

## 복제의 내부 동작 — 비동기와 그 의미

S3 복제(Replication)는 기본적으로 **비동기**다. PUT이 완료된 직후 다른 리전의 버킷을 보면 아직 객체가 없을 수 있다. 이 비동기 간격이 복제 지연(Replication Lag)이다. 대부분의 경우 수 초에서 수 분이지만, 네트워크 파티션이나 피크 타임에는 더 길어질 수 있다.

**CRR(Cross-Region Replication)** 은 재해 복구(다른 리전 장애 시 전환)와 글로벌 지연 시간 최적화(가까운 리전의 복제본 읽기)에 사용된다. **SRR(Same-Region Replication)** 은 개발/스테이징 환경 분리(프로덕션 데이터를 테스트 버킷에 실시간 미러링), 로그 집계(여러 계정의 로그를 중앙 버킷으로), 법적 이유로 같은 리전 내 다른 계정으로의 복제에 사용된다.

복제의 핵심 요구사항: 양쪽 버킷 모두 버전 관리 활성화 필수. 이유는 복제가 버전 ID를 사용하여 객체를 식별하기 때문이다.

| 항목 | 내용 |
|------|------|
| 복제 트리거 | 새 PUT 기본, 메타데이터/태그 변경도 옵션 |
| 복제 대상 아님 | 수명 주기 정책으로 전환된 객체, SSE-C 암호화 객체 |
| 삭제 마커 복제 | 선택 사항 (기본 OFF) |
| 기존 객체 복제 | S3 Batch Replication 별도 사용 |
| 양방향 복제 | 2019년부터 지원 (Active-Active DR) |
| KMS 암호화 객체 | 대상 리전 KMS 키 별도 지정 필요 |

> ⚠️ **함정**: 삭제 마커 복제를 양방향으로 활성화하면 한쪽에서 삭제한 것이 다른 쪽에도 삭제 마커로 복제된다. 두 버킷이 Active-Active 패턴으로 운영될 때는 이 설정이 예상치 못한 "교차 삭제"를 일으킬 수 있다. 양방향 복제 + 삭제 마커 복제는 매우 신중하게 설정해야 한다.

## Replication Time Control(RTC) — 복제 지연의 SLA화

RTC(Replication Time Control)는 99.99%의 객체를 **15분 이내에** 복제하겠다는 SLA를 AWS가 제공하는 유료 옵션이다. 동시에 Replication Metrics가 자동 활성화되어 복제 지연, 복제 대기 객체 수 등을 CloudWatch로 모니터링할 수 있다.

RTC를 사용해야 하는 시나리오: 규제상 RPO(Recovery Point Objective)가 15분 이내로 명시된 경우, 금융 기관의 실시간 리스크 데이터 복제, 의료 기관의 환자 데이터 재해 복구.

> 📚 **사례**: 2022년 글로벌 핀테크 기업 Revolut은 영국 금융감독청(FCA)의 운영 복원력 규정에 맞추기 위해 S3 RTC를 도입했다. FCA는 주요 IT 서비스의 "중요 데이터"에 대해 RPO 15분을 요구했고, 표준 S3 복제의 지연 시간을 SLA로 보증받을 수 없었다. RTC 도입 후 감사 보고서에 복제 지연 메트릭을 포함할 수 있게 됐다.

## S3 Inventory — 수십억 객체의 메타데이터 관리

S3 Inventory는 버킷의 모든 객체 목록을 CSV, ORC, 또는 Parquet 형식으로 정기적으로 생성한다. 일별/주별로 생성할 수 있으며, 생성된 보고서는 다른 S3 버킷에 저장된다.

실무에서 S3 Inventory가 필요한 상황: ① 수십억 개 객체의 암호화 상태 감사 — LIST 작업으로는 너무 느리고 비용이 많이 든다. ② 특정 태그가 없는 객체 찾기. ③ 복제 상태 확인. ④ Batch Operations의 입력으로 사용.

시험 시나리오: "1억 개 객체의 암호화 상태를 확인해야 한다" → S3 Inventory + Athena로 SQL 분석이 정답이다.

## S3 Batch Operations — 대규모 객체 일괄 작업

Batch Operations는 수십억 개의 S3 객체에 동일한 작업을 적용하는 관리형 서비스다. S3 Inventory 보고서나 직접 작성한 manifest CSV를 입력으로 받아, 지정한 Lambda 함수나 내장 작업을 병렬로 실행한다.

지원 작업: Copy(복사), Replace Object Tagging(태그 교체), Replace Object ACL(ACL 교체), Object Lock 보존 설정 변경, Lambda 함수 호출, Restore from Glacier.

"기존 1억 개 객체에 SSE-KMS 암호화 적용" → Batch Operations로 Copy 작업(SSE-KMS 지정)을 실행하는 것이 정답이다.

수명 주기 정책은 새로 저장되는 객체에는 적용되지만, 이미 저장된 객체에는 적용되지 않는다. 기존 객체를 마이그레이션할 때는 Batch Operations를 사용해야 한다.

> 🔍 **더 깊이**: S3 Batch Operations의 내부 동작은 Spark나 Flink의 분산 처리와 유사하다. Job을 생성하면 S3가 내부적으로 작업을 수천 개의 워커에 분산하고, 각 워커가 매니페스트의 일부를 처리한다. 실패한 항목은 재시도되고, 완료 후 성공/실패 통계가 담긴 completion report가 지정한 S3 버킷에 생성된다.

오늘 살펴본 버전 관리, 수명 주기, 복제의 내부 동작은 S3를 단순한 파일 저장소가 아니라 엔터프라이즈급 데이터 관리 플랫폼으로 만드는 기능들이다. 다음 day에서는 이 데이터에 누가, 어떻게 접근할 수 있는지를 제어하는 보안 모델 — 버킷 정책, ACL, 암호화 — 을 깊이 살펴본다.

## 📝 연습 문제

**문제 1.** S3 버킷에서 버전 관리를 활성화한 후 특정 파일을 DELETE API로 삭제했다. 이후 같은 키로 GET 요청을 보냈을 때 어떤 결과가 나오는가?

A) 마지막으로 업로드된 버전의 내용이 반환된다
B) 404 Not Found가 반환되며, 이전 버전들은 버전 ID를 통해 접근 가능하다
C) 가장 오래된 버전의 내용이 반환된다
D) 빈 응답(200 OK)이 반환된다

**정답: B**
해설: 버전 관리 활성화 버킷에서 버전 ID 없이 DELETE를 실행하면 객체를 실제로 삭제하지 않고 삭제 마커(Delete Marker)를 추가한다. 삭제 마커가 최신 버전이 되므로 버전 ID 없는 GET 요청은 404를 반환한다. 이전 버전들은 물리적으로 존재하며 특정 버전 ID를 명시하면 접근할 수 있다. 실제로 특정 버전을 영구 삭제하려면 DELETE 요청에 버전 ID를 명시해야 한다.

---

**문제 2.** 다음 중 S3 수명 주기 정책에서 불가능한 전환은?

A) Standard → Standard-IA (30일 후)
B) Glacier Flexible Retrieval → Glacier Deep Archive
C) Standard-IA → Standard (30일 후)
D) Standard-IA → Glacier Flexible Retrieval

**정답: C**
해설: S3 수명 주기 전환은 단방향이며, 더 저렴한(덜 자주 접근하는) 클래스 방향으로만 이동할 수 있다. Standard-IA에서 Standard로의 역방향 전환은 수명 주기 정책으로 불가능하다. 원래 클래스로 돌아가려면 객체를 직접 복사하면서 스토리지 클래스를 지정해야 한다. A(Standard→IA 30일 후), B(Glacier→Deep Archive), D(IA→Glacier)는 모두 유효한 전환 방향이다.

---

**문제 3.** S3 복제에 대한 올바른 설명은?

A) 복제를 활성화하면 기존 객체도 자동으로 복제된다
B) CRR은 재해 복구에만 사용할 수 있고 SRR은 비용 절감에만 사용한다
C) 복제가 작동하려면 소스와 대상 버킷 모두 버전 관리가 활성화되어 있어야 한다
D) 삭제 마커는 항상 복제된다

**정답: C**
해설: S3 복제의 핵심 요구사항은 소스와 대상 버킷 모두 버전 관리 활성화다. 복제는 버전 ID를 기반으로 동작하기 때문이다. A는 틀렸다 — 기존 객체는 복제되지 않으며, S3 Batch Replication을 별도로 사용해야 한다. B는 틀렸다 — CRR은 지연 시간 최적화에도, SRR은 개발 환경 분리나 로그 집계에도 사용된다. D는 틀렸다 — 삭제 마커 복제는 기본적으로 OFF이며 선택 활성화다.

---

**문제 4.** 다음 중 Object Lock Compliance 모드에 대한 올바른 설명은?

A) IAM 관리자 권한이 있으면 보존 기간 전에 삭제할 수 있다
B) 루트 계정은 언제든 보존을 해제할 수 있다
C) AWS 지원팀에 요청하면 보존 기간 전에 삭제가 가능하다
D) 보존 기간이 만료될 때까지 루트 계정을 포함한 누구도 객체를 삭제하거나 모드를 변경할 수 없다

**정답: D**
해설: Compliance 모드는 가장 강력한 WORM 보호를 제공한다. 루트 계정, IAM 관리자, AWS 지원팀 모두 보존 기간 전에 객체를 삭제하거나 모드를 변경할 수 없다. 이것이 Governance 모드와의 핵심 차이다 — Governance 모드에서는 `s3:BypassGovernanceRetention` 권한을 가진 사용자가 보존을 우회할 수 있다. 금융·의료 규제 환경에서는 Compliance 모드를 사용해야 SEC Rule 17a-4 등의 요건을 충족할 수 있다.

---

**문제 5.** 버전 관리가 활성화된 S3 버킷에서 스토리지 비용이 예상보다 훨씬 높게 나왔다. 가장 가능성 높은 원인과 해결책은?

A) CRR이 활성화되어 있어 복제 비용이 발생 → CRR 비활성화
B) 이전 버전들이 자동 삭제되지 않아 모든 버전이 저장 중 → 수명 주기 정책으로 NoncurrentVersionExpiration 설정
C) 버전 관리 자체에 추가 비용이 있음 → 버전 관리 일시 중지
D) MFA Delete가 활성화되어 추가 비용 발생 → MFA Delete 비활성화

**정답: B**
해설: 버전 관리 활성화 시 객체를 덮어쓸 때마다 새 버전이 생성되고, 이전 버전들도 모두 저장된다. 이전 버전은 자동 삭제되지 않으며 각각 별도 저장 비용이 발생한다. 파일을 하루에 10번 덮어쓰면 한 달에 300개의 버전이 생길 수 있다. 해결책은 `NoncurrentVersionExpiration` 규칙으로 일정 기간(예: 30일) 이상 된 이전 버전을 자동 삭제하는 것이다. 버전 관리 자체에 추가 비용은 없고, MFA Delete는 비용과 무관하다.

---
