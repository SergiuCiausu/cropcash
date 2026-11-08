'use client';
/* "Pe culturi": each crop's money for the whole harvest year, under the farm's totals on Acasă and
   Prognoză. What belongs to no crop has its own row, so the rows add up to the total. Tapping a crop
   opens its tab in place. */
import { ha } from '../../lib/cc/format';
import { harvestName } from '../../lib/cc/harvests';
import type { FarmPlan, FarmView } from '../../lib/cc/plan';
import { useMoney, useStore } from '../../lib/cc/react';

export function CropBreakdown({ view, year = 'medium', className }: { view: FarmView; year?: keyof FarmPlan['timelines']; className?: string }) {
  const store = useStore();
  const { signed, lei } = useMoney();
  const { rows, shared, total } = view.cropBreakdown(year);
  const hasShared = shared.inBani !== 0 || shared.outBani !== 0;
  const totalAri = rows.reduce((s, r) => s + r.areaAri, 0);
  return (
    <section className={`card ${className ?? ''}`}>
      <div className="card-h">
        <h2>Pe culturi</h2>
        <span>{harvestName(view.scoped)}, estimat</span>
      </div>
      <table className="crop-table">
        <thead>
          <tr>
            <th scope="col">Cultura</th>
            <th scope="col">Hectare</th>
            <th scope="col">Intră</th>
            <th scope="col">Ies</th>
            <th scope="col">Rămâne</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cropId}>
              <th scope="row">
                <button type="button" className="link" onClick={() => store?.selectHarvest(view.selected.id, r.cropId)}>
                  {r.name}
                </button>
              </th>
              <td data-l="Hectare">{ha(r.areaAri)}</td>
              <td data-l="Intră">{lei(r.inBani)}</td>
              <td data-l="Ies">{lei(r.outBani)}</td>
              <td data-l="Rămâne">{signed(r.leftBani)}</td>
            </tr>
          ))}
          {hasShared && (
            <tr>
              <th scope="row">Comune și credite</th>
              <td data-l="Hectare"></td>
              <td data-l="Intră">{lei(shared.inBani)}</td>
              <td data-l="Ies">{lei(shared.outBani)}</td>
              <td data-l="Rămâne">{signed(shared.inBani - shared.outBani)}</td>
            </tr>
          )}
          <tr className="crop-total">
            <th scope="row">Total</th>
            <td data-l="Hectare">{ha(totalAri)}</td>
            <td data-l="Intră">{lei(total.inBani)}</td>
            <td data-l="Ies">{lei(total.outBani)}</td>
            <td data-l="Rămâne">{signed(total.leftBani)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
