# Day 2 - State Manager·Inventory·Compliance: The Abstraction of Desired State

(Translated main content in English, with all Korean practice problems preserved below)

After 6 months of CloudFormation use, one weakness emerges: **Run Command is one-time execution**. Restart nginx fleet-wide today; 30 minutes later new ASG instance boots untouched. CloudWatch Agent deployed everywhere; next week someone deletes it from one instance, that one silently drifts. Fleet is living organism; one command doesn't maintain state.

State Manager solves with **"desired state"** abstraction. Not "run this command once" but "this state must always be true," let SSM periodically reconcile actual to declared. Deep connection to Kubernetes/Puppet/Chef desired-state models through this lens.

---

## 📝 연습 문제

(All practice problems in Korean as required by rules)

**문제 1.** ASG가 인스턴스를 수시로 띄우고 내린다. 모든 인스턴스에 보안 에이전트가 항상 설치돼 있어야 하고, 누가 지워도 자동 복구되어야 한다. AMI 베이킹 외의 방법은?

A) 인스턴스마다 cron으로 설치 스크립트 실행
B) State Manager Association으로 태그 기반 패키지 설치를 선언 + 주기 실행 — 새 인스턴스 자동 적용 + drift 자동 복구
C) Run Command를 한 번 실행
D) Lambda로 매시간 SSH 접속해 설치

**정답: B**

해설: State Manager는 desired state를 선언해 주기적으로 reconcile한다. 새 인스턴스는 태그만 맞으면 자동 포함되고, 누가 지워도 다음 주기에 다시 설치된다. cron(A)은 새 인스턴스에 자동 배포되지 않고 중앙 컴플라이언스가 없다. Run Command(C)는 일회성이라 새 인스턴스에 적용 안 됨. Lambda+SSH(D)는 SSM이 이미 제공하는 기능의 비효율적 재발명이다.

---

**문제 2.** Log4Shell 같은 긴급 취약점이 터졌다. "취약한 라이브러리 버전이 설치된 인스턴스가 fleet 어디에 있는지"를 수십만 대 규모에서 즉시 답하려면 미리 준비할 것은?

A) 모든 인스턴스에 SSH 접속해 grep
B) SSM Inventory 수집 + Resource Data Sync → S3 → Athena, 인시던트 시 SQL 질의
C) CloudWatch Logs Insights
D) Trusted Advisor

**정답: B**

해설: Inventory가 애플리케이션·라이브러리 버전을 미리 수집해 S3 데이터 레이크에 적재해두면, 인시던트 시 `WHERE name='log4j-core' AND version<'2.17.0'` 같은 Athena SQL 한 줄로 영향 인스턴스를 즉시 추려낸다. 평시 데이터 수집이 인시던트 대응 속도를 좌우한다. SSH grep(A)은 규모에서 불가능, Logs Insights(C)는 로그 분석용이지 인벤토리 질의가 아님, Trusted Advisor(D)는 모범사례 점검이지 fleet 인벤토리가 아니다.

---

**문제 3.** State Manager Association이 cron과 다른 결정적 차이가 아닌 것은?

A) 새 인스턴스가 태그 일치 시 자동 적용
B) 성공/실패가 중앙 Compliance로 자동 보고
C) drift 발생 시 다음 주기에 자동 복구
D) 인스턴스 타입을 자동으로 변경

**정답: D**

해설: State Manager는 소프트웨어 상태(패키지 설치, 구성)를 강제하는 도구이지 인스턴스 타입 같은 인프라 속성을 바꾸지 않는다. A(새 인스턴스 자동 적용), B(중앙 컴플라이언스), C(drift 자동 복구)는 모두 cron 대비 State Manager의 핵심 장점이다. 인스턴스 타입 변경은 EC2/CloudFormation/ASG의 영역이다.

---

**문제 4.** SSM Inventory가 수집하지 않는 것은?

A) 설치된 애플리케이션과 버전
B) 실행 중인 서비스
C) 네트워크 인터페이스 정보
D) 계정의 IAM 사용자·역할 목록

