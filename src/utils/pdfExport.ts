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

function drawAnnotationsOnCanvas(ctx: CanvasRenderingContext2D, annotations: Annotation[]) {
    for (const ann of annotations) {
        if (ann.type === 'pen') drawPen(ctx, ann);
        else if (ann.type === 'highlighter') drawHighlighter(ctx, ann);
        else if (ann.type === 'text') drawText(ctx, ann);
        else if (ann.type === 'image') drawImageAnn(ctx, ann);
    }
}

function drawPen(ctx: CanvasRenderingContext2D, ann: PenAnnotation) {
    if (ann.points.length < 2) return;
    const { r, g, b } = parseColor(ann.color.startsWith('#') ? ann.color : '#000000');
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
    ctx.strokeStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},1)`;
    ctx.lineWidth = (ann.strokeWidth || 2) * RENDER_SCALE;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
}

function drawHighlighter(ctx: CanvasRenderingContext2D, ann: HighlighterAnnotation) {
    const { r, g, b, a } = parseColor(ann.color);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;

    // Aesthetic: Always draw labels at the top-left of the visual rectangle
    const rx = Math.min(ann.x, ann.x + (ann.width || 0));
    const ry = Math.min(ann.y, ann.y + (ann.height || 0));
    const rw = Math.abs(ann.width || 0);
    const rh = Math.abs(ann.height || 0);

    ctx.fillRect(rx, ry, rw, rh);
    ctx.globalAlpha = 1;
    const parts = [ann.label || '', ann.points !== undefined ? (ann.points > 0 ? `+${ann.points}` : `${ann.points}`) : ''].filter(Boolean);
    if (parts.length) {
        const fontSize = (ann.fontSize || 18) * FONT_SCALE;
        ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        ctx.font = `bold ${fontSize}px Caveat, cursive`;
        ctx.textBaseline = 'bottom';
        ctx.fillText(parts.join(' '), rx + 2, ry - 4);
    }
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
    ctx.fillText(ann.text, ann.x, ann.y);
    if (ann.score !== undefined) {
        ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        const scoreFontSize = fontSize * 0.65;
        ctx.font = `bold ${scoreFontSize}px Caveat, cursive`;
        if (ann.text) {
            ctx.textBaseline = 'bottom';
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
        if (ann.type === 'highlighter') return { ...ann, x: ann.x + dx, y: ann.y + dy };
        if (ann.type === 'text') return { ...ann, x: ann.x + dx, y: ann.y + dy };
        if (ann.type === 'image') return { ...ann, x: ann.x + dx, y: ann.y + dy };
        return ann;
    });
}

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
            
            const exAnns = [...annotations];
            const highlightAdj = annotations.reduce((s, a) => (a.type === 'highlighter' && typeof a.points === 'number' ? s + a.points : (a.type === 'text' && typeof a.score === 'number' ? s + a.score : s)), 0);
            const rubricCountsForEx = exerciseRubricCounts ?? {};
            const rubricBase = (exercise.scoringMode === 'from_zero' && exercise.rubric) ? exercise.rubric.reduce((s, item) => s + item.points * (rubricCountsForEx[item.id] ?? 0), 0) : (exercise.maxScore ?? 0);
            
            const rawScore = rubricBase + highlightAdj;
            const finalScore = rawScore * scaleFactor;
            const maxPoss = (exercise.maxScore ?? 10) * scaleFactor;
            const scoreColor = (finalScore >= (maxPoss / 2)) ? '#10b981' : '#ef4444';

            exAnns.push({
                id: 'fake_score', type: 'text',
                text: "Nota: " + String(Math.round(finalScore * 100) / 100),
                x: exercise.width - 10, y: exercise.height - 10,
                color: scoreColor, fontSize: 20,
                align: 'right', baseline: 'bottom'
            } as TextAnnotation);

            drawAnnotationsOnCanvas(ctx, exAnns);
            return { dataUrl: crop.toDataURL('image/jpeg', 0.92), width: exercise.width, height: exercise.height };

        } else if (exercise.type === 'pages') {
            const renderedPages: { canvas: HTMLCanvasElement; h: number }[] = [];
            let totalH = 0, maxW = 0;
            for (const pi of exercise.pageIndexes) {
                const absPage = student.pageIndexes[pi];
                if (absPage === undefined || absPage === -1) continue;
                const c = document.createElement('canvas');
                const d = await renderPDFPageToCanvas(pdfDoc, absPage, c, RENDER_SCALE);
                if (d) { renderedPages.push({ canvas: c, h: d.height }); totalH += d.height + 20; maxW = Math.max(maxW, d.width); }
            }
            if (!renderedPages.length) return null;
            const comp = document.createElement('canvas');
            comp.width = maxW; comp.height = totalH - 20;
            const ctx = comp.getContext('2d')!;
            ctx.fillStyle = 'white'; ctx.fillRect(0, 0, maxW, comp.height);
            let y = 0;
            for (const { canvas, h } of renderedPages) { ctx.drawImage(canvas, 0, y); y += h + 20; }
            
            const exAnns = [...annotations];
            const highlightAdj = annotations.reduce((s, a) => (a.type === 'highlighter' && typeof a.points === 'number' ? s + a.points : (a.type === 'text' && typeof a.score === 'number' ? s + a.score : s)), 0);
            const rubricCountsForEx = exerciseRubricCounts ?? {};
            const rubricBase = (exercise.scoringMode === 'from_zero' && exercise.rubric) ? exercise.rubric.reduce((s, item) => s + item.points * (rubricCountsForEx[item.id] ?? 0), 0) : (exercise.maxScore ?? 0);
            const finalScore = (rubricBase + highlightAdj) * scaleFactor;
            const maxPoss = (exercise.maxScore ?? 10) * scaleFactor;
            const scoreColor = (finalScore >= (maxPoss / 2)) ? '#10b981' : '#ef4444';

            exAnns.push({
                id: 'fake_score_pages', type: 'text',
                text: "Nota: " + String(Math.round(finalScore * 100) / 100),
                x: maxW - 20, y: renderedPages[0].h - 20,
                color: scoreColor, fontSize: 30,
                align: 'right', baseline: 'bottom'
            } as TextAnnotation);

            drawAnnotationsOnCanvas(ctx, exAnns);
            return { dataUrl: comp.toDataURL('image/jpeg', 0.92), width: maxW, height: comp.height };
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
            for (const exercise of exercises) {
                if (exercise.type !== 'crop' && exercise.type !== 'pages') continue;
                const exAnns = annotations[student.id]?.[exercise.id] || [];
                const exRubricCounts = rubricCounts?.[student.id]?.[exercise.id] ?? {};
                const activeItems = exercise.rubric ? exercise.rubric.filter(it => (exRubricCounts[it.id] ?? 0) > 0) : [];
                const highlightAdj = exAnns.reduce((s, a) => (a.type === 'highlighter' && typeof a.points === 'number' ? s + a.points : (a.type === 'text' && typeof a.score === 'number' ? s + a.score : s)), 0);
                const rubricBase = (exercise.scoringMode === 'from_zero' && exercise.rubric) ? exercise.rubric.reduce((s, item) => s + item.points * (exRubricCounts[item.id] ?? 0), 0) : (exercise.maxScore ?? 0);
                const finalScore = (rubricBase + highlightAdj) * scaleFactor;

                if (exercise.type === 'crop') {
                    const absPage = student.pageIndexes[exercise.pageIndex];
                    if (absPage === undefined || absPage === -1) continue;
                    const scoreX = exercise.x + exercise.width - 10, scoreY = exercise.y + exercise.height - 10;
                    const addedAnns = createScoreAnns(exercise, finalScore, scoreX, scoreY, 1.0, scaleFactor);
                    const existing = pageAnnotMap.get(absPage) || [];
                    pageAnnotMap.set(absPage, [...existing, ...addCropOffset(exAnns, exercise.x, exercise.y), ...addedAnns]);
                } else if (exercise.type === 'pages') {
                    let currentYLimit = 0;
                    for (let i = 0; i < exercise.pageIndexes.length; i++) {
                        const absPage = student.pageIndexes[exercise.pageIndexes[i]];
                        if (absPage === undefined || absPage === -1) continue;
                        const page = await pdfDoc.getPage(absPage), viewport = page.getViewport({ scale: RENDER_SCALE }), pageH = viewport.height;
                        const pageTop = currentYLimit, pageBottom = currentYLimit + pageH;
                        const annsOnThisPage = exAnns.filter(ann => {
                            let y = (ann as any).y || (ann.type === 'pen' ? ann.points[1] : 0);
                            return y >= pageTop && y < (pageBottom + 10);
                        }).map(ann => {
                            if (ann.type === 'pen') return { ...ann, points: ann.points.map((v, idx) => idx % 2 !== 0 ? v - pageTop : v) };
                            return { ...ann, y: (ann as any).y - pageTop };
                        });
                        const existing = pageAnnotMap.get(absPage) || [];
                        let fullPageAnns = [...existing, ...annsOnThisPage];
                        if (i === 0) {
                            const addedAnns = createScoreAnns(exercise, finalScore, viewport.width - 20, viewport.height - 20, 0.8, scaleFactor);
                            fullPageAnns = [...fullPageAnns, ...addedAnns];
                        }
                        pageAnnotMap.set(absPage, fullPageAnns);
                        currentYLimit += pageH + 20;
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
                const absPage = student.pageIndexes[totalScoreRegion.pageIndex];
                if (absPage !== undefined && absPage !== -1) {
                    const existing = pageAnnotMap.get(absPage) || [];
                    pageAnnotMap.set(absPage, [...existing, {
                        id: 'grand_total', type: 'text', text: String(Math.round(finalGrandTotal * 100) / 100),
                        x: totalScoreRegion.x + totalScoreRegion.width - 10, y: totalScoreRegion.y + totalScoreRegion.height - 10,
                        color: (finalGrandTotal >= (scaledMax / 2)) ? '#10b981' : '#ef4444', fontSize: 64, align: 'right', baseline: 'bottom'
                    } as TextAnnotation]);
                }
            }

            for (const absPageNum of student.pageIndexes) {
                if (absPageNum === -1) continue;
                try {
                    const pageAnns = pageAnnotMap.get(absPageNum) || [], fullCanvas = document.createElement('canvas');
                    const dims = await renderPDFPageToCanvas(pdfDoc, absPageNum, fullCanvas, RENDER_SCALE);
                    if (dims) {
                        drawAnnotationsOnCanvas(fullCanvas.getContext('2d')!, pageAnns);
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

function createScoreAnns(exercise: ExerciseDef, finalScore: number, x: number, y: number, scale: number = 1.8, scaleFactor: number = 1): Annotation[] {
    const maxPoss = (exercise.maxScore ?? 10) * scaleFactor;
    return [{
        id: `fake_score_${exercise.id}`, type: 'text', text: "Nota: " + String(Math.round(finalScore * 100) / 100),
        x, y, color: (finalScore >= (maxPoss / 2)) ? '#10b981' : '#ef4444', fontSize: 24 * scale, fontWeight: 'bold', align: 'right', baseline: 'bottom'
    } as TextAnnotation];
}
