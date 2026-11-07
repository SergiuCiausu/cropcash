import { useMemo, useState } from 'react';
import {
  buildTimeline,
  computeSubsidies,
  farmInputFromStored,
  loadData,
  normalizeParcels,
  type StoredFarm,
} from '@cropcash/shared';
import { t } from '../i18n';
import { currentMonthKey } from '../lib/format';
import { SecondaryButton } from '../components/ui';
import { TabBar, type Tab } from '../components/TabBar';
import { SubsidyResultContent } from './SubsidyResult';
import { CalendarScreen } from './Calendar';

const data = loadData();
/** Plan 12 months ahead; payments with a window are assumed late (conservative). */
const HORIZON_MONTHS = 12;

export interface Farm extends StoredFarm {
  name: string;
  county: string;
}

/**
 * Logged-in home. Everything here is computed on the device from the farm data
 * (no network needed), so it keeps working offline once the farm is cached.
 */
export function Home({ farm, onSignOut }: { farm: Farm; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('calendar');

  const { subsidies, timeline } = useMemo(() => {
    const input = farmInputFromStored(farm, data.subsidies.meta.campaign_year);
    const subsidies = computeSubsidies(input, data);
    const timeline = buildTimeline(
      { parcels: normalizeParcels(input.parcels), subsidies, startBalance: farm.start_balance_bani ?? 0 },
      data,
      { start: currentMonthKey(), months: HORIZON_MONTHS, amounts: 'medium', timing: 'late' },
    );
    return { subsidies, timeline };
  }, [farm]);

  return (
    <>
      <div className="mx-auto max-w-md px-4 pb-28 pt-6">
        {tab === 'money' && (
          <div className="flex flex-col gap-6">
            <SubsidyResultContent name={farm.name} result={subsidies} />
            <SecondaryButton onClick={onSignOut}>{t('auth.logout')}</SecondaryButton>
          </div>
        )}
        {tab === 'calendar' && <CalendarScreen timeline={timeline} />}
      </div>
      <TabBar active={tab} onChange={setTab} />
    </>
  );
}
