'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { setLanguage } from '@/lib/i18n-client';

// 영어 페이지에서 언어를 쿠키가 정하는 화면(/pricing 등)으로 갈 때 쓴다. 눌렀다는 건 영어로 보겠다는 뜻이라
// 이동 직전에 lang 쿠키를 en 으로 맞춘다. 서버 HTML(색인되는 한국어 /pricing)은 바꾸지 않는다.
export function EnglishIntentLink(props: ComponentProps<typeof Link>) {
  const { onClick, ...rest } = props;
  return (
    <Link
      {...rest}
      onClick={(e) => {
        setLanguage('en');
        onClick?.(e);
      }}
    />
  );
}
