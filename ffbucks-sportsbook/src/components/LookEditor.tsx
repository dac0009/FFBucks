import { useMemo, useState } from 'react';
import { useLook, type Look } from '../lib/lookContext';
import {
  COLOR_FIELDS, COPY, DEFAULT_THEME, FONTS, PRESETS, cleanCopy, isColor, placeholders, readabilityWarnings, themeChanges,
} from '../lib/look.mjs';

type Tab = 'colors' | 'fonts' | 'wording';
const SERIF = ['Newsreader', 'Playfair Display', 'Libre Baskerville', 'Old Standard TT', 'Libre Caslon Text', 'Georgia'];

function same(a: Look, b: Look) {
  return JSON.stringify([themeChanges(a.theme), cleanCopy(a.copy)]) === JSON.stringify([themeChanges(b.theme), cleanCopy(b.copy)]);
}

/** Commissioner-only. Changes show live; nobody else sees them until saved. */
export default function LookEditor({ onClose }: { onClose: () => void }) {
  const { saved, draft, setDraft, save, restore, hasPrevious } = useLook();
  const look = draft ?? saved;
  const [tab, setTab] = useState<Tab>('colors');
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const dirty = draft !== null && !same(draft, saved);
  const theme = { ...DEFAULT_THEME, ...look.theme };
  const warnings = readabilityWarnings(look.theme);

  const edit = (next: Partial<Look>) => { setNote(''); setError(''); setDraft({ theme: { ...look.theme }, copy: { ...look.copy }, ...next }); };
  const setColor = (key: string, value: string) => edit({ theme: { ...look.theme, [key]: value } });
  const setText = (key: string, value: string) => {
    const copy = { ...look.copy };
    if (value === COPY[key as keyof typeof COPY].text) delete copy[key]; else copy[key] = value;
    edit({ copy });
  };

  async function onSave() {
    setBusy(true); setError('');
    const problem = await save();
    setBusy(false);
    if (problem) setError(problem); else setNote('Saved. Everyone sees the new look now.');
  }
  async function onUndo() {
    setBusy(true); setError('');
    const problem = await restore();
    setBusy(false);
    if (problem) setError(problem); else setNote('Back to the version before your last save.');
  }
  function close() {
    if (dirty && !confirmClose) { setConfirmClose(true); return; }
    setDraft(null);
    onClose();
  }

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = new Map<string, string[]>();
    for (const [key, item] of Object.entries(COPY)) {
      const current = look.copy[key] ?? item.text;
      if (q && !`${item.label} ${item.text} ${current}`.toLowerCase().includes(q)) continue;
      out.set(item.group, [...(out.get(item.group) ?? []), key]);
    }
    return out;
  }, [search, look.copy]);

  return (
    <aside className="look-editor" aria-label="Look editor">
      <header className="le-head">
        <div>
          <p className="le-kicker">Commissioner only</p>
          <h2>Edit the look</h2>
        </div>
        <button className="le-x" onClick={close} aria-label="Close the look editor">×</button>
      </header>
      <p className="le-hint">Changes show on the page as you make them. Nobody else sees them until you press <b>Save for everyone</b>.</p>
      {confirmClose && (
        <div className="le-confirm" role="alert">
          You have unsaved changes.
          <button className="btn-small" onClick={close}>Close and throw them away</button>
          <button className="linkish" onClick={() => setConfirmClose(false)}>Keep editing</button>
        </div>
      )}

      <div className="tabs le-tabs" role="tablist">
        {(['colors', 'fonts', 'wording'] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {k === 'colors' ? 'Colors' : k === 'fonts' ? 'Fonts' : 'Wording'}
          </button>
        ))}
      </div>

      <div className="le-body">
        {tab === 'colors' && (
          <>
            <p className="le-label">Start from a style</p>
            <div className="le-presets">
              {Object.entries(PRESETS).map(([name, preset]) => (
                <button key={name} className="le-preset" onClick={() => edit({ theme: { ...preset } })}>
                  <span className="le-swatches" aria-hidden="true">
                    {[preset.masthead_bg, preset.bg, preset.ink, preset.accent, preset.highlight].map((c, i) => <i key={i} style={{ background: c }} />)}
                  </span>
                  {name}
                </button>
              ))}
            </div>
            {['Paper', 'Ink', 'Masthead'].map((group) => (
              <fieldset key={group} className="le-group">
                <legend>{group}</legend>
                {COLOR_FIELDS.filter((f) => f.group === group).map((f) => (
                  <ColorRow key={f.key} label={f.label} value={theme[f.key as keyof typeof theme]}
                    changed={theme[f.key as keyof typeof theme] !== DEFAULT_THEME[f.key as keyof typeof DEFAULT_THEME]}
                    onChange={(v) => setColor(f.key, v)}
                    onReset={() => setColor(f.key, DEFAULT_THEME[f.key as keyof typeof DEFAULT_THEME])} />
                ))}
              </fieldset>
            ))}
          </>
        )}

        {tab === 'fonts' && (
          <>
            <FontPick label="Headlines and numbers" value={theme.font_display} onChange={(v) => edit({ theme: { ...look.theme, font_display: v } })}
              sample="Mothman for MVP −19.5" display />
            <FontPick label="Body text" value={theme.font_body} onChange={(v) => edit({ theme: { ...look.theme, font_body: v } })}
              sample="Every bet in the league. Tail to copy one, fade to take the other side." />
            <p className="fine">For the old newspaper feel, a serif for headlines (Newsreader, Old Standard, Caslon) with Inter or Baskerville for the body works well.</p>
          </>
        )}

        {tab === 'wording' && (
          <>
            <input className="le-search" placeholder="Find wording…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find wording" />
            {[...groups.entries()].map(([group, keys]) => (
              <fieldset key={group} className="le-group">
                <legend>{group}</legend>
                {keys.map((key) => {
                  const item = COPY[key as keyof typeof COPY];
                  const value = look.copy[key] ?? item.text;
                  const parts = placeholders(key);
                  const long = item.text.length > 60;
                  return (
                    <label key={key} className="le-text">
                      <span className="le-text-label">
                        {item.label}
                        {value !== item.text && <button type="button" className="linkish" onClick={() => setText(key, item.text)}>Use original</button>}
                      </span>
                      {long
                        ? <textarea rows={3} value={value} maxLength={500} onChange={(e) => setText(key, e.target.value)} />
                        : <input value={value} maxLength={500} onChange={(e) => setText(key, e.target.value)} />}
                      {parts.length > 0 && <span className="fine">Fills in automatically: {parts.join(', ')}</span>}
                      {!value.trim() && <span className="fine">Left blank, the original wording is used.</span>}
                    </label>
                  );
                })}
              </fieldset>
            ))}
            {groups.size === 0 && <p className="empty">Nothing matches “{search}”.</p>}
            <p className="fine">The “Play money only” notice and the fine print under it can’t be changed. They keep the book legal.</p>
          </>
        )}
      </div>

      <footer className="le-foot">
        {warnings.length > 0 && (
          <div className="le-warn" role="status">
            Hard to read: {warnings.map((w) => w.label.toLowerCase()).join('; ')}. Try a darker or lighter color.
          </div>
        )}
        {note && <p className="ok" role="status">{note}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row">
          <button className="btn" disabled={!dirty || busy} onClick={onSave}>Save for everyone</button>
          <button className="btn-small" disabled={!dirty || busy} onClick={() => { setDraft(null); setNote('Changes thrown away.'); }}>Discard changes</button>
        </div>
        <div className="row le-more">
          {hasPrevious && <button className="linkish" disabled={busy} onClick={onUndo}>Undo last save</button>}
          {!confirmReset
            ? <button className="linkish" onClick={() => setConfirmReset(true)}>Start over from the original look</button>
            : <>
                <button className="linkish" onClick={() => { edit({ theme: {}, copy: {} }); setConfirmReset(false); }}>Yes, reset colors, fonts and wording</button>
                <button className="linkish" onClick={() => setConfirmReset(false)}>Cancel</button>
              </>}
        </div>
      </footer>
    </aside>
  );
}

