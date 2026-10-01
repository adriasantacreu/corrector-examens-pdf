/**
 * Imatges de l'exercici actual per a l'alumne actual (un retall o diverses pàgines) i la seva disposició.
 * Fa servir la cau de pàgines i precarrega l'alumne següent perquè navegar sigui immediat.
 */
import { useEffect, useState } from 'react';
import { layoutBounds, layoutPages, type PagePlacement } from '../../domain/pageLayout';
import type { Size } from '../../domain/geometry';
import { getStudentPage, isPageIgnored } from '../../domain/students';
import type { PDFDocumentProxy } from '../../services/pdf/pdfDocument';
import { cropCanvas, renderPage } from '../../services/pdf/pageRenderer';
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

async function renderExercise(doc: PDFDocumentProxy, student: Student, ex: GradableExercise, isDark: boolean): Promise<RenderedPage[]> {
    if (ex.type === 'crop') {
        const page = getStudentPage(student, ex.pageIndex, doc.numPages);
        if (page === undefined || isPageIgnored(student, page)) return [];
        const full = await renderPage(doc, page, { invert: isDark });
        const img = cropCanvas(full, ex, undefined, isDark ? '#000000' : '#ffffff');
        return [{ img, order: 0, x: 0, y: 0, width: ex.width, height: ex.height }];
    }
    const canvases = new Map<number, HTMLCanvasElement>();
    const slots = await Promise.all(ex.pageIndexes.map(async (logical, order) => {
        const page = getStudentPage(student, logical, doc.numPages);
        if (page === undefined || isPageIgnored(student, page)) return { order, size: null };
        const canvas = await renderPage(doc, page, { invert: isDark });
        canvases.set(order, canvas);
        return { order, size: { width: canvas.width, height: canvas.height } };
    }));
    const placements = layoutPages(slots, !!ex.spansTwoPages);
    if (!placements.length) return [{ img: placeholderCanvas(isDark), order: 0, x: 0, y: 0, width: 800, height: 400 }];
    return placements.map(p => ({ ...p, img: canvases.get(p.order)! }));
}

/** Pàgines que caldrà per a l'alumne següent (per precarregar-les). */
function pagesFor(student: Student | undefined, ex: GradableExercise, numPages: number): number[] {
    if (!student) return [];
    const logical = ex.type === 'crop' ? [ex.pageIndex] : ex.pageIndexes;
    return logical.map(l => getStudentPage(student, l, numPages)).filter((p): p is number => p !== undefined);
}

export function useExerciseRender(
    doc: PDFDocumentProxy,
    student: Student | undefined,
    nextStudent: Student | undefined,
    ex: GradableExercise | undefined,
    isDark: boolean,
) {
    const [render, setRender] = useState<ExerciseRender | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Només es torna a renderitzar si canvia alguna cosa que afecta les imatges
    const exKey = ex ? JSON.stringify(ex.type === 'crop'
        ? [ex.id, ex.pageIndex, ex.x, ex.y, ex.width, ex.height]
        : [ex.id, ex.pageIndexes, !!ex.spansTwoPages]) : '';
    const studentKey = student ? JSON.stringify([student.id, student.pageIndexes, student.ignoredPageIndexes ?? []]) : '';

    useEffect(() => {
        if (!student || !ex) return;
        let cancelled = false;
        setIsLoading(true);
        setRender(null);
        renderExercise(doc, student, ex, isDark)
            .then(pages => {
                if (cancelled) return;
                const placements = pages.map(({ img: _img, ...p }) => p);
                setRender({ pages, placements, bounds: layoutBounds(placements), key: `${student.id}|${exKey}` });
                // Precàrrega de l'alumne següent (sense bloquejar)
                for (const page of pagesFor(nextStudent, ex, doc.numPages)) void renderPage(doc, page, { invert: isDark }).catch(() => undefined);
            })
            .catch(err => { if (!cancelled) console.error('[correcció] Error carregant l\'exercici', err); })
            .finally(() => { if (!cancelled) setIsLoading(false); });
        return () => { cancelled = true; };
    }, [doc, studentKey, exKey, isDark]); // eslint-disable-line react-hooks/exhaustive-deps

    return { render, isLoading };
}
