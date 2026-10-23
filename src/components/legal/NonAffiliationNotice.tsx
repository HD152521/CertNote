import { SITE_NAME } from '@/lib/site';

// 시험 주관 기관 비제휴 고지. 소개(/about)와 제작 방식(/about/how-we-make)이 같은 문구를 쓴다.
export function NonAffiliationNotice() {
  return (
    <p>
      {SITE_NAME}는 Amazon Web Services, 한국정보통신진흥협회(KAIT) 등 시험 주관 기관과 제휴하거나 그 승인을 받은
      서비스가 아닌 독립적인 학습 자료입니다. 시험 문항을 복원하거나 유출한 자료는 싣지 않으며, 수록한 문제는 모두
      자체 제작한 것입니다.
    </p>
  );
}
