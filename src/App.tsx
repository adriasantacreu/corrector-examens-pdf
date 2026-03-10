import { useState, useEffect } from 'react';
import { Upload, FileText, Settings, ChevronLeft, RefreshCw, Moon, Sun, ChevronRight, Clock, Trash2, Globe, Cloud, CheckCircle2, AlertCircle, UserPlus, LogOut, UserCheck, MailQuestion, CheckCircle, List, X, ClipboardPaste, Send, UserMinus, Users } from 'lucide-react';
import type { Student, ExerciseDef, AnnotationStore, RubricCountStore } from './types';
import { loadPDF, type PDFDocumentProxy } from './utils/pdfUtils';
import TemplateDefiner from './components/TemplateDefiner';
import CorrectionView from './components/CorrectionView';
import PageOrganizer from './components/PageOrganizer';
import ResultsView from './components/ResultsView';
import FlowGradingLogo from './components/FlowGradingLogo';
import HandwrittenTitle from './components/HandwrittenTitle';
import Highlighter from './components/Highlighter';
import { fetchClassroomStudents, matchClassroomStudents } from './utils/classroomUtils';
import { storePDFLocal, getPDFLocal } from './utils/dbUtils';

type AppMode = 'upload' | 'setup' | 'organize_pages' | 'configure_crops' | 'correction' | 'results';

const SESSION_PREFIX = 'flowgrading_session_';
const GLOBAL_KEY = 'flowgrading_global';

