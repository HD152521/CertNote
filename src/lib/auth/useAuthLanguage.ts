'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { setLanguage, useLanguage, type Language } from '@/lib/i18n-client';
import { authLangHint } from './authLang';

/**
 * 인증 화면(로그인·가입·온보딩)의 표시 언어. URL 이 영어를 가리키면(`?lang=en` 또는 영어 페이지로 돌아가는
 * `?next=`) 영어, 아니면 평소처럼 lang 쿠키. 영어로 들어온 경우 쿠키도 en 으로 맞춰
 * 가입 직후 화면(/welcome·/dashboard)이 한국어로 되돌아가지 않게 한다.
 * useSearchParams 를 쓰므로 호출하는 화면은 Suspense 안에 있어야 한다.
 */
export function useAuthLanguage(): Language {
  const cookieLang = useLanguage();
  const params = useSearchParams();
  const hinted = authLangHint(params.get('lang'), params.get('next'));
  useEffect(() => {
    if (hinted === 'en') setLanguage('en');
  }, [hinted]);
  return hinted ?? cookieLang;
}
