/**
 * Esquema d'una sessió de correcció i migració des de formats antics.
 * Una sessió guardada per qualsevol versió anterior de l'app s'ha de poder obrir sense perdre res.
 */
import { DEFAULT_COMMENT_BANK, DEFAULT_PRESETS } from '../config/constants';
import type {
    AiSuggestionStore, AnnotationComment, AnnotationStore, AppMode, ClassroomStudent,
    ExerciseDef, PresetHighlighter, RubricCountStore, Student, ThemeMode,
} from '../types';
import { calculateProgress } from './scoring';

export const SESSION_SCHEMA_VERSION = 2;

export interface SessionData {
    schemaVersion: number;
    fileName: string;
    sessionAlias: string | null;
    mode: AppMode;
    pagesPerExam: number;
    exercises: ExerciseDef[];
    students: Student[];
    annotations: AnnotationStore;
    rubricCounts: RubricCountStore;
    targetMaxScore: number;
    studentList: string;
    commentBank: AnnotationComment[];
    presets: PresetHighlighter[];
    lastStudentIdx: number;
    lastExerciseIdx: number;
    lastModified: string;
    studentEmailMap: Record<string, string>;
    progress: number;
    classroomStudents: ClassroomStudent[];
    ocrCompleted: boolean;
    solutionFileName: string | null;
    solutionPageIndexes: number[];
    cloudSyncPDF: boolean;
    cloudSyncSolution: boolean;
    aiSuggestions: AiSuggestionStore;
    /** Pàgines per examen amb què es va fer el repartiment d'alumnes (per no refer-lo si no ha canviat). */
    studentsPagesPerExam: number | null;
    /** Mida de lletra del segell de nota (la mateixa al corrector i al PDF). */
    stampSize: number;
}

/** El que necessita la pantalla d'inici per mostrar una targeta de sessió. */
export interface SessionSummary {
    fileName: string;
    sessionAlias: string | null;
    lastModified: string;
    progress: number;
    studentCount: number;
    cloudSyncPDF: boolean;
    solutionFileName: string | null;
    isCloud: boolean;
    cloudId?: string;
}

export interface GlobalSettings {
    theme: ThemeMode;
    cloudSyncPDF: boolean;
    lastActiveFileName: string | null;
    accessToken: string | null;
    tokenExpiresAt: number | null;
    userEmail: string | null;
    userPicture: string | null;
    commentBank: AnnotationComment[];
    presets: PresetHighlighter[];
}

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

export const ensureCommentIds = (bank: AnnotationComment[]): AnnotationComment[] =>
    bank.map(c => (c.id ? c : { ...c, id: newId('cb') }));

export function createEmptySession(fileName: string, globals: Pick<GlobalSettings, 'commentBank' | 'presets' | 'cloudSyncPDF'>): SessionData {
    return {
        schemaVersion: SESSION_SCHEMA_VERSION,
        fileName,
        sessionAlias: null,
        mode: 'setup',
        pagesPerExam: 1,
        exercises: [],
        students: [],
        annotations: {},
        rubricCounts: {},
        targetMaxScore: 10,
        studentList: '',
        commentBank: [...globals.commentBank],
        presets: [...globals.presets],
        lastStudentIdx: 0,
        lastExerciseIdx: 0,
        lastModified: new Date().toISOString(),
        studentEmailMap: {},
        progress: 0,
        classroomStudents: [],
        ocrCompleted: false,
        solutionFileName: null,
        solutionPageIndexes: [],
        cloudSyncPDF: globals.cloudSyncPDF,
        cloudSyncSolution: true,
        aiSuggestions: {},
        studentsPagesPerExam: null,
        stampSize: 24,
    };
}

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const asRecord = <T>(v: unknown): Record<string, T> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {});
const asNumber = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const VALID_MODES: AppMode[] = ['upload', 'setup', 'organize_pages', 'configure_crops', 'correction', 'results'];

