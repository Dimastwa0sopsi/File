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
  const zarech = L.buildings.filter((b) => b.x > 20 && b.x < 360 && b.z > 1500 && b.z < 1900);
  const towers = zarech.filter((b) => b.kind === 'tower' && b.h >= 45).length;
  const klen = L.buildings.filter((b) => b.x > 360 && b.x < 640 && b.z > 1600 && b.z < 1900);
  const klenFarm = klen.filter((b) => b.kind === 'barn' || b.kind === 'coop' || b.kind === 'farm').length;
  const crops = L.props.filter((p) => p.t === 'crop').length;
  console.log(`  Заречный (5×5): зданий ${zarech.length}, небоскрёбов ${towers}; Кленовка: ${klen.length} построек, ферма ${klenFarm}, грядок ${crops}`);
  if (mini < 10 || fish < 3 || toilets < 3) throw new Error('мини-город или пляж собраны не полностью');
  if (zarech.length < 15 || towers < 10) throw new Error('второй мини-город без небоскрёбов');
  if (klenFarm < 3 || klen.length < 8) throw new Error('деревня с фермой собрана не полностью');
  if (radars >= lights * 0.15) throw new Error('радаров слишком много — верните фильтр radarAt');
} catch (e) {
  console.error('✗ генерация мира упала:', (e as Error).message);
  process.exit(1);
}
