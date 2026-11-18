/* A page's title and the line under it (.page-h). */
import { Bone } from './Bone';

export default function PageHeadSkeleton({ action = false }: { action?: boolean }) {
  return (
    <header className="page-h sk-head">
      <div>
        <Bone w={220} h={40} r={10} className="sk-title" />
        <Bone w={300} h={18} className="sk-lead" />
      </div>
      {action ? <Bone w={150} h={44} r={22} /> : null}
    </header>
  );
}
