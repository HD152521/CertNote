'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/analytics';
import { signupHref } from '@/lib/auth/signupHref';
import { useLanguage } from '@/lib/i18n-client';

interface SignupCtaProps {
  placement: 'home_hero' | 'header';
  className?: string;
  children: ReactNode;
}

// 이미 화면에 있는 가입 버튼용 링크: 같은 모양을 유지하면서 클릭을 재고, 가입 뒤 보던 페이지로 돌아오게 한다.
export function SignupCta({ placement, className, children }: SignupCtaProps) {
  const lang = useLanguage();
  const pathname = usePathname();
  return (
    <Link
      href={signupHref(lang, pathname)}
      prefetch={false}
      onClick={() => track('signup_prompt_click', { placement, lang })}
      className={className}
    >
      {children}
    </Link>
  );
}
