import { useState, useEffect } from 'react';
import { Upload, FileText, Settings, ChevronLeft, RefreshCw } from 'lucide-react';
import type { Student, ExerciseDef, AnnotationStore, RubricCountStore } from './types';
import { loadPDF, type PDFDocumentProxy } from './utils/pdfUtils';
import TemplateDefiner from './components/TemplateDefiner';
import CorrectionView from './components/CorrectionView';
import PageOrganizer from './components/PageOrganizer';

type AppMode = 'upload' | 'setup' | 'organize_pages' | 'configure_crops' | 'correction';

const STORAGE_KEY = 'correccio_app_state';

interface PersistedState {
  pagesPerExam: number;
  exercises: ExerciseDef[];
  students: Student[];
  annotations: AnnotationStore;
  rubricCounts: RubricCountStore;
  mode: AppMode;
}

function saveState(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save state to localStorage', e);
  }
}

function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

function App() {
  const savedState = loadState();
  const hasSavedSession = !!(savedState && savedState.exercises.length > 0);

  const [mode, setMode] = useState<AppMode>(
    hasSavedSession ? 'upload' : 'upload'
  );
  const [showRestorePrompt, setShowRestorePrompt] = useState(hasSavedSession);

  // State
  const [, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pagesPerExam, setPagesPerExam] = useState<number | ''>(
    savedState?.pagesPerExam ?? 1
  );
  const [students, setStudents] = useState<Student[]>(savedState?.students ?? []);
  const [exercises, setExercises] = useState<ExerciseDef[]>(savedState?.exercises ?? []);
  const [annotations, setAnnotations] = useState<AnnotationStore>(savedState?.annotations ?? {});
  const [rubricCounts, setRubricCounts] = useState<RubricCountStore>(savedState?.rubricCounts ?? {});
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('Processant...');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [pendingModeAfterPDF, setPendingModeAfterPDF] = useState<AppMode | null>(null);

  const addLog = (msg: string) => { console.log('[App]', msg); setDebugLogs(prev => [...prev.slice(-200), msg]); };

  // Persist state whenever key values change
  useEffect(() => {
    if (exercises.length > 0 || students.length > 0 || Object.keys(annotations).length > 0) {
      saveState({
        pagesPerExam: typeof pagesPerExam === 'number' ? pagesPerExam : 1,
        exercises, students, annotations, rubricCounts, mode,
      });
    }
  }, [exercises, students, annotations, rubricCounts, pagesPerExam, mode]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setPdfFile(file);
      setIsProcessing(true);
      try {
        const doc = await loadPDF(file);
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        if (pendingModeAfterPDF) {
          setMode(pendingModeAfterPDF);
          setPendingModeAfterPDF(null);
        } else {
          setMode('setup');
        }
        setShowRestorePrompt(false);
      } catch (err) {
        console.error("Error loading PDF", err);
        alert("Failed to load PDF. See console for details.");
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const startConfiguration = async () => {
    if (!pdfDoc) return;
    const safePages = typeof pagesPerExam === 'number' ? pagesPerExam : 1;
    const numExams = Math.floor(pdfDoc.numPages / safePages);
    // Build initial linear groups for the organizer
    const initialGroups = Array.from({ length: numExams }, (_, i) => ({
      id: `student_${i + 1}`,
      name: `Alumne ${i + 1}`,
      pageIndexes: Array.from({ length: safePages }, (__, p) => i * safePages + p + 1)
    }));
    setStudents(initialGroups);
    setMode('organize_pages');
  };

  const handleBack = () => {
    if (mode === 'setup') setMode('upload');
    else if (mode === 'organize_pages') setMode('setup');
    else if (mode === 'configure_crops') setMode('organize_pages');
    else if (mode === 'correction') setMode('configure_crops');
  };

  const handleRestoreSession = () => {
    // User wants to restore — they need to re-upload the PDF, then go straight to correction
    setPendingModeAfterPDF('correction');
    setShowRestorePrompt(false);
  };

  const handleNewSession = () => {
    localStorage.removeItem(STORAGE_KEY);
    setExercises([]);
    setStudents([]);
    setAnnotations({});
    setPagesPerExam(1);
    setShowRestorePrompt(false);
  };

  const handleUpdateAnnotations = (studentId: string, exerciseId: string, newAnnotations: import('./types').Annotation[]) => {
    setAnnotations(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [exerciseId]: newAnnotations
      }
    }));
  };

  return (
    <div className="app-container">
      {/* Global Processing Overlay */}
      {isProcessing && mode !== 'upload' && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '2rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', border: '1px solid var(--border)' }}>
            <div className="loader"></div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{processingMessage}</h2>
          </div>
        </div>
      )}

      {/* Header */}
      {mode !== 'configure_crops' && mode !== 'correction' && (
        <header className="header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {mode === 'setup' && (
              <button className="btn-icon" onClick={handleBack} style={{ marginRight: '0.5rem' }} disabled={isProcessing}>
                <ChevronLeft />
              </button>
            )}
            <div style={{ background: 'var(--accent)', color: 'white', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <FileText size={20} />
            </div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Correcció App</h1>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className="main-content">

        {/* Session restore prompt */}
        {showRestorePrompt && mode === 'upload' && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 100
          }}>
            <div style={{
              background: 'var(--bg-secondary)', borderRadius: '1rem', padding: '2rem',
              maxWidth: '420px', width: '90%', border: '1px solid var(--border)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.4)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <RefreshCw size={24} color="var(--accent)" />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Sessió guardada trobada</h2>
              </div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                Hi ha una sessió de correcció guardada amb <strong style={{ color: 'var(--text-primary)' }}>{savedState?.exercises.length} exercicis</strong> i <strong style={{ color: 'var(--text-primary)' }}>{savedState?.students.length} alumnes</strong>. Vols continuar on ho vas deixar?
              </p>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={handleRestoreSession}
                >
                  Continuar sessió
                </button>
                <button
                  className="btn"
                  style={{ flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
                  onClick={handleNewSession}
                >
                  Nova sessió
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload Overlay */}
        {mode === 'upload' && (
          <div className="upload-overlay">
            <div className="upload-box">
              <Upload size={48} color="var(--accent)" style={{ marginBottom: '1rem' }} />
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Upload Exam PDF</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                {pendingModeAfterPDF === 'correction'
                  ? 'Torna a carregar el PDF per restaurar la sessió guardada.'
                  : 'Drag and drop your combined PDF file containing all student exams, or click to browse.'}
              </p>
              <label className={`btn btn-primary ${isProcessing ? 'disabled' : ''}`} style={{ cursor: 'pointer', padding: '0.75rem 1.5rem', fontSize: '1.1rem' }}>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                  disabled={isProcessing}
                />
                {isProcessing ? 'Loading PDF...' : 'Select PDF File'}
              </label>
              {pendingModeAfterPDF === 'correction' && (
                <button
                  onClick={() => { setPendingModeAfterPDF(null); handleNewSession(); }}
                  style={{ marginTop: '1rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem', textDecoration: 'underline' }}
                >
                  Cancel·lar i iniciar nova sessió
                </button>
              )}
            </div>
          </div>
        )}

        {/* Setup Mode */}
        {mode === 'setup' && (
          <div className="workspace" style={{ flex: 1, overflow: 'auto' }}>
            <div className="upload-box" style={{ textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <Settings size={28} color="var(--accent)" />
                <h2 style={{ fontSize: '1.5rem' }}>Document Configuration</h2>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Pages per Exam</label>
                <input
                  type="number"
                  min={1}
                  value={pagesPerExam}
                  onChange={(e) => setPagesPerExam(e.target.value === '' ? '' : parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '1rem'
                  }}
                />
                <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  We detected {numPages || '?'} pages. This means there are {numPages && typeof pagesPerExam === 'number' && pagesPerExam > 0 ? Math.floor(numPages / pagesPerExam) : '?'} student exams.
                </p>
              </div>

              <button
                className={`btn btn-primary ${typeof pagesPerExam !== 'number' || pagesPerExam < 1 ? 'disabled' : ''}`}
                style={{ width: '100%' }}
                onClick={startConfiguration}
                disabled={typeof pagesPerExam !== 'number' || pagesPerExam < 1}
              >
                Next: Define Exercises (Retalls)
              </button>
            </div>
          </div>
        )}

        {/* Page Organizer Mode */}
        {mode === 'organize_pages' && pdfDoc && (
          <PageOrganizer
            pdfDoc={pdfDoc}
            initialGroups={students}
            pagesPerExam={typeof pagesPerExam === 'number' ? pagesPerExam : 1}
            debugLogs={debugLogs}
            onBack={handleBack}
            onConfirm={(confirmedGroups) => {
              setStudents(confirmedGroups);
              setMode('configure_crops');
            }}
          />
        )}

        {/* Configuration Mode */}
        {mode === 'configure_crops' && pdfDoc && (
          <TemplateDefiner
            pdfDoc={pdfDoc}
            pagesPerExam={typeof pagesPerExam === 'number' ? pagesPerExam : 1}
            initialExercises={exercises}
            onBack={handleBack}
            onComplete={async (definedExercises: ExerciseDef[]) => {
              setExercises(definedExercises);
              if (!pdfDoc) return;

              const qrRegion = definedExercises.find(ex => ex.type === 'qr_code') as any;
              const ocrRegion = definedExercises.find(ex => ex.type === 'ocr_name') as any;

              if (!qrRegion && !ocrRegion) {
                // Students already have correct pageIndexes from the organizer — nothing to do
                setMode('correction');
                return;
              }

              setIsProcessing(true);
              setDebugLogs([]);

              try {
                const updatedStudents = [...students];

                if (qrRegion) {
                  // === QR CODE PATH: re-group from scratch using QR ===
                  const { scanQRCode } = await import('./utils/qrUtils');
                  const scannedGroups: Record<string, { pageNum: number, absPage: number }[]> = {};
                  let maxPageFound = typeof pagesPerExam === 'number' ? pagesPerExam : 1;

                  for (let i = 1; i <= pdfDoc.numPages; i++) {
                    setProcessingMessage(`Escanejant QR... Pàgina ${i} de ${pdfDoc.numPages}`);
                    await new Promise(r => setTimeout(r, 10));
                    const qr = await scanQRCode(pdfDoc, i, qrRegion);
                    if (qr && qr.studentId) {
                      addLog(`P${i}: QR detectat → ${qr.studentId} pàg.${qr.pageNum}`);
                      if (!scannedGroups[qr.studentId]) scannedGroups[qr.studentId] = [];
                      scannedGroups[qr.studentId].push({ pageNum: qr.pageNum, absPage: i });
                      if (qr.pageNum > maxPageFound) maxPageFound = qr.pageNum;
                    } else {
                      addLog(`P${i}: cap QR`);
                    }
                  }

                  const foundIds = Object.keys(scannedGroups);
                  if (foundIds.length > 0) {
                    const qrStudents = foundIds.map(sId => {
                      const pages = scannedGroups[sId].sort((a, b) => a.pageNum - b.pageNum);
                      const pageIndexes = new Array(maxPageFound).fill(-1);
                      pages.forEach(p => { if (p.pageNum >= 1 && p.pageNum <= maxPageFound) pageIndexes[p.pageNum - 1] = p.absPage; });
                      return { id: sId, name: sId, pageIndexes };
                    });
                    setStudents(qrStudents);
                    setPagesPerExam(maxPageFound);
                  }
                  // If no QR found, keep organizer groups as-is
                } else if (ocrRegion) {
                  // === OCR PATH: update names using OCR on confirmed groups ===
                  const safePages = typeof pagesPerExam === 'number' ? pagesPerExam : 1;
                  setProcessingMessage('Carregant OCR...');
                  const { extractTextFromRegion } = await import('./utils/ocrUtils');

                  for (let i = 0; i < updatedStudents.length; i++) {
                    setProcessingMessage(`OCR alumne ${i + 1} de ${updatedStudents.length}...`);
                    try {
                      const pIdxs = updatedStudents[i].pageIndexes;
                      const pageForOcr = pIdxs[Math.min(ocrRegion.pageIndex, pIdxs.length - 1)] ?? pIdxs[0];
                      addLog(`Alumne ${i + 1}: OCR a pàg. absoluta ${pageForOcr}`);
                      const extracted = await extractTextFromRegion(pdfDoc, pageForOcr, ocrRegion);
                      addLog(`  → text extret: "${extracted}"`);
                      if (extracted && extracted.trim().length > 0) {
                        updatedStudents[i] = { ...updatedStudents[i], name: extracted.trim() };
                      } else {
                        addLog(`  → OCR buit, mantenint "${updatedStudents[i].name}"`);
                      }
                    } catch (err: any) {
                      addLog(`  → Error OCR: ${err?.message || err}`);
                    }
                    await new Promise(r => setTimeout(r, safePages > 1 ? 10 : 0));
                  }
                  setStudents(updatedStudents);
                }

                setMode('correction');
              } catch (err) {
                console.error('Error processant alumnes:', err);
                alert("S'ha produït un error. Comprova la consola per més detalls.");
              } finally {
                setIsProcessing(false);
                setProcessingMessage('Carregant...');
              }
            }}
          />
        )}

        {/* Correction Mode */}
        {mode === 'correction' && pdfDoc && (
          <CorrectionView
            pdfDoc={pdfDoc}
            students={students}
            exercises={exercises}
            annotations={annotations}
            rubricCounts={rubricCounts}
            onBack={handleBack}
            onUpdateAnnotations={handleUpdateAnnotations}
            onUpdateRubricCounts={(studentId, exerciseId, itemId, delta) => {
              setRubricCounts(prev => {
                const cur = prev?.[studentId]?.[exerciseId]?.[itemId] ?? 0;
                const next = Math.max(0, cur + delta);
                return {
                  ...prev,
                  [studentId]: {
                    ...prev?.[studentId],
                    [exerciseId]: { ...prev?.[studentId]?.[exerciseId], [itemId]: next }
                  }
                };
              });
            }}
            onUpdateExercise={(updatedEx) => {
              setExercises(prev => prev.map(ex => ex.id === updatedEx.id ? updatedEx : ex));
            }}
          />
        )}

      </main>
    </div>
  );
}

export default App;
