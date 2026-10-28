import { describe, expect, it } from 'vitest';
import { checkPassword, parseUsPhone, passwordError, toE164Us } from './accountRules';

describe('password rules (Cognito default policy)', () => {
  it.each(['Dwell-demo-2026', 'Abcdef1!', 'Correct Horse 9', 'Pa55^word', 'x`Y1yyyy'])('accepts %s', (pw) => {
    expect(checkPassword(pw)).toEqual({ ok: true, missing: [] });
    expect(passwordError(pw)).toBeNull();
  });

  it('names everything that is missing', () => {
    expect(checkPassword('dwell-demo-2026').missing).toEqual(['an upper-case letter']);
    expect(passwordError('abcdefgh')).toBe('Add an upper-case letter, a number and a symbol.');
    expect(passwordError('Ab1!')).toBe('Add at least 8 characters.');
    expect(passwordError('')).toBe('Add at least 8 characters, an upper-case letter, a lower-case letter, a number and a symbol.');
  });

  it('does not count accented letters as basic Latin, or an outer space as a symbol', () => {
    expect(checkPassword('ÉÈÀ12345éè!').missing).toEqual(['an upper-case letter', 'a lower-case letter']);
    expect(checkPassword(' Abcdefg1').missing).toEqual(['a symbol']);
    expect(passwordError(' Abcdef1! ')).toBe('Remove the space at the start or end.');
  });
});

describe('US phone numbers', () => {
  it.each([
    ['6175550100', '6175550100'],
    ['(617) 555-0100', '6175550100'],
    ['+1 617 555 0100', '6175550100'],
    ['1-617-555-0100', '6175550100'],
    ['555-0100', null],
    ['+44 20 7946 0958', null],
  ])('%s -> %s', (input, expected) => {
    expect(parseUsPhone(input)).toBe(expected);
  });

  it('formats E.164 for Cognito', () => {
    expect(toE164Us('6175550100')).toBe('+16175550100');
  });
});
