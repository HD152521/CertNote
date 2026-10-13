import { describe, expect, test } from 'vitest';
import { decodeIds, encodeTerms, extractSearchTerms, stripKoreanParticle, tokenizeTerms } from './terms';

describe('stripKoreanParticle', () => {
  test.each([
    ['채팅방을', '채팅방'], ['데이터베이스에서', '데이터베이스'], ['서버로', '서버'], ['람다는', '람다'],
    ['시그모이드', '시그모이드'], // 어간 끝 글자가 조사와 겹쳐도 2자 미만이 남지 않으면 그대로
    ['가이', '가이'], ['이다', '이다'], ['mysqld', 'mysqld'], ['kustomize를', 'kustomize'], ['EC2는'.toLowerCase(), 'ec2'], ['s3에서', 's3'], ['서버는abc', '서버는abc'],
  ])('%s -> %s', (input, expected) => {
    expect(stripKoreanParticle(input)).toBe(expected);
  });
});

describe('extractSearchTerms', () => {
  test('소문자·중복 제거·정렬, frontmatter 제외, 코드 블록 용어 포함', () => {
    const raw = '---\ntitle: skipme\n---\n# Lambda Concurrency\nLambda 는 `mysqld` 를 쓴다.\n```\nkustomize build\n```\n람다를 쓴다 람다는';
    const terms = extractSearchTerms(raw);
    expect(terms).toEqual([...terms].sort());
    expect(new Set(terms).size).toBe(terms.length);
    expect(terms).toEqual(expect.arrayContaining(['lambda', 'concurrency', 'mysqld', 'kustomize', 'build', '람다']));
    expect(terms).not.toContain('skipme');
  });

  test('숫자뿐인 토큰, 1글자 토큰, 지나치게 긴 토큰은 버린다', () => {
    const terms = extractSearchTerms('443 8080 a b ' + 'x'.repeat(40) + ' ok-1');
    expect(terms).toEqual(['ok-1']);
  });

  test('빈 입력', () => {
    expect(extractSearchTerms('')).toEqual([]);
  });
});

describe('encodeTerms / decodeIds', () => {
  test('왕복: 사전 인덱스를 되돌리면 원래 단어들이 나온다', () => {
    const perDay = [['apple', 'banana', 'zebra'], [], ['banana', 'cherry']];
    const { dict, ids } = encodeTerms(perDay);
    const words = dict.split(' ');
    expect(ids.map((s) => [...decodeIds(s)].map((i) => words[i]))).toEqual(perDay);
  });
});

// 색인(extractSearchTerms)과 검색어(tokenizeTerms)는 같은 토크나이저를 쓴다. 어긋나면 색인에는 있는데 검색이 안 된다.
describe('tokenizeTerms - 경로·플래그·혼합 입력', () => {
  test.each([
    ['/etc/aliases', ['etc', 'aliases']],
    ['--init', ['init']],
    ['/etc/ld.so.cache', ['etc', 'ld.so.cache']],
    ['k8s', ['k8s']],
    ['ap-northeast-2', ['ap-northeast-2']],
    ['C++', []], // 'c' 한 글자는 색인하지 않는다
    ['S3://bucket', ['s3', 'bucket']],
    ['EC2는', ['ec2']],
    ['EC2에서 람다를', ['ec2', '람다']],
    ['kubectl get pods -n kube-system', ['kubectl', 'get', 'pods', 'kube-system']],
    ['443 8080', []],
    ['Lambda lambda LAMBDA', ['lambda']],
  ])('%s -> %j', (input, expected) => {
    expect(tokenizeTerms(input)).toEqual(expected);
  });

  test.each(['/etc/aliases', '--init', '/etc/ld.so.cache', 'k8s', 'ap-northeast-2', 'C++', 'S3://bucket', 'EC2는', 'EC2에서 람다를', 'kubectl get pods -n kube-system'])(
    '색인 쪽과 검색어 쪽이 같은 단어 집합을 낸다: %s',
    (input) => {
      expect(extractSearchTerms(input)).toEqual([...tokenizeTerms(input)].sort());
    },
  );
});
