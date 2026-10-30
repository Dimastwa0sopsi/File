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
  // новые локации фазы 4
  const mini = L.buildings.filter((b) => b.name.includes('Приморск')).length;
  const fish = L.buildings.filter((b) => b.kind === 'fishshop').length;
  const toilets = L.props.filter((p) => p.t === 'toilet').length;
  const lights = L.nodes.filter((n) => n.light).length;
  const radars = L.nodes.filter((n) => n.light && radarAt(n.gi!, n.gj!)).length;
  console.log(`  Приморск (5×5): зданий ${mini}, рыболовных магазинов ${fish}, пляжных туалетов ${toilets}`);
  console.log(`  радары: ${radars} из ${lights} перекрёстков (${Math.round((radars / lights) * 100)}%) — остальные без камер`);
  // второй областной мини-город с небоскрёбами и деревня с фермой рядом
  const sosn = L.buildings.filter((b) => b.x > 1000 && b.x < 1420 && b.z > 1520 && b.z < 1800);
  const sosnFarm = sosn.filter((b) => b.kind === 'barn' || b.kind === 'coop' || b.kind === 'livestock' || b.kind === 'farm').length;
  const crops = L.props.filter((p) => p.t === 'crop').length;
  const novo = L.buildings.filter((b) => b.x > -1060 && b.x < -380 && b.z > -220 && b.z < 460);
  const novoHouses = novo.filter((b) => b.kind === 'house').length;
  const fences = L.props.filter((p) => p.t === 'fence').length;
  console.log(`  Ольховка: ${sosn.length} построек, ферма ${sosnFarm}, грядок ${crops}`);
  console.log(`  Новоград (10×10 за мостом): зданий ${novo.length} (домов ${novoHouses}), мостов ${L.bridges.length}, заборов ${fences}`);
  if (mini < 10 || fish < 3 || toilets < 3) throw new Error('мини-город или пляж собраны не полностью');
  if (sosnFarm < 3 || sosn.length < 8) throw new Error('деревня с фермой собрана не полностью');
  if (novo.length < 40 || L.bridges.length < 1) throw new Error('город за мостом собран не полностью');
  if (fences < novoHouses * 3) throw new Error('не у каждого дома есть забор');
  if (radars >= lights * 0.15) throw new Error('радаров слишком много — верните фильтр radarAt');
} catch (e) {
  console.error('✗ генерация мира упала:', (e as Error).message);
  process.exit(1);
}
