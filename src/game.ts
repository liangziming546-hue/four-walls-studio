export const SHAPES = ['triangle', 'square', 'star', 'circle'] as const;
export type Shape = typeof SHAPES[number];
export const INFO: Record<Shape, { name: string; symbol: string; color: string }> = {
  triangle: { name: '三角形', symbol: '△', color: '#e3ae63' },
  square: { name: '正方形', symbol: '□', color: '#79bdc6' },
  star: { name: '五角星', symbol: '☆', color: '#d6a0b6' },
  circle: { name: '圆形', symbol: '○', color: '#a9be82' },
};
export const CONFIG = { minutesPerSecond: 1.2, dayStart: 480, dayEnd: 1560, salePrice: 3, wage: 8, interest: .1, upgradeCosts: [30, 60, 120, 240] };
export type Counts = Record<Shape, number>;
export const counts = (n = 0): Counts => ({ triangle: n, square: n, star: n, circle: n });
export type Charm = 'top' | 'bottom' | 'triple';
export interface State {
  version: 1; day: number; minute: number; coins: number; bank: number;
  inventory: Counts; xp: Counts; due: Counts; paid: Counts; debt: Counts;
  hunger: number; thirst: number; energy: number; pen: number; hand: number;
  water: number; food: number; books: number; charms: Charm[];
  wageClaimed: boolean; debtDays: number; over: boolean; volume: number;
}
const pairs: [Shape, Shape][] = [['triangle', 'square'], ['star', 'circle'], ['triangle', 'star'], ['square', 'circle'], ['triangle', 'circle'], ['square', 'star']];
export function quota(day: number): Counts {
  const q = counts(); const n = Math.ceil(3 * 1.1 ** (day - 1));
  pairs[(day - 1) % pairs.length].forEach(s => q[s] = n); return q;
}
export function fresh(): State {
  return { version: 1, day: 1, minute: 480, coins: 20, bank: 0, inventory: counts(2), xp: counts(), due: quota(1), paid: counts(), debt: counts(), hunger: 100, thirst: 100, energy: 100, pen: 1, hand: 1, water: 0, food: 0, books: 0, charms: [], wageClaimed: false, debtDays: 0, over: false, volume: .35 };
}
export const sum = (c: Counts) => SHAPES.reduce((n, s) => n + c[s], 0);
export function timeLabel(minute: number) { const n = Math.floor(minute) % 1440; return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; }
export function tick(s: State, seconds: number) {
  if (s.over) return;
  const minutes = Math.min(seconds * CONFIG.minutesPerSecond, CONFIG.dayEnd - s.minute);
  s.minute += minutes;
  s.hunger = Math.max(0, s.hunger - minutes / 15);
  s.thirst = Math.max(0, s.thirst - minutes / 12);
  s.energy = Math.max(0, s.energy - minutes / 24);
}
export function proficiency(s: State, shape: Shape) { return Math.min(5, 1 + Math.floor(s.xp[shape] / 5)); }
export function drawingStats(s: State, shape: Shape) {
  const weakness = [s.hunger, s.thirst, s.energy].reduce((n, v) => n + Math.max(0, (40 - v) / 40), 0) / 3;
  const level = proficiency(s, shape);
  return { seconds: 20 / (1 + .16 * (s.pen - 1) + .08 * (level - 1)) * (1 + weakness * .85), jitter: (2.5 / s.hand) * (1 + weakness * 2), tolerance: .06 + .003 * (level - 1), level };
}
export function finishDrawing(s: State, shape: Shape) { s.inventory[shape]++; s.xp[shape]++; }
export function deliver(s: State) {
  let delivered = 0;
  for (const shape of SHAPES) {
    const old = Math.min(s.inventory[shape], s.debt[shape]);
    s.inventory[shape] -= old; s.debt[shape] -= old; delivered += old;
    const now = Math.min(s.inventory[shape], s.due[shape] - s.paid[shape]);
    s.inventory[shape] -= now; s.paid[shape] += now; delivered += now;
  }
  if (sum(s.debt) === 0) s.debtDays = 0;
  let wage = 0;
  if (!s.wageClaimed && SHAPES.every(shape => s.paid[shape] >= s.due[shape])) {
    wage = sum(s.due) * CONFIG.wage; s.coins += wage; s.wageClaimed = true;
  }
  return { delivered, wage };
}
export function sleep(s: State) {
  for (const shape of SHAPES) s.debt[shape] += s.due[shape] - s.paid[shape];
  s.debtDays = sum(s.debt) ? s.debtDays + 1 : 0;
  if (s.debtDays >= 3) { s.over = true; return { interest: 0, energy: s.energy, failed: true }; }
  const interest = Math.floor(s.bank * CONFIG.interest); s.bank += interest;
  const energy = Math.max(60, 100 - Math.max(0, s.minute - 1320) / 60 * 10);
  s.energy = energy; s.day++; s.minute = CONFIG.dayStart; s.due = quota(s.day); s.paid = counts(); s.wageClaimed = false;
  return { interest, energy, failed: false };
}
export const PRODUCTS = {
  water: { name: '瓶装水', price: 5, desc: '使用后恢复50口渴' },
  food: { name: '便当', price: 8, desc: '使用后恢复40饥饿' },
  books: { name: '绘画技能书', price: 30, desc: '使用时选择图形，增加5点熟练度' },
  top: { name: '晨光挂件', price: 100, desc: '开启上行中奖线' },
  bottom: { name: '月影挂件', price: 100, desc: '开启下行中奖线' },
  triple: { name: '幸运星挂件', price: 80, desc: '每条三连额外奖励1块' },
} as const;
export function buy(s: State, item: keyof typeof PRODUCTS) {
  const p = PRODUCTS[item]; if (s.coins < p.price) return false;
  if (item === 'water' || item === 'food' || item === 'books') s[item]++;
  else { if (s.charms.includes(item)) return false; s.charms.push(item); }
  s.coins -= p.price; return true;
}
export function upgrade(s: State, key: 'pen' | 'hand') {
  const cost = CONFIG.upgradeCosts[s[key] - 1]; if (cost === undefined || s.coins < cost) return false;
  s.coins -= cost; s[key]++; return true;
}
export function useItem(s: State, item: 'water' | 'food' | 'books', shape: Shape = 'triangle') {
  if (!s[item]) return false; s[item]--;
  if (item === 'water') s.thirst = Math.min(100, s.thirst + 50);
  if (item === 'food') s.hunger = Math.min(100, s.hunger + 40);
  if (item === 'books') s.xp[shape] += 5;
  return true;
}
export function sell(s: State, shape: Shape) { if (!s.inventory[shape]) return false; s.inventory[shape]--; s.coins += CONFIG.salePrice; return true; }
export function transfer(s: State, amount: number, deposit: boolean) {
  if (!Number.isSafeInteger(amount) || amount <= 0) return false;
  if (deposit ? s.coins < amount : s.bank < amount) return false;
  s.coins += deposit ? -amount : amount; s.bank += deposit ? amount : -amount; return true;
}
export interface SlotWin { row: number; shape: Shape; length: number; reward: number }
export function roll(random = Math.random): Shape[][] { return Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => SHAPES[Math.min(3, Math.floor(random() * 4))])); }
export function evaluate(grid: Shape[][], charms: Charm[]): SlotWin[] {
  const rows = [1, ...(charms.includes('top') ? [0] : []), ...(charms.includes('bottom') ? [2] : [])];
  return rows.flatMap(row => {
    const line = grid[row]; let length = 1; while (length < 4 && line[length] === line[0]) length++;
    return length >= 3 ? [{ row, shape: line[0], length, reward: length === 4 ? 15 : 5 + (charms.includes('triple') ? 1 : 0) }] : [];
  });
}
// Deduct and settle together before animation: a reload cannot erase a paid result.
export function spin(s: State, stake: Shape, random = Math.random) {
  if (!s.inventory[stake]) return null;
  s.inventory[stake]--; const grid = roll(random); const wins = evaluate(grid, s.charms);
  wins.forEach(w => s.inventory[w.shape] += w.reward); return { grid, wins };
}
export const SAVE_KEY = 'four-walls-studio-v1';
export function decode(raw: string | null): State | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as State; const base = fresh();
    if (s.version !== 1 || Object.keys(base).some(k => !(k in s))) return null;
    const numeric = ['day','minute','coins','bank','hunger','thirst','energy','pen','hand','water','food','books','debtDays','volume'] as const;
    if (numeric.some(k => !Number.isFinite(s[k]) || s[k] < 0)) return null;
    if (s.day < 1 || s.minute < 480 || s.minute > 1560 || s.pen < 1 || s.pen > 5 || s.hand < 1 || s.hand > 5) return null;
    for (const k of ['inventory','xp','due','paid','debt'] as const) if (SHAPES.some(p => !Number.isSafeInteger(s[k]?.[p]) || s[k][p] < 0)) return null;
    if (!Array.isArray(s.charms) || s.charms.some(c => !['top','bottom','triple'].includes(c))) return null;
    if (typeof s.over !== 'boolean' || typeof s.wageClaimed !== 'boolean') return null;
    return s;
  } catch { return null; }
}