function getLevenshteinDistance(a: string, b: string): number {
  const tmp = [];
  for (let i = 0; i <= a.length; i++) tmp[i] = [i];
  for (let j = 0; j <= b.length; j++) tmp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(tmp[i - 1][j] + 1, tmp[i][j - 1] + 1, tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return tmp[a.length][b.length];
}

function calculateProgress(students: Student[], exercises: ExerciseDef[], annotations: AnnotationStore): number {
  if (!students.length || !exercises.length) return 0;
  const gradable = exercises.filter(ex => ex.type === 'crop' || ex.type === 'pages');
  if (!gradable.length) return 0;
  
  let completed = 0;
  students.forEach(s => {
    gradable.forEach(ex => {
      const anns = annotations[s.id]?.[ex.id] || [];
      if (anns.length > 0) completed++;
    });
  });
  return Math.round((completed / (students.length * gradable.length)) * 100);
}

function App() {
  const globalSaved = JSON.parse(localStorage.getItem(GLOBAL_KEY) || '{}');
  const [mode, setMode] = useState<AppMode>('upload');
  const [theme, setTheme] = useState<'light' | 'dark'>(globalSaved.theme || 'light');
  const [currentFileName, setCurrentFileName] = useState<string | null>(globalSaved.lastActiveFileName || null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  
  const [tempPagesPerExam, setTempPagesPerExam] = useState<string>('1');
  const [tempNumStudents, setTempNumStudents] = useState<string>('0');
  
  const [pagesPerExam, setPagesPerExam] = useState<number | ''>(1);
  const [numStudents, setNumStudents] = useState<number>(0);
  const [students, setStudents] = useState<Student[]>([]);
  const [exercises, setExercises] = useState<ExerciseDef[]>([]);
  const [annotations, setAnnotations] = useState<AnnotationStore>({});
  const [rubricCounts, setRubricCounts] = useState<RubricCountStore>({});
  const [targetMaxScore, setTargetMaxScore] = useState<number>(10);
  const [studentList, setStudentList] = useState<string>('');
  const [commentBank, setCommentBank] = useState<import('./types').AnnotationComment[]>([
    { text: 'Excel·lent!', score: 1, colorMode: 'score' },
    { text: 'Molt bé', score: 0.5, colorMode: 'score' },
    { text: 'Revisa aquest concepte', score: -0.5, colorMode: 'neutral' },
    { text: 'Falta justificar la resposta', score: -1, colorMode: 'neutral' },
  ]);
  const [studentIdx, setStudentIdx] = useState<number>(0);
  const [exerciseIdx, setExerciseIdx] = useState<number>(0);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [accessToken, setAccessToken] = useState<string | null>(globalSaved.accessToken || null);
  const [userEmail, setUserEmail] = useState<string | null>(globalSaved.userEmail || null);
  const [userPicture, setUserPicture] = useState<string | null>(globalSaved.userPicture || null);
  const [courses, setCourses] = useState<any[]>([]);
  const [classroomStudents, setClassroomStudents] = useState<any[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [studentEmailMap, setStudentEmailMap] = useState<Record<string, string>>({});
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [ocrCompleted, setOcrCompleted] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(GLOBAL_KEY, JSON.stringify({ 
        theme, accessToken, userEmail, userPicture, 
        lastActiveFileName: currentFileName 
    }));
  }, [theme, accessToken, userEmail, userPicture, currentFileName]);

  const loadSessions = async () => {
    const localSessions = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(SESSION_PREFIX)) {
        try {
          const content = JSON.parse(localStorage.getItem(k)!);
          localSessions.push({ ...content, isCloud: false });
        } catch(e) {}
      }
    }

    if (accessToken) {
      try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=mimeType='application/json' and parents in 'appDataFolder' and name contains '.json'&spaces=appDataFolder&fields=files(id,name,modifiedTime)`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await res.json();
        const files = data.files || [];
        const cloudSessions = [];
        for (const file of files) {
          try {
            const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const content = await contentRes.json();
            cloudSessions.push({ ...content, isCloud: true, lastModified: file.modifiedTime });
          } catch(e) {}
        }
        
        const combined = [...localSessions];
        cloudSessions.forEach(cs => {
          const idx = combined.findIndex(ls => ls.fileName === cs.fileName);
          if (idx === -1) combined.push(cs);
          else if (new Date(cs.lastModified).getTime() > new Date(combined[idx].lastModified).getTime()) {
            combined[idx] = cs;
          }
        });
        setRecentSessions(combined.sort((a,b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()));
      } catch (e) {
        setRecentSessions(localSessions.sort((a,b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()));
      }
    } else {
      setRecentSessions(localSessions.sort((a,b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()));
    }
  };

  useEffect(() => { loadSessions(); }, [accessToken]);

  useEffect(() => {
    if (globalSaved.lastActiveFileName) {
        getPDFLocal(globalSaved.lastActiveFileName).then(file => {
            if (file) loadSessionFromFile(file);
        });
    }
  }, []);

  useEffect(() => {
    if (accessToken) {
      fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { 'Authorization': `Bearer ${accessToken}` } })
        .then(r => r.json())
        .then(data => {
          setUserEmail(data.email);
          setUserPicture(data.picture);
        });
      fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', { headers: { 'Authorization': `Bearer ${accessToken}` } })
        .then(r => r.json())
        .then(data => setCourses(data.courses || []));
    }
  }, [accessToken]);

  const saveToDrive = async (fileName: string, data: any) => {
    if (!accessToken) return;
    try {
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${fileName}.json' and parents in 'appDataFolder'&spaces=appDataFolder`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const searchData = await searchRes.json();
      const existingFile = searchData.files && searchData.files[0];
      
      const boundary = '-------314159265358979323846';
      const metadata = { name: `${fileName}.json`, parents: ['appDataFolder'] };
      const multipartRequestBody = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;
      
      await fetch(existingFile ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: existingFile ? 'PATCH' : 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartRequestBody
      });
    } catch (err) {}
  };

  useEffect(() => {
    if (currentFileName && mode !== 'upload') {
      const state = { 
        fileName: currentFileName, mode, pagesPerExam, exercises, students, annotations, rubricCounts, targetMaxScore, studentList, commentBank, lastStudentIdx: studentIdx, lastExerciseIdx: exerciseIdx, lastModified: new Date().toISOString(), studentEmailMap, progress: calculateProgress(students, exercises, annotations),
        classroomStudents, ocrCompleted 
      };
      localStorage.setItem(SESSION_PREFIX + currentFileName, JSON.stringify(state));
      const timeout = setTimeout(() => saveToDrive(currentFileName, state), 3000);
      return () => clearTimeout(timeout);
    }
  }, [mode, pagesPerExam, exercises, students, annotations, rubricCounts, targetMaxScore, studentList, commentBank, studentIdx, exerciseIdx, classroomStudents, ocrCompleted]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;
    loadSessionFromFile(file);
  };

  const loadSessionFromFile = async (file: File) => {
    setIsProcessing(true); setProcessingMessage('Carregant PDF...');
    const saved = JSON.parse(localStorage.getItem(SESSION_PREFIX + file.name) || 'null');
    if (saved) {
      setPagesPerExam(saved.pagesPerExam); setExercises(saved.exercises); setStudents(saved.students); setAnnotations(saved.annotations); setRubricCounts(saved.rubricCounts); setTargetMaxScore(saved.targetMaxScore); setStudentList(saved.studentList); setCommentBank(saved.commentBank); setStudentIdx(saved.lastStudentIdx || 0); setExerciseIdx(saved.lastExerciseIdx || 0); setStudentEmailMap(saved.studentEmailMap || {});
      setClassroomStudents(saved.classroomStudents || []);
      setOcrCompleted(saved.ocrCompleted || false);
      setTempPagesPerExam(String(saved.pagesPerExam));
    }
    try {
      const doc = await loadPDF(file); setPdfDoc(doc); setNumPages(doc.numPages);
      const calcStudents = saved ? (saved.students.length || Math.floor(doc.numPages / (saved.pagesPerExam || 1))) : doc.numPages;
      setNumStudents(calcStudents);
      setTempNumStudents(String(calcStudents));
      if (!saved) setTempPagesPerExam('1');
      
      setMode(saved?.mode || 'setup'); setCurrentFileName(file.name);
      storePDFLocal(file.name, file).catch(console.error);
    } catch { alert("Error carregant PDF"); } finally { setIsProcessing(false); }
  };

  const handleSelectSession = async (s: any) => {
    const f = await getPDFLocal(s.fileName);
    if (f) {
      loadSessionFromFile(f);
    } else {
      setCurrentFileName(s.fileName); 
      alert("Si us plau, selecciona el fitxer '" + s.fileName + "' de nou per carregar-lo.");
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file && file.name === s.fileName) loadSessionFromFile(file);
        else if (file) alert("El fitxer seleccionat no coincideix amb el nom de la sessió.");
      };
      input.click();
    }
  };

  const importClassroom = async () => {
    if (!accessToken || !selectedCourseId) return;
    setIsProcessing(true); setProcessingMessage('Sincronitzant amb Classroom...');
    try {
      const cs = await fetchClassroomStudents(accessToken, selectedCourseId);
      if (!cs) {
        throw new Error("No students returned");
      }
      setClassroomStudents(cs);
      const names = cs.map((c: any) => c.profile?.name?.fullName || c.profile?.emailAddress || 'Desconegut');
      setStudentList(Array.from(new Set([...studentList.split('\n'), ...names])).filter(n => n && n.trim()).join('\n'));
      const newMap = { ...studentEmailMap }; 
      cs.forEach((c: any) => { 
        if (c.profile?.name?.fullName) {
          newMap[c.profile.name.fullName] = c.profile.emailAddress; 
        }
      });
      setStudentEmailMap(newMap);
      if (students.length) {
        const { updatedStudents } = matchClassroomStudents(students, cs);
        setStudents(updatedStudents);
      }
    } catch(err) { 
      console.error(err);
      alert("Error sincronitzant amb Classroom. Revisa els permisos."); 
    } finally { setIsProcessing(false); }
  };

  const runOCR = async (customExercises?: ExerciseDef[]) => {
    const targetEx = customExercises || exercises;
    const ocr = targetEx.find(e => e.type === 'ocr_name');
    if (!ocr || !pdfDoc) return;

    setIsProcessing(true);
    setProcessingMessage('Llegint noms amb OCR...');
    const { extractTextFromRegion, extractImageFromRegion } = await import('./utils/ocrUtils');
    const updated = [...students];
    const known = studentList.split('\n').map(n => n.trim()).filter(n => n.length > 0);
    
    for (let i = 0; i < updated.length; i++) {
      setProcessingMessage(`OCR alumne ${i + 1} de ${updated.length}...`);
      try {
        const pIdx = updated[i].pageIndexes[Math.min(ocr.pageIndex, updated[i].pageIndexes.length - 1)] || updated[i].pageIndexes[0];
        const text = await extractTextFromRegion(pdfDoc, pIdx, ocr);
        const crop = await extractImageFromRegion(pdfDoc, pIdx, ocr);
        let name = text.trim();
        if (known.length > 0 && name.length > 2) {
          let best = '', min = 999;
          known.forEach(kn => {
            const d = getLevenshteinDistance(name.toLowerCase(), kn.toLowerCase());
            if (d < min) { min = d; best = kn; }
          });
          if (min < best.length * 0.4) {
            name = best;
            if (studentEmailMap[best]) updated[i].email = studentEmailMap[best];
          }
        }
        updated[i] = { ...updated[i], name: name || updated[i].name, nameCropUrl: crop };
      } catch { }
    }
    setStudents(updated);
    setOcrCompleted(true);
    setIsProcessing(false);
  };

  const handleAuthorize = () => {
    setIsAuthorizing(true);
    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: "89755629853-3i114l0ocgkpv5cla6d86n8ufuammvii.apps.googleusercontent.com",
        scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.profile.emails https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/drive.appdata',
        callback: (r: any) => { if (r.access_token) setAccessToken(r.access_token); setIsAuthorizing(false); }
      });
      client.requestAccessToken();
    } catch(e) { setIsAuthorizing(false); }
  };

  const startConfiguration = async () => {
    if (!pdfDoc) return;
    const safePages = Number(pagesPerExam) || 1;
    const count = Math.floor(pdfDoc.numPages / safePages);
    if (students.length === 0 || students.length !== count) {
      setStudents(Array.from({ length: count }, (_, i) => ({
        id: `student_${i + 1}`, name: `Alumne ${i + 1}`, pageIndexes: Array.from({ length: safePages }, (__, p) => i * safePages + p + 1)
      })));
    }
    setMode('organize_pages');
  };

  const handleBack = () => {
    if (mode === 'setup') { setMode('upload'); setCurrentFileName(null); setPdfDoc(null); }
    else if (mode === 'organize_pages') setMode('setup');
    else if (mode === 'configure_crops') setMode('organize_pages');
    else if (mode === 'correction') setMode('configure_crops');
    else if (mode === 'results') setMode('correction');
  };

  const handleLogout = () => {
    setAccessToken(null);
    setUserEmail(null);
    setUserPicture(null);
    localStorage.removeItem(GLOBAL_KEY);
  };

  const UnifiedHeader = ({ nextAction, nextLabel }: { nextAction?: () => void, nextLabel?: string }) => (
    <header className="header">
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        <button className="btn-icon" onClick={handleBack} title="Enrere" style={{ color: 'var(--text-primary)', padding: '0.5rem', background: 'transparent', border: 'none' }}>
          <ChevronLeft size={28} />
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <FlowGradingLogo size="2.2rem" />
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1.25rem', justifyContent: 'flex-end' }}>
        <button className="btn-icon" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
        {accessToken ? (
          <div style={{ 
            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 1rem', 
            background: 'var(--bg-tertiary)', borderRadius: '2rem', border: '1px solid var(--border)',
            height: '42px'
          }}>
            {userPicture ? (
              <img src={userPicture} alt="User" style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--accent)', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>{userEmail?.[0].toUpperCase()}</div>
            )}
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{userEmail?.split('@')[0]}</span>
            <button onClick={handleLogout} className="btn-icon" style={{ padding: '2px' }}><LogOut size={14} color="var(--danger)" /></button>
          </div>
        ) : (
          <button className="btn-google" onClick={handleAuthorize}>
            <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="G" style={{ width: '18px' }} />
            <span style={{ fontWeight: 700 }}>Connecta</span>
          </button>
        )}
        {nextAction && (
          <button className="btn btn-primary" onClick={nextAction}>
            {nextLabel || 'Continuar'} <ChevronRight size={18} />
          </button>
        )}
      </div>
    </header>
  );

  return (
    <div className={`app-container ${mode === 'upload' ? 'home-page' : ''}`} style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {isProcessing && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}><div className="card" style={{ textAlign: 'center', minWidth: '300px' }}><div className="loader" style={{ margin: '0 auto 1.5rem', width: '40px', height: '40px' }}></div><h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{processingMessage}</h2></div></div>}
      
      {mode === 'upload' && (
        <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', gap: '1.25rem', alignItems: 'center', zIndex: 10 }}>
          <button className="btn-icon" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          {accessToken ? (
            <div style={{ 
              display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 1rem', 
              background: 'var(--bg-tertiary)', borderRadius: '2rem', border: '1px solid var(--border)',
              height: '42px'
            }}>
              {userPicture ? <img src={userPicture} alt="User" style={{ width: '28px', height: '28px', borderRadius: '50%' }} /> : <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>{userEmail?.[0].toUpperCase()}</div>}
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{userEmail?.split('@')[0]}</span>
              <button onClick={handleLogout} className="btn-icon" style={{ padding: '2px' }}><LogOut size={14} color="var(--danger)" /></button>
            </div>
          ) : (
            <button className="btn-google" onClick={handleAuthorize}>
              <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="G" style={{ width: '18px' }} />
              <span style={{ fontWeight: 700 }}>Connecta amb Google</span>
            </button>
          )}
        </div>
      )}

      {mode !== 'upload' && mode !== 'configure_crops' && mode !== 'correction' && mode !== 'organize_pages' && mode !== 'results' && (
        <UnifiedHeader nextAction={mode === 'setup' ? startConfiguration : undefined} />
      )}

      <main className="main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {mode === 'upload' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '15vh 2rem 4rem', overflowY: 'auto' }}>
            <div style={{ marginBottom: '8rem', transform: 'rotate(-4.5deg)', flexShrink: 0 }}>
              <FlowGradingLogo size="13rem" rotation={-7} extraThick={true} />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center', marginBottom: '4rem', flexShrink: 0 }}>
              <label className="btn btn-primary" style={{ padding: '1.2rem 4rem', fontSize: '1.3rem', height: '56px', borderRadius: '2rem', boxShadow: '0 10px 25px var(--accent-light)' }}>
                <input type="file" accept="application/pdf" onChange={handleFileUpload} style={{ display: 'none' }} />
                <Upload size={26} /> Pujar nou PDF
              </label>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 500 }}>Puja el fitxer combinat amb tots els exàmens per començar.</p>
            </div>
            
            {recentSessions.length > 0 && (
              <div style={{ width: '100%', maxWidth: '1000px', flexShrink: 0 }}>
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}><HandwrittenTitle size="2.4rem" color="purple">Sessions recents</HandwrittenTitle></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                  {recentSessions.map(s => (
                    <div key={s.fileName} className="card" style={{ padding: '1.5rem', cursor: 'pointer', transition: 'transform 0.2s', position: 'relative', border: '1px solid var(--border)' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'} onClick={() => handleSelectSession(s)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.fileName}</span>
                          {s.isCloud && <Cloud size={14} color="var(--accent)" />}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); localStorage.removeItem(SESSION_PREFIX + s.fileName); loadSessions(); }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}><Trash2 size={16} /></button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}><Clock size={14} /> {new Date(s.lastModified).toLocaleDateString()}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{s.progress || 0}% corregit</span>
                        <span>{s.students?.length || 0} alumnes</span>
                      </div>
                      <div className="progress-bar-container"><div className="progress-bar-fill" style={{ width: `${s.progress || 0}%` }}></div></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'setup' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '3rem 4rem' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '3.5rem' }}>
                <HandwrittenTitle size="3rem" color="green">Configuració de l'examen</HandwrittenTitle>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem', marginBottom: '3.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="card" style={{ flex: 1, background: 'var(--bg-tertiary)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <label style={{ display: 'block', fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>Pàgines i alumnes</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>Pàgines/Examen</span>
                        <input 
                          type="text" 
                          value={tempPagesPerExam} 
                          onChange={e => setTempPagesPerExam(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const val = parseInt(tempPagesPerExam) || 1;
                              setPagesPerExam(val); setNumStudents(Math.floor(numPages / val));
                              setTempNumStudents(String(Math.floor(numPages / val)));
                            }
                          }}
                          onBlur={() => {
                            const val = parseInt(tempPagesPerExam) || 1;
                            setPagesPerExam(val); setNumStudents(Math.floor(numPages / val));
                            setTempNumStudents(String(Math.floor(numPages / val)));
                          }}
                          style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', fontSize: '1.25rem', fontWeight: 800, textAlign: 'center' }} 
                        />
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)', marginTop: '1rem' }}>O</div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>Total alumnes</span>
                        <input 
                          type="text" 
                          value={tempNumStudents} 
                          onChange={e => setTempNumStudents(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const val = parseInt(tempNumStudents) || 1;
                              setNumStudents(val); setPagesPerExam(Math.floor(numPages / val));
                              setTempPagesPerExam(String(Math.floor(numPages / val)));
                            }
                          }}
                          onBlur={() => {
                            const val = parseInt(tempNumStudents) || 1;
                            setNumStudents(val); setPagesPerExam(Math.floor(numPages / val));
                            setTempPagesPerExam(String(Math.floor(numPages / val)));
                          }}
                          style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', fontSize: '1.25rem', fontWeight: 800, textAlign: 'center' }} 
                        />
                      </div>
                    </div>
                    <div style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '0.4rem', border: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                      Total PDF: <strong>{numPages}</strong> pàgines
                    </div>
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="card" style={{ flex: 1, background: 'var(--bg-tertiary)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <label style={{ display: 'block', fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>Carrega el teu llistat</label>
                    {accessToken ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <select 
                            value={selectedCourseId}
                            onChange={e => setSelectedCourseId(e.target.value)} 
                            style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--accent)', color: 'var(--accent)', fontWeight: 700, background: 'var(--bg-secondary)' }}
                          >
                            <option value="" disabled>Selecciona un curs Classroom...</option>
                            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <button className="btn btn-primary" onClick={importClassroom} disabled={!selectedCourseId} style={{ padding: '0.75rem' }} title="Sincronitzar ara">
                            <RefreshCw size={18} />
                          </button>
                        </div>
                        <button className="btn btn-secondary" style={{ width: '100%', fontSize: '0.85rem' }} onClick={() => setShowPasteArea(true)}>
                          <ClipboardPaste size={16} /> O enganxar llista manual
                        </button>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '0.5rem' }}>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Connecta amb Google per importar alumnes de Classroom.</p>
                        <button className="btn-google" onClick={handleAuthorize} style={{ width: '100%', justifyContent: 'center' }}>Connecta amb Google</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {showPasteArea && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                  <div className="card" style={{ maxWidth: '500px', width: '90%', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <HandwrittenTitle size="1.8rem" color="red" noMargin={true}>Enganxar llista</HandwrittenTitle>
                      <button className="btn-icon" onClick={() => setShowPasteArea(false)}><X size={20} /></button>
                    </div>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Escriu o enganxa els noms dels alumnes, un per cada línia.</p>
                    <textarea value={studentList} onChange={(e) => setStudentList(e.target.value)} style={{ width: '100%', height: '300px', padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--border)', fontSize: '1rem' }} />
                    <button className="btn btn-primary" onClick={() => setShowPasteArea(false)}>Guardar llista</button>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingLeft: '1rem' }}>
                <HandwrittenTitle size="2.2rem" color="red">Llistat d'alumnes importats</HandwrittenTitle>
                {(classroomStudents.length > 0 || studentList.trim()) && (
                  <button className="btn btn-secondary" style={{ color: 'var(--danger)', fontSize: '0.8rem', padding: '0.4rem 1rem' }} onClick={() => {
                    if (window.confirm("Vols eliminar TOTS els alumnes del llistat?")) {
                      setClassroomStudents([]);
                      setStudentList('');
                    }
                  }}>
                    <UserMinus size={14} /> Eliminar-ho tot
                  </button>
                )}
              </div>
              <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: '1.5rem' }}>
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>#</th>
                      <th>Nom de l'alumne</th>
                      <th>Email / Classroom</th>
                      <th style={{ width: '60px', textAlign: 'center' }}>Acció</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classroomStudents.length > 0 ? (
                      classroomStudents.map((cs, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 800, color: 'var(--text-secondary)' }}>{i+1}</td>
                          <td style={{ fontWeight: 700 }}>{cs.profile?.name?.fullName || 'Desconegut'}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontWeight: 600, fontSize: '0.85rem' }}>
                              <UserCheck size={14} /> {cs.profile?.emailAddress}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button className="btn-icon" style={{ color: 'var(--danger)', padding: '4px' }} onClick={() => {
                              setClassroomStudents(prev => prev.filter((_, idx) => idx !== i));
                            }}>
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : studentList.trim() ? (
                      studentList.split('\n').filter(n => n.trim()).map((name, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 800, color: 'var(--text-secondary)' }}>{i+1}</td>
                          <td style={{ fontWeight: 700 }}>{name}</td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>Introduït manualment</td>
                          <td style={{ textAlign: 'center' }}>
                            <button className="btn-icon" style={{ color: 'var(--danger)', padding: '4px' }} onClick={() => {
                              const lines = studentList.split('\n').filter(n => n.trim());
                              lines.splice(i, 1);
                              setStudentList(lines.join('\n'));
                            }}>
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                            <Users size={32} style={{ opacity: 0.3 }} />
                            <p>Encara no has carregat cap alumne. Sincronitza amb Classroom o enganxa una llista.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {mode === 'organize_pages' && pdfDoc && <PageOrganizer pdfDoc={pdfDoc} initialGroups={students} pagesPerExam={Number(pagesPerExam) || 1} onBack={handleBack} onConfirm={(g) => { setStudents(g); setMode('configure_crops'); }} theme={theme} onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} accessToken={accessToken} userEmail={userEmail} userPicture={userPicture} onAuthorize={handleAuthorize} onLogout={handleLogout} />}
        {mode === 'configure_crops' && pdfDoc && (
          <TemplateDefiner 
            pdfDoc={pdfDoc} pagesPerExam={Number(pagesPerExam) || 1} initialExercises={exercises} onBack={handleBack} 
            onComplete={async (ex) => {
                setExercises(ex); 
                if (ocrCompleted) { setMode('correction'); return; }
                await runOCR(ex);
                setMode('correction');
            }} 
            theme={theme} onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} 
            accessToken={accessToken} userEmail={userEmail} userPicture={userPicture} onAuthorize={handleAuthorize} onLogout={handleLogout} 
            onRunOCR={() => runOCR()} ocrCompleted={ocrCompleted}
          />
        )}
        
        {mode === 'correction' && pdfDoc && (
          <CorrectionView 
            pdfDoc={pdfDoc} students={students} exercises={exercises} annotations={annotations} rubricCounts={rubricCounts} 
            commentBank={commentBank} targetMaxScore={targetMaxScore} onUpdateCommentBank={setCommentBank} onUpdateTargetMaxScore={setTargetMaxScore} 
            onBack={handleBack} onFinish={() => setMode('results')} 
            onUpdateAnnotations={(s, e, a) => setAnnotations(prev => ({ ...prev, [s]: { ...prev[s], [e]: a } }))} 
            onUpdateRubricCounts={(s, e, i, d) => setRubricCounts(prev => {
              const cur = prev?.[s]?.[e]?.[i] ?? 0; return { ...prev, [s]: { ...prev[s], [e]: { ...prev[s]?.[e], [i]: Math.max(0, cur + d) } } };
            })} 
            onUpdateExercise={ux => setExercises(prev => prev.map(ex => ex.id === ux.id ? ux : ex))} 
            studentIdx={studentIdx} exerciseIdx={exerciseIdx} onUpdateStudentIdx={setStudentIdx} onUpdateExerciseIdx={setExerciseIdx} 
          />
        )}
        
        {mode === 'results' && pdfDoc && <ResultsView pdfDoc={pdfDoc} students={students} exercises={exercises} annotations={annotations} rubricCounts={rubricCounts} targetMaxScore={targetMaxScore} onUpdateStudents={setStudents} onBack={() => setMode('correction')} theme={theme} onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} accessToken={accessToken} userEmail={userEmail} onAuthorize={handleAuthorize} courses={courses} isAuthorizing={isAuthorizing} classroomStudents={classroomStudents} />}
      </main>
    </div>
  );
}

export default App;
