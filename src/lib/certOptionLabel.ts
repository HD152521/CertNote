import type { CertOption } from '@/components/AuthForm';

/** 클라이언트 안전(파일 시스템 비의존) — 영어 화면이면 영어 이름이 있을 때 그것을 쓴다. */
export function certOptionLabel(c: CertOption, lang: 'ko' | 'en'): string {
  return lang === 'en' && c.nameEn ? `${c.codeEn ?? c.code} · ${c.nameEn}` : `${c.code} · ${c.name}`;
}
