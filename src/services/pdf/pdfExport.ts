/**
 * Generació dels PDFs corregits (un per alumne o un de combinat).
 * Fa servir el mateix motor de puntuació i la mateixa disposició de pàgines que el corrector.
 */
import { PDFDocument } from 'pdf-lib';
import { FONT_SCALE } from '../../config/constants';
import { annotationAnchor, findPlacement, layoutBounds, layoutPages, translateAnnotation, type PagePlacement } from '../../domain/pageLayout';
import { DEFAULT_STAMP_SIZE, resolveStamp, STAMP_WIDTH, stampTitleColor, type StampPlacement } from '../../domain/stamp';
import {
    buildScoreSummaryLines, computeExerciseScore, computeStudentScore, getGradableExercises, getMaxScore,
    round2, SCORE_STAMP_ID, type ScoringContext,
} from '../../domain/scoring';
import { getStudentPage, isPageIgnored } from '../../domain/students';
import type {
    Annotation, AnnotationStore, ExerciseDef, GradableExercise, RubricCountStore, Student, TextAnnotation, TotalScoreRegion,
} from '../../types';
import { paintAnnotations, preloadImages } from './annotationPainter';
import type { PDFDocumentProxy } from './pdfDocument';
import { findStampSpot, stampFootprint } from '../../domain/freeSpot';
import { inkGrid, type InkSource } from './inkGrid';
import { getPageSize, renderPageCopy } from './pageRenderer';

export interface ExportData extends ScoringContext {
    pdfDoc: PDFDocumentProxy;
    exercises: ExerciseDef[];
    annotations: AnnotationStore;
    rubricCounts: RubricCountStore;
    targetMaxScore: number;
    scaleFactor: number;
    stampSize: number;
}

function stampAnnotations(
    ex: GradableExercise, score: number, p: StampPlacement, lines: string[], factor: number, size: number,
): TextAnnotation[] {
    const max = getMaxScore(ex) * factor;
    const scaled = round2(score * factor);
    const title: TextAnnotation = {
        id: `stamp_${ex.id}`, type: 'text', text: `Nota: ${scaled} / ${round2(max)}`, x: p.x, y: p.y,
        color: stampTitleColor(scaled, max), fontSize: (size * 1.5 * p.scale) / FONT_SCALE,
        fontWeight: 'bold', align: 'left', baseline: 'top',
    };
    if (!lines.length) return [title];
    return [title, {
        id: `stamp_detail_${ex.id}`, type: 'text', text: lines.join('\n'), x: p.x, y: p.y + size * 1.7 * p.scale,
        color: 'rgba(0,0,0,0.6)', fontSize: (size * 0.75 * p.scale) / FONT_SCALE, align: 'left', baseline: 'top',
        width: STAMP_WIDTH * p.scale, wrap: 'word',
    }];
}

/** Disposició de les pàgines d'un exercici "pàgines" per a un alumne (idèntica a la del corrector). */
export async function pagesExerciseLayout(pdfDoc: PDFDocumentProxy, student: Student, ex: GradableExercise & { type: 'pages' }):
    Promise<{ placements: PagePlacement[]; pageByOrder: Map<number, number> }> {
    const pageByOrder = new Map<number, number>();
    const slots = await Promise.all(ex.pageIndexes.map(async (logical, order) => {
        const abs = getStudentPage(student, logical, pdfDoc.numPages);
        if (abs === undefined || isPageIgnored(student, abs)) return { order, size: null };
        pageByOrder.set(order, abs);
        return { order, size: await getPageSize(pdfDoc, abs) };
    }));
    return { placements: layoutPages(slots, !!ex.spansTwoPages), pageByOrder };
}

