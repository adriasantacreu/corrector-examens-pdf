import { useState, useMemo } from 'react';
import { ChevronLeft, Download, Sun, Moon, UserCheck, RefreshCw, FileDown, XCircle, MailCheck, MessageSquareText, Send as SendIcon, CheckCircle } from 'lucide-react';
import type { Student, ExerciseDef, AnnotationStore, RubricCountStore } from '../types';
import { exportCombinedPDF, exportStudentPDF, generateStudentPDF } from '../utils/pdfExport';
import { calculateStudentScore } from '../utils/scoreUtils';
import HandwrittenTitle from './HandwrittenTitle';
import FlowGradingLogo from './FlowGradingLogo';

const DEFAULT_EMAIL_SUBJECT = `Correcció - FlowGrading: {nom}`;
const DEFAULT_EMAIL_TEMPLATE = `Hola {nom},

Adjuntem la teva correcció de l'examen.

Nota final: {nota} / {nota_maxima}
Estat: {estat}

Salutacions,
FlowGrading.`;

interface Props {
    pdfDoc: any;
    students: Student[];
    exercises: ExerciseDef[];
    annotations: AnnotationStore;
    rubricCounts: RubricCountStore;
    targetMaxScore: number;
    onUpdateStudents: (s: Student[]) => void;
    onBack: () => void;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
    accessToken: string | null;
    userEmail: string | null;
    onAuthorize: () => void;
    courses: any[];
    isAuthorizing: boolean;
    classroomStudents: any[];
    showAlert: (title: string, message: string) => void;
    showConfirm: (title: string, message: string, onConfirm: () => void) => void;
    showToast: (title: string, text: string, type: 'loading' | 'success' | 'error') => void;
}

