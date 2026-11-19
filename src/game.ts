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
export type Bet = 1 | 5 | 10;
export type SlotSymbol = Shape | 'bomb';
export const SLOT_SYMBOLS: readonly SlotSymbol[] = [...SHAPES, 'bomb'];
export const SLOT_INFO = { ...INFO, bomb: { name: '炸弹', symbol: '💣', color: '#e57762' } };
export interface SlotRound {
  day: number; stake: Shape; multiplier: Bet; grid: SlotSymbol[][];
  wins: SlotWin[]; refund: boolean; bomb: boolean; payouts: Counts; lossesBefore: number;
}
export interface SlotState { losses: number; lockedDay: number; tray: Counts; round: SlotRound | null; last: SlotRound | null }
const freshSlot = (): SlotState => ({ losses: 0, lockedDay: 0, tray: counts(), round: null, last: null });
export interface State {
  version: 1; day: number; minute: number; coins: number; bank: number;
  inventory: Counts; xp: Counts; due: Counts; paid: Counts; debt: Counts;
  hunger: number; thirst: number; energy: number; pen: number; hand: number;
  water: number; food: number; books: number; charms: Charm[];
  wageClaimed: boolean; debtDays: number; over: boolean; volume: number;
  slot: SlotState;
}
const pairs: [Shape, Shape][] = [['triangle', 'square'], ['star', 'circle'], ['triangle', 'star'], ['square', 'circle'], ['triangle', 'circle'], ['square', 'star']];
export function quota(day: number): Counts {
  const q = counts(); const n = Math.ceil(3 * 1.1 ** (day - 1));
  pairs[(day - 1) % pairs.length].forEach(s => q[s] = n); return q;
}
export function fresh(): State {
  return { version: 1, day: 1, minute: 480, coins: 20, bank: 0, inventory: counts(2), xp: counts(), due: quota(1), paid: counts(), debt: counts(), hunger: 100, thirst: 100, energy: 100, pen: 1, hand: 1, water: 0, food: 0, books: 0, charms: [], wageClaimed: false, debtDays: 0, over: false, volume: .35, slot: freshSlot() };
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
  if (s.slot.round) return { interest: 0, energy: s.energy, failed: false, blocked: true };
  for (const shape of SHAPES) s.debt[shape] += s.due[shape] - s.paid[shape];
  s.debtDays = sum(s.debt) ? s.debtDays + 1 : 0;
  if (s.debtDays >= 3) { s.over = true; return { interest: 0, energy: s.energy, failed: true }; }
  const interest = Math.floor(s.bank * CONFIG.interest); s.bank += interest;
  const energy = Math.max(60, 100 - Math.max(0, s.minute - 1320) / 60 * 10);
  s.energy = energy; s.day++; s.minute = CONFIG.dayStart; s.due = quota(s.day); s.paid = counts(); s.wageClaimed = false;
  s.slot.lockedDay = 0;
  if (s.slot.last?.bomb) s.slot.last = null;
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
export const SLOT_BETS: readonly Bet[] = [1, 5, 10];
export const SLOT_PITY_STEP = .015;
export const SLOT_PITY_CAP = 10;
export const slotBonus = (losses: number) => Math.min(SLOT_PITY_CAP, Math.max(0, losses)) * SLOT_PITY_STEP;
const slotMatchChance = (losses: number) => Math.sqrt((.09 + slotBonus(losses)) / (.8 * (1 - .2 * .3 ** 3) ** 2));
// Bombs have a fixed transition chance, so loss protection never raises the
// four-bomb risk. Other rows' bombs override a normal winning line.
export const slotWinChance = (losses: number) => .09 + slotBonus(losses);
export function roll(random = Math.random, losses = 0): SlotSymbol[][] {
  return Array.from({ length: 3 }, () => {
    const row: SlotSymbol[] = [SLOT_SYMBOLS[Math.min(4, Math.floor(random() * 5))]];
    for (let col = 1; col < 4; col++) {
      const sample = random(), previous = row[col - 1];
      const match = previous === 'bomb' ? .3 : slotMatchChance(losses);
      const others = SLOT_SYMBOLS.filter(shape => shape !== previous);
      row.push(sample < match ? previous : others[Math.min(3, Math.floor((sample - match) / (1 - match) * 4))]);
    }
    return row;
  });
}
export function activeSlotRows(charms: Charm[]) { return [1, ...(charms.includes('top') ? [0] : []), ...(charms.includes('bottom') ? [2] : [])]; }
export function hasBombLine(grid: SlotSymbol[][]) { return grid.some(row => row.length === 4 && row.every(symbol => symbol === 'bomb')); }
export function evaluate(grid: SlotSymbol[][], charms: Charm[]): SlotWin[] {
  if (hasBombLine(grid)) return [];
  const rows = activeSlotRows(charms);
  return rows.flatMap(row => {
    const line = grid[row]; let length = 1; while (length < 4 && line[length] === line[0]) length++;
    return length >= 3 && line[0] !== 'bomb' ? [{ row, shape: line[0], length, reward: length === 4 ? 15 : 5 + (charms.includes('triple') ? 1 : 0) }] : [];
  });
}
export function slotOutcome(s: State, stake: Shape, multiplier: Bet, grid: SlotSymbol[][]): SlotRound {
  const bomb = hasBombLine(grid), payouts = counts();
  const wins = evaluate(grid, s.charms).map(win => ({ ...win, reward: win.reward * multiplier }));
  const refund = !bomb && !wins.length && activeSlotRows(s.charms).some(row => grid[row][0] === stake && grid[row][1] === stake && grid[row][2] !== stake);
  wins.forEach(win => payouts[win.shape] += win.reward);
  if (refund) payouts[stake] = multiplier;
  return { day: s.day, stake, multiplier, grid, wins, refund, bomb, payouts, lossesBefore: s.slot.losses };
}
// Save the paid round before animation. Revealing moves prizes into the tray;
// only an explicit collection credits inventory. All three steps are idempotent.
export function spin(s: State, stake: Shape, multiplier: Bet = 1, random = Math.random): SlotRound | null {
  if (s.over || !SHAPES.includes(stake) || !SLOT_BETS.includes(multiplier) || s.slot.lockedDay === s.day || s.slot.round || sum(s.slot.tray) || s.inventory[stake] < multiplier) return null;
  const round = slotOutcome(s, stake, multiplier, roll(random, s.slot.losses));
  s.inventory[stake] -= multiplier; s.slot.round = round; return round;
}
export function revealSpin(s: State): SlotRound | null {
  const round = s.slot.round; if (!round) return null;
  s.slot.round = null; s.slot.last = round;
  if (round.bomb) { s.slot.lockedDay = round.day; s.slot.losses++; }
  else if (round.wins.length) s.slot.losses = 0;
  else if (!round.refund) s.slot.losses++;
  SHAPES.forEach(shape => s.slot.tray[shape] += round.payouts[shape]);
  return round;
}
export function claimSlotPayout(s: State): Counts {
  if (s.slot.round) return counts();
  const claimed = { ...s.slot.tray }; s.slot.tray = counts();
  SHAPES.forEach(shape => s.inventory[shape] += claimed[shape]);
  return claimed;
}
export const SAVE_KEY = 'four-walls-studio-v1';
export function decode(raw: string | null): State | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as State; const base = fresh();
    // Existing v1 saves keep their inventory and gain an empty, unlocked machine.
    if (s && s.version === 1 && !Object.hasOwn(s, 'slot')) s.slot = freshSlot();
    if (s.version !== 1 || Object.keys(base).some(k => !(k in s))) return null;
    const numeric = ['day','minute','coins','bank','hunger','thirst','energy','pen','hand','water','food','books','debtDays','volume'] as const;
    if (numeric.some(k => !Number.isFinite(s[k]) || s[k] < 0)) return null;
    if (s.day < 1 || s.minute < 480 || s.minute > 1560 || s.pen < 1 || s.pen > 5 || s.hand < 1 || s.hand > 5) return null;
    for (const k of ['inventory','xp','due','paid','debt'] as const) if (SHAPES.some(p => !Number.isSafeInteger(s[k]?.[p]) || s[k][p] < 0)) return null;
    if (!Array.isArray(s.charms) || s.charms.some(c => !['top','bottom','triple'].includes(c))) return null;
    if (typeof s.over !== 'boolean' || typeof s.wageClaimed !== 'boolean') return null;
    const validCounts = (value: Counts) => value && SHAPES.every(shape => Number.isSafeInteger(value[shape]) && value[shape] >= 0);
    const integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
    if (!s.slot || !integer(s.slot.losses) || !integer(s.slot.lockedDay) || s.slot.lockedDay > s.day || !validCounts(s.slot.tray)) return null;
    for (const round of [s.slot.round, s.slot.last]) {
      if (round === null) continue;
      if (!round || !integer(round.day) || round.day < 1 || round.day > s.day || !SHAPES.includes(round.stake) || !SLOT_BETS.includes(round.multiplier) || !integer(round.lossesBefore)) return null;
      if (!Array.isArray(round.grid) || round.grid.length !== 3 || round.grid.some(row => !Array.isArray(row) || row.length !== 4 || row.some(symbol => !SLOT_SYMBOLS.includes(symbol)))) return null;
      if (!validCounts(round.payouts) || typeof round.bomb !== 'boolean' || typeof round.refund !== 'boolean' || !Array.isArray(round.wins)) return null;
      if (round.wins.some(win => !integer(win.row) || win.row > 2 || !SHAPES.includes(win.shape) || ![3, 4].includes(win.length) || !integer(win.reward) || win.reward < 1)) return null;
    }
    return s;
  } catch { return null; }
}
