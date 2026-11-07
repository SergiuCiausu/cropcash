export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

const C = 2 * Math.PI * 15.9;

export function Donut({ slices, center, centerLabel }: { slices: DonutSlice[]; center: string; centerLabel: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let off = 0;
  return (
    <div className="donut">
      <div className="ring">
        <svg viewBox="0 0 42 42" aria-hidden="true">
          {slices.map((s) => {
            const len = (s.value / total) * C;
            const el = (
              <circle
                key={s.key}
                cx="21"
                cy="21"
                r="15.9"
                fill="none"
                strokeWidth={5}
                style={{ stroke: s.color }}
                strokeDasharray={`${Math.max(len - 0.7, 0.2).toFixed(2)} ${C.toFixed(2)}`}
                strokeDashoffset={(-off).toFixed(2)}
              />
            );
            off += len;
            return el;
          })}
        </svg>
        <div>
          <span>{center}</span>
          <small>{centerLabel}</small>
        </div>
      </div>
      <ul className="leg">
        {slices.map((s) => (
          <li key={s.key}>
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <b>{Math.round((s.value / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
