import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { PDFDocumentProxy } from './pdfUtils';
import { renderPDFPageToCanvas } from './pdfUtils';
import type {
    Student, ExerciseDef, AnnotationStore, Annotation,
    PenAnnotation, HighlighterAnnotation, TextAnnotation, ImageAnnotation,
    RubricCountStore,
} from '../types';

const RENDER_SCALE = 2.5;
const FONT_SCALE = 2.5;

function parseColor(color: string): { r: number; g: number; b: number; a: number } {
    if (color.startsWith('rgba') || color.startsWith('rgb')) {
        const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (m) return { r: parseInt(m[1]) / 255, g: parseInt(m[2]) / 255, b: parseInt(m[3]) / 255, a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
    }
    const c = color.replace('#', '');
    if (c.length >= 6) return { r: parseInt(c.substring(0, 2), 16) / 255, g: parseInt(c.substring(2, 4), 16) / 255, b: parseInt(c.substring(4, 6), 16) / 255, a: 1 };
    return { r: 0, g: 0, b: 0, a: 1 };
}

export function drawAnnotationsOnCanvas(ctx: CanvasRenderingContext2D, annotations: Annotation[], forceSkipHlLabels: boolean = false, fullExerciseAnnotations: Annotation[] = []): void {
    const hasLegend = forceSkipHlLabels || annotations.some(a => a.type === 'highlighter_legend') || fullExerciseAnnotations.some(a => a.type === 'highlighter_legend');
    for (const ann of annotations) {
        if (ann.type === 'pen') drawPen(ctx, ann);
        else if (ann.type === 'highlighter') drawHighlighter(ctx, ann, hasLegend);
        else if (ann.type === 'text') drawText(ctx, ann);
        else if (ann.type === 'image') drawImageAnn(ctx, ann);
        else if (ann.type === 'highlighter_legend') drawHighlighterLegend(ctx, ann, fullExerciseAnnotations.length > 0 ? fullExerciseAnnotations : annotations);
    }
}

function drawPen(ctx: CanvasRenderingContext2D, ann: PenAnnotation) {
    if (ann.points.length < 2) return;
    const { r, g, b, a } = parseColor(ann.color);
    const finalAlpha = ann.opacity !== undefined ? ann.opacity : a;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ann.points[0], ann.points[1]);
    for (let i = 2; i < ann.points.length; i += 2) {
        const p1x = ann.points[i - 2];
        const p1y = ann.points[i - 1];
        const p2x = ann.points[i];
        const p2y = ann.points[i + 1];
        const midX = (p1x + p2x) / 2;
        const midY = (p1y + p2y) / 2;
        ctx.quadraticCurveTo(p1x, p1y, midX, midY);
    }
    ctx.strokeStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${finalAlpha})`;
    ctx.lineWidth = (ann.strokeWidth || 2) * RENDER_SCALE * 0.9;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
}

function drawHighlighter(ctx: CanvasRenderingContext2D, ann: HighlighterAnnotation, skipLabel: boolean = false) {
    const { r, g, b, a } = parseColor(ann.color);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;

    const rx = Math.min(ann.x, ann.x + (ann.width || 0));
    const ry = Math.min(ann.y, ann.y + (ann.height || 0));
    const rw = Math.abs(ann.width || 0);
    const rh = Math.abs(ann.height || 0);

    ctx.fillRect(rx, ry, rw, rh);
    ctx.globalAlpha = 1;

    if (!skipLabel) {
        const parts = [ann.label || '', ann.points !== undefined ? (ann.points > 0 ? `+${ann.points}` : `${ann.points}`) : ''].filter(Boolean);
        if (parts.length) {
            const fontSize = (ann.fontSize || 18) * FONT_SCALE;
            ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
            ctx.font = `bold ${fontSize}px Caveat, cursive`;
            ctx.textBaseline = 'top'; // matching Konva logic better

            const lx = ann.x + (ann.labelOffsetX ?? 2);
            const ly = ann.y + (ann.labelOffsetY ?? -(fontSize + 4));

            ctx.fillText(parts.join(' '), lx, ly);
        }
    }
    ctx.restore();
}

const DEFAULT_HIGHLIGHT_PRESETS_FOR_EXPORT = [
    { label: 'Error Procediment', color: 'rgba(239, 68, 68, 0.4)', points: -0.5 },
    { label: 'Error Càlcul', color: 'rgba(249, 115, 22, 0.4)', points: -0.25 },
    { label: 'Falta Raonament', color: 'rgba(234, 179, 8, 0.4)', points: -0.5 },
    { label: 'Error Greu', color: 'rgba(225, 29, 72, 0.4)', points: -1.0 },
    { label: 'Anotació Bona', color: 'rgba(16, 185, 129, 0.4)', points: 0.5 },
];

function drawHighlighterLegend(ctx: CanvasRenderingContext2D, ann: any, allAnnotations: Annotation[]) {
    ctx.save();
    const scale = ann.scale || 1;
    const legendFontSize = 14 * FONT_SCALE * scale;
    const presets = DEFAULT_HIGHLIGHT_PRESETS_FOR_EXPORT;

    // Simple way to identify used presets: match by label or points if possible, 
    // but the most reliable is checking what types of highlighters we have.
    // In our app, presets have clear labels.
    const usedLabels = new Set(allAnnotations
        .filter((a): a is HighlighterAnnotation => a.type === 'highlighter' && !!a.label)
        .map(a => a.label));

    const usedPresets = presets.filter(p => usedLabels.has(p.label));

    if (usedPresets.length === 0) {
        ctx.restore();
        return;
    }

    const itemHeight = legendFontSize + (10 * scale);

    usedPresets.forEach((p, i) => {
        const py = ann.y + i * itemHeight;
        const { r, g, b, a } = parseColor(p.color);

        ctx.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}, ${a})`;
        ctx.beginPath();
        // Fallback for roundRect if not in environment
        if ((ctx as any).roundRect) {
            (ctx as any).roundRect(ann.x, py, legendFontSize, legendFontSize, 2 * scale);
        } else {
            ctx.rect(ann.x, py, legendFontSize, legendFontSize);
        }
        ctx.fill();

        ctx.fillStyle = "#1e293b";
        ctx.font = `bold ${legendFontSize * 0.9}px Caveat, cursive`;
        ctx.textBaseline = 'top';
        ctx.fillText(p.label, ann.x + legendFontSize + (12 * scale), py + (2 * scale));
    });
    ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, ann: TextAnnotation) {
    const { r, g, b } = parseColor(ann.color);
    ctx.save();

    const family = "Caveat, cursive";
    const weight = ann.fontWeight || 'normal';
    const fontSize = (ann.fontSize || 18) * FONT_SCALE;
    ctx.font = `${weight} ${fontSize}px ${family}`;
    ctx.textAlign = ann.align || 'left';
    ctx.textBaseline = ann.baseline || 'top';

    if (ann.bgFill) {
        const metrics = ctx.measureText(ann.text);
        const padding = 4;
        ctx.fillStyle = ann.bgFill;
        let bgX = ann.x;
        let bgY = ann.y;
        if (ctx.textAlign === 'right') bgX -= metrics.width;
        if (ctx.textAlign === 'center') bgX -= metrics.width / 2;
        if (ctx.textBaseline === 'bottom') bgY -= (fontSize);
        if (ctx.textBaseline === 'middle') bgY -= (fontSize / 2);

        ctx.fillRect(bgX - padding, bgY - padding, metrics.width + padding * 2, fontSize + padding * 2);
    }

    ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    const lines = ann.text.split('\n');
    let currentY = ann.y;
    const lineHeight = fontSize * 1.1;

    for (const line of lines) {
        ctx.fillText(line, ann.x, currentY);
        currentY += lineHeight;
    }

    if (ann.score !== undefined) {
        ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        const scoreFontSize = fontSize * 0.65;
        ctx.font = `bold ${scoreFontSize}px Caveat, cursive`;
        if (ann.text) {
            ctx.textBaseline = 'bottom';
            // Use the original Y for score position, could be adjusted if multiline score is needed but score is usually single line text
            ctx.fillText(ann.score > 0 ? `+${ann.score}` : `${ann.score}`, ann.x, ann.y);
        }
    }
    ctx.restore();
}

