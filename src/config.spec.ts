import { isAuthDisabled } from '../config';

describe('isAuthDisabled', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns false when AUTH_DISABLED is unset', () => {
    delete process.env.AUTH_DISABLED;
    expect(isAuthDisabled()).toBe(false);
  });

  it('returns false for any value other than the literal string "true"', () => {
    process.env.AUTH_DISABLED = '1';
    expect(isAuthDisabled()).toBe(false);
  });

  it('returns true when AUTH_DISABLED=true and NODE_ENV is not production', () => {
    process.env.AUTH_DISABLED = 'true';
    process.env.NODE_ENV = 'development';
    expect(isAuthDisabled()).toBe(true);
  });

  it('throws when AUTH_DISABLED=true and NODE_ENV=production', () => {
    process.env.AUTH_DISABLED = 'true';
    process.env.NODE_ENV = 'production';
    expect(() => isAuthDisabled()).toThrow(/NODE_ENV=production/);
  });

  it('does not throw when NODE_ENV=production if AUTH_DISABLED is not set', () => {
    delete process.env.AUTH_DISABLED;
    process.env.NODE_ENV = 'production';
    expect(isAuthDisabled()).toBe(false);
  });
});
