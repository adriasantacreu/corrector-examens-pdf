import { useState, useMemo } from 'react';
import { ChevronLeft, Send, Download, Sun, Moon, UserCheck, RefreshCw, FileDown, XCircle, MailCheck } from 'lucide-react';
import type { Student, ExerciseDef, AnnotationStore, RubricCountStore } from '../types';
import { exportCombinedPDF, exportStudentPDF, generateStudentPDF } from '../utils/pdfExport';
import { calculateStudentScore } from '../utils/scoreUtils';
import HandwrittenTitle from './HandwrittenTitle';
import FlowGradingLogo from './FlowGradingLogo';

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
    showDialog: (title: string, message: string) => void;
    showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

export default function ResultsView({
    pdfDoc, students, exercises, annotations, rubricCounts, targetMaxScore,
    onUpdateStudents, onBack, theme, onToggleTheme,
    accessToken, userEmail, classroomStudents,
    showDialog, showConfirm
}: Props) {
    const [isExporting, setIsProcessing] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [isSendingTest, setIsSendingTest] = useState(false);

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
            showDialog("Èxit", "PDF combinat generat correctament.");
        } catch (err) {
            console.error(err);
            showDialog("Error", "Error exportant el PDF complet.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownloadStudent = async (student: Student) => {
        setIsProcessing(true);
        try {
            await exportStudentPDF(pdfDoc, student, exercises, annotations as any, rubricCounts, targetMaxScore);
        } catch (err) {
            showDialog("Error", "Error generant el PDF individual.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleManualLink = (studentId: string, classroomEmail: string) => {
        const updated = students.map(s => s.id === studentId ? { ...s, email: classroomEmail || undefined } : s);
        onUpdateStudents(updated);
    };

    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = (reader.result as string).split(',')[1];
                resolve(base64String);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const handleSendTestEmail = async () => {
        if (!accessToken || !userEmail) {
            showDialog("Error", "Has d'estar connectat per enviar un correu de prova.");
            return;
        }

        if (students.length === 0) {
            showDialog("Error", "No hi ha alumnes per generar un examen de prova.");
            return;
        }

        setIsSendingTest(true);
        try {
            // Generate PDF for the first student as a test
            const testStudent = students[0];
            const pdfBlob = await generateStudentPDF(pdfDoc, testStudent, exercises, annotations, rubricCounts, 1);
            const base64Pdf = await blobToBase64(pdfBlob);
            const fileName = `test_correccio_${testStudent.name.replace(/\s+/g, '_')}.pdf`;

            const boundary = "foo_bar_baz";
            const subject = "Prova d'enviament amb adjunt - FlowGrading";
            
            const messageParts = [
                `To: ${userEmail}`,
                `Subject: ${subject}`,
                'MIME-Version: 1.0',
                `Content-Type: multipart/mixed; boundary="${boundary}"`,
                '',
                `--${boundary}`,
                'Content-Type: text/plain; charset="UTF-8"',
                'Content-Transfer-Encoding: 7bit',
                '',
                `Hola!\n\nAixò és un correu de prova de FlowGrading que inclou la correcció de l'alumne ${testStudent.name} com a fitxer adjunt.\n\nSi reps aquest correu amb el PDF correcte, ja pots enviar les correccions als teus alumnes.`,
                '',
                `--${boundary}`,
                `Content-Type: application/pdf; name="${fileName}"`,
                'Content-Transfer-Encoding: base64',
                `Content-Disposition: attachment; filename="${fileName}"`,
                '',
                base64Pdf,
                `--${boundary}--`
            ];

            const rawMessage = messageParts.join('\r\n');
            const encodedMessage = btoa(unescape(encodeURIComponent(rawMessage)))
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

            if (response.ok) {
                showDialog("Test enviat", `S'ha enviat un correu de prova a ${userEmail} amb l'examen de ${testStudent.name} adjunt.`);
            } else {
                const err = await response.json();
                throw new Error(err.error?.message || "Error desconegut");
            }
        } catch (err: any) {
            console.error("Error sending test email:", err);
            showDialog("Error d'enviament", `No s'ha pogut enviar el correu: ${err.message}`);
        } finally {
            setIsSendingTest(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-primary)' }}>
            <header className="header">
                <div style={{ flex: 1 }}><button className="btn-icon" onClick={onBack} title="Enrere"><ChevronLeft size={28} /></button></div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}><FlowGradingLogo size="2.2rem" /></div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '1rem', alignItems: 'center' }}>
                    <button className="btn-icon" onClick={onToggleTheme}>{theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}</button>
                    
                    <button 
                        className="btn btn-secondary" 
                        onClick={handleSendTestEmail} 
                        disabled={isSendingTest || !accessToken}
                        style={{ height: '42px', fontSize: '0.85rem' }}
                    >
                        {isSendingTest ? <RefreshCw size={16} className="spin" /> : <MailCheck size={16} />}
                        Enviar-me test (amb PDF)
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
                        <HandwrittenTitle size="3.5rem" color="green">Resultats i Exportació</HandwrittenTitle>
                        
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
                        <HandwrittenTitle size="2.2rem" color="purple">Llistat de qualificacions</HandwrittenTitle>
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
                                                        title="Enviar per correu" 
                                                        disabled={!s.email || !accessToken}
                                                        onClick={() => showConfirm("Enviar correu", `Vols enviar la correcció a ${s.name} (${s.email})?`, () => {
                                                            showDialog("Properament", "Aquesta funcionalitat s'implementarà aviat.");
                                                        })}
                                                    >
                                                        <Send size={18} />
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
        </div>
    );
}
