'use client';
/* The list beside the map on /harta (docs/harta-plan.md, step 8). „Pe parcele”: one row per piece of land.
   „Pe culturi”: one row per crop with its totals, which opens to that crop's parcels. A row is a button:
   it picks the parcel (or the crop) and the map flies there. */
import { useState } from 'react';
import type { Crop } from '../../../packages/shared/src/data/index';
import { cropGroups, cropKeyOf, UNKNOWN_CROP, type PlotRow } from '../../../packages/shared/src/plots/index';
import { exact } from '../../lib/cc/format';
import { useMoney } from '../../lib/cc/react';
import { cropLook } from '../map/palette';
import { areaText, harvestText, nextWorkText, perHaText, plotName, signed } from './plot-text';

type CropInfo = Pick<Crop, 'id' | 'genus' | 'kind'>;

export interface PlotListProps {
  /** Filtered and sorted. */
  rows: readonly PlotRow[];
  byCrop: boolean;
  crops: ReadonlyMap<string, CropInfo>;
  cropName: (id: string) => string;
  today: string;
  selectedId: string | null;
  /** The crop picked in „Pe culturi”. */
  cropId: string | null;
  onSelect: (id: string) => void;
  onCrop: (cropId: string | null) => void;
}

export function CropIcon({ crop }: { crop: CropInfo | undefined }) {
  const look = cropLook(crop);
  return (
    <span className="pl-icon" style={{ background: look.color }} aria-hidden="true">
      {look.icon ?? ''}
    </span>
  );
}

export function PlotList(props: PlotListProps) {
  const { rows, byCrop } = props;
  if (!rows.length) return null;
  return byCrop ? <CropRows {...props} /> : <ul className="pl-list">{rows.map((r) => <PlotItem key={r.plot.id} row={r} {...props} />)}</ul>;
}

function PlotItem({ row, crops, cropName, today, selectedId, onSelect }: PlotListProps & { row: PlotRow }) {
  const { text: t } = useMoney();
  const cropId = row.season?.crop_id ?? row.plot.auto_crop_id;
  const work = nextWorkText(row, today);
  const perHa = perHaText(row);
  const harvest = harvestText(row.harvest);
  const unplaced = row.plot.geometry_source === 'none';
  return (
    <li>
      <button type="button" className="pl-row" aria-current={selectedId === row.plot.id ? 'true' : undefined} onClick={() => onSelect(row.plot.id)}>
        <CropIcon crop={cropId ? crops.get(cropId) : undefined} />
        <span className="pl-main">
          <strong>{plotName(row.plot, cropName)}</strong>
          <small>
            {[cropId && !row.plot.auto_crop_id ? cropName(cropId) : null, areaText(row.season?.area_ari), harvest].filter(Boolean).join(' · ') || 'Nimic semănat anul ăsta'}
          </small>
          {work && <small className={work.late ? 'pl-late' : 'pl-work'}>{work.text}</small>}
          {unplaced && !row.plot.auto_crop_id && <small className="pl-work">Fără loc pe hartă</small>}
        </span>
        {perHa && <span className={`pl-money ${perHa.startsWith('−') ? 'neg' : 'pos'}`}>{t(perHa)}</span>}
      </button>
    </li>
  );
}

function CropRows(props: PlotListProps) {
  const { rows, crops, cropName, cropId, onCrop } = props;
  const { text: t } = useMoney();
  const groups = cropGroups(rows);
  /* Parcels with nothing on them this year have no crop group; they stay reachable at the end. */
  const bare = rows.filter((r) => !r.season);
  const [open, setOpen] = useState<string | null>(cropId);
  return (
    <ul className="pl-list">
      {groups.map((g) => {
        const own = rows.filter((r) => r.season && cropKeyOf(r) === g.cropId);
        const expanded = open === g.cropId;
        const name = g.cropId === UNKNOWN_CROP ? 'Fără cultură' : cropName(g.cropId);
        return (
          <li key={g.cropId} className="pl-crop">
            <button
              type="button"
              className="pl-row"
              aria-expanded={expanded}
              aria-current={cropId === g.cropId ? 'true' : undefined}
              onClick={() => {
                setOpen(expanded ? null : g.cropId);
                onCrop(expanded ? null : g.cropId);
              }}
            >
              <CropIcon crop={crops.get(g.cropId)} />
              <span className="pl-main">
                <strong>{name}</strong>
                <small>
                  {g.plotIds.length === 1 ? 'o parcelă' : `${g.plotIds.length} ${g.plotIds.length >= 20 ? 'de ' : ''}parcele`} · {areaText(g.areaAri)}
                </small>
                {(g.expenses !== 0 || g.revenue !== 0) && (
                  <small className="pl-sums">
                    {t(`Cheltuieli ${exact(g.expenses)} lei · Venit ${exact(g.revenue)} lei`)}
                  </small>
                )}
              </span>
              {(g.expenses !== 0 || g.revenue !== 0) && g.perHa && (
                <span className={`pl-money ${g.result < 0 ? 'neg' : 'pos'}`}>
                  {t(signed(g.result))}
                  <small>{t(`${signed(g.perHa.result)}/ha`)}</small>
                </span>
              )}
            </button>
            {expanded && (
              <ul className="pl-list pl-sub">
                {own.map((r) => (
                  <PlotItem key={r.plot.id} row={r} {...props} />
                ))}
              </ul>
            )}
          </li>
        );
      })}
      {bare.length > 0 && (
        <li className="pl-crop">
          <p className="pl-head">Nimic semănat anul ăsta</p>
          <ul className="pl-list pl-sub">
            {bare.map((r) => (
              <PlotItem key={r.plot.id} row={r} {...props} />
            ))}
          </ul>
        </li>
      )}
    </ul>
  );
}
