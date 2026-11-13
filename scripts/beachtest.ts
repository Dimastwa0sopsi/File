// RP #23 — проверка пляжа, больших деревенских усадеб и мансарды.
// Гоняется в node: мир генерируется честным worldgen, интерьер — честным buildInterior
// (Three.js строит геометрию без WebGL, рендер здесь не нужен).
/* eslint-disable @typescript-eslint/no-explicit-any */
import './domstub';
import { generateLayout } from '../src/game/worldgen';
import { buildInterior } from '../src/game/interiors';
import { KIOSK_TYPES } from '../src/game/data';

const fails: string[] = [];
const ok = (cond: boolean, what: string) => { console.log(`${cond ? '✓' : '✗'} ${what}`); if (!cond) fails.push(what); };

const L: any = generateLayout();
const props: any[] = L.props;
const count = (t: string) => props.filter((p) => p.t === t).length;

// ---------- 1. Пляж: торговая линия ----------
const beachKiosks = L.kiosks.filter((k: any) => k.x < -100 && k.z > 380 && k.z < 600);
ok(beachKiosks.length === 4, `на пляже 4 ларька (нашли ${beachKiosks.length})`);
ok(new Set(beachKiosks.map((k: any) => k.type)).size === 4, 'все четыре ларька разных типов');
ok(beachKiosks.every((k: any) => KIOSK_TYPES[k.type]), 'у каждого пляжного ларька корректный тип');
ok(L.kiosks.every((k: any, i: number) => k.id === i), 'идентификаторы ларьков идут подряд без дыр');
{
  const road = 480;
  const tooClose = beachKiosks.filter((k: any) => Math.abs(k.z - road) < 14);
  ok(tooClose.length === 0, 'ни один ларёк не стоит на пляжном проезде');
}

// ---------- 2. Пляж: объекты для взаимодействия ----------
ok(count('sunbed') + count('lounger') > 0, `лежаки на месте (${count('sunbed')} sunbed + ${count('lounger')} lounger)`);
ok(count('shower') >= 5, `души на месте (${count('shower')})`);
ok(count('cabin') >= 5, `кабинки для переодевания на месте (${count('cabin')})`);
ok(count('lifeguard') === 1, 'спасательный пост на месте');

// ---------- 3. Деревенские усадьбы стали больше ----------
const vh = L.buildings.filter((b: any) => b.kind === 'vhouse');
ok(vh.length === 44, `деревенских домов по-прежнему 44 (нашли ${vh.length})`);
ok(vh.every((b: any) => b.w >= 11 && b.d >= 10), 'каждая усадьба не меньше 11 × 10 м');
ok(vh.every((b: any) => b.h >= 6.4), `каждая усадьба выше 6.4 м (минимум ${Math.min(...vh.map((b: any) => b.h))})`);
{
  const byVillage: Record<string, number> = {};
  for (const b of vh) byVillage[b.village] = (byVillage[b.village] ?? 0) + 1;
  const txt = Object.entries(byVillage).map(([k, v]) => `${k} ${v}`).join(', ');
  ok(Object.keys(byVillage).length === 3, `дома разошлись по трём сёлам (${txt})`);
}
{
  // участки не должны налезать друг на друга: дом + забор 2.6 м с каждой стороны
  let hit = 0;
  for (let i = 0; i < vh.length; i++) for (let j = i + 1; j < vh.length; j++) {
    const a = vh[i], b = vh[j];
    if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 5.2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + 5.2) hit++;
  }
  ok(hit === 0, `участки соседей не пересекаются (пересечений ${hit})`);
}
{
  // и ни один дом не должен налезть на другое здание
  let hit = 0;
  for (const a of vh) for (const b of L.buildings) {
    if (a === b) continue;
    if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2) hit++;
  }
  ok(hit === 0, `усадьбы не пересекаются с другими постройками (пересечений ${hit})`);
}

// ---------- 4. Мансарда в интерьере деревенского дома ----------
const vi = buildInterior('house_village', { seed: 3 });
const ci = buildInterior('house_city', { seed: 3 });
ok(vi.bounds.h > 5, `коробка деревенского дома выросла в высоту (${vi.bounds.h} м)`);
ok(ci.bounds.h < 3.2, `городская квартира-дом не изменилась (${ci.bounds.h} м)`);
{
  const floor = vi.colliders.filter((c: any) => c.y0 > 2.4 && c.y0 < 2.8 && (c.x1 - c.x0) > 2 && (c.z1 - c.z0) > 2);
  ok(floor.length >= 2, `перекрытие мансарды собрано (плит ${floor.length})`);
  const area = floor.reduce((s: number, c: any) => s + (c.x1 - c.x0) * (c.z1 - c.z0), 0);
  ok(area > 90, `площадь второго этажа ${Math.round(area)} м²`);
}
{
  // лестница: ступени разной высоты от пола до уровня мансарды
  const steps = vi.colliders.filter((c: any) => c.y0 === 0 && c.y1 > 0.1 && c.y1 < 2.8 && (c.x1 - c.x0) > 1.5 && (c.z1 - c.z0) < 0.5);
  ok(steps.length >= 8, `лестничный марш на месте (ступеней ${steps.length})`);
  const top = Math.max(...steps.map((c: any) => c.y1));
  ok(Math.abs(top - 2.75) < 0.06, `верхняя ступень выходит на уровень пола мансарды (${top.toFixed(2)} м)`);
}
{
  const upWalls = vi.colliders.filter((c: any) => c.y0 > 2.7 && c.y1 > 4.5);
  ok(upWalls.length >= 3, `перегородки мансарды стоят (${upWalls.length})`);
}
ok(!!vi.bed, 'кровать для сна осталась на первом этаже');
ok(vi.bed!.y < 1, `место сна на первом этаже (y = ${vi.bed!.y})`);
ok(vi.lights.length >= 5, `мансарда освещена (ламп в доме ${vi.lights.length})`);
vi.dispose(); ci.dispose();

// ---------- итог ----------
console.log(fails.length ? `\n✗ провалено проверок: ${fails.length}` : '\n✓ RP #23: пляж, усадьбы и мансарда на месте');
process.exit(fails.length ? 1 : 0);
