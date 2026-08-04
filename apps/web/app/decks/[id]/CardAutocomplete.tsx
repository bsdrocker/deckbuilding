'use client';

import { useEffect, useRef, useState } from 'react';
import { searchCardNamesAction, type CardSuggestion } from '../../actions';

/**
 * A card-name text input with a debounced typeahead dropdown. Renders a real
 * form field (`name`) so the surrounding form submits the current value. Enter
 * on a highlighted suggestion selects it (and does not submit the form);
 * otherwise the form submits normally.
 */
export function CardAutocomplete({
  name,
  placeholder,
  style,
  clearToken = 0,
}: {
  name: string;
  placeholder?: string;
  style?: React.CSSProperties;
  /** Increment to clear the field and refocus (e.g. after a successful add). */
  clearToken?: number;
}) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<CardSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Ignore the fetch triggered by programmatically setting the value on select.
  const skipNextFetch = useRef(false);
  // Guard against out-of-order responses from overlapping requests.
  const requestSeq = useRef(0);

  // Clear and refocus when the parent bumps clearToken (post-add), for fast entry.
  useEffect(() => {
    if (clearToken === 0) return;
    skipNextFetch.current = true;
    setValue('');
    setSuggestions([]);
    setOpen(false);
    setHighlight(-1);
    inputRef.current?.focus();
  }, [clearToken]);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      const results = await searchCardNamesAction(q);
      if (seq !== requestSeq.current) return; // a newer request superseded this
      setSuggestions(results);
      setHighlight(-1);
      setOpen(results.length > 0);
    }, 180);
    return () => clearTimeout(timer);
  }, [value]);

  // Close the dropdown when clicking outside the widget.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const select = (s: CardSuggestion) => {
    skipNextFetch.current = true;
    setValue(s.name);
    setOpen(false);
    setHighlight(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      if (highlight >= 0 && highlight < suggestions.length) {
        e.preventDefault(); // select instead of submitting the form
        select(suggestions[highlight]!);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="autocomplete" ref={boxRef} style={style}>
      <input
        ref={inputRef}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        required
        style={{ width: '100%' }}
      />
      {open && suggestions.length > 0 && (
        <ul className="autocomplete-menu" role="listbox">
          {suggestions.map((s, i) => (
            <li key={s.oracleId} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={`autocomplete-item ${i === highlight ? 'active' : ''}`}
                // onMouseDown (not onClick) so it fires before the input blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(s);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="ac-name">{s.name}</span>
                <span className="ac-meta muted">
                  {s.manaCost ? <span className="ac-mana">{s.manaCost}</span> : null}
                  <span className="ac-type">{s.typeLine}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
