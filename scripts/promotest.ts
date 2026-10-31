// Проверка промо-машины «Лос-X»: самая быстрая, не ломается, стант на X.
/* eslint-disable @typescript-eslint/no-explicit-any */
import './domstub';
import { VEHICLES } from '../src/game/data';
import { Vehicle, playerDrive } from '../src/game/vehicles';

const col: any = { pushCircle: () => null, groundAt: () => 0 };
const water = () => false;

let bad = 0;
const ok = (cond: boolean, name: string) => { console.log((cond ? '✅ ' : '❌ ') + name); if (!cond) bad++; };

const spec = VEHICLES.losx;
ok(!!spec, 'машина Лос-X есть в каталоге');
ok(!!spec && spec.stunt === true, 'флаг stunt — стант доступен кузову sport');
ok(!!spec && spec.unbreakable === true, 'флаг unbreakable — не изнашивается');
ok(!!spec && spec.forSale === 'none', 'купить в автосалоне нельзя (только промокод)');

const fastest = Object.values(VEHICLES).filter((v) => v.id !== 'losx').reduce((a, b) => (b.maxSpeed > a.maxSpeed ? b : a));
ok(spec.maxSpeed > fastest.maxSpeed, `самая быстрая в парке: ${Math.round(spec.maxSpeed * 3.6)} км/ч против ${Math.round(fastest.maxSpeed * 3.6)} (${fastest.name})`);

const car = new Vehicle('losx', 'owned');
const bike = new Vehicle('molnia', 'owned');
const sedan = new Vehicle('lada', 'owned');
ok(car.canStunt, 'Лос-X умеет стант');
ok(bike.canStunt, 'мотоцикл по-прежнему умеет стант');
ok(!sedan.canStunt, 'обычная легковушка стант не умеет');

// вилли: газ + X поднимает переднюю ось, состояние и бак не падают
for (let i = 0; i < 120; i++) playerDrive(car, { throttle: 1, brake: 0, steer: 0, handbrake: false, wheelie: true, up: 0 }, 1 / 60, col, true, water);
ok(car.wheelie > 0.15, `вилли поднимается (угол ${car.wheelie.toFixed(2)} рад)`);
ok(car.stuntT > 0.5, `время станта идёт (${car.stuntT.toFixed(2)} с)`);
ok(car.condition === 1, 'состояние 100% после станта');
ok(car.fuel === 100, 'бак не пустеет');

// стоппи: X + тормоз — задняя ось в воздухе, скорость гасится
const car2 = new Vehicle('losx', 'owned');
car2.speed = 20;
for (let i = 0; i < 60; i++) playerDrive(car2, { throttle: 0, brake: 1, steer: 0, handbrake: false, wheelie: true, up: 0 }, 1 / 60, col, true, water);
ok(car2.wheelie < -0.05, `стоппи опускает корму (угол ${car2.wheelie.toFixed(2)} рад)`);

// «никогда не ломается»: 200 жёстких кадров на полном газу
const car3 = new Vehicle('losx', 'owned');
for (let i = 0; i < 200; i++) {
  playerDrive(car3, { throttle: 1, brake: 0, steer: 0.3, handbrake: false, wheelie: false, up: 0 }, 1 / 60, col, true, water);
  car3.condition = 0; // имитируем урон снаружи — движок обязан вернуть 100%
}
playerDrive(car3, { throttle: 1, brake: 0, steer: 0, handbrake: false, wheelie: false, up: 0 }, 1 / 60, col, true, water);
ok(car3.condition === 1, 'состояние восстанавливается до 100% при любом уроне');
ok(car3.speed > car.speed * 0.5, 'скорость не падает из-за износа');

console.log(bad ? `\n❌ провалов: ${bad}` : '\n✅ Лос-X: быстрая, неубиваемая, стант на X');
process.exit(bad ? 1 : 0);
