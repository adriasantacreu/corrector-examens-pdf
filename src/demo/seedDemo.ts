/**
 * Dades de demostració (`?demo=1`): un PDF d'examen generat al moment i unes quantes sessions fictícies,
 * cadascuna aturada en una pantalla diferent (configuració, organitzador, retalls, correcció, resultats).
 * `?demo=reset` les torna a crear de zero. Els noms són inventats: no hi ha cap dada d'alumnes reals.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { DEFAULT_COMMENT_BANK, DEFAULT_PRESETS, RENDER_SCALE } from '../config/constants';
import { createEmptySession, withComputedFields, type SessionData } from '../domain/session';
import { storePdf } from '../services/storage/pdfCache';
import { hasSession, saveSession } from '../services/storage/sessionRepository';
import type { Annotation, AnnotationStore, ExerciseDef, RubricCountStore, Student } from '../types';

const A4 = { width: 595, height: 842 };
const S = RENDER_SCALE;
const NAMES = ['Laia Puig Serra', 'Marc Soler Vidal', 'Núria Ferrer Camps', 'Pol Riera Mas', 'Aina Costa Roig', 'Jan Vila Font'];
const INK = rgb(0.12, 0.2, 0.55);

/** Rectangle en punts PDF mesurats des de dalt → coordenades de retall (píxels a l'escala de treball). */
const box = (x: number, y: number, w: number, h: number) => ({ x: x * S, y: y * S, width: w * S, height: h * S });

const EXERCISES: ExerciseDef[] = [
    { id: 'ex_nom', type: 'ocr_name', label: 'Nom', pageIndex: 0, ...box(90, 92, 300, 26) },
    {
        id: 'ex_1', type: 'crop', name: 'Producte i determinant', maxScore: 3, pageIndex: 0, ...box(36, 140, 523, 300),
        rubric: [{ id: 'r_signe', label: 'Error de signe', points: -0.25 }, { id: 'r_just', label: 'Sense justificar', points: -0.5 }],
    },
    { id: 'ex_2', type: 'crop', name: 'Discussió de sistemes', maxScore: 3, pageIndex: 0, ...box(36, 450, 523, 360) },
    { id: 'ex_3', type: 'pages', name: 'Matriu inversa', maxScore: 4, pageIndexes: [1] },
];

function write(page: PDFPage, font: PDFFont, text: string, x: number, yTop: number, size = 11, color = rgb(0, 0, 0)) {
    page.drawText(text, { x, y: A4.height - yTop - size, size, font, color });
}

function frame(page: PDFPage, x: number, yTop: number, w: number, h: number) {
    page.drawRectangle({ x, y: A4.height - yTop - h, width: w, height: h, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.8 });
}

/** Examen de 2 pàgines per alumne, amb respostes "a mà" que canvien una mica d'un alumne a l'altre. */
async function buildExamPdf(names: string[]): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const sans = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const hand = await doc.embedFont(StandardFonts.CourierOblique);

    names.forEach((name, i) => {
        const p1 = doc.addPage([A4.width, A4.height]);
        write(p1, bold, 'Institut Escola Sant Pol de Mar · Matemàtiques II', 36, 36, 12);
        write(p1, sans, 'Examen de matrius i determinants · 2n de Batxillerat', 36, 54, 10, rgb(0.35, 0.35, 0.35));
        write(p1, bold, 'Nom:', 36, 98, 11);
        p1.drawLine({ start: { x: 80, y: A4.height - 114 }, end: { x: 400, y: A4.height - 114 }, thickness: 0.6, color: rgb(0.6, 0.6, 0.6) });
        write(p1, hand, name, 96, 96, 14, INK);

        frame(p1, 36, 140, 523, 300);
        write(p1, bold, '1. (3 punts) Calcula A·B i el determinant de A, on A = (2 1; 1 3) i B = (1 0; -1 2).', 46, 150, 10);
        const det = i % 3 === 1 ? '|A| = 6 - 1 = 4' : '|A| = 2·3 - 1·1 = 5';
        ['A·B = (2·1 + 1·(-1)   2·0 + 1·2)', '      (1·1 + 3·(-1)   1·0 + 3·2)', '', 'A·B = ( 1  2 )', '      (-2  6 )', '', det].forEach((l, k) =>
            write(p1, hand, l, 60, 185 + k * 24, 13, INK));

        frame(p1, 36, 450, 523, 360);
        write(p1, bold, '2. (3 punts) Discuteix el sistema segons el valor de k:  x + y = 2,  2x + ky = 4.', 46, 460, 10);
        ['|M| = k - 2', 'Si k != 2 -> SCD (solució única)', i % 2 ? 'Si k = 2 -> SI' : 'Si k = 2 -> rang M = rang M* = 1 -> SCI', '', 'Per k = 3:  x = 2, y = 0'].forEach((l, k) =>
            write(p1, hand, l, 60, 500 + k * 26, 13, INK));

        const p2 = doc.addPage([A4.width, A4.height]);
        write(p2, bold, '3. (4 punts) Troba la matriu inversa de C = (1 2 0; 0 1 1; 1 0 1) pel mètode de Gauss.', 36, 40, 10);
        ['(1 2 0 | 1 0 0)', '(0 1 1 | 0 1 0)', '(1 0 1 | 0 0 1)', '', 'F3 - F1:  (0 -2 1 | -1 0 1)', 'F3 + 2F2: (0 0 3 | -1 2 1)', '',
            'C^-1 = 1/3 · ( 1  -2   2 )', '              ( 1   1  -1 )', '              (-1   2   1 )'].forEach((l, k) =>
            write(p2, hand, l, 60, 90 + k * 26, 13, INK));
        if (i % 2 === 0) write(p2, hand, 'Comprovació: C · C^-1 = I  (ok)', 60, 380, 13, INK);
    });
    return doc.save();
}

