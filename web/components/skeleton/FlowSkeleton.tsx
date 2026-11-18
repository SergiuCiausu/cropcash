/* Onboarding before the farm store has loaded: its frame, a title and one card. No farm figures. */
import { Bone } from './Bone';
import BootSkeleton from './BootSkeleton';
import PageHeadSkeleton from './PageHeadSkeleton';
import RailSkeleton from './RailSkeleton';

const STEPS = [{}, {}, {}];

function Field() {
  return (
    <div className="sk-stack sk-field">
      <Bone w={120} h={12} />
      <Bone h={52} r={14} />
    </div>
  );
}

export default function FlowSkeleton() {
  return (
    <BootSkeleton>
      <div className="app ob-flow">
        <RailSkeleton tabs={STEPS}>
          <div className="ob-main">
            <PageHeadSkeleton />
            <section className="card bone-card">
              <Bone w="40%" h={18} />
              <Field />
              <Field />
            </section>
          </div>
        </RailSkeleton>
      </div>
    </BootSkeleton>
  );
}
