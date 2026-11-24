import { copyGender } from '../lib/assessment';
import { validLevel } from '../lib/calculator';
import type { CollectionFlags, Settings, Species } from '../types';
import { Icon } from './Icon';

export function SettingsPanels({
  selected,
  settings,
  flags,
  currentLevel,
  maxLevel,
  threshold,
  levelValid,
  maxValid,
  thresholdValid,
  onChangeSettings,
  onChangeFlags,
  onChangeCurrentLevel,
  onChangeMaxLevel,
  onChangeThreshold,
}: {
  selected: Species;
  settings: Settings;
  flags: CollectionFlags;
  currentLevel: string;
  maxLevel: string;
  threshold: string;
  levelValid: boolean;
  maxValid: boolean;
  thresholdValid: boolean;
  onChangeSettings: (updater: (s: Settings) => Settings) => void;
  onChangeFlags: (updater: (f: CollectionFlags) => CollectionFlags) => void;
  onChangeCurrentLevel: (value: string) => void;
  onChangeMaxLevel: (value: string) => void;
  onChangeThreshold: (value: string) => void;
}) {
  return (
    <>
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
                onChange={(e) => onChangeCurrentLevel(e.target.value)}
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
                  onChangeMaxLevel(e.target.value);
                  if (validLevel(Number(e.target.value)) && Number(e.target.value) <= 50)
                    onChangeSettings((s) => ({ ...s, maxLevel: Number(e.target.value) }));
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
              onChange={(e) => onChangeSettings((s) => ({ ...s, bestBuddy: e.target.checked }))}
            />
            <span>
              Best Buddy boost
              <small>
                Effective maximum: level {settings.maxLevel + (settings.bestBuddy ? 1 : 0)}
              </small>
            </span>
          </label>
          <p className="small-note">
            If known, enter the copy’s effective current level, including any active buddy boost.
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
                onChangeThreshold(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value !== '' && Number.isFinite(n) && n >= 0 && n <= 100)
                  onChangeSettings((s) => ({ ...s, threshold: n }));
              }}
              aria-invalid={!thresholdValid}
            />
          </label>
          {!thresholdValid && <p className="field-error">Use a threshold from 0 to 100.</p>}
          <p className="small-note">
            IV percentile must be strictly above this value. 95% is the app default, separate from
            your overall-IV rule.
          </p>
          <label className="stack-label">
            IV comparison floor
            <select
              value={settings.floor}
              onChange={(e) => onChangeSettings((s) => ({ ...s, floor: Number(e.target.value) }))}
            >
              {[0, 1, 2, 3, 4, 5, 10, 12, 15].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'All IVs · 0–15 (default)' : `Each IV at least ${n}`}
                </option>
              ))}
            </select>
          </label>
          <p className="small-note">
            All IVs includes theoretical spreads even when a species cannot be acquired with them.
            No acquisition floor is applied silently.
          </p>
          <label className="stack-label">
            Gender
            <select
              value={copyGender(selected, settings.gender)}
              disabled={!!selected.gender?.fixed}
              onChange={(e) =>
                onChangeSettings((s) => ({
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
              onChange={(e) => onChangeSettings((s) => ({ ...s, eventPaths: e.target.checked }))}
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
            Only you know what makes this copy special. These flags are never inferred from the
            species.
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
                  onChange={(e) => onChangeFlags((f) => ({ ...f, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={flags.alreadyTraded}
              onChange={(e) => onChangeFlags((f) => ({ ...f, alreadyTraded: e.target.checked }))}
            />
            <span>
              Already traded<small>A Pokémon cannot be traded again.</small>
            </span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={flags.ordinaryExtra}
              onChange={(e) => onChangeFlags((f) => ({ ...f, ordinaryExtra: e.target.checked }))}
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
              Some costumes cannot evolve. Confirm the exact copy’s evolution options in the game.
            </p>
          )}
        </div>
      </details>
    </>
  );
}
