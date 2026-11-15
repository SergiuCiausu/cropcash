// @vitest-environment happy-dom
/* „Desenează parcela” (docs/harta-plan.md, step 5), with MapLibre replaced by a fake that keeps what
   the editor gives it: sources, markers (as real buttons in the page) and map events. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { geodesicAreaAri, metreFrame, parseBlocs, shapeFromPoints, type Position } from '../../../packages/shared/src/plots/index';
import bloc286 from '../../../packages/shared/src/plots/__fixtures__/lpis-bloc-153277-286.json';
import { ShapeEditor, type ShapeEditorProps } from './ShapeEditor';

const fake = vi.hoisted(() => ({ maps: [] as FakeMap[], markers: [] as FakeMarker[] }));
interface FakeMap {
  opts: { center: Position; zoom: number; container: HTMLElement };
  sources: Record<string, { data?: unknown }>;
  fire(ev: string, e?: unknown): void;
}
interface FakeMarker {
  el: HTMLElement;
  draggable: boolean;
  p: Position;
  h: Record<string, () => void>;
}

vi.mock('maplibre-gl', () => {
  class Map {
    handlers: Record<string, ((e?: unknown) => void)[]> = {};
    sources: Record<string, { data?: unknown; setData: (d: unknown) => void }> = {};
    constructor(public opts: unknown) {
      fake.maps.push(this as never);
    }
    on(ev: string, cb: (e?: unknown) => void) {
      (this.handlers[ev] ??= []).push(cb);
      if (ev === 'load') queueMicrotask(() => cb());
      return this;
    }
    fire(ev: string, e?: unknown) {
      for (const cb of this.handlers[ev] ?? []) cb(e);
    }
    addSource(id: string, s: { data?: unknown }) {
      const src = { ...s, setData: (d: unknown) => (src.data = d) };
      this.sources[id] = src;
    }
    addLayer() {}
    getSource(id: string) {
      return this.sources[id];
    }
    flyTo() {}
    remove() {}
  }
  class Marker {
    el: HTMLElement;
    draggable: boolean;
    p: Position = [0, 0];
    h: Record<string, () => void> = {};
    constructor(o: { element: HTMLElement; draggable: boolean }) {
      this.el = o.element;
      this.draggable = o.draggable;
      fake.markers.push(this as never);
    }
    setLngLat(p: Position) {
      this.p = p;
      return this;
    }
    /* Like MapLibre: inside the map's container, so key presses reach the editor. */
    addTo(map: { opts: { container: HTMLElement } }) {
      map.opts.container.appendChild(this.el);
      return this;
    }
    on(ev: string, cb: () => void) {
      this.h[ev] = cb;
      return this;
    }
    getLngLat() {
      return { lng: this.p[0], lat: this.p[1] };
    }
    remove() {
      this.el.remove();
      fake.markers.splice(fake.markers.indexOf(this as never), 1);
    }
  }
  return { default: { Map, Marker } };
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  fake.maps.length = 0;
  fake.markers.length = 0;
});

const [bloc] = parseBlocs(bloc286);
const f = metreFrame([24.96, 44.11]);
const square = shapeFromPoints([f.toLngLat({ x: 0, y: 0 }), f.toLngLat({ x: 100, y: 0 }), f.toLngLat({ x: 100, y: 100 }), f.toLngLat({ x: 0, y: 100 })]);

