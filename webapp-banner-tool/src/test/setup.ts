// Runs once before each test file (wired via vite.config.ts's `test.setupFiles`).
//
// - `@testing-library/jest-dom/vitest` adds DOM-aware matchers (e.g.
//   `toBeInTheDocument`) to Vitest's `expect` and provides the matching
//   ambient type augmentation, so no manual `expect.extend(...)` call or
//   separate `.d.ts` file is needed.
// - React Testing Library does not clean up rendered components between
//   tests automatically; without this, DOM nodes from one test can leak
//   into the next and cause `getByText`/`getByRole` queries to match
//   duplicates.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
