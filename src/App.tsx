import { useState, useEffect } from 'react';
import { Upload, FileText, Settings, ChevronLeft, RefreshCw } from 'lucide-react';
import type { Student, ExerciseDef, AnnotationStore, RubricCountStore } from './types';
import { loadPDF, type PDFDocumentProxy } from './utils/pdfUtils';
import TemplateDefiner from './components/TemplateDefiner';
import CorrectionView from './components/CorrectionView';
import PageOrganizer from './components/PageOrganizer';
import ResultsView from './components/ResultsView';

type AppMode = 'upload' | 'setup' | 'organize_pages' | 'configure_crops' | 'correction' | 'results';

const STORAGE_KEY = 'correccio_app_state';

// Helper for fuzzy matching
function getLevenshteinDistance(a: string, b: string): number {
  const tmp = [];
  for (let i = 0; i <= a.length; i++) tmp[i] = [i];
  for (let j = 0; j <= b.length; j++) tmp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

interface PersistedState {
  pagesPerExam: number;
  exercises: ExerciseDef[];
  students: Student[];
  annotations: AnnotationStore;
  rubricCounts: RubricCountStore;
  commentBank: import('./types').AnnotationComment[];
  targetMaxScore: number;
  studentList: string;
  mode: AppMode;
  lastStudentIdx?: number;
  lastExerciseIdx?: number;
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
  const [targetMaxScore, setTargetMaxScore] = useState<number>(savedState?.targetMaxScore ?? 10);
  const [studentList, setStudentList] = useState<string>(savedState?.studentList ?? '');
  const [commentBank, setCommentBank] = useState<import('./types').AnnotationComment[]>(savedState?.commentBank ?? [
    { text: 'Excel·lent!', score: 1, colorMode: 'score' },
    { text: 'Molt bé', score: 0.5, colorMode: 'score' },
    { text: 'Revisa aquest concepte', score: -0.5, colorMode: 'neutral' },
    { text: 'Falta justificar la resposta', score: -1, colorMode: 'neutral' },
  ]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('Processant...');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [pendingModeAfterPDF, setPendingModeAfterPDF] = useState<AppMode | null>(null);

  const addLog = (msg: string) => { console.log('[App]', msg); setDebugLogs(prev => [...prev.slice(-200), msg]); };

  const agentDebugLog = (
    hypothesisId: string,
    location: string,
    message: string,
    data: any = {},
    runId: string = 'initial'
  ) => {
    // #region agent log
    fetch('http://127.0.0.1:7480/ingest/a6df652c-8a3b-4565-80ea-18f2b272eb6e', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '4dc664'
      },
      body: JSON.stringify({
        sessionId: '4dc664',
        runId,
        hypothesisId,
        location,
        message,
        data,
        timestamp: Date.now()
      })
    }).catch(() => { });
    // #endregion
  };

  const [studentIdx, setStudentIdx] = useState<number>(savedState?.lastStudentIdx ?? 0);
  const [exerciseIdx, setExerciseIdx] = useState<number>(savedState?.lastExerciseIdx ?? 0);

  // Persist state whenever key values change
  useEffect(() => {
    if (exercises.length > 0 || students.length > 0 || Object.keys(annotations).length > 0) {
      agentDebugLog(
        'H2_state_persist',
        'src/App.tsx:103',
        'Persisting app state',
        {
          mode,
          pagesPerExam: Number(pagesPerExam) || 1,
          exercises: exercises.length,
          students: students.length,
          annotationsStudents: Object.keys(annotations).length,
          rubricStudents: Object.keys(rubricCounts).length,
          targetMaxScore,
          studentIdx,
          exerciseIdx
        }
      );
      saveState({
        mode,
        pagesPerExam: Number(pagesPerExam) || 1,
        exercises,
        students,
        annotations,
        rubricCounts,
        targetMaxScore,
        studentList,
        commentBank,
        lastStudentIdx: studentIdx,
        lastExerciseIdx: exerciseIdx
      });
    }
  }, [mode, pagesPerExam, exercises, students, annotations, rubricCounts, targetMaxScore, studentList, commentBank, studentIdx, exerciseIdx]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') {
        alert("El fitxer seleccionat no és un PDF.");
        return;
      }
      setPdfFile(file);
      setIsProcessing(true);
      setProcessingMessage('Carregant PDF...');

      try {
        console.log('[App] Starting PDF load...');
        const doc = await loadPDF(file);
        console.log('[App] PDF loaded, pages:', doc.numPages);
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        agentDebugLog(
          'H1_pdf_load',
          'src/App.tsx:133',
          'PDF loaded successfully',
          {
            numPages: doc.numPages,
            pendingModeAfterPDF
          }
        );
        if (pendingModeAfterPDF) {
          setMode(pendingModeAfterPDF);
          setPendingModeAfterPDF(null);
        } else {
          setMode('setup');
        }
        setShowRestorePrompt(false);
      } catch (err: any) {
        console.error("[App] Error loading PDF", err);
        alert(`Error carregant el PDF: ${err?.message || 'Error desconegut'}\n\nComprova que el fitxer no estigui corrupte.`);
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
      {isProcessing && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '2.5rem', borderRadius: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
            <div className="loader" style={{ width: '40px', height: '40px', borderWidth: '4px' }}></div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>{processingMessage}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Això pot trigar uns segons depenent de la mida del fitxer.</p>
            </div>
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
                <div style={{ marginTop: '1.5rem', width: '100%', display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={() => { setPendingModeAfterPDF(null); handleNewSession(); }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem', textDecoration: 'underline' }}
                  >
                    Cancel·lar i iniciar nova sessió
                  </button>
                </div>
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

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Llista d'alumnes (Experimental, un per línia)
                </label>
                <textarea
                  placeholder="Joan Garcia&#10;Maria Lopez..."
                  value={studentList}
                  onChange={(e) => setStudentList(e.target.value)}
                  style={{
                    width: '100%',
                    height: '120px',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
                <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Si poses la llista, l'OCR intentarà associar el que llegeixi al nom més proper.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  className={`btn btn-primary ${typeof pagesPerExam !== 'number' || pagesPerExam < 1 ? 'disabled' : ''}`}
                  style={{ flex: 1 }}
                  onClick={startConfiguration}
                  disabled={typeof pagesPerExam !== 'number' || pagesPerExam < 1}
                >
                  Next: Define Exercises (Retalls)
                </button>
              </div>
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

              // QR is strictly disabled for now to prevent ID loss
              const ocrRegion = definedExercises.find(ex => ex.type === 'ocr_name') as any;

              if (!ocrRegion) {
                // Students already have correct pageIndexes from the organizer — nothing to do
                setMode('correction');
                return;
              }

              // Check if we already have meaningful names (not the default 'Alumne X')
              const hasMeaningfulNames = students.some(s => s.name && !s.name.startsWith('Alumne '));
              if (hasMeaningfulNames) {
                const reRun = window.confirm("Sembla que ja tens els noms dels alumnes. Vols tornar a passar l'OCR/QR per actualitzar-los?");
                if (!reRun) {
                  setMode('correction');
                  return;
                }
              }

              setIsProcessing(true);
              setDebugLogs([]);

              try {
                agentDebugLog(
                  'H3_ocr_names',
                  'src/App.tsx:435',
                  'Starting OCR name extraction',
                  {
                    students: students.length,
                    exercises: definedExercises.length,
                    hasOcrRegion: !!ocrRegion
                  }
                );
                const updatedStudents = [...students];

                if (false) {
                  // === QR CODE PATH (DISABLED) ===
                } else if (ocrRegion) {
                  // === OCR PATH: update names using OCR on confirmed groups ===
                  const safePages = typeof pagesPerExam === 'number' ? pagesPerExam : 1;
                  setProcessingMessage('Carregant OCR...');
                  const { extractTextFromRegion, extractImageFromRegion } = await import('./utils/ocrUtils');

                  const knownNames = studentList.split('\n').map(n => n.trim()).filter(n => n.length > 0);

                  for (let i = 0; i < updatedStudents.length; i++) {
                    setProcessingMessage(`OCR alumne ${i + 1} de ${updatedStudents.length}...`);
                    try {
                      const pIdxs = updatedStudents[i].pageIndexes;
                      const pageForOcr = pIdxs[Math.min(ocrRegion.pageIndex, pIdxs.length - 1)] ?? pIdxs[0];
                      addLog(`Alumne ${i + 1}: OCR a pàg. absoluta ${pageForOcr}`);

                      // Visual Snippet (Experimental)
                      const cropUrl = await extractImageFromRegion(pdfDoc, pageForOcr, ocrRegion);

                      const extracted = await extractTextFromRegion(pdfDoc, pageForOcr, ocrRegion);
                      addLog(`  → text extret: "${extracted}"`);

                      let finalName = extracted.trim();
                      let originalOcrName = finalName;

                      // Fuzzy Matching (Experimental)
                      if (knownNames.length > 0 && finalName.length > 2) {
                        let bestMatch = '';
                        let minDistance = 999;

                        for (const kn of knownNames) {
                          const dist = getLevenshteinDistance(finalName.toLowerCase(), kn.toLowerCase());
                          if (dist < minDistance) {
                            minDistance = dist;
                            bestMatch = kn;
                          }
                        }

                        // Only apply if the match is reasonably close (distance < 40% of name length)
                        if (minDistance < bestMatch.length * 0.4) {
                          addLog(`  → Fuzzy Match: "${finalName}" -> "${bestMatch}" (dist: ${minDistance})`);
                          finalName = bestMatch;
                        }
                      }

                      if (finalName || cropUrl) {
                        updatedStudents[i] = {
                          ...updatedStudents[i],
                          name: finalName || updatedStudents[i].name,
                          originalOcrName,
                          nameCropUrl: cropUrl
                        };
                      }
                      agentDebugLog(
                        'H3_ocr_names',
                        'src/App.tsx:447',
                        'OCR processed student',
                        {
                          studentIndex: i,
                          pageForOcr,
                          extracted,
                          finalName,
                          hadCropUrl: !!cropUrl
                        }
                      );
                    } catch (err: any) {
                      addLog(`  → Error OCR: ${err?.message || err}`);
                      agentDebugLog(
                        'H3_ocr_names',
                        'src/App.tsx:491',
                        'OCR error for student',
                        {
                          studentIndex: i,
                          errorMessage: err?.message || String(err)
                        }
                      );
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
            commentBank={commentBank}
            targetMaxScore={targetMaxScore}
            onUpdateCommentBank={setCommentBank}
            onUpdateTargetMaxScore={setTargetMaxScore}
            onBack={handleBack}
            onFinish={() => setMode('results')}
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
            studentIdx={studentIdx}
            exerciseIdx={exerciseIdx}
            onUpdateStudentIdx={setStudentIdx}
            onUpdateExerciseIdx={setExerciseIdx}
          />
        )}

        {mode === 'results' && pdfDoc && (
          <ResultsView
            pdfDoc={pdfDoc}
            students={students}
            exercises={exercises}
            annotations={annotations}
            rubricCounts={rubricCounts}
            targetMaxScore={targetMaxScore}
            onUpdateStudents={setStudents}
            onBack={() => setMode('correction')}
          />
        )}

      </main>
    </div>
  );
}

export default App;
