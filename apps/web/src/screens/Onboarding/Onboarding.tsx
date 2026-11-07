import { useMemo, useState, type ReactNode } from 'react';
import { OnboardingInputSchema, loadData, type OnboardingInput, type SubsidyResult } from '@cropcash/shared';
import { t } from '../../i18n';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { fold, formatHa, parseHa } from '../../lib/format';
import { Alert } from '../../components/ui';

const data = loadData();
const TOTAL_STEPS = 4;

type Step = 'welcome' | 'county' | 'crops' | 'about' | 'money';

export interface OnboardingDone {
  name: string;
  subsidies: SubsidyResult;
}

const ageIsValid = (age: string) => /^\d{1,3}$/.test(age) && Number(age) >= 16 && Number(age) <= 100;

/** One centered glass card per step, matching the app's look. */
function Card({
  children,
  onBack,
  step,
  footer,
}: {
  children: ReactNode;
  onBack?: () => void;
  step?: number;
  footer?: ReactNode;
}) {
  return (
    <div className="solo">
      <div className="card panel">
        {(onBack || step) && (
          <div className="steps">
            {onBack ? (
              <button type="button" className="link" onClick={onBack}>
                ← {t('common.back')}
              </button>
            ) : (
              <span />
            )}
            {step && <small>{t('onboarding.step', { n: step, total: TOTAL_STEPS })}</small>}
          </div>
        )}
        {children}
        {footer && <div style={{ marginTop: 18 }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Onboarding({ onDone }: { onDone: (r: OnboardingDone) => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const [county, setCounty] = useState<string>('');
  const [hectares, setHectares] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [money, setMoney] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (startBalanceLei: number) => {
    const input: OnboardingInput = {
      name: name.trim(),
      county,
      age: Number(age),
      startBalanceLei,
      parcels: data.crops.crops
        .map((c) => ({ cropId: c.id, areaHa: parseHa(hectares[c.id] ?? '') ?? 0 }))
        .filter((p) => p.areaHa > 0),
    };
    if (!OnboardingInputSchema.safeParse(input).success) {
      setError(t('onboarding.errors.invalid_input'));
      return;
    }
    if (!navigator.onLine) {
      setError(t('offline.needed.save'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ subsidies: SubsidyResult }>('/api/farmers', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      onDone({ name: input.name, subsidies: res.subsidies });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      setError(code === 'farm_exists' || code === 'invalid_input' ? t(`onboarding.errors.${code}`) : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  switch (step) {
    case 'welcome':
      return <Welcome onNext={() => setStep('county')} />;
    case 'county':
      return (
        <CountyStep
          selected={county}
          onBack={() => setStep('welcome')}
          onPick={(code) => {
            setCounty(code);
            setStep('crops');
          }}
        />
      );
    case 'crops':
      return (
        <CropsStep values={hectares} onChange={setHectares} onBack={() => setStep('county')} onNext={() => setStep('about')} />
      );
    case 'about':
      return (
        <AboutStep
          name={name}
          age={age}
          onName={setName}
          onAge={setAge}
          onBack={() => setStep('crops')}
          onNext={() => setStep('money')}
        />
      );
    case 'money':
      return (
        <MoneyStep
          value={money}
          onChange={setMoney}
          onBack={() => setStep('about')}
          onSubmit={(lei) => void submit(lei)}
          busy={busy}
          error={error}
        />
      );
  }
}

function Welcome({ onNext }: { onNext: () => void }) {
  const { signOut } = useAuth();
  return (
    <Card
      footer={
        <>
          <button type="button" className="primary" onClick={onNext}>
            {t('onboarding.welcome.start')}
          </button>
          <button type="button" className="textbtn" onClick={() => void signOut()}>
            {t('auth.logout')}
          </button>
        </>
      }
    >
      <div className="brandline">
        <span className="orb" />
        {t('app.name')}
      </div>
      <h1 className="title">{t('onboarding.welcome.title')}</h1>
      <p className="lead">{t('onboarding.welcome.body')}</p>
      <p className="fine">{t('onboarding.welcome.time')}</p>
    </Card>
  );
}

function CountyStep({ selected, onPick, onBack }: { selected: string; onPick: (code: string) => void; onBack: () => void }) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = fold(query.trim());
    return data.counties.counties.filter((c) => fold(c.name_ro).includes(q));
  }, [query]);

  return (
    <Card onBack={onBack} step={1}>
      <h1 className="title">{t('onboarding.county.title')}</h1>
      <input
        className="input"
        type="search"
        autoFocus
        placeholder={t('onboarding.county.search')}
        aria-label={t('onboarding.county.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginTop: 14 }}
      />
      <div className="choices">
        {matches.map((c) => (
          <button key={c.code} type="button" className="choice" aria-pressed={c.code === selected} onClick={() => onPick(c.code)}>
            {c.name_ro}
          </button>
        ))}
        {matches.length === 0 && <p className="muted">{t('onboarding.county.none')}</p>}
      </div>
    </Card>
  );
}

function CropsStep({
  values,
  onChange,
  onBack,
  onNext,
}: {
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const parsed = data.crops.crops.map((c) => ({ id: c.id, raw: values[c.id] ?? '', ha: parseHa(values[c.id] ?? '') }));
  const invalid = parsed.some((p) => p.raw.trim() !== '' && p.ha === null);
  const total = parsed.reduce((s, p) => s + (p.ha ?? 0), 0);

  const set = (id: string, raw: string) => onChange({ ...values, [id]: raw });
  const bump = (id: string, delta: number) => {
    const current = parseHa(values[id] ?? '') ?? 0;
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    set(id, next === 0 ? '' : formatHa(next));
  };

  return (
    <Card
      onBack={onBack}
      step={2}
      footer={
        <button type="button" className="primary" disabled={invalid || total <= 0} onClick={onNext}>
          {t('common.next')}
        </button>
      }
    >
      <h1 className="title">{t('onboarding.crops.title')}</h1>
      <p className="lead">{t('onboarding.crops.hint')}</p>
      {data.crops.crops.map((crop) => (
        <section key={crop.id} className="crop-in">
          <h3>
            <label htmlFor={`ha-${crop.id}`}>{crop.name_ro}</label>
          </h3>
          <div className="stepper">
            <button type="button" aria-label={`${t('onboarding.crops.less')} ${crop.name_ro}`} onClick={() => bump(crop.id, -1)}>
              −
            </button>
            <input
              id={`ha-${crop.id}`}
              className="input"
              inputMode="decimal"
              placeholder="0"
              value={values[crop.id] ?? ''}
              onChange={(e) => set(crop.id, e.target.value)}
            />
            <button type="button" aria-label={`${t('onboarding.crops.more')} ${crop.name_ro}`} onClick={() => bump(crop.id, 1)}>
              +
            </button>
          </div>
          <p className="hint" style={{ textAlign: 'center' }}>
            {t('onboarding.crops.hectares')}
          </p>
        </section>
      ))}
      {invalid && <Alert>{t('onboarding.crops.invalid')}</Alert>}
      <p className="total">{total > 0 ? t('onboarding.crops.total', { ha: formatHa(total) }) : t('onboarding.crops.empty')}</p>
    </Card>
  );
}

function AboutStep(props: {
  name: string;
  age: string;
  onName: (v: string) => void;
  onAge: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const ageValid = ageIsValid(props.age);
  return (
    <Card
      onBack={props.onBack}
      step={3}
      footer={
        <button type="button" className="primary" disabled={!props.name.trim() || !ageValid} onClick={props.onNext}>
          {t('common.next')}
        </button>
      }
    >
      <h1 className="title">{t('onboarding.about.title')}</h1>
      <label className="field">
        {t('onboarding.about.name')}
        <input autoComplete="given-name" maxLength={80} value={props.name} onChange={(e) => props.onName(e.target.value)} />
      </label>
      <label className="field">
        {t('onboarding.about.age')}
        <input
          inputMode="numeric"
          maxLength={3}
          value={props.age}
          onChange={(e) => props.onAge(e.target.value.replace(/\D/g, ''))}
          style={{ width: 120, textAlign: 'center', fontSize: 22 }}
        />
        <span className="hint">{t('onboarding.about.ageHint')}</span>
      </label>
      {props.age !== '' && !ageValid && <Alert>{t('onboarding.about.invalidAge')}</Alert>}
    </Card>
  );
}

function MoneyStep(props: {
  value: string;
  onChange: (v: string) => void;
  onBack: () => void;
  onSubmit: (lei: number) => void;
  busy: boolean;
  error: string | null;
}) {
  const digits = props.value.replace(/[.\s]/g, '');
  const valid = digits === '' || /^\d{1,9}$/.test(digits);
  const lei = digits === '' ? 0 : Number(digits);

  return (
    <Card
      onBack={props.onBack}
      step={4}
      footer={
        <>
          <button type="button" className="primary" disabled={!valid || props.busy} onClick={() => props.onSubmit(lei)}>
            {props.busy ? t('common.wait') : t('onboarding.submit')}
          </button>
          <button type="button" className="textbtn" disabled={props.busy} onClick={() => props.onSubmit(0)}>
            {t('onboarding.money.skip')}
          </button>
        </>
      }
    >
      <h1 className="title">{t('onboarding.money.title')}</h1>
      <p className="lead">{t('onboarding.money.hint')}</p>
      <label className="field">
        {t('onboarding.money.label')}
        <input
          inputMode="numeric"
          placeholder="0"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value.replace(/[^\d.\s]/g, ''))}
          style={{ textAlign: 'right', fontSize: 26, fontWeight: 600 }}
        />
      </label>
      {!valid && <Alert>{t('onboarding.money.invalid')}</Alert>}
      {props.error && <Alert>{props.error}</Alert>}
    </Card>
  );
}
