import { raidNotes } from '../lib/raidNotes';
import { useEffect, useMemo, useState } from 'react';
import type { Catalog } from '../types';
import { topPokemon, evolutionLines, type TopCategory } from '../lib/topPokemon';
import type { TopResponse } from '../worker/top.worker';
import { MaxPokemon } from './MaxPokemon';
import { PokemonPicture } from './PokemonPicture';
import { leagueNames } from '../lib/leagueNames';
import { sourceURL } from '../lib/data';
export function TopPokemon({ data }: { data: Catalog }) {
  const [category, setCategory] = useState<TopCategory | 'Max'>('GL');
  const [type, setType] = useState('All');
  const [results, setResults] = useState<Record<string, TopResponse>>({});
  const [error, setError] = useState('');
  const entries = useMemo(
    () => (category === 'Max' ? [] : topPokemon(data, category, type)),
    [data, category, type],
  );
  const lineages = useMemo(
    () => new Map(entries.map(({ species }) => [species.id, evolutionLines(data, species.id)])),
    [data, entries],
  );
  const types = useMemo(
    () =>
      [
        ...new Set(
          data.species.flatMap((p) => p.raid.flatMap((r) => r.moveSets?.map((m) => m.type) ?? [])),
        ),
      ]
        .filter((t) => t.toLowerCase() !== 'normal')
        .sort(),
    [data],
  );
  useEffect(() => {
    setResults({});
    setError('');
    if (category === 'Raid' || category === 'ML' || category === 'Max') return;
    const worker = new Worker(new URL('../worker/top.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<TopResponse>) =>
      setResults((old) => ({ ...old, [event.data.id]: event.data }));
    worker.onerror = () =>
      setError('Ideal IV calculations could not start. Reopen this tab to retry.');
    worker.postMessage({ league: category, species: entries.map((e) => e.species), cpm: data.cpm });
    return () => worker.terminate();
  }, [entries, category, data]);
  return (
    <section className="top-pokemon" aria-labelledby="top-title">
      <span className="eyebrow">BUILD YOUR COLLECTION</span>
      <h1 id="top-title">{category === 'Max' ? 'Max Battle recommendations' : 'Top 50 Pokemon'}</h1>
      <p>Explore the best-ranked forms and their recommended moves in this app's data snapshot.</p>
      <div className="top-controls" role="group" aria-label="Battle category">
        {(['GL', 'UL', 'ML', 'Raid', 'Max'] as const).map((c) => (
          <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>
            {c === 'Max' ? 'Max Battles' : leagueNames[c]}
          </button>
        ))}
      </div>
      {category === 'Max' ? (
        <MaxPokemon data={data} />
      ) : (
        <>
          {category === 'Raid' ? (
            <>
              <label className="top-type">
                Attack type{' '}
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option>All</option>
                  {types.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <p>
                GO Hub shortlist: strongest tier first, then rank within attack type. The combined
                list is not a universal damage ranking; the best attacker depends on the boss. Only
                SS, S and A tiers are included. Normal roles and unverified recommendations are
                excluded. Mega and Shadow forms are separate entries.
              </p>
            </>
          ) : (
            <p>
              PvPoke species rankings. GL and UL ideal IVs maximize stat product up to level 50,
              without Best Buddy, across IVs 0-15. These theoretical spreads may require trading or
              special encounters and are not always optimal for every matchup.
            </p>
          )}
          <p className="small-note">
            Snapshot: {data.retrieved.slice(0, 10)}. Showing {entries.length} forms
            {entries.length < 50 ? ' (fewer than 50 qualifying entries in this snapshot)' : ''}.
            {category === 'GL' || category === 'UL' ? ' IV order: Attack / Defense / HP.' : ''}{' '}
            Release availability is not independently confirmed for every form.
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="top-grid">
            {entries.map(({ species: p, sets }, index) => {
              const ranking = category === 'Raid' ? undefined : p.rankings[category];
              const result = results[p.id];
              return (
                <article className="top-card" key={`${category}:${p.id}`} aria-label={p.name}>
                  <span className="eyebrow">
                    {ranking
                      ? `PvPoke #${ranking.rank}`
                      : `Shortlist ${index + 1} · ${sets[0].tier} tier`}
                  </span>
                  <h2>{p.name}</h2>
                  <div className="top-evolution small-note" aria-label="Evolution line">
                    <strong>Evolution line: </strong>
                    {lineages.get(p.id)?.length ? (
                      lineages.get(p.id)!.map((line) => (
                        <p key={line.species.map((s) => s.id).join('>')}>
                          {line.species.map((s) => s.name).join(' → ')}
                          {line.conditional && ' (conditions apply)'}
                        </p>
                      ))
                    ) : (
                      <span>No earlier evolution listed.</span>
                    )}
                  </div>
                  <PokemonPicture species={p} />
                  {(category === 'GL' || category === 'UL') && (
                    <p className="top-ivs">
                      <strong>Best IVs: </strong>
                      {result?.ideals?.length
                        ? result.ideals[0].ivs.join(' / ')
                        : (result?.error ??
                          (result
                            ? 'No eligible spread'
                            : error
                              ? 'Unavailable'
                              : 'Calculating...'))}
                    </p>
                  )}
                  {category !== 'Raid' && category !== 'ML' && result?.ideals?.length ? (
                    <>
                      <p className="small-note">
                        Level {result.ideals[0].level} · CP {result.ideals[0].cp}
                      </p>
                      {result.ideals.length > 1 && (
                        <details>
                          <summary>{result.ideals.length} tied best spreads</summary>
                          {result.ideals.map((s) => (
                            <p key={s.ivs.join('/')}>
                              {s.ivs.join(' / ')} · Level {s.level} · CP {s.cp}
                            </p>
                          ))}
                        </details>
                      )}
                    </>
                  ) : null}
                  <h3>Recommended moves</h3>
                  {ranking ? (
                    <>
                      <ul className="top-moves">
                        {ranking.moves.map((m, i) => (
                          <li key={`${m.name}:${i}`}>
                            <span>{i === 0 ? 'Fast' : 'Charged'}: </span>
                            {m.name}
                            {m.elite && <b> · Elite TM</b>}
                            {m.legacy && <b> · Legacy / special availability</b>}
                          </li>
                        ))}
                      </ul>
                      <a href={sourceURL(data, ranking.source)} target="_blank" rel="noreferrer">
                        PvPoke source
                      </a>
                    </>
                  ) : (
                    sets.map((m, i) => (
                      <div className="top-raid-set" key={`${m.type}:${i}`}>
                        <strong>
                          {m.type} · {m.tier} tier · Type rank #{m.rank}
                        </strong>
                        <p>
                          Fast: {m.fast.name}
                          {m.fast.limited && <b> · Elite / event move</b>}
                          <br />
                          Charged: {m.charged.name}
                          {m.charged.limited && <b> · Elite / event move</b>}
                        </p>
                        {m.offType && <p className="small-note">Off-type attacker.</p>}
                        {m.mixedMoves && <p className="small-note">Mixed moveset.</p>}
                        {raidNotes(m.conditions).map((note) => (
                          <p className="small-note" key={note}>
                            {note}
                          </p>
                        ))}
                        <a href={m.source} target="_blank" rel="noreferrer">
                          GO Hub · {m.retrieved.slice(0, 10)}
                        </a>
                      </div>
                    ))
                  )}
                  {p.shadow && (
                    <p className="small-note">
                      Shadow form; artwork does not show Shadow effects. Frustration may need
                      removal during an eligible event.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