async function show(over: Partial<ShapeEditorProps> = {}) {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  render(<ShapeEditor title="Bloc 286 · parcela 1a" bloc={bloc!.geometry} declaredAri={800} onDone={onDone} onCancel={onCancel} {...over} />);
  // The map module loads, then the map's load event: let both settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { onDone, onCancel, map: fake.maps[0]! };
}
const markerOf = (label: string) => fake.markers.find((m) => m.el.getAttribute('aria-label') === label)!;
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe('the drawing editor', () => {
  it('opens on the bloc, starts from it, and hands back the drawing with its area', async () => {
    const { onDone, map } = await show();
    expect(map.opts.zoom).toBe(16);
    expect(map.sources.bloc?.data).toEqual(bloc!.geometry);
    expect(map.sources.lpis).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pornește de la bloc' }));
    await settle();
    expect(screen.getByText(/Desenat:/).textContent).toMatch(/Pe cerere: 8 ha/);
    expect(await screen.findByRole('button', { name: 'Colțul 1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gata' }));
    const result = onDone.mock.calls[0]![0];
    expect(result.areaAri).toBe(geodesicAreaAri(result.geometry));
    expect(Math.abs(result.areaAri - 854) / 854).toBeLessThan(0.02);
  });

  it('a corner rounds with the slider and comes back with „Înapoi un pas”', async () => {
    await show({ initial: square, declaredAri: 100 });
    fireEvent.click(await screen.findByRole('button', { name: 'Colțul 2' }));
    const slider = screen.getByRole('slider');
    expect(screen.getByText(/Rotunjește colțul: ascuțit/)).toBeTruthy();
    fireEvent.change(slider, { target: { value: '30' } });
    expect(screen.getByText(/Rotunjește colțul: 30 m/)).toBeTruthy();
    expect(screen.getByText(/Desenat:/).textContent).toMatch(/Desenat: 0,98 ha/);
    fireEvent.click(screen.getByRole('button', { name: 'Înapoi un pas' }));
    expect(screen.getByText(/Desenat:/).textContent).toMatch(/Desenat: 1 ha/);
  });

  it('+ adds a corner; holding it (or right-click) offers a curve', async () => {
    await show({ initial: square, declaredAri: 100 });
    fireEvent.click(await screen.findByRole('button', { name: /^Latura 1:/ }));
    await settle();
    expect(screen.getByRole('button', { name: 'Colțul 5' })).toBeTruthy();
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Latura 5:/ }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Fă-o curbă' }));
    await settle();
    expect(screen.getByRole('button', { name: 'Mânerul curbei de pe latura 5' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fă-o dreaptă' })).toBeTruthy();
    expect(screen.getByText(/Desenat:/).textContent).toMatch(/Desenat: 1,07 ha/);
  });

  it('dragging a corner near the bloc snaps onto it; one drag is one step', async () => {
    const outlineCorner = (bloc!.geometry as { coordinates: Position[][] }).coordinates[0]![3]!;
    const near = metreFrame(outlineCorner).toLngLat({ x: 1.5, y: 1 });
    const start = shapeFromPoints([near, ...square.vertices.slice(1).map((v) => v.at)]);
    await show({ initial: start });
    const m = markerOf('Colțul 1');
    act(() => {
      m.p = metreFrame(outlineCorner).toLngLat({ x: 2, y: 0 });
      m.h.drag!();
      m.h.dragend!();
    });
    await settle();
    expect(markerOf('Colțul 1').p).toEqual(outlineCorner);
    fireEvent.click(screen.getByRole('button', { name: 'Înapoi un pas' }));
    await settle();
    expect(markerOf('Colțul 1').p).toEqual(near);
  });

  it('draws from an empty map, one tap per corner', async () => {
    const { map } = await show({ bloc: null, declaredAri: null });
    expect(map.opts.zoom).toBe(6);
    fireEvent.click(screen.getByRole('button', { name: 'Desenez de la zero' }));
    const tap = (p: Position) => act(() => map.fire('click', { lngLat: { lng: p[0], lat: p[1] } }));
    tap(square.vertices[0]!.at);
    tap(square.vertices[1]!.at);
    expect((screen.getByRole('button', { name: 'Închide forma' }) as HTMLButtonElement).disabled).toBe(true);
    tap(square.vertices[2]!.at);
    expect(screen.getByText(/Ai pus 3 colțuri/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Închide forma' }));
    await settle();
    expect(screen.getByText(/Desenat:/).textContent).toBe('Desenat: 0,50 ha');
    expect(screen.queryByText(/Pe cerere/)).toBeNull();
  });

  it('reads pasted coordinates, and says which line it could not read', async () => {
    await show({ bloc: null });
    fireEvent.click(screen.getByRole('button', { name: 'Lipesc coordonate' }));
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: '44.11, 24.96\nla pădure' } });
    fireEvent.click(screen.getByRole('button', { name: 'Folosește punctele' }));
    expect(screen.getByRole('alert').textContent).toMatch(/rândul 2/);
    const text = square.vertices.map((v) => `${v.at[1]}, ${v.at[0]}`).join('\n');
    fireEvent.change(box, { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Folosește punctele' }));
    await settle();
    expect(screen.getByText(/Desenat:/).textContent).toMatch(/^Desenat: 1 ha/);
  });

  it('keyboard: arrows nudge the selected corner, Delete removes it, Ctrl+Z undoes', async () => {
    await show({ initial: square, declaredAri: 100 });
    const corner = await screen.findByRole('button', { name: 'Colțul 3' });
    fireEvent.click(corner);
    await settle();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Colțul 3' }), { key: 'ArrowRight', shiftKey: true });
    await settle();
    // 10 m east on the north-east corner adds a 10 × 100 / 2 m² triangle: 5 ari.
    expect(screen.getByText(/Desenat:/).textContent).toMatch(/Desenat: 1,05 ha/);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Colțul 3' }), { key: 'Delete' });
    await settle();
    expect(screen.queryByRole('button', { name: 'Colțul 4' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Colțul 1' }), { key: 'z', ctrlKey: true });
    await settle();
    expect(screen.getByRole('button', { name: 'Colțul 4' })).toBeTruthy();
  });

  it('warns about the area, refuses crossed edges, and says when the map has no internet', async () => {
    const [a, b, c, d] = square.vertices.map((v) => v.at) as [Position, Position, Position, Position];
    const { map } = await show({ initial: shapeFromPoints([a, c, b, d]), declaredAri: 800 });
    expect(screen.getByRole('status').textContent).toMatch(/mai mult de 10%/);
    expect(screen.getByRole('alert').textContent).toMatch(/Marginile se intersectează/);
    expect((screen.getByRole('button', { name: 'Gata' }) as HTMLButtonElement).disabled).toBe(true);
    act(() => map.fire('error'));
    expect(screen.getByText(/Harta are nevoie de internet/)).toBeTruthy();
  });

  it('„Renunță” leaves without a drawing', async () => {
    const { onCancel, onDone } = await show();
    fireEvent.click(screen.getByRole('button', { name: 'Renunță' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
