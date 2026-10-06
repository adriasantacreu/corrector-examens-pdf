/** Pàgina en petit i en grisos (R4: detectar zones en blanc sense guardar canvas grans a memòria). */
import { RENDER_SCALE } from '../../config/constants';
import type { Luma } from '../../domain/templateEdit';
import type { PDFDocumentProxy } from './pdfDocument';
import { renderPage } from './pageRenderer';

/** Escala del PDF per a la miniatura: una A4 fa ~300×420 px (~125 kB). */
export const LUMA_SCALE = 0.5;

export async function pageLuma(doc: PDFDocumentProxy, pageNumber: number): Promise<Luma> {
    const canvas = await renderPage(doc, pageNumber, { scale: LUMA_SCALE, cache: false });
    const { width, height } = canvas;
    const rgba = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height).data;
    const data = new Uint8Array(width * height);
    for (let i = 0, j = 0; j < data.length; i += 4, j++) data[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
    canvas.width = canvas.height = 0; // allibera el canvas de seguida
    return { width, height, scale: LUMA_SCALE / RENDER_SCALE, data };
}
