import { describe, expect, it } from 'vitest';
import { FONT_SCALE } from '../../config/constants';
import type { HighlighterAnnotation, TextAnnotation } from '../../types';
import { keepInPaper, textBox, withLabelInside } from '../annotations';

const bounds = { width: 1000, height: 800 };
const text = (x: number, y: number, extra: Partial<TextAnnotation> = {}): TextAnnotation =>
    ({ id: 't', type: 'text', x, y, text: 'Revisa', color: '#000', fontSize: 10, ...extra });
const hl = (x: number, y: number, extra: Partial<HighlighterAnnotation> = {}): HighlighterAnnotation =>
    ({ id: 'h', type: 'highlighter', x, y, width: 200, height: 40, color: 'rgba(0,0,0,0.4)', ...extra } as HighlighterAnnotation);

describe('C6: res fora del paper', () => {
    it('un comentari dins no es toca (mateix objecte)', () => {
        const a = text(100, 100);
        expect(keepInPaper(a, bounds, 10)).toBe(a);
    });

    it('un comentari que surt per la dreta i per baix torna just al marge', () => {
        const out = keepInPaper(text(990, 795), bounds, 10);
        const box = textBox(out, 10);
        expect(box.x + box.width).toBeCloseTo(bounds.width);
        expect(box.y + box.height).toBeCloseTo(bounds.height);
    });

    it('els punts d\'un comentari també han de cabre a dalt', () => {
        const out = keepInPaper(text(10, 0, { score: -0.5 }), bounds, 10);
        expect(textBox(out, 10).y).toBeCloseTo(0);
        expect(out.y).toBeCloseTo(10 * FONT_SCALE * 0.7);
    });

    it('un fluorescent fora del paper hi torna i, a dalt de tot, l\'etiqueta passa a sota', () => {
        const out = keepInPaper(hl(-50, -10), bounds, 10);
        expect(out).toMatchObject({ x: 0, y: 0, labelOffsetY: 44 });
    });

    it('l\'etiqueta queda a sobre si hi cap, i no es toca si ja s\'ha mogut a mà', () => {
        expect(withLabelInside(hl(10, 300), 10).labelOffsetY).toBeUndefined();
        expect(withLabelInside(hl(10, 0, { labelOffsetY: -30 }), 10).labelOffsetY).toBe(-30);
    });
});
