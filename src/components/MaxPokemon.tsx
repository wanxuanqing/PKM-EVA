import { useMemo, useState } from 'react';
import type { Catalog } from '../types';
import { maxPokemon, type MaxRoleFilter } from '../lib/maxPokemon';
import { MaxRoleDetails } from './MaxRoleDetails';
import { evolutionLines } from '../lib/topPokemon';
import { PokemonPicture } from './PokemonPicture';
export function MaxPokemon({ data }: { data: Catalog }) {
  const [type, setType] = useState('All');
  const [role, setRole] = useState<MaxRoleFilter>('Attacker');
  const entries = useMemo(() => maxPokemon(data, type, role), [data, type, role]);
  const byId = useMemo(() => new Map(data.species.map((p) => [p.id, p])), [data]);
  const lines = useMemo(
    () => new Map(entries.map((e) => [e.id, evolutionLines(data, e.speciesId)])),
    [data, entries],
  );
  const max = data.maxBattles;
  if (!max) return <p role="status">Max Battle rankings are not available in this snapshot.</p>;
  const group = role === 'Attacker' ? max.byType.find((t) => t.type === type) : undefined;
  const retrieved =
    role === 'Attacker'
      ? max.retrieved
      : (entries
          .flatMap((e) => (e.support ?? []).map((r) => r.retrieved))
          .sort()
          .at(-1) ?? max.retrieved);
  return (
    <section aria-label="Max Battle recommendations">
      <p>
        GO Hub Max Battle recommendations, with A tier and above evaluated separately for attackers,
        defenders and healers. Attackers use the top five per Max Move type; support roles use the
        general tier lists.
      </p>
      <div className="top-controls" role="group" aria-label="Max Battle role">
        {(['All', 'Attacker', 'Defender', 'Healer'] as const).map((value) => (
          <button
            key={value}
            aria-pressed={role === value}
            onClick={() => {
              setRole(value);
              setType('All');
            }}
          >
            {value === 'All' ? 'All roles' : value}
          </button>
        ))}
      </div>
      {role === 'Attacker' && (
        <label className="top-type">
          Max attack type{' '}
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option>All</option>
            {max.byType.map((t) => (
              <option key={t.type}>{t.type}</option>
            ))}
          </select>
        </label>
      )}
      <p className="small-note">
        Snapshot {retrieved.slice(0, 10)} · {entries.length} forms ·{' '}
        {entries.reduce((n, e) => n + e.roles.length + (e.support?.length ?? 0), 0)} role
        recommendations.{' '}
        {group && group.available < 5
          ? `Only ${group.available} options are listed for ${group.type}.`
          : role === 'Attacker' && type === 'All'
            ? max.byType
                .filter((t) => t.available < 5)
                .map((t) => `${t.type}: only ${t.available} listed options.`)
                .join(' ')
            : ''}
      </p>
      {role === 'Attacker' && type !== 'All' && !entries.length && (
        <p role="status">No A-tier-or-better options in this type's top five.</p>
      )}
      {role === 'Attacker' && (
        <p className="small-note">
          Up to five per type; lower tiers are retained in the source snapshot and omitted from
          recommendations. Useful paths also include A-tier-or-better targets beyond fifth place.
        </p>
      )}
      {(role === 'Attacker' || role === 'All') && <p>{max.benchmark}</p>}
      <p>
        Use a copy eligible for Max Battles with the matching form and move unlocks. An ordinary
        copy or an earlier evolution does not automatically have Max capability.
      </p>
      <div className="top-grid">
        {entries.map((entry) => {
          const base = byId.get(entry.speciesId)!;
          return (
            <article className="top-card max-card" key={entry.id} aria-label={entry.name}>
              <span className="eyebrow">
                {entry.mode === 'Special' ? 'Special Max Battle form' : entry.mode}
              </span>
              <h2>{entry.name}</h2>
              <div className="top-evolution small-note" aria-label="Evolution line">
                <strong>Evolution line: </strong>
                {lines.get(entry.id)?.length ? (
                  lines.get(entry.id)!.map((line) => (
                    <p key={line.species.map((p) => p.id).join('>')}>
                      {line.species.map((p) => p.name).join(' → ')}
                      {line.conditional && ' (conditions apply)'}
                    </p>
                  ))
                ) : (
                  <span>No earlier evolution listed.</span>
                )}
              </div>
              <PokemonPicture
                species={{ ...base, name: entry.name }}
                artwork={entry.artwork}
                appearanceNote={
                  entry.mode === 'Dynamax'
                    ? 'Dynamax enlargement and effects are not shown.'
                    : undefined
                }
              />
              <MaxRoleDetails entry={entry} compact />
            </article>
          );
        })}
      </div>
    </section>
  );
}