/** Converteix qualsevol sessió guardada (de qualsevol versió) a l'esquema actual. */
export function migrateSession(raw: unknown, fallbackFileName = ''): SessionData {
    const r = asRecord<unknown>(raw);
    const exercises = asArray<ExerciseDef>(r.exercises);
    const students = asArray<Student>(r.students).map(s => ({
        ...s,
        pageIndexes: asArray<number>(s.pageIndexes),
        ignoredPageIndexes: asArray<number>(s.ignoredPageIndexes),
    }));
    const mode = VALID_MODES.includes(r.mode as AppMode) && r.mode !== 'upload' ? (r.mode as AppMode) : 'setup';
    const session: SessionData = {
        schemaVersion: SESSION_SCHEMA_VERSION,
        fileName: typeof r.fileName === 'string' ? r.fileName : fallbackFileName,
        sessionAlias: typeof r.sessionAlias === 'string' && r.sessionAlias ? r.sessionAlias : null,
        mode,
        pagesPerExam: Math.max(1, asNumber(r.pagesPerExam, 1)),
        exercises,
        students,
        annotations: asRecord(r.annotations),
        rubricCounts: asRecord(r.rubricCounts),
        targetMaxScore: asNumber(r.targetMaxScore, 10),
        studentList: typeof r.studentList === 'string' ? r.studentList : '',
        commentBank: ensureCommentIds(asArray<AnnotationComment>(r.commentBank)),
        presets: asArray<PresetHighlighter>(r.presets),
        lastStudentIdx: asNumber(r.lastStudentIdx, 0),
        lastExerciseIdx: asNumber(r.lastExerciseIdx, 0),
        lastModified: typeof r.lastModified === 'string' ? r.lastModified : new Date().toISOString(),
        studentEmailMap: asRecord<string>(r.studentEmailMap),
        progress: asNumber(r.progress, 0),
        classroomStudents: asArray<ClassroomStudent>(r.classroomStudents),
        ocrCompleted: r.ocrCompleted === true,
        solutionFileName: typeof r.solutionFileName === 'string' ? r.solutionFileName : null,
        solutionPageIndexes: asArray<number>(r.solutionPageIndexes),
        cloudSyncPDF: typeof r.cloudSyncPDF === 'boolean' ? r.cloudSyncPDF : true,
        cloudSyncSolution: typeof r.cloudSyncSolution === 'boolean' ? r.cloudSyncSolution : true,
        aiSuggestions: asRecord(r.aiSuggestions),
        // Les sessions antigues no ho guardaven: s'assumeix que els alumnes es van repartir amb el valor actual
        studentsPagesPerExam: typeof r.studentsPagesPerExam === 'number' ? r.studentsPagesPerExam
            : students.length ? Math.max(1, asNumber(r.pagesPerExam, 1)) : null,
        stampSize: asNumber(r.stampSize, 24),
    };
    if (session.lastStudentIdx >= Math.max(1, students.length)) session.lastStudentIdx = 0;
    return session;
}

/**
 * En obrir una sessió, els comentaris i fluorescents generals són els globals (compartits entre sessions)
 * i els específics d'exercici són els de la sessió.
 */
export function mergeWithGlobals(session: SessionData, globals: Pick<GlobalSettings, 'commentBank' | 'presets'>): SessionData {
    return {
        ...session,
        commentBank: [...globals.commentBank, ...session.commentBank.filter(c => c.exerciseId)],
        presets: [...globals.presets, ...session.presets.filter(p => p.exerciseId)],
    };
}

export function withComputedFields(session: SessionData): SessionData {
    return {
        ...session,
        lastModified: new Date().toISOString(),
        progress: calculateProgress(session.students.map(s => s.id), session.exercises, session.annotations, session.rubricCounts),
    };
}

export function toSummary(session: SessionData, cloud?: { isCloud: boolean; cloudId?: string }): SessionSummary {
    return {
        fileName: session.fileName,
        sessionAlias: session.sessionAlias,
        lastModified: session.lastModified,
        progress: session.progress,
        studentCount: session.students.length,
        cloudSyncPDF: session.cloudSyncPDF,
        solutionFileName: session.solutionFileName,
        isCloud: cloud?.isCloud ?? false,
        cloudId: cloud?.cloudId,
    };
}

/** Uneix les sessions locals i les del núvol (per nom de fitxer, guanya la més recent). */
export function mergeSummaries(local: SessionSummary[], cloud: SessionSummary[]): SessionSummary[] {
    const byName = new Map<string, SessionSummary>();
    for (const s of local) byName.set(s.fileName, s);
    for (const s of cloud) {
        const existing = byName.get(s.fileName);
        if (!existing || new Date(s.lastModified).getTime() > new Date(existing.lastModified).getTime()) byName.set(s.fileName, s);
    }
    return [...byName.values()].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
}

export function defaultGlobalSettings(): GlobalSettings {
    return {
        theme: 'light',
        cloudSyncPDF: true,
        lastActiveFileName: null,
        accessToken: null,
        tokenExpiresAt: null,
        userEmail: null,
        userPicture: null,
        commentBank: [...DEFAULT_COMMENT_BANK],
        presets: [...DEFAULT_PRESETS],
    };
}

export function migrateGlobalSettings(raw: unknown): GlobalSettings {
    const r = asRecord<unknown>(raw);
    const defaults = defaultGlobalSettings();
    const presets = asArray<PresetHighlighter>(r.presets);
    const bank = asArray<AnnotationComment>(r.commentBank);
    return {
        theme: r.theme === 'dark' ? 'dark' : 'light',
        cloudSyncPDF: typeof r.cloudSyncPDF === 'boolean' ? r.cloudSyncPDF : true,
        lastActiveFileName: typeof r.lastActiveFileName === 'string' ? r.lastActiveFileName : null,
        accessToken: typeof r.accessToken === 'string' ? r.accessToken : null,
        tokenExpiresAt: typeof r.tokenExpiresAt === 'number' ? r.tokenExpiresAt : null,
        userEmail: typeof r.userEmail === 'string' ? r.userEmail : null,
        userPicture: typeof r.userPicture === 'string' ? r.userPicture : null,
        // Igual que abans: si hi ha menys de 3 fluorescents guardats es restauren els de per defecte
        presets: presets.length >= 3 ? presets : defaults.presets,
        commentBank: ensureCommentIds(Array.isArray(r.commentBank) ? bank : defaults.commentBank),
    };
}
