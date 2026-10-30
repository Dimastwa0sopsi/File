import { useMemo, useState } from 'react';
import type { Game } from '../game/game';
import { Modal } from './MenuScreens';

type Task = { kind: 'sum'; title: string; nums: number[]; answer: string } | { kind: 'code'; title: string; code: string; answer: string } | { kind: 'mail'; title: string; subject: string; options: string[]; answer: string };
const SUBJ: [string, string][] = [['Счёт №4471 за аренду офиса', 'Счета'], ['Вы выиграли миллион! Перейдите по ссылке', 'Спам'], ['Отчёт за квартал: продажи выросли', 'Отчёты'], ['Клиент просит перезвонить по договору', 'Клиенты'],
  ['Оплата поставки серверов', 'Счета'], ['Дешёвые часы — скидка 99%', 'Спам'], ['Недельная сводка KPI', 'Отчёты'], ['Жалоба клиента на задержку', 'Клиенты'], ['Акт сверки с подрядчиком', 'Счета'], ['Срочно! Ваш аккаунт заблокирован', 'Спам']];
function makeTask(): Task {
  const r = Math.random();
  if (r < 0.34) { const nums = Array.from({ length: 4 }, () => 50 + Math.floor(Math.random() * 950)); return { kind: 'sum', title: 'Сверка счёта: посчитайте итоговую сумму', nums, answer: String(nums.reduce((a, b) => a + b, 0)) }; }
  if (r < 0.67) { const ch = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789'; const code = Array.from({ length: 6 }, () => ch[Math.floor(Math.random() * ch.length)]).join(''); return { kind: 'code', title: 'Ввод данных: перепечатайте код заявки', code, answer: code }; }
  const [subject, answer] = SUBJ[Math.floor(Math.random() * SUBJ.length)];
  return { kind: 'mail', title: 'Сортировка почты: выберите папку', subject, options: ['Счета', 'Клиенты', 'Отчёты', 'Спам'], answer };
}

export function PcPanel({ g, mode, close }: { g: Game; mode: 'office' | 'home'; close: () => void }) {
  const [task, setTask] = useState<Task>(makeTask);
  const [val, setVal] = useState('');
  const [log, setLog] = useState<{ ok: boolean; pay: number }[]>([]);
  const [app, setApp] = useState<'work' | 'desk'>(mode === 'office' ? 'work' : 'desk');
  const earned = log.reduce((a, l) => a + l.pay, 0);
  const submit = (ans: string) => {
    const ok = ans.trim().toUpperCase() === task.answer.toUpperCase();
    const pay = g.pcReward(mode, ok);
    setLog([{ ok, pay }, ...log].slice(0, 8)); setVal(''); if (ok) setTask(makeTask());
  };
  const done = g.getState().officeDone ?? 0;
  return (
    <Modal title={mode === 'office' ? '💻 Рабочий ПК · «ЛосТех»' : '🖥️ Домашний компьютер'} onClose={close} wide>
      <div className="pc">
        <div className="pc-bar"><span>🪟 LosOS</span><button className={app === 'work' ? 'on' : ''} onClick={() => setApp('work')}>{mode === 'office' ? 'Задачи CRM' : 'Фриланс'}</button>{mode === 'home' && <button className={app === 'desk' ? 'on' : ''} onClick={() => setApp('desk')}>Рабочий стол</button>}<span className="pc-clock">{new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span></div>
        {app === 'desk' && (
          <div className="pc-desk">
            <button onClick={() => setApp('work')}><span>💼</span>Фриланс-биржа<small>$18 за задачу</small></button>
            <button onClick={() => { close(); g.openPanel({ type: 'phone', tab: 'store' }); }}><span>🛍️</span>LosSt<small>приложения</small></button>
            <button onClick={() => { close(); g.openPanel({ type: 'phone', tab: 'gallery' }); }}><span>🖼️</span>Галерея<small>ваши фото</small></button>
            <button onClick={() => { close(); g.openPanel({ type: 'phone', tab: 'support' }); }}><span>🛟</span>Поддержка<small>жалобы</small></button>
          </div>
        )}
        {app === 'work' && (
          <div className="pc-work">
            <div className="pc-task">
              <h4>{task.title}</h4>
              {task.kind === 'sum' && <div className="pc-invoice">{task.nums.map((n, i) => <div key={i}><span>Позиция {i + 1}</span><b>${n}</b></div>)}<div className="tot"><span>ИТОГО</span><b>?</b></div></div>}
              {task.kind === 'code' && <div className="pc-code">{task.code.split('').map((c, i) => <span key={i} style={{ transform: `rotate(${(i % 3 - 1) * 6}deg)` }}>{c}</span>)}</div>}
              {task.kind === 'mail' && <div className="pc-mail"><small>Тема письма:</small><b>«{task.subject}»</b></div>}
              {task.kind === 'mail'
                ? <div className="btns">{task.options.map((o) => <button key={o} className="ui-btn" onClick={() => submit(o)}>📁 {o}</button>)}</div>
                : <div className="btns"><input className="ui-input" autoFocus value={val} inputMode={task.kind === 'sum' ? 'numeric' : 'text'} placeholder={task.kind === 'sum' ? 'Сумма' : 'Код'} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') submit(val); }} /><button className="ui-btn main" onClick={() => submit(val)}>Готово</button></div>}
            </div>
            <div className="pc-side">
              <div><small>За сессию</small><b className="price">${earned}</b></div>
              {mode === 'office' && <div><small>Задач в смене</small><b>{done % 8}/8</b><i className="pc-prog"><em style={{ width: `${((done % 8) / 8) * 100}%` }} /></i><small>8 задач = зарплата +$250</small></div>}
              <div className="pc-log">{log.map((l, i) => <span key={i} className={l.ok ? 'ok' : 'bad'}>{l.ok ? `✔ +$${l.pay}` : '✘ ошибка'}</span>)}</div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function OfficeHr({ g, close }: { g: Game; close: () => void }) {
  const [, f] = useState(0); const hired = g.getState().officeJob;
  return (
    <Modal title="💻 Отдел кадров «ЛосТех»" onClose={close}>
      <p>Офисная работа за компьютером: сверка счетов, ввод данных и сортировка почты. <b>$45</b> за каждую верно выполненную задачу и <b>+$250</b> зарплаты за каждые 8 задач.</p>
      <div className="ui-card mt-3">{hired ? <>Вы работаете в «ЛосТех». Садитесь за любой свободный ПК (E). <button className="ui-btn sm danger ml-2" onClick={() => { g.quitOffice(); f((x) => x + 1); }}>Уволиться</button></> : <button className="ui-btn main" onClick={() => { g.hireOffice(); f((x) => x + 1); }}>Устроиться на работу</button>}</div>
    </Modal>
  );
}

export function Livestock({ g, close }: { g: Game; close: () => void }) {
  const on = g.job?.type === 'farm';
  return (
    <Modal title="🐄 Ферма «Зорька»" onClose={close}>
      <p>Цикл работы: отнесите 3 мешка корма из стогов в кормушки коров ($40 каждый), затем соберите яйца в курятнике и сдайте в ящик у конторы ($70 + бонус $150 за цикл).</p>
      <button className="ui-btn main mt-3" onClick={() => { if (on) { g.quitJob(); close(); } else g.startFarmJob(); }}>{on ? 'Закончить смену' : 'Начать работу'}</button>
    </Modal>
  );
}

export function CameraOverlay({ g, mode }: { g: Game; mode: 'selfie' | 'rear' }) {
  const [last, setLast] = useState<string | null>(null);
  const hint = useMemo(() => (g.mobile ? 'Свайп — повернуть' : 'Мышь — повернуть · ЛКМ/Пробел — снимок · V — сменить камеру · Esc — выход'), [g.mobile]);
  return (
    <div className="camui" onPointerDown={(e) => e.stopPropagation()}>
      <div className="cam-frame"><i /><i /><i /><i /></div>
      <div className="cam-top"><span>{mode === 'selfie' ? '🤳 Фронтальная' : '📷 Основная'}</span><small>{hint}</small></div>
      <div className="cam-bar">
        <button className="cam-thumb" onClick={() => { g.stopCamera(); g.openPanel({ type: 'phone', tab: 'gallery' }); }}>{last ? <img src={last} alt="" /> : '🖼️'}</button>
        <button className="cam-shutter" onClick={() => { const d = g.takePhoto(); if (d) setLast(d); }} aria-label="Снимок" />
        <button className="cam-btn" onClick={() => g.switchCamera()}>⟲</button>
        <button className="cam-btn" onClick={() => g.stopCamera()}>✕</button>
      </div>
    </div>
  );
}
