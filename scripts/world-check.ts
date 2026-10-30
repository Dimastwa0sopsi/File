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
  if (mini < 10 || fish < 3 || toilets < 3) throw new Error('мини-город или пляж собраны не полностью');
  if (radars >= lights * 0.4) throw new Error('радаров слишком много — верните фильтр radarAt');
} catch (e) {
  console.error('✗ генерация мира упала:', (e as Error).message);
  process.exit(1);
}
