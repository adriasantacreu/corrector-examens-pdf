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
        const header = new Uint8Array(arrayBuffer.slice(0, 5));
        const headerStr = Array.from(header).map(b => String.fromCharCode(b)).join('');
        console.log('[pdfUtils] PDF Header check:', headerStr, header);

        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            const workerUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
            console.log('[pdfUtils] Setting workerSrc to:', workerUrl);
            pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
        }

        console.log('[pdfUtils] Calling getDocument...');
        const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer,
            // Disable range requests for local files to avoid some corruption errors
            disableRange: true,
            disableAutoFetch: true,
        });

        console.log('[pdfUtils] loadingTask created, waiting for promise...');
        const doc = await loadingTask.promise;
        console.log('[pdfUtils] PDF loaded successfully, numPages:', doc.numPages);
        return doc;
    } catch (err: any) {
        console.error('[pdfUtils] Detailed error in loadPDF:', {
            message: err.message,
            name: err.name,
            stack: err.stack,
            error: err
        });
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
