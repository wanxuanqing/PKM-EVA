import type { MaxBattleEntry } from '../types';
export function MaxRoleDetails({
  entry,
  compact = false,
}: {
  entry: MaxBattleEntry;
  compact?: boolean;
}) {
  const Heading = compact ? 'h3' : 'h4';
  const Subheading = compact ? 'h4' : 'h5';
  return (
    <>
      {entry.roles.length > 0 && (
        <section className="suggested-moves" aria-label={entry.name + ' suggested Max attacks'}>
          <Heading>{compact ? 'Recommended Max attacks' : 'Suggested Max attacks'}</Heading>
          {compact && <span className="eyebrow">Attacker</span>}
          {entry.roles.map((role) => (
            <div className="raid-moveset" key={role.type}>
              <Subheading>
                {compact
                  ? role.type + ' · #' + role.rank + ' · ' + role.tier + ' tier'
                  : role.type + ' · ' + role.tier + ' tier · Type rank #' + role.rank}
              </Subheading>
              <dl>
                <div>
                  <dt>Fast move</dt>
                  <dd>
                    {role.fast.name}
                    {role.fast.limited && <b> · Elite / event move</b>}
                  </dd>
                </div>
                <div>
                  <dt>Max Attack</dt>
                  <dd>
                    {role.maxMove.name}
                    {role.maxMove.limited && <b> · Limited access</b>}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </section>
      )}
      {entry.support?.map((role) => (
        <section
          className="suggested-moves max-support-role"
          key={role.role}
          aria-label={entry.name + ' ' + role.role + ' recommendation'}
        >
          <Heading>
            {role.role} · {role.tier} tier
          </Heading>
          {role.role === 'Defender' ? (
            <>
              <p>
                Fast move options:{' '}
                {role.fastMoves.map((move, i) => (
                  <span key={move.name}>
                    {i > 0 && ' / '}
                    {move.name}
                    {move.limited && <b> · Elite / event move</b>}
                    {move.legacy && <b> · Legacy move</b>}
                    {!move.verified && <b> · Move availability unverified</b>}
                  </span>
                ))}
              </p>
              {role.resistances.length > 0 && (
                <p className="small-note">
                  Source-listed resistances: {role.resistances.join(', ')}.
                </p>
              )}
            </>
          ) : null}
          {role.notes.map((note) => (
            <p className="small-note" key={note}>
              {note}
            </p>
          ))}
          <a href={role.source} target="_blank" rel="noreferrer">
            GO Hub {role.role.toLowerCase()} tiers · retrieved {role.retrieved.slice(0, 10)}
          </a>
          {role.updated && (
            <p className="small-note">
              Source updated {role.updated.slice(0, 10)}. General tier; no order within a tier is
              implied.
            </p>
          )}
        </section>
      ))}
    </>
  );
}
