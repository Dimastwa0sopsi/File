// Экран входа: только соло, кнопка «Играть». Онлайн-входа здесь нет.
// Ник для соло берётся из сохранённого на устройстве. Пол — в кастомизации/больнице, пароля нет.
import { useState } from 'react';
import menuBg from '../assets/menu.jpg';

const NICK_KEY = 'losgorod_nick';

function savedNick(): string {
  try { return localStorage.getItem(NICK_KEY) ?? ''; } catch { return ''; }
}

export function AuthScreen({ onPlay }: { onPlay: () => void }) {
  const nick = savedNick();
  return (
    <div className="auth-screen">
      <div className="auth-bg" style={{ backgroundImage: `url(${menuBg})` }} />
      <div className="auth-veil" />

      {/* ===== ЛЕВАЯ СТОРОНА: название игры ===== */}
      <div className="auth-left">
        <div className="auth-logo-inner">
          <div className="auth-badge">LOS GOROD</div>
          <h1 className="auth-logo">ЛОС-ГОРОД</h1>
          <p className="auth-tagline">Открытый мир · бизнес · машины · соло</p>
        </div>
      </div>

      {/* ===== ПРАВАЯ СТОРОНА: только кнопка «Играть» ===== */}
      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-card-header">
            <h2 className="auth-card-title">ЛОС-ГОРОД</h2>
          </div>
          <button className="auth-btn" onClick={onPlay}>▶ Играть</button>
          <div className="auth-footer-note">
            {nick ? `Ник: ${nick}` : 'Ник будет задан при входе'} · только соло · онлайн — из игры (Ё / планшет)
          </div>
        </div>
      </div>
    </div>
  );
}
