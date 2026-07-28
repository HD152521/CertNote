import { promises as fs } from 'node:fs';
import path from 'node:path';

// docs/SEO-indexing-fix-plan.md Step6 — content/ 디렉터리에 대응 파일이 없는 순수 정적 페이지
// (홈·pricing·privacy 등)의 sitemap lastModified 근거. 소스 파일 자체의 수정시각을 쓴다 —
// 실제 문구/구성이 바뀔 때만 값이 바뀌므로 매 빌드마다 갱신되는 new Date()보다 안정적이고,
// "같은 커밋을 두 번 빌드하면 lastmod가 같아야 한다"는 수용 기준을 만족한다(파일이 그대로면
// mtime도 그대로).
export async function getSourceFileMtime(relativePath: string): Promise<Date | undefined> {
  try {
    return (await fs.stat(path.join(process.cwd(), relativePath))).mtime;
  } catch {
    return undefined;
  }
}
