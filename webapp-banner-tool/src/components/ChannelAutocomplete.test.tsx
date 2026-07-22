import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChannelAutocomplete from './ChannelAutocomplete';

const CHANNELS = ['lobby', 'afk-spacer-1', 'gaming', 'gaming-2', 'music', 'events', 'staff', 'support', 'lounge'];

function renderAutocomplete(overrides: Partial<React.ComponentProps<typeof ChannelAutocomplete>> = {}) {
  const onChange = overrides.onChange ?? vi.fn();
  render(
    <ChannelAutocomplete
      id="channel"
      value=""
      onChange={onChange}
      channels={CHANNELS}
      {...overrides}
    />
  );
  return { onChange };
}

describe('ChannelAutocomplete', () => {
  it('shows suggestions on focus, capped to 8 entries, when the field is empty', () => {
    renderAutocomplete();
    fireEvent.focus(screen.getByRole('textbox'));

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(8);
  });

  it('filters suggestions by substring, case-insensitively', () => {
    renderAutocomplete({ value: 'GAM' });
    fireEvent.focus(screen.getByRole('textbox'));

    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['gaming', 'gaming-2']);
  });

  it('shows no dropdown when nothing matches', () => {
    renderAutocomplete({ value: 'zzz-nope' });
    fireEvent.focus(screen.getByRole('textbox'));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('selects a suggestion via mousedown and closes the dropdown', () => {
    const { onChange } = renderAutocomplete({ value: 'lob' });
    fireEvent.focus(screen.getByRole('textbox'));

    fireEvent.mouseDown(screen.getByText('lobby'));

    expect(onChange).toHaveBeenCalledWith('lobby');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('navigates with ArrowDown/ArrowUp and selects the highlighted item with Enter', () => {
    const { onChange } = renderAutocomplete({ value: 'gam' });
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('gaming');
  });

  it('does nothing on Enter when no item is highlighted', () => {
    const { onChange } = renderAutocomplete({ value: 'gam' });
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes the dropdown on Escape', () => {
    renderAutocomplete({ value: 'gam' });
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes the dropdown when clicking outside the component', () => {
    renderAutocomplete({ value: 'gam' });
    fireEvent.focus(screen.getByRole('textbox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
