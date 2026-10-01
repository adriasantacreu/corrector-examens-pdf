import * as pdfjsLib from 'pdfjs-dist';
// El worker s'empaqueta amb l'app (abans es baixava d'un CDN i fallava sense connexió o si canviava la versió)
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export type PDFDocumentProxy = pdfjsLib.PDFDocumentProxy;

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function loadPdf(file: Blob): Promise<PDFDocumentProxy> {
    const data = await file.arrayBuffer();
    return pdfjsLib.getDocument({ data, disableRange: true, disableAutoFetch: true }).promise;
}

export const isPdfFile = (file: File | null | undefined): file is File =>
    !!file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
