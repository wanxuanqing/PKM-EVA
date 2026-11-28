import { useMemo, useRef, useState } from 'react';
import type { Catalog, Settings, Species } from '../types';
import {
  buildPokemonGoSearchString,
  exportLibraryCsv,
  exportLibraryJson,
  parseLibraryImportJson,
  revalidateEntryCp,
  type EvaluatedLibraryEntry,
  type LibraryComparison,
  type LibraryEntry,
  type TriageStatus,
} from '../lib/library';
import type { IVSuggestion } from '../lib/appraisalVerify';
import { copyGender } from '../lib/assessment';
import { overallIV } from '../lib/calculator';
import { AppraisalScanner } from './AppraisalScanner';
import { Icon } from './Icon';

export type Saved = LibraryEntry;

type FilterTab = 'All' | 'Keep' | 'NeedsFix' | 'Trade' | 'Review' | 'Transfer' | 'Outranked';

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function SavedPanel({
  data,
  settings,
  saved,
  byId,
  evaluated,
  comparisons,
  evaluating,
  onAssess,
  onOpen,
  onRemove,
  onBulkRemove,
  onUpdateEntry,
  onAddToLibrary,
  onNotify,
}: {
  data: Catalog;
  settings: Settings;
  saved: LibraryEntry[];
  byId: Map<string, Species>;
  evaluated: Map<string, EvaluatedLibraryEntry>;
  comparisons: Map<string, LibraryComparison>;
  evaluating: boolean;
  onAssess: () => void;
  onOpen: (entry: LibraryEntry) => void;
  onRemove: (id: string) => void;
  onBulkRemove: (ids: string[]) => void;
  onUpdateEntry: (id: string, updater: (entry: LibraryEntry) => LibraryEntry) => void;
  onAddToLibrary: (
    entries: LibraryEntry[],
    options?: { silent?: boolean },
  ) => { added: number; skippedDuplicates: number };
  onNotify: (message: string) => void;
}) {
  const importRef = useRef<HTMLInputElement | null>(null);
  const [filter, setFilter] = useState<FilterTab>('All');
  const [roleFilter, setRoleFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const effectiveVerdict = (entry: LibraryEntry): string =>
    evaluated.get(entry.id)?.verdict?.verdict ?? entry.verdict;

  const matchesFilterTab = (entry: LibraryEntry, tab: FilterTab): boolean => {
    const v = effectiveVerdict(entry);
    const comp = comparisons.get(entry.id);
    if (tab === 'All') return true;
    if (tab === 'NeedsFix') return entry.cpStatus === 'mismatch';
    if (tab === 'Outranked') return comp?.isFullyOutranked === true;
    if (tab === 'Keep')
      return (
        entry.triage === 'keep' ||
        (entry.triage !== 'transfer' && entry.triage !== 'trade' && v === 'Keep')
      );
    if (tab === 'Trade')
      return (
        entry.triage === 'trade' ||
        (!entry.triage || entry.triage === 'undecided' ? v === 'Trade' : false)
      );
    if (tab === 'Transfer') return entry.triage === 'transfer' || v === 'Transfer';
    if (tab === 'Review')
      return (
        v === 'Review' &&
        entry.triage !== 'keep' &&
        entry.triage !== 'trade' &&
        entry.triage !== 'transfer'
      );
    return true;
  };

  const tabCounts = useMemo(() => {
    const counts: Record<FilterTab, number> = {
      All: saved.length,
      Keep: 0,
      NeedsFix: 0,
      Trade: 0,
      Review: 0,
      Transfer: 0,
      Outranked: 0,
    };
    for (const entry of saved) {
      for (const tab of ['Keep', 'NeedsFix', 'Trade', 'Review', 'Transfer', 'Outranked'] as const) {
        if (matchesFilterTab(entry, tab)) counts[tab]++;
      }
    }
    return counts;
  }, [saved, evaluated, comparisons]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return saved.filter((entry) => {
      if (!matchesFilterTab(entry, filter)) return false;
      const evalItem = evaluated.get(entry.id);
      if (roleFilter !== 'All') {
        if (!evalItem?.roles.some((r) => r.role === roleFilter)) return false;
      }
      if (q) {
        const name = (byId.get(entry.speciesId)?.name ?? entry.speciesId).toLowerCase();
        if (!name.includes(q) && !entry.speciesId.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [saved, filter, roleFilter, search, evaluated, comparisons, byId]);

  const activeSelected = useMemo(
    () => new Set([...selectedIds].filter((id) => saved.some((e) => e.id === id))),
    [selectedIds, saved],
  );
  const allVisibleSelected = visible.length > 0 && visible.every((e) => activeSelected.has(e.id));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const e of visible) next.delete(e.id);
      } else {
        for (const e of visible) next.add(e.id);
      }
      return next;
    });
  }

  function deleteSelected() {
    if (!activeSelected.size) return;
    const ids = [...activeSelected];
    onBulkRemove(ids);
    setSelectedIds(new Set());
  }

  function applyInlineSuggestion(entry: LibraryEntry, suggestion: IVSuggestion) {
    onUpdateEntry(entry.id, (current) => {
      const species = byId.get(current.speciesId) ?? null;
      const next: LibraryEntry = {
        ...current,
        ivs: suggestion.ivs,
        uncertainFields: [],
        settings: { ...current.settings, currentLevel: suggestion.level },
      };
      return revalidateEntryCp(next, species, data.cpm);
    });
  }

  function switchEntryForm(entry: LibraryEntry, nextSpeciesId: string) {
    const species = byId.get(nextSpeciesId) ?? null;
    if (!species) return;
    onUpdateEntry(entry.id, (current) => {
      const next: LibraryEntry = {
        ...current,
        speciesId: species.id,
        settings: {
          ...current.settings,
          gender: copyGender(species, current.settings.gender),
        },
      };
      return revalidateEntryCp(next, species, data.cpm);
    });
  }

  function setEntryTriage(entry: LibraryEntry, status: TriageStatus) {
    onUpdateEntry(entry.id, (current) => ({
      ...current,
      triage: current.triage === status ? 'undecided' : status,
      flags: {
        ...current.flags,
        ordinaryExtra: status === 'transfer' ? true : current.flags.ordinaryExtra,
      },
    }));
  }

  async function copyTransferSearch() {
    const transferTagged = saved.filter((e) => e.triage === 'transfer');
    const selectedEntries = saved.filter((e) => activeSelected.has(e.id));
    const outrankedEntries = saved.filter((e) => comparisons.get(e.id)?.isFullyOutranked);
    const pool = transferTagged.length
      ? transferTagged
      : selectedEntries.length
        ? selectedEntries
        : outrankedEntries;
    if (!pool.length) {
      onNotify('Tag Pokémon as Transfer (or select entries) first to generate a GO search string.');
      return;
    }
    const query = buildPokemonGoSearchString(pool, byId, 'transfer');
    if (!query) {
      onNotify('All chosen copies are protected (Shiny, Shadow, 4*, or Costume).');
      return;
    }
    try {
      await navigator.clipboard.writeText(query);
      onNotify(`Copied Pokémon GO transfer search (${pool.length} copies): ${query}`);
    } catch {
      onNotify(`Transfer search string: ${query}`);
    }
  }

  async function handleImportJson(file: File) {
    try {
      const text = await file.text();
      const imported = parseLibraryImportJson(text);
      const { added, skippedDuplicates } = onAddToLibrary(imported);
      onNotify(
        `Imported ${added} Pokémon into your library${skippedDuplicates ? ` (${skippedDuplicates} duplicate skipped)` : ''}.`,
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not import library JSON.');
    }
  }

  return (
    <section className="saved-panel page-panel">
      <span className="eyebrow">YOUR POKÉMON LIBRARY</span>
      <h1>Worth a second look.</h1>
      <p className="intro">
        One local library for saved assessments and scanned box sweeps. Everything recalculates
        against the current snapshot and stays on this device.
      </p>

      <div className="library-import-box">
        <AppraisalScanner
          data={data}
          settings={settings}
          mode="library"
          onAddToLibrary={onAddToLibrary}
        />
      </div>

      {!saved.length ? (
        <div className="empty-state">
          <Icon name="save" size={32} />
          <h2>A home for your keepers.</h2>
          <p>
            Import a screen recording above or save an assessment to build your keep/transfer
            library.
          </p>
          <button onClick={onAssess}>
            Assess a Pokémon <Icon name="arrow" size={16} />
          </button>
        </div>
      ) : (
        <>
          <div className="library-toolbar">
            <div className="library-filter-pills" role="group" aria-label="Filter library">
              {(
                [
                  ['All', 'All'],
                  ['Keep', 'Keep'],
                  ['NeedsFix', 'Needs Fix'],
                  ['Trade', 'Trade'],
                  ['Review', 'Review'],
                  ['Transfer', 'Transfer'],
                  ['Outranked', 'Outranked'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  className={filter === key ? 'active' : ''}
                  onClick={() => setFilter(key)}
                >
                  {label} <span>{tabCounts[key]}</span>
                </button>
              ))}
            </div>

            <div className="library-search-row">
              <label className="sr-only" htmlFor="library-search">
                Filter library by species
              </label>
              <input
                id="library-search"
                type="search"
                value={search}
                placeholder="Search species in library…"
                onChange={(e) => setSearch(e.target.value)}
              />
              <label className="sr-only" htmlFor="library-role">
                Filter by battle role
              </label>
              <select
                id="library-role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="All">All roles</option>
                <option value="GL">Great League</option>
                <option value="UL">Ultra League</option>
                <option value="ML">Master League</option>
                <option value="Raid">Raids</option>
                <option value="Max">Max Battles</option>
                <option value="Gym">Gym Defense</option>
              </select>
            </div>

            <div className="library-actions-bar">
              <div className="library-select-actions">
                <button
                  type="button"
                  className="library-btn"
                  disabled={!visible.length}
                  onClick={toggleSelectAllVisible}
                >
                  {allVisibleSelected
                    ? `Deselect all (${visible.length})`
                    : `Select all (${visible.length})`}
                </button>
                {activeSelected.size > 0 && (
                  <button type="button" className="library-btn danger" onClick={deleteSelected}>
                    Delete selected ({activeSelected.size})
                  </button>
                )}
              </div>

              <div className="library-export-actions">
                <button
                  type="button"
                  className="library-btn"
                  onClick={() => void copyTransferSearch()}
                >
                  Copy GO Transfer Search
                </button>
                <button
                  type="button"
                  className="library-btn"
                  onClick={() =>
                    downloadText(
                      `pkm-eva-library-${new Date().toISOString().slice(0, 10)}.csv`,
                      exportLibraryCsv(saved, evaluated, comparisons, byId),
                      'text/csv;charset=utf-8',
                    )
                  }
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  className="library-btn"
                  onClick={() =>
                    downloadText(
                      `pkm-eva-library-${new Date().toISOString().slice(0, 10)}.json`,
                      exportLibraryJson(saved),
                      'application/json',
                    )
                  }
                >
                  Export JSON
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  aria-label="Import library JSON"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImportJson(file);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="library-btn"
                  onClick={() => importRef.current?.click()}
                >
                  Import JSON
                </button>
              </div>
            </div>

            {evaluating && (
              <p className="small-note" role="status">
                Evaluating IV ranks across your library…
              </p>
            )}
          </div>

          {!visible.length ? (
            <div className="empty-state">
              <Icon name="search" size={28} />
              <h2>No matching Pokémon in your library.</h2>
              <p>Try clearing the filter or search query.</p>
              <button
                type="button"
                onClick={() => {
                  setFilter('All');
                  setRoleFilter('All');
                  setSearch('');
                }}
              >
                Show all ({saved.length})
              </button>
            </div>
          ) : (
            <div className="saved-grid">
              {visible.map((s) => {
                const species = byId.get(s.speciesId);
                const name = species?.name ?? s.speciesId;
                const evalItem = evaluated.get(s.id);
                const comp = comparisons.get(s.id);
                const verdictLabel = evalItem?.verdict?.verdict ?? s.verdict;
                const isSelected = activeSelected.has(s.id);
                const topRoles = (evalItem?.roles ?? []).slice(0, 3);
                const overall = overallIV(s.ivs);

                return (
                  <article className={`saved-card ${isSelected ? 'selected' : ''}`} key={s.id}>
                    <div className="library-card-head">
                      <label className="library-card-select">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          aria-label={`Select ${name} (${s.ivs.join('/')})`}
                          onChange={() => toggleSelect(s.id)}
                        />
                        <span
                          className={`library-verdict verdict-pill-${verdictLabel.toLowerCase()}`}
                        >
                          {verdictLabel}
                        </span>
                      </label>
                      <span className="small-note">{s.date.slice(0, 10)}</span>
                    </div>

                    <h2>{name}</h2>

                    <p className="library-card-stats">
                      <b>{s.ivs.join(' / ')}</b> ({overall.toFixed(1)}%)
                      {s.cp ? <> · CP {s.cp.toLocaleString()}</> : null}
                      {s.settings.currentLevel !== undefined ? (
                        <> · Lv {s.settings.currentLevel}</>
                      ) : (
                        <> · Level {s.settings.maxLevel + (s.settings.bestBuddy ? 1 : 0)} max</>
                      )}
                    </p>

                    <div className="scan-badges">
                      {s.cpStatus === 'verified' && s.cp && (
                        <span className="scan-badge verified">
                          <Icon name="check" size={12} />
                          CP {s.cp.toLocaleString()} verified
                        </span>
                      )}
                      {s.cpStatus === 'mismatch' && (
                        <span className="scan-badge mismatch">
                          <Icon name="info" size={12} />
                          CP mismatch
                        </span>
                      )}
                      {species?.shadow && <span className="scan-flag">Shadow</span>}
                      {s.flags.shiny && <span className="scan-flag">Shiny</span>}
                      {s.flags.costume && <span className="scan-flag">Costume</span>}
                      {s.flags.maxBattle && <span className="scan-flag">Max</span>}
                      {s.flags.alreadyTraded && <span className="scan-flag">Traded</span>}
                    </div>

                    {s.candidateIds && s.candidateIds.length > 1 && (
                      <div
                        className="scan-chip-row"
                        role="group"
                        aria-label={`Form options for ${name}`}
                      >
                        {s.candidateIds.map((cid) => {
                          const cand = byId.get(cid);
                          if (!cand) return null;
                          return (
                            <button
                              key={cid}
                              type="button"
                              aria-pressed={s.speciesId === cid}
                              className={s.speciesId === cid ? 'scan-chip active' : 'scan-chip'}
                              onClick={() => switchEntryForm(s, cid)}
                            >
                              {cand.name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {s.cpStatus === 'mismatch' && s.suggestions && s.suggestions.length > 0 && (
                      <div className="scan-mismatch-box">
                        {s.cpReason && <p className="inline-warning">{s.cpReason}</p>}
                        <div className="scan-chip-row">
                          {s.suggestions.slice(0, 4).map((suggestion) => (
                            <button
                              key={`${suggestion.ivs.join('/')}-${suggestion.level}`}
                              type="button"
                              className="scan-chip suggestion"
                              onClick={() => applyInlineSuggestion(s, suggestion)}
                            >
                              <b>{suggestion.ivs.join('/')}</b> · Lv {suggestion.level}{' '}
                              <small>({suggestion.changes.join(', ')})</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {topRoles.length > 0 && (
                      <ul className="library-roles">
                        {topRoles.map((r) => (
                          <li key={r.roleKey} className={r.meetsPreference ? 'good' : ''}>
                            {r.label}
                          </li>
                        ))}
                      </ul>
                    )}

                    {comp && comp.leaderRoles.length > 0 && (
                      <p className="library-standing leader">
                        #1 in library for{' '}
                        {comp.leaderRoles
                          .slice(0, 2)
                          .map((r) => `${r.targetName} ${r.role}`)
                          .join(', ')}
                      </p>
                    )}
                    {comp && comp.leaderRoles.length === 0 && comp.outrankedBy.length > 0 && (
                      <p className="library-standing outranked">
                        Outranked in {comp.outrankedBy[0].targetName} {comp.outrankedBy[0].role} by{' '}
                        {comp.outrankedBy[0].winnerLabel} ({comp.outrankedBy[0].winnerMetric})
                      </p>
                    )}

                    <div
                      className="library-triage-row"
                      role="group"
                      aria-label={`Decision for ${name}`}
                    >
                      {(
                        [
                          ['keep', 'Keep'],
                          ['trade', 'Trade'],
                          ['transfer', 'Transfer'],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          aria-pressed={s.triage === val}
                          className={`library-triage-btn triage-${val} ${s.triage === val ? 'active' : ''}`}
                          onClick={() => setEntryTriage(s, val)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <span className="small-note">Data {s.version}</span>

                    <div className="library-card-footer">
                      <button type="button" onClick={() => onOpen(s)}>
                        Open assessment <Icon name="arrow" size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove saved ${name}`}
                        onClick={() => onRemove(s.id)}
                      >
                        <Icon name="close" size={18} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
