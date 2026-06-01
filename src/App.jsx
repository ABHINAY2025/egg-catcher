import React from 'react';
import UsernameGate from './UsernameGate.jsx';
import Game from './Game.jsx';
import MobileGame from './MobileGame.jsx';
import Leaderboard from './Leaderboard.jsx';

function detectMobile() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isTouch = (navigator.maxTouchPoints || 0) > 0;
  const isPhoneUA = /Android|iPhone|iPod|Mobile/i.test(ua);
  const isSmall = window.innerWidth < 820;
  return isPhoneUA || (isTouch && isSmall);
}

export default function App() {
  const [username, setUsername] = React.useState(() => {
    try { return localStorage.getItem('egg-username') || ''; } catch { return ''; }
  });
  const [mode, setMode] = React.useState(() => detectMobile() ? 'mobile' : 'desktop');
  const [view, setView] = React.useState('play');
  const [lastResult, setLastResult] = React.useState(null);

  // room hoisted here so Play Again reuses the same room (controller stays paired)
  const [roomId, setRoomId] = React.useState(null);
  const [lanIp, setLanIp] = React.useState(null);
  const [ipCandidates, setIpCandidates] = React.useState([]);

  React.useEffect(() => {
    const onResize = () => setMode(detectMobile() ? 'mobile' : 'desktop');
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  React.useEffect(() => {
    if (mode !== 'desktop' || roomId) return;
    let alive = true;
    (async () => {
      try {
        const r1 = await fetch('/api/game/room', { method: 'POST' }).then((r) => r.json());
        if (!alive) return;
        setRoomId(r1.roomId);
        if (import.meta.env.PROD) return; // in prod, controller URL = window.location.origin
        try {
          const r2 = await fetch('/api/game/local-ip').then((r) => r.json());
          if (!alive) return;
          setLanIp(r2.ip);
          setIpCandidates(Array.isArray(r2.candidates) ? r2.candidates : []);
        } catch {}
      } catch {}
    })();
    return () => { alive = false; };
  }, [mode, roomId]);

  const onPickUsername = (name) => {
    try { localStorage.setItem('egg-username', name); } catch {}
    setUsername(name);
  };

  const onGameOver = (result) => {
    setLastResult(result);
    setView('board');
  };

  const playAgain = () => {
    setLastResult(null);
    setView('play');
  };

  const changeUser = () => {
    try { localStorage.removeItem('egg-username'); } catch {}
    setUsername('');
    setLastResult(null);
    setView('play');
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
  };

  if (!username) {
    return <UsernameGate onPick={onPickUsername} isMobile={mode === 'mobile'} />;
  }

  if (view === 'board') {
    return (
      <Leaderboard
        username={username}
        lastResult={lastResult}
        onPlayAgain={playAgain}
        onChangeUser={changeUser}
      />
    );
  }

  return (
    <div className="app-shell">
      <TopBar
        username={username}
        mode={mode}
        onSeeBoard={() => setView('board')}
        onChangeUser={changeUser}
        onToggleMode={() => setMode((m) => (m === 'mobile' ? 'desktop' : 'mobile'))}
      />
      {mode === 'mobile' ? (
        <MobileGame username={username} onGameOver={onGameOver} />
      ) : (
        <Game
          username={username}
          onGameOver={onGameOver}
          roomId={roomId}
          lanIp={lanIp}
          ipCandidates={ipCandidates}
          onSetLanIp={setLanIp}
        />
      )}
    </div>
  );
}

function TopBar({ username, mode, onSeeBoard, onChangeUser, onToggleMode }) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__logo" aria-hidden="true">
          <span>E</span><span>G</span><span>G</span>
        </span>
        <span className="topbar__title">EGG-CATCHER</span>
      </div>
      <div className="topbar__user">
        <span className="topbar__userTag">▸ PLAYER</span>
        <span className="topbar__userName">{username}</span>
      </div>
      <div className="topbar__actions">
        <button className="tbtn tbtn--alt" onClick={onToggleMode} title="Switch device mode">
          {mode === 'mobile' ? '▣ DESKTOP' : '▢ MOBILE'}
        </button>
        <button className="tbtn" onClick={onSeeBoard}>★ LEADERBOARD</button>
        <button className="tbtn tbtn--ghost" onClick={onChangeUser}>↺ NEW USER</button>
      </div>
    </header>
  );
}
