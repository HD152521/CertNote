// 다이어그램 스펙. 파일당 하나의 SVG 를 만든다.
// key = public/diagrams/<key>.svg, src = 원본 ASCII 가 있던 위치(추적용)

import { nest, flowDown, cycle, stack, fanout, boxedStack, columns, merge, compareStacks, pair, branch, lineChart, multiChart, T } from './render.mjs';

export const specs = {
  'ai-ml-dl-nesting': {
    src: 'aif-c01/week1/day1',
    svg: () =>
      nest({
        title: 'AI · 머신러닝 · 딥러닝의 포함 관계',
        desc: '인공지능이 가장 넓은 개념이고 그 안에 머신러닝이, 머신러닝 안에 딥러닝이 포함된다.',
        layers: [
          { label: '인공지능 (AI)', note: '사람의 지능을 흉내 내는 모든 기술', color: T.accent },
          { label: '머신러닝 (ML)', note: '데이터로 규칙을 스스로 찾는 방법', color: T.violet },
          { label: '딥러닝 (DL)', note: '신경망을 깊게 쌓은 머신러닝', color: T.warn },
        ],
      }),
  },

  'ml-feedback-loop': {
    src: 'aif-c01/week2/day4',
    svg: () =>
      cycle({
        title: '사람이 돌리는 ML 개선 고리',
        desc: '라벨링, 학습, 모델 응답, 사람의 평가와 교정을 거쳐 다시 학습으로 돌아오는 반복 구조.',
        steps: ['라벨링', '학습', '모델이 답함', '사람이 평가·교정'],
        back: '새 라벨·피드백을 반영해 재학습',
      }),
  },

  'process-fg-bg': {
    src: 'linux-master-2/week6/day3',
    svg: () =>
      cycle({
        title: '포그라운드와 백그라운드 전환',
        desc: '포그라운드에서 Ctrl+Z 로 정지시키고 bg 로 백그라운드에 보내며 fg 로 다시 가져온다.',
        steps: ['명령 실행', '포그라운드', '정지 (Ctrl+Z)', '백그라운드 (bg)'],
        back: 'fg — 다시 포그라운드로',
      }),
  },

  'cloudfront-route53': {
    src: 'clf-c02/week2/day4',
    svg: () =>
      flowDown({
        title: 'Route 53 과 CloudFront 가 함께 일하는 순서',
        desc: '사용자 요청이 Route 53 에서 CloudFront 주소로 안내되고, 캐시가 없을 때만 오리진까지 간다.',
        steps: [
          { label: '사용자', sub: 'www.example.com 입력', color: T.muted },
          { label: 'Route 53 (DNS)', sub: '이름을 CloudFront 주소로 안내', edge: '' },
          {
            label: 'CloudFront (엣지/CDN)',
            sub: '가장 가까운 엣지에서 응답',
            note: '캐시에 있으면 여기서 끝',
            edge: '캐시 미스일 때만',
            color: T.warn,
          },
          { label: '오리진 (S3 · EC2)', sub: '콘텐츠 원본', color: T.ok },
        ],
      }),
  },

  'linux-distro-layers': {
    src: 'linux-master-2/week1/day4',
    svg: () =>
      boxedStack({
        title: '리눅스 배포판을 이루는 계층',
        desc: '배포판은 리눅스 커널 위에 GNU 도구, 패키지 관리자, 데스크톱 환경, 응용 소프트웨어를 얹어 하나로 묶은 것이다.',
        container: '배포판 (Distribution)',
        layers: [
          { label: '응용 소프트웨어', note: '웹 브라우저 · 오피스' },
          { label: '데스크톱 환경', note: 'GNOME · KDE' },
          { label: '패키지 관리자', note: 'rpm/dnf · dpkg/apt' },
          { label: 'GNU 도구', note: 'bash · ls · cp · gcc' },
          { label: '리눅스 커널', note: '하드웨어를 직접 다룬다', color: T.warn },
        ],
      }),
  },

  'desktop-wm-dm': {
    src: 'linux-master-2/week8/day3',
    svg: () =>
      nest({
        title: '데스크톱 환경 · 윈도 매니저 · 디스플레이 매니저의 자리',
        desc: '데스크톱 환경이 윈도 매니저를 포함하고, 그 아래를 디스플레이 매니저와 X 서버가 떠받친다.',
        layers: [
          {
            label: '데스크톱 환경 (GNOME · KDE · Xfce)',
            note: '윈도매니저 + 패널 + 파일관리자 + 기본 응용프로그램',
            color: T.accent,
          },
          {
            label: '윈도 매니저 (KWin · Mutter · Xfwm)',
            note: '창 테두리 · 이동 · 크기조절 · 최소화',
            color: T.violet,
          },
        ],
        below: [
          { label: '디스플레이 매니저 (GDM · SDDM · LightDM)', note: '로그인 화면을 띄우고 세션을 시작' },
          { label: 'X 서버', note: '화면 출력과 입력 담당' },
        ],
      }),
  },

  'feature-store-online-offline': {
    src: 'mla-c01/week3/day3',
    svg: () =>
      fanout({
        title: 'Feature Store 의 온라인 스토어와 오프라인 스토어',
        desc: '특성 계산 파이프라인이 Feature Store 에 적재하면 온라인 스토어와 오프라인 스토어로 자동 동기화되어 각각 실시간 추론과 학습 데이터셋 생성에 쓰인다.',
        source: { label: 'Feature Store', sub: '특성 계산 파이프라인이 ingest — 이후 자동 동기화' },
        targets: [
          {
            label: '온라인 스토어',
            lines: ['최신값 1건', 'GetRecord · 밀리초', '→ 실시간 추론 서버'],
            color: T.accent,
          },
          {
            label: '오프라인 스토어',
            lines: ['전체 이력 (S3 Parquet)', 'Athena 대량 조회', '→ 학습 데이터셋 생성'],
            color: T.warn,
          },
        ],
      }),
  },

  'data-pipeline-map': {
    src: 'dea-c01/week1/day3',
    svg: () =>
      columns({
        title: '데이터 흐름으로 본 AWS 서비스 지도',
        desc: '수집, 저장, 처리, 분석 네 단계마다 어떤 AWS 서비스가 쓰이는지 늘어놓고 아래를 거버넌스가 관통한다.',
        columns: [
          { label: '수집', items: ['Kinesis', 'MSK', 'DMS', 'DataSync'] },
          { label: '저장', items: ['S3', 'Redshift', 'DynamoDB'], color: T.violet },
          { label: '처리', items: ['Glue', 'EMR', 'Lambda', 'EMR Serverless'], color: T.warn },
          { label: '분석', items: ['Athena', 'Redshift', 'QuickSight', 'OpenSearch'], color: T.ok },
        ],
        footer: '거버넌스 — Lake Formation · Glue Catalog · IAM · KMS',
      }),
  },

  'circuit-breaker-states': {
    src: 'dop-c02/week12/day3',
    svg: () =>
      cycle({
        title: 'Circuit Breaker 의 세 가지 상태',
        desc: '정상 호출을 통과시키는 Closed 에서 실패율이 임계를 넘으면 Open 으로, 타임아웃이 지나면 Half-Open 으로, 시험 호출이 성공하면 다시 Closed 로 돌아온다.',
        steps: ['Closed — 정상 호출 통과', 'Open — 즉시 실패', 'Half-Open — 시험 호출 1개'],
        back: '시험 호출 성공 시 Closed 로 (실패하면 다시 Open)',
      }),
  },

  'gnu-linux-merge': {
    src: 'linux-master-2/week1/day2',
    svg: () =>
      merge({
        title: 'GNU 와 리눅스 커널이 만나 완성된 운영체제',
        desc: '도구는 있으나 커널이 없던 GNU 프로젝트와, 커널은 있으나 도구가 없던 리눅스가 결합해 GNU/Linux 가 되었다.',
        sources: [
          { label: 'GNU 프로젝트 (1983~)', lines: ['도구는 다 있는데', '커널이 없다'], color: T.warn },
          { label: '리눅스 커널 (1991~)', lines: ['커널은 있는데', '도구가 없다'], color: T.accent },
        ],
        result: { label: 'GNU/Linux', sub: '완성된 운영체제' },
      }),
  },

  'shell-kernel-position': {
    src: 'linux-master-2/week5/day1',
    svg: () =>
      flowDown({
        title: '사용자와 하드웨어 사이에서 셸이 놓인 자리',
        desc: '사용자의 명령을 셸이 해석해 시스템 호출로 커널에 전달하고, 커널이 하드웨어를 직접 다룬다.',
        steps: [
          { label: '사용자', sub: '명령을 입력한다', color: T.muted, edge: '명령 입력' },
          { label: '셸 (shell)', sub: '명령을 해석하고 프로그램을 실행시킨다', edge: '시스템 호출' },
          { label: '커널 (kernel)', sub: '하드웨어를 직접 다룬다', color: T.warn, edge: '' },
          { label: '하드웨어', sub: 'CPU · 메모리 · 디스크', color: T.ok },
        ],
      }),
  },

  'virtualization-compare': {
    src: 'linux-master-2/week11/day2',
    svg: () =>
      compareStacks({
        title: '가상화가 없을 때와 있을 때의 구조 비교',
        desc: '가상화가 없으면 하드웨어 위에 운영체제 하나만 올라가지만, 하이퍼바이저를 두면 여러 게스트 운영체제가 함께 동작한다.',
        left: {
          label: '가상화 없이',
          layers: [
            { label: '운영체제 하나', color: T.accent },
            { label: '하드웨어', color: T.muted },
          ],
        },
        right: {
          label: '가상화',
          layers: [
            { label: '게스트 OS — 리눅스 · 윈도 · 리눅스', color: T.violet },
            { label: '하이퍼바이저', color: T.warn },
            { label: '하드웨어', color: T.muted },
          ],
        },
      }),
  },

  'redshift-spectrum': {
    src: 'mla-c01/week2/day3',
    svg: () =>
      pair({
        title: 'Redshift 내부 테이블과 S3 외부 테이블의 조인',
        desc: '최근 데이터는 Redshift 클러스터의 내부 테이블에, 오래된 데이터는 S3 데이터 레이크의 외부 테이블에 두고 Spectrum 으로 조인한다.',
        left: { cap: 'Redshift 클러스터', label: '최근 3개월 (핫)', lines: ['내부 테이블'], color: T.accent },
        right: { cap: 'S3 데이터 레이크', label: '과거 5년 (콜드)', lines: ['외부 테이블'], color: T.warn },
        link: '조인 — Redshift Spectrum',
      }),
  },

  'cross-account-subscription': {
    src: 'soa-c02/week2/day2',
    svg: () =>
      merge({
        title: '계정을 넘어 로그를 모으는 Cross-Account Subscription',
        desc: '소스 계정의 로그 그룹이 Subscription Filter 로, 분석 계정의 Log Destination 이 함께 Kinesis 로 모여 Lambda 나 OpenSearch 로 흘러간다.',
        sources: [
          { label: 'Account A — 소스', lines: ['Log Group', 'Subscription Filter'], color: T.accent },
          { label: 'Account B — 분석 계정', lines: ['Log Destination'], color: T.violet },
        ],
        result: { label: 'Kinesis Data Streams', sub: '→ Lambda · OpenSearch 로 전달' },
      }),
  },

  'kms-double-gate': {
    src: 'mls-c01/week11/day3',
    svg: () =>
      merge({
        title: 'KMS 복호화의 이중 관문 — 키 정책과 IAM 정책',
        desc: '키 정책과 IAM 권한 정책이 둘 다 허용해야 복호화가 성공한다. 하나라도 허용하지 않으면 실패한다.',
        sources: [
          { label: 'KMS 키 정책', lines: ['"이 키를 누가?"'], color: T.warn },
          { label: 'IAM 권한 정책', lines: ['"이 주체가 뭘?"'], color: T.accent },
        ],
        result: { label: '둘 다 Allow 여야 복호화 성공', sub: '하나라도 미허용이면 실패 — IAM 만 열어도 소용없다' },
      }),
  },

  'efs-mount-targets': {
    src: 'saa-c03/week3/day2',
    svg: () =>
      merge({
        title: 'EFS 의 가용 영역별 마운트 타깃',
        desc: '각 가용 영역의 EC2 가 해당 영역의 마운트 타깃을 거쳐 하나의 EFS 분산 스토리지 클러스터에 접근한다.',
        sources: [
          { label: 'EC2 — AZ a', lines: ['Mount Target', 'ap-northeast-2a'] },
          { label: 'EC2 — AZ b', lines: ['Mount Target', 'ap-northeast-2b'] },
          { label: 'EC2 — AZ c', lines: ['Mount Target', 'ap-northeast-2c'] },
        ],
        result: { label: 'EFS 분산 스토리지 클러스터', sub: 'Multi-AZ 내구성' },
      }),
  },

  'org-trail-central': {
    src: 'soa-c02/week4/day1',
    svg: () =>
      fanout({
        title: 'Organization Trail 로 멀티 계정 감사 로그를 중앙에 모으기',
        desc: '관리 계정에서 만든 Organization Trail 이 모든 멤버 계정과 앞으로 추가될 계정의 로그까지 자동 수집해 중앙 아카이브 계정으로 보낸다.',
        source: { label: '관리 계정 — Organization Trail 생성', sub: '멤버 계정의 로그를 자동 수집' },
        targets: [
          { label: '멤버 계정 A', lines: ['CloudTrail 이벤트'] },
          { label: '멤버 계정 B', lines: ['CloudTrail 이벤트'] },
          { label: '멤버 계정 C', lines: ['CloudTrail 이벤트'] },
          { label: '미래에 추가될 계정', lines: ['자동 포함'], color: T.muted },
        ],
        sink: 'Log Archive 계정 중앙 S3 — Object Lock(WORM) · SSE-KMS · Log File Validation',
      }),
  },

  'fsx-lustre-training': {
    src: 'mls-c01/week1/day2',
    svg: () =>
      columns({
        title: 'S3 와 FSx for Lustre 를 거쳐 학습 노드로 이어지는 I/O 경로',
        desc: '원본은 S3 에 저렴하게 보관하고, 학습 중에는 FSx for Lustre 를 고속 작업 공간으로 두어 학습 노드가 마운트해 쓴다.',
        columns: [
          { label: '영구 보관', items: ['S3 버킷', '원본 · 저렴'] },
          { label: '고속 작업 공간', items: ['FSx for Lustre', '병렬 FS · 저지연'], color: T.warn },
          { label: '학습 노드', items: ['ml.p4d × N', '마운트해서 사용'], color: T.ok },
        ],
      }),
  },

  'x-window-layers': {
    src: 'linux-master-2/week8/day2',
    svg: () =>
      stack({
        title: 'X 윈도의 계층 구조',
        desc: '응용 프로그램 아래에 툴킷, 그 아래에 저수준 라이브러리가 있고 맨 아래에서 X 서버가 화면을 담당한다.',
        layers: [
          { label: '응용 프로그램', note: 'GIMP · Firefox · Konsole', color: T.muted },
          { label: '툴킷', note: 'GTK+(C) · Qt(C++) · FLTK · Motif · Tk', color: T.violet },
          { label: '저수준 라이브러리', note: 'Xlib · XCB — XCB 가 더 아래', color: T.accent },
          { label: 'X 서버', note: 'X 프로토콜로 통신 · 실제 화면 출력', color: T.warn },
        ],
      }),
  },

  'cnn-structure': {
    src: 'mls-c01/week7/day2',
    svg: () =>
      flowDown({
        title: '전형적인 CNN 구조',
        desc: '입력 이미지가 합성곱과 풀링을 반복하며 저수준에서 고수준 패턴으로 추상화되고, 마지막 Dense 와 Softmax 에서 클래스 확률이 나온다.',
        steps: [
          { label: '입력 224×224×3', sub: '원본 이미지', color: T.muted, edge: 'Conv + ReLU — 경계선·색 변화' },
          { label: '특성 맵 (저수준)', sub: 'Pool 로 공간 크기 축소', edge: 'Conv + ReLU — 질감·부분(눈·귀)' },
          { label: '특성 맵 (중간)', sub: 'Pool', edge: 'Conv + ReLU — 전체 객체 수준' },
          { label: '특성 맵 (고수준)', sub: 'Flatten 또는 Global Average Pooling', edge: '', color: T.warn },
          { label: 'Dense → Softmax', sub: '클래스 확률 — 전이학습은 보통 여기만 새로 학습', color: T.ok },
        ],
      }),
  },

  's3-data-lake-zones': {
    src: 'mla-c01/week2/day1',
    svg: () =>
      columns({
        title: 'S3 데이터 레이크의 세 구역',
        desc: '원본을 불변으로 보관하는 Raw, 검증을 마친 Cleaned, 학습용으로 가공한 Curated 순으로 데이터가 정제된다.',
        columns: [
          { label: 'Raw', items: ['소스에서 그대로', '불변 — 절대 덮어쓰지 않음'], color: T.muted },
          { label: 'Cleaned', items: ['정제 · 검증됨', '스키마 확정'] },
          { label: 'Curated', items: ['피처화 완료', '학습에 바로 투입'], color: T.ok },
        ],
        footer: '변환 로직 버그를 발견하면 Raw 에서 다시 처리한다 — 그래서 Raw 는 불변이어야 한다',
      }),
  },

  'shared-responsibility-spectrum': {
    src: 'clf-c02/week1/day3',
    svg: () =>
      stack({
        title: '서비스 종류에 따라 움직이는 공동 책임 경계선',
        desc: '완전 관리형으로 갈수록 고객의 책임은 줄고 AWS 의 책임은 늘어난다.',
        layers: [
          { label: 'EC2 — 가상 서버 (IaaS)', note: 'OS 패치·앱·설정 모두 고객', color: T.danger },
          { label: 'RDS — 관리형 데이터베이스', note: 'DB 엔진 패치는 AWS · 데이터와 권한은 고객', color: T.warn },
          { label: 'S3 · Lambda — 완전 관리형', note: '데이터 분류·권한만 고객 · 나머지 AWS', color: T.ok },
        ],
      }),
  },

  'model-quality-monitor': {
    src: 'mla-c01/week8/day1',
    svg: () =>
      merge({
        title: '모델 품질 모니터링에 ground truth 가 필요한 이유',
        desc: '예측 시점에 캡처한 데이터와 며칠에서 몇 주 뒤에 도착하는 실제 정답을 inference_id 로 맞춰야 성능 지표를 계산할 수 있다.',
        sources: [
          { label: '캡처 데이터', lines: ['예측값 — 예측 시점'], color: T.accent },
          { label: 'ground truth', lines: ['실제 정답 — 며칠~몇 주 뒤'], color: T.warn },
        ],
        result: {
          label: 'Merge Job — inference_id 로 매칭',
          sub: '성능 지표 계산(정확도·F1·AUC) → 베이스라인과 비교해 위반 여부 판단',
        },
      }),
  },

  'drs-initial-sync': {
    src: 'sap-c02/week6/day2',
    svg: () =>
      pair({
        title: '재해 복구 초기 동기화 단계',
        desc: '온프레미스 서버의 모든 디스크 블록을 TLS 로 암호화해 AWS 스테이징 영역의 복제 서버와 EBS 볼륨으로 전송한다.',
        left: { cap: '온프레미스', label: '원본 서버', lines: ['Disk Block Bitmap', '모든 블록 = Changed'], color: T.warn },
        right: { cap: 'AWS Staging Area', label: 'Replication Server', lines: ['t3.small', 'EBS Volume (동일 크기)'], color: T.accent },
        link: 'TLS 암호화 전송 (443 · 1500) — 대역폭 스로틀링 가능',
      }),
  },

  'mme-dynamic-load': {
    src: 'mla-c01/week6/day3',
    svg: () =>
      branch({
        title: '멀티모델 엔드포인트의 동적 로드',
        desc: '요청한 모델이 인스턴스 메모리 캐시에 있으면 즉시 추론하고, 없으면 S3 에서 내려받아 로드한 뒤 추론한다.',
        input: { label: 'invoke(TargetModel="store-042.tar.gz")', sub: '인스턴스 메모리(모델 캐시)를 먼저 확인' },
        condition: '캐시에 있는가?',
        yes: { edge: '있음 — warm', label: '즉시 추론', sub: '메모리의 모델을 그대로 사용' },
        no: { edge: '없음 — cold', label: 'S3 에서 다운로드 후 로드', sub: 's3://bkt/models/ — 첫 호출이 느리다' },
        tail: '메모리가 부족하면 오래 안 쓴 모델을 먼저 내린다',
      }),
  },

  'overfit-underfit': {
    src: 'mla-c01/week5/day4',
    svg: () =>
      multiChart({
        title: '과소적합·적합·과적합의 학습 곡선 비교',
        desc: '과소적합은 학습과 검증 손실이 둘 다 높은 채 평평하고, 적합은 둘 다 낮게 수렴하며, 과적합은 학습 손실만 계속 내려가는데 검증 손실이 다시 올라간다.',
        xLabel: '에폭',
        yLabel: '손실',
        panels: [
          {
            label: '과소적합',
            color: '#f0a35e',
            notes: ['둘 다 높은 채 평평', '모델이 너무 단순하다'],
            series: [
              { points: [[0, 0.86], [0.3, 0.8], [0.6, 0.78], [1, 0.77]] },
              { points: [[0, 0.9], [0.3, 0.84], [0.6, 0.82], [1, 0.81]], dashed: true },
            ],
          },
          {
            label: '적합',
            color: '#8ddb8c',
            notes: ['둘 다 낮게 수렴', '간격이 좁게 유지된다'],
            series: [
              { points: [[0, 0.9], [0.25, 0.55], [0.5, 0.33], [0.75, 0.22], [1, 0.18]] },
              { points: [[0, 0.93], [0.25, 0.6], [0.5, 0.39], [0.75, 0.29], [1, 0.25]], dashed: true },
            ],
          },
          {
            label: '과적합',
            color: '#f47067',
            notes: ['검증만 다시 상승', '이 지점에서 조기 종료'],
            series: [
              { points: [[0, 0.9], [0.25, 0.52], [0.5, 0.3], [0.75, 0.16], [1, 0.08]] },
              { points: [[0, 0.93], [0.25, 0.58], [0.45, 0.36], [0.6, 0.42], [0.8, 0.6], [1, 0.76]], dashed: true },
            ],
          },
        ],
        note: '학습 손실만 내려가고 검증 손실이 오르기 시작하는 지점이 조기 종료(early stopping) 시점이다',
      }),
  },

  'anomaly-detection-band': {
    src: 'soa-c02/week2/day1',
    svg: () =>
      lineChart({
        title: 'CloudWatch Anomaly Detection 의 동적 베이스라인',
        desc: '학습된 평균을 중심으로 상한과 하한 밴드가 만들어지고, 실제 메트릭이 이 밴드를 벗어나면 알람이 울린다.',
        xLabel: '시간 →',
        yLabel: '메트릭',
        band: {
          upper: [[0, 0.78], [0.2, 0.86], [0.4, 0.74], [0.6, 0.88], [0.8, 0.8], [1, 0.84]],
          lower: [[0, 0.34], [0.2, 0.42], [0.4, 0.3], [0.6, 0.44], [0.8, 0.36], [1, 0.4]],
        },
        series: [
          {
            label: '실제 메트릭',
            color: '#f0a35e',
            points: [[0, 0.55], [0.12, 0.66], [0.25, 0.6], [0.38, 0.5], [0.5, 0.62], [0.62, 0.72], [0.72, 0.97], [0.8, 0.62], [0.9, 0.56], [1, 0.6]],
          },
        ],
        note: '밴드 밖으로 나가는 순간 알람 — 고정 임계값과 달리 시간대별 패턴을 학습한다',
      }),
  },

  'shared-responsibility-4tier': {
    src: 'saa-c03/week1/day1 · saa-c03/week1/day5 · dva-c02/week1/day1 (3개 페이지 공용)',
    svg: () =>
      stack({
        title: '관리 수준에 따라 움직이는 공동 책임 경계선',
        desc: '완전 관리형으로 갈수록 고객이 책임질 범위가 좁아지고, IaaS 로 갈수록 OS와 애플리케이션까지 고객 몫이 된다.',
        layers: [
          { label: 'S3 · DynamoDB · Lambda — 완전 관리형', note: '데이터 분류와 IAM 권한만 고객', color: T.ok },
          { label: 'RDS · ECS Fargate — PaaS', note: '＋ 네트워크·보안그룹 설정 고객', color: T.accent },
          { label: 'ECS on EC2 · EKS Self-Managed', note: '＋ 컨테이너 런타임·노드 OS 패치 고객', color: T.warn },
          { label: 'EC2 + EBS — IaaS', note: 'OS·미들웨어·앱 전부 고객', color: T.danger },
        ],
      }),
  },

  's3-cross-account-backup': {
    src: 'scs-c03/week6/day5',
    svg: () =>
      pair({
        title: '규제 데이터를 다른 계정에 불변으로 보관하기',
        desc: '운영 계정의 버킷을 교차 계정으로 복제해 백업 계정에 두고, Object Lock 컴플라이언스 모드로 잠가 운영 계정조차 지울 수 없게 만든다.',
        left: { cap: '프로덕션 계정 A', label: '운영 버킷', lines: ['버전 관리 ON'], color: T.accent },
        right: { cap: '백업 계정 B — 자격증명 경계 분리', label: '백업 버킷', lines: ['버전 관리 + Object Lock', 'COMPLIANCE + MFA Delete'], color: T.ok },
        link: '교차 계정 복제 — 계정 A 에는 삭제 권한이 없다',
      }),
  },

  'backpropagation': {
    src: 'mls-c01/week7/day1',
    svg: () =>
      cycle({
        title: '순전파와 역전파',
        desc: '입력이 은닉층을 거쳐 출력과 손실까지 나아가는 것이 순전파이고, 손실에서 연쇄법칙으로 각 가중치의 기울기를 거슬러 전달하는 것이 역전파다.',
        steps: ['입력 x', '은닉층 1', '은닉층 2', '출력 ŷ', '손실 L(ŷ, y)'],
        back: '역전파 — 연쇄법칙으로 ∂L/∂w 를 거슬러 전달, 갱신은 w ← w − η·∂L/∂w',
      }),
  },

  'week3-decision-map': {
    src: 'saa-c03/week3/day5',
    svg: () =>
      boxedStack({
        title: '요구사항에서 아키텍처 선택으로 이어지는 판단 경로',
        desc: '요구사항의 각 축이 어떤 선택지로 이어지는지를 정리한 표로, 이 매핑을 거쳐 최적 아키텍처가 결정된다.',
        container: '요구사항 분석 → 최적 아키텍처 선택',
        layers: [
          { label: '워크로드 특성', note: '→ 인스턴스 패밀리' },
          { label: '비용 · 약정', note: '→ 구매 옵션' },
          { label: '데이터 영속성 · 공유', note: '→ 스토리지 종류' },
          { label: '트래픽 종류', note: '→ ELB 종류' },
          { label: '부하 변동 패턴', note: '→ 스케일링 정책' },
        ],
      }),
  },
};
