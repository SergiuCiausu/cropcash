'use client';
/* One report in a sheet, opened from another page (De raportat) so the farmer makes the PDF without
   leaving it. Same card as on /rapoarte, so it works offline and on Ion's farm the same way; the PDF
   code and the parcels load only once the sheet is open. "Toate rapoartele" goes to the full page. */
import { useContext } from 'react';
import { REPORTS, type ReportId } from '../../lib/reports/build';
import { Sheet, useHref } from '../app/bits';
import { FrameContext } from '../app/context';
import { PageLink } from '../app/Frame';
import { useFarm, useView } from '../../lib/cc/react';
import { ReportCard } from './ReportCards';
import '../../styles/reports.css';

export const isReportId = (id: string | null | undefined): id is ReportId => REPORTS.some((r) => r.id === id);

export function ReportSheet({ report, onClose }: { report: ReportId | null; onClose: () => void }) {
  const def = REPORTS.find((r) => r.id === report) ?? null;
  return (
    <Sheet open={def !== null} onClose={onClose} className="detail report-sheet" label={def?.title ?? 'Raport'}>
      {def && <ReportBody id={def.id} onClose={onClose} />}
    </Sheet>
  );
}

function ReportBody({ id, onClose }: { id: ReportId; onClose: () => void }) {
  const def = REPORTS.find((r) => r.id === id)!;
  const farm = useFarm()!;
  const view = useView('farm')!;
  const href = useHref();
  const { notify } = useContext(FrameContext);
  return (
    <>
      <div className="top">
        <div>
          <h2 tabIndex={-1} autoFocus>
            {def.title}
          </h2>
          <p className="note">{def.about}</p>
        </div>
        <button type="button" className="x" aria-label="Închide" onClick={onClose}>
          ×
        </button>
      </div>
      {farm.isIon && <p className="note">Pe ferma lui Ion, raportul e un exemplu și scrie asta pe fiecare pagină.</p>}
      <ReportCard
        bare
        def={def}
        plots="own"
        farm={farm}
        view={view}
        onSaved={() => notify({ tone: 'info', title: 'Raportul e gata', body: 'Îl găsești în Descărcări.' })}
      />
      <p className="report-sheet-all">
        <PageLink path="/rapoarte" href={href(`/rapoarte#r-${id}`)}>
          Toate rapoartele
        </PageLink>
      </p>
    </>
  );
}
