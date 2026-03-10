import { useState, useEffect } from 'react';
import { Upload, FileText, Settings, ChevronLeft, RefreshCw, X } from 'lucide-react';
import type { Student, ExerciseDef, AnnotationStore, RubricCountStore } from './types';
import { loadPDF, type PDFDocumentProxy } from './utils/pdfUtils';
import TemplateDefiner from './components/TemplateDefiner';
import CorrectionView from './components/CorrectionView';
import PageOrganizer from './components/PageOrganizer';
import ResultsView from './components/ResultsView';
import { storePDFLocal, getPDFLocal } from './utils/dbUtils';

type AppMode = 'upload' | 'setup' | 'organize_pages' | 'configure_crops' | 'correction' | 'results';

const STORAGE_PREFIX = 'correccio_app_state_';
const GLOBAL_STORAGE_KEY = 'correccio_app_global';

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
  accessToken?: string | null;
  userEmail?: string | null;
  fileName: string;
  isSent?: boolean;
  progress?: number;
  lastModified?: string;
  studentEmailMap?: Record<string, string>;
}

interface RecentSession {
  fileName: string;
  progress: number;
  isSent: boolean;
  lastModified: string;
}

interface GlobalState {
  accessToken: string | null;
  userEmail: string | null;
}

function saveState(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_PREFIX + state.fileName, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save state to localStorage', e);
  }
}

function loadState(fileName: string): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + fileName);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

function saveGlobalState(state: GlobalState) {
  localStorage.setItem(GLOBAL_STORAGE_KEY, JSON.stringify(state));
}

