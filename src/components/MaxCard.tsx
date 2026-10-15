import type { Catalog, Option } from '../types';
import { MaxRoleDetails } from './MaxRoleDetails';
export function MaxCard({
  option,
  data,
  overall,
}: {
  option: Option;
  data: Catalog;
  overall: number;
}) {
  const entry = option.max!;
  return (
    <article className="result-card role-Max" aria-label={entry.name + ' Max Battles'}>
      <div className="result-top">
        <span className="league-badge">
          Max Battles · {entry.mode === 'Special' ? 'Special form' : entry.mode}
        </span>
        <span className="species-rank">
          {[...new Set([...entry.roles, ...(entry.support ?? [])].map((r) => r.tier))].join(' / ')}{' '}
          tier
        </span>
      </div>
      <div className="target-title">
        <div>
          <span className="target-path">
            {option.path.length > 1 ? 'MAX VALUE VIA EVOLUTION' : 'MAX VALUE FOR THIS SPECIES'}
          </span>
          <h3>{entry.name}</h3>
        </div>
        <span className="status-pill">Check Max capability</span>
      </div>
      <p className="path">
        <b>Path</b>{' '}
        {option.path.map((id) => data.species.find((p) => p.id === id)?.name ?? id).join(' → ')}
      </p>
      <p>
        GO Hub A tier or above. This is a potential role for a copy with the matching Max
        capability.
      </p>
      <p className="small-note">
        Overall IVs: {overall.toFixed(1)}%. No IV cutoff is applied to these sourced Max role tiers.
      </p>
      <p className="small-note">
        Roles:{' '}
        {[
          ...(entry.roles.length ? ['Attacker'] : []),
          ...(entry.support ?? []).map((role) => role.role + ' · ' + role.tier + ' tier'),
        ].join(' / ')}
      </p>
      <details className="result-details">
        <summary>Details & requirements</summary>
        <div className="detail-content">
          <ul>
            {[...new Set(option.requirements)].map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <MaxRoleDetails entry={entry} />
          {entry.roles.length > 0 && <p>{data.maxBattles?.benchmark}</p>}
          <p>
            Gigantamax roles apply only to matching Gigantamax-capable copies. A Dynamax evolution
            path does not create a Gigantamax copy. The Max Battle capable collection flag preserves
            collection value; it does not confirm a specific Max form.
          </p>
        </div>
      </details>
    </article>
  );
}
