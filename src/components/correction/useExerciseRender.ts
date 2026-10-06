/**
 * Imatges de l'exercici actual per a l'alumne actual (un retall o diverses pàgines) i la seva disposició.
 * Fa servir la cau de pàgines i precarrega l'alumne i l'exercici següents: si les pàgines ja hi són,
 * el retall es munta en el mateix frame (sense passar per «Carregant»), i navegar és immediat.
 */
import { useEffect, useMemo, useState } from 'react';
import { layoutBounds, layoutPages, type PagePlacement } from '../../domain/pageLayout';
import type { Size } from '../../domain/geometry';
import { getStudentPage, isPageIgnored } from '../../domain/students';
import type { PDFDocumentProxy } from '../../services/pdf/pdfDocument';
import { cropCanvas, peekPage, renderPage } from '../../services/pdf/pageRenderer';
import type { GradableExercise, Student } from '../../types';

export interface RenderedPage extends PagePlacement {
    img: HTMLCanvasElement;
}

export interface ExerciseRender {
    pages: RenderedPage[];
    placements: PagePlacement[];
    bounds: Size;
    /** Clau de l'estructura (canvia quan s'ha de tornar a ajustar el zoom). */
    key: string;
}

function placeholderCanvas(isDark: boolean): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 400;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = isDark ? '#1f2937' : '#f3f4f6';
    ctx.fillRect(0, 0, 800, 400);
    ctx.fillStyle = isDark ? '#9ca3af' : '#4b5563';
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px Inter, system-ui, sans-serif';
    ctx.fillText('Pàgina marcada com a buida per aquest alumne.', 400, 180);
    ctx.font = '18px Inter, system-ui, sans-serif';
    ctx.fillText("L'exercici tindrà un 0 per defecte.", 400, 220);
    return canvas;
}

type PageSource = (page: number) => HTMLCanvasElement | undefined;

/** Pàgines reals (base 1) que necessita l'exercici per a l'alumne (sense les marcades com a buides). */
function pagesFor(student: Student | undefined, ex: GradableExercise | undefined, numPages: number): number[] {
    if (!student || !ex) return [];
    const logical = ex.type === 'crop' ? [ex.pageIndex] : ex.pageIndexes;
    return logical.map(l => getStudentPage(student, l, numPages))
        .filter((p): p is number => p !== undefined && !isPageIgnored(student, p));
}

/** Munta l'exercici amb pàgines ja pintades; `null` si en falta alguna. */
function buildExercise(doc: PDFDocumentProxy, student: Student, ex: GradableExercise, isDark: boolean, get: PageSource): RenderedPage[] | null {
    if (ex.type === 'crop') {
        const page = getStudentPage(student, ex.pageIndex, doc.numPages);
        if (page === undefined || isPageIgnored(student, page)) return [];
        const full = get(page);
        if (!full) return null;
        const img = cropCanvas(full, ex, undefined, isDark ? '#000000' : '#ffffff');
        return [{ img, order: 0, x: 0, y: 0, width: ex.width, height: ex.height }];
    }
    const canvases = new Map<number, HTMLCanvasElement>();
    const slots: { order: number; size: Size | null }[] = [];
    for (const [order, logical] of ex.pageIndexes.entries()) {
        const page = getStudentPage(student, logical, doc.numPages);
        if (page === undefined || isPageIgnored(student, page)) { slots.push({ order, size: null }); continue; }
        const canvas = get(page);
        if (!canvas) return null;
        canvases.set(order, canvas);
        slots.push({ order, size: { width: canvas.width, height: canvas.height } });
    }
    const placements = layoutPages(slots, !!ex.spansTwoPages);
    if (!placements.length) return [{ img: placeholderCanvas(isDark), order: 0, x: 0, y: 0, width: 800, height: 400 }];
    return placements.map(p => ({ ...p, img: canvases.get(p.order)! }));
}

async function renderExercise(doc: PDFDocumentProxy, student: Student, ex: GradableExercise, isDark: boolean): Promise<RenderedPage[]> {
    const pages = pagesFor(student, ex, doc.numPages);
    const canvases = await Promise.all(pages.map(page => renderPage(doc, page, { invert: isDark })));
    const byPage = new Map(pages.map((page, i) => [page, canvases[i]]));
    return buildExercise(doc, student, ex, isDark, page => byPage.get(page))!;
}

function toRender(pages: RenderedPage[], key: string): ExerciseRender {
    const placements = pages.map(({ img: _img, ...p }) => p);
    return { pages, placements, bounds: layoutBounds(placements), key };
}

export function useExerciseRender(
    doc: PDFDocumentProxy,
    student: Student | undefined,
    /** Alumnes on és fàcil anar després (el següent i l'anterior): se'n precarrega el mateix exercici. */
    nearStudents: (Student | undefined)[],
    ex: GradableExercise | undefined,
    isDark: boolean,
    nextExercise?: GradableExercise,
) {
    const [loaded, setLoaded] = useState<{ key: string; doc: PDFDocumentProxy; render: ExerciseRender } | null>(null);
    const [error, setError] = useState<{ key: string; message: string } | null>(null);
    const [attempt, setAttempt] = useState(0);

    // Només es torna a renderitzar si canvia alguna cosa que afecta les imatges
    const exKey = ex ? JSON.stringify(ex.type === 'crop'
        ? [ex.id, ex.pageIndex, ex.x, ex.y, ex.width, ex.height]
        : [ex.id, ex.pageIndexes, !!ex.spansTwoPages]) : '';
    const studentKey = student ? JSON.stringify([student.id, student.pageIndexes, student.ignoredPageIndexes ?? []]) : '';
    const loadKey = `${studentKey}|${exKey}|${isDark}|${attempt}`;
    const renderKey = `${student?.id}|${exKey}`;

    // Camí ràpid: amb les pàgines a la cau (pre-càrrega), el retall surt ja en aquest frame
    const instant = useMemo(() => {
        if (!student || !ex) return null;
        const pages = buildExercise(doc, student, ex, isDark, page => peekPage(doc, page, { invert: isDark }));
        return pages ? toRender(pages, renderKey) : null;
    }, [doc, loadKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const render = instant ?? (loaded?.key === loadKey && loaded.doc === doc ? loaded.render : null);
    const currentError = error?.key === loadKey ? error.message : null;

    useEffect(() => {
        if (!student || !ex) return;
        let cancelled = false;
        // Precàrrega (sense bloquejar): alumnes del costat i l'exercici següent
        const preload = () => {
            for (const [s, e] of [...nearStudents.map(n => [n, ex] as const), [student, nextExercise] as const]) {
                for (const page of pagesFor(s, e, doc.numPages)) void renderPage(doc, page, { invert: isDark }).catch(() => undefined);
            }
        };
        if (instant) { preload(); return; }
        renderExercise(doc, student, ex, isDark)
            .then(pages => {
                if (cancelled) return;
                setLoaded({ key: loadKey, doc, render: toRender(pages, renderKey) });
                preload();
            })
            .catch(err => {
                if (cancelled) return;
                console.error('[correcció] Error carregant l\'exercici', err);
                setError({ key: loadKey, message: err instanceof Error ? err.message : String(err) });
            });
        return () => { cancelled = true; };
    }, [doc, loadKey]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Error de pintat (PDF malmès, memòria…): es mostra al lloc del retall amb «Torna-ho a provar». */
    const retry = () => setAttempt(a => a + 1);
    const isLoading = !!student && !!ex && !render && !currentError;
    return { render, isLoading, error: currentError, retry };
}
