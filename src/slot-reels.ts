import { INFO, SHAPES, type Shape, type SlotWin } from './game';

const FACE_COUNT = 16;
const FACE_ANGLE = 360 / FACE_COUNT;
const LANDING_FACE = 8;
export const REEL_STOP_TIMES = [1.8, 2.4, 3, 3.6] as const;
export const SPIN_DURATION = REEL_STOP_TIMES[3] + .18;
export const idleGrid = (): Shape[][] => Array.from({ length: 3 }, (_, row) => Array.from({ length: 4 }, (_, col) => SHAPES[(row + col) % 4]));

export function reelPose(col: number, elapsed: number) {
  const duration = REEL_STOP_TIMES[col], rotations = 4 + col, travel = (rotations * FACE_COUNT + LANDING_FACE) * FACE_ANGLE;
  const t = Math.max(0, Math.min(1, elapsed / duration));
  // Integrate acceleration, constant speed, then a smooth deceleration. Both
  // ends have zero velocity, so a reel never teleports onto its final symbol.
  const accelerate = .12, slow = .52, area = (accelerate + slow) / 2 + (1 - accelerate - slow);
  let distance: number;
  if (t < accelerate) distance = t * t / (2 * accelerate);
  else if (t < 1 - slow) distance = accelerate / 2 + t - accelerate;
  else { const u = (t - (1 - slow)) / slow; distance = accelerate / 2 + 1 - accelerate - slow + slow * (u - u * u / 2); }
  const settling = elapsed - duration;
  const bounce = settling > 0 && settling < .18 ? -Math.sin(settling / .18 * Math.PI) * 1.6 : 0;
  return { angle: -travel * distance / area + bounce, stopped: elapsed >= duration };
}

export class SlotReels {
  private columns: HTMLElement[];
  private rings: HTMLElement[];
  private stopped = -1;
  constructor(private host: HTMLElement, previous: Shape[][], private result: Shape[][] | null, private onStop: (column: number) => void) {
    host.innerHTML = `<div class="reel-columns">${Array.from({ length: 4 }, (_, col) => {
      const faces: Shape[] = Array.from({ length: FACE_COUNT }, (_, i) => SHAPES[(i * 3 + col) % 4]);
      faces[0] = previous[1][col]; faces[1] = previous[0][col]; faces[15] = previous[2][col];
      if (result) { faces[LANDING_FACE] = result[1][col]; faces[LANDING_FACE + 1] = result[0][col]; faces[LANDING_FACE - 1] = result[2][col]; }
      return `<div class="reel-column" data-column="${col}" data-state="${result ? 'spinning' : 'idle'}" role="img" aria-label="第${col + 1}列${result ? '转动中' : '图形卷轴'}"><div class="reel-cylinder" aria-hidden="true">${faces.map((s, face) => `<div class="reel-symbol" data-face="${face}" style="--face-angle:${face * FACE_ANGLE}deg;--shape:${INFO[s].color}"><span>${INFO[s].symbol}</span></div>`).join('')}</div><div class="reel-shade"></div><div class="reel-glint"></div></div>`;
    }).join('')}</div><div class="slot-paylines" aria-hidden="true">${Array.from({ length: 3 }, (_, row) => `<div class="slot-payline" data-row="${row}" style="--row:${row}"></div>`).join('')}</div>`;
    this.columns = [...host.querySelectorAll<HTMLElement>('.reel-column')];
    this.rings = [...host.querySelectorAll<HTMLElement>('.reel-cylinder')];
  }
  update(elapsed: number, announce = true) {
    let count = 0;
    for (let col = 0; col < 4; col++) {
      const pose = this.result ? reelPose(col, elapsed) : { angle: 0, stopped: false };
      this.rings[col].style.transform = `translateZ(calc(-1 * var(--reel-radius))) rotateX(${pose.angle}deg)`;
      this.columns[col].dataset.state = this.result ? pose.stopped ? 'stopped' : 'spinning' : 'idle';
      if (pose.stopped && this.result) {
        count++;
        this.columns[col].setAttribute('aria-label', `第${col + 1}列：${this.result.map(row => INFO[row[col]].name).join('、')}`);
      }
    }
    if (this.stopped >= 0 && announce && count > this.stopped) for (let col = this.stopped; col < count; col++) this.onStop(col);
    this.stopped = count;
    return count;
  }
  highlight(activeRows: number[], wins: SlotWin[] = []) {
    this.host.querySelectorAll<HTMLElement>('.slot-payline').forEach(line => {
      const row = Number(line.dataset.row);
      line.classList.toggle('enabled', activeRows.includes(row));
      line.classList.toggle('winning', wins.some(win => win.row === row));
    });
    this.columns.forEach((column, col) => column.classList.toggle('winning-column', wins.some(win => col < win.length)));
  }
}
