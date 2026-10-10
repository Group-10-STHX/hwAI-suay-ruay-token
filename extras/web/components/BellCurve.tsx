'use client';
// Normal curve fitted to every eligible human's survival %, with the viewer's position shaded.
// Percentile itself is empirical (mid-rank), the curve is the N(μ, σ) fit — both are labelled.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Distribution } from '@/lib/types';
import { fmt1 } from '@/lib/format';
import { percentileOf } from '@/lib/survival';

const L = 20, R = 20, T = 56, AXIS = 214;

export function BellCurve({ dist, you, handle }: { dist: Distribution; you: number | null; handle: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ vx: number; text: string } | null>(null);
  // Draw in real pixels (viewBox = measured width) so labels stay 11–13px on phones too.
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const x = (v: number) => L + (v / 100) * (W - L - R);
  const { mean, sd } = dist;
  const values = useMemo(() => dist.values.map((v) => v.survival), [dist]);

  const geo = useMemo(() => {
    const y = (v: number) => {
      const pdf = Math.exp(-0.5 * ((v - mean) / sd) ** 2);
      return AXIS - pdf * (AXIS - T);
    };
    const pts: [number, number][] = [];
    for (let v = 0; v <= 100; v += 0.5) pts.push([x(v), y(v)]);
    const curve = 'M' + pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join('L');
    let below = '';
    if (you !== null) {
      const cut = pts.filter(([a]) => a <= x(you));
      below = `M${x(0)},${AXIS}L` + cut.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join('L') + `L${x(you).toFixed(1)},${y(you).toFixed(1)}L${x(you).toFixed(1)},${AXIS}Z`;
    }
    // beeswarm-lite rug: stack dots that would overlap
    const rows: number[] = [];
    const rug = [...dist.values].sort((a, b) => a.survival - b.survival).map((p) => {
      const px = x(p.survival);
      let row = rows.findIndex((last) => px - last >= 9);
      if (row < 0) { row = rows.length; rows.push(px); } else rows[row] = px;
      return { ...p, px, py: AXIS + 34 + Math.min(row, 5) * 9 };
    });
    return { y, curve, below, rug, height: AXIS + 34 + Math.min(rows.length, 6) * 9 + 14 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dist, mean, sd, you, W]);

  if (dist.n < 3 || sd === 0) return <p className="chart-note">ข้อมูลมนุษย์ยังไม่พอจะวาดกราฟระฆัง (ต้องมีอย่างน้อย 3 คนที่ไหว้ครบ {dist.min_attempts} ครั้ง)</p>;

  const sigmas = [-2, -1, 0, 1, 2].map((k) => ({ k, v: mean + k * sd })).filter((s) => s.v >= 0 && s.v <= 100);
  const youX = you === null ? 0 : x(you), youP = you === null ? null : percentileOf(you, values);
  const flip = youX > W * 0.62;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W, vy = ((e.clientY - r.top) / r.width) * W;
    const near = geo.rug.find((d) => Math.abs(d.px - vx) < 6 && Math.abs(d.py - vy) < 8);
    if (near) return setHover({ vx: near.px, text: `${near.display_name} · ${fmt1(near.survival)}%` });
    const v = Math.min(100, Math.max(0, ((vx - L) / (W - L - R)) * 100));
    setHover({ vx: x(v), text: `โอกาสรอด ${fmt1(v)}% → เหนือกว่า ${fmt1(percentileOf(v, values))}% ของมนุษย์` });
  }

  const tipLeft = hover && box.current ? (hover.vx / W) * box.current.clientWidth : 0;

  return (
    <div className="chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${geo.height}`} role="img" onPointerMove={onMove} onPointerLeave={() => setHover(null)}
        aria-label={`กราฟระฆังโอกาสรอดของมนุษย์ ${dist.n} คน ค่าเฉลี่ย ${mean}% ส่วนเบี่ยงเบน ${sd}%${youP !== null ? ` คุณอยู่ percentile ${youP}` : ''}`}>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line className="grid-line" x1={x(v)} x2={x(v)} y1={T - 20} y2={AXIS} />
            <text className="tick" x={x(v)} y={AXIS + 18} textAnchor="middle">{v}%</text>
          </g>
        ))}
        {geo.below ? <path className="below" d={geo.below} /> : null}
        <path className="curve" d={geo.curve} />
        <line className="axis" x1={L} x2={W - R} y1={AXIS} y2={AXIS} />
        {sigmas.map((s) => (
          <text key={s.k} className="tick" x={x(s.v)} y={AXIS - 6} textAnchor="middle" opacity={0.8}>
            {s.k === 0 ? 'μ' : `${s.k > 0 ? '+' : '−'}${Math.abs(s.k)}σ`}
          </text>
        ))}
        {geo.rug.map((d) => <circle key={d.handle} className={`rug${d.handle === handle ? ' hot' : ''}`} cx={d.px} cy={d.py} r={4} />)}
        {you !== null && youP !== null ? (
          <g>
            <line className="you-line" x1={youX} x2={youX} y1={geo.y(you)} y2={AXIS + 26} />
            <circle className="you-dot" cx={youX} cy={geo.y(you)} r={6} />
            <text className="you-label" x={youX + (flip ? -10 : 10)} y={Math.max(18, geo.y(you) - 22)} textAnchor={flip ? 'end' : 'start'}>คุณอยู่ตรงนี้</text>
            <text className="you-sub" x={youX + (flip ? -10 : 10)} y={Math.max(34, geo.y(you) - 6)} textAnchor={flip ? 'end' : 'start'}>P{fmt1(youP)} · {fmt1(you)}%</text>
          </g>
        ) : null}
        {hover ? <line className="cross" x1={hover.vx} x2={hover.vx} y1={T - 20} y2={AXIS} /> : null}
      </svg>
      {hover ? <div className="chart-tip" style={{ left: tipLeft, top: 8 }}>{hover.text}</div> : null}
      <p className="chart-note">เส้นโค้ง = การแจกแจงปกติที่ fit กับมนุษย์ {dist.n} คน (μ {fmt1(mean)}%, σ {fmt1(sd)}%) · จุด = มนุษย์แต่ละคน · percentile คิดจากอันดับจริง</p>
      <details>
        <summary>ดูเป็นตาราง</summary>
        <table>
          <tbody>
            <tr><th>มนุษย์</th><th>โอกาสรอด</th></tr>
            {[...dist.values].reverse().map((v) => <tr key={v.handle}><td>{v.display_name}</td><td>{fmt1(v.survival)}%</td></tr>)}
          </tbody>
        </table>
      </details>
    </div>
  );
}
