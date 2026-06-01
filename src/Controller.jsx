import React from 'react';
import { api } from './api.js';

const ROUND_MS = 60_000;

function send(roomId, action) {
  fetch(api('/api/game/control'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, action }),
  }).catch(() => {});
}

function isLandscape() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(orientation: landscape)').matches;
}

export default function Controller() {
  const params = new URLSearchParams(window.location.search);
  const roomId = (params.get('room') || '').toUpperCase();

  const [paired, setPaired] = React.useState(false);
  const [score, setScore] = React.useState(0);
  const [timeLeft, setTimeLeft] = React.useState(null);
  const [running, setRunning] = React.useState(false);
  const [landscape, setLandscape] = React.useState(isLandscape());
  const [armed, setArmed] = React.useState(false);

  React.useEffect(() => {
    if (!roomId) return;
    const es = new EventSource(api(`/api/game/controller-events/${roomId}`));
    es.addEventListener('ready', (e) => {
      try { setPaired(JSON.parse(e.data).paired); } catch {}
    });
    es.addEventListener('paired', () => setPaired(true));
    es.addEventListener('state', (e) => {
      try {
        const s = JSON.parse(e.data);
        if (typeof s.score === 'number') setScore(s.score);
        if (typeof s.timeLeft === 'number') setTimeLeft(s.timeLeft);
        if (typeof s.running === 'boolean') setRunning(s.running);
      } catch {}
    });
    es.onerror = () => {};
    return () => es.close();
  }, [roomId]);

  React.useEffect(() => {
    const prev = document.body.style.overscrollBehavior;
    document.body.style.overscrollBehavior = 'none';
    document.body.classList.add('controller-body');
    return () => {
      document.body.style.overscrollBehavior = prev;
      document.body.classList.remove('controller-body');
    };
  }, []);

  React.useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    const update = () => setLandscape(mq.matches);
    mq.addEventListener?.('change', update);
    window.addEventListener('resize', update);
    return () => {
      mq.removeEventListener?.('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const arm = React.useCallback(async () => {
    if (armed) return;
    setArmed(true);
    try { await document.documentElement.requestFullscreen?.(); } catch {}
    try { await screen.orientation?.lock?.('landscape'); } catch {}
  }, [armed]);

  if (!roomId) {
    return (
      <div className="ctrl">
        <div className="ctrl__panel">
          <div className="ctrl__title">No room.</div>
          <p className="ctrl__copy">
            Open this page by scanning the QR code shown on the laptop.
          </p>
        </div>
      </div>
    );
  }

  if (!armed) {
    return (
      <div className="ctrl ctrl--prep" onPointerDown={arm}>
        <div className="ctrl__prep">
          <div className="ctrl__prepRoom">ROOM {roomId}</div>
          <div className="ctrl__prepTitle">EGG-CATCHER</div>
          <div className="ctrl__prepIcon">⤢</div>
          <div className="ctrl__prepCopy">
            Rotate your phone <strong>landscape</strong>.<br />
            Tap anywhere to enter fullscreen.
          </div>
          <button className="ctrl__prepBtn" onClick={arm}>TAP TO CONTINUE</button>
        </div>
      </div>
    );
  }

  if (!landscape) {
    return (
      <div className="ctrl ctrl--rotate">
        <div className="ctrl__rotateIcon">↻</div>
        <div className="ctrl__rotateMsg">ROTATE TO LANDSCAPE</div>
        <div className="ctrl__rotateSub">turn the phone sideways to play</div>
      </div>
    );
  }

  // armed + landscape, but game hasn't started → show START screen
  if (!running) {
    return (
      <div className="ctrl ctrl--start">
        <div className="ctrl__startPanel">
          <div className="ctrl__startEyebrow">ROOM {roomId}</div>
          <div className="ctrl__startTitle">
            {paired ? 'READY TO PLAY' : 'CONNECTING…'}
          </div>
          <div className="ctrl__startSub">
            {paired
              ? 'Press START to begin the 60-second round.'
              : 'Linking to the laptop…'}
          </div>
          <button
            className="ctrl__startBtn"
            onClick={() => send(roomId, 'start')}
            disabled={!paired}
          >
            ▸ START
          </button>
          {score > 0 && (
            <div className="ctrl__startLast">Last round: <strong>{score}</strong></div>
          )}
        </div>
      </div>
    );
  }

  const press = (dir) => (e) => { e.preventDefault(); send(roomId, `${dir}:down`); };
  const release = (dir) => (e) => { e.preventDefault(); send(roomId, `${dir}:up`); };
  const ratio = timeLeft == null ? 1 : Math.max(0, Math.min(1, timeLeft / ROUND_MS));

  return (
    <div className="ctrl ctrl--play">
      <div className="ctrl__topBar">
        <span className={`ctrl__pill ${paired ? 'is-on' : ''}`}>
          ● {paired ? 'LINKED' : 'WAITING'}
        </span>
        <div className="ctrl__scoreBox">
          <span className="ctrl__scoreLabel">SCORE</span>
          <span className="ctrl__scoreNum">{String(score).padStart(4, '0')}</span>
        </div>
        <span className="ctrl__room">ROOM {roomId}</span>
      </div>

      <div className="ctrl__playArea">
        <div className="ctrl__timeTube" aria-label="Time remaining">
          <div
            className="ctrl__timeFill"
            style={{
              height: `${ratio * 100}%`,
              background: ratio > 0.4 ? '#5db7e8' : ratio > 0.18 ? '#ffd86b' : '#ff9573',
            }}
          />
        </div>

        <div className="ctrl__pad">
          <button
            type="button"
            className="ctrl__btn ctrl__btn--left"
            onPointerDown={press('left')}
            onPointerUp={release('left')}
            onPointerCancel={release('left')}
            onPointerLeave={release('left')}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="Move left"
          >◀</button>
          <button
            type="button"
            className="ctrl__btn ctrl__btn--right"
            onPointerDown={press('right')}
            onPointerUp={release('right')}
            onPointerCancel={release('right')}
            onPointerLeave={release('right')}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="Move right"
          >▶</button>
        </div>
      </div>
    </div>
  );
}
