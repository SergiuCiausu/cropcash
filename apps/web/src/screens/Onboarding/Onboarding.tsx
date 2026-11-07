import { useMemo, useState } from 'react';
import {
  OnboardingInputSchema,
  loadData,
  type OnboardingInput,
  type SubsidyResult,
} from '@cropcash/shared';
import { t } from '../../i18n';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { fold, formatHa, parseHa } from '../../lib/format';
import { Alert, PrimaryButton, Screen } from '../../components/ui';

const data = loadData();
const TOTAL_STEPS = 4;

type Step = 'welcome' | 'county' | 'crops' | 'about' | 'money';

export interface OnboardingDone {
  name: string;
  subsidies: SubsidyResult;
}

const ageIsValid = (age: string) => /^\d{1,3}$/.test(age) && Number(age) >= 16 && Number(age) <= 100;

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
        <CropsStep
          values={hectares}
          onChange={setHectares}
          onBack={() => setStep('county')}
          onNext={() => setStep('about')}
        />
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
    <Screen
      onBack={props.onBack}
      step={{ n: 4, total: TOTAL_STEPS }}
      footer={
        <div className="flex flex-col gap-3">
          <PrimaryButton disabled={!valid || props.busy} onClick={() => props.onSubmit(lei)}>
            {props.busy ? t('common.wait') : t('onboarding.submit')}
          </PrimaryButton>
          <button
            disabled={props.busy}
            onClick={() => props.onSubmit(0)}
            className="py-3 text-lg text-field-700 underline"
          >
            {t('onboarding.money.skip')}
          </button>
        </div>
      }
    >
      <h1 className="text-3xl font-bold">{t('onboarding.money.title')}</h1>
      <p className="text-lg">{t('onboarding.money.hint')}</p>
      <label className="flex items-center gap-3">
        <input
          inputMode="numeric"
          aria-label={t('onboarding.money.title')}
          placeholder="0"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value.replace(/[^\d.\s]/g, ''))}
          className="w-full rounded-xl border-2 border-field-600/40 bg-white px-4 py-4 text-right text-3xl focus:border-field-700 focus:outline-none"
        />
        <span className="text-2xl">{t('onboarding.money.label')}</span>
      </label>
      {!valid && <Alert>{t('onboarding.money.invalid')}</Alert>}
      {props.error && <Alert>{props.error}</Alert>}
    </Screen>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  const { signOut } = useAuth();
  return (
    <Screen
      footer={
        <div className="flex flex-col gap-3">
          <PrimaryButton onClick={onNext}>{t('onboarding.welcome.start')}</PrimaryButton>
          <button onClick={() => void signOut()} className="py-3 text-lg text-field-700 underline">
            {t('auth.logout')}
          </button>
        </div>
      }
    >
      <div className="flex flex-1 flex-col justify-center gap-4">
        <h1 className="text-4xl font-bold text-field-700">{t('onboarding.welcome.title')}</h1>
        <p className="text-2xl leading-snug">{t('onboarding.welcome.body')}</p>
        <p className="text-lg text-field-900/70">{t('onboarding.welcome.time')}</p>
      </div>
    </Screen>
  );
}

