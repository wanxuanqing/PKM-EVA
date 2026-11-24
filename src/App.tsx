import { useEffect, useMemo, useState } from 'react';
import type { Catalog, CollectionFlags, Settings, Species } from './types';
import { overallIV, parseIVs, validLevel } from './lib/calculator';
import { copyGender, optionsFor, reachable, recommendation } from './lib/assessment';
import { loadLocal, saveLocal } from './lib/storage';
import { Selector } from './components/Selector';
import { BrandMark, Icon } from './components/Icon';
import { ResultCard } from './components/ResultCard';
import { leagueNames } from './lib/leagueNames';
import { DataPanel } from './components/DataPanel';
import { TopPokemon } from './components/TopPokemon';
import { PokemonPicture } from './components/PokemonPicture';
import { IvInputPanel } from './components/IvInputPanel';
import { SettingsPanels } from './components/SettingsPanels';
import { SavedPanel, type Saved } from './components/SavedPanel';
import { useServiceWorker } from './hooks/useServiceWorker';
import { useCalculatorWorker } from './hooks/useCalculatorWorker';

const defaults: Settings = {
  maxLevel: 50,
  bestBuddy: false,
  floor: 0,
  threshold: 95,
  gender: 'unknown',
  eventPaths: false,
};
const noFlags: CollectionFlags = {
  shiny: false,
  costume: false,
  rare: false,
  sentimental: false,
  maxBattle: false,
  ordinaryExtra: false,
  alreadyTraded: false,
};
function initialSettings(): Settings {
  const stored = loadLocal<Partial<Settings> & { thresholdVersion?: number }>('preferences', {});
  return {
    ...defaults,
    maxLevel: validLevel(stored.maxLevel ?? 0) && stored.maxLevel! <= 50 ? stored.maxLevel! : 50,
    bestBuddy: stored.bestBuddy === true,
    floor:
      Number.isInteger(stored.floor) && stored.floor! >= 0 && stored.floor! <= 15
        ? stored.floor!
        : 0,
    threshold:
      typeof stored.threshold === 'number' && stored.threshold >= 0 && stored.threshold <= 100
        ? stored.threshold === 90 && stored.thresholdVersion !== 2
          ? 95
          : stored.threshold
        : defaults.threshold,
  };
}
export default function App({ data }: { data: Catalog }) {
  const [page, setPage] = useState<'assess' | 'top' | 'saved' | 'data'>('assess');
  const [selectedId, setSelectedId] = useState('duskull');
  const [fields, setFields] = useState(['1', '12', '13']);
  const [edited, setEdited] = useState(false);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [currentLevel, setCurrentLevel] = useState('');
  const [maxLevel, setMaxLevel] = useState(String(settings.maxLevel));
  const [threshold, setThreshold] = useState(String(settings.threshold));
  const [flags, setFlags] = useState<CollectionFlags>(noFlags);
  const [recent, setRecent] = useState<string[]>(() => {
    const r = loadLocal<unknown>('recent', ['duskull']);
    return Array.isArray(r) ? r.filter((x) => typeof x === 'string').slice(0, 6) : ['duskull'];
  });
  const [saved, setSaved] = useState<Saved[]>(() => {
    const r = loadLocal<unknown>('saved', []);
    return Array.isArray(r)
      ? r.filter(
          (s) =>
            s &&
            typeof s.id === 'string' &&
            typeof s.speciesId === 'string' &&
            Array.isArray(s.ivs) &&
            s.ivs.length === 3 &&
            s.settings &&
            s.flags,
        )
      : [];
  });
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState('All');
  const byId = useMemo(() => new Map(data.species.map((p) => [p.id, p])), [data]);
  const selected = byId.get(selectedId) ?? data.species[0];
  const ivs = useMemo(() => parseIVs(fields.join('/')), [fields]);
  const levelValid = currentLevel === '' || validLevel(Number(currentLevel));
  const maxValid = maxLevel.trim() !== '' && validLevel(Number(maxLevel)) && Number(maxLevel) <= 50;
  const thresholdValid =
    threshold.trim() !== '' &&
    Number.isFinite(Number(threshold)) &&
    Number(threshold) >= 0 &&
    Number(threshold) <= 100;
  const valid = !!ivs && levelValid && maxValid && thresholdValid;
  const targets = useMemo(
    () => (ivs ? reachable(selected, byId, settings, ivs) : []),
    [selected, byId, settings, ivs],
  );
  const baseOptions = useMemo(
    () => optionsFor(targets, data.maxBattles, data.gymDefense),
    [targets, data.maxBattles, data.gymDefense],
  );
  const { calculations, busy, error } = useCalculatorWorker({
    data,
    ivs,
    valid,
    baseOptions,
    settings,
    currentLevel,
  });
  const { offlineReady, offlineUnavailable, update, activateUpdate } = useServiceWorker();
  const options = useMemo(
    () => baseOptions.map((o) => ({ ...o, result: calculations[o.key] })),
    [baseOptions, calculations],
  );
  const overall = ivs ? overallIV(ivs) : 0;
  const verdict = ivs
    ? recommendation(selected, ivs, options, flags, settings, !busy && !error, data.gymDefense)
    : null;

  useEffect(() => {
    saveLocal('preferences', {
      maxLevel: settings.maxLevel,
      bestBuddy: settings.bestBuddy,
      threshold: settings.threshold,
      thresholdVersion: 2,
      floor: settings.floor,
    });
  }, [settings.maxLevel, settings.bestBuddy, settings.threshold, settings.floor]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(t);
  }, [toast]);

  function choose(p: Species) {
    setSelectedId(p.id);
    setFlags({ ...noFlags });
    setCurrentLevel('');
    setSettings((s) => ({ ...s, gender: copyGender(p, 'unknown') }));
    setFilter('All');
    setPage('assess');
    const next = [p.id, ...recent.filter((r) => r !== p.id)].slice(0, 6);
    setRecent(next);
    saveLocal('recent', next);
  }
  function save() {
    if (!ivs || !verdict || busy || !valid) return;
    const entry: Saved = {
      id: crypto.randomUUID(),
      speciesId: selected.id,
      ivs,
      settings: {
        ...settings,
        currentLevel: currentLevel === '' ? undefined : Number(currentLevel),
      },
      flags,
      date: new Date().toISOString(),
      version: data.version,
      verdict: verdict.verdict,
    };
    const next = [entry, ...saved].slice(0, 100);
    if (saveLocal('saved', next)) {
      setSaved(next);
      setToast('Assessment saved on this device.');
    } else setToast('Device storage is unavailable. This assessment could not be saved.');
  }
  function openSaved(s: Saved) {
    const p = byId.get(s.speciesId);
    if (!p) {
      setToast('This saved form is not in the current catalog.');
      return;
    }
    choose(p);
    setFields(s.ivs.map(String));
    setEdited(true);
    setSettings({ ...defaults, ...s.settings, gender: copyGender(p, s.settings.gender) });
    setMaxLevel(String(s.settings.maxLevel));
    setThreshold(String(s.settings.threshold));
    setCurrentLevel(s.settings.currentLevel === undefined ? '' : String(s.settings.currentLevel));
    setFlags({ ...noFlags, ...s.flags });
    if (s.version !== data.version)
      setToast('Saved assessment opened and recalculated with the current data snapshot.');
  }
  function removeSaved(id: string) {
    const next = saved.filter((x) => x.id !== id);
    if (saveLocal('saved', next)) setSaved(next);
    else setToast('Could not update device storage.');
  }
  const shown = options.filter((o) => filter === 'All' || o.role === filter);
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <button className="brand" onClick={() => setPage('assess')} aria-label="PKM-EVA home">
            <BrandMark />
            <span>
              PKM<span className="brand-dash">—</span>EVA<small>POKÉMON EVALUATOR</small>
            </span>
          </button>
          <nav aria-label="Main navigation">
            {(['assess', 'top', 'saved', 'data'] as const).map((p) => (
              <button
                key={p}
                aria-current={page === p ? 'page' : undefined}
                className={page === p ? 'active' : ''}
                onClick={() => setPage(p)}
              >
                {p === 'assess' ? (
                  'Assess'
                ) : p === 'top' ? (
                  'Top 50'
                ) : p === 'saved' ? (
                  <>
                    Saved <span className="nav-count">{saved.length}</span>
                  </>
                ) : (
                  'Data'
                )}
              </button>
            ))}
          </nav>
          <span className="header-note">
            <span className="live-dot" />
            Your next keeper starts here.
          </span>
        </div>
      </header>
      {update && (
        <div className="update-notice">
          <span>A complete app & data update is ready.</span>
          <button onClick={activateUpdate}>Update & reload</button>
        </div>
      )}
      <main className="main-shell">
        {page === 'assess' ? (
          <>
            <section className="hero">
              <div>
                <span className="eyebrow">
                  <span className="tiny-star">✳</span> A SECOND LOOK AT YOUR CATCH
                </span>
                <h1>
                  Find the keepers<span>.</span>
                </h1>
                <p>
                  Check the IVs. Explore the evolutions.
                  <br className="phone-break" /> Make a little room for the good ones.
                </p>
              </div>
              <div className="catalog-note">
                <Icon name="book" size={23} />
                <div>
                  <strong>{data.counts.forms.toLocaleString()} catalog forms.</strong>
                  <span>
                    {data.counts.dexSpecies} species in your catalog · {data.retrieved.slice(0, 10)}
                  </span>
                </div>
              </div>
            </section>
            <div className="assessment-layout">
              <aside className="input-column">
                <section className="input-card">
                  <div className="section-label">
                    <span className="step">01</span>
                    <h2>Your Pokémon</h2>
                    <span className="section-hint">Start here</span>
                  </div>
                  <Selector
                    species={data.species}
                    byId={byId}
                    selected={selected}
                    onSelect={choose}
                    recent={recent}
                  />
                  <PokemonPicture key={selected.id} species={selected} />
                  <IvInputPanel
                    fields={fields}
                    ivs={ivs}
                    overall={overall}
                    edited={edited}
                    onChangeFields={setFields}
                    onEdited={() => setEdited(true)}
                  />
                  <SettingsPanels
                    selected={selected}
                    settings={settings}
                    flags={flags}
                    currentLevel={currentLevel}
                    maxLevel={maxLevel}
                    threshold={threshold}
                    levelValid={levelValid}
                    maxValid={maxValid}
                    thresholdValid={thresholdValid}
                    onChangeSettings={setSettings}
                    onChangeFlags={setFlags}
                    onChangeCurrentLevel={setCurrentLevel}
                    onChangeMaxLevel={setMaxLevel}
                    onChangeThreshold={setThreshold}
                  />
                </section>
                <p className="device-note">
                  <Icon name="save" size={14} />
                  Private by default. Saved on your device.
                </p>
              </aside>
              <section className="results-column" aria-label="Assessment results">
                <div className="section-label result-section-label">
                  <span className="step">02</span>
                  <h2>The assessment</h2>
                  <button
                    className="save-button"
                    onClick={save}
                    disabled={!valid || busy || !!error}
                  >
                    <Icon name="save" size={16} />
                    Save
                  </button>
                </div>
                {!valid ? (
                  <div className="empty-state" role="status">
                    <Icon name="info" size={28} />
                    <h2>Let’s get those values right.</h2>
                    <p>
                      Complete the three IVs and correct any highlighted level or threshold setting
                      to see your assessment.
                    </p>
                  </div>
                ) : error ? (
                  <div className="empty-state" role="alert">
                    <h2>Calculation unavailable</h2>
                    <p>{error}</p>
                    <button onClick={() => location.reload()}>Reload</button>
                  </div>
                ) : (
                  <>
                    {verdict && (
                      <div
                        className={`verdict verdict-${verdict.verdict.toLowerCase()}`}
                        role="status"
                        aria-live="polite"
                      >
                        <div className="verdict-icon">
                          <Icon
                            name={
                              verdict.verdict === 'Keep'
                                ? 'check'
                                : verdict.verdict === 'Trade'
                                  ? 'trade'
                                  : 'info'
                            }
                            size={28}
                          />
                        </div>
                        <div>
                          <span className="verdict-label">
                            {verdict.verdict}
                            {busy && <span className="busy-dot" />}
                          </span>
                          <h2>{verdict.title}</h2>
                          <p>{verdict.reason}</p>
                        </div>
                      </div>
                    )}
                    <div className="options-heading">
                      <h2>
                        Useful paths <span>{options.length}</span>
                      </h2>
                      <span>One copy, more possibilities</span>
                    </div>
                    <div className="role-filters" role="group" aria-label="Filter roles">
                      {['All', 'GL', 'UL', 'ML', 'Raid', 'Max', 'Gym'].map((f) => (
                        <button
                          key={f}
                          className={filter === f ? 'active' : ''}
                          aria-pressed={filter === f}
                          onClick={() => setFilter(f)}
                        >
                          {f === 'Raid'
                            ? 'Raids'
                            : f === 'Max'
                              ? 'Max Battles'
                              : f === 'Gym'
                                ? 'Gym Defense'
                                : f}
                          <span>
                            {f === 'All'
                              ? options.length
                              : options.filter((o) => o.role === f).length}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="result-list" aria-busy={busy}>
                      {shown.map((o) => (
                        <ResultCard
                          key={o.key}
                          option={o}
                          settings={settings}
                          data={data}
                          byId={byId}
                          overall={overall}
                        />
                      ))}
                    </div>
                    {!shown.length && (
                      <div className="empty-state">
                        <Icon name="search" size={28} />
                        <h3>
                          {filter === 'All'
                            ? 'No confirmed battle path in this snapshot.'
                            : `No ${leagueNames[filter as keyof typeof leagueNames]} options here.`}
                        </h3>
                        <p>
                          {filter === 'All'
                            ? 'This isn’t a verdict on collection value. Missing rankings or raid evidence do not establish that a Pokémon is useless.'
                            : 'Try All to see the other qualifying roles.'}
                        </p>
                        {filter !== 'All' && (
                          <button onClick={() => setFilter('All')}>Show all roles</button>
                        )}
                      </div>
                    )}
                    <details className="help-card">
                      <summary>
                        <Icon name="info" size={17} />
                        <span>How to read your results</span>
                        <Icon name="chevron" size={16} />
                      </summary>
                      <div>
                        <p>
                          <b>Species rank</b> compares different Pokémon in a league. Ranks 1–100
                          qualify here.
                        </p>
                        <p>
                          <b>IV rank</b> compares spreads of the same form. A higher{' '}
                          <b>IV percentile</b> is better by stat product; it doesn’t predict battle
                          wins.
                        </p>
                        <p>
                          <b>Overall IVs</b> measure the IV total out of 45. GL/UL prefer a high
                          percentile; ML and raids use your overall-IV preference of strictly above
                          90%.
                        </p>
                        <p>
                          Max Battle paths require an A-tier-or-better GO Hub attacker, defender or
                          healer role and a copy with the matching capability. Gigantamax is not
                          granted by evolution. Every qualifying evolution is preserved. More than
                          one path can be worth keeping a copy for.
                        </p>
                        <button className="text-button" onClick={() => setPage('data')}>
                          See calculation rules & sources <Icon name="arrow" size={15} />
                        </button>
                      </div>
                    </details>
                    <details className="coverage-details">
                      <summary>Coverage & availability for {selected.name}</summary>
                      <p>{selected.availability.note}</p>
                      {selected.notes.map((n) => (
                        <p key={n}>{n}</p>
                      ))}
                      <p>
                        {targets.length} forms considered through supported paths. Event-only paths
                        are {settings.eventPaths ? 'included conditionally' : 'excluded'}. Costumes
                        can have different evolution restrictions.
                      </p>
                      <ul>
                        {targets.map((t) => (
                          <li key={t.species.id}>
                            <b>{t.species.name}</b>:{' '}
                            {(['GL', 'UL', 'ML'] as const)
                              .map(
                                (l) =>
                                  `${l} ${!t.species.eligible[l] ? 'ineligible' : t.species.rankings[l] ? `#${t.species.rankings[l]!.rank}` : 'ranking unavailable'}`,
                              )
                              .join(' · ')}
                            . {!t.species.raid.length && 'Raid evidence unavailable.'}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </>
                )}
              </section>
            </div>
          </>
        ) : page === 'top' ? (
          <TopPokemon data={data} />
        ) : page === 'data' ? (
          <DataPanel data={data} />
        ) : (
          <SavedPanel
            saved={saved}
            byId={byId}
            onAssess={() => setPage('assess')}
            onOpen={openSaved}
            onRemove={removeSaved}
          />
        )}
        <footer>
          <span>
            <span className={`live-dot ${offlineReady ? '' : 'muted'}`} />
            {offlineReady
              ? 'Ready for offline use'
              : import.meta.env.DEV
                ? 'Local development preview'
                : offlineUnavailable
                  ? 'Offline setup unavailable in this browser'
                  : 'Preparing offline use…'}
          </span>
          <button onClick={() => setPage('data')}>
            Data: {data.retrieved.slice(0, 10)} <Icon name="arrow" size={13} />
          </button>
          <span>Advice only. The final call is yours.</span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {toast}
        </div>
      )}
    </>
  );
}
