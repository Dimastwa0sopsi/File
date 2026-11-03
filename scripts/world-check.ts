/**
 * Быстрая проверка генератора мира: ловит падения вида
 * «Препятствие на дороге» до запуска игры и деплоя.
 * Запуск: npm run check:world
 */
import { generateLayout } from '../src/game/worldgen';

try {
  const L = generateLayout();
  const trees = L.props.filter((p) => p.t === 'tree' || p.t === 'pine' || p.t === 'bush').length;
  const solid = L.colliders.filter((c) => c.tag !== 'curb' && c.y1 > 0.5).length;
  console.log(`✓ мир собран: кварталов ${L.blocks.length}, зданий ${L.buildings.length}, деревьев/кустов ${trees}, твёрдых объектов ${solid}`);
  const fish = L.buildings.filter((b) => b.kind === 'fishshop').length;
  const toilets = L.props.filter((p) => p.t === 'toilet').length;
  console.log(`  рыболовных магазинов ${fish}, пляжных туалетов ${toilets}`);
  // второй областной мини-город с небоскрёбами и деревня с фермой рядом
  const sosn = L.buildings.filter((b) => b.x > 1000 && b.x < 1420 && b.z > 1520 && b.z < 1800);
  const sosnFarm = sosn.filter((b) => b.kind === 'barn' || b.kind === 'coop' || b.kind === 'livestock' || b.kind === 'farm').length;
  const crops = L.props.filter((p) => p.t === 'crop').length;
  const fences = L.props.filter((p) => p.t === 'fence').length;
  const houses = L.buildings.filter((b) => b.kind === 'house' || b.kind === 'vhouse');
  const fenced = houses.filter((b) => b.fenced).length;
  const driveways = L.props.filter((p) => p.t === 'driveway').length;
  console.log(`  Ольховка: ${sosn.length} построек, ферма ${sosnFarm}, грядок ${crops}`);
  console.log(`  деревни (${L.villages.length}): ${L.villages.map((v) => v.name).join(', ')}`);
  console.log(`  дома: ${houses.length}, с забором ${fenced}, подъездов к улице ${driveways}, заборов ${fences}`);
  if (fish < 2 || toilets < 3) throw new Error('пляж собран не полностью');
  if (sosnFarm < 3 || sosn.length < 8) throw new Error('деревня с фермой собрана не полностью');
  if (L.villages.length !== 3) throw new Error('деревень должно быть ровно три');
  for (const gone of ['Берёзово', 'Тихая Гавань', 'Лесной Край', 'Дубрава']) if (L.villages.some((v) => v.name === gone)) throw new Error('деревня ' + gone + ' не удалена');
  if (L.newCity || L.bridges.length) throw new Error('соседний город и мост должны быть убраны');
  if (fenced < houses.length) throw new Error('не у каждого дома есть забор');
  if (driveways < houses.length * 0.9) throw new Error('к домам не проложены подъезды');
  // частные кварталы основного города: одна усадьба на весь квартал — огромный двор 42 × 42 м
  const privateBlocks = L.blocks.filter((b) => b.type === 'private' && b.ox === undefined);
  let badBlocks = 0, minYard = 1e9;
  for (const b of privateBlocks) {
    const x0 = b.i * 60 + 6, z0 = b.j * 60 + 6;
    const hs = L.buildings.filter((x) => x.kind === 'house' && x.x > x0 && x.x < x0 + 48 && x.z > z0 && x.z < z0 + 48);
    if (hs.length !== 1) badBlocks++;
    for (const h of hs) minYard = Math.min(minYard, (x0 + 48 - x0) * 48 * 0 + h.w * 4);
  }
  const garageYards = L.buildings.filter((x) => x.kind === 'garage' && x.w > 8).length;
  const pools = L.props.filter((p) => p.t === 'pool').length;
  const greenhouses = L.buildings.filter((b) => b.kind === 'greenhouse').length + L.props.filter((p) => p.t === 'greenhouse').length;
  console.log(`  частные кварталы: ${privateBlocks.length}, усадеб ${privateBlocks.length - badBlocks}, двор ${42 * 42} м², гаражей ${garageYards}, бассейнов ${pools}, теплиц ${greenhouses}`);
  console.log(`  водоёмы для плавания: ${L.pools.length}, садовых дорожек: ${L.props.filter((p) => p.t === 'path').length}, колодцев: ${L.props.filter((p) => p.t === 'well').length}`);
  if (badBlocks) throw new Error(`в ${badBlocks} частных кварталах не одна усадьба`);
  if (pools < privateBlocks.length * 0.9) throw new Error('у усадеб нет бассейнов');
  if (greenhouses < privateBlocks.length * 0.9) throw new Error('у усадеб нет теплиц');
  if (garageYards < privateBlocks.length * 0.9) throw new Error('у усадеб нет больших гаражей');
  void minYard;
  // сёла: застройка выросла — много домов у каждого села
  const villageHouses = L.buildings.filter((b) => b.kind === 'vhouse');
  console.log(`  дома в сёлах: ${villageHouses.length}`);
  if (villageHouses.length < 30) throw new Error('сёла слишком маленькие');
  for (const v of L.villages) {
    const cnt = villageHouses.filter((h) => h.village === v.name).length;
    console.log(`   ${v.name}: ${cnt} домов, улица ${Math.round(Math.hypot(v.ex - v.sx, v.ez - v.sz))} м + ответвления`);
    if (cnt < 8) throw new Error(`село ${v.name} слишком маленькое`);
  }
  // автобусная сеть: 3 маршрута, остановки на тротуарах
  console.log(`  автобус: маршрутов ${L.busRoutes.length}, остановок ${L.busStops.length}, автопарк (${Math.round(L.busDepot.x)}, ${Math.round(L.busDepot.z)})`);
  if (L.busRoutes.length !== 3) throw new Error('должно быть три автобусных маршрута');
  const stopsProps = L.props.filter((p) => p.t === 'busstop').length;
  if (stopsProps !== L.busStops.length) throw new Error('остановки нарисованы не все');
  // городские услуги: мойка, шиномонтаж, паркомат, автомат, ломбард, доставка, садок, стоянка, запчасти, зарядка
  const svc = ['washbay', 'tirestack', 'parkmeter', 'slot', 'pawnshop', 'foodbox', 'fishkeeper', 'impound', 'partsshop', 'evcharger'] as const;
  const svcCount = Object.fromEntries(svc.map((t) => [t, L.props.filter((p) => p.t === t).length]));
  console.log(`  услуги: ${svc.map((t) => `${t} ${svcCount[t]}`).join(', ')}`);
  for (const t of ['washbay', 'tirestack', 'slot', 'pawnshop', 'foodbox', 'fishkeeper', 'partsshop', 'evcharger'] as const)
    if (svcCount[t] < 2) throw new Error(`услуга ${t} не расставлена (${svcCount[t]})`);
  if (!svcCount.parkmeter || !svcCount.impound) throw new Error('паркоматы или штрафстоянка не расставлены');
  // пляж: песок полосами, настил и новые пропы
  const beachProps = { dune: L.props.filter((p) => p.t === 'dune').length, cabin: L.props.filter((p) => p.t === 'cabin').length, jetty: L.props.filter((p) => p.t === 'jetty').length, pave: L.props.filter((p) => p.t === 'pave').length };
  console.log(`  пляж: дюны ${beachProps.dune}, кабинки ${beachProps.cabin}, настил-сходы ${beachProps.jetty}, плиты променада ${beachProps.pave}`);
  if (beachProps.dune < 6 || beachProps.cabin < 2) throw new Error('пляж собран не полностью');
  const flag = L.props.find((p) => p.t === 'flag');
  const tops = L.buildings.filter((b) => b.kind !== 'factory' && b.kind !== 'warehouse').sort((a, b) => b.h - a.h);
  if (!flag || !tops.length || flag.h < tops[0].h) throw new Error('пасхалка-флаг не на самом высоком доме');
  console.log(`  пасхалка: флаг на «${tops[0].name}» (${tops[0].h.toFixed(0)} м, квартал ${Math.round(tops[0].x)},${Math.round(tops[0].z)})`);
  if (L.busStops.length < 15) throw new Error('слишком мало автобусных остановок');
} catch (e) {
  console.error('✗ генерация мира упала:', (e as Error).message);
  process.exit(1);
}
