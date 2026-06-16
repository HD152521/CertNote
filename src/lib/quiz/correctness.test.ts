import { describe, expect, it } from 'vitest';
import {
  answerCount,
  isMultiAnswer,
  isSelectionCorrect,
  normalizeSelection,
  parseCorrectSet,
} from './correctness';

describe('parseCorrectSet', () => {
  it('parses a single answer', () => {
    expect([...parseCorrectSet('B')]).toEqual(['B']);
  });
  it('parses multi answers with separators and spaces', () => {
    expect(parseCorrectSet('B, D').size).toBe(2);
    expect(parseCorrectSet('a/c').has('A')).toBe(true);
  });
});

describe('isMultiAnswer / answerCount', () => {
  it('detects single', () => {
    expect(isMultiAnswer('C')).toBe(false);
    expect(answerCount('C')).toBe(1);
  });
  it('detects multi', () => {
    expect(isMultiAnswer('B, D')).toBe(true);
    expect(answerCount('B,D')).toBe(2);
  });
});

describe('normalizeSelection', () => {
  it('sorts and dedups', () => {
    expect(normalizeSelection('d, b, b')).toBe('B,D');
  });
  it('uppercases single', () => {
    expect(normalizeSelection('a')).toBe('A');
  });
  it('returns null for empty or invalid', () => {
    expect(normalizeSelection('')).toBeNull();
    expect(normalizeSelection('Z')).toBeNull();
  });
});

describe('isSelectionCorrect (exact-set)', () => {
  it('single answer exact match', () => {
    expect(isSelectionCorrect('B', 'B')).toBe(true);
    expect(isSelectionCorrect('B', 'C')).toBe(false);
  });
  it('multi answer requires all and only', () => {
    expect(isSelectionCorrect('B, D', 'B,D')).toBe(true);
    expect(isSelectionCorrect('B, D', 'D,B')).toBe(true); // 순서 무관
    expect(isSelectionCorrect('B, D', 'B')).toBe(false); // 부분 선택 오답
    expect(isSelectionCorrect('B, D', 'B,C,D')).toBe(false); // 초과 선택 오답
  });
});
