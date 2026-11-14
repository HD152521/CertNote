'use client';

import { useEffect } from 'react';
import { useLanguage } from '@/lib/i18n-client';

// 서버가 내보내는 <html lang> 은 라우트 그룹의 루트 레이아웃이 정한다 — (en) 그룹은 "en", (ko) 그룹은 "ko".
// 레이아웃은 pathname도 쿠키도 읽을 수 없다(읽으면 공개 콘텐츠 페이지까지 전부 동적 렌더링으로 떨어진다).
// 그래서 URL 로 정해지지 않고 lang 쿠키가 정하는 로그인 전용 화면((ko) 그룹 안)의 영어 사용자는 여기서
// hydration 뒤에 보정한다. /en/* 에서는 서버 값과 같아 아무것도 바뀌지 않는 안전망이다.
// 스크린리더의 발음 선택이 이 속성을 따르므로 비워둘 수 없다.
export function HtmlLangSync() {
  const lang = useLanguage();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return null;
}
