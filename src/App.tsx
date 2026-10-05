/**
 * Compositor de l'app: connecta l'estat (sessió, preferències, Google, diàlegs) amb les pantalles.
 * La lògica viu als hooks d'`app/` i `state/`; aquí només es decideix quina pantalla es mostra.
 */
import { useCallback, useState } from 'react';
import { useClassroomImport } from './app/useClassroomImport';
import { useCloudPdfSync } from './app/useCloudPdfSync';
import { useNameRecognition } from './app/useNameRecognition';
import { useRecentSessions } from './app/useRecentSessions';
import { useSessionLifecycle } from './app/useSessionLifecycle';
import { GlobalDialog, ProcessingOverlay, ToastCard } from './components/common/Overlays';
import CorrectionView from './components/correction/CorrectionView';
import HomeView from './components/home/HomeView';
import PageOrganizer from './components/organizer/PageOrganizer';
import ResultsView from './components/results/ResultsView';
import SetupView from './components/setup/SetupView';
import TemplateDefiner from './components/template/TemplateDefiner';
import type { SessionSummary } from './domain/session';
import { getStudentPage } from './domain/students';
import { loadPdf } from './services/pdf/pdfDocument';
import { deletePdf, solutionCacheKey, storePdf } from './services/storage/pdfCache';
import { patchSession } from './services/storage/sessionRepository';
import { useDialogs } from './state/useDialogs';
import { useGlobalSettings } from './state/useGlobalSettings';
import { useGoogleAuth } from './state/useGoogleAuth';
import { useSessionStore } from './state/useSessionStore';
import type { ExerciseDef } from './types';

