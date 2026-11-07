import type { TimelineEntry } from '@cropcash/shared';
import { t } from '../i18n';
import type { IconName } from '../components/Icon';
import { toneOf } from '../components/Icon';
import { cropName, eventTitle } from './plan';

export function entryTitle(e: TimelineEntry): string {
  switch (e.kind) {
    case 'apia_advance':
    case 'apia_balance':
      return t(`calendar.entry.${e.kind}`);
    case 'crop_sale':
      return t('calendar.entry.crop_sale', { crop: t(`calendar.cropAcc.${e.cropId}`) });
    case 'input_cost':
      return t('calendar.entry.input_cost', { crop: cropName(e.cropId), what: e.what ?? '' });
    default:
      return eventTitle(e.eventId);
  }
}

/** Badge icon and pastel tone for a timeline entry. */
export function entryBadge(e: TimelineEntry): { icon: IconName; tone: string } {
  switch (e.kind) {
    case 'apia_advance':
    case 'apia_balance':
      return { icon: 'in', tone: 'mint' };
    case 'crop_sale':
      return { icon: 'sprout', tone: 'mint' };
    case 'input_cost':
      return { icon: 'bag', tone: toneOf(e.cropId).tone };
    case 'deadline':
      return { icon: 'cal', tone: 'butter' };
    default:
      return { icon: 'bell', tone: 'sky' };
  }
}
