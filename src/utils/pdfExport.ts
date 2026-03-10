import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { PDFDocumentProxy } from './pdfUtils';
import { renderPDFPageToCanvas } from './pdfUtils';
import type {
    Student, ExerciseDef, AnnotationStore, Annotation,
    PenAnnotation, HighlighterAnnotation, TextAnnotation, ImageAnnotation,
    RubricCountStore,
    PagesExercise
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
            ctx.textBaseline = 'top';

            const lx = ann.x + (ann.labelOffsetX ?? 2);
            const ly = ann.y + (ann.labelOffsetY ?? -(fontSize + 4));

            ctx.fillText(parts.join(' '), lx, ly);
        }
    }
    ctx.restore();
}

function drawHighlighterLegend(ctx: CanvasRenderingContext2D, ann: any, allAnnotations: Annotation[]) {
    ctx.save();
    const scale = ann.scale || 1;
    const legendFontSize = 14 * FONT_SCALE * scale;
    const presets = [
        { label: 'Error Procediment', color: 'rgba(239, 68, 68, 0.4)', points: -0.5 },
        { label: 'Error Càlcul', color: 'rgba(249, 115, 22, 0.4)', points: -0.25 },
        { label: 'Falta Raonament', color: 'rgba(234, 179, 8, 0.4)', points: -0.5 },
        { label: 'Error Greu', color: 'rgba(225, 29, 72, 0.4)', points: -1.0 },
        { label: 'Anotació Bona', color: 'rgba(16, 185, 129, 0.4)', points: 0.5 },
    ];

    const usedLabels = new Set(allAnnotations
        .filter((a): a is HighlighterAnnotation => a.type === 'highlighter' && !!a.label)
        .map(a => a.label));

    const usedPresets = presets.filter(p => usedLabels.has(p.label));
    if (usedPresets.length === 0) { ctx.restore(); return; }

    const itemHeight = legendFontSize + (10 * scale);
    usedPresets.forEach((p, i) => {
        const py = ann.y + i * itemHeight;
        const { r, g, b, a } = parseColor(p.color);
        ctx.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}, ${a})`;
        ctx.beginPath();
        if ((ctx as any).roundRect) (ctx as any).roundRect(ann.x, py, legendFontSize, legendFontSize, 2 * scale);
        else ctx.rect(ann.x, py, legendFontSize, legendFontSize);
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

    const rawText = ann.text || '';
    const hasWidth = typeof ann.width === 'number' && ann.width > 0;
    const shouldWrap = ann.wrap === 'word' && hasWidth;

    const wrappedLines: string[] = [];
    const baseLines = rawText.split('\n');
    if (shouldWrap) {
        for (const base of baseLines) {
            const words = base.split(' ');
            let current = '';
            for (const w of words) {
                const candidate = current ? `${current} ${w}` : w;
                const width = ctx.measureText(candidate).width;
                if (width <= (ann.width as number) || !current) {
                    current = candidate;
                } else {
                    wrappedLines.push(current);
                    current = w;
                }
            }
            if (current) wrappedLines.push(current);
        }
    } else {
        wrappedLines.push(...baseLines);
    }

    if (ann.bgFill && wrappedLines.length > 0) {
        const padding = 4;
        const maxWidth = Math.max(...wrappedLines.map(l => ctx.measureText(l).width));
        const totalHeight = fontSize * wrappedLines.length * 1.1;
        ctx.fillStyle = ann.bgFill;
        let bgX = ann.x;
        let bgY = ann.y;
        if (ctx.textAlign === 'right') bgX -= maxWidth;
        if (ctx.textAlign === 'center') bgX -= maxWidth / 2;
        if (ctx.textBaseline === 'bottom') bgY -= totalHeight;
        if (ctx.textBaseline === 'middle') bgY -= totalHeight / 2;
        ctx.fillRect(bgX - padding, bgY - padding, maxWidth + padding * 2, totalHeight + padding * 2);
    }

    ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    const lineHeight = fontSize * 1.1;
    let currentY = ann.y;
    for (const line of wrappedLines) {
        ctx.fillText(line, ann.x, currentY);
        currentY += lineHeight;
    }

    if (ann.score !== undefined) {
        const scoreFontSize = fontSize * 0.65;
        ctx.font = `bold ${scoreFontSize}px ${family}`;
        ctx.textBaseline = 'bottom';
        ctx.fillText(ann.score > 0 ? `+${ann.score}` : `${ann.score}`, ann.x, ann.y);
    }

    ctx.restore();
}

function drawImageAnn(ctx: CanvasRenderingContext2D, ann: ImageAnnotation) {
    const img = new Image(); img.src = ann.dataUrl;
    try { ctx.drawImage(img, ann.x, ann.y, ann.width, ann.height); } catch { }
}

async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
    const b64 = dataUrl.split(',')[1], bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

function addCropOffset(annotations: Annotation[], dx: number, dy: number): Annotation[] {
    return annotations.map(ann => {
        if (ann.type === 'pen') return { ...ann, points: ann.points.map((v, i) => i % 2 === 0 ? v + dx : v + dy) };
        if (ann.type === 'highlighter' || ann.type === 'text' || ann.type === 'image' || ann.type === 'highlighter_legend') return { ...ann, x: (ann as any).x + dx, y: (ann as any).y + dy };
        return ann;
    });
}

const groupRepetitions = (items: { label: string, pts?: number }[], formatP: (p: number) => string) => {
    const map = new Map<string, { count: number, pts?: number }>();
    for (const item of items) {
        const key = item.label;
        if (map.has(key)) { const e = map.get(key)!; map.set(key, { count: e.count + 1, pts: (e.pts || 0) + (item.pts || 0) }); }
        else map.set(key, { count: 1, pts: item.pts });
    }
    return Array.from(map.entries()).map(([label, data]) => `${label}${data.count > 1 ? ` (x${data.count})` : ''}${data.pts !== undefined ? ` (${formatP(data.pts)})` : ''}`).join(', ');
};

function createScoreAnns(exercise: ExerciseDef, finalScore: number, x: number, y: number, scale: number = 1.8, scaleFactor: number = 1, rubricSumm: string = '', highlightSumm: string = '', scoredSumm: string = '', pureSumm: string = ''): Annotation[] {
    const maxPoss = (exercise.maxScore ?? 10) * scaleFactor;
    const scoreTitle = "Nota: " + String(Math.round(finalScore * 100) / 100) + " / " + String(Math.round(maxPoss * 100) / 100);
    const lines = [rubricSumm ? `Rúbrica: ${rubricSumm}` : '', highlightSumm ? `Fluorescents: ${highlightSumm}` : '', scoredSumm ? `Comentaris (+pts): ${scoredSumm}` : '', pureSumm ? `Comentaris: ${pureSumm}` : ''].filter(Boolean);
    const anns: Annotation[] = [];
    anns.push({ id: `fake_score_${exercise.id}`, type: 'text', text: scoreTitle, x, y, color: (finalScore >= (maxPoss / 2)) ? '#10b981' : '#ef4444', fontSize: (24 * 1.5 * scale) / FONT_SCALE, fontWeight: 'bold', align: 'left', baseline: 'top' } as TextAnnotation);
    if (lines.length > 0) anns.push({ id: `fake_detail_${exercise.id}`, type: 'text', text: lines.join('\n'), x, y: y + (24 * 1.7 * scale), color: 'rgba(0,0,0,0.6)', fontSize: (24 * 0.75 * scale) / FONT_SCALE, align: 'left', baseline: 'top', width: 500 * scale, wrap: 'word' } as TextAnnotation);
    return anns;
}

export async function generateStudentPDF(
    pdfDoc: PDFDocumentProxy, student: Student, exercises: ExerciseDef[],
    annotations: AnnotationStore, rubricCounts: RubricCountStore,
    scaleFactor: number = 1
): Promise<Blob> {
    try { await Promise.all([document.fonts.load(`12px 'Caveat'`), document.fonts.load(`bold 12px 'Caveat'`)]); } catch (e) { }
    const pdf = await PDFDocument.create(), pageAnnotMap = new Map<number, Annotation[]>(), allStudentAnns: Annotation[] = [];

    for (const exercise of exercises) {
        if (exercise.type !== 'crop' && exercise.type !== 'pages') continue;
        const exAnns = annotations[student.id]?.[exercise.id] || [];
        allStudentAnns.push(...exAnns);
        const exRubricCounts = rubricCounts?.[student.id]?.[exercise.id] ?? {};
        const hAdj = exAnns.reduce((s, a) => (a.type === 'highlighter' && typeof a.points === 'number' ? s + a.points : (a.type === 'text' && typeof a.score === 'number' ? s + a.score : s)), 0);
        const rBase = (exercise.scoringMode === 'from_zero' && exercise.rubric) ? exercise.rubric.reduce((s, item) => s + item.points * (exRubricCounts[item.id] ?? 0), 0) : (exercise.maxScore ?? 0);
        const finalScore = (rBase + hAdj) * scaleFactor;
        const formatP = (p: number) => { const s = Math.round(p * scaleFactor * 100) / 100; return (s > 0 ? '+' : '') + s; };
        const rSumm = (exercise.rubric || []).filter(item => (exRubricCounts[item.id] || 0) > 0).map(item => `${item.label}${exRubricCounts[item.id] > 1 ? ` (x${exRubricCounts[item.id]})` : ''} (${formatP(item.points * exRubricCounts[item.id])})`).join(', ');
        const hlSumm = groupRepetitions(exAnns.filter(a => a.type === 'highlighter' && (a as any).points !== undefined).map(a => ({ label: ((a as any).label || 'Marc').trim(), pts: (a as any).points as number })), formatP);
        const scSumm = groupRepetitions(exAnns.filter(a => a.type === 'text' && (a as any).text.trim().length > 0 && (a as any).score !== undefined).map(a => ({ label: (a as any).text.trim(), pts: (a as any).score as number })), formatP);
        const puSumm = groupRepetitions(exAnns.filter(a => a.type === 'text' && (a as any).text.trim().length > 0 && (a as any).score === undefined).map(a => ({ label: (a as any).text.trim() })), formatP);
        const stampStorage = exAnns.find(a => a.id === 'system_score_stamp') as TextAnnotation | undefined;
        const cleanExAnns = exAnns.filter(a => a.id !== 'system_score_stamp');

        if (exercise.type === 'crop') {
            let absPage = student.pageIndexes[exercise.pageIndex];
            if (absPage === undefined || absPage === -1) continue;
            const sx = stampStorage ? stampStorage.x + exercise.x : exercise.x + (exercise.stampX ?? (exercise.width - 550));
            const sy = stampStorage ? stampStorage.y + exercise.y : exercise.y + (exercise.stampY ?? (exercise.height - 80));
            const added = createScoreAnns(exercise, finalScore, sx, sy, stampStorage?.width ? (stampStorage.width / 500) : (exercise.stampScale ?? 1.0), scaleFactor, rSumm, hlSumm, scSumm, puSumm);
            const existing = pageAnnotMap.get(absPage) || []; pageAnnotMap.set(absPage, [...existing, ...addCropOffset(cleanExAnns, exercise.x, exercise.y), ...added]);
        } else if (exercise.type === 'pages') {
            const spansTwoPages = (exercise as any).spansTwoPages;
            let currentYLimit = 0, prevPageWidth = 0;
            let placedScore = false;
            let firstValidAbsPage: number | null = null;
            for (let i = 0; i < (exercise as any).pageIndexes.length; i++) {
                const logicalIdx = (exercise as any).pageIndexes[i];
                let pAbs = student.pageIndexes[logicalIdx];
                if ((pAbs === undefined || pAbs === -1) && student.pageIndexes.length > 0 && logicalIdx > 0) {
                    const baseIndex = student.pageIndexes.find(p => p > 0) || 1;
                    const guessedIndex = baseIndex + logicalIdx;
                    if (guessedIndex >= 1 && guessedIndex <= pdfDoc.numPages) pAbs = guessedIndex;
                }
                if (pAbs === undefined || pAbs < 1 || pAbs > pdfDoc.numPages || isNaN(pAbs as number)) continue;
                if (firstValidAbsPage === null) firstValidAbsPage = pAbs;
                const pageDoc = await pdfDoc.getPage(pAbs);
                const vScaled = pageDoc.getViewport({ scale: RENDER_SCALE });
                const pageW = vScaled.width, pageH = vScaled.height;
                const isRightSide = spansTwoPages && i % 2 !== 0;
                const xOffset = isRightSide ? prevPageWidth + (20 * RENDER_SCALE) : 0;
                const pageTop = currentYLimit, pageBottom = currentYLimit + pageH;
                const annsOnPage = cleanExAnns.filter(ann => {
                    let ax = 0, ay = 0;
                    if (ann.type === 'pen') { ax = ann.points[0]; ay = ann.points[1]; }
                    else { ax = (ann as any).x || 0; ay = (ann as any).y || 0; }
                    return ay >= pageTop && ay < (pageBottom + 10) && ax >= xOffset && ax < (xOffset + pageW + 10);
                }).map(ann => {
                    if (ann.type === 'pen') return { ...ann, points: ann.points.map((v, idx) => idx % 2 === 0 ? v - xOffset : v - pageTop) };
                    return { ...ann, x: (ann as any).x - xOffset, y: (ann as any).y - pageTop };
                });
                const existing = pageAnnotMap.get(pAbs) || []; let fullAnns = [...existing, ...annsOnPage];
                const hasExerciseStamp = exercise.stampX !== undefined && exercise.stampY !== undefined;
                const markerX = stampStorage?.x ?? (hasExerciseStamp ? (exercise.stampX as number) : NaN);
                const markerY = stampStorage?.y ?? (hasExerciseStamp ? (exercise.stampY as number) : NaN);
                if (!Number.isNaN(markerX) && !Number.isNaN(markerY)) {
                    if (markerY >= pageTop && markerY < pageBottom && markerX >= xOffset && markerX < (xOffset + pageW)) {
                        const scoreX = markerX - xOffset, scoreY = markerY - pageTop;
                        fullAnns = [...fullAnns, ...createScoreAnns(exercise, finalScore, scoreX, scoreY, stampStorage?.width ? (stampStorage.width / 500) : (exercise.stampScale ?? 1.0), scaleFactor, rSumm, hlSumm, scSumm, puSumm)];
                        placedScore = true;
                    }
                } else if (i === 0 && !stampStorage && !hasExerciseStamp) {
                    const scoreX = 20, scoreY = pageH - 80;
                    fullAnns = [...fullAnns, ...createScoreAnns(exercise, finalScore, scoreX, scoreY, exercise.stampScale ?? 1.0, scaleFactor, rSumm, hlSumm, scSumm, puSumm)];
                    placedScore = true;
                }
                pageAnnotMap.set(pAbs, fullAnns);
                if (!spansTwoPages || isRightSide || i === exercise.pageIndexes.length - 1) currentYLimit += pageH + (20 * RENDER_SCALE);
                prevPageWidth = pageW;
            }
            if (!placedScore && firstValidAbsPage !== null) {
                const existing = pageAnnotMap.get(firstValidAbsPage) || [];
                const fallbackX = stampStorage?.x ?? (exercise.stampX ?? 20), fallbackY = stampStorage?.y ?? 40;
                pageAnnotMap.set(firstValidAbsPage, [...existing, ...createScoreAnns(exercise, finalScore, fallbackX, fallbackY, stampStorage?.width ? (stampStorage.width / 500) : (exercise.stampScale ?? 1.0), scaleFactor, rSumm, hlSumm, scSumm, puSumm)]);
            }
        }
    }

    const totalScoreRegion = exercises.find(ex => ex.type === 'total_score') as any;
    if (totalScoreRegion) {
        let gTotal = 0, mTotal = 0;
        for (const ex of exercises) {
            if (ex.type === 'crop' || ex.type === 'pages') {
                const exAnns = annotations[student.id]?.[ex.id] || [], exRubric = rubricCounts?.[student.id]?.[ex.id] ?? {};
                const hAdj = exAnns.reduce((s, a) => (a.type === 'highlighter' && typeof a.points === 'number' ? s + a.points : (a.type === 'text' && typeof a.score === 'number' ? s + a.score : s)), 0);
                gTotal += (ex.scoringMode === 'from_zero' && ex.rubric ? ex.rubric.reduce((s, item) => s + item.points * (exRubric[item.id] ?? 0), 0) : (ex.maxScore ?? 0)) + hAdj;
                mTotal += (ex.maxScore ?? 10);
            }
        }
        let absP = student.pageIndexes[totalScoreRegion.pageIndex];
        if (absP !== undefined && absP !== -1) {
            const existing = pageAnnotMap.get(absP) || [];
            pageAnnotMap.set(absP, [...existing, { id: 'grand_total', type: 'text', text: String(Math.round(gTotal * scaleFactor * 100) / 100), x: totalScoreRegion.x + totalScoreRegion.width - 10, y: totalScoreRegion.y + totalScoreRegion.height - 10, color: (gTotal * scaleFactor >= (mTotal * scaleFactor / 2)) ? '#10b981' : '#ef4444', fontSize: 64, align: 'right', baseline: 'bottom' } as TextAnnotation]);
        }
    }

    const studentPages = student.pageIndexes.filter(p => p !== -1);
    for (const absPageNum of studentPages) {
        try {
            const pageAnns = pageAnnotMap.get(absPageNum) || [], fullCanvas = document.createElement('canvas');
            const dims = await renderPDFPageToCanvas(pdfDoc, absPageNum, fullCanvas, RENDER_SCALE);
            if (dims) {
                const sHasLegend = Array.from(pageAnnotMap.values()).some(anns => anns.some(a => a.type === 'highlighter_legend'));
                drawAnnotationsOnCanvas(fullCanvas.getContext('2d')!, pageAnns, sHasLegend, allStudentAnns);
                const jpg = await pdf.embedJpg(await dataUrlToBytes(fullCanvas.toDataURL('image/jpeg', 0.85)));
                const page = pdf.addPage([dims.width, dims.height]);
                page.drawImage(jpg, { x: 0, y: 0, width: dims.width, height: dims.height });
            }
        } catch (err) { console.error(err); }
    }
    const bytes = await pdf.save(); return new Blob([bytes as any], { type: 'application/pdf' });
}

export async function exportStudentPDF(pdfDoc: PDFDocumentProxy, student: Student, exercises: ExerciseDef[], annotations: AnnotationStore, rubricCounts: RubricCountStore, targetMaxScore: number) {
    const blob = await generateStudentPDF(pdfDoc, student, exercises, annotations, rubricCounts, 1);
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `correccio_${student.name.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

export async function exportCombinedPDF(pdfDoc: PDFDocumentProxy, students: Student[], exercises: ExerciseDef[], annotations: AnnotationStore, rubricCounts: RubricCountStore, targetMaxScore: number, onProgress?: (p: number) => void) {
    const mergedPdf = await PDFDocument.create();
    for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const studentBlob = await generateStudentPDF(pdfDoc, student, exercises, annotations, rubricCounts, 1);
        const studentPdf = await PDFDocument.load(await studentBlob.arrayBuffer());
        const pages = await mergedPdf.copyPages(studentPdf, studentPdf.getPageIndices());
        pages.forEach(p => mergedPdf.addPage(p));
        if (onProgress) onProgress(Math.round(((i + 1) / students.length) * 100));
    }
    const bytes = await mergedPdf.save();
    const blob = new Blob([bytes as any], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `correccio_completa.pdf`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}
