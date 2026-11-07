export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string; // CSS variable name, e.g. "--c3"
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
                stroke={`var(${s.color})`}
                strokeWidth={5.5}
                strokeDasharray={`${Math.max(len - 0.7, 0.2)} ${C}`}
                strokeDashoffset={-off}
              />
            );
            off += len;
            return el;
          })}
        </svg>
        <div>
          <b>{center}</b>
          <small>{centerLabel}</small>
        </div>
      </div>
      <ul className="legend">
        {slices.map((s) => (
          <li key={s.key}>
            <span>
              <i style={{ background: `var(${s.color})` }} />
              {s.label}
            </span>
            <span>{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
