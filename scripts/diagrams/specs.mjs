// 다이어그램 스펙. 파일당 하나의 SVG 를 만든다.
// key = public/diagrams/<key>.svg, src = 원본 ASCII 가 있던 위치(추적용)

import { nest, flowDown, cycle, stack, fanout, boxedStack, T } from './render.mjs';

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
};
