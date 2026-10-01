/** Lectura de text amb Tesseract (sense connexió). Es fa servir si la IA no està disponible. */
import type { Rect } from '../../types';
import type { PDFDocumentProxy } from './pdfDocument';
import { cropCanvas, renderPage } from './pageRenderer';

const OCR_SCALE = 4.5;

export async function readRegionText(doc: PDFDocumentProxy, pageNumber: number, region: Rect): Promise<string> {
    try {
        const page = await renderPage(doc, pageNumber, { scale: OCR_SCALE, cache: false });
        const crop = cropCanvas(page, region, OCR_SCALE);
        const ctx = crop.getContext('2d')!;
        const image = ctx.getImageData(0, 0, crop.width, crop.height);
        const d = image.data;
        for (let i = 0; i < d.length; i += 4) {
            const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
            d[i] = d[i + 1] = d[i + 2] = gray < 150 ? 0 : 255;
        }
        ctx.putImageData(image, 0, 0);
        const { default: Tesseract } = await import('tesseract.js');
        const { data } = await Tesseract.recognize(crop.toDataURL('image/png'), 'cat+spa+eng');
        return data.text.trim();
    } catch (err) {
        console.error('[ocr] Error llegint text', err);
        return '';
    }
}
