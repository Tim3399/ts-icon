import React, { useEffect, useRef, useState } from 'react';

interface ChannelAutocompleteProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  channels: string[];
  placeholder?: string;
}

const MAX_SUGGESTIONS = 8;

// Replaces an earlier attempt at this (a native <datalist>, then a
// permanently-visible clickable chip for every channel) -- datalist's
// "show everything on an empty click" behavior is inconsistent across
// browsers, and a chip per channel became unusable once there were more
// than a handful. This is a small, self-contained combobox: filters as you
// type, capped to a handful of results, mouse and keyboard both work.
const ChannelAutocomplete: React.FC<ChannelAutocompleteProps> = ({
  id,
  value,
  onChange,
  channels,
  placeholder,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? channels.filter((name) => name.toLowerCase().includes(value.trim().toLowerCase()))
    : channels;
  const suggestions = filtered.slice(0, MAX_SUGGESTIONS);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const select = (name: string) => {
    onChange(name);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0) {
        e.preventDefault();
        select(suggestions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="autocomplete" ref={containerRef}>
      <input
        className="input"
        type="text"
        id={id}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setHighlightedIndex(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        required
      />
      {isOpen && suggestions.length > 0 && (
        <ul className="autocomplete-list" role="listbox">
          {suggestions.map((name, index) => (
            <li
              key={name}
              role="option"
              aria-selected={index === highlightedIndex}
              className={`autocomplete-item${index === highlightedIndex ? ' autocomplete-item-highlighted' : ''}`}
              // onMouseDown (not onClick) fires before the input's onBlur,
              // so selecting a suggestion isn't lost to the blur closing
              // the dropdown first.
              onMouseDown={(e) => {
                e.preventDefault();
                select(name);
              }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ChannelAutocomplete;
