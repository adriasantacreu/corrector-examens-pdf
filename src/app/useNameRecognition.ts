/**
 * Identificació dels alumnes a partir de l'àrea del nom: retalla el nom de cada examen i el llegeix
 * amb IA (en lots) o, si la IA falla, amb Tesseract i comparant amb la llista de classe.
 */
import { useCallback, useRef, useState } from 'react';
import { classroomName, findBestNameMatch, getStudentPage, parseNameList } from '../domain/students';
import { recognizeNames } from '../services/ai/nameRecognition';
import { extractRegionImage } from '../services/pdf/pageRenderer';
import { readRegionText } from '../services/pdf/tesseractOcr';
import type { ExerciseDef, OcrNameRegion, Student } from '../types';
import type { ShowToast } from '../state/useDialogs';
import type { SessionStore } from '../state/useSessionStore';

export interface OcrProgress {
    current: number;
    total: number;
}

function namePage(student: Student, region: OcrNameRegion, numPages: number): number | undefined {
    const logical = Math.min(region.pageIndex, student.pageIndexes.length - 1);
    return getStudentPage(student, logical, numPages) ?? getStudentPage(student, 0, numPages);
}

export function useNameRecognition(store: SessionStore, showToast: ShowToast) {
    const [progress, setProgress] = useState<OcrProgress | null>(null);
    const running = useRef(false);

    const run = useCallback(async (exercisesOverride?: ExerciseDef[]) => {
        const session = store.session;
        const doc = store.pdfDoc;
        if (!session || !doc || running.current) return;
        const region = (exercisesOverride ?? session.exercises).find((e): e is OcrNameRegion => e.type === 'ocr_name');
        if (!region) return;

        running.current = true;
        const students = session.students;
        const known = parseNameList(session.studentList);
        const emailFor = (name: string) =>
            session.studentEmailMap[name] ??
            session.classroomStudents.find(cs => classroomName(cs) === name)?.profile?.emailAddress;

        showToast('Identificant', 'Llegint els noms automàticament...', 'loading');
        try {
            // 1. Retalls dels noms (es veuen al corrector i a resultats encara que no es faci OCR)
            const crops: string[] = [];
            for (let i = 0; i < students.length; i++) {
                const page = namePage(students[i], region, doc.numPages);
                let crop = '';
                if (page !== undefined) {
                    try { crop = await extractRegionImage(doc, page, region); } catch { /* pàgina il·legible */ }
                }
                crops.push(crop);
                setProgress({ current: i + 1, total: students.length });
                showToast('OCR', `Retallant noms... ${i + 1}/${students.length}`, 'loading');
            }
            store.update(s => ({
                students: s.students.map((st, i) => (students[i]?.id === st.id && crops[i] ? { ...st, nameCropUrl: crops[i] } : st)),
            }));

            if (region.skipOcr) {
                store.update({ ocrCompleted: true });
                showToast('Èxit OCR', "S'ha completat la lectura de noms.", 'success');
                return;
            }

            // 2. Lectura dels noms
            showToast('Identificant', 'Processant noms amb IA...', 'loading');
            let names: { raw: string | null; matched: string | null }[];
            let usedLocalOcr = false;
            try {
                names = await recognizeNames(crops, known, {
                    onProgress: (done, total) => setProgress({ current: done, total }),
                });
            } catch (err) {
                console.warn('[ocr] La IA no ha respost, es fa servir Tesseract', err);
                showToast('Identificant', 'Processant noms un a un...', 'loading');
                names = [];
                usedLocalOcr = true;
                for (let i = 0; i < students.length; i++) {
                    setProgress({ current: i + 1, total: students.length });
                    showToast('OCR', `Llegint alumne ${i + 1}/${students.length}`, 'loading');
                    const page = namePage(students[i], region, doc.numPages);
                    const raw = page !== undefined && crops[i] ? await readRegionText(doc, page, region) : '';
                    names.push({ raw: raw || null, matched: raw ? findBestNameMatch(raw, known) : null });
                }
            }

            const identified = names.filter(n => n.matched ?? n.raw).length;
            store.update(s => ({
                ocrCompleted: true,
                students: s.students.map((st, i) => {
                    const reading = students[i]?.id === st.id ? names[i] : undefined;
                    const name = reading?.matched ?? reading?.raw;
                    if (!name) return st;
                    const email = emailFor(name);
                    return { ...st, name, originalOcrName: reading?.raw ?? undefined, ...(email ? { email } : {}) };
                }),
            }));
            // El canvi a l'OCR local era silenciós: llegeix pitjor la lletra, i cal saber-ho per revisar els noms
            showToast('Èxit OCR', usedLocalOcr
                ? `IA no disponible: s'ha fet servir l'OCR local. S'han identificat ${identified} noms; revisa'ls.`
                : `S'han identificat ${identified} noms correctament.`, 'success');
        } catch (err) {
            console.error('[ocr] Error identificant noms', err);
            showToast('Error OCR', "No s'ha pogut completar la identificació per IA.", 'error');
        } finally {
            running.current = false;
            setProgress(null);
        }
    }, [store, showToast]);

    const reset = useCallback(() => {
        store.update(s => ({
            ocrCompleted: false,
            students: s.students.map((st, i) => ({ ...st, name: `Alumne ${i + 1}`, nameCropUrl: undefined, originalOcrName: undefined })),
        }));
    }, [store]);

    return { run, reset, progress, isRunning: progress !== null };
}