function loadGlobalState(): GlobalState | null {
  try {
    const raw = localStorage.getItem(GLOBAL_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GlobalState;
  } catch {
    return null;
  }
}

function App() {
  const globalSaved = loadGlobalState();

  const [mode, setMode] = useState<AppMode>('upload');

  // State
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pagesPerExam, setPagesPerExam] = useState<number | ''>(1);
  const [students, setStudents] = useState<Student[]>([]);
  const [exercises, setExercises] = useState<ExerciseDef[]>([]);
  const [annotations, setAnnotations] = useState<AnnotationStore>({});
  const [rubricCounts, setRubricCounts] = useState<RubricCountStore>({});
  const [targetMaxScore, setTargetMaxScore] = useState<number>(10);
  const [studentList, setStudentList] = useState<string>('');
  const [accessToken, setAccessToken] = useState<string | null>(globalSaved?.accessToken ?? null);
  const [userEmail, setUserEmail] = useState<string | null>(globalSaved?.userEmail ?? null);
  const [courses, setCourses] = useState<any[]>([]);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [commentBank, setCommentBank] = useState<import('./types').AnnotationComment[]>([
    { text: 'Excel·lent!', score: 1, colorMode: 'score' },
    { text: 'Molt bé', score: 0.5, colorMode: 'score' },
    { text: 'Revisa aquest concepte', score: -0.5, colorMode: 'neutral' },
    { text: 'Falta justificar la resposta', score: -1, colorMode: 'neutral' },
  ]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('Processant...');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [pendingModeAfterPDF, setPendingModeAfterPDF] = useState<AppMode | null>(null);

  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'idle'>('idle');
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [isSent, setIsSent] = useState(false);
  const [studentEmailMap, setStudentEmailMap] = useState<Record<string, string>>({});

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

  // Detect if we are in localhost or production to use the correct Client ID
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const CLIENT_ID = isLocalhost
    ? "89755629853-3i114l0ocgkpv5cla6d86n8ufuammvii.apps.googleusercontent.com" // Localhost ID (Client desenvolupament local)
    : "89755629853-lplrdbb6oh5vb2j169minkt8nh5nreog.apps.googleusercontent.com"; // Production (GitHub Pages) ID

  const SCOPES = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.profile.emails https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.appdata';

  const handleAuthorize = () => {
    setIsAuthorizing(true);
    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.access_token) {
            setAccessToken(response.access_token);
            fetchCourses(response.access_token);
            fetchUserInfo(response.access_token);
          }
          setIsAuthorizing(false);
        },
      });
      client.requestAccessToken();
    } catch (err) {
      console.error("Error initializing Google Auth", err);
      alert("Error inicialitzant Google Auth. Revisa la consola.");
      setIsAuthorizing(false);
    }
  };

  const fetchUserInfo = async (token: string) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setUserEmail(data.email);
    } catch (err) {
      console.error("Error fetching user info", err);
    }
  };

  const fetchCourses = async (token: string) => {
    try {
      const res = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setCourses(data.courses || []);
    } catch (err) {
      console.error("Error fetching courses", err);
    }
  };

  useEffect(() => {
    fetchRecentSessions();
    if (accessToken) {
      fetchUserInfo(accessToken);
      fetchCourses(accessToken);
    }
  }, [accessToken]);

  const importClassroomEmails = async (courseId: string) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/students`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const classroomStudents = data.students || [];

      const classroomNames = classroomStudents.map((cs: any) => cs.profile.name.fullName);
      const currentListLines = studentList.split('\n').filter(l => l.trim().length > 0);
      const combinedList = Array.from(new Set([...currentListLines, ...classroomNames])).join('\n');
      setStudentList(combinedList);

      const newEmailMap = { ...studentEmailMap };
      classroomStudents.forEach((cs: any) => {
        newEmailMap[cs.profile.name.fullName] = cs.profile.emailAddress;
      });
      setStudentEmailMap(newEmailMap);

      if (students.length > 0) {
        const updatedStudents = students.map(s => ({ ...s }));
        let matchesFound = 0;
        classroomStudents.forEach((cs: any) => {
          const fullName = cs.profile.name.fullName.toLowerCase();
          const email = cs.profile.emailAddress;
          const match = updatedStudents.find(s => {
            const localName = s.name.toLowerCase();
            return fullName.includes(localName) || localName.includes(fullName);
          });
          if (match) {
            match.email = email;
            matchesFound++;
          }
        });
        setStudents(updatedStudents);
        alert(`S'han trobat i assignat ${matchesFound} emails d'alumnes de Classroom.`);
      } else {
        alert(`S'han importat ${classroomNames.length} alumnes (noms i correus) de Classroom.`);
      }
    } catch (err) {
      console.error("[App] Error fetching students", err);
    }
  };

  const calculateProgressFromData = (s: Student[], ex: ExerciseDef[], anns: AnnotationStore) => {
    if (s.length === 0) return 0;
    let totalEx = s.length * ex.length;
    if (totalEx === 0) return 0;
    let comp = 0;
    s.forEach(student => {
      const studentAnns = anns[student.id] || {};
      ex.forEach(exercise => {
        if (studentAnns[exercise.id] && studentAnns[exercise.id].length > 0) comp++;
      });
    });
    return Math.round((comp / totalEx) * 100);
  };

  const fetchLocalSessions = (): RecentSession[] => {
    const sessions: RecentSession[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        try {
          const content = JSON.parse(localStorage.getItem(key) || '{}');
          sessions.push({
            fileName: content.fileName || key.replace(STORAGE_PREFIX, ''),
            progress: content.progress || 0,
            isSent: content.isSent || false,
            lastModified: content.lastModified || new Date().toISOString()
          });
        } catch (e) {
          console.error("Error parsing local session", key, e);
        }
      }
    }
    return sessions;
  };

  const saveToDrive = async (fileName: string, data: any) => {
    if (!accessToken) return;
    setCloudSyncStatus('syncing');
    try {
      // 1. Check if file already exists in appDataFolder
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${fileName}.json' and parents in 'appDataFolder'&spaces=appDataFolder`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const searchData = await searchRes.json();
      const existingFile = searchData.files && searchData.files[0];

      const boundary = '-------314159265358979323846';
      const delimiter = "\r\n--" + boundary + "\r\n";
      const close_delim = "\r\n--" + boundary + "--";

      const metadata = {
        name: `${fileName}.json`,
        parents: ['appDataFolder']
      };

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(data) +
        close_delim;

      const res = existingFile
        ? await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: multipartRequestBody
        })
        : await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: multipartRequestBody
        });

      if (res.status === 401 || res.status === 403) {
        console.warn("[App] Google Drive auth error. Clearing token.");
        setAccessToken(null);
        return;
      }
      setCloudSyncStatus('synced');
    } catch (err) {
      console.error("[App] Drive save error", err);
      setCloudSyncStatus('error');
    }
  };


  const fetchRecentSessions = async () => {
    // Start with local ones
    let sessions: RecentSession[] = fetchLocalSessions();
    setRecentSessions([...sessions].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()));

    if (!accessToken) return;
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=mimeType='application/json' and parents in 'appDataFolder' and name contains '.json'&spaces=appDataFolder&fields=files(id,name,modifiedTime)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const files = data.files || [];

      const cloudSessions: RecentSession[] = [];
      for (const file of files) {
        if (file.name === 'correccio_app_global.json') continue;
        try {
          const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          const content = await contentRes.json();
          cloudSessions.push({
            fileName: content.fileName || file.name.replace('.json', ''),
            progress: content.progress || 0,
            isSent: content.isSent || false,
            lastModified: file.modifiedTime || content.lastModified || new Date().toISOString()
          });
        } catch (e) {
          console.warn("Error loading session metadata for", file.name, e);
        }
      }

      // Merge: priority to cloud if same name but different time, or just combine unique
      const combined = [...sessions];
      cloudSessions.forEach(cs => {
        const existingIdx = combined.findIndex(s => s.fileName === cs.fileName);
        if (existingIdx === -1) {
          combined.push(cs);
        } else {
          // If cloud is newer, update (optionally)
          if (new Date(cs.lastModified).getTime() > new Date(combined[existingIdx].lastModified).getTime()) {
            combined[existingIdx] = cs;
          }
        }
      });

      setRecentSessions(combined.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()));
    } catch (err) {
      console.error("[App] Error fetching recent sessions", err);
    }
  };

  const loadFromDrive = async (fileName: string) => {
    if (!accessToken) return null;
    console.log('[App] Loading session from Drive:', fileName);
    try {
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${fileName}.json' and parents in 'appDataFolder'&spaces=appDataFolder&fields=files(id,name)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!searchRes.ok) throw new Error('Error buscando en Drive');
      const searchData = await searchRes.json();
      const file = searchData.files && searchData.files[0];
      if (!file) return null;

      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!fileRes.ok) throw new Error('Error descargando de Drive');
      const data = await fileRes.json();
      if (data.isSent !== undefined) setIsSent(data.isSent);
      return data;
    } catch (err) {
      console.error("[App] Drive load error", err);
      return null;
    }
  };

  const savePDFToDrive = async (file: File, silent = false) => {
    if (!accessToken) return;
    if (!silent) {
      setCloudSyncStatus('syncing');
      setProcessingMessage('Pujant PDF al núvol...');
      setIsProcessing(true);
    }
    try {
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${file.name}' and parents in 'appDataFolder'&spaces=appDataFolder`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const searchData = await searchRes.json();
      const existingFile = searchData.files && searchData.files[0];

      const metadata = {
        name: file.name,
        parents: ['appDataFolder']
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', file);

      const url = existingFile
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

      await fetch(url, {
        method: existingFile ? 'PATCH' : 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body: form
      });

      if (!silent) {
        setCloudSyncStatus('synced');
        alert('PDF pujat al núvol correctament!');
      }
    } catch (err) {
      console.error("[App] PDF Drive save error", err);
      if (!silent) setCloudSyncStatus('error');
    } finally {
      if (!silent) setIsProcessing(false);
    }
  };

  const loadPDFFromDrive = async (fileName: string, silent = false) => {
    if (!accessToken) return null;
    if (!silent) {
      setIsProcessing(true);
      setProcessingMessage('Descarregant PDF del núvol...');
    }
    console.log('[App] Loading PDF from Drive:', fileName);
    try {
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and parents in 'appDataFolder'&spaces=appDataFolder&fields=files(id,name,mimeType)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!searchRes.ok) return null;
      const searchData = await searchRes.json();
      const fileMeta = searchData.files && searchData.files[0];
      if (!fileMeta) return null;

      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileMeta.id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!fileRes.ok) return null;
      const blob = await fileRes.blob();
      if (blob.size < 100) {
        console.warn("[App] PDF blob from Drive is suspiciously small:", blob.size);
        return null;
      }
      return new File([blob], fileName, { type: 'application/pdf' });
    } catch (err) {
      console.error("[App] PDF Drive load error", err);
      return null;
    } finally {
      if (!silent) setIsProcessing(false);
    }
  };

  const [studentIdx, setStudentIdx] = useState<number>(0);
  const [exerciseIdx, setExerciseIdx] = useState<number>(0);

  // Persist state whenever key values change
  useEffect(() => {
    if (currentFileName && (exercises.length > 0 || students.length > 0 || Object.keys(annotations).length > 0)) {
      const stateToSave = {
        fileName: currentFileName,
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
        lastExerciseIdx: exerciseIdx,
        accessToken,
        userEmail,
        isSent,
        progress: calculateProgressFromData(students, exercises, annotations),
        lastModified: new Date().toISOString(),
        studentEmailMap
      };
      saveState(stateToSave);

      // Cloud save with a small delay to debounce
      const timeout = setTimeout(() => {
        saveToDrive(currentFileName, stateToSave);
      }, 2000);
      return () => clearTimeout(timeout);
    }
    // Always save global state
    try {
      saveGlobalState({ accessToken, userEmail });
    } catch (e) { }
  }, [currentFileName, mode, pagesPerExam, exercises, students, annotations, rubricCounts, targetMaxScore, studentList, commentBank, studentIdx, exerciseIdx, accessToken, userEmail, isSent]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[App] handleFileUpload triggered');
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert("El fitxer seleccionat no és un PDF.");
      return;
    }

    setIsProcessing(true);
    setProcessingMessage('Processant fitxer...');

    const fileName = file.name;
    setCurrentFileName(fileName);
    setPdfFile(file);

    let session = loadState(fileName);

    // If no local session, try to load from Drive (async)
    if (!session && accessToken) {
      setProcessingMessage('Buscant sessió al núvol...');
      session = await loadFromDrive(fileName);
    }

    if (session) {
      setPagesPerExam(session.pagesPerExam);
      setExercises(session.exercises);
      setStudents(session.students);
      setAnnotations(session.annotations);
      setRubricCounts(session.rubricCounts);
      setTargetMaxScore(session.targetMaxScore);
      setStudentList(session.studentList);
      setCommentBank(session.commentBank);
      setStudentIdx(session.lastStudentIdx ?? 0);
      setExerciseIdx(session.lastExerciseIdx ?? 0);
      setIsSent(session.isSent ?? false);
      setPendingModeAfterPDF(session.mode);
      setStudentEmailMap(session.studentEmailMap || {});
    } else {
      // Reset to clean state for new filename
      setPagesPerExam(1);
      setExercises([]);
      setStudents([]);
      setAnnotations({});
      setRubricCounts({});
      setTargetMaxScore(10);
      setStudentList('');
      setStudentIdx(0);
      setExerciseIdx(0);
      setPendingModeAfterPDF(null);
    }

    setIsProcessing(true);
    setProcessingMessage('Carregant PDF...');

    try {
      console.log('[App] Starting PDF load...', {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      });
      const doc = await loadPDF(file);
      console.log('[App] PDF loaded, pages:', doc.numPages);
      setPdfDoc(doc);
      setNumPages(doc.numPages);

      if (pendingModeAfterPDF || (session && session.mode)) {
        let nextMode = pendingModeAfterPDF || session?.mode || 'setup';
        if (nextMode === 'upload') nextMode = 'setup'; // Safety: don't loop in upload
        console.log('[App] Switching to mode:', nextMode, 'from session:', fileName);
        setMode(nextMode as AppMode);
        setPendingModeAfterPDF(null);
      } else {
        console.log('[App] New PDF, switching to setup mode');
        setMode('setup');
      }

      // Save PDF to IndexedDB for local persistence (invisible to user) - DO NOT block UI
      storePDFLocal(fileName, file).catch(e => console.error('[App] Background DB store failed', e));

    } catch (err: any) {
      console.error("[App] Error loading PDF", err);
      alert(`Error carregant el PDF: ${err?.message || 'Error desconegut'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectSession = async (recentSess: RecentSession) => {
    console.log('[App] handleSelectSession triggered for:', recentSess.fileName);
    setCurrentFileName(recentSess.fileName);
    setProcessingMessage('Carregant sessió...');
    setIsProcessing(true);

    try {
      let session = loadState(recentSess.fileName);
      if (!session && accessToken) {
        session = await loadFromDrive(recentSess.fileName);
      }

      if (!session) {
        alert("No s'ha trobat la sessió.");
        return;
      }

      // Metadata
      setPagesPerExam(session.pagesPerExam);
      setExercises(session.exercises);
      setStudents(session.students);
      setAnnotations(session.annotations);
      setRubricCounts(session.rubricCounts);
      setTargetMaxScore(session.targetMaxScore);
      setStudentList(session.studentList);
      setCommentBank(session.commentBank);
      setStudentIdx(session.lastStudentIdx ?? 0);
      setExerciseIdx(session.lastExerciseIdx ?? 0);
      setIsSent(session.isSent ?? false);
      setStudentEmailMap(session.studentEmailMap || {});
      if (session.studentList) setStudentList(session.studentList);

      // Handle PDF
      if (pdfFile && pdfFile.name === recentSess.fileName) {
        setMode(session.mode);
      } else {
        // Try local DB first (invisible persistence)
        let neededPDF = await getPDFLocal(recentSess.fileName);

        if (!neededPDF && accessToken) {
          setProcessingMessage('Descarregant PDF del núvol...');
          neededPDF = await loadPDFFromDrive(recentSess.fileName, true);
        }

        if (neededPDF) {
          console.log('[App] PDF source found (LocalDB or Cloud). Parsing...');
          setProcessingMessage('Carregant PDF...');
          const doc = await loadPDF(neededPDF);
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setPdfFile(neededPDF);

          let nextMode = session.mode;
          if (nextMode === 'upload') nextMode = 'setup';
          console.log('[App] Advancing to mode:', nextMode);
          setMode(nextMode);
        } else {
          console.warn('[App] PDF not found anywhere. User MUST upload manually.');
          alert(`Document no trobat. Per continuar, selecciona el fitxer "${recentSess.fileName}" des del teu ordinador.`);
          setPendingModeAfterPDF(session.mode);
          setMode('upload');
        }
      }
    } catch (err: any) {
      console.error("Select session error", err);
      alert(`Error carregant la sessió: ${err?.message || 'Error desconegut'}`);
    } finally {
      setIsProcessing(false);
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
    console.log('[App] handleBack called, current mode:', mode);
    if (mode === 'setup') {
      setMode('upload');
      setCurrentFileName(null);
      setPdfFile(null);
      setPdfDoc(null);
      setNumPages(0);
      setRecentSessions([]); // Force refresh on next dashboard visit
      fetchRecentSessions();
    }
    else if (mode === 'organize_pages') setMode('setup');
    else if (mode === 'configure_crops') setMode('organize_pages');
    else if (mode === 'correction') setMode('configure_crops');
    else if (mode === 'results') setMode('correction');
    else setMode('upload');
  };


  const handleNewSession = () => {
    if (currentFileName) {
      localStorage.removeItem(STORAGE_PREFIX + currentFileName);
    }
    setExercises([]);
    setStudents([]);
    setAnnotations({});
    setPagesPerExam(1);
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

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {accessToken ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-tertiary)', padding: '0.4rem 0.8rem', borderRadius: '2rem', border: '1px solid var(--border)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>
                  {userEmail?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Usuari connectat</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{userEmail}</span>
                    {cloudSyncStatus !== 'idle' && (
                      <div
                        title={cloudSyncStatus === 'syncing' ? 'Sincronitzant amb Drive...' : cloudSyncStatus === 'synced' ? 'Sincronitzat amb Drive' : 'Error de sincronització'}
                        style={{ display: 'flex', alignItems: 'center' }}
                      >
                        {cloudSyncStatus === 'syncing' ? (
                          <div className="loader" style={{ width: '10px', height: '10px', borderWidth: '1.5px', borderTopColor: 'var(--accent)' }}></div>
                        ) : cloudSyncStatus === 'synced' ? (
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)' }}></div>
                        ) : (
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--danger)' }}></div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setAccessToken(null); setUserEmail(null); }}
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', padding: '0.2rem', cursor: 'pointer', display: 'flex' }}
                  title="Desconnectar"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            ) : (
              <button
                className="btn-google"
                onClick={handleAuthorize}
                disabled={isAuthorizing}
                style={{ height: '32px', padding: '0 12px', fontSize: '0.85rem' }}
              >
                <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" style={{ width: '16px', height: '16px' }} />
                <span>{isAuthorizing ? '...' : 'Connectar'}</span>
              </button>
            )}
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className="main-content">


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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <label className={`btn btn-primary ${isProcessing ? 'disabled' : ''}`} style={{ cursor: 'pointer', padding: '0.75rem 1.5rem', fontSize: '1.1rem', width: '280px' }}>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                    disabled={isProcessing}
                  />
                  {isProcessing ? 'Loading PDF...' : 'Select PDF File'}
                </label>

                {!accessToken && (
                  <button
                    className="btn-google"
                    onClick={handleAuthorize}
                    disabled={isAuthorizing}
                    style={{ width: '280px', marginTop: '0.5rem' }}
                  >
                    <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" />
                    {isAuthorizing ? 'Connectant...' : 'Connectar amb Google'}
                  </button>
                )}
              </div>

              {recentSessions.length > 0 && (
                <div style={{ marginTop: '3rem', width: '100%', maxWidth: '600px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                    <RefreshCw size={18} color="var(--accent)" />
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Sessions recents (Local + Núvol)</h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {recentSessions.map(session => (
                      <div
                        key={session.fileName}
                        onClick={() => handleSelectSession(session)}
                        style={{
                          padding: '1rem',
                          background: 'var(--bg-tertiary)',
                          borderRadius: '0.75rem',
                          border: '1px solid var(--border)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                            {session.fileName}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            {new Date(session.lastModified).toLocaleDateString()}
                          </span>
                        </div>

                        <div style={{ width: '100%', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${session.progress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s ease' }}></div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{session.progress}% completat</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {session.isSent ? (
                              <>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)' }}></div>
                                <span style={{ color: 'var(--success)' }}>Enviat</span>
                              </>
                            ) : (
                              <>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-secondary)' }}></div>
                                <span color="var(--text-secondary)">Pendent</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Settings size={28} color="var(--accent)" />
                  <h2 style={{ fontSize: '1.5rem' }}>Document Configuration</h2>
                </div>
                {accessToken && courses.length > 0 && (
                  <select
                    onChange={(e) => importClassroomEmails(e.target.value)}
                    style={{ padding: '0.4rem', borderRadius: '0.4rem', border: '1px solid var(--accent)', fontSize: '0.8rem', background: 'white' }}
                    defaultValue=""
                  >
                    <option value="" disabled>Importar de Classroom...</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <label style={{ fontWeight: 600, fontSize: '1.1rem' }}>
                    Gestió d'Alumnes
                  </label>
                  <button
                    onClick={() => {
                      const input = prompt("Enganxa aquí la llista (un nom per línia):", studentList);
                      if (input !== null) setStudentList(input);
                    }}
                    style={{ fontSize: '0.75rem', background: 'none', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    Enganxar llista de text
                  </button>
                </div>

                <div style={{
                  maxHeight: '300px',
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: '0.75rem',
                  background: 'var(--bg-primary)'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border)' }}>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '0.75rem' }}>Nom de l'alumne</th>
                        <th style={{ textAlign: 'left', padding: '0.75rem' }}>Email (per enviar resultats)</th>
                        <th style={{ width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentList.split('\n').filter(n => n.trim().length > 0).map((name, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem' }}>{name}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <input
                              type="email"
                              placeholder="sense correu..."
                              value={studentEmailMap[name] || ''}
                              onChange={(e) => setStudentEmailMap(prev => ({ ...prev, [name]: e.target.value }))}
                              style={{
                                width: '100%',
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--accent)',
                                fontSize: '0.85rem',
                                outline: 'none'
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <button
                              onClick={() => {
                                const newList = studentList.split('\n').filter((_, i) => i !== idx).join('\n');
                                setStudentList(newList);
                              }}
                              style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                            >
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {studentList.split('\n').filter(n => n.trim().length > 0).length === 0 && (
                        <tr>
                          <td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No hi ha alumnes. Importa'ls de Classroom o afegeix-los manualment.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    id="new-student-name"
                    placeholder="Nou alumne..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) {
                          setStudentList(prev => prev ? prev + '\n' + val : val);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)'
                    }}
                  />
                  <button
                    onClick={() => {
                      const el = document.getElementById('new-student-name') as HTMLInputElement;
                      const val = el.value.trim();
                      if (val) {
                        setStudentList(prev => prev ? prev + '\n' + val : val);
                        el.value = '';
                      }
                    }}
                    className="btn btn-secondary"
                  >
                    Afegir
                  </button>
                </div>

                <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <strong>Consell:</strong> Assegura't que el nom coincideixi amb el que l'alumne escriu a l'examen per a que l'OCR l'identifiqui.
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
                {accessToken && pdfFile && (
                  <button
                    className="btn-google"
                    onClick={() => savePDFToDrive(pdfFile)}
                    title="Pujar aquest PDF al núvol per continuar des de qualsevol lloc"
                    style={{ padding: '0 12px' }}
                  >
                    <Upload size={16} />
                    Núvol
                  </button>
                )}
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

                          // Look up email if available - Case insensitive
                          const mappingKey = Object.keys(studentEmailMap).find(k => k.toLowerCase() === bestMatch.toLowerCase());
                          if (mappingKey && studentEmailMap[mappingKey]) {
                            updatedStudents[i].email = studentEmailMap[mappingKey];
                            addLog(`  → Match Classroom Email: ${studentEmailMap[mappingKey]}`);
                          }
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
            accessToken={accessToken}
            userEmail={userEmail}
            onAuthorize={handleAuthorize}
            courses={courses}
            isAuthorizing={isAuthorizing}
            isSent={isSent}
            onMarkAsSent={setIsSent}
          />
        )}

      </main>
    </div>
  );
}

export default App;
