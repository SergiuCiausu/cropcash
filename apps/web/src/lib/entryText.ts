import type { TimelineEntry } from '@cropcash/shared';
import { t } from '../i18n';
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
    case 'credit':
      return t('calendar.entry.credit');
    case 'loan_repayment':
      return t('calendar.entry.loan_repayment');
    default:
      return eventTitle(e.eventId);
  }
}
