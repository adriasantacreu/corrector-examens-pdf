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
    scale: number = 1.5,
    invert: boolean = false
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

    // Apply smart dark mode inversion if requested (preserves color hue/saturation, inverts lightness)
    if (invert) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            let h = 0, s = 0, l = (max + min) / 2;

            if (max !== min) {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                if (max === r) {
                    h = (g - b) / d + (g < b ? 6 : 0);
                } else if (max === g) {
                    h = (b - r) / d + 2;
                } else {
                    h = (r - g) / d + 4;
                }
                h /= 6;
            }

            // Invert lightness
            l = 1 - l;

            let newR, newG, newB;
            if (s === 0) {
                newR = newG = newB = l;
            } else {
                const hue2rgb = (p: number, q: number, t: number) => {
                    if (t < 0) t += 1;
                    if (t > 1) t -= 1;
                    if (t < 1 / 6) return p + (q - p) * 6 * t;
                    if (t < 1 / 2) return q;
                    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                    return p;
                };
                const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                const p = 2 * l - q;
                newR = hue2rgb(p, q, h + 1 / 3);
                newG = hue2rgb(p, q, h);
                newB = hue2rgb(p, q, h - 1 / 3);
            }

            data[i] = newR * 255;
            data[i + 1] = newG * 255;
            data[i + 2] = newB * 255;
        }
        ctx.putImageData(imgData, 0, 0);
    }

    // Return dimensions for layout purposes
    return { width: viewport.width, height: viewport.height };
}
