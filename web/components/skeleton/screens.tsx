/* One skeleton per screen, built from that page's real grid classes, so what fades out and what
   appears sit in the same places. Shapes only. `satisfies` makes a screen missing here a type error.
   They live here and not in web/screens so a screen can move to React without touching its skeleton. */
import type { ComponentType, ReactNode } from 'react';
import type { ScreenName } from '../../screens/types';
import { Bone, BoneCard } from './Bone';

const repeat = (n: number, draw: (i: number) => ReactNode) => Array.from({ length: n }, (_, i) => draw(i));

/** A lime hero: small label, big amount, a line under it. */
function Hero({ span, className, small = false, children }: { span?: string; className?: string; small?: boolean; children?: ReactNode }) {
  return (
    <section className={['chart-card field hero-card', span, className].filter(Boolean).join(' ')}>
      <div className="sk-stack">
        <Bone w={150} h={12} className="on-field" />
        <Bone w="62%" h={small ? 36 : 46} r={10} className="on-field" />
        <Bone w="80%" h={13} className="on-field" />
        {small ? null : <Bone w="50%" h={13} className="on-field" />}
      </div>
      {children}
    </section>
  );
}

/** Rows of a list: a name and its figure. */
function Rows({ n }: { n: number }) {
  return (
    <div className="sk-rows">
      {repeat(n, (i) => (
        <div key={i}>
          <Bone w={`${58 - (i % 3) * 10}%`} />
          <Bone w={72} />
        </div>
      ))}
    </div>
  );
}

function ListCard({ span, n }: { span: string; n: number }) {
  return (
    <BoneCard span={span}>
      <Rows n={n} />
    </BoneCard>
  );
}

function Field() {
  return (
    <div className="sk-stack sk-field">
      <Bone w={120} h={12} />
      <Bone h={52} r={14} />
    </div>
  );
}

function FormCard({ span, fields }: { span: string; fields: number }) {
  return <BoneCard span={span}>{repeat(fields, (i) => <Field key={i} />)}</BoneCard>;
}

function SubNav() {
  return <div className="subnav">{repeat(3, (i) => <Bone key={i} w={122} h={40} r={999} />)}</div>;
}

function VTabs({ n, className }: { n: number; className?: string }) {
  return <div className={className ? `vtabs ${className}` : 'vtabs'}>{repeat(n, (i) => <Bone key={i} w={84} h={42} r={11} />)}</div>;
}

function Verdict({ split }: { split: boolean }) {
  return (
    <section className={split ? 'cta field verdict split' : 'cta field verdict'}>
      <div className="sk-stack">
        <Bone w={120} h={12} className="on-field" />
        <Bone w="70%" h={26} r={8} className="on-field" />
        <Bone w="90%" h={13} className="on-field" />
      </div>
    </section>
  );
}

function Chart({ kind = 'fc-chart' }: { kind?: string }) {
  return (
    <div className={`chart ${kind}`}>
      <Bone h="100%" r={12} />
    </div>
  );
}

function ChartCard({ className, tabs = false }: { className?: string; tabs?: boolean }) {
  return (
    <section className={className ? `card ${className}` : 'card'}>
      <Bone w="45%" h={18} />
      {tabs ? <VTabs n={3} /> : null}
      <Chart />
    </section>
  );
}

const Acasa = () => (
  <>
    <div className="bento">
      <section className="card chart-card hero-card s8">
        <div className="sk-stack">
          <Bone w={110} h={12} />
          <Bone w="55%" h={46} r={10} />
          <Bone w="75%" h={13} />
        </div>
        <Chart />
      </section>
      <div className="s4 side-stats ac-side">
        {repeat(2, (i) => (
          <section key={i} className="card kpi sk-stack">
            <Bone w={110} h={12} />
            <Bone w="60%" h={24} r={8} />
            <Bone w="80%" h={12} />
          </section>
        ))}
      </div>
    </div>
    <div className="tiles gap">{repeat(4, (i) => <Bone key={i} h={136} r={20} className="sk-tile" />)}</div>
    <div className="bento gap">
      <ListCard span="s7" n={4} />
      <ListCard span="s5" n={3} />
    </div>
  </>
);

