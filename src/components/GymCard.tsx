import type { Option } from '../types';
import { gymReviewed, gymSource, gymTier } from '../lib/gym';

export function GymCard({ option }: { option: Option }) {
  const p = option.species;
  return (
    <article className="result-card role-Gym" aria-label={`${p.name} Gym Defense`}>
      <div className="result-top">
        <span className="league-badge league-Gym">Gym Defense</span>
        <span className="species-rank">{gymTier(p)} tier · species bulk</span>
      </div>
      <div className="target-title">
        <div>
          <span className="target-path">
            {option.path.length > 1 ? 'EVOLUTION / FORM OPTION' : 'THIS FORM'}
          </span>
          <h3>{p.name}</h3>
        </div>
        <span className={`status-pill ${option.conditional ? '' : 'good'}`}>
          {option.conditional ? 'Check conditions' : 'Useful defender'}
        </span>
      </div>
      <p>No minimum IV percentage required. Consider keeping a defender before transferring.</p>
      {option.conditional && (
        <p className="inline-warning">
          Confirm the evolution conditions before relying on this target.
        </p>
      )}
      <details className="result-details">
        <summary>Details & requirements</summary>
        <div className="detail-content">
          <p>
            GO Hub's S/A+ shortlist uses base Defense × Stamina. This is a species rating, not an IV
            percentile or a simulation of gym battles.
          </p>
          <p>
            Typing, moves, motivation decay, level, gym activity and the surrounding defenders can
            change actual performance. This role does not recommend powering up every copy.
          </p>
          {option.requirements.length > 0 && (
            <ul>
              {[...new Set(option.requirements)].map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <p>
            Placement also requires an available slot in a friendly gym and no defender of the same
            species already there. Confirm this copy can be placed in-game.
          </p>
          <p>
            Normal types are allowed for gym defense. Shadow, costume and temporary forms do not
            inherit this shortlist's ratings.
          </p>
          <p className="source-line">
            <a href={gymSource} target="_blank" rel="noreferrer">
              GO Hub gym-defense tiers ↗
            </a>{' '}
            · reviewed {gymReviewed}
          </p>
        </div>
      </details>
    </article>
  );
}
