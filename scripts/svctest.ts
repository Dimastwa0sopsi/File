// Городские услуги и колодцы: проверяем, что каждый проп в мире реально кликабелен.
// Ловит класс ошибок «меш и панель есть, а связи между ними нет» — именно так
// шесть электрозарядок простояли мёртвыми, а колодцы исчезли, оставив живой код.
/* eslint-disable @typescript-eslint/no-explicit-any */
import './domstub';
import { generateLayout } from '../src/game/worldgen';
import { SVC_PROPS, SVC_TITLES } from '../src/game/game';

const fails: string[] = [];
const ok = (cond: boolean, what: string) => { console.log(`${cond ? '✓' : '✗'} ${what}`); if (!cond) fails.push(what); };

const L: any = generateLayout();
const props: any[] = L.props;
const count = (t: string) => props.filter((p) => p.t === t).length;

// ---------- 1. Каждый проп-услуга доходит до панели ----------
const SERVICE_PROPS = ['washbay', 'tirestack', 'parkmeter', 'slot', 'pawnshop', 'foodbox', 'fishkeeper', 'impound', 'partsshop', 'evcharger'];
for (const t of SERVICE_PROPS) {
  const kind = SVC_PROPS[t];
  ok(!!kind, `проп «${t}» привязан к разделу панели${kind ? ` (${kind})` : ''}`);
  if (kind) ok(!!SVC_TITLES[kind], `у раздела «${kind}» есть заголовок: ${SVC_TITLES[kind]}`);
}
{
  // обратная сторона: ни один заголовок не висит без пропа в мире
  const reachable = new Set(Object.values(SVC_PROPS));
  const orphans = Object.keys(SVC_TITLES).filter((k) => !reachable.has(k as any));
  ok(orphans.length === 0, `нет разделов услуг без пропа в мире${orphans.length ? ': ' + orphans.join(', ') : ''}`);
}
{
  // и каждый привязанный проп действительно встречается на карте
  const missing = Object.keys(SVC_PROPS).filter((t) => count(t) === 0);
  ok(missing.length === 0, `все пропы-услуги расставлены в мире${missing.length ? ': нет ' + missing.join(', ') : ''}`);
}
ok(count('evcharger') >= 5, `электрозарядок в мире: ${count('evcharger')}`);

// ---------- 2. Колодцы ----------
const wells = props.filter((p) => p.t === 'well');
ok(wells.length === 84, `колодцев 84, как обещает README (нашли ${wells.length})`);
{
  // колодец — сруб с коллизией, а не плоская дорожка
  const solid = L.colliders.filter((c: any) =>
    wells.some((w) => Math.abs((c.x0 + c.x1) / 2 - w.x) < 0.3 && Math.abs((c.z0 + c.z1) / 2 - w.z) < 0.3));
  ok(solid.length >= wells.length, `у каждого колодца есть коллизия (${solid.length})`);
}
{
  let inside = 0;
  for (const w of wells) for (const b of L.buildings) {
    if (Math.abs(b.x - w.x) < b.w / 2 + 1.1 && Math.abs(b.z - w.z) < b.d / 2 + 1.1) inside++;
  }
  ok(inside === 0, `ни один колодец не стоит в стене здания (${inside})`);
}
{
  let inPool = 0;
  for (const w of wells) for (const pl of L.pools) {
    if (Math.abs(pl.x - w.x) < pl.w / 2 + 1.3 && Math.abs(pl.z - w.z) < pl.d / 2 + 1.3) inPool++;
  }
  ok(inPool === 0, `ни один колодец не торчит из бассейна (${inPool})`);
}
{
  const BULKY = new Set(['pool', 'greenhouse', 'banya', 'tree', 'lamp', 'umbrella', 'lounger', 'bench', 'kiosk', 'driveway']);
  let tight = 0;
  for (const w of wells) for (const p of props) {
    if (p !== w && BULKY.has(p.t) && Math.hypot(p.x - w.x, p.z - w.z) < 1.6) tight++;
  }
  ok(tight === 0, `к каждому колодцу можно подойти — ничего не впритык (${tight})`);
}
{
  // к колодцу усадьбы должна вести садовая дорожка
  const paths = props.filter((p) => p.t === 'path');
  const reached = wells.filter((w) => paths.some((p) => Math.hypot(p.x - w.x, p.z - w.z) < 4));
  ok(reached.length >= 79, `к колодцам протоптаны дорожки (${reached.length} из ${wells.length})`);
}

// ---------- итог ----------
console.log(fails.length ? `\n✗ провалено проверок: ${fails.length}` : '\n✓ услуги и колодцы: всё, что стоит в мире, работает');
process.exit(fails.length ? 1 : 0);