export default function App() {
    const globals = useGlobalSettings();
    const auth = useGoogleAuth(globals);
    const dialogs = useDialogs();
    const { showToast, showConfirm, showAlert } = dialogs;
    const [processing, setProcessing] = useState<string | null>(null);

    const store = useSessionStore(globals, auth.accessToken, auth.handleApiError);
    const { session, update, pdfDoc, solutionPdfDoc } = store;
    const mode = session?.mode ?? 'upload';

    const recent = useRecentSessions(mode === 'upload', auth.accessToken, globals.settings.lastActiveFileName, auth.handleApiError);
    const syncPdf = useCloudPdfSync(auth.accessToken, setProcessing, showToast, auth.handleApiError);
    const lifecycle = useSessionLifecycle({
        store, globals, auth, dialogs, setProcessing, syncPdf,
        onSessionsChanged: () => void recent.reload(),
        removeSummary: recent.removeLocal,
    });
    const classroom = useClassroomImport(store, auth.accessToken, showToast, auth.handleApiError);
    const ocr = useNameRecognition(store, showToast);

    const theme = globals.settings.theme;
    const account = {
        accessToken: auth.accessToken, userEmail: auth.userEmail, userPicture: auth.userPicture,
        onAuthorize: auth.authorize, onLogout: auth.logout,
    };
    const common = { theme, onToggleTheme: globals.toggleTheme, ...account };

    // --- Pantalla d'inici: accions sobre sessions recents ---
    const renameSession = useCallback(async (s: SessionSummary, alias: string | null) => {
        recent.patchLocal(s.fileName, { sessionAlias: alias });
        await patchSession(s.fileName, { sessionAlias: alias });
    }, [recent]);

    const toggleSessionCloud = useCallback(async (s: SessionSummary) => {
        const next = !s.cloudSyncPDF;
        recent.patchLocal(s.fileName, { cloudSyncPDF: next });
        await patchSession(s.fileName, { cloudSyncPDF: next });
        await syncPdf(s.fileName, next);
    }, [recent, syncPdf]);

    // --- Solucionari ---
    const loadSolutionFile = useCallback(async (file: File) => {
        if (!session) return;
        showToast('Carregant', 'Llegint el document solucionari...', 'loading');
        try {
            store.setSolutionPdfDoc(await loadPdf(file));
            update({ solutionFileName: file.name, solutionPageIndexes: [] });
            await storePdf(solutionCacheKey(session.fileName, file.name), file);
            showToast('Èxit', 'Solucionari carregat', 'success');
        } catch {
            showToast('Error', 'Error carregant el solucionari.', 'error');
        }
    }, [session, store, update, showToast]);

    const removeSolution = useCallback(() => {
        if (!session?.solutionFileName) return;
        void deletePdf(solutionCacheKey(session.fileName, session.solutionFileName));
        store.setSolutionPdfDoc(null);
        update({ solutionFileName: null, solutionPageIndexes: [] });
    }, [session, store, update]);

    // --- Plantilla: en acabar, es llegeixen els noms (si no s'ha fet) i es passa a corregir ---
    const completeTemplate = useCallback(async () => {
        if (!session) return;
        if (!session.ocrCompleted) await ocr.run(session.exercises);
        lifecycle.setMode('correction');
    }, [session, ocr, lifecycle]);

    const updateExercise = useCallback((ux: ExerciseDef) => update(s => ({
        exercises: s.exercises.map(ex => (ex.id === ux.id ? ux : ex)),
    })), [update]);

    return (
        <div className={`app-container ${mode === 'upload' ? 'home-page' : ''}`} style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {processing && <ProcessingOverlay message={processing} />}
            {dialogs.toast.show && <ToastCard title={dialogs.toast.title} text={dialogs.toast.text} type={dialogs.toast.type} />}
            {dialogs.dialog.show && (
                <GlobalDialog
                    dialog={dialogs.dialog}
                    onConfirm={dialogs.confirm}
                    onCancel={dialogs.cancel}
                    onCheckbox={checked => {
                        dialogs.setDialog(d => ({ ...d, checkboxChecked: checked }));
                        dialogs.dialog.onCheckboxChange?.(checked);
                    }}
                />
            )}

            {!session && (
                <HomeView
                    {...common}
                    sessions={recent.sessions}
                    pending={recent.pending}
                    onUploadFile={file => void lifecycle.processUploadedFile(file)}
                    onInvalidFile={() => showToast('Fitxer no vàlid', 'Només es permeten fitxers PDF.', 'error')}
                    onResume={(s, file) => void lifecycle.resumeSession(s, file)}
                    onDelete={s => showConfirm('Eliminar sessió', `Vols eliminar la sessió "${s.sessionAlias || s.fileName}"? Aquesta acció no es pot desfer.`, () => void lifecycle.removeSession(s))}
                    onRename={(s, alias) => void renameSession(s, alias)}
                    onToggleCloud={s => void toggleSessionCloud(s)}
                />
            )}

            {session && pdfDoc && (
                <main className="main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    {mode === 'setup' && (
                        <SetupView
                            {...common}
                            session={session}
                            update={update}
                            numPages={pdfDoc.numPages}
                            courses={auth.courses}
                            ocrProgress={ocr.progress}
                            onBack={lifecycle.goBack}
                            onNext={() => void lifecycle.startConfiguration()}
                            onImportClassroom={courseId => void classroom.importCourse(courseId)}
                            onSolutionFile={file => void loadSolutionFile(file)}
                            onInvalidSolution={() => showToast('Fitxer no vàlid', 'Només es permeten fitxers PDF per al solucionari.', 'error')}
                            onRemoveSolution={removeSolution}
                            onToggleCloudPdf={() => {
                                const next = !session.cloudSyncPDF;
                                update({ cloudSyncPDF: next });
                                void syncPdf(session.fileName, next);
                            }}
                            onToggleCloudSolution={() => {
                                const next = !session.cloudSyncSolution;
                                update({ cloudSyncSolution: next });
                                if (session.solutionFileName) void syncPdf(session.fileName, next, session.solutionFileName);
                            }}
                            showConfirm={showConfirm}
                        />
                    )}

                    {mode === 'organize_pages' && (
                        <PageOrganizer
                            {...common}
                            pdfDoc={pdfDoc}
                            solutionPdfDoc={solutionPdfDoc}
                            groups={session.students}
                            solutionPages={session.solutionPageIndexes}
                            pagesPerExam={Math.max(1, session.pagesPerExam || 1)}
                            fileName={session.fileName}
                            sessionAlias={session.sessionAlias}
                            onRename={alias => update({ sessionAlias: alias })}
                            onChange={(students, solutionPageIndexes) => update({ students, solutionPageIndexes })}
                            onConfirm={() => lifecycle.setMode('configure_crops')}
                            onBack={lifecycle.goBack}
                            showConfirm={showConfirm}
                        />
                    )}

                    {mode === 'configure_crops' && (
                        <TemplateDefiner
                            {...common}
                            pdfDoc={pdfDoc}
                            pagesPerExam={Math.max(1, session.pagesPerExam || 1)}
                            templatePage={logical => (session.students[0] ? getStudentPage(session.students[0], logical, pdfDoc.numPages) : undefined) ?? logical}
                            exercises={session.exercises}
                            onChange={exercises => update({ exercises })}
                            fileName={session.fileName}
                            sessionAlias={session.sessionAlias}
                            onRename={alias => update({ sessionAlias: alias })}
                            onComplete={() => void completeTemplate()}
                            onBack={lifecycle.goBack}
                            onRunOCR={() => void ocr.run()}
                            onResetOCR={ocr.reset}
                            ocrCompleted={session.ocrCompleted}
                            showConfirm={showConfirm}
                            showToast={showToast}
                        />
                    )}

                    {mode === 'correction' && (
                        <CorrectionView
                            {...common}
                            pdfDoc={pdfDoc}
                            solutionPdfDoc={solutionPdfDoc}
                            students={session.students}
                            exercises={session.exercises}
                            annotations={session.annotations}
                            rubricCounts={session.rubricCounts}
                            commentBank={session.commentBank}
                            targetMaxScore={session.targetMaxScore}
                            stampSize={session.stampSize}
                            onUpdateStampSize={stampSize => update({ stampSize })}
                            onUpdateCommentBank={commentBank => update({ commentBank })}
                            onUpdateTargetMaxScore={targetMaxScore => update({ targetMaxScore })}
                            presets={session.presets}
                            onUpdatePresets={presets => update({ presets })}
                            onUpdateAnnotations={(sId, eId, anns) => update(s => ({
                                annotations: { ...s.annotations, [sId]: { ...s.annotations[sId], [eId]: anns } },
                            }))}
                            onUpdateRubricCounts={(sId, eId, itemId, delta) => update(s => {
                                const cur = s.rubricCounts[sId]?.[eId]?.[itemId] ?? 0;
                                return { rubricCounts: { ...s.rubricCounts, [sId]: { ...s.rubricCounts[sId], [eId]: { ...s.rubricCounts[sId]?.[eId], [itemId]: Math.max(0, cur + delta) } } } };
                            })}
                            onUpdateExercise={updateExercise}
                            onBack={lifecycle.goBack}
                            onFinish={() => lifecycle.setMode('results')}
                            studentIdx={session.lastStudentIdx}
                            exerciseIdx={session.lastExerciseIdx}
                            onUpdateStudentIdx={lastStudentIdx => update({ lastStudentIdx })}
                            onUpdateExerciseIdx={lastExerciseIdx => update({ lastExerciseIdx })}
                            showConfirm={showConfirm}
                        />
                    )}

                    {mode === 'results' && (
                        <ResultsView
                            pdfDoc={pdfDoc}
                            stampSize={session.stampSize}
                            students={session.students}
                            exercises={session.exercises}
                            annotations={session.annotations}
                            rubricCounts={session.rubricCounts}
                            targetMaxScore={session.targetMaxScore}
                            presets={session.presets}
                            commentBank={session.commentBank}
                            onUpdateStudents={students => update({ students })}
                            onBack={lifecycle.goBack}
                            theme={theme}
                            onToggleTheme={globals.toggleTheme}
                            accessToken={auth.accessToken}
                            userEmail={auth.userEmail}
                            onAuthorize={auth.authorize}
                            courses={auth.courses}
                            isAuthorizing={auth.isAuthorizing}
                            classroomStudents={session.classroomStudents}
                            showAlert={showAlert}
                            showConfirm={showConfirm}
                            showToast={showToast}
                        />
                    )}
                </main>
            )}
        </div>
    );
}
