import { describe, expect, it } from 'vitest';
import { nextPending, type GridPos } from '../scoring';

/** 3 alumnes × 2 exercicis; `done` són les parelles «alumne-exercici» ja corregides. */
const grid = (done: string[]) => (p: GridPos) => done.includes(`${p.studentIdx}-${p.exerciseIdx}`);

describe('següent pendent (C4)', () => {
    it('primer els alumnes que queden del mateix exercici', () => {
        expect(nextPending(3, 2, grid(['0-0', '1-0']), { studentIdx: 0, exerciseIdx: 0 })).toEqual({ studentIdx: 2, exerciseIdx: 0 });
    });

    it('acabat l\'exercici, passa al següent i torna a començar pel principi', () => {
        expect(nextPending(3, 2, grid(['0-0', '1-0', '2-0']), { studentIdx: 2, exerciseIdx: 0 })).toEqual({ studentIdx: 0, exerciseIdx: 1 });
        expect(nextPending(3, 2, grid(['1-0', '2-0', '0-1', '1-1', '2-1']), { studentIdx: 2, exerciseIdx: 1 })).toEqual({ studentIdx: 0, exerciseIdx: 0 });
    });

    it('no compta on ja ets: si només queda aquest, no hi ha cap més pendent', () => {
        expect(nextPending(3, 2, grid(['1-0', '2-0', '0-1', '1-1', '2-1']), { studentIdx: 0, exerciseIdx: 0 })).toBeNull();
        expect(nextPending(1, 1, grid([]), { studentIdx: 0, exerciseIdx: 0 })).toBeNull();
    });
});
