/* The drawing editor's state (docs/harta-plan.md, step 5), apart from the map so it can be tested
   alone. Every change that the farmer can undo goes through `history`; a drag only previews until the
   finger lifts, so one drag is one undo step. */
import {
  deleteVertex,
  historyOf,
  insertVertex,
  makeCurve,
  makeStraight,
  moveHandle,
  moveVertex,
  nudgeVertex,
  pushHistory,
  redo,
  setCorner,
  shapeFromGeometry,
  shapeFromPoints,
  undo,
  MIN_VERTICES,
  type History,
  type PlotGeometry,
  type Position,
  type Shape,
} from '../../../packages/shared/src/plots/index';

export type Selection = { kind: 'vertex'; i: number } | { kind: 'edge'; i: number } | null;

export interface EditorState {
  /** null until the farmer picks how to start. */
  history: History<Shape | null>;
  /** Corners tapped so far when drawing from an empty map. */
  draft: Position[] | null;
  /** The shape while a handle is being dragged; not a step yet. */
  preview: Shape | null;
  selected: Selection;
  /** The corner the rounding slider moved last: more moves of it are one undo step. */
  rounding: number | null;
}

export type EditorAction =
  | { type: 'start_from'; geometry: PlotGeometry }
  | { type: 'start_empty' }
  | { type: 'start_points'; points: Position[] }
  | { type: 'add_point'; at: Position }
  | { type: 'close_draft' }
  | { type: 'drag'; shape: Shape }
  | { type: 'move_vertex'; i: number; at: Position }
  | { type: 'move_handle'; i: number; which: 0 | 1; at: Position }
  | { type: 'select'; selection: Selection }
  | { type: 'insert'; i: number }
  | { type: 'delete_selected' }
  | { type: 'curve'; i: number }
  | { type: 'straight'; i: number }
  | { type: 'corner'; i: number; metres: number }
  | { type: 'nudge'; eastM: number; northM: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'restart' };

export const initialEditor = (shape: Shape | null): EditorState => ({ history: historyOf(shape), draft: null, preview: null, selected: null, rounding: null });

/** What the map draws now. */
export const shownShape = (s: EditorState): Shape | null => s.preview ?? s.history.present;

/** Keeps a selection pointing at something that still exists. */
function fit(selected: Selection, shape: Shape | null): Selection {
  if (!selected || !shape) return null;
  return selected.i < shape.vertices.length ? selected : null;
}

function step(s: EditorState, next: Shape | null, selected: Selection = s.selected): EditorState {
  return { ...s, history: pushHistory(s.history, next), preview: null, selected: fit(selected, next), rounding: null };
}

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  const shape = s.history.present;
  switch (a.type) {
    case 'start_from':
      return step({ ...s, draft: null }, shapeFromGeometry(a.geometry), null);
    case 'start_points':
      return step({ ...s, draft: null }, shapeFromPoints(a.points), null);
    case 'start_empty':
      return { ...s, draft: [], selected: null };
    case 'add_point':
      return s.draft ? { ...s, draft: [...s.draft, a.at] } : s;
    case 'close_draft':
      return s.draft && s.draft.length >= MIN_VERTICES ? step({ ...s, draft: null }, shapeFromPoints(s.draft), null) : s;
    case 'restart':
      return step({ ...s, draft: null }, null, null);
    case 'undo':
      if (s.draft?.length) return { ...s, draft: s.draft.slice(0, -1) };
      return { ...s, history: undo(s.history), preview: null, selected: fit(s.selected, undo(s.history).present), rounding: null };
    case 'redo':
      return { ...s, history: redo(s.history), preview: null, selected: fit(s.selected, redo(s.history).present), rounding: null };
    case 'select':
      return { ...s, selected: fit(a.selection, shape), rounding: null };
  }
  if (!shape) return s;
  switch (a.type) {
    case 'drag':
      return { ...s, preview: a.shape };
    case 'move_vertex':
      return step(s, moveVertex(shape, a.i, a.at), { kind: 'vertex', i: a.i });
    case 'move_handle':
      return step(s, moveHandle(shape, a.i, a.which, a.at), { kind: 'edge', i: a.i });
    case 'insert':
      return step(s, insertVertex(shape, a.i), { kind: 'vertex', i: a.i + 1 });
    case 'curve':
      return step(s, makeCurve(shape, a.i), { kind: 'edge', i: a.i });
    case 'straight':
      return step(s, makeStraight(shape, a.i), { kind: 'edge', i: a.i });
    case 'corner': {
      const next = setCorner(shape, a.i, a.metres);
      if (s.rounding === a.i) return { ...s, history: { ...s.history, present: next }, rounding: a.i };
      return { ...step(s, next, { kind: 'vertex', i: a.i }), rounding: a.i };
    }
    case 'delete_selected':
      if (s.selected?.kind !== 'vertex') return s;
      return step(s, deleteVertex(shape, s.selected.i), null);
    case 'nudge':
      if (s.selected?.kind !== 'vertex') return s;
      return step(s, nudgeVertex(shape, s.selected.i, a.eastM, a.northM));
  }
  return s;
}
