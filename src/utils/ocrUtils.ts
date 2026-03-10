import Tesseract from 'tesseract.js';
import type { PDFDocumentProxy } from './pdfUtils';
import { renderPDFPageToCanvas } from './pdfUtils';

/**
 * Extracts student name from a specific region on a PDF page using Tesseract OCR.
 */
export async function extractTextFromRegion(
    pdfDoc: PDFDocumentProxy,
    pageIndex: number,
    region: { x: number; y: number; width: number; height: number },
    scale: number = 3.5
): Promise<string> {
    try {
        const fullCanvas = document.createElement('canvas');
        const dims = await renderPDFPageToCanvas(pdfDoc, pageIndex, fullCanvas, scale);

        if (!dims) return '';

        const cropCanvas = document.createElement('canvas');
        // Factor in the scale difference
        const sW = region.width * (scale / 2.5);
        const sH = region.height * (scale / 2.5);
        const sX = region.x * (scale / 2.5);
        const sY = region.y * (scale / 2.5);

        cropCanvas.width = sW;
        cropCanvas.height = sH;
        const ctx = cropCanvas.getContext('2d')!;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sW, sH);

        ctx.drawImage(
            fullCanvas,
            sX, sY, sW, sH,
            0, 0, sW, sH
        );

        const dataUrl = cropCanvas.toDataURL('image/jpeg', 1.0);

        const { data: { text } } = await Tesseract.recognize(dataUrl, 'cat+spa+eng', {
            logger: m => console.log('OCR Progress:', m)
        });

        return text.trim();
    } catch (err) {
        console.error('OCR Extraction failed:', err);
        return '';
    }
}

/**
 * Just extracts the image from a region as a DataURL (no OCR).
 */
export async function extractImageFromRegion(
    pdfDoc: PDFDocumentProxy,
    pageIndex: number,
    region: { x: number; y: number; width: number; height: number },
    scale: number = 2.5
): Promise<string> {
    try {
        const fullCanvas = document.createElement('canvas');
        await renderPDFPageToCanvas(pdfDoc, pageIndex, fullCanvas, scale);

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = region.width;
        cropCanvas.height = region.height;
        const ctx = cropCanvas.getContext('2d')!;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, region.width, region.height);

        ctx.drawImage(
            fullCanvas,
            region.x, region.y, region.width, region.height,
            0, 0, region.width, region.height
        );

        return cropCanvas.toDataURL('image/jpeg', 0.85);
    } catch (err) {
        console.error('Image extraction failed:', err);
        return '';
    }
}
