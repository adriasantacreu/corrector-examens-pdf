import { describe, expect, it } from 'vitest';
import { clampPositionToBounds, clampResizeToBounds, normalizeRect } from '../geometry';
import { layoutBounds, layoutPages, relayoutAnnotation } from '../pageLayout';
import type { PenAnnotation } from '../../types';

const A4 = { width: 100, height: 200 };

describe('pageLayout', () => {
    it('stacks pages vertically with a 20px gap (same as the viewer)', () => {
        const p = layoutPages([{ order: 0, size: A4 }, { order: 1, size: A4 }], false);
        expect(p.map(x => [x.x, x.y])).toEqual([[0, 0], [0, 220]]);
    });

    it('places odd pages on the right in side-by-side mode', () => {
        const p = layoutPages([0, 1, 2].map(order => ({ order, size: A4 })), true);
        expect(p.map(x => [x.x, x.y])).toEqual([[0, 0], [120, 0], [0, 220]]);
        expect(layoutBounds(p)).toEqual({ width: 220, height: 420 });
    });

    it('skips hidden pages without breaking the next row', () => {
        const p = layoutPages([{ order: 0, size: A4 }, { order: 1, size: null }, { order: 2, size: A4 }], true);
        expect(p.map(x => [x.order, x.x, x.y])).toEqual([[0, 0, 0], [2, 0, 220]]);
    });

    it('moves annotations when switching layout', () => {
        const scroll = layoutPages([0, 1].map(order => ({ order, size: A4 })), false);
        const full = layoutPages([0, 1].map(order => ({ order, size: A4 })), true);
        const pen: PenAnnotation = { id: 'p', type: 'pen', points: [10, 230, 20, 240], color: '#000', strokeWidth: 2 };
        expect(relayoutAnnotation(pen, scroll, full).points).toEqual([130, 10, 140, 20]);
    });
});

describe('geometry', () => {
    it('normalizes rectangles drawn backwards', () => {
        expect(normalizeRect({ x: 50, y: 50, width: -20, height: -10 })).toEqual({ x: 30, y: 40, width: 20, height: 10 });
    });

    it('keeps dragged regions inside the page', () => {
        expect(clampPositionToBounds({ x: -5, y: 190 }, { width: 10, height: 20 }, A4)).toEqual({ x: 0, y: 180 });
    });

    it('clips resized regions to the page and rejects tiny ones', () => {
        expect(clampResizeToBounds({ x: -10, y: 10, width: 50, height: 300 }, A4)).toEqual({ x: 0, y: 10, width: 40, height: 190 });
        expect(clampResizeToBounds({ x: 98, y: 10, width: 50, height: 50 }, A4)).toBeNull();
    });
});