const Subventii = () => (
  <>
    <SubNav />
    <div className="bento">
      <Hero span="s6" />
      <ListCard span="s6" n={4} />
      <ListCard span="s7" n={4} />
      <ListCard span="s5" n={4} />
    </div>
  </>
);

const Calendar = () => (
  <section className="card cal">
    <div className="cal-h">
      <Bone w={170} h={24} r={8} />
      <Bone w={132} h={40} r={12} />
    </div>
    <div className="cal-body">
      <div className="cal-main">
        <div className="cal-week">{repeat(7, (i) => <span key={i}><Bone w={18} h={10} className="sk-center" /></span>)}</div>
        <div className="cal-grid">{repeat(35, (i) => <span key={i} className="sk-day" />)}</div>
      </div>
      <div className="cal-side">
        <Rows n={4} />
      </div>
    </div>
  </section>
);

const Prognoza = () => (
  <>
    <VTabs n={3} className="page-tabs" />
    <div className="fc-pair">
      <ChartCard className="fc-main" />
      <ChartCard tabs />
    </div>
    <div className="bento">
      <ListCard span="s6" n={4} />
      <ListCard span="s6" n={4} />
    </div>
  </>
);

const Recolte = () => (
  <div className="bento">
    <ListCard span="s12" n={4} />
    <section className="card s12 bone-card">
      <div className="h-log-h">
        <Bone w={90} h={18} />
        <VTabs n={3} />
      </div>
      <div className="sk-fields">{repeat(3, (i) => <Field key={i} />)}</div>
      <Rows n={5} />
    </section>
  </div>
);

/** The links between the money pages, drawn on phones. */
const withSalaryNav = (Page: () => React.ReactElement) => () => (
  <>
    <div className="subnav phone-only">{repeat(3, (i) => <Bone key={i} w={96} h={44} r={999} />)}</div>
    <Page />
  </>
);

const Salariu = () => (
  <div className="bento">
    <Hero span="s12" className="pay-hero">
      <div className="sk-years">{repeat(3, (i) => <Bone key={i} h={72} r={14} className="on-field" />)}</div>
    </Hero>
    <ListCard span="s5" n={6} />
    <ListCard span="s7" n={6} />
    <BoneCard span="s12" lines={2} />
  </div>
);

const Pensie = () => (
  <div className="bento">
    <Hero span="s12" />
    <FormCard span="s7" fields={2} />
    <ListCard span="s5" n={4} />
    <section className="card s12">
      <Bone w="45%" h={18} />
      <Chart kind="pn-chart" />
    </section>
  </div>
);

const DatePlan = () => (
  <>
    <Hero className="plan-preview" small />
    <div className="bento">
      <FormCard span="s6" fields={2} />
      <FormCard span="s6" fields={2} />
    </div>
  </>
);

const Bani = () => (
  <div className="bento">
    <ListCard span="s7" n={4} />
    <ListCard span="s5" n={4} />
    <BoneCard span="s7" lines={3} />
    <BoneCard span="s5" lines={2} />
  </div>
);

const Monitor = ({ split }: { split: boolean }) => (
  <>
    <SubNav />
    <Verdict split={split} />
    <VTabs n={3} />
    <section className="card">
      <Rows n={6} />
    </section>
  </>
);
const Oportunitati = () => <Monitor split />;
const Surse = () => <Monitor split={false} />;

export const SCREEN_SKELETONS = {
  acasa: Acasa,
  subventii: Subventii,
  oportunitati: Oportunitati,
  surse: Surse,
  calendar: Calendar,
  prognoza: Prognoza,
  recolte: Recolte,
  salariu: withSalaryNav(Salariu),
  pensie: withSalaryNav(Pensie),
  'date-plan': DatePlan,
  bani: withSalaryNav(Bani),
} satisfies Record<ScreenName, ComponentType>;

/** Screens whose title has a button next to it. */
export const WITH_ACTION: readonly ScreenName[] = ['acasa'];
