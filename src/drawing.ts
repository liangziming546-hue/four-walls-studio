import { Shape } from './game';
export type Point = { x: number; y: number };
export function outline(shape: Shape): Point[] {
  let vertices: Point[];
  if (shape === 'circle') vertices = Array.from({length: 97}, (_, i) => ({ x: .5 + .32 * Math.cos(i / 96 * Math.PI * 2 - Math.PI / 2), y: .5 + .32 * Math.sin(i / 96 * Math.PI * 2 - Math.PI / 2) }));
  else if (shape === 'triangle') vertices = [{x:.5,y:.16},{x:.86,y:.8},{x:.14,y:.8},{x:.5,y:.16}];
  else if (shape === 'square') vertices = [{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.8},{x:.2,y:.8},{x:.2,y:.2}];
  else { vertices = Array.from({ length: 11 }, (_, i) => { const r = i % 2 ? .145 : .35, a = i * Math.PI / 5 - Math.PI / 2; return { x: .5 + r * Math.cos(a), y: .5 + r * Math.sin(a) }; }); }
  const result: Point[] = [];
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i-1], b = vertices[i], steps = Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/.008);
    for (let j = 0; j < steps; j++) result.push({x:a.x+(b.x-a.x)*j/steps, y:a.y+(b.y-a.y)*j/steps});
  }
  return result;
}
export function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x-a.x, dy=b.y-a.y, l=dx*dx+dy*dy;
  const t = l ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)) : 0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
export function assess(path: Point[], strokes: Point[][], tolerance = .06) {
  const points = strokes.flat(); if (!points.length) return { coverage: 0, deviation: 1, valid: false };
  const segments = strokes.flatMap(s => s.slice(1).map((p,i) => [s[i],p] as const));
  const nearest = (p: Point) => Math.min(...path.map(q => Math.hypot(p.x-q.x,p.y-q.y)));
  const deviation = points.reduce((n,p) => n + nearest(p),0)/points.length;
  const covered = path.filter(p => segments.some(([a,b]) => distanceToSegment(p,a,b) <= .035)).length;
  const coverage = covered/path.length;
  return { coverage, deviation, valid: coverage >= .9 && deviation <= tolerance };
}
