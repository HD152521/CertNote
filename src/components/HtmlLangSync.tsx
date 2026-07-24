'use client';

import { useEffect } from 'react';
import { useLanguage } from '@/lib/i18n-client';

// 루트 레이아웃의 <html lang>은 정적 문자열 "ko"다. 레이아웃은 pathname도 쿠키도 읽을 수 없고
// (cookies()를 호출하면 공개 콘텐츠 페이지까지 전부 동적 렌더링으로 떨어진다) <html>은 루트에만 존재한다.
// 그래서 실제 언어는 여기서 보정한다. 스크린리더의 발음 선택이 이 속성을 따르므로 비워둘 수 없다.
//
// 한계: /en/* 페이지의 최초 HTML 소스는 여전히 lang="ko"로 나간다. 검색엔진이 보는 언어 신호는
// 각 페이지의 metadata(canonical·hreflang·og:locale)가 담당하므로 색인에는 영향이 없다.
export function HtmlLangSync() {
  const lang = useLanguage();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return null;
}
