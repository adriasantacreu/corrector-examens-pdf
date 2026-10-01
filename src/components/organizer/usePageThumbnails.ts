import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from '../../services/pdf/pdfDocument';
import { renderThumbnail } from '../../services/pdf/pageRenderer';

/** Genera les miniatures d'un PDF una a una en l'ordre indicat (i s'atura si canvia el document). */
export function usePageThumbnails(doc: PDFDocumentProxy | null | undefined, order: number[]) {
    const [thumbs, setThumbs] = useState<Record<number, string>>({});
    const done = useRef(new Set<number>());
    const orderKey = order.join(',');

    useEffect(() => {
        if (!doc) return;
        let cancelled = false;
        void (async () => {
            for (const page of orderKey.split(',').map(Number).filter(Boolean)) {
                if (cancelled) return;
                if (done.current.has(page)) continue;
                try {
                    const url = await renderThumbnail(doc, page);
                    if (cancelled) return;
                    done.current.add(page);
                    setThumbs(prev => ({ ...prev, [page]: url }));
                } catch { /* pàgina il·legible: es queda "Carregant..." */ }
            }
        })();
        return () => { cancelled = true; };
    }, [doc, orderKey]);

    return thumbs;
}
