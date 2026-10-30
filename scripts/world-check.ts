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
} catch (e) {
  console.error('✗ генерация мира упала:', (e as Error).message);
  process.exit(1);
}
