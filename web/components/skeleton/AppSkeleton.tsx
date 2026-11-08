/* What an app page looks like before it's filled: the frame, Ion's strip on his farm, the title, and
   the screen's own shapes (screens.tsx). */
import type { ReactNode } from 'react';
import type { Mode } from '../../lib/paths';
import { Bone, BoneText } from './Bone';
import PageHeadSkeleton from './PageHeadSkeleton';
import RailSkeleton from './RailSkeleton';

function DemoStrip() {
  return (
    <div className="demo-strip">
      <BoneText lines={2} h={11} />
      <div className="demo-acts">
        <Bone w={96} h={40} r={20} />
        <Bone w={150} h={40} r={20} />
      </div>
    </div>
  );
}

export default function AppSkeleton({ mode = 'farm', action = false, children }: { mode?: Mode; action?: boolean; children: ReactNode }) {
  return (
    <RailSkeleton>
      {mode === 'demo' ? <DemoStrip /> : null}
      <PageHeadSkeleton action={action} />
      {children}
    </RailSkeleton>
  );
}
