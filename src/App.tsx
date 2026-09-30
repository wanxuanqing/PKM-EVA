import { useEffect, useMemo, useRef, useState } from 'react';
import type { Catalog, CollectionFlags, IVResult, IVs, Settings, Species } from './types';
import { effectiveMax, overallIV, validLevel } from './lib/calculator';
import { copyGender, optionsFor, reachable, recommendation } from './lib/assessment';
import { loadLocal, saveLocal } from './lib/storage';
import { parseIVs } from './lib/calculator';
import { Selector } from './components/Selector';
import { BrandMark, Icon } from './components/Icon';
import { ResultCard, leagueNames } from './components/ResultCard';
import { DataPanel } from './components/DataPanel';
import type { CalculationRequest, CalculationResponse } from './worker/calculator.worker';

const defaults: Settings = {
  maxLevel: 50,
  bestBuddy: false,
  floor: 0,
  threshold: 90,
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
type Saved = {
  id: string;
  speciesId: string;
  ivs: IVs;
  settings: Settings;
  flags: CollectionFlags;
  date: string;
  version: string;
  verdict: string;
};
function initialSettings(): Settings {
  const stored = loadLocal<Partial<Settings>>('preferences', {});
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
        ? stored.threshold
        : 90,
  };
}
export default function App({ data }: { data: Catalog }) {
  const [page, setPage] = useState<'assess' | 'saved' | 'data'>('assess');
  const [selectedId, setSelectedId] = useState('duskull');
  const [fields, setFields] = useState(['1', '12', '13']);
  const [edited, setEdited] = useState(false);
  const [paste, setPaste] = useState('');
  const [pasteError, setPasteError] = useState('');
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
  const [calculations, setCalculations] = useState<Record<string, IVResult>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineUnavailable, setOfflineUnavailable] = useState(false);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  const worker = useRef<Worker | null>(null);
  const serial = useRef(0);
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
  const baseOptions = useMemo(() => optionsFor(targets), [targets]);
  const options = useMemo(
    () => baseOptions.map((o) => ({ ...o, result: calculations[o.key] })),
    [baseOptions, calculations],
  );
  const overall = ivs ? overallIV(ivs) : 0;
  const verdict = ivs
    ? recommendation(selected, ivs, options, flags, settings, !busy && !error)
    : null;

  useEffect(() => {
    const w = new Worker(new URL('./worker/calculator.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.current = w;
    w.onmessage = (event: MessageEvent<CalculationResponse>) => {
      if (event.data.id !== serial.current) return;
      setBusy(false);
      setError(event.data.error ?? '');
      setCalculations(event.data.results ?? {});
    };
    w.onerror = () => {
      setError('The calculator could not start. Reload the app to try again.');
      setBusy(false);
    };
    return () => w.terminate();
  }, []);
  useEffect(() => {
    serial.current++;
    setCalculations({});
    setError('');
    if (!ivs || !valid) {
      setBusy(false);
      return;
    }
    const pvp = baseOptions.filter((o) => o.role !== 'Raid' && o.species.baseStats);
    if (!pvp.length) {
      setBusy(false);
      return;
    }
    setBusy(true);
    const request: CalculationRequest = {
      id: serial.current,
      version: data.version,
      ivs,
      currentLevel: currentLevel === '' ? undefined : Number(currentLevel),
      targets: pvp.map((o) => ({
        key: o.key,
        speciesId: o.species.id,
        calculation: {
          base: o.species.baseStats!,
          league: o.role as 'GL' | 'UL' | 'ML',
          maxLevel: effectiveMax(settings.maxLevel, settings.bestBuddy),
          minLevel: o.species.minLevel,
          floor: settings.floor,
          eligible: o.species.eligible[o.role as 'GL' | 'UL' | 'ML'],
          cpm: data.cpm,
        },
      })),
    };
    worker.current?.postMessage(request);
  }, [ivs, valid, baseOptions, data, settings, currentLevel]);
  useEffect(() => {
    saveLocal('preferences', {
      maxLevel: settings.maxLevel,
      bestBuddy: settings.bestBuddy,
      threshold: settings.threshold,
      floor: settings.floor,
    });
  }, [settings]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (!('serviceWorker' in navigator)) {
      setOfflineUnavailable(true);
      return;
    }
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        if (reg.waiting) setUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller)
              setUpdate(installing);
          });
        });
        navigator.serviceWorker.ready.then(() => setOfflineReady(true));
      })
      .catch(() => setOfflineUnavailable(true));
  }, []);
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
  function applyPaste(value: string) {
    const parsed = parseIVs(value);
    if (!parsed) {
      setPasteError('Use three integers from 0 to 15, for example 1/12/13.');
      return;
    }
    setFields(parsed.map(String));
    setEdited(true);
    setPaste('');
    setPasteError('');
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
            {(['assess', 'saved', 'data'] as const).map((p) => (
              <button
                key={p}
                aria-current={page === p ? 'page' : undefined}
                className={page === p ? 'active' : ''}
                onClick={() => setPage(p)}
              >
                {p === 'assess' ? (
                  'Assess'
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
          <button
            onClick={() => {
              navigator.serviceWorker.addEventListener(
                'controllerchange',
                () => location.reload(),
                { once: true },
              );
              update.postMessage({ type: 'ACTIVATE_UPDATE' });
            }}
          >
            Update & reload
          </button>
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
                    selected={selected}
                    onSelect={choose}
                    recent={recent}
                  />
                  <div className="iv-section">
                    <div className="label-row">
                      <h3>Individual values</h3>
                      <span>0–15 each</span>
                    </div>
                    <div className="iv-fields">
                      {(['Attack', 'Defense', 'HP'] as const).map((label, i) => (
                        <div key={label} className={`iv-field iv-${i}`}>
                          <label htmlFor={`iv-${i}`}>
                            <span className="iv-dot" />
                            {label}
                          </label>
                          <input
                            id={`iv-${i}`}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={2}
                            value={fields[i]}
                            aria-invalid={!/^\d{1,2}$/.test(fields[i]) || Number(fields[i]) > 15}
                            aria-describedby={!ivs ? 'iv-error' : undefined}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              setFields(fields.map((v, n) => (n === i ? e.target.value : v)));
                              setEdited(true);
                            }}
                            onPaste={(e) => {
                              const text = e.clipboardData.getData('text');
                              if (/[/,\s]/.test(text.trim())) {
                                e.preventDefault();
                                applyPaste(text);
                              }
                            }}
                          />
                          <div className="iv-mini-bar">
                            <span
                              style={{
                                width: `${Math.min(100, Math.max(0, (Number(fields[i]) / 15) * 100)) || 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    {!ivs && (
                      <p className="field-error" id="iv-error" role="alert">
                        Enter a whole number from 0 to 15 in each IV field.
                      </p>
                    )}
                    <form
                      className="paste-row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        applyPaste(paste);
                      }}
                    >
                      <label className="sr-only" htmlFor="paste-ivs">
                        Paste all three IVs
                      </label>
                      <input
                        id="paste-ivs"
                        value={paste}
                        placeholder="Or paste 1/12/13"
                        onChange={(e) => {
                          setPaste(e.target.value);
                          setPasteError('');
                        }}
                      />
                      <button type="submit">
                        Apply <Icon name="arrow" size={15} />
                      </button>
                    </form>
                    {pasteError && (
                      <p className="field-error" role="alert">
                        {pasteError}
                      </p>
                    )}
                    <div className="overall-row">
                      <span>
                        Overall IVs{' '}
                        <abbr title="(Attack + Defense + HP IVs) / 45. This is not a percentile.">
                          ⓘ
                        </abbr>
                      </span>
                      <b>{ivs ? `${overall.toFixed(1)}%` : '—'}</b>
                    </div>
                    {!edited && (
                      <p className="example-note">
                        Example IVs are loaded. Edit them for your copy.
                      </p>
                    )}
                  </div>
                  <details className="settings-details">
                    <summary>
                      <span>
                        <Icon name="shield" size={17} /> Level & comparison settings
                      </span>
                      <Icon name="chevron" size={16} />
                    </summary>
                    <div className="settings-body">
                      <div className="settings-grid">
                        <label>
                          Current level <span>optional</span>
                          <input
                            aria-label="Current level"
                            type="number"
                            inputMode="decimal"
                            min="1"
                            max="51"
                            step="0.5"
                            value={currentLevel}
                            placeholder="Unknown"
                            onChange={(e) => setCurrentLevel(e.target.value)}
                            aria-invalid={!levelValid}
                          />
                        </label>
                        <label>
                          Maximum level
                          <input
                            aria-label="Maximum level"
                            type="number"
                            inputMode="decimal"
                            min="1"
                            max="50"
                            step="0.5"
                            value={maxLevel}
                            onChange={(e) => {
                              setMaxLevel(e.target.value);
                              if (
                                validLevel(Number(e.target.value)) &&
                                Number(e.target.value) <= 50
                              )
                                setSettings((s) => ({ ...s, maxLevel: Number(e.target.value) }));
                            }}
                            aria-invalid={!maxValid}
                          />
                        </label>
                      </div>
                      {(!levelValid || !maxValid) && (
                        <p className="field-error">Use half-levels: maximum 1–50; current 1–51.</p>
                      )}
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={settings.bestBuddy}
                          onChange={(e) =>
                            setSettings((s) => ({ ...s, bestBuddy: e.target.checked }))
                          }
                        />
                        <span>
                          Best Buddy boost
                          <small>
                            Effective maximum: level{' '}
                            {settings.maxLevel + (settings.bestBuddy ? 1 : 0)}
                          </small>
                        </span>
                      </label>
                      <p className="small-note">
                        If known, enter the copy’s effective current level, including any active
                        buddy boost.
                      </p>
                      <label className="stack-label">
                        GL / UL keep threshold (%)
                        <input
                          aria-label="PvP percentile threshold"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="100"
                          step="0.1"
                          value={threshold}
                          onChange={(e) => {
                            setThreshold(e.target.value);
                            const n = Number(e.target.value);
                            if (e.target.value !== '' && Number.isFinite(n) && n >= 0 && n <= 100)
                              setSettings((s) => ({ ...s, threshold: n }));
                          }}
                          aria-invalid={!thresholdValid}
                        />
                      </label>
                      {!thresholdValid && (
                        <p className="field-error">Use a threshold from 0 to 100.</p>
                      )}
                      <p className="small-note">
                        IV percentile must be strictly above this value. 90% is the app default,
                        separate from your overall-IV rule.
                      </p>
                      <label className="stack-label">
                        IV comparison floor
                        <select
                          value={settings.floor}
                          onChange={(e) =>
                            setSettings((s) => ({ ...s, floor: Number(e.target.value) }))
                          }
                        >
                          {[0, 1, 2, 3, 4, 5, 10, 12, 15].map((n) => (
                            <option key={n} value={n}>
                              {n === 0 ? 'All IVs · 0–15 (default)' : `Each IV at least ${n}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="small-note">
                        All IVs includes theoretical spreads even when a species cannot be acquired
                        with them. No acquisition floor is applied silently.
                      </p>
                      <label className="stack-label">
                        Gender
                        <select
                          value={copyGender(selected, settings.gender)}
                          disabled={!!selected.gender?.fixed}
                          onChange={(e) =>
                            setSettings((s) => ({
                              ...s,
                              gender: e.target.value as Settings['gender'],
                            }))
                          }
                        >
                          <option value="unknown">Unknown / not specified</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          {selected.gender?.fixed === 'genderless' && (
                            <option value="genderless">Genderless</option>
                          )}
                        </select>
                      </label>
                      <p className="small-note">
                        {selected.gender?.fixed
                          ? 'Gender is fixed by the selected species or battle form. Choose a different form above to change it.'
                          : 'Gender belongs to your copy and controls eligible evolution paths, not league eligibility.'}
                      </p>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={settings.eventPaths}
                          onChange={(e) =>
                            setSettings((s) => ({ ...s, eventPaths: e.target.checked }))
                          }
                        />
                        <span>
                          Show event-only evolution paths
                          <small>Event availability must be confirmed in the game.</small>
                        </span>
                      </label>
                    </div>
                  </details>
                  <details className="settings-details collection-settings">
                    <summary>
                      <span>
                        <Icon name="spark" size={17} /> Collection & copy details
                      </span>
                      <Icon name="chevron" size={16} />
                    </summary>
                    <div className="settings-body">
                      <p className="small-note">
                        Only you know what makes this copy special. These flags are never inferred
                        from the species.
                      </p>
                      <div className="collection-grid">
                        {(
                          [
                            ['shiny', 'Shiny'],
                            ['costume', 'Costume'],
                            ['rare', 'Rare'],
                            ['sentimental', 'Sentimental'],
                            ['maxBattle', 'Max Battle capable'],
                          ] as const
                        ).map(([key, label]) => (
                          <label className="check-row" key={key}>
                            <input
                              type="checkbox"
                              checked={flags[key]}
                              onChange={(e) => setFlags((f) => ({ ...f, [key]: e.target.checked }))}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={flags.alreadyTraded}
                          onChange={(e) =>
                            setFlags((f) => ({ ...f, alreadyTraded: e.target.checked }))
                          }
                        />
                        <span>
                          Already traded<small>A Pokémon cannot be traded again.</small>
                        </span>
                      </label>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={flags.ordinaryExtra}
                          onChange={(e) =>
                            setFlags((f) => ({ ...f, ordinaryExtra: e.target.checked }))
                          }
                        />
                        <span>
                          Ordinary extra with no collection reason
                          <small>
                            I have reviewed the missing battle evidence and am considering transfer.
                          </small>
                        </span>
                      </label>
                      {flags.costume && (
                        <p className="inline-warning">
                          Some costumes cannot evolve. Confirm the exact copy’s evolution options in
                          the game.
                        </p>
                      )}
                    </div>
                  </details>
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
                      {['All', 'GL', 'UL', 'ML', 'Raid'].map((f) => (
                        <button
                          key={f}
                          className={filter === f ? 'active' : ''}
                          aria-pressed={filter === f}
                          onClick={() => setFilter(f)}
                        >
                          {f === 'Raid' ? 'Raids' : f}
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
                          <b>Species rank</b> compares different Pokémon in a league. Ranks 1–199
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
                          Every qualifying evolution is preserved. More than one path can be worth
                          keeping a copy for.
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
        ) : page === 'data' ? (
          <DataPanel data={data} />
        ) : (
          <section className="saved-panel page-panel">
            <span className="eyebrow">YOUR FIELD NOTES</span>
            <h1>Worth a second look.</h1>
            <p className="intro">
              Saved assessments stay on this device. Open one to recalculate with the current
              snapshot.
            </p>
            {!saved.length ? (
              <div className="empty-state">
                <Icon name="save" size={32} />
                <h2>A home for your keepers.</h2>
                <p>Save an assessment to find it here later.</p>
                <button onClick={() => setPage('assess')}>
                  Assess a Pokémon <Icon name="arrow" size={16} />
                </button>
              </div>
            ) : (
              <div className="saved-grid">
                {saved.map((s) => (
                  <article className="saved-card" key={s.id}>
                    <span className="eyebrow">
                      {s.verdict} · {s.date.slice(0, 10)}
                    </span>
                    <h2>{byId.get(s.speciesId)?.name ?? s.speciesId}</h2>
                    <p>
                      {s.ivs.join(' / ')} · Level{' '}
                      {s.settings.maxLevel + (s.settings.bestBuddy ? 1 : 0)} max
                    </p>
                    <span className="small-note">Data {s.version}</span>
                    <div>
                      <button onClick={() => openSaved(s)}>
                        Open assessment <Icon name="arrow" size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Remove saved ${byId.get(s.speciesId)?.name ?? s.speciesId}`}
                        onClick={() => {
                          const next = saved.filter((x) => x.id !== s.id);
                          if (saveLocal('saved', next)) setSaved(next);
                          else setToast('Could not update device storage.');
                        }}
                      >
                        <Icon name="close" size={18} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
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