function ColorRow({ label, value, changed, onChange, onReset }: { label: string; value: string; changed: boolean; onChange: (v: string) => void; onReset: () => void }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : value;
  return (
    <div className="le-color">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} color picker`} />
      <span className="le-color-label">{label}</span>
      <input className="le-hex" value={shown} maxLength={7} aria-label={`${label} color code`}
        onFocus={() => { setText(value); setFocused(true); }}
        onBlur={() => setFocused(false)}
        onChange={(e) => { const v = e.target.value.trim(); setText(v); if (isColor(v)) onChange(v.toLowerCase()); }} />
      {changed ? <button className="linkish" onClick={onReset} title="Back to the original color">Reset</button> : <span className="le-spacer" />}
    </div>
  );
}

function FontPick({ label, value, onChange, sample, display }: { label: string; value: string; onChange: (v: string) => void; sample: string; display?: boolean }) {
  return (
    <div className="le-font">
      <label className="le-text">
        <span className="le-text-label">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <optgroup label="Newspaper serifs">
            {Object.keys(FONTS).filter((f) => SERIF.includes(f)).map((f) => <option key={f}>{f}</option>)}
          </optgroup>
          <optgroup label="Clean sans">
            {Object.keys(FONTS).filter((f) => !SERIF.includes(f)).map((f) => <option key={f}>{f}</option>)}
          </optgroup>
        </select>
      </label>
      <p className={display ? 'le-sample le-sample-display' : 'le-sample'} style={{ fontFamily: FONTS[value as keyof typeof FONTS].stack }}>{sample}</p>
    </div>
  );
}
