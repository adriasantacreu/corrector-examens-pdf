import * as pdfjsLib from 'pdfjs-dist';

// Define the PDF document type wrapper
export type PDFDocumentProxy = pdfjsLib.PDFDocumentProxy;

/**
 * Loads a PDF document from a File or Blob.
 */
export async function loadPDF(file: File): Promise<PDFDocumentProxy> {
    console.log('[pdfUtils] Starting loadPDF for file:', file.name, file.size);
    const arrayBuffer = await file.arrayBuffer();
    console.log('[pdfUtils] ArrayBuffer ready, length:', arrayBuffer.byteLength);
    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        console.log('[pdfUtils] loadingTask created');
        const doc = await loadingTask.promise;
        console.log('[pdfUtils] PDF loaded successfully, numPages:', doc.numPages);
        return doc;
    } catch (err) {
        console.error('[pdfUtils] Error in loadPDF:', err);
        throw err;
    }
}

/**
 * Renders a specific page from a PDF document onto a given canvas context.
 */
export async function renderPDFPageToCanvas(
    pdfDoc: PDFDocumentProxy,
    pageNumber: number,
    canvas: HTMLCanvasElement,
    scale: number = 1.5
) {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderContext: any = {
        canvasContext: ctx,
        viewport: viewport,
    };

    await page.render(renderContext).promise;

    // Return dimensions for layout purposes
    return { width: viewport.width, height: viewport.height };
}
