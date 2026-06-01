import React from 'react';
import { api } from './api.js';

export default function Leaderboard({ username, lastResult, onPlayAgain, onChangeUser }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(api(`/api/leaderboard?limit=25&username=${encodeURIComponent(username)}`))
          .then((r) => r.json());
        if (!alive) return;
        if (!r.ok) throw new Error(r.error || 'failed');
        setData(r);
      } catch (e) {
        if (alive) setErr(e.message || 'Could not load leaderboard.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [username, lastResult]);

  const myRow = data?.me;
  const inTop = !!myRow && data?.top?.some((t) => t.username.toLowerCase() === username.toLowerCase());

  return (
    <div className="lb">
      <div className="lb__panel">
        <div className="lb__head">
          <div>
            <div className="eyebrow">▸ GLOBAL LEADERBOARD</div>
            <h1 className="lb__title">
              {lastResult ? (
                <>NICE ROUND, <span className="accent-y">{username}</span>!</>
              ) : (
                <>HALL OF <span className="accent-y">EGGS</span></>
              )}
            </h1>
          </div>
          <div className="lb__actions">
            <button className="tbtn" onClick={onPlayAgain}>▸ PLAY AGAIN</button>
            <button className="tbtn tbtn--ghost" onClick={onChangeUser}>↺ NEW USER</button>
          </div>
        </div>

        {lastResult && (
          <div className="lb__resultCard">
            <div className="lb__resultCell">
              <span className="lb__resultLabel">THIS ROUND</span>
              <span className="lb__resultNum">{lastResult.score}</span>
            </div>
            <div className="lb__resultCell">
              <span className="lb__resultLabel">YOUR BEST</span>
              <span className="lb__resultNum">{lastResult.best ?? '—'}</span>
            </div>
            <div className="lb__resultCell">
              <span className="lb__resultLabel">RANK</span>
              <span className="lb__resultNum">
                {lastResult.rank ? `#${lastResult.rank}` : '—'}
                {lastResult.total ? <span className="lb__resultSub"> of {lastResult.total}</span> : null}
              </span>
            </div>
          </div>
        )}

        {loading && <div className="lb__loading">loading scores…</div>}
        {err && <div className="lb__err">✕ {err}</div>}

        {data && (
          <>
            <div className="lb__tableHead">
              <span className="lb__col lb__col--rank">#</span>
              <span className="lb__col lb__col--name">PLAYER</span>
              <span className="lb__col lb__col--games">GAMES</span>
              <span className="lb__col lb__col--score">BEST</span>
            </div>
            <ol className="lb__rows">
              {data.top.length === 0 && (
                <li className="lb__empty">No scores yet — yours will be the first!</li>
              )}
              {data.top.map((row, i) => {
                const isMe = row.username.toLowerCase() === username.toLowerCase();
                return (
                  <li key={row.username} className={`lb__row ${isMe ? 'is-me' : ''}`}>
                    <span className={`lb__col lb__col--rank lb__rank lb__rank--${i + 1}`}>
                      {i + 1}
                    </span>
                    <span className="lb__col lb__col--name">
                      {row.username}{isMe ? <span className="lb__mePill">YOU</span> : null}
                    </span>
                    <span className="lb__col lb__col--games">{row.games}</span>
                    <span className="lb__col lb__col--score">{row.best}</span>
                  </li>
                );
              })}
            </ol>

            {myRow && !inTop && (
              <>
                <div className="lb__dots">· · ·</div>
                <ol className="lb__rows lb__rows--solo">
                  <li className="lb__row is-me">
                    <span className="lb__col lb__col--rank">{myRow.rank}</span>
                    <span className="lb__col lb__col--name">
                      {myRow.username}<span className="lb__mePill">YOU</span>
                    </span>
                    <span className="lb__col lb__col--games">{myRow.games}</span>
                    <span className="lb__col lb__col--score">{myRow.best}</span>
                  </li>
                </ol>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
