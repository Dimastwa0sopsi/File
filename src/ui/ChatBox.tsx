import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Game } from '../game/game';

/** мини-окно чата: Enter/T — написать, команды /me /smi /obm /mm /lk /home /biz /e /help */
export function ChatBox({ g, mobile, online }: { g: Game; mobile: boolean; online: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [, tick] = useState(0);
  const inp = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const hist = useRef<string[]>([]); const hi = useRef(-1);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 400); return () => clearInterval(t); }, []);
  // открытие синхронно внутри жеста — иначе мобильные браузеры не показывают клавиатуру
  const openNow = () => { flushSync(() => setOpen(true)); g.input.enabled = false; g.input.releaseAll(); inp.current?.focus(); };
  useEffect(() => { g.chatFocus = openNow; return () => { g.chatFocus = null; }; });
  const msgs = g.chatLog();
  useEffect(() => { list.current?.scrollTo(0, 1e6); }, [msgs.length, open]);
  const close = () => { setOpen(false); setText(''); hi.current = -1; inp.current?.blur(); if (!g.panel) { g.input.enabled = true; g.input.releaseAll(); } };
  const send = () => { const t = text.trim(); if (t) { g.chatSubmit(t); hist.current.unshift(t); hist.current = hist.current.slice(0, 20); } close(); };
  const now = Date.now();
  const shown = open ? msgs.slice(-50) : msgs.filter((m) => now - m.t < 14000).slice(-6);
  // на телефоне: закрытый чат — маленькая кнопка сверху слева (не задевает джойстик),
  // открытый — панель у нижнего края, чтобы поле ввода и история не наезжали на джойстик
  const style: React.CSSProperties | undefined = mobile
    ? open
      ? { top: 'auto', bottom: 'calc(8px + var(--safe-b))', left: 'calc(8px + var(--safe-l))', right: 'calc(8px + var(--safe-r))', width: 'auto', padding: 8, borderRadius: 16, background: 'rgba(10,12,18,.94)', border: '1px solid var(--line2)' }
      : { top: 'calc(176px + var(--safe-t))', bottom: 'auto', left: 'calc(10px + var(--safe-l))', width: 'min(300px, 66vw)' }
    : undefined;
  return (
    <div className={`chat ${open ? 'open' : ''} ${mobile ? 'mob' : ''}`} style={style}
      onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
      {(open || shown.length > 0) && (
        <div className="chat-list" ref={list} style={mobile ? { maxHeight: open ? '34vh' : '96px' } : undefined}>
          {shown.map((m, i) => (
            <div key={i} className={`chat-msg ${m.kind ?? ''} ${m.me ? 'mine' : ''}`} style={{ opacity: open ? 1 : Math.min(1, (14000 - (now - m.t)) / 2500) }}>
              {m.kind === 'me' ? <i style={{ color: m.color }}>* {m.name} {m.text}</i>
                : m.kind === 'news' ? <><span className="news-tag">📰 СМИ</span> <b>{m.name}:</b> {m.text}</>
                : m.kind === 'sys' ? <><span style={{ color: m.color }}>⚙ {m.text}</span></>
                : <><b style={{ color: m.color }}>{m.name}</b> {m.text}</>}
            </div>
          ))}
          {open && !msgs.length && <div className="chat-msg sys">{online ? 'Сообщений пока нет' : 'Команды: /help'}</div>}
        </div>
      )}
      {open ? (
        <div className="chat-in">
          <input ref={inp} value={text} maxLength={220} enterKeyHint="send" autoComplete="off" placeholder={online ? 'Сообщение или /команда…' : 'Команда: /mm /lk /home /biz /e /help'} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') send();
              if (e.key === 'Escape') close();
              if (e.key === 'ArrowUp' && hist.current.length) { hi.current = Math.min(hist.current.length - 1, hi.current + 1); setText(hist.current[hi.current]); e.preventDefault(); }
              if (e.key === 'ArrowDown') { hi.current = Math.max(-1, hi.current - 1); setText(hi.current >= 0 ? hist.current[hi.current] : ''); }
            }} onBlur={() => { if (!mobile && !text) setTimeout(close, 120); }} />
          <button onPointerDown={(e) => { e.preventDefault(); send(); }}>➤</button>
          {mobile && <button className="x" onPointerDown={(e) => { e.preventDefault(); close(); }}>✕</button>}
        </div>
      ) : mobile ? <button className="chat-open" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); openNow(); }}>💬</button>
        : <div className="chat-hint">{online ? 'Enter — чат · онлайн' : 'Enter — чат · /help — команды'}</div>}
    </div>
  );
}
