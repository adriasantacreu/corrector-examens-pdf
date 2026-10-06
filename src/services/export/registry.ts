/**
 * Exportadors (camins de sortida): cada format és una entrada d'aquesta llista. Resultats i el correu només
 * en coneixen la interfície. Un format nou = un fitxer + una línia aquí, sense tocar la pantalla.
 */
import { PDFDocument } from 'pdf-lib';
import { buildReport } from '../../domain/report';
import type { Student } from '../../types';
import { generateStudentPdf, studentPdfFileName, type ExportData } from '../pdf/pdfExport';

export interface ExportContext extends ExportData {
    title: string;
}

export interface Exporter {
    id: string;
    label: string;
    student(ctx: ExportContext, student: Student): Promise<Blob>;
    fileName(student: Student): string;
    allFileName: string;
}

const safe = (name: string) => name.replace(/\s+/g, '_');

export const EXPORTERS: Exporter[] = [
    {
        id: 'pdf',
        label: 'PDF corregit',
        student: generateStudentPdf,
        fileName: studentPdfFileName,
        allFileName: 'correccions_totes.pdf',
    },
    {
        id: 'report',
        label: 'Informe',
        student: async (ctx, student) => {
            // Càrrega a demanda: pdf-lib/fontkit i les fonts només quan es fa servir
            const { buildReportPdf } = await import('../pdf/reportPdf');
            return buildReportPdf(buildReport(ctx, student, new Date()), await generateStudentPdf(ctx, student));
        },
        fileName: s => `informe_${safe(s.name)}.pdf`,
        allFileName: 'informes_tots.pdf',
    },
];

export const DEFAULT_EXPORTER = 'pdf';
export const getExporter = (id: string | undefined): Exporter => EXPORTERS.find(e => e.id === id) ?? EXPORTERS[0];

/** Un sol PDF amb tots els alumnes, en el format triat. */
export async function exportAll(exporter: Exporter, ctx: ExportContext, students: Student[], onProgress?: (pct: number) => void): Promise<Blob> {
    const merged = await PDFDocument.create();
    for (let i = 0; i < students.length; i++) {
        const one = await PDFDocument.load(await (await exporter.student(ctx, students[i])).arrayBuffer());
        (await merged.copyPages(one, one.getPageIndices())).forEach(p => merged.addPage(p));
        onProgress?.(Math.round(((i + 1) / students.length) * 100));
    }
    return new Blob([(await merged.save()) as BlobPart], { type: 'application/pdf' });
}
