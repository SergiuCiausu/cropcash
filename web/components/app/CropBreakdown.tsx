'use client';
/* "Pe culturi": each crop's money for the whole harvest year, under the farm's totals on Acasă and
   Prognoză. What belongs to no crop has its own row, so the rows add up to the total. Tapping a crop
   opens its tab in place. */
import { ha } from '../../lib/cc/format';
import { harvestName } from '../../lib/cc/harvests';
import type { FarmPlan, FarmView } from '../../lib/cc/plan';
import { useStore } from '../../lib/cc/react';
import { ResultsBasisSwitch, useResultsBasis } from './Basis';

export function CropBreakdown({ view, year = 'medium', className }: { view: FarmView; year?: keyof FarmPlan['timelines']; className?: string }) {
  const store = useStore();
  const { rows, shared, total } = view.cropBreakdown(year);
  const hasShared = shared.inBani !== 0 || shared.outBani !== 0;
  const totalAri = rows.reduce((s, r) => s + r.areaAri, 0);
  /* Per hectare, a crop goes by its own hectares; what's shared and the total by the whole harvest's. */
  const { show } = useResultsBasis();
  const lei = (bani: number, ari: number) => show(bani, ari);
  const signed = (bani: number, ari: number) => show(bani, ari, 'signed');
  return (
    <section className={`card ${className ?? ''}`}>
      <div className="card-h">
        <h2>Pe culturi</h2>
        <span>{harvestName(view.scoped)}, estimat</span>
        <ResultsBasisSwitch />
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
              <td data-l="Intră">{lei(r.inBani, r.areaAri)}</td>
              <td data-l="Ies">{lei(r.outBani, r.areaAri)}</td>
              <td data-l="Rămâne">{signed(r.leftBani, r.areaAri)}</td>
            </tr>
          ))}
          {hasShared && (
            <tr>
              <th scope="row">Comune și credite</th>
              <td data-l="Hectare"></td>
              <td data-l="Intră">{lei(shared.inBani, totalAri)}</td>
              <td data-l="Ies">{lei(shared.outBani, totalAri)}</td>
              <td data-l="Rămâne">{signed(shared.inBani - shared.outBani, totalAri)}</td>
            </tr>
          )}
          <tr className="crop-total">
            <th scope="row">Total</th>
            <td data-l="Hectare">{ha(totalAri)}</td>
            <td data-l="Intră">{lei(total.inBani, totalAri)}</td>
            <td data-l="Ies">{lei(total.outBani, totalAri)}</td>
            <td data-l="Rămâne">{signed(total.leftBani, totalAri)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
