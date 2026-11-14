import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getStarterDay } from '@/lib/study/starter';
import { LANG_COOKIE, resolveLanguage } from '@/lib/i18n';
import { pick } from '@/lib/strings/dict';
import { shellStrings } from '@/lib/strings/shell';
import { WelcomeContent } from './WelcomeContent';

// 이 라우트는 이미 getCurrentUser()가 cookies()를 읽어 동적이다 — 제목도 같은 쿠키로 맞춘다.
export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const lang = resolveLanguage('/welcome', store.get(LANG_COOKIE)?.value);
  return { title: pick(shellStrings, lang).welcomeMetaTitle };
}

// 가입 직후 첫 방문 온보딩. 핵심 사용 흐름 4단계 안내.
// CTA는 가입 시 고른 목표 자격증의 첫 학습 페이지로 직행 — 유저가 이미 알려준
// 목표를 되묻지 않고 첫 학습(first value)까지 한 클릭으로 줄인다.
// 본문 마크업은 WelcomeContent(클라이언트)로 분리 — 이 화면의 언어는 lang 쿠키가 정한다.
export default async function WelcomePage() {
  const session = await getCurrentUser();
  const starter = session ? await getStarterDay(session.sub) : null;
  return <WelcomeContent starter={starter} />;
}