function drawImageAnn(ctx: CanvasRenderingContext2D, ann: ImageAnnotation) {
    const img = new Image();
    img.src = ann.dataUrl;
    try { ctx.drawImage(img, ann.x, ann.y, ann.width, ann.height); } catch { /* ignore */ }
}

async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
    const b64 = dataUrl.split(',')[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

function addCropOffset(annotations: Annotation[], dx: number, dy: number): Annotation[] {
    return annotations.map(ann => {
        if (ann.type === 'pen') return { ...ann, points: ann.points.map((v, i) => i % 2 === 0 ? v + dx : v + dy) };
        if (ann.type === 'highlighter' || ann.type === 'text' || ann.type === 'image' || ann.type === 'highlighter_legend') {
            return { ...ann, x: (ann as any).x + dx, y: (ann as any).y + dy };
        }
        return ann;
    });
}

const groupRepetitions = (items: { label: string, pts?: number }[], formatP: (p: number) => string) => {
    const map = new Map<string, { count: number, pts?: number }>();
    for (const item of items) {
        const key = item.label;
        if (map.has(key)) {
            const existing = map.get(key)!;
            map.set(key, { count: existing.count + 1, pts: (existing.pts || 0) + (item.pts || 0) });
        } else {
            map.set(key, { count: 1, pts: item.pts });
        }
    }
    return Array.from(map.entries()).map(([label, data]) => {
        return `${label}${data.count > 1 ? ` (x${data.count})` : ''}${data.pts !== undefined ? ` (${formatP(data.pts)})` : ''}`;
    }).join(', ');
};

async function renderExerciseToDataURL(
    pdfDoc: PDFDocumentProxy, student: Student, exercise: ExerciseDef, annotations: Annotation[],
    exerciseRubricCounts?: Record<string, number>, scaleFactor: number = 1
): Promise<{ dataUrl: string; width: number; height: number } | null> {
    try {
        if (exercise.type === 'crop') {
            const absPage = student.pageIndexes[exercise.pageIndex];
            if (absPage === undefined || absPage === -1) return null;

            const fullCanvas = document.createElement('canvas');
            await renderPDFPageToCanvas(pdfDoc, absPage, fullCanvas, RENDER_SCALE);
            const crop = document.createElement('canvas');
            crop.width = exercise.width; crop.height = exercise.height;
            const ctx = crop.getContext('2d')!;
            ctx.drawImage(fullCanvas, exercise.x, exercise.y, exercise.width, exercise.height, 0, 0, exercise.width, exercise.height);

            const stampStorage = annotations.find(a => a.id === 'system_score_stamp') as TextAnnotation | undefined;
            const exAnns = annotations.filter(a => a.id !== 'system_score_stamp');

            const highlightAdj = annotations.reduce((s, a) => (a.type === 'highlighter' && typeof a.points === 'number' ? s + a.points : (a.type === 'text' && typeof a.score === 'number' ? s + a.score : s)), 0);
            const rubricCountsForEx = exerciseRubricCounts ?? {};
            const rubricBase = (exercise.scoringMode === 'from_zero' && exercise.rubric) ? exercise.rubric.reduce((s, item) => s + item.points * (rubricCountsForEx[item.id] ?? 0), 0) : (exercise.maxScore ?? 0);

            const rawScore = rubricBase + highlightAdj;
            const finalScore = rawScore * scaleFactor;

            const formatP = (p: number) => {
                const s = Math.round(p * scaleFactor * 100) / 100;
                return (s > 0 ? '+' : '') + s;
            };

            const rubricSumm = (exercise.rubric || [])
                .filter(item => (rubricCountsForEx[item.id] || 0) > 0)
                .map(item => `${item.label}${rubricCountsForEx[item.id] > 1 ? ` (x${rubricCountsForEx[item.id]})` : ''} (${formatP(item.points * rubricCountsForEx[item.id])})`)
                .join(', ');

            const highlightItems = annotations
                .filter(ann => ann.type === 'highlighter' && (ann as any).points !== undefined)
                .map(ann => ({ label: ((ann as any).label || 'Marc').trim(), pts: (ann as any).points as number }));
            const highlightSumm = groupRepetitions(highlightItems, formatP);

            const scoredCommItems = annotations
                .filter(ann => ann.type === 'text' && (ann as any).text.trim().length > 0 && (ann as any).score !== undefined)
                .map(ann => ({ label: (ann as any).text.trim(), pts: (ann as any).score as number }));
            const scoredCommSumm = groupRepetitions(scoredCommItems, formatP);

            const pureCommItems = annotations
                .filter(ann => ann.type === 'text' && (ann as any).text.trim().length > 0 && (ann as any).score === undefined)
                .map(ann => ({ label: (ann as any).text.trim() }));
            const pureCommSumm = groupRepetitions(pureCommItems, formatP);

            const defaultStampY = (exercise.height > 100) ? (exercise.height - 80) : 10;
            const defaultStampX = (exercise.width > 600) ? (exercise.width - 550) : 20;

            const stampX = stampStorage ? stampStorage.x : (exercise.stampX ?? defaultStampX);
            const stampY = stampStorage ? stampStorage.y : (exercise.stampY ?? defaultStampY);
            const stampScale = stampStorage?.width ? (stampStorage.width / 500) : (exercise.stampScale ?? 1.0);

            const addedScoreAnns = createScoreAnns(exercise, finalScore, stampX, stampY, stampScale, scaleFactor, rubricSumm, highlightSumm, scoredCommSumm, pureCommSumm);
            exAnns.push(...addedScoreAnns);

            drawAnnotationsOnCanvas(ctx, exAnns);
            return { dataUrl: crop.toDataURL('image/jpeg', 0.92), width: exercise.width, height: exercise.height };

        } else if (exercise.type === 'pages') {
            const spansTwoPages = (exercise as any).spansTwoPages;
            const renderedPages: { canvas: HTMLCanvasElement; width: number; height: number; xOffset: number; yOffset: number }[] = [];
            let currentYOffset = 0;
            let totalW = 0, totalH = 0;

            for (let i = 0; i < exercise.pageIndexes.length; i++) {
                const pi = exercise.pageIndexes[i];
                const absPage = student.pageIndexes[pi];
                if (absPage === undefined || absPage === -1) continue;

                const c = document.createElement('canvas');
                const d = await renderPDFPageToCanvas(pdfDoc, absPage, c, RENDER_SCALE);
                if (d) {
                    const isRightSide = spansTwoPages && i % 2 !== 0;
                    const xOffset = isRightSide ? d.width + 20 : 0;

                    renderedPages.push({ canvas: c, width: d.width, height: d.height, xOffset, yOffset: currentYOffset });

                    if (!spansTwoPages || isRightSide || i === exercise.pageIndexes.length - 1) {
                        currentYOffset += d.height + 20;
                    }
                }
            }

            if (!renderedPages.length) return null;

            totalW = spansTwoPages && renderedPages.length > 1
                ? renderedPages.filter(p => p.xOffset === 0)[0]?.width + Math.max(...renderedPages.filter(p => p.xOffset !== 0).map(p => p.width), 0) + 20
                : Math.max(...renderedPages.map(p => p.width));
            totalH = Math.max(...renderedPages.map(p => p.yOffset + p.height));

            const comp = document.createElement('canvas');
            comp.width = totalW; comp.height = totalH;
            const ctx = comp.getContext('2d')!;
            ctx.fillStyle = 'white'; ctx.fillRect(0, 0, totalW, totalH);

            for (const { canvas, xOffset, yOffset } of renderedPages) {
                ctx.drawImage(canvas, xOffset, yOffset);
            }

            const stampStorage = annotations.find(a => a.id === 'system_score_stamp') as TextAnnotation | undefined;
            const exAnns = annotations.filter(a => a.id !== 'system_score_stamp');

            const highlightAdj = annotations.reduce((s, a) => (a.type === 'highlighter' && typeof a.points === 'number' ? s + a.points : (a.type === 'text' && typeof a.score === 'number' ? s + a.score : s)), 0);
            const rubricCountsForEx = exerciseRubricCounts ?? {};
            const rubricBase = (exercise.scoringMode === 'from_zero' && exercise.rubric) ? exercise.rubric.reduce((s, item) => s + item.points * (rubricCountsForEx[item.id] ?? 0), 0) : (exercise.maxScore ?? 0);
            const finalScore = (rubricBase + highlightAdj) * scaleFactor;
            const formatP = (p: number) => {
                const s = Math.round(p * scaleFactor * 100) / 100;
                return (s > 0 ? '+' : '') + s;
            };

            const rubricSumm = (exercise.rubric || [])
                .filter(item => (rubricCountsForEx[item.id] || 0) > 0)
                .map(item => `${item.label}${rubricCountsForEx[item.id] > 1 ? ` (x${rubricCountsForEx[item.id]})` : ''} (${formatP(item.points * rubricCountsForEx[item.id])})`)
                .join(', ');

            const highlightItems = annotations
                .filter(ann => ann.type === 'highlighter' && (ann as any).points !== undefined)
                .map(ann => ({ label: ((ann as any).label || 'Marc').trim(), pts: (ann as any).points as number }));
            const highlightSumm = groupRepetitions(highlightItems, formatP);

            const scoredCommItems = annotations
                .filter(ann => ann.type === 'text' && (ann as any).text.trim().length > 0 && (ann as any).score !== undefined)
                .map(ann => ({ label: (ann as any).text.trim(), pts: (ann as any).score as number }));
            const scoredCommSumm = groupRepetitions(scoredCommItems, formatP);

            const pureCommItems = annotations
                .filter(ann => ann.type === 'text' && (ann as any).text.trim().length > 0 && (ann as any).score === undefined)
                .map(ann => ({ label: (ann as any).text.trim() }));
            const pureCommSumm = groupRepetitions(pureCommItems, formatP);

            const defaultStampY = (totalH > 100) ? (totalH - 80) : 10;
            const defaultStampX = (totalW > 600) ? (totalW - 550) : 20;

            const stampX = stampStorage ? stampStorage.x : (exercise.stampX ?? defaultStampX);
            const stampY = stampStorage ? stampStorage.y : (exercise.stampY ?? defaultStampY);
            const stampScale = stampStorage?.width ? (stampStorage.width / 500) : (exercise.stampScale ?? 1.0);

            const addedScoreAnns = createScoreAnns(exercise, finalScore, stampX, stampY, stampScale, scaleFactor, rubricSumm, highlightSumm, scoredCommSumm, pureCommSumm);
            exAnns.push(...addedScoreAnns);

            drawAnnotationsOnCanvas(ctx, exAnns);
            return { dataUrl: comp.toDataURL('image/jpeg', 0.92), width: totalW, height: comp.height };
        }
    } catch (err) { console.error('renderExerciseToDataURL:', err); }
    return null;
}

function downloadBytes(bytes: Uint8Array, filename: string) {
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

export type ExportScope = 'current' | 'all';
export interface ExportOptions {
    pdfDoc: PDFDocumentProxy;
    students: Student[];
    exercises: ExerciseDef[];
    annotations: AnnotationStore;
    rubricCounts?: RubricCountStore;
    scope: ExportScope;
    currentStudentIdx: number;
    scaleFactor?: number;
    onProgress?: (done: number, total: number) => void;
}

export async function exportAnnotatedPDF(opts: ExportOptions): Promise<void> {
    const { pdfDoc, students, exercises, annotations, rubricCounts, scope, currentStudentIdx, scaleFactor = 1, onProgress } = opts;
    try { await Promise.all([document.fonts.load(`12px 'Caveat'`), document.fonts.load(`bold 12px 'Caveat'`)]); } catch (e) { }

    const targets = scope === 'current' ? [students[currentStudentIdx]] : students;
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    let done = 0; const total = targets.length * exercises.length;

    for (const student of targets) {
        for (const exercise of exercises) {
            try {
                if (exercise.type !== 'crop' && exercise.type !== 'pages') { done++; continue; }
                const anns = annotations[student.id]?.[exercise.id] || [];
                const exRubricCounts = rubricCounts?.[student.id]?.[exercise.id];
                const result = await renderExerciseToDataURL(pdfDoc, student, exercise, anns, exRubricCounts, scaleFactor);
                if (result) {
                    const jpg = await pdf.embedJpg(await dataUrlToBytes(result.dataUrl));
                    const highlightAdj = anns.reduce((s, a) => (a.type === 'highlighter' && typeof a.points === 'number' ? s + a.points : (a.type === 'text' && typeof a.score === 'number' ? s + a.score : s)), 0);
                    const rubricBase = (exercise.scoringMode === 'from_zero' && exercise.rubric && exRubricCounts) ? exercise.rubric.reduce((s, item) => s + item.points * (exRubricCounts[item.id] ?? 0), 0) : (exercise.maxScore ?? 0);
                    const finalScore = (rubricBase + highlightAdj) * scaleFactor;

                    const H = 32, pw = result.width, ph = result.height + H;
                    const page = pdf.addPage([pw, ph]);
                    page.drawRectangle({ x: 0, y: ph - H, width: pw, height: H, color: rgb(0.09, 0.09, 0.15) });
                    const exName = exercise.name || exercise.label || `Ex ${exercises.indexOf(exercise) + 1}`;
                    page.drawText(`${student.name}  ·  ${exName}`, { x: 10, y: ph - 22, font, size: 11, color: rgb(1, 1, 1), maxWidth: pw - 120 });
                    const scoreLabel = `${Math.round(finalScore * 100) / 100} pt`;
                    page.drawText(scoreLabel, { x: pw - 100, y: ph - 22, font, size: 11, color: rgb(0.4, 0.95, 0.65) });
                    page.drawImage(jpg, { x: 0, y: 0, width: result.width, height: result.height });
                }
            } catch (err) { console.error(err); }
            done++; onProgress?.(done, total);
        }
    }
    const bytes = await pdf.save();
    downloadBytes(bytes, scope === 'current' ? `correccio_${students[currentStudentIdx]?.name.replace(/\s+/g, '_')}.pdf` : 'correccio_tots_els_alumnes.pdf');
}

export async function exportOriginalLayoutPDF(opts: ExportOptions): Promise<void> {
    const { pdfDoc, students, exercises, annotations, rubricCounts, scope, currentStudentIdx, scaleFactor = 1, onProgress } = opts;
    try { await Promise.all([document.fonts.load(`12px 'Caveat'`), document.fonts.load(`bold 12px 'Caveat'`)]); } catch (e) { }

    const targets = scope === 'current' ? [students[currentStudentIdx]] : students;
    const pdf = await PDFDocument.create();
    let done = 0; const total = targets.length;

    for (const student of targets) {
        try {
            const pageAnnotMap = new Map<number, Annotation[]>();
            const allStudentAnns: Annotation[] = [];
            for (const exercise of exercises) {
                if (exercise.type !== 'crop' && exercise.type !== 'pages') continue;
                const exAnns = annotations[student.id]?.[exercise.id] || [];
                allStudentAnns.push(...exAnns);
                const exRubricCounts = rubricCounts?.[student.id]?.[exercise.id] ?? {};
                const highlightAdj = exAnns.reduce((s, a) => (a.type === 'highlighter' && typeof a.points === 'number' ? s + a.points : (a.type === 'text' && typeof a.score === 'number' ? s + a.score : s)), 0);
                const rubricBase = (exercise.scoringMode === 'from_zero' && exercise.rubric) ? exercise.rubric.reduce((s, item) => s + item.points * (exRubricCounts[item.id] ?? 0), 0) : (exercise.maxScore ?? 0);
                const finalScore = (rubricBase + highlightAdj) * scaleFactor;

                const formatP = (p: number) => {
                    const s = Math.round(p * scaleFactor * 100) / 100;
                    return (s > 0 ? '+' : '') + s;
                };

                const rubricSumm = (exercise.rubric || [])
                    .filter(item => (exRubricCounts[item.id] || 0) > 0)
                    .map(item => `${item.label}${exRubricCounts[item.id] > 1 ? ` (x${exRubricCounts[item.id]})` : ''} (${formatP(item.points * exRubricCounts[item.id])})`)
                    .join(', ');

                const highlightItems = exAnns
                    .filter(ann => ann.type === 'highlighter' && (ann as any).points !== undefined)
                    .map(ann => ({ label: ((ann as any).label || 'Marc').trim(), pts: (ann as any).points as number }));
                const highlightSumm = groupRepetitions(highlightItems, formatP);

                const scoredCommItems = exAnns
                    .filter(ann => ann.type === 'text' && (ann as any).text.trim().length > 0 && (ann as any).score !== undefined)
                    .map(ann => ({ label: (ann as any).text.trim(), pts: (ann as any).score as number }));
                const scoredCommSumm = groupRepetitions(scoredCommItems, formatP);

                const pureCommItems = exAnns
                    .filter(ann => ann.type === 'text' && (ann as any).text.trim().length > 0 && (ann as any).score === undefined)
                    .map(ann => ({ label: (ann as any).text.trim() }));
                const pureCommSumm = groupRepetitions(pureCommItems, formatP);

                const stampStorage = exAnns.find(a => a.id === 'system_score_stamp') as TextAnnotation | undefined;
                const cleanExAnns = exAnns.filter(a => a.id !== 'system_score_stamp');

                if (exercise.type === 'crop') {
                    let absPage = student.pageIndexes[exercise.pageIndex];
                    if ((absPage === undefined || absPage === -1) && student.pageIndexes.length > 0 && exercise.pageIndex > 0) {
                        const baseIndex = student.pageIndexes.find(p => p > 0) || 1;
                        absPage = baseIndex + exercise.pageIndex;
                    }
                    if (absPage === undefined || absPage === -1) continue;
                    const defaultStampY = (exercise.height > 100) ? (exercise.height - 80) : 10;
                    const defaultStampX = (exercise.width > 600) ? (exercise.width - 550) : 20;
                    const scoreX = stampStorage ? stampStorage.x + exercise.x : exercise.x + (exercise.stampX ?? defaultStampX);
                    const scoreY = stampStorage ? stampStorage.y + exercise.y : exercise.y + (exercise.stampY ?? defaultStampY);
                    const stampScale = stampStorage?.width ? (stampStorage.width / 500) : (exercise.stampScale ?? 1.0);
                    const addedAnns = createScoreAnns(exercise, finalScore, scoreX, scoreY, stampScale, scaleFactor, rubricSumm, highlightSumm, scoredCommSumm, pureCommSumm);
                    const existing = pageAnnotMap.get(absPage) || [];
                    pageAnnotMap.set(absPage, [...existing, ...addCropOffset(cleanExAnns, exercise.x, exercise.y), ...addedAnns]);
                } else if (exercise.type === 'pages') {
                    const spansTwoPages = (exercise as any).spansTwoPages;
                    let currentYLimit = 0;
                    let prevPageWidth = 0;

                    for (let i = 0; i < exercise.pageIndexes.length; i++) {
                        const pageIdx = exercise.pageIndexes[i];
                        let absPage = student.pageIndexes[pageIdx];
                        if ((absPage === undefined || absPage === -1) && student.pageIndexes.length > 0 && pageIdx > 0) {
                            const baseIndex = student.pageIndexes.find(p => p > 0) || 1;
                            absPage = baseIndex + pageIdx;
                        }
                        if (absPage === undefined || absPage === -1) continue;

                        const page = await pdfDoc.getPage(absPage);
                        const viewport = page.getViewport({ scale: RENDER_SCALE });
                        const pageW = viewport.width;
                        const pageH = viewport.height;

                        const isRightSide = spansTwoPages && i % 2 !== 0;
                        const xOffset = isRightSide ? prevPageWidth + 20 : 0;
                        const pageTop = currentYLimit;
                        const pageBottom = currentYLimit + pageH;

                        const annsOnThisPage = cleanExAnns.filter(ann => {
                            let ax = 0, ay = 0;
                            if (ann.type === 'pen') {
                                ax = ann.points[0];
                                ay = ann.points[1];
                            } else {
                                ax = (ann as any).x || 0;
                                ay = (ann as any).y || 0;
                            }
                            const inY = ay >= pageTop && ay < (pageBottom + 10);
                            const inX = ax >= xOffset && ax < (xOffset + pageW + 10);
                            return inY && inX;
                        }).map(ann => {
                            if (ann.type === 'pen') {
                                return {
                                    ...ann,
                                    points: ann.points.map((v, idx) => idx % 2 === 0 ? v - xOffset : v - pageTop)
                                };
                            }
                            return { ...ann, x: (ann as any).x - xOffset, y: (ann as any).y - pageTop };
                        });

                        const existing = pageAnnotMap.get(absPage) || [];
                        let fullPageAnns = [...existing, ...annsOnThisPage];

                        if (stampStorage) {
                            const sx = stampStorage.x;
                            const sy = stampStorage.y;
                            const inY = sy >= pageTop && sy < pageBottom;
                            const inX = sx >= xOffset && sx < (xOffset + pageW);

                            if (inX && inY) {
                                const stampScale = stampStorage.width ? (stampStorage.width / 500) : 1.0;
                                const addedAnns = createScoreAnns(exercise, finalScore, sx - xOffset, sy - pageTop, stampScale, scaleFactor, rubricSumm, highlightSumm, scoredCommSumm, pureCommSumm);
                                fullPageAnns = [...fullPageAnns, ...addedAnns];
                            }
                        } else if (i === 0) {
                            const defaultStampY = (pageH > 100) ? (pageH - 80) : 10;
                            const defaultStampX = (pageW > 600) ? (pageW - 550) : 20;
                            const addedAnns = createScoreAnns(exercise, finalScore, exercise.stampX ?? defaultStampX, exercise.stampY ?? defaultStampY, exercise.stampScale ?? 1.0, scaleFactor, rubricSumm, highlightSumm, scoredCommSumm, pureCommSumm);
                            fullPageAnns = [...fullPageAnns, ...addedAnns];
                        }

                        pageAnnotMap.set(absPage, fullPageAnns);

                        if (!spansTwoPages || isRightSide || i === exercise.pageIndexes.length - 1) {
                            currentYLimit += pageH + 20;
                        }
                        prevPageWidth = pageW;
                    }
                }
            }

            const totalScoreRegion = exercises.find(ex => ex.type === 'total_score') as any;
            if (totalScoreRegion) {
                let grandTotal = 0, maxExamTotal = 0;
                for (const ex of exercises) {
                    if (ex.type === 'crop' || ex.type === 'pages') {
                        const exAnns = annotations[student.id]?.[ex.id] || [];
                        const highlightAdj = exAnns.reduce((s, a) => (a.type === 'highlighter' && typeof a.points === 'number' ? s + a.points : (a.type === 'text' && typeof a.score === 'number' ? s + a.score : s)), 0);
                        const exRubricCounts = rubricCounts?.[student.id]?.[ex.id] ?? {};
                        grandTotal += (ex.scoringMode === 'from_zero' && ex.rubric ? ex.rubric.reduce((s, item) => s + item.points * (exRubricCounts[item.id] ?? 0), 0) : (ex.maxScore ?? 0)) + highlightAdj;
                        maxExamTotal += (ex.maxScore ?? 10);
                    }
                }
                const finalGrandTotal = grandTotal * scaleFactor, scaledMax = maxExamTotal * scaleFactor;
                let absPage = student.pageIndexes[totalScoreRegion.pageIndex];
                if ((absPage === undefined || absPage === -1) && student.pageIndexes.length > 0 && totalScoreRegion.pageIndex > 0) {
                    const baseIndex = student.pageIndexes.find(p => p > 0) || 1;
                    absPage = baseIndex + totalScoreRegion.pageIndex;
                }
                if (absPage !== undefined && absPage !== -1) {
                    const existing = pageAnnotMap.get(absPage) || [];
                    pageAnnotMap.set(absPage, [...existing, {
                        id: 'grand_total', type: 'text', text: String(Math.round(finalGrandTotal * 100) / 100),
                        x: totalScoreRegion.x + totalScoreRegion.width - 10, y: totalScoreRegion.y + totalScoreRegion.height - 10,
                        color: (finalGrandTotal >= (scaledMax / 2)) ? '#10b981' : '#ef4444', fontSize: 64, align: 'right', baseline: 'bottom'
                    } as TextAnnotation]);
                }
            }

            const orderedPages = student.pageIndexes.filter(p => p !== -1);
            Array.from(pageAnnotMap.keys()).forEach(p => {
                if (!orderedPages.includes(p)) orderedPages.push(p);
            });

            for (const absPageNum of orderedPages) {
                try {
                    const pageAnns = pageAnnotMap.get(absPageNum) || [], fullCanvas = document.createElement('canvas');
                    const dims = await renderPDFPageToCanvas(pdfDoc, absPageNum, fullCanvas, RENDER_SCALE);
                    if (dims) {
                        // Check if ANY exercise shown on this student has a legend active.
                        // Actually we need to check if the exercises that contributed annotations to this page had a legend.
                        // But since annotations are already relative, we can just check if the student.id globally has a legend for ANY exercise?
                        // No, let's keep it simple: if the legend mode was active, hasLegend will be in the pageAnns if it's on this page.
                        // Wait, it's better to just see if the student has legend mode on.
                        // Actually, we'll just check if any page of this student has a legend.
                        const studentHasLegend = Array.from(pageAnnotMap.values()).some(anns => anns.some(a => a.type === 'highlighter_legend'));

                        drawAnnotationsOnCanvas(fullCanvas.getContext('2d')!, pageAnns, studentHasLegend, allStudentAnns);
                        const jpg = await pdf.embedJpg(await dataUrlToBytes(fullCanvas.toDataURL('image/jpeg', 0.85)));
                        const page = pdf.addPage([dims.width, dims.height]);
                        page.drawImage(jpg, { x: 0, y: 0, width: dims.width, height: dims.height });
                    }
                } catch (err) { }
            }
        } catch (err) { }
        done++; onProgress?.(done, total);
    }
    const bytes = await pdf.save();
    downloadBytes(bytes, scope === 'current' ? `layout_${students[currentStudentIdx]?.name.replace(/\s+/g, '_')}.pdf` : 'layout_tots_els_alumnes.pdf');
}

function createScoreAnns(exercise: ExerciseDef, finalScore: number, x: number, y: number, scale: number = 1.8, scaleFactor: number = 1, rubricSumm: string = '', highlightSumm: string = '', scoredSumm: string = '', pureSumm: string = ''): Annotation[] {
    const maxPoss = (exercise.maxScore ?? 10) * scaleFactor;
    const scoreTitle = "Nota: " + String(Math.round(finalScore * 100) / 100) + " / " + String(Math.round(maxPoss * 100) / 100);

    const lines = [
        rubricSumm ? `Rúbrica: ${rubricSumm}` : '',
        highlightSumm ? `Fluorescents: ${highlightSumm}` : '',
        scoredSumm ? `Comentaris (+pts): ${scoredSumm}` : '',
        pureSumm ? `Comentaris: ${pureSumm}` : ''
    ].filter(Boolean);

    const anns: Annotation[] = [];

    anns.push({
        id: `fake_score_${exercise.id}`, type: 'text', text: scoreTitle,
        x: x, y: y,
        color: (finalScore >= (maxPoss / 2)) ? '#10b981' : '#ef4444',
        fontSize: (24 * 1.5 * scale) / FONT_SCALE, fontWeight: 'bold', align: 'left', baseline: 'top'
    } as TextAnnotation);

    if (lines.length > 0) {
        anns.push({
            id: `fake_detail_${exercise.id}`, type: 'text', text: lines.join('\n'),
            x: x, y: y + (24 * 1.7 * scale), color: 'rgba(0,0,0,0.6)',
            fontSize: (24 * 0.75 * scale) / FONT_SCALE, align: 'left', baseline: 'top',
            width: 500 * scale, wrap: 'word'
        } as TextAnnotation);
    }

    return anns;
}
