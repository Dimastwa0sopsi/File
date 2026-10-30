/**
 * Быстрая проверка генератора мира: ловит падения вида
 * «Препятствие на дороге» до запуска игры и деплоя.
 * Запуск: npm run check:world
 */
import { generateLayout } from '../src/game/worldgen';
import { radarAt } from '../src/game/config';

try {
  const L = generateLayout();
  const trees = L.props.filter((p) => p.t === 'tree' || p.t === 'pine' || p.t === 'bush').length;
  const solid = L.colliders.filter((c) => c.tag !== 'curb' && c.y1 > 0.5).length;
  console.log(`✓ мир собран: кварталов ${L.blocks.length}, зданий ${L.buildings.length}, деревьев/кустов ${trees}, твёрдых объектов ${solid}`);
  const fish = L.buildings.filter((b) => b.kind === 'fishshop').length;
  const toilets = L.props.filter((p) => p.t === 'toilet').length;
  const lights = L.nodes.filter((n) => n.light).length;
  const radars = L.nodes.filter((n) => n.light && radarAt(n.gi!, n.gj!)).length;
  console.log(`  рыболовных магазинов ${fish}, пляжных туалетов ${toilets}`);
  console.log(`  радары: ${radars} из ${lights} перекрёстков (${Math.round((radars / lights) * 100)}%) — остальные без камер`);
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
  // частные кварталы основного города: ровно 4 дома на 1×1 квартал
  const privateBlocks = L.blocks.filter((b) => b.type === 'private' && b.ox === undefined);
  let badBlocks = 0;
  for (const b of privateBlocks) {
    const x0 = b.i * 60 + 6, z0 = b.j * 60 + 6;
    const n = L.buildings.filter((x) => x.kind === 'house' && x.x > x0 && x.x < x0 + 48 && x.z > z0 && x.z < z0 + 48).length;
    if (n !== 4) badBlocks++;
  }
  console.log(`  частные кварталы: ${privateBlocks.length}, ровно по 4 дома — ${privateBlocks.length - badBlocks}`);
  if (badBlocks) throw new Error(`в ${badBlocks} частных кварталах не 4 дома`);
  if (radars >= lights * 0.15) throw new Error('радаров слишком много — верните фильтр radarAt');
} catch (e) {
  console.error('✗ генерация мира упала:', (e as Error).message);
  process.exit(1);
}
