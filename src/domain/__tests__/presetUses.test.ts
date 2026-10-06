import { describe, expect, it } from 'vitest';
import { countPresetUses } from '../annotations';
import type { Annotation, AnnotationStore } from '../../types';

const hl = (id: string, presetId?: string): Annotation => ({ id, type: 'highlighter', x: 0, y: 0, width: 10, height: 10, color: '#fde047', presetId });
const pen: Annotation = { id: 'p', type: 'pen', points: [0, 0, 1, 1], color: '#000', strokeWidth: 2 };

describe('ús d\'un fluorescent predefinit (per confirmar abans d\'esborrar-lo)', () => {
    const store: AnnotationStore = {
        a1: { ex1: [hl('1', 'err'), pen], ex2: [hl('2', 'err'), hl('3', 'bo')] },
        a2: { ex1: [hl('4', 'err'), hl('5')] },
    };

    it('compta les marques de tots els alumnes i exercicis', () => {
        expect(countPresetUses(store, 'err')).toBe(3);
        expect(countPresetUses(store, 'bo')).toBe(1);
    });

    it('un preset sense marques es pot esborrar sense preguntar', () => {
        expect(countPresetUses(store, 'nou')).toBe(0);
        expect(countPresetUses({}, 'err')).toBe(0);
    });
});