export async function generateStudentPdf(data: ExportData, student: Student): Promise<Blob> {
    try { await Promise.all([document.fonts.load("12px 'Caveat'"), document.fonts.load("bold 12px 'Caveat'")]); } catch { /* sense fonts */ }
    const { pdfDoc, scaleFactor } = data;
    // Per pàgina, les anotacions agrupades per exercici (cada exercici té la seva configuració de llegenda)
    const byPage = new Map<number, Map<string, Annotation[]>>();
    const push = (page: number, exId: string, anns: Annotation[]) => {
        const groups = byPage.get(page) ?? new Map<string, Annotation[]>();
        groups.set(exId, [...(groups.get(exId) ?? []), ...anns]);
        byPage.set(page, groups);
    };
    // Les pàgines es pinten primer: el segell (C5) busca la zona lliure sobre les mateixes imatges que el corrector
    const canvases = new Map<number, HTMLCanvasElement>();
    for (const n of student.pageIndexes.filter(p => p !== -1 && p >= 1 && p <= pdfDoc.numPages)) {
        if (!canvases.has(n)) canvases.set(n, await renderPageCopy(pdfDoc, n));
    }
    const freeSpot = (ex: GradableExercise, anns: Annotation[], sources: InkSource[], bounds: { width: number; height: number }) =>
        ex.stampX !== undefined || anns.some(a => a.id === SCORE_STAMP_ID) ? undefined
            : findStampSpot(inkGrid(sources, bounds), bounds, stampFootprint(data.stampSize || DEFAULT_STAMP_SIZE, ex.stampScale ?? 1));
    const allAnns: Annotation[] = [];
    const useLegendFor = new Set<string>();

    for (const ex of getGradableExercises(data.exercises)) {
        const anns = data.annotations[student.id]?.[ex.id] ?? [];
        const counts = data.rubricCounts[student.id]?.[ex.id] ?? {};
        allAnns.push(...anns);
        if (anns.some(a => a.type === 'highlighter_legend')) useLegendFor.add(ex.id);
        const { score } = computeExerciseScore(ex, anns, counts, data);
        const lines = buildScoreSummaryLines(ex, anns, counts, data.presets, scaleFactor);
        const visible = anns.filter(a => a.id !== SCORE_STAMP_ID);

        if (ex.type === 'crop') {
            const page = getStudentPage(student, ex.pageIndex, pdfDoc.numPages);
            if (page === undefined) continue;
            const bounds = { width: ex.width, height: ex.height };
            const full = canvases.get(page);
            const free = full && freeSpot(ex, anns, [{ canvas: full, sx: ex.x, sy: ex.y, x: 0, y: 0, width: ex.width, height: ex.height }], bounds);
            const stamp = resolveStamp(ex, anns, ex.width, bounds, free);
            const stampAnns = stampAnnotations(ex, score, stamp, lines, scaleFactor, data.stampSize);
            push(page, ex.id, [...visible, ...stampAnns].map(a => translateAnnotation(a, ex.x, ex.y)));
            continue;
        }

        const { placements, pageByOrder } = await pagesExerciseLayout(pdfDoc, student, ex);
        if (!placements.length) continue;
        for (const ann of visible) {
            const target = findPlacement(annotationAnchor(ann), placements);
            if (!target) continue;
            push(pageByOrder.get(target.order)!, ex.id, [translateAnnotation(ann, -target.x, -target.y)]);
        }
        const bounds = layoutBounds(placements);
        const free = freeSpot(ex, anns, placements.flatMap(pl => {
            const canvas = canvases.get(pageByOrder.get(pl.order)!);
            return canvas ? [{ canvas, sx: 0, sy: 0, x: pl.x, y: pl.y, width: pl.width, height: pl.height }] : [];
        }), bounds);
        const stamp = resolveStamp(ex, anns, placements[placements.length - 1].width, bounds, free);
        const target = findPlacement(stamp, placements) ?? placements[0];
        const local = { ...stamp, x: stamp.x - target.x, y: stamp.y - target.y };
        push(pageByOrder.get(target.order)!, ex.id, stampAnnotations(ex, score, local, lines, scaleFactor, data.stampSize));
    }

    const totalRegion = data.exercises.find((e): e is TotalScoreRegion => e.type === 'total_score');
    if (totalRegion) {
        const page = getStudentPage(student, totalRegion.pageIndex, pdfDoc.numPages);
        if (page !== undefined) {
            const { normalized } = computeStudentScore(student.id, data.exercises, data.annotations, data.rubricCounts, data.targetMaxScore, data);
            push(page, '', [{
                id: 'grand_total', type: 'text', text: String(normalized),
                x: totalRegion.x + totalRegion.width - 10, y: totalRegion.y + totalRegion.height - 10,
                color: normalized >= data.targetMaxScore / 2 ? '#10b981' : '#ef4444', fontSize: 64, align: 'right', baseline: 'bottom',
            }]);
        }
    }

    const images = await preloadImages(allAnns);
    const pdf = await PDFDocument.create();
    for (const pageNumber of student.pageIndexes.filter(p => p !== -1 && p >= 1 && p <= pdfDoc.numPages)) {
        const canvas = canvases.get(pageNumber)!;
        const ctx = canvas.getContext('2d')!;
        for (const [exId, anns] of byPage.get(pageNumber) ?? []) {
            paintAnnotations(ctx, anns, {
                presets: data.presets, scaleFactor, images,
                useLegend: useLegendFor.has(exId),
                exerciseAnnotations: data.annotations[student.id]?.[exId] ?? anns,
            });
        }
        const jpg = await pdf.embedJpg(await (await fetch(canvas.toDataURL('image/jpeg', 0.85))).arrayBuffer());
        const page = pdf.addPage([canvas.width, canvas.height]);
        page.drawImage(jpg, { x: 0, y: 0, width: canvas.width, height: canvas.height });
    }
    const bytes = await pdf.save();
    return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

export async function generateCombinedPdf(data: ExportData, students: Student[], onProgress?: (pct: number) => void): Promise<Blob> {
    const merged = await PDFDocument.create();
    for (let i = 0; i < students.length; i++) {
        const studentPdf = await PDFDocument.load(await (await generateStudentPdf(data, students[i])).arrayBuffer());
        const pages = await merged.copyPages(studentPdf, studentPdf.getPageIndices());
        pages.forEach(p => merged.addPage(p));
        onProgress?.(Math.round(((i + 1) / students.length) * 100));
    }
    return new Blob([(await merged.save()) as BlobPart], { type: 'application/pdf' });
}

export const studentPdfFileName = (student: Student) => `correccio_${student.name.replace(/\s+/g, '_')}.pdf`;

export function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
}

