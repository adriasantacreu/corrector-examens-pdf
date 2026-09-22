import { describe, expect, it } from 'vitest';
import { buildStudentsFromPages, findBestNameMatch, matchClassroomStudents, mergeNameLists } from '../students';
import { mergeSummaries, migrateGlobalSettings, migrateSession } from '../session';
import { addRegion, createRegion, distributeRubric, rubricExceedsMax } from '../exercises';

describe('students', () => {
    it('splits the PDF in consecutive blocks (1-based pages)', () => {
        const s = buildStudentsFromPages(7, 3);
        expect(s.map(x => x.pageIndexes)).toEqual([[1, 2, 3], [4, 5, 6]]);
    });

    it('matches handwritten names ignoring accents and small typos', () => {
        const known = ['Lluc Ripollès', 'Martina García Estrada', 'Pol Biosca'];
        expect(findBestNameMatch('lluc ripolles', known)).toBe('Lluc Ripollès');
        expect(findBestNameMatch('Martina Garcia', known)).toBe('Martina García Estrada');
        expect(findBestNameMatch('Pol Bisca', known)).toBe('Pol Biosca');
        expect(findBestNameMatch('Zzzz', known)).toBeNull();
    });

    it('links classroom emails by name', () => {
        const { updatedStudents, matchesFound } = matchClassroomStudents(
            [{ id: 's1', name: 'Pol Biosca', pageIndexes: [1] }],
            [{ profile: { name: { fullName: 'Pol Biosca' }, emailAddress: 'pol@x.cat' } }],
        );
        expect(matchesFound).toBe(1);
        expect(updatedStudents[0].email).toBe('pol@x.cat');
    });

    it('merges name lists without duplicates', () => {
        expect(mergeNameLists('A\nB\n', ['B', 'C'])).toBe('A\nB\nC');
    });
});

describe('session migration', () => {
    it('opens sessions saved by the old app', () => {
        const old = {
            fileName: 'exam.pdf', mode: 'correction', pagesPerExam: 2, exercises: [], students: [{ id: 's', name: 'A', pageIndexes: [1, 2] }],
            annotations: {}, rubricCounts: {}, targetMaxScore: 10, studentList: '', commentBank: [{ text: 'hola' }], presets: [],
            lastStudentIdx: 0, lastExerciseIdx: 0, lastModified: '2026-03-01T00:00:00.000Z',
        };
        const s = migrateSession(old);
        expect(s.mode).toBe('correction');
        expect(s.commentBank[0].id).toMatch(/^cb_/);
        expect(s.students[0].ignoredPageIndexes).toEqual([]);
        expect(s.aiSuggestions).toEqual({});
    });

    it('never restores the upload screen as a session mode', () => {
        expect(migrateSession({ mode: 'upload' }).mode).toBe('setup');
    });

    it('keeps the most recent copy when merging local and cloud sessions', () => {
        const base = { sessionAlias: null, progress: 0, studentCount: 0, cloudSyncPDF: true, solutionFileName: null };
        const merged = mergeSummaries(
            [{ ...base, fileName: 'a', lastModified: '2026-01-01', isCloud: false }],
            [{ ...base, fileName: 'a', lastModified: '2026-02-01', isCloud: true }, { ...base, fileName: 'b', lastModified: '2025-01-01', isCloud: true }],
        );
        expect(merged.map(m => [m.fileName, m.isCloud])).toEqual([['a', true], ['b', true]]);
    });

    it('restores default highlighters when fewer than three are saved', () => {
        expect(migrateGlobalSettings({ presets: [] }).presets).toHaveLength(3);
    });
});

describe('exercises', () => {
    it('keeps a single name region', () => {
        const r1 = createRegion('ocr_name', 0, { x: 0, y: 0, width: 50, height: 50 }, []);
        const r2 = createRegion('ocr_name', 0, { x: 10, y: 0, width: 50, height: 50 }, [r1]);
        const list = addRegion([r1], r2);
        expect(list).toHaveLength(1);
        expect(list[0].id).toBe(r2.id);
    });

    it('distributes the max score (negative when counting down from max)', () => {
        const ex = createRegion('crop', 0, { x: 0, y: 0, width: 50, height: 50 }, []);
        const withItems = { ...ex, maxScore: 3, rubric: [{ id: 'a', label: '', points: 0 }, { id: 'b', label: '', points: 0 }, { id: 'c', label: '', points: 0 }] };
        expect(distributeRubric(withItems).map(r => r.points)).toEqual([1, 1, 1]);
        expect(distributeRubric({ ...withItems, scoringMode: 'from_max' }).map(r => r.points)).toEqual([-1, -1, -1]);
        expect(rubricExceedsMax({ ...withItems, rubric: [{ id: 'a', label: '', points: 4 }] })).toBe(true);
    });
});
