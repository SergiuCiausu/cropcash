'use client';
/* "Cheltuieli pe hectar": what each crop really cost, added up on the phone from what was noted, so it
   works offline. Nothing here is an estimate: without records it shows nothing but how to start. */
import type { FarmView } from '../../lib/cc/plan';
import type { Harvest } from '../../lib/cc/harvests';
import { ha } from '../../lib/cc/format';
import { useMoney } from '../../lib/cc/react';

export function CostPerHa({ view, harvest, records, cropId, categories }: { view: FarmView; harvest: Harvest; records: Harvest['records']; cropId: string | null; categories: [string, string][] }) {
  const { signed: lei } = useMoney();
  const { crops, elsewhere } = view.costsOf(harvest, records);
  /* In the order the page lists the crops. */
  const order = harvest.parcels.map((p) => p.cropId);
  const shown = crops.filter((c) => (!cropId || c.cropId === cropId) && c.total > 0).sort((a, b) => order.indexOf(a.cropId) - order.indexOf(b.cropId));
  const label = (category: string) => categories.find(([k]) => k === category)?.[1] ?? category;
  const planned = (id: string) => (view.data().crops.crops.find((c) => c.id === id)?.cost_lei_per_ha.mean ?? 0) * 100;

  return (
    <section className="card s12">
      <div className="card-h">
        <h2>Cheltuieli pe hectar</h2>
        <span>Din ce ai notat</span>
      </div>
      {shown.length === 0 && <p className="note">Nu ai notat încă nicio cheltuială. Când notezi una, aici vezi cât te-a costat fiecare cultură pe hectar.</p>}
      {shown.map((c) => (
        <div className="cost-crop" key={c.cropId}>
          <div className="cost-crop-h">
            <h3>
              {view.cropName(c.cropId)}, {ha(c.areaAri)} ha
            </h3>
            <span className={`tag ${c.seasonDone ? 'd' : 'n'}`}>{c.seasonDone ? 'Sezon încheiat' : 'Până acum'}</span>
          </div>
          <table className="crop-table">
            <thead>
              <tr>
                <th scope="col">Pe ce</th>
                <th scope="col">Pentru cultură</th>
                <th scope="col">Partea din fermă</th>
                <th scope="col">Pe hectar</th>
              </tr>
            </thead>
            <tbody>
              {c.categories.map((k) => (
                <tr key={k.category}>
                  <th scope="row">{label(k.category)}</th>
                  <td data-l="Pentru cultură">{lei(k.direct)}</td>
                  <td data-l="Partea din fermă">{lei(k.shared)}</td>
                  <td data-l="Pe hectar">{lei(k.perHa)}</td>
                </tr>
              ))}
              <tr className="crop-total">
                <th scope="row">Total</th>
                <td data-l="Pentru cultură">{lei(c.direct)}</td>
                <td data-l="Partea din fermă">{lei(c.shared)}</td>
                <td data-l="Pe hectar">{lei(c.perHa)}</td>
              </tr>
            </tbody>
          </table>
          <p className="note">
            Pentru plan contează {lei(c.planPerHa)} pe hectar{c.seasonDone ? '' : ' până acum'}. În plan e {lei(planned(c.cropId))} pe hectar, pe tot sezonul.
            {c.planPerHa !== c.perHa && ' Arenda, reparațiile și altele nu intră în costul din plan.'}
          </p>
        </div>
      ))}
      {shown.some((c) => c.shared > 0) && <p className="note gap">Cheltuielile pentru toată ferma sunt împărțite după hectare.</p>}
      {elsewhere > 0 && !cropId && <p className="note gap">{lei(elsewhere)} sunt notați pe culturi care nu sunt în această recoltă.</p>}
    </section>
  );
}
