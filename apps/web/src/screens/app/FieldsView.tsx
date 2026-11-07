import { t } from '../../i18n';
import { formatHa, formatLei } from '../../lib/format';
import { cropName, type FarmPlan } from '../../lib/plan';

const leiKg = (bani: number) => (bani / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2 });

export function FieldsView({ plan, openSubsidy }: { plan: FarmPlan; openSubsidy: () => void }) {
  const { totals } = plan.subsidies;
  return (
    <section className="view" aria-label={t('nav.fields')}>
      <div className="crops">
        {plan.economics.map((e) => (
          <article className="crop" key={e.cropId}>
            <h3>{cropName(e.cropId)}</h3>
            <p className="sub">{t('fields.sub', { ha: formatHa(e.areaAri / 100) })}</p>
            <p className="m">
              {formatLei(e.marginPerHa)} {t('common.lei')} <span>{t('fields.marginPerHa')}</span>
            </p>
            <dl>
              <div>
                <dt>{t('fields.harvest')}</dt>
                <dd>{t('fields.tonnes', { t: formatHa(e.productionT) })}</dd>
              </div>
              <div>
                <dt>{t('fields.price')}</dt>
                <dd>{t('fields.perT', { amount: formatLei(e.pricePerT) })}</dd>
              </div>
              <div>
                <dt>{t('fields.income')}</dt>
                <dd>
                  {formatLei(e.income)} {t('common.lei')}
                </dd>
              </div>
              <div>
                <dt>{t('fields.cost')}</dt>
                <dd>
                  {formatLei(e.cost)} {t('common.lei')}
                </dd>
              </div>
              <div>
                <dt>{t('fields.incomePerHa')}</dt>
                <dd>
                  {formatLei(e.incomePerHa)} {t('common.lei')}
                </dd>
              </div>
              <div>
                <dt>{t('fields.breakEven')}</dt>
                <dd>{t('fields.perKg', { amount: leiKg(e.breakEvenPerKg) })}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="panel">
        <div className="phead">
          <h2>{t('fields.subsidyTitle')}</h2>
          <button className="link" type="button" onClick={openSubsidy}>
            {t('fields.subsidyMore')}
          </button>
        </div>
        <p className="big">
          {formatLei(totals.lei.probable, 100)} {t('common.lei')}
        </p>
        <p className="muted">
          {t('subsidy.range', { min: formatLei(totals.lei.min, 100), max: formatLei(totals.lei.max, 100) })}
        </p>
      </div>

      <div className="panel">
        <div className="phead">
          <h2>{t('fields.howTitle')}</h2>
        </div>
        <p className="muted">{t('fields.how')}</p>
      </div>
    </section>
  );
}
