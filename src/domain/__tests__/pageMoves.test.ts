import { describe, expect, it } from 'vitest';
import type { Student } from '../../types';
import { movePage, ripplePullBackward, ripplePushForward, shiftOneDown, thumbnailOrder } from '../pageMoves';

const groups = (...pages: number[][]): Student[] => pages.map((p, i) => ({ id: `s${i}`, name: `A${i}`, pageIndexes: p, ignoredPageIndexes: [] }));
const pagesOf = (g: Student[]) => g.map(s => s.pageIndexes);

describe('pageMoves', () => {
    it('pushes pages forward in cascade', () => {
        expect(pagesOf(ripplePushForward(groups([1, 2, 3], [4, 5], [6]), 0))).toEqual([[1, 2], [3, 4], [5, 6]]);
    });

    it('pulls pages backward in cascade', () => {
        expect(pagesOf(ripplePullBackward(groups([1], [2, 3], [4, 5]), 0))).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('does not mutate the input', () => {
        const g = groups([1, 2], [3]);
        shiftOneDown(g, 0);
        expect(pagesOf(g)).toEqual([[1, 2], [3]]);
    });

    it('moves a page between students and to the solution in one step', () => {
        const res = movePage(groups([1, 2], [3]), [9], 0, 1, 1);
        expect(pagesOf(res.groups)).toEqual([[1], [3, 2]]);
        const toSol = movePage(groups([1, 2]), [], 0, 0, 'solution');
        expect(toSol.solution).toEqual([1]);
        const fromSol = movePage(groups([1]), [7, 8], 'solution', 1, 0);
        expect(pagesOf(fromSol.groups)).toEqual([[1, 8]]);
        expect(fromSol.solution).toEqual([7]);
    });

    it('loads first and last pages first', () => {
        expect(thumbnailOrder(groups([1, 2, 3], [4, 5, 6]), 3, 7)).toEqual([1, 4, 3, 6, 2, 5, 7]);
    });
});