function CountyStep({
  selected,
  onPick,
  onBack,
}: {
  selected: string;
  onPick: (code: string) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = fold(query.trim());
    return data.counties.counties.filter((c) => fold(c.name_ro).includes(q));
  }, [query]);

  return (
    <Screen onBack={onBack} step={{ n: 1, total: TOTAL_STEPS }}>
      <h1 className="text-3xl font-bold">{t('onboarding.county.title')}</h1>
      <input
        type="search"
        autoFocus
        placeholder={t('onboarding.county.search')}
        aria-label={t('onboarding.county.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-xl border-2 border-field-600/40 bg-white px-4 py-4 text-xl focus:border-field-700 focus:outline-none"
      />
      <ul className="flex flex-col gap-2">
        {matches.map((c) => (
          <li key={c.code}>
            <button
              onClick={() => onPick(c.code)}
              className={`w-full rounded-xl px-4 py-4 text-left text-xl ${
                c.code === selected ? 'bg-field-700 text-white' : 'bg-white active:bg-field-600/10'
              }`}
            >
              {c.name_ro}
            </button>
          </li>
        ))}
        {matches.length === 0 && <li className="text-lg">{t('onboarding.county.none')}</li>}
      </ul>
    </Screen>
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
  const canContinue = !invalid && total > 0;

  const set = (id: string, raw: string) => onChange({ ...values, [id]: raw });
  const bump = (id: string, delta: number) => {
    const current = parseHa(values[id] ?? '') ?? 0;
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    set(id, next === 0 ? '' : formatHa(next));
  };

  return (
    <Screen
      onBack={onBack}
      step={{ n: 2, total: TOTAL_STEPS }}
      footer={
        <PrimaryButton disabled={!canContinue} onClick={onNext}>
          {t('common.next')}
        </PrimaryButton>
      }
    >
      <h1 className="text-3xl font-bold">{t('onboarding.crops.title')}</h1>
      <p className="text-lg">{t('onboarding.crops.hint')}</p>

      {data.crops.crops.map((crop) => (
        <div key={crop.id} className="rounded-2xl bg-white p-4 shadow-sm">
          <label htmlFor={`ha-${crop.id}`} className="text-2xl font-semibold">
            {crop.name_ro}
          </label>
          <div className="mt-3 flex items-center gap-3">
            <button
              aria-label={`${t('onboarding.crops.less')} ${crop.name_ro}`}
              onClick={() => bump(crop.id, -1)}
              className="h-14 w-14 shrink-0 rounded-xl bg-field-600/10 text-3xl font-bold text-field-700"
            >
              −
            </button>
            <input
              id={`ha-${crop.id}`}
              inputMode="decimal"
              placeholder="0"
              value={values[crop.id] ?? ''}
              onChange={(e) => set(crop.id, e.target.value)}
              className="h-14 w-full min-w-0 rounded-xl border-2 border-field-600/40 text-center text-2xl focus:border-field-700 focus:outline-none"
            />
            <button
              aria-label={`${t('onboarding.crops.more')} ${crop.name_ro}`}
              onClick={() => bump(crop.id, 1)}
              className="h-14 w-14 shrink-0 rounded-xl bg-field-600/10 text-3xl font-bold text-field-700"
            >
              +
            </button>
          </div>
          <p className="mt-1 text-center text-base text-field-900/70">{t('onboarding.crops.hectares')}</p>
        </div>
      ))}

      {invalid && <Alert>{t('onboarding.crops.invalid')}</Alert>}
      <p className="text-center text-xl font-semibold">
        {total > 0 ? t('onboarding.crops.total', { ha: formatHa(total) }) : t('onboarding.crops.empty')}
      </p>
    </Screen>
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
  const canContinue = props.name.trim().length > 0 && ageValid;
  const input =
    'w-full rounded-xl border-2 border-field-600/40 bg-white px-4 py-4 text-2xl focus:border-field-700 focus:outline-none';

  return (
    <Screen
      onBack={props.onBack}
      step={{ n: 3, total: TOTAL_STEPS }}
      footer={
        <PrimaryButton disabled={!canContinue} onClick={props.onNext}>
          {t('common.next')}
        </PrimaryButton>
      }
    >
      <h1 className="text-3xl font-bold">{t('onboarding.about.title')}</h1>
      <label className="flex flex-col gap-2">
        <span className="text-xl">{t('onboarding.about.name')}</span>
        <input
          className={input}
          autoComplete="given-name"
          maxLength={80}
          value={props.name}
          onChange={(e) => props.onName(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-xl">{t('onboarding.about.age')}</span>
        <input
          className={`${input} w-32 text-center text-3xl`}
          inputMode="numeric"
          maxLength={3}
          value={props.age}
          onChange={(e) => props.onAge(e.target.value.replace(/\D/g, ''))}
        />
        <span className="text-base text-field-900/70">{t('onboarding.about.ageHint')}</span>
      </label>
      {props.age !== '' && !ageValid && <Alert>{t('onboarding.about.invalidAge')}</Alert>}
    </Screen>
  );
}
