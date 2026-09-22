import type { ClassroomStudent, Student } from '../types';

/** Reparteix les pàgines del PDF en blocs consecutius de `pagesPerExam` (pàgines absolutes en base 1). */
export function buildStudentsFromPages(numPages: number, pagesPerExam: number): Student[] {
    const per = Math.max(1, Math.floor(pagesPerExam) || 1);
    const count = Math.floor(numPages / per);
    return Array.from({ length: count }, (_, i) => ({
        id: `student_${i + 1}`,
        name: `Alumne ${i + 1}`,
        pageIndexes: Array.from({ length: per }, (__, p) => i * per + p + 1),
    }));
}

/**
 * Pàgina absoluta d'una pàgina lògica de l'examen per a un alumne.
 * Retorna undefined si l'alumne no té aquesta pàgina.
 */
export function getStudentPage(student: Student, logicalPage: number, numPages?: number): number | undefined {
    const page = student.pageIndexes[logicalPage];
    if (page === undefined || page === -1 || Number.isNaN(page) || page < 1) return undefined;
    if (numPages !== undefined && page > numPages) return undefined;
    return page;
}

export const isPageIgnored = (student: Student, absolutePage: number): boolean =>
    student.ignoredPageIndexes?.includes(absolutePage) ?? false;

/** Normalitza per comparar noms: minúscules, sense accents ni signes. */
export function normalizeName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9ñç\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const curr = [i];
        for (let j = 1; j <= b.length; j++) {
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = curr;
    }
    return prev[b.length];
}

/**
 * Busca el nom de la llista oficial més semblant a un text llegit (OCR o IA).
 * Accepta coincidències exactes, parcials (nom contingut) o properes per distància d'edició.
 */
export function findBestNameMatch(candidate: string, known: string[], maxRelativeDistance = 0.4): string | null {
    const target = normalizeName(candidate);
    if (target.length < 2 || !known.length) return null;

    let best: string | null = null;
    let bestScore = Infinity;
    for (const name of known) {
        const normalized = normalizeName(name);
        if (!normalized) continue;
        if (normalized === target) return name;
        const contained = normalized.includes(target) || target.includes(normalized);
        const distance = levenshtein(target, normalized);
        const score = contained ? distance * 0.5 : distance;
        if (score < bestScore) {
            bestScore = score;
            best = name;
        }
    }
    if (!best) return null;
    return bestScore < Math.max(normalizeName(best).length, target.length) * maxRelativeDistance ? best : null;
}

export const classroomName = (cs: ClassroomStudent): string =>
    cs.profile?.name?.fullName || cs.profile?.emailAddress || 'Desconegut';

/** Relaciona els alumnes de l'examen amb els de Classroom per nom i hi posa el correu. */
export function matchClassroomStudents(students: Student[], classroom: ClassroomStudent[]): { updatedStudents: Student[]; matchesFound: number } {
    const names = classroom.map(classroomName);
    let matchesFound = 0;
    const updatedStudents = students.map(s => {
        const match = findBestNameMatch(s.name, names);
        const cs = match ? classroom[names.indexOf(match)] : undefined;
        if (cs?.profile?.emailAddress) {
            matchesFound++;
            return { ...s, email: cs.profile.emailAddress };
        }
        return s;
    });
    return { updatedStudents, matchesFound };
}

/** Llista de noms (una per línia) sense línies buides ni duplicats. */
export function parseNameList(text: string): string[] {
    return Array.from(new Set(text.split('\n').map(n => n.trim()).filter(Boolean)));
}

export function mergeNameLists(text: string, extra: string[]): string {
    return parseNameList([text, ...extra].join('\n')).join('\n');
}
