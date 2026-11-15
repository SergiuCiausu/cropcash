import { describe, expect, it } from 'vitest';
import { metreFrame, shapeFromPoints, type Position } from '../../../packages/shared/src/plots/index';
import { editorReducer, initialEditor, shownShape, type EditorAction, type EditorState } from './editor-state';

const f = metreFrame([24.96, 44.11]);
const corners: Position[] = [f.toLngLat({ x: 0, y: 0 }), f.toLngLat({ x: 100, y: 0 }), f.toLngLat({ x: 100, y: 100 }), f.toLngLat({ x: 0, y: 100 })];
const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, s);

describe('drawing editor state', () => {
  it('draws from an empty map: taps add corners, three or more close the shape, undo removes the last tap', () => {
    let s = run(initialEditor(null), { type: 'start_empty' }, { type: 'add_point', at: corners[0]! }, { type: 'add_point', at: corners[1]! });
    expect(run(s, { type: 'close_draft' }).history.present).toBeNull();
    s = run(s, { type: 'add_point', at: corners[2]! }, { type: 'undo' });
    expect(s.draft).toHaveLength(2);
    s = run(s, { type: 'add_point', at: corners[2]! }, { type: 'add_point', at: corners[3]! }, { type: 'close_draft' });
    expect(s.draft).toBeNull();
    expect(s.history.present?.vertices).toHaveLength(4);
  });

  it('a drag previews without a step; letting go is one step', () => {
    const square = shapeFromPoints(corners);
    let s = initialEditor(square);
    const moved = { ...square, vertices: square.vertices.map((v, i) => (i === 0 ? { at: corners[3]! } : v)) };
    s = run(s, { type: 'drag', shape: moved });
    expect(shownShape(s)).toBe(moved);
    expect(s.history.past).toHaveLength(0);
    s = run(s, { type: 'move_vertex', i: 0, at: f.toLngLat({ x: -5, y: -5 }) });
    expect(s.preview).toBeNull();
    expect(s.history.past).toHaveLength(1);
    expect(s.selected).toEqual({ kind: 'vertex', i: 0 });
  });

  it('moving the rounding slider is one undo step for as long as it stays on that corner', () => {
    let s = run(initialEditor(shapeFromPoints(corners)), { type: 'select', selection: { kind: 'vertex', i: 1 } });
    s = run(s, { type: 'corner', i: 1, metres: 5 }, { type: 'corner', i: 1, metres: 12 }, { type: 'corner', i: 1, metres: 20 });
    expect(s.history.past).toHaveLength(1);
    expect(s.history.present?.vertices[1]?.cornerM).toBe(20);
    s = run(s, { type: 'undo' });
    expect(s.history.present?.vertices[1]).not.toHaveProperty('cornerM');
  });

  it('edits through the selection: insert, curve, delete, nudge; a stale selection is dropped', () => {
    let s = run(initialEditor(shapeFromPoints(corners)), { type: 'insert', i: 0 });
    expect(s.history.present?.vertices).toHaveLength(5);
    expect(s.selected).toEqual({ kind: 'vertex', i: 1 });
    s = run(s, { type: 'delete_selected' });
    expect(s.history.present?.vertices).toHaveLength(4);
    expect(s.selected).toBeNull();
    s = run(s, { type: 'curve', i: 2 });
    expect(s.history.present?.edges[2]?.type).toBe('quad');
    s = run(s, { type: 'select', selection: { kind: 'vertex', i: 3 } }, { type: 'nudge', eastM: 1, northM: 0 });
    expect(s.history.present?.vertices[3]?.at[0]).toBeGreaterThan(corners[3]![0]);
    // Back to before the insert: 4 corners, so a selected 5th corner can't stay selected.
    s = run(s, { type: 'select', selection: { kind: 'vertex', i: 3 } }, { type: 'undo' }, { type: 'undo' }, { type: 'undo' }, { type: 'undo' });
    expect(s.history.present?.vertices).toHaveLength(4);
    expect(run(s, { type: 'select', selection: { kind: 'vertex', i: 9 } }).selected).toBeNull();
  });

  it('starting over keeps the old drawing one undo away', () => {
    const s = run(initialEditor(shapeFromPoints(corners)), { type: 'restart' });
    expect(s.history.present).toBeNull();
    expect(run(s, { type: 'undo' }).history.present?.vertices).toHaveLength(4);
  });
});
