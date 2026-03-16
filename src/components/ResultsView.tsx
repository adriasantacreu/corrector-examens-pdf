import { useState, useMemo } from 'react';
import { ChevronLeft, Download, Sun, Moon, UserCheck, RefreshCw, FileDown, XCircle, MailCheck, MessageSquareText, Send as SendIcon } from 'lucide-react';
import type { Student, ExerciseDef, AnnotationStore, RubricCountStore } from '../types';
import { exportCombinedPDF, exportStudentPDF, generateStudentPDF } from '../utils/pdfExport';
import { calculateStudentScore } from '../utils/scoreUtils';
import HandwrittenTitle from './HandwrittenTitle';
import FlowGradingLogo from './FlowGradingLogo';

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
}

export default function ResultsView({
    pdfDoc, students, exercises, annotations, rubricCounts, targetMaxScore,
    onUpdateStudents, onBack, theme, onToggleTheme,
    accessToken, userEmail, classroomStudents,
    showAlert, showConfirm
}: Props) {
    const [isExporting, setIsProcessing] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [isSendingTest, setIsSendingTest] = useState(false);
    const [sendingState, setSendingState] = useState<{ current: string, done: number, total: number } | null>(null);
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
        try {
            await exportCombinedPDF(pdfDoc, students, exercises, annotations, rubricCounts, targetMaxScore, (p) => setExportProgress(p));
            showAlert("Èxit", "PDF combinat generat correctament.");
        } catch (err) {
            console.error(err);
            showAlert("Error", "Error exportant el PDF complet.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownloadStudent = async (student: Student) => {
        setIsProcessing(true);
        try {
            await exportStudentPDF(pdfDoc, student, exercises, annotations as any, rubricCounts, targetMaxScore);
        } catch (err) {
            showAlert("Error", "Error generant el PDF individual.");
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

        const subject = `Correcció - FlowGrading: ${student.name}${isTest ? ' (Prova)' : ''}`;
        
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
            showAlert("Error", "Has d'estar connectat per enviar un correu de prova.");
            return;
        }

        setIsSendingTest(true);
        try {
            await sendEmailForStudent(student, true);
            showAlert("Test enviat", `S'ha enviat el correu de prova del format de l'alumne ${student.name} a la teva bústia.`);
        } catch (err: any) {
            showAlert("Error d'enviament", `No s'ha pogut enviar el correu: ${err.message}`);
        } finally {
            setIsSendingTest(false);
        }
    };

    const handleSendIndividualEmail = async (student: Student) => {
        if (!accessToken || !student.email) return;
        
        showConfirm("Enviar correu", `Vols enviar definitivament la correcció a ${student.name} (${student.email})?`, async () => {
            setIsSendingTest(true);
            try {
                await sendEmailForStudent(student, false);
                showAlert("Enviat", `S'ha enviat la correcció a ${student.name} amb èxit.`);
            } catch (err: any) {
                showAlert("Error", `No s'ha pogut enviar: ${err.message}`);
            } finally {
                setIsSendingTest(false);
            }
        });
    };

    const handleMassSend = async () => {
        if (!accessToken) {
            showAlert("Error", "Has d'estar connectat per enviar correus.");
            return;
        }
        const studentsWithEmail = students.filter(s => s.email);
        if (studentsWithEmail.length === 0) {
            showAlert("Error", "Cap alumne té un correu vinculat.");
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
            showAlert("Enviament completat", `S'han enviat ${successCount} de ${studentsWithEmail.length} correus correctament.`);
        });
    };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-primary)' }}>
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

            <main style={{ flex: 1, overflowY: 'auto', padding: '3rem 4rem' }}>
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
                        
                        <textarea
                            value={emailTemplate}
                            onChange={(e) => setEmailTemplate(e.target.value)}
                            style={{
                                width: '100%', height: '250px',
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

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                            <button className="btn btn-secondary" onClick={() => setEmailTemplate(DEFAULT_EMAIL_TEMPLATE)}>Restaurar defecte</button>
                            <button className="btn btn-primary" onClick={() => setIsEditingTemplate(false)}>Desar i Tancar</button>
                        </div>
                    </div>
                </div>
            )}

            {sendingState && (
                <div className="card" style={{
                    position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 9999,
                    width: '320px', padding: '1.5rem',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                    border: '1px solid var(--border)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <RefreshCw size={24} className="spin" color="var(--accent)" />
                        <div>
                            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Enviant correus</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{sendingState.done} de {sendingState.total} completats</div>
                        </div>
                    </div>
                    <div style={{ 
                        background: 'var(--bg-secondary)', 
                        padding: '0.75rem', 
                        borderRadius: '0.5rem',
                        fontSize: '0.85rem',
                        color: 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}>
                        <SendIcon size={14} opacity={0.5} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {sendingState.current ? `Enviant a ${sendingState.current}...` : 'Preparant...'}
                        </span>
                    </div>
                    <div style={{ 
                        marginTop: '1rem', 
                        height: '4px', 
                        background: 'var(--bg-secondary)', 
                        borderRadius: '2px',
                        overflow: 'hidden'
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
