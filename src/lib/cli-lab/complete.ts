// Tab 자동 완성: 서비스 → 작업 → 옵션 순서로 마지막 단어를 채운다. 후보가 여럿이면 공통 접두사까지만.
import { SERVICES } from './run';

const GLOBAL_OPTIONS = ['--region', '--output', '--query', '--profile', '--no-cli-pager'];

function commonPrefix(words: string[]): string {
  if (!words.length) return '';
  let prefix = words[0];
  for (const w of words.slice(1)) {
    while (!w.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

export interface Completion {
  line: string;
  candidates: string[];
}

export function complete(line: string): Completion {
  const parts = line.split(' ');
  const current = parts[parts.length - 1];
  const words = parts.slice(0, -1).filter(Boolean);
  if (words[0] !== 'aws') {
    return words.length === 0 && 'aws'.startsWith(current) ? { line: 'aws ', candidates: [] } : { line, candidates: [] };
  }

  const positional = words.slice(1).filter((w) => !w.startsWith('--'));
  let pool: string[];
  if (current.startsWith('--')) {
    const op = SERVICES[positional[0]]?.operations[positional[1]];
    pool = [...(op?.params.map((p) => p.name) ?? []), ...GLOBAL_OPTIONS].filter((o) => !words.includes(o));
  } else if (positional.length === 0) {
    pool = Object.keys(SERVICES);
  } else if (positional.length === 1 && SERVICES[positional[0]]) {
    pool = Object.keys(SERVICES[positional[0]].operations);
  } else {
    return { line, candidates: [] };
  }

  const matches = pool.filter((p) => p.startsWith(current)).sort();
  if (!matches.length) return { line, candidates: [] };
  const head = parts.slice(0, -1).join(' ');
  const joined = (word: string) => (head ? `${head} ${word}` : word);
  if (matches.length === 1) return { line: `${joined(matches[0])} `, candidates: [] };
  return { line: joined(commonPrefix(matches)), candidates: matches };
}
