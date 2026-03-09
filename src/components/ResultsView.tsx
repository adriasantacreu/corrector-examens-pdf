import { useState } from 'react';
import { Mail, Send, CheckCircle2, AlertCircle, ChevronLeft, Beaker, RefreshCw } from 'lucide-react';
import type { Student, ExerciseDef, AnnotationStore, RubricCountStore, Annotation, TextAnnotation } from '../types';
import { generateStudentPDF } from '../utils/pdfExport';
import type { PDFDocumentProxy } from '../utils/pdfUtils';

interface Props {
    pdfDoc: PDFDocumentProxy;
    students: Student[];
    exercises: ExerciseDef[];
    annotations: AnnotationStore;
    rubricCounts: RubricCountStore;
    targetMaxScore: number;
    onUpdateStudents: (students: Student[]) => void;
    onBack: () => void;
}

const CLIENT_ID = "89755629853-3i114l0ocgkpv5cla6d86n8ufuammvii.apps.googleusercontent.com";
const SCOPES = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.profile.emails https://www.googleapis.com/auth/userinfo.email';

export default function ResultsView({ pdfDoc, students, exercises, annotations, rubricCounts, targetMaxScore, onUpdateStudents, onBack }: Props) {
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [isSendingAll, setIsSendingAll] = useState(false);
    const [courses, setCourses] = useState<any[]>([]);
    const [sendStatuses, setSendStatuses] = useState<Record<string, 'pending' | 'sending' | 'success' | 'error'>>({});

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

    const importClassroomEmails = async (courseId: string) => {
        if (!accessToken) return;
        try {
            const res = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/students`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const data = await res.json();
            const classroomStudents = data.students || [];
            
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
            
            onUpdateStudents(updatedStudents);
            alert(`S'han trobat i assignat ${matchesFound} emails d'alumnes de Classroom.`);
        } catch (err) {
            console.error("[ResultsView] Error fetching students", err);
        }
    };

    const calculateStudentScore = (studentId: string) => {
        let total = 0;
        let maxPossible = 0;

        for (const ex of exercises) {
            if (ex.type !== 'crop' && ex.type !== 'pages') continue;
            
            const exAnns = annotations[studentId]?.[ex.id] || [];
            const exRubricCounts = rubricCounts[studentId]?.[ex.id] || {};
            
            const highlightAdj = exAnns.reduce((s, a) => (a.type === 'highlighter' && typeof a.points === 'number' ? s + a.points : (a.type === 'text' && typeof a.score === 'number' ? s + a.score : s)), 0);
            const rubricBase = (ex.scoringMode === 'from_zero' && ex.rubric) ? ex.rubric.reduce((s, item) => s + item.points * (exRubricCounts[item.id] ?? 0), 0) : (ex.maxScore ?? 0);
            
            total += (rubricBase + highlightAdj);
            maxPossible += (ex.maxScore ?? 0);
        }

        const normalized = maxPossible > 0 ? (total / maxPossible) * targetMaxScore : 0;
        return {
            raw: total,
            max: maxPossible,
            normalized: Math.round(normalized * 100) / 100
        };
    };

    const sendEmail = async (student: Student, isTest: boolean = false) => {
        console.log(`[ResultsView] Iniciant enviament per a ${student.name} (Test: ${isTest})`);
        if (!accessToken) {
            console.error("[ResultsView] Error: No hi ha accessToken");
            return;
        }
        const targetEmail = isTest ? userEmail : student.email;
        if (!targetEmail) {
            console.warn(`[ResultsView] Avís: Sense correu destí per a ${student.name}`);
            return;
        }

        if (!isTest) setSendStatuses(prev => ({ ...prev, [student.id]: 'sending' }));

        try {
            console.log(`[ResultsView] Calculant nota per a ${student.name}...`);
            const score = calculateStudentScore(student.id);
            
            // Calculate scale factor: targetMaxScore / sum of all exercises maxScore
            const totalExercisesMax = exercises.reduce((sum, ex) => {
                if (ex.type === 'crop' || ex.type === 'pages') return sum + (ex.maxScore ?? 0);
                return sum;
            }, 0);
            const scaleFactor = totalExercisesMax > 0 ? (targetMaxScore / totalExercisesMax) : 1;

            agentDebugLog(
                'H4_email_pdf',
                'src/components/ResultsView.tsx:154',
                'Preparing PDF for student email',
                {
                    studentId: student.id,
                    isTest,
                    score,
                    totalExercisesMax,
                    targetMaxScore,
                    scaleFactor
                }
            );
            
            console.log(`[ResultsView] Generant PDF per a ${student.name}... Factor escala: ${scaleFactor}`);
            const pdfBlob = await generateStudentPDF(
                pdfDoc,
                student,
                exercises,
                annotations,
                rubricCounts,
                targetMaxScore,
                scaleFactor
            );
            console.log(`[ResultsView] PDF generat correctament. Mida blob: ${pdfBlob.size} bytes`);

            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve, reject) => {
                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
            });
            reader.readAsDataURL(pdfBlob);
            const pdfBase64 = await base64Promise;
            console.log(`[ResultsView] PDF convertit a Base64.`);

            const subject = `${isTest ? '[TEST] ' : ''}Nota Examen: ${student.name}`;
            const body = `Hola ${student.name},\n\nLa teva nota de l'examen és: ${score.normalized} / ${targetMaxScore}.\n\nT'adjuntem el PDF amb la correcció detallada.\n\nSalutacions,\nEl teu professor.`;
            
            const boundary = "foo_bar_baz";
            const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
            
            const emailLines = [
                `To: ${targetEmail}`,
                `Subject: ${utf8Subject}`,
                'MIME-Version: 1.0',
                `Content-Type: multipart/mixed; boundary="${boundary}"`,
                '',
                `--${boundary}`,
                'Content-Type: text/plain; charset=utf-8',
                'Content-Transfer-Encoding: 7bit',
                '',
                body,
                '',
                `--${boundary}`,
                `Content-Type: application/pdf; name="Correccio_${student.name.replace(/\s+/g, '_')}.pdf"`,
                'Content-Transfer-Encoding: base64',
                'Content-Disposition: attachment; filename="Correccio_' + student.name.replace(/\s+/g, '_') + '.pdf"',
                '',
                pdfBase64,
                '',
                `--${boundary}--`
            ].join('\r\n');

            const encodedEmail = btoa(unescape(encodeURIComponent(emailLines)))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            console.log(`[ResultsView] Fent petició a Gmail API per a ${student.name}...`);
            const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ raw: encodedEmail })
            });

            if (response.ok) {
                console.log(`[ResultsView] Correu enviat amb ÈXIT a ${student.name}`);
                agentDebugLog(
                    'H4_email_pdf',
                    'src/components/ResultsView.tsx:224',
                    'Email sent successfully',
                    {
                        studentId: student.id,
                        isTest,
                        httpStatus: response.status
                    }
                );
                if (!isTest) setSendStatuses(prev => ({ ...prev, [student.id]: 'success' }));
            } else {
                const errData = await response.json();
                console.error(`[ResultsView] Error Gmail API per a ${student.name}:`, errData);
                agentDebugLog(
                    'H4_email_pdf',
                    'src/components/ResultsView.tsx:228',
                    'Email send failed',
                    {
                        studentId: student.id,
                        isTest,
                        httpStatus: response.status,
                        error: errData?.error || errData
                    }
                );
                if (!isTest) setSendStatuses(prev => ({ ...prev, [student.id]: 'error' }));
            }
        } catch (err) {
            console.error(`[ResultsView] Excepció enviant email a ${student.name}:`, err);
            agentDebugLog(
                'H4_email_pdf',
                'src/components/ResultsView.tsx:232',
                'Unhandled exception while sending email',
                {
                    studentId: student.id,
                    isTest,
                    errorMessage: (err as any)?.message || String(err)
                }
            );
            if (!isTest) setSendStatuses(prev => ({ ...prev, [student.id]: 'error' }));
        }
    };

    const sendAll = async (isTest: boolean = false) => {
        console.log(`[ResultsView] Iniciant enviament massiu. Mode test: ${isTest}`);
        if (isTest && !userEmail) {
            console.warn("[ResultsView] Abortat: mode test però sense userEmail.");
            return;
        }
        
        setIsSendingAll(true);
        console.log("[ResultsView] Botons bloquejats (isSendingAll=true)");

        try {
            // Fix: In test mode, we want to allow re-sending even if status is 'success'
            const studentsToMail = students.filter(s => {
                if (isTest) return true; // Sempre enviem a tothom en mode test
                return s.email && sendStatuses[s.id] !== 'success'; // En mode real, només si té email i no està enviat
            });
            
            console.log(`[ResultsView] Alumnes pendents d'enviar: ${studentsToMail.length}`);

            if (isTest) {
                const confirmTest = confirm(`S'enviaran ${studentsToMail.length} correus de prova a ${userEmail}. Vols continuar?`);
                if (!confirmTest) {
                    console.log("[ResultsView] Usuari ha cancel·lat l'enviament de prova.");
                    return;
                }
            }

            for (const s of studentsToMail) {
                await sendEmail(s, isTest);
            }
            console.log("[ResultsView] Enviament massiu completat.");
            if (isTest) alert("S'han enviat tots els correus de prova al teu email.");
        } catch (err) {
            console.error("[ResultsView] Error fatal en sendAll:", err);
        } finally {
            console.log("[ResultsView] Desbloquejant botons (isSendingAll=false)");
            setIsSendingAll(false);
        }
    };

    return (
        <div className="app-container" style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', flexShrink: 0 }}>
                <button className="btn-icon" onClick={onBack}><ChevronLeft /></button>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 700 }}>Resum i Enviament de Notes</h1>
            </div>

            {!accessToken ? (
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="card" style={{ textAlign: 'center', padding: '3rem', background: 'var(--bg-secondary)', maxWidth: '500px', width: '100%' }}>
                        <Mail size={48} style={{ marginBottom: '1.5rem', color: 'var(--accent)' }} />
                        <h2 style={{ marginBottom: '1rem' }}>Connecta amb Google</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                            Necessitem permís per enviar correus i llegir el Classroom.
                        </p>
                        <button className="btn btn-primary" onClick={handleAuthorize} disabled={isAuthorizing} style={{ padding: '0.75rem 2rem' }}>
                            {isAuthorizing ? 'Autoritzant...' : 'Autoritzar Google'}
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, overflow: 'hidden' }}>
                    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--accent-light)', border: '1px solid var(--accent)', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
                            <div>
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Sessió: {userEmail}</span>
                                <p style={{ fontSize: '0.75rem', opacity: 0.8 }}>Google Classroom + Gmail actiu</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {courses.length > 0 && (
                                <select 
                                    onChange={(e) => importClassroomEmails(e.target.value)}
                                    style={{ padding: '0.4rem', borderRadius: '0.4rem', border: '1px solid var(--accent)', fontSize: '0.8rem', background: 'white' }}
                                    defaultValue=""
                                >
                                    <option value="" disabled>Importar de Classroom...</option>
                                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            )}
                            <button className="btn btn-secondary" onClick={() => sendAll(true)} disabled={isSendingAll}>
                                <Beaker size={18} /> Prova (enviar-me a mi)
                            </button>
                            <button className="btn btn-primary" onClick={() => sendAll(false)} disabled={isSendingAll}>
                                <Send size={18} /> Enviar a tots
                            </button>
                        </div>
                    </div>

                    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-tertiary)' }}>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '1rem' }}>Alumne</th>
                                        <th style={{ padding: '1rem' }}>Email</th>
                                        <th style={{ padding: '1rem', textAlign: 'center' }}>Nota ({targetMaxScore})</th>
                                        <th style={{ padding: '1rem', textAlign: 'right' }}>Acció</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {students.map(student => {
                                        const score = calculateStudentScore(student.id);
                                        const status = sendStatuses[student.id];
                                        
                                        return (
                                            <tr key={student.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '1rem', fontWeight: 600 }}>{student.name}</td>
                                                <td style={{ padding: '1rem', color: student.email ? 'inherit' : 'var(--danger)', fontSize: '0.9rem' }}>
                                                    {student.email || 'Falta email'}
                                                </td>
                                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                                    <span style={{ 
                                                        padding: '0.2rem 0.6rem', borderRadius: '1rem', 
                                                        background: score.normalized >= (targetMaxScore/2) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                        color: score.normalized >= (targetMaxScore/2) ? '#10b981' : '#ef4444',
                                                        fontWeight: 700
                                                    }}>
                                                        {score.normalized}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1rem', textAlign: 'right' }}>
                                                    {!student.email ? (
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>N/A</span>
                                                    ) : status === 'success' ? (
                                                        <div style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                            <CheckCircle2 size={18} /> Enviat
                                                        </div>
                                                    ) : status === 'error' ? (
                                                        <div style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                            <AlertCircle size={18} /> Error
                                                            <button className="btn-icon" onClick={() => sendEmail(student)} style={{ color: 'var(--accent)' }}><RefreshCw size={14} /></button>
                                                        </div>
                                                    ) : (
                                                        <button 
                                                            className="btn btn-secondary" 
                                                            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                                                            onClick={() => sendEmail(student)}
                                                            disabled={status === 'sending'}
                                                        >
                                                            {status === 'sending' ? 'Enviant...' : 'Enviar'}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
