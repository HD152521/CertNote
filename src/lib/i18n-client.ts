'use client';

import { usePathname } from 'next/navigation';
import { detectLanguage, type Language, t, COMMON_STRINGS } from './i18n';

export type { Language };
export { t, COMMON_STRINGS };

/**
 * Use in client components to get current language
 * Client-only hook
 */
export function useLanguage(): Language {
  return detectLanguage(usePathname());
}
