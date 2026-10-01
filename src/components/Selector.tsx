import { useEffect, useId, useMemo, useState } from 'react';
import type { Species } from '../types';
import { searchSpecies } from '../lib/search';
import { Icon } from './Icon';
export function Selector({
  species,
  selected,
  onSelect,
  recent,
}: {
  species: Species[];
  selected: Species;
  onSelect: (p: Species) => void;
  recent: string[];
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchSpecies(species, query), [species, query]);
  const choose = (p: Species) => {
    onSelect(p);
    setQuery('');
    setOpen(false);
    setActive(0);
  };
  const forms = useMemo(
    () => species.filter((p) => p.dex === selected.dex),
    [species, selected.dex],
  );
  useEffect(() => {
    if (open)
      document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, id]);
  return (
    <div className="selector">
      <label className="field-label" htmlFor={`${id}-search`}>
        Pokémon name
      </label>
      <div className="search-wrap">
        <Icon name="search" />
        <input
          id={`${id}-search`}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Search any Pokémon…"
          value={query}
          role="combobox"
          aria-expanded={open && query.trim().length > 0}
          aria-controls={`${id}-options`}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${id}-option-${active}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive(Math.min(active + 1, results.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive(Math.max(active - 1, 0));
            }
            if (e.key === 'Enter' && open && results[active]) {
              e.preventDefault();
              choose(results[active]);
            }
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        {query && (
          <button
            className="icon-button"
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              setOpen(false);
            }}
          >
            <Icon name="close" size={17} />
          </button>
        )}
      </div>
      {open && query.trim() && (
        <div className="search-popover">
          <ul role="listbox" id={`${id}-options`} aria-label="Matching Pokémon">
            {results.map((p, i) => (
              <li
                key={p.id}
                role="option"
                id={`${id}-option-${i}`}
                aria-selected={active === i}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
                className={active === i ? 'active' : ''}
              >
                <span>{p.name}</span>
                <small>#{String(p.dex).padStart(3, '0')}</small>
              </li>
            ))}
          </ul>
          {!results.length && (
            <p className="empty-search">
              No matches. Try a species name, Pokédex number, or a form such as “Alolan”.
            </p>
          )}
          {results.length === 40 && (
            <p className="empty-search">
              Showing 40 matches. Add a species name to narrow the list.
            </p>
          )}
        </div>
      )}
      <div className="selected-mon">
        <div className={`mon-emblem ${selected.shadow ? 'shadow' : ''}`} aria-hidden="true">
          <Icon
            name={selected.shadow ? 'bolt' : selected.temporary ? 'spark' : 'circle'}
            size={28}
          />
        </div>
        <div>
          <span className="eyebrow">NO. {String(selected.dex).padStart(3, '0')}</span>
          <h2>{selected.name}</h2>
          <div className="type-row">
            {selected.types.map((t) => (
              <span key={t} className={`type type-${t}`}>
                {t}
              </span>
            ))}
            {selected.shadow && <span className="form-label">Shadow</span>}
            {selected.temporary && <span className="form-label">Temporary</span>}
          </div>
        </div>
      </div>
      {forms.length > 1 && (
        <div className="form-select">
          <label htmlFor={`${id}-form`}>Form</label>
          <select
            id={`${id}-form`}
            value={selected.id}
            onChange={(e) => choose(species.find((p) => p.id === e.target.value)!)}
          >
            {forms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {selected.gender?.fixed && (
        <p className="small-note">
          Gender: {selected.gender.fixed}. Set by this species or battle form.
        </p>
      )}
      {selected.gender?.allowed?.length === 0 && (
        <p className="small-note">
          Gender is unverified for this exact catalog form. Confirm it in the game.
        </p>
      )}
      {selected.gender?.sharedAppearance && (
        <p className="small-note">
          Male and female appearances share this battle record: the sourced stats and moves match.
          Set your copy’s gender in Level & comparison settings for evolution requirements.
        </p>
      )}
      {forms.some((p) => p.gender?.fixed === 'male') &&
        forms.some((p) => p.gender?.fixed === 'female') && (
          <p className="small-note">
            Gender-specific battle forms retain their own stats, moves and rankings in every league.
          </p>
        )}
      {recent.length > 1 && (
        <div className="recent">
          <span>Recent</span>
          {recent
            .filter((r) => r !== selected.id)
            .slice(0, 3)
            .map((r) => {
              const p = species.find((s) => s.id === r);
              return (
                p && (
                  <button key={r} type="button" onClick={() => choose(p)}>
                    {p.name}
                  </button>
                )
              );
            })}
        </div>
      )}
    </div>
  );
}
