// Spending over days as an area chart. One scale places line, fill and gridlines; the SVG stretches
// to its box, so the endpoint marker is drawn outside it to stay round.

import styles from "./chart.module.css";

export default function SpendChart({ values, labels, label }: { values: number[]; labels: string[]; label: string }) {
  const w = 300, h = 100, pad = 6;
  const max = Math.max(1, ...values) * 1.15;
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, values.length - 1);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1)},${h - pad} L${x(0)},${h - pad} Z`;
  const last = values.length - 1;
  return (
    <figure className={styles.chart} aria-label={label}>
      <div className={styles.plot}>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="spendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#111312" stopOpacity=".14" /><stop offset="1" stopColor="#111312" stopOpacity="0" /></linearGradient></defs>
          {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={pad} x2={w - pad} y1={y(max * g)} y2={y(max * g)} stroke="#111312" strokeOpacity=".06" vectorEffect="non-scaling-stroke" />)}
          <path d={area} fill="url(#spendFill)" />
          <path d={line} fill="none" stroke="#111312" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        <span className={styles.endpoint} style={{ left: `${(x(last) / w) * 100}%`, top: `${(y(values[last]) / h) * 100}%` }} />
      </div>
      <figcaption>{labels.map((d, i) => <span key={`${d}-${i}`}>{d}</span>)}</figcaption>
    </figure>
  );
}
