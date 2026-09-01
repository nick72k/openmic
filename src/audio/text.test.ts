import { describe, expect, it } from 'vitest';
import { sanitizeForTts, speechBudgetMs, splitSentences } from './text';

describe('sanitizeForTts', () => {
  it('straightens smart punctuation', () => {
    expect(sanitizeForTts('“Hi” — it’s ‘fine’…')).toBe(
      '"Hi", it\'s \'fine\'...',
    );
  });

  it('drops emoji and control characters', () => {
    expect(sanitizeForTts('Great \u{1F602} set!')).toBe('Great set!');
  });

  it('collapses whitespace', () => {
    expect(sanitizeForTts('a   b\n\nc')).toBe('a b c');
  });
});

describe('splitSentences', () => {
  it('splits on terminal punctuation and keeps it', () => {
    expect(splitSentences('One. Two! Three? Four')).toEqual(['One.', 'Two!', 'Three?', 'Four']);
  });

  it('keeps a closing quote with its sentence', () => {
    expect(splitSentences('"Stop." It did.')).toEqual(['"Stop."', 'It did.']);
  });

  it('ignores empty input', () => {
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('speechBudgetMs', () => {
  it('grows with length and never drops below the floor', () => {
    expect(speechBudgetMs('')).toBeGreaterThan(0);
    expect(speechBudgetMs('x'.repeat(200))).toBeGreaterThan(speechBudgetMs('x'));
  });
});
