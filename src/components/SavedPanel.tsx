import type { CollectionFlags, IVs, Settings, Species } from '../types';
import { Icon } from './Icon';

export type Saved = {
  id: string;
  speciesId: string;
  ivs: IVs;
  settings: Settings;
  flags: CollectionFlags;
  date: string;
  version: string;
  verdict: string;
};

export function SavedPanel({
  saved,
  byId,
  onAssess,
  onOpen,
  onRemove,
}: {
  saved: Saved[];
  byId: Map<string, Species>;
  onAssess: () => void;
  onOpen: (entry: Saved) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="saved-panel page-panel">
      <span className="eyebrow">YOUR FIELD NOTES</span>
      <h1>Worth a second look.</h1>
      <p className="intro">
        Saved assessments stay on this device. Open one to recalculate with the current snapshot.
      </p>
      {!saved.length ? (
        <div className="empty-state">
          <Icon name="save" size={32} />
          <h2>A home for your keepers.</h2>
          <p>Save an assessment to find it here later.</p>
          <button onClick={onAssess}>
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
                {s.ivs.join(' / ')} · Level {s.settings.maxLevel + (s.settings.bestBuddy ? 1 : 0)}{' '}
                max
              </p>
              <span className="small-note">Data {s.version}</span>
              <div>
                <button onClick={() => onOpen(s)}>
                  Open assessment <Icon name="arrow" size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Remove saved ${byId.get(s.speciesId)?.name ?? s.speciesId}`}
                  onClick={() => onRemove(s.id)}
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