export default function ResultsView({
    pdfDoc, students, exercises, annotations, rubricCounts, targetMaxScore,
    onUpdateStudents, onBack, theme, onToggleTheme,
    accessToken, userEmail, classroomStudents,
    showConfirm, showToast
}: Props) {
    const [isExporting, setIsProcessing] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [isSendingTest, setIsSendingTest] = useState(false);
    const [sendingState, setSendingState] = useState<{ current: string, done: number, total: number } | null>(null);
    const [actionState, setActionState] = useState<{ title: string, text: string, type?: 'loading' | 'success' | 'error' } | null>(null);
    const [emailSubjectTemplate, setEmailSubjectTemplate] = useState(DEFAULT_EMAIL_SUBJECT);
    const [emailTemplate, setEmailTemplate] = useState(DEFAULT_EMAIL_TEMPLATE);
    const [isEditingTemplate, setIsEditingTemplate] = useState(false);

    const stats = useMemo(() => {
        const scores = students.map(s => calculateStudentScore(s.id, exercises, annotations, rubricCounts, targetMaxScore).normalized);
        const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        const pass = scores.filter(s => s >= targetMaxScore / 2).length;
        return { avg: avg.toFixed(2), passRate: scores.length ? Math.round((pass / scores.length) * 100) : 0, passCount: pass, total: scores.length };
    }, [students, exercises, annotations, rubricCounts, targetMaxScore]);

    const handleDownloadAll = async () => {
        setIsProcessing(true);
        setExportProgress(0);
        setActionState({ title: 'Generant PDFs', text: 'Preparant el document sencer...', type: 'loading' });
        try {
            await exportCombinedPDF(pdfDoc, students, exercises, annotations, rubricCounts, targetMaxScore, (p) => {
                setExportProgress(p);
                setActionState({ title: 'Generant PDFs', text: `Processant... ${p}%`, type: 'loading' });
            });
            setActionState({ title: 'Èxit', text: 'PDF combinat generat correctament.', type: 'success' });
            setTimeout(() => setActionState(null), 3000);
        } catch (err) {
            console.error(err);
            setActionState({ title: 'Error', text: 'Error exportant el PDF complet.', type: 'error' });
            setTimeout(() => setActionState(null), 4000);
        } finally {
            setIsProcessing(false);
            setExportProgress(0);
        }
    };

    const handleDownloadStudent = async (student: Student) => {
        setIsProcessing(true);
        setActionState({ title: 'Generant PDF', text: `Preparant la descàrrega per a ${student.name}...`, type: 'loading' });
        try {
            await exportStudentPDF(pdfDoc, student, exercises, annotations as any, rubricCounts, targetMaxScore);
            setActionState(null);
        } catch (err) {
            setActionState({ title: 'Error', text: `Error generant el PDF individual.`, type: 'error' });
            setTimeout(() => setActionState(null), 4000);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleManualLink = (studentId: string, classroomEmail: string) => {
        const updated = students.map(s => s.id === studentId ? { ...s, email: classroomEmail || undefined } : s);
        onUpdateStudents(updated);
    };

    const sendEmailForStudent = async (student: Student, isTest: boolean = false) => {
        const scoreData = calculateStudentScore(student.id, exercises, annotations, rubricCounts, targetMaxScore);
        const isPass = scoreData.normalized >= targetMaxScore / 2;

        const totalPossible = exercises.reduce((acc, ex) => acc + (ex.maxScore ?? 10), 0);
        const scaleFactor = totalPossible > 0 ? targetMaxScore / totalPossible : 1;
        const pdfBlob = await generateStudentPDF(pdfDoc, student, exercises, annotations as any, rubricCounts, scaleFactor);

        const base64Pdf = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(pdfBlob);
        });

        let subject = emailSubjectTemplate
            .replace(/{nom}/g, student.name)
            .replace(/{nota}/g, scoreData.normalized.toFixed(2))
            .replace(/{nota_maxima}/g, targetMaxScore.toString())
            .replace(/{estat}/g, isPass ? 'Aprovat' : 'Suspès');
            
        if (isTest) subject += ' (Prova)';
        
        let body = emailTemplate
            .replace(/{nom}/g, student.name)
            .replace(/{nota}/g, scoreData.normalized.toFixed(2))
            .replace(/{nota_maxima}/g, targetMaxScore.toString())
            .replace(/{estat}/g, isPass ? 'Aprovat' : 'Suspès');

        if (isTest) {
            body += "\n\n---\n(Aquest és un correu de prova del sistema per verificar el format.)";
        }

        const boundary = `flowgrading-boundary-${Date.now()}`;
        const safeFileName = `correccio_${student.name.replace(/\s+/g, '_')}.pdf`;
        const utf8ToBase64 = (str: string) => btoa(unescape(encodeURIComponent(str)));
        const targetEmail = isTest ? userEmail : student.email;

        const messageParts = [
            `To: ${targetEmail}`,
            `Subject: =?UTF-8?B?${utf8ToBase64(subject)}?=`,
            `Content-Type: multipart/mixed; boundary="${boundary}"`,
            '',
            `--${boundary}`,
            'Content-Type: text/plain; charset="UTF-8"',
            '',
            body,
            '',
            `--${boundary}`,
            `Content-Type: application/pdf; name="${safeFileName}"`,
            `Content-Disposition: attachment; filename="${safeFileName}"`,
            'Content-Transfer-Encoding: base64',
            '',
            base64Pdf,
            '',
            `--${boundary}--`
        ].join('\r\n');

        const encodedMessage = btoa(unescape(encodeURIComponent(messageParts)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: encodedMessage })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "Error desconegut");
        }
    };

    const handleSendTestEmail = async (student: Student) => {
        if (!accessToken || !userEmail) {
            showToast("Error", "Has d'estar connectat per enviar un correu de prova.", "error");
            return;
        }

        setIsSendingTest(true);
        setActionState({ title: 'Enviant Test', text: `Generant i enviant correu de prova de ${student.name}...`, type: 'loading' });
        try {
            await sendEmailForStudent(student, true);
            setActionState({ title: 'Test enviat', text: `S'ha enviat el correu de prova a la teva bústia.`, type: 'success' });
            setTimeout(() => setActionState(null), 3000);
        } catch (err: any) {
            setActionState({ title: 'Error', text: `No s'ha pogut enviar: ${err.message}`, type: 'error' });
            setTimeout(() => setActionState(null), 4000);
        } finally {
            setIsSendingTest(false);
        }
    };

    const handleSendIndividualEmail = async (student: Student) => {
        if (!accessToken || !student.email) return;
        
        showConfirm("Enviar correu", `Vols enviar definitivament la correcció a ${student.name} (${student.email})?`, async () => {
            setIsSendingTest(true);
            setActionState({ title: 'Enviant Correu', text: `Generant i enviant correu a ${student.name}...`, type: 'loading' });
            try {
                await sendEmailForStudent(student, false);
                setActionState({ title: 'Enviat', text: `S'ha enviat la correcció a ${student.name} amb èxit.`, type: 'success' });
                setTimeout(() => setActionState(null), 3000);
            } catch (err: any) {
                setActionState({ title: 'Error', text: `No s'ha pogut enviar: ${err.message}`, type: 'error' });
                setTimeout(() => setActionState(null), 4000);
            } finally {
                setIsSendingTest(false);
            }
        });
    };

    const handleMassSend = async () => {
        if (!accessToken) {
            showToast("Error", "Has d'estar connectat per enviar correus.", "error");
            return;
        }
        const studentsWithEmail = students.filter(s => s.email);
        if (studentsWithEmail.length === 0) {
            showToast("Error", "Cap alumne té un correu vinculat.", "error");
            return;
        }

        showConfirm("Enviament Massiu", `S'enviaran ${studentsWithEmail.length} correus a tots els alumnes vinculats. Vols continuar?`, async () => {
            setSendingState({ current: '', done: 0, total: studentsWithEmail.length });
            let successCount = 0;

            for (let i = 0; i < studentsWithEmail.length; i++) {
                const student = studentsWithEmail[i];
                setSendingState({ current: student.name, done: i, total: studentsWithEmail.length });
                try {
                    await sendEmailForStudent(student, false);
                    successCount++;
                } catch (err) {
                    console.error(`Error enviant a ${student.name}`, err);
                }
            }
            
            setSendingState(null);
            showToast("Enviament completat", `S'han enviat ${successCount} de ${studentsWithEmail.length} correus correctament.`, "success");
        });
    };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-primary)', overflowY: 'auto' }}>
            <header className="header">
                <div style={{ flex: 1 }}><button className="btn-icon" onClick={onBack} title="Enrere"><ChevronLeft size={28} /></button></div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}><FlowGradingLogo size="2.2rem" animate={false} /></div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '1rem', alignItems: 'center' }}>
                    <button className="btn-icon" onClick={onToggleTheme}>{theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}</button>
                    
                    <button 
                        className="btn btn-secondary" 
                        onClick={() => setIsEditingTemplate(true)}
                        style={{ height: '42px', fontSize: '0.85rem' }}
                        title="Configurar plantilla del missatge"
                    >
                        <MessageSquareText size={16} />
                    </button>
                    
                    <button 
                        className="btn btn-secondary" 
                        onClick={handleMassSend} 
                        disabled={!!sendingState || !accessToken}
                        style={{ height: '42px', fontSize: '0.85rem' }}
                    >
                        {sendingState ? <RefreshCw size={16} className="spin" /> : <SendIcon size={16} />}
                        Enviament Massiu
                    </button>

                    <button className="btn btn-primary" onClick={handleDownloadAll} disabled={isExporting} style={{ height: '42px' }}>
                        {isExporting ? <RefreshCw size={18} className="spin" /> : <FileDown size={18} />}
                        {isExporting ? `Generant... ${exportProgress}%` : 'Baixar tots els PDF'}
                    </button>
                </div>
            </header>

            <main style={{ flex: 1, padding: '3rem 4rem' }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4rem' }}>
                        <HandwrittenTitle size="3.5rem" color="green" noMargin={true}>Resultats i Exportació</HandwrittenTitle>
                        
                        <div style={{ display: 'flex', gap: '1.5rem' }}>
                            <div className="card" style={{ padding: '1.5rem 2.5rem', textAlign: 'center', border: '2px solid var(--accent)', background: 'var(--accent-light)' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Mitjana de classe</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--text-primary)' }}>{stats.avg}<span style={{ fontSize: '1rem', opacity: 0.5 }}>/{targetMaxScore}</span></div>
                            </div>
                            <div className="card" style={{ padding: '1.5rem 2.5rem', textAlign: 'center', border: '2px solid var(--success)', background: 'rgba(16, 185, 129, 0.05)' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--success)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Percentatge d'aprovats</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--text-primary)' }}>{stats.passRate}%</div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{stats.passCount} de {stats.total} alumnes</div>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginBottom: '2rem' }}>
                        <HandwrittenTitle size="2.2rem" color="purple" noMargin={true}>Llistat de qualificacions</HandwrittenTitle>
                    </div>

                    <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: '1.5rem' }}>
                        <table className="modern-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '80px' }}>#</th>
                                    <th>Alumne</th>
                                    <th>Estat Classroom</th>
                                    <th style={{ textAlign: 'right' }}>Nota final</th>
                                    <th style={{ width: '180px', textAlign: 'center' }}>Accions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map((s, i) => {
                                    const scoreData = calculateStudentScore(s.id, exercises, annotations, rubricCounts, targetMaxScore);
                                    const isPass = scoreData.normalized >= targetMaxScore / 2;

                                    return (
                                        <tr key={s.id}>
                                            <td style={{ fontWeight: 800, color: 'var(--text-secondary)' }}>{i + 1}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    {s.nameCropUrl && (
                                                        <div style={{ width: '140px', height: '42px', overflow: 'hidden', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'white', flexShrink: 0, padding: '2px' }}>
                                                            <img src={s.nameCropUrl} alt="OCR Name" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                        </div>
                                                    )}
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontWeight: 700, fontSize: '1rem' }}>{s.name}</span>
                                                        {s.email && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.email}</span>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                {classroomStudents.length > 0 ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <select 
                                                            value={s.email || ""}
                                                            onChange={(e) => handleManualLink(s.id, e.target.value)}
                                                            style={{ 
                                                                padding: '0.4rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 600, 
                                                                border: s.email ? '1px solid var(--success)' : '1px solid var(--border)', 
                                                                color: s.email ? 'var(--success)' : 'var(--text-secondary)',
                                                                background: 'var(--bg-primary)',
                                                                cursor: 'pointer', flex: 1
                                                            }}
                                                        >
                                                            <option value="">No vinculat</option>
                                                            {classroomStudents.map(cs => (
                                                                <option key={cs.profile.emailAddress} value={cs.profile.emailAddress}>
                                                                    {cs.profile.name.fullName}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {s.email && <UserCheck size={16} color="var(--success)" />}
                                                    </div>
                                                ) : s.email ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontWeight: 700, fontSize: '0.8rem' }}>
                                                            <UserCheck size={14} /> Vinculat
                                                        </div>
                                                        <button 
                                                            onClick={() => handleManualLink(s.id, "")}
                                                            className="btn-icon" 
                                                            style={{ color: 'var(--danger)', padding: '2px' }}
                                                            title="Desvincular"
                                                        >
                                                            <XCircle size={14} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                                        <RefreshCw size={14} /> No vinculat
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <span style={{ fontSize: '1.25rem', fontWeight: 900, color: isPass ? 'var(--success)' : 'var(--danger)' }}>
                                                    {scoreData.normalized.toFixed(2)}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                                    <button className="btn-icon" title="Baixar PDF" onClick={() => handleDownloadStudent(s)}>
                                                        <Download size={18} />
                                                    </button>
                                                    <button 
                                                        className="btn-icon" 
                                                        title="Rebre correu de prova (format real)" 
                                                        disabled={!accessToken || isSendingTest}
                                                        onClick={() => handleSendTestEmail(s)}
                                                    >
                                                        <MailCheck size={18} />
                                                    </button>
                                                    <button 
                                                        className="btn-icon" 
                                                        title="Enviar correu a l'alumne" 
                                                        disabled={!s.email || !accessToken || isSendingTest}
                                                        onClick={() => handleSendIndividualEmail(s)}
                                                    >
                                                        <SendIcon size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {isEditingTemplate && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)'
                }}>
                    <div className="card" style={{ width: '600px', maxWidth: '90vw', padding: '2rem' }}>
                        <HandwrittenTitle size="2rem" color="purple" noMargin>Plantilla de Correu</HandwrittenTitle>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                            Aquest és el text que acompanyarà el PDF amb la correcció.
                            <br/><br/>
                            Variables disponibles:<br/>
                            <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>{'{nom}'}</code>, <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>{'{nota}'}</code>, <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>{'{nota_maxima}'}</code>, <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>{'{estat}'}</code>
                        </p>
                        
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, fontSize: '0.9rem' }}>Assumpte</label>
                            <input 
                                value={emailSubjectTemplate}
                                onChange={(e) => setEmailSubjectTemplate(e.target.value)}
                                style={{
                                    width: '100%',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.5rem',
                                    padding: '0.75rem 1rem',
                                    fontSize: '0.95rem',
                                    fontFamily: 'inherit'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, fontSize: '0.9rem' }}>Cos del missatge</label>
                            <textarea
                                value={emailTemplate}
                                onChange={(e) => setEmailTemplate(e.target.value)}
                                style={{
                                    width: '100%', height: '200px',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.75rem',
                                    padding: '1rem',
                                    fontSize: '0.95rem',
                                    resize: 'none',
                                    fontFamily: 'inherit'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                            <button className="btn btn-secondary" onClick={() => { setEmailTemplate(DEFAULT_EMAIL_TEMPLATE); setEmailSubjectTemplate(DEFAULT_EMAIL_SUBJECT); }}>Restaurar defecte</button>
                            <button className="btn btn-primary" onClick={() => setIsEditingTemplate(false)}>Desar i Tancar</button>
                        </div>
                    </div>
                </div>
            )}

            {actionState && !sendingState && (
                <div className="card" style={{
                    position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 9999,
                    width: '320px', padding: '1.25rem 1.5rem',
                    boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.25)',
                    border: '1px solid var(--border)',
                    textAlign: 'center',
                    display: 'flex', flexDirection: 'column', gap: '0.75rem',
                    overflow: 'hidden',
                    background: 'var(--glass-bg)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)'
                }}>
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, height: '6px',
                        background: actionState.type === 'success' ? 'var(--hl-green)' : actionState.type === 'error' ? 'var(--hl-red)' : 'var(--hl-purple)'
                    }} />
                    
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <div style={{ transform: 'rotate(-2deg)' }}>
                            <HandwrittenTitle size="1.8rem" color={actionState.type === 'success' ? 'green' : actionState.type === 'error' ? 'red' : 'purple'} noMargin={true}>
                                {actionState.title}
                            </HandwrittenTitle>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>
                        {actionState.type === 'success' ? <CheckCircle size={16} color="var(--success)" /> : actionState.type === 'error' ? <XCircle size={16} color="var(--danger)" /> : <RefreshCw size={16} className="spin" color="var(--accent)" />}
                        {actionState.text}
                    </div>
                </div>
            )}

            {sendingState && (
                <div className="card" style={{
                    position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 9999,
                    width: '340px', padding: '1.25rem 1.5rem',
                    boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.25)',
                    border: '1px solid var(--border)',
                    textAlign: 'center',
                    display: 'flex', flexDirection: 'column', gap: '1rem',
                    overflow: 'hidden',
                    background: 'var(--glass-bg)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)'
                }}>
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, height: '6px',
                        background: 'var(--hl-blue)'
                    }} />

                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <div style={{ transform: 'rotate(-2deg)' }}>
                            <HandwrittenTitle size="1.8rem" color="blue" noMargin={true}>
                                Enviant correus
                            </HandwrittenTitle>
                        </div>
                    </div>

                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, marginTop: '-0.5rem' }}>
                        {sendingState.done} de {sendingState.total} completats
                    </div>

                    <div style={{ 
                        background: 'var(--bg-secondary)', 
                        padding: '0.75rem', 
                        borderRadius: '0.5rem',
                        fontSize: '0.85rem',
                        color: 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        border: '1px solid var(--border)'
                    }}>
                        <RefreshCw size={14} className="spin" color="var(--accent)" />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
                            {sendingState.current ? `Enviant a ${sendingState.current}...` : 'Preparant...'}
                        </span>
                    </div>

                    <div style={{ 
                        height: '4px', 
                        background: 'var(--bg-secondary)', 
                        borderRadius: '2px',
                        overflow: 'hidden',
                        border: '1px solid var(--border)'
                    }}>
                        <div style={{ 
                            height: '100%', 
                            background: 'var(--accent)', 
                            width: `${(sendingState.done / sendingState.total) * 100}%`,
                            transition: 'width 0.3s ease'
                        }} />
                    </div>
                </div>
            )}
        </div>
    );
}