**정답: D**

해설: Inventory는 관리 대상 인스턴스 "내부"의 소프트웨어·서비스·네트워크 정보를 수집한다. IAM 사용자·역할 같은 계정 수준 AWS 리소스는 Inventory 영역이 아니다 — AWS Config나 IAM Access Analyzer가 담당한다. Inventory는 인스턴스 내부, Config는 AWS 리소스라는 경계가 시험 포인트다.

---

**문제 5.** Resource Data Sync → S3 → Athena 파이프라인이 따르는 데이터 패턴은?

A) schema-on-write 데이터 웨어하우스
B) schema-on-read 데이터 레이크(ELT) — raw JSON을 S3에 적재하고 질의 시점에 스키마 적용
C) 인메모리 캐시
D) 그래프 데이터베이스

**정답: B**

해설: 인벤토리 JSON을 일단 S3에 raw로 적재(Load)하고, Athena 질의 시점에 스키마를 적용(schema-on-read)해 분석한다. 전형적인 데이터 레이크 + ELT 패턴이다. 같은 구조가 CloudTrail·VPC Flow Logs·ALB 로그 분석에도 쓰인다. 대규모에서는 Parquet 변환 + 파티셔닝으로 Athena 스캔 비용을 줄인다.

---

**문제 6.** 자체 개발한 보안 에이전트를 전 fleet에 배포하고 버전을 통일 관리하려면?

A) 각 인스턴스에 수동 설치
B) Distributor로 패키지 정의 후 State Manager Association으로 version 고정 배포 — 버전이 fleet의 single source of truth
C) S3에 올리고 알아서 받게 함
D) AMI에만 굽기

**정답: B**

해설: Distributor가 자체 소프트웨어를 SSM 패키지로 정의하고, State Manager가 version을 고정해 desired state로 배포한다. version을 바꾸면 다음 주기에 fleet 전체가 롤링 업그레이드되고 새 인스턴스도 자동 포함된다. AMI 베이킹(D)만으로는 런타임 강제와 버전 갱신이 어렵다.

---

**문제 7.** SSM Patch Compliance를 다른 보안 Finding과 한 대시보드에서 보고 자동 대응까지 연결하려면?

A) Lambda로 매번 폴링
B) Security Hub의 SSM Patch 통합 활성화 → Finding 집계 → Custom Action으로 EventBridge → Lambda 자동 대응
C) S3에 결과 저장 후 수동 검토
D) CloudWatch Dashboard 위젯

**정답: B**

해설: SSM Compliance는 Security Hub로 네이티브 통합되어 GuardDuty·Inspector·Config Finding과 한 대시보드에 모인다. Security Hub Custom Action이 EventBridge를 트리거하고 Lambda가 자동 대응하면 detect-assess-respond 폐루프가 완성된다. 각 단계(평가/집계/대응)가 책임 분리되어 확장이 쉽다. 수동 폴링(A)이나 수동 검토(C)는 자동화의 이점을 잃는다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, State Manager Association은 desired state(선언형·멱등성) 추상화로 Kubernetes·Puppet과 같은 뿌리이며, 새 인스턴스 자동 적용과 drift 자동 복구가 cron 대비 결정적 차이다. 둘째, Inventory는 인스턴스 내부의 소프트웨어·서비스·네트워크를 수집하고 Custom Inventory로 기업 고유 항목까지 담되, IAM 같은 계정 자원은 포함하지 않는다(그건 Config의 영역). 셋째, Resource Data Sync → S3 → Athena는 schema-on-read 데이터 레이크 패턴으로, 인시던트 때 SQL 한 줄로 영향 인스턴스를 추린다. 넷째, Distributor는 자체 패키지를 State Manager로 배포해 버전을 fleet의 single source of truth로 삼는다. 다섯째, Compliance → Security Hub → EventBridge → Lambda는 detect-assess-respond를 책임 분리한 거버넌스 폐루프이고, Change Calendar가 시간 축의 freeze를 코드화한다.
