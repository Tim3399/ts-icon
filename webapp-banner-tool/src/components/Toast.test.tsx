import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useToast, ToastProvider } from './Toast';

function ShowToastButton({ message, durationMs }: { message: string; durationMs?: number }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast(message, 'info', durationMs)}>
      trigger
    </button>
  );
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a shown toast message', () => {
    render(
      <ToastProvider>
        <ShowToastButton message="Saved successfully" />
      </ToastProvider>
    );

    act(() => {
      screen.getByRole('button', { name: 'trigger' }).click();
    });

    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
  });

  it('auto-dismisses the toast after the configured duration', () => {
    render(
      <ToastProvider>
        <ShowToastButton message="Temporary message" durationMs={1000} />
      </ToastProvider>
    );

    act(() => {
      screen.getByRole('button', { name: 'trigger' }).click();
    });
    expect(screen.getByText('Temporary message')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(screen.getByText('Temporary message')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Temporary message')).not.toBeInTheDocument();
  });

  it('does not auto-dismiss when durationMs is 0', () => {
    render(
      <ToastProvider>
        <ShowToastButton message="Sticky message" durationMs={0} />
      </ToastProvider>
    );

    act(() => {
      screen.getByRole('button', { name: 'trigger' }).click();
    });

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Sticky message')).toBeInTheDocument();
  });
});
