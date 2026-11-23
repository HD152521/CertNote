# 커뮤니티 글 초안 (2026-11-23)

비로그인 5문제 맛보기(`/try?cert={slug}`)를 알리는 글 초안. **게시는 사용자가 직접 한다.** 기존 `outreach-drafts.md`와 별개로, 맛보기 링크를 쓰는 버전이다.

## 원칙
- 본인 사이트임을 밝힌다. 겪지 않은 합격 후기·사용 경험을 지어내지 않는다.
- 에브리타임·네이버 카페는 홍보 금지 게시판이 많다. 게시 전에 각 게시판 규칙을 확인한다.
- 링크마다 `utm_source`를 다르게 달아 PostHog에서 채널별로 본다.
- 맛보기를 지원하는 slug(문제은행 기준): `linux-master-1`(50문항), `saa-c03`(65), `sqld`(100) 등. 은퇴한 시험(`soa-c02`, `mls-c01`)은 홍보 링크로 쓰지 않는다.
- 배포 후 `/try?cert=…`가 모바일에서 정상 동작하는지 먼저 직접 풀어본다(클릭 흐름·레이아웃은 미검증).

## 에브리타임
### 리눅스마스터 1급
제목: 리눅스마스터 1급 준비하는 분들께, 가입 없이 풀어볼 수 있는 5문제 만들었어요

> 리눅스마스터 1급 준비하면서 제가 쓸 용도로 학습 사이트를 만들었어요. 무료고 광고는 아직 없어요.
>
> 로그인 없이 5문제만 먼저 풀어볼 수 있게 열어뒀어요. 풀면 바로 정답과 해설이 나와요.
> https://cert.juganlab.com/try?cert=linux-master-1&utm_source=everytime&utm_medium=community
>
> 맞는 방향인지 먼저 보시라고 만든 거라, 별로면 별로라고 말씀해 주세요. 틀린 문제나 어색한 해설 제보도 환영해요.

### AWS SAA-C03
제목: AWS SAA-C03 준비 중이신 분, 가입 없이 5문제 풀어보실래요

> SAA-C03 공부하려고 제가 직접 만든 무료 사이트예요. 문제마다 해설이 붙어 있고, 로그인 없이 5문제를 먼저 풀어볼 수 있어요.
> https://cert.juganlab.com/try?cert=saa-c03&utm_source=everytime&utm_medium=community
>
> 풀어보시고 해설이 이해가 안 되거나 틀린 것 같은 문제가 있으면 알려주세요. 바로 고칠게요.

### SQLD
제목: SQLD 준비하시는 분, 가입 없이 5문제 풀어볼 수 있는 곳 만들었어요

> SQLD 공부하려고 제가 직접 만든 무료 사이트예요. 문제마다 해설이 붙어 있고, 로그인 없이 5문제를 먼저 풀어볼 수 있어요.
> https://cert.juganlab.com/try?cert=sqld&utm_source=everytime&utm_medium=community
>
> 풀어보시고 해설이 이해가 안 되거나 틀린 것 같은 문제가 있으면 댓글로 알려주세요. 바로 고칠게요.

## 네이버 카페 (정보공유 게시판)
제목: [무료] 리눅스마스터 1급·AWS SAA·SQLD 가입 없이 5문제 먼저 풀어보기

> 안녕하세요, 자격증 공부용 사이트를 혼자 만들고 있는 개발자예요. 카페 규정에 맞지 않으면 바로 내리겠습니다.
>
> - 로그인 없이 5문제를 풀고 정답과 해설을 바로 볼 수 있어요.
> - 전체 모의고사, 오답노트, 진도 관리는 무료 가입 후에 써요.
> - 리눅스마스터 1급: https://cert.juganlab.com/try?cert=linux-master-1&utm_source=naver_cafe&utm_medium=community
> - AWS SAA-C03: https://cert.juganlab.com/try?cert=saa-c03&utm_source=naver_cafe&utm_medium=community
> - SQLD: https://cert.juganlab.com/try?cert=sqld&utm_source=naver_cafe_sqld&utm_medium=community
>
> 부족한 점은 댓글로 알려주시면 반영할게요.

## 티스토리 (검색 유입용)
홍보글이 아니라 문제 풀이 콘텐츠로 쓴다.
1. 문제 1~2개를 본문에 그대로 싣고 보기마다 맞고 틀린 이유를 설명한다.
2. 자주 틀리는 포인트를 두세 줄로 정리한다.
3. 마지막에 "이런 문제를 가입 없이 5개 풀어볼 수 있어요" 한 줄과 링크(`utm_source=tistory`)를 넣는다.

제목 후보: 리눅스마스터 1급 기출 스타일 문제 풀이, 파일시스템과 권한 편 / SQLD 기출 스타일 문제 풀이, 조인과 서브쿼리 편

## 게시 후 확인
PostHog에서 `guest_exam_start` → `guest_exam_done` → `signup_prompt_click`(placement `try_result`) → 가입을 `utm_source`별로 본다.