const students = (names: string[]): Student[] =>
    names.map((name, i) => ({ id: `al_${i + 1}`, name, pageIndexes: [2 * i + 1, 2 * i + 2] }));

/** Anotacions d'exemple (boli, marcador amb criteri, comentari del banc) en coordenades de cada exercici. */
function sampleAnnotations(variant: number): Record<string, Annotation[]> {
    const tick = (x: number, y: number, color = '#10b981'): Annotation => ({
        id: `p_${x}_${y}`, type: 'pen', color, strokeWidth: 6, points: [x, y, x + 25, y + 30, x + 80, y - 40],
    });
    const comment = DEFAULT_COMMENT_BANK[variant % DEFAULT_COMMENT_BANK.length];
    return {
        ex_1: [
            tick(1000, 180),
            { id: 'h_1', type: 'highlighter', x: 60, y: 590, width: 520, height: 70, color: DEFAULT_PRESETS[1].color, presetId: 'h2', points: -0.25, label: DEFAULT_PRESETS[1].label },
            { id: 't_1', type: 'text', x: 700, y: 600, text: comment.text, score: comment.score, commentBankId: comment.id, color: '#111827', fontSize: 18 },
        ],
        ex_2: variant % 2
            ? [{ id: 'h_2', type: 'highlighter', x: 60, y: 260, width: 700, height: 70, color: DEFAULT_PRESETS[2].color, presetId: 'h3', points: -1, label: DEFAULT_PRESETS[2].label }]
            : [tick(1100, 300)],
        ex_3: [tick(1200, 600, '#3b82f6')],
    };
}

function annotate(list: Student[], upTo: number) {
    const annotations: AnnotationStore = {};
    const rubricCounts: RubricCountStore = {};
    list.slice(0, upTo).forEach((s, i) => {
        annotations[s.id] = sampleAnnotations(i);
        if (i % 3 === 1) rubricCounts[s.id] = { ex_1: { r_signe: 1 } };
    });
    return { annotations, rubricCounts };
}

function session(fileName: string, alias: string | null, patch: Partial<SessionData>, minutesAgo: number): SessionData {
    const base = createEmptySession(fileName, { commentBank: DEFAULT_COMMENT_BANK, presets: DEFAULT_PRESETS, cloudSyncPDF: false });
    // withComputedFields posa la data d'ara: la de la demo s'aplica després perquè l'ordre sigui sempre el mateix
    return {
        ...withComputedFields({ ...base, sessionAlias: alias, pagesPerExam: 2, studentsPagesPerExam: 2, ...patch }),
        lastModified: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    };
}

export const isDemoRequested = () => new URLSearchParams(window.location.search).has('demo');

export async function seedDemo(): Promise<void> {
    const reset = new URLSearchParams(window.location.search).get('demo') === 'reset';
    const all = students(NAMES);
    const pdf = await buildExamPdf(NAMES);

    const sessions: SessionData[] = [
        session('demo_matrius_2bat.pdf', 'Matrius · 2n BAT (demo)', {
            mode: 'correction', students: all, exercises: EXERCISES, ocrCompleted: true, ...annotate(all, 3), lastStudentIdx: 1,
        }, 5),
        session('demo_funcions_1bat.pdf', 'Funcions · 1r BAT (demo)', {
            mode: 'results', students: all, exercises: EXERCISES, ocrCompleted: true, ...annotate(all, all.length),
        }, 60 * 26),
        session('demo_estadistica_4eso.pdf', 'Estadística · 4t ESO (demo)', {
            mode: 'configure_crops', students: all, exercises: EXERCISES.slice(0, 2),
        }, 60 * 50),
        session('demo_geometria_1bat.pdf', 'Geometria · 1r BAT (demo)', { mode: 'organize_pages', students: all }, 60 * 75),
        session('demo_nou_examen.pdf', null, { mode: 'setup', students: [], studentsPagesPerExam: null }, 60 * 100),
    ];

    for (const s of sessions) {
        if (!reset && await hasSession(s.fileName)) continue;
        await storePdf(s.fileName, new File([pdf as BlobPart], s.fileName, { type: 'application/pdf' }));
        await saveSession(s);
    }
}
