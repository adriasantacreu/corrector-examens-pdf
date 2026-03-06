import * as pdfjsLib from 'pdfjs-dist';

// For production builds (like GitHub Pages), we need to set the workerSrc explicitly.
// Using a CDN is the most reliable way for this to work out-of-the-box.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// Define the PDF document type wrapper
export type PDFDocumentProxy = pdfjsLib.PDFDocumentProxy;

/**
 * Loads a PDF document from a File or Blob.
 */
export async function loadPDF(file: File): Promise<PDFDocumentProxy> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    return await loadingTask.promise;
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
