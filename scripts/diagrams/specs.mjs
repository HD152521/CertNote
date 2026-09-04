// 다이어그램 스펙. 파일당 하나의 SVG 를 만든다.
// key = public/diagrams/<key>.svg, src = 원본 ASCII 가 있던 위치(추적용)

import { nest, flowDown, cycle, stack, T } from './render.mjs';

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
};
