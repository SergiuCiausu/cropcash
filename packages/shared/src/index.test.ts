import { describe, expect, it } from 'vitest';
import { APP_NAME } from './index';

describe('shared package', () => {
  it('is wired into the test runner', () => {
    expect(APP_NAME).toBe('CropCash');
  });
});
