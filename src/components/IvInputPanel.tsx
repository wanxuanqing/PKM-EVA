import { useRef, useState } from 'react';
import { parseIVs } from '../lib/calculator';
import type { IVs } from '../types';
import { Icon } from './Icon';

export function IvInputPanel({
  fields,
  ivs,
  overall,
  edited,
  onChangeFields,
  onEdited,
}: {
  fields: string[];
  ivs: IVs | null;
  overall: number;
  edited: boolean;
  onChangeFields: (next: string[]) => void;
  onEdited: () => void;
}) {
  const ivInputs = useRef<(HTMLInputElement | null)[]>([]);
  const [paste, setPaste] = useState('');
  const [pasteError, setPasteError] = useState('');

  function applyPaste(value: string) {
    const parsed = parseIVs(value);
    if (!parsed) {
      setPasteError('Use three integers from 0 to 15, for example 1/12/13.');
      return;
    }
    onChangeFields(parsed.map(String));
    onEdited();
    setPaste('');
    setPasteError('');
  }

  return (
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
              ref={(element) => {
                ivInputs.current[i] = element;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              value={fields[i]}
              aria-invalid={!/^\d{1,2}$/.test(fields[i]) || Number(fields[i]) > 15}
              aria-describedby={!ivs ? 'iv-error' : undefined}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const value = e.target.value;
                onChangeFields(fields.map((v, n) => (n === i ? value : v)));
                onEdited();
                if (/^\d{2}$/.test(value) && Number(value) <= 15) {
                  ivInputs.current[i + 1]?.focus();
                }
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
      <p className="small-note">Two valid digits move to the next IV field.</p>
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
          <abbr title="(Attack + Defense + HP IVs) / 45. This is not a percentile.">ⓘ</abbr>
        </span>
        <b>{ivs ? `${overall.toFixed(1)}%` : '—'}</b>
      </div>
      {!edited && <p className="example-note">Example IVs are loaded. Edit them for your copy.</p>}
    </div>
  );
}
