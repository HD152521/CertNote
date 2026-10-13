// 사이트가 말하는 "하루 학습 시간"의 단일 출처. 홈 랜딩·메타데이터(page.tsx, layout.tsx)·온보딩 문구가 모두 이 값을 쓴다.
// 근거는 studyTime.test.ts 가 실제 day 노트(content/aws-certs 의 day*.md)의 읽기 시간 분포로 고정한다 —
// 노트 수정으로 분포가 이 값을 넘으면 테스트가 실패해 문구를 다시 정하게 만든다.
export const DAILY_STUDY_MINUTES = 30;
