import { useEffect, useMemo, useRef, useState } from 'react';
import { getStudentPage } from '../../domain/students';
import { findBlankZones, type BlankZone, type Luma } from '../../domain/templateEdit';
import type { PDFDocumentProxy } from '../../services/pdf/pdfDocument';
import { pageLuma } from '../../services/pdf/pageLuma';
import type { ExerciseDef, Student } from '../../types';

/**
 * R4: retalls que en algun alumne surten en blanc. Les pàgines es llegeixen en segon pla, en petit,
 * una a una i només les que fan falta; mentre no hi són, aquell alumne no s'avalua.
 */
export function useBlankZones(pdfDoc: PDFDocumentProxy, students: Student[], exercises: ExerciseDef[]): BlankZone[] {
    const lumas = useRef(new Map<number, Luma>());
    const [loaded, setLoaded] = useState(0);
    const logicalPages = useMemo(
        () => [...new Set(exercises.flatMap(e => (e.type === 'crop' ? [e.pageIndex] : [])))].join(','),
        [exercises],
    );

    useEffect(() => {
        let cancelled = false;
        const wanted = new Set<number>();
        for (const st of students) for (const lp of logicalPages ? logicalPages.split(',').map(Number) : []) {
            const abs = getStudentPage(st, lp, pdfDoc.numPages);
            if (abs !== undefined && !lumas.current.has(abs)) wanted.add(abs);
        }
        (async () => {
            for (const abs of wanted) {
                if (cancelled) return;
                try {
                    lumas.current.set(abs, await pageLuma(pdfDoc, abs));
                    if (!cancelled) setLoaded(n => n + 1);
                } catch (err) {
                    console.warn('[template] No s\'ha pogut llegir la pàgina', abs, err);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [pdfDoc, students, logicalPages]);

    return useMemo(() => findBlankZones(students.length, exercises, (s, lp) => {
        const abs = getStudentPage(students[s], lp, pdfDoc.numPages);
        if (abs === undefined) return undefined;
        return lumas.current.get(abs) ?? null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [students, exercises, pdfDoc, loaded]);
}
