import type { Catalog, Option, Settings } from '../types';
import { Icon } from './Icon';
import { sourceURL } from '../lib/data';
export const leagueNames = {
  GL: 'Great League',
  UL: 'Ultra League',
  ML: 'Master League',
  Raid: 'Raids',
};
const iv = (values: number[]) => values.join(' / ');
export function ResultCard({
  option,
  settings,
  data,
  overall,
}: {
  option: Option;
  settings: Settings;
  data: Catalog;
  overall: number;
}) {
  const { species: p, role, result: r } = option;
  const isRaid = role === 'Raid';
  const score = isRaid || role === 'ML' ? overall : r?.percentile;
  const qualified =
    score !== undefined &&
    score !== null &&
    score > (isRaid || role === 'ML' ? 90 : settings.threshold);
  const blocked = option.conditional || r?.overCap || r?.aboveMax || (!r?.inPool && !isRaid);
  const unverified = isRaid && option.raid?.source === 'input-csv';
  const badge = unverified
    ? 'Verify raid value'
    : blocked
      ? 'Check conditions'
      : qualified
        ? 'Meets preference'
        : 'Below preference';
  const source = sourceURL(data, isRaid ? option.raid!.source : 'pvpoke');
  return (
    <article className={`result-card role-${role}`} aria-label={`${p.name} ${leagueNames[role]}`}>
      <div className="result-top">
        <span className={`league-badge league-${role}`}>
          <Icon name={isRaid ? 'bolt' : 'shield'} size={15} />
          {leagueNames[role]}
          {role === 'GL' ? ' · 1,500' : role === 'UL' ? ' · 2,500' : ''}
        </span>
        <span className="species-rank">
          {isRaid
            ? option.raid?.tier === 'strong'
              ? 'Strong option'
              : option.raid?.tier === 'budget'
                ? 'Budget candidate'
                : 'Unverified candidate'
            : `Species #${option.ranking?.rank}`}
        </span>
      </div>
      <div className="target-title">
        <div>
          <span className="target-path">
            {option.path.length > 1 ? 'EVOLUTION / FORM OPTION' : 'THIS FORM'}
          </span>
          <h3>{p.name}</h3>
        </div>
        <span className={`status-pill ${qualified && !blocked && !unverified ? 'good' : ''}`}>
          <Icon name={qualified && !blocked && !unverified ? 'check' : 'info'} size={14} />
          {badge}
        </span>
      </div>
      {(isRaid || role === 'ML') && (
        <div className="raid-metrics">
          <div>
            <span className="metric-label">Overall IVs (sum / 45)</span>
            <strong>
              {overall.toFixed(1)}
              <small>%</small>
            </strong>
          </div>
          <div>
            <span className="metric-label">Ideal IVs</span>
            <b>15 / 15 / 15</b>
          </div>
        </div>
      )}
      {!isRaid &&
        (r ? (
          <div className="card-metrics">
            <div className="percentile-metric">
              <span className="metric-label">Stat-product percentile</span>
              <strong>
                {r.percentile === null ? '—' : r.percentile.toFixed(2)}
                {r.percentile !== null && <small>%</small>}
              </strong>
              <div className="meter">
                <span style={{ width: `${r.percentile ?? 0}%` }} />
              </div>
            </div>
            <div>
              <span className="metric-label">IV rank (stat product)</span>
              <b>{r.rank === null ? '—' : `#${r.rank.toLocaleString()}`}</b>
              <small className="pool-size">of {r.poolSize.toLocaleString()}</small>
            </div>
            <div>
              <span className="metric-label">Ideal IVs</span>
              <b className="ideal-ivs">{r.ideals[0] ? iv(r.ideals[0].ivs) : 'Unavailable'}</b>
              {r.ideals.length > 1 && (
                <small className="pool-size">+{r.ideals.length - 1} tied</small>
              )}
            </div>
          </div>
        ) : (
          <div className="calculating">Comparing IV combinations…</div>
        ))}
      <p className="small-note">
        IV preference:{' '}
        {isRaid || role === 'ML'
          ? 'overall IVs strictly above 90% (at least 41/45).'
          : `stat-product percentile strictly above ${settings.threshold}%.`}
        {role === 'ML' &&
          ' Percentile and rank compare this form’s IV spreads, not the IV sum or raid damage.'}
      </p>
      {r?.overCap && (
        <p className="inline-warning">
          Already over the cap: this target would be CP {r.currentCP?.toLocaleString()} at your
          current level. It cannot be powered down.
        </p>
      )}
      {r?.aboveMax && (
        <p className="inline-warning">
          Your current level exceeds the chosen maximum. Raise the maximum to assess this copy’s
          reachable build.
        </p>
      )}
      {r?.reason && <p className="inline-warning">{r.reason}</p>}
      {option.conditional && (
        <p className="inline-warning">
          This path has a condition or uncertain outcome. Check the requirements below.
        </p>
      )}
      {option.requirements.some((note) => /^(male|female) only$/i.test(note)) && (
        <p className="small-note">
          Evolution gender:{' '}
          {[
            ...new Set(
              option.requirements
                .filter((note) => /^(male|female) only$/i.test(note))
                .map((note) => note.toLowerCase()),
            ),
          ].join(' · ')}
          {settings.gender === 'unknown' ? ' — confirm your copy’s gender.' : '.'}
        </p>
      )}
      <details className="result-details">
        <summary>
          Details & requirements <Icon name="chevron" size={16} />
        </summary>
        <div className="detail-content">
          {!isRaid && r?.stats && (
            <>
              <div className="detail-grid">
                <div>
                  <span>% of ideal stat product</span>
                  <b>{r.idealPercent?.toFixed(3)}%</b>
                </div>
                <div>
                  <span>Target CP / level</span>
                  <b>
                    {r.stats.cp.toLocaleString()} / {r.stats.level}
                  </b>
                </div>
                <div>
                  <span>Attack / Defense / HP</span>
                  <b>
                    {r.stats.atk.toFixed(3)} / {r.stats.def.toFixed(3)} / {r.stats.hp}
                  </b>
                </div>
                <div>
                  <span>Comparison pool</span>
                  <b>
                    {settings.floor === 0 ? 'All IVs (0–15)' : `IV floor ${settings.floor}`} ·{' '}
                    {r.poolSize.toLocaleString()} eligible
                  </b>
                </div>
              </div>
              <p className="small-note">
                Minimum level {p.minLevel}; maximum{' '}
                {settings.maxLevel + (settings.bestBuddy ? 1 : 0)}. Current level does not change
                the theoretical comparison pool. Stat product is not a battle-win percentage.
              </p>
              {r.ideals.length > 1 && (
                <p className="small-note">
                  <b>All tied ideal IVs:</b> {r.ideals.map((x) => iv(x.ivs)).join(' · ')}
                </p>
              )}
            </>
          )}
          {option.path.length > 1 && (
            <p className="path">
              <b>Path</b>{' '}
              {option.path
                .map((id) => data.species.find((s) => s.id === id)?.name ?? id)
                .join(' → ')}
            </p>
          )}
          {option.requirements.length > 0 && (
            <ul className="requirements">
              {[...new Set(option.requirements)].map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
          {!isRaid && (
            <section className="suggested-moves" aria-label="Suggested PvP moves">
              <h4>Suggested PvP moves</h4>
              <p>
                {option.ranking?.moves.length
                  ? option.ranking.moves
                      .map((m) => `${m.name}${m.elite ? ' *' : ''}${m.legacy ? ' †' : ''}`)
                      .join(' · ')
                  : 'Moves not yet verified. No sourced moveset is available for this league in the current data.'}
              </p>
              {option.ranking?.moves.some((m) => m.elite) && (
                <p className="small-note">* Elite TM or event access may be required.</p>
              )}
              {option.ranking?.moves.some((m) => m.legacy) && (
                <p className="small-note">† Legacy availability needs verification.</p>
              )}
            </section>
          )}
          {isRaid && (
            <>
              <p>{option.raid?.evidence}</p>
              {option.raid?.types.length !== 0 && (
                <p>
                  <b>Attacking types:</b> {option.raid?.types.join(', ')}
                </p>
              )}
              <section className="suggested-moves" aria-label="Suggested raid moves">
                <h4>Suggested raid moves</h4>
                {option.raid?.moves?.length ? (
                  option.raid.moves.map((move, i) => {
                    // Preserve source text if a future snapshot has an unfamiliar format.
                    // Only the exact importer separator is split; move markers stay intact.
                    const parts = /^([^:]+): (.+) \+ (.+)$/.exec(move);
                    return parts ? (
                      <div className="raid-moveset" key={`${i}:${move}`}>
                        <h5>{parts[1]} attacking role</h5>
                        <dl>
                          <div>
                            <dt>Fast move</dt>
                            <dd>{parts[2]}</dd>
                          </div>
                          <div>
                            <dt>Charged move</dt>
                            <dd>{parts[3]}</dd>
                          </div>
                        </dl>
                      </div>
                    ) : (
                      <p key={`${i}:${move}`}>{move}</p>
                    );
                  })
                ) : option.raid?.moveReview ? (
                  <p>
                    {option.raid.moveReview.reason}{' '}
                    <a href={option.raid.moveReview.source} target="_blank" rel="noreferrer">
                      GO Hub moves review ↗
                    </a>
                  </p>
                ) : (
                  <p>
                    Moves not yet verified. No sourced raid moveset is available for this candidate
                    in the current data.
                  </p>
                )}
              </section>
              <p className="small-note">
                Moves are source-listed recommendations; * marks limited move access. Raid
                effectiveness depends on moves, opponent, level, weather and party conditions. There
                is no raid IV percentile here.
              </p>
            </>
          )}
          {p.shadow && (
            <p className="small-note">
              Shadow damage modifiers do not change CP or this IV rank. Frustration may need removal
              during an eligible event. Shadows cannot be traded or Mega Evolved.
            </p>
          )}
          {p.notes.map((n) => (
            <p className="small-note" key={n}>
              {n}
            </p>
          ))}
          <p className="source-line">
            {source?.startsWith('https://') ? (
              <a href={source} target="_blank" rel="noreferrer">
                {isRaid ? 'Raid evidence' : 'PvPoke overall ranking'} ↗
              </a>
            ) : (
              <span>Unverified input catalog</span>
            )}{' '}
            · retrieved{' '}
            {isRaid
              ? option.raid?.reviewed || data.retrieved.slice(0, 10)
              : data.retrieved.slice(0, 10)}
          </p>
        </div>
      </details>
    </article>
  );
}
