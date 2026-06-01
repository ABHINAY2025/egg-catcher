import React from 'react';
import { api } from './api.js';

export default function UsernameGate({ onPick, isMobile }) {
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [info, setInfo] = React.useState(null); // { exists, best }

  const validate = (v) => /^[A-Za-z0-9_\-]{2,16}$/.test(v);

  const submit = async (e) => {
    e?.preventDefault();
    const name = value.trim();
    if (!validate(name)) {
      setError('2–16 chars. Letters, numbers, _ or - only.');
      return;
    }
    if (!isMobile) {
      try { document.documentElement.requestFullscreen?.(); } catch {}
    }
    setBusy(true);
    setError('');
    try {
      const r = await fetch(api('/api/user/check'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name }),
      }).then((r) => r.json());
      if (!r.ok) throw new Error(r.error || 'check failed');
      setInfo({ exists: r.exists, best: r.best });
      onPick(name);
    } catch (err) {
      setError(err.message || 'Could not verify username. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <div className="gate__panel">
        <div className="gate__eyebrow">▸ ARCADE / EGG-CATCHER</div>
        <h1 className="gate__title">PICK YOUR <span className="accent-y">NAME</span></h1>
        <p className="gate__copy">
          Your best score will be saved to the global leaderboard.
          New name? You start at zero. Returning? We&rsquo;ll load your best.
        </p>

        <form className="gate__form" onSubmit={submit}>
          <label className="gate__label" htmlFor="u">Username</label>
          <input
            id="u"
            className="gate__input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. pixel_pirate"
            maxLength={16}
            autoFocus
            autoComplete="off"
            spellCheck="false"
          />
          <div className="gate__hint">2–16 characters. Letters, numbers, _ or - only.</div>
          {error && <div className="gate__err">✕ {error}</div>}
          {info?.exists && !error && (
            <div className="gate__ok">★ Welcome back — current best {info.best}</div>
          )}
          <button type="submit" className="gate__btn" disabled={busy}>
            {busy ? 'CHECKING…' : 'ENTER ARCADE ▸'}
          </button>
        </form>
      </div>
    </div>
  );
}
