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
    scale: number = 2.5
): Promise<string> {
    try {
        const fullCanvas = document.createElement('canvas');
        const dims = await renderPDFPageToCanvas(pdfDoc, pageIndex, fullCanvas, scale);

        if (!dims) return '';

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = region.width;
        cropCanvas.height = region.height;
        const ctx = cropCanvas.getContext('2d')!;

        // VERY IMPORTANT: Fill with white first, because PDF canvas is transparent 
        // and exporting to JPEG turns transparent into black (black text on black = invisible)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, region.width, region.height);

        // The region is in 2.5x coordinates already since we draw it on a scaled canvas in the editor
        // We'll trust the region x,y,width,height are scaled correctly to match the fullCanvas.
        ctx.drawImage(
            fullCanvas,
            region.x, region.y, region.width, region.height,
            0, 0, region.width, region.height
        );

        const dataUrl = cropCanvas.toDataURL('image/jpeg', 1.0);

        const { data: { text } } = await Tesseract.recognize(dataUrl, 'eng+spa', {
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
