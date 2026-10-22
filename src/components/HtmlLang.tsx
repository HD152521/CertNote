'use client';

import { useEffect } from 'react';

// 하위 트리의 언어를 <html lang> 에 반영한다. 루트 레이아웃은 정적 캐시 계약(쿠키·헤더 금지) 때문에
// 요청마다 lang 을 바꿀 수 없어 항상 "ko" 로 나간다. 영어판(/en/**)은 이 컴포넌트로 덮어쓴다.
//
// - 인라인 스크립트: 하이드레이션 전, 스크립트를 실행하는 크롤러(구글 렌더링)도 바로 "en" 을 본다.
// - effect: 클라이언트 이동으로 영어판에 들어오고 나갈 때 값을 맞추고, 떠날 때 원래 값으로 되돌린다.
export function HtmlLang({ lang }: { lang: 'ko' | 'en' }) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.lang;
    root.lang = lang;
    return () => {
      root.lang = previous;
    };
  }, [lang]);

  return <script dangerouslySetInnerHTML={{ __html: `document.documentElement.lang=${JSON.stringify(lang)}` }} />;
}
