/**
 * Rasterització de pàgines amb memòria cau. Passar d'alumne o d'exercici ja no torna a renderitzar
 * pàgines que ja s'han vist, i les pàgines del següent alumne es poden precarregar.
 */
import { RENDER_SCALE } from '../../config/constants';
import type { Rect } from '../../types';
import type { PDFDocumentProxy } from './pdfDocument';

/** Límit de memòria de la cau, en píxels (≈ 4 bytes per píxel). Unes 10 pàgines a l'escala de treball. */
const MAX_CACHED_PIXELS = 32_000_000;
const cache = new Map<string, Promise<HTMLCanvasElement>>();
const pixelCount = new Map<string, number>();

function evict() {
    let total = [...pixelCount.values()].reduce((a, b) => a + b, 0);
    for (const key of cache.keys()) {
        if (total <= MAX_CACHED_PIXELS || cache.size <= 2) break;
        total -= pixelCount.get(key) ?? 0;
        cache.delete(key);
        pixelCount.delete(key);
    }
}
const docIds = new WeakMap<PDFDocumentProxy, number>();
let nextDocId = 1;

const docKey = (doc: PDFDocumentProxy) => {
    if (!docIds.has(doc)) docIds.set(doc, nextDocId++);
    return docIds.get(doc)!;
};

async function rasterize(doc: PDFDocumentProxy, pageNumber: number, scale: number, invert: boolean): Promise<HTMLCanvasElement> {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
    if (invert) {
        ctx.save();
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }
    return canvas;
}

/**
 * Canvas de la pàgina (base 1) a l'escala indicada. El canvas retornat és compartit: no s'hi ha de dibuixar
 * a sobre (per això hi ha `renderPageCopy`).
 */
export function renderPage(doc: PDFDocumentProxy, pageNumber: number, opts: { scale?: number; invert?: boolean; cache?: boolean } = {}): Promise<HTMLCanvasElement> {
    const { scale = RENDER_SCALE, invert = false, cache: useCache = true } = opts;
    if (!useCache) return rasterize(doc, pageNumber, scale, invert);
    const key = `${docKey(doc)}:${pageNumber}:${scale}:${invert ? 1 : 0}`;
    const hit = cache.get(key);
    if (hit) {
        cache.delete(key);
        cache.set(key, hit);
        return hit;
    }
    const promise = rasterize(doc, pageNumber, scale, invert);
    cache.set(key, promise);
    promise.then(
        canvas => { if (cache.get(key) === promise) { pixelCount.set(key, canvas.width * canvas.height); evict(); } },
        () => { cache.delete(key); pixelCount.delete(key); },
    );
    return promise;
}

/** Còpia independent del canvas de la pàgina (per dibuixar-hi anotacions). */
export async function renderPageCopy(doc: PDFDocumentProxy, pageNumber: number, opts: { scale?: number; invert?: boolean } = {}): Promise<HTMLCanvasElement> {
    const src = await renderPage(doc, pageNumber, opts);
    const copy = document.createElement('canvas');
    copy.width = src.width;
    copy.height = src.height;
    copy.getContext('2d')!.drawImage(src, 0, 0);
    return copy;
}

/** Retalla una regió (en coordenades de RENDER_SCALE) d'un canvas, reescalant si el canvas és a una altra escala. */
export function cropCanvas(source: HTMLCanvasElement, region: Rect, sourceScale = RENDER_SCALE, background = '#ffffff'): HTMLCanvasElement {
    const k = sourceScale / RENDER_SCALE;
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(region.width * k));
    out.height = Math.max(1, Math.round(region.height * k));
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(source, region.x * k, region.y * k, region.width * k, region.height * k, 0, 0, out.width, out.height);
    return out;
}

export function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = canvas.toDataURL('image/png');
    });
}

export async function getPageSize(doc: PDFDocumentProxy, pageNumber: number, scale = RENDER_SCALE): Promise<{ width: number; height: number }> {
    const page = await doc.getPage(pageNumber);
    const vp = page.getViewport({ scale });
    return { width: vp.width, height: vp.height };
}

/** Miniatura d'una pàgina (no passa per la cau per no desplaçar les pàgines de treball). */
export async function renderThumbnail(doc: PDFDocumentProxy, pageNumber: number, scale = 0.5): Promise<string> {
    const canvas = await renderPage(doc, pageNumber, { scale, cache: false });
    return canvas.toDataURL('image/jpeg', 0.7);
}

/** Retall d'una regió d'una pàgina com a JPEG (per als noms dels alumnes o per a la IA). */
export async function extractRegionImage(doc: PDFDocumentProxy, pageNumber: number, region: Rect, quality = 0.85): Promise<string> {
    const page = await renderPage(doc, pageNumber);
    return cropCanvas(page, region).toDataURL('image/jpeg', quality);
}
