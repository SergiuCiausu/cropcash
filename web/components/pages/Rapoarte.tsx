'use client';
/* "Rapoarte": a PDF of the farm's money and land, for the farmer, the accountant or an institution.
   Shared by /rapoarte and /ferma-lui-ion/rapoarte (screens/rapoarte.tsx). Made on the phone from the
   saved farm, so it works without internet and on Ion's farm. On a farm with an account, the farmer
   can also let the accountant in to make the reports themselves (Sharing; that part needs internet). */
import { useContext, useState } from 'react';
import { useFarm, useView } from '../../lib/cc/react';
import { REPORTS } from '../../lib/reports/build';
import { FrameContext } from '../app/context';
import { ReportCards } from '../reports/ReportCards';
import { Sharing } from '../reports/Sharing';
import '../../styles/reports.css';

const AUDIENCES = [
  ['farmer', 'Pentru mine'],
  ['accountant', 'Pentru contabil'],
  ['institution', 'Pentru instituții'],
] as const;
type Audience = (typeof AUDIENCES)[number][0];

export default function Rapoarte() {
  const farm = useFarm()!;
  const view = useView('farm')!;
  const { notify } = useContext(FrameContext);
  const [audience, setAudience] = useState<Audience>('farmer');
  const reports = REPORTS.filter((r) => r.audiences.includes(audience));
  return (
    <>
      <header className="page-h">
        <div>
          <h1>Rapoarte</h1>
          <p className="lead">
            Fă un PDF cu banii și terenul fermei, pentru tine, pentru contabil sau pentru primărie. Îl trimiți pe WhatsApp sau pe e-mail, sau îl păstrezi pe telefon. Merge și fără internet.
          </p>
        </div>
      </header>
      {farm.isIon && <p className="note">Pe ferma lui Ion, raportul e un exemplu și scrie asta pe fiecare pagină.</p>}
      <div className="vtabs" role="group" aria-label="Pentru cine e raportul">
        {AUDIENCES.map(([a, label]) => (
          <button key={a} type="button" className="chip" aria-pressed={a === audience} onClick={() => setAudience(a)}>
            {label}
          </button>
        ))}
      </div>
      <ReportCards
        reports={reports}
        plots="own"
        farm={farm}
        view={view}
        onSaved={() => notify({ tone: 'info', title: 'Raportul e gata', body: 'Îl găsești în Descărcări.' })}
      />
      {farm.me ? (
        <div className="bento">
          <Sharing farmName={view.farm.name} />
        </div>
      ) : (
        farm.isIon && <p className="note">Pe ferma ta, cu cont, poți invita contabilul să-și facă singur rapoartele.</p>
      )}
    </>
  );
}
