import { useState, useMemo } from 'react';
import { ChevronLeft, Mail, Send, CheckCircle2, Download, Sun, Moon, Trophy, UserCheck, RefreshCw, MailQuestion, CheckCircle, FileDown, Layers } from 'lucide-react';
import type { Student, ExerciseDef, AnnotationStore, RubricCountStore } from '../types';
import { generateStudentPDF, exportAnnotatedPDF } from '../utils/pdfExport';
import type { PDFDocumentProxy } from '../utils/pdfUtils';
import FlowGradingLogo from './FlowGradingLogo';
import HandwrittenTitle from './HandwrittenTitle';
import Highlighter from './Highlighter';

interface Props {
    pdfDoc: PDFDocumentProxy;
    students: Student[];
    exercises: ExerciseDef[];
    annotations: AnnotationStore;
    rubricCounts: RubricCountStore;
    targetMaxScore: number;
    onUpdateStudents: (students: Student[]) => void;
    onBack: () => void;
    accessToken?: string | null;
    userEmail?: string | null;
    onAuthorize?: () => void;
    courses?: any[];
    isAuthorizing?: boolean;
    theme?: 'light' | 'dark';
    onToggleTheme?: () => void;
    classroomStudents?: any[];
}

export default function ResultsView({ pdfDoc, students, exercises, annotations, rubricCounts, targetMaxScore, onUpdateStudents, onBack, accessToken, userEmail, onAuthorize, courses = [], isAuthorizing, theme, onToggleTheme, classroomStudents = [] }: Props) {
    const [sendStatuses, setSendStatuses] = useState<Record<string, 'pending' | 'sending' | 'success' | 'error'>>({});
    const [isSendingAll, setIsSendingAll] = useState(false);
    const [isExportingAll, setIsExportingAll] = useState(false);

    const calculateScore = (studentId: string) => {
        const gradable = exercises.filter(ex => ex.type === 'crop' || ex.type === 'pages');
        let total = 0;
        gradable.forEach(ex => {
            const anns = annotations[studentId]?.[ex.id] || [];
            const exRubric = rubricCounts[studentId]?.[ex.id] || {};
            const adjustment = anns.reduce((sum: number, ann: any) => sum + (ann.points || 0), 0);
            let exScore = 0;
            if (ex.scoringMode === 'from_zero' && ex.rubric) {
                exScore = ex.rubric.reduce((sum: number, item: any) => sum + (item.points * (exRubric[item.id] ?? 0)), 0) + adjustment;
            } else {
                exScore = (ex.maxScore || 0) + adjustment;
            }
            total += Math.max(0, exScore);
        });
        const maxPossible = gradable.reduce((sum, ex) => sum + (ex.maxScore || 0), 0);
        return maxPossible > 0 ? (total * targetMaxScore / maxPossible) : 0;
    };

    const stats = useMemo(() => {
        const scores = students.map(s => calculateScore(s.id));
        const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : "0.00";
        const withEmail = students.filter(s => !!s.email).length;
        return { avg, withEmail };
    }, [students, exercises, annotations, rubricCounts, targetMaxScore]);

    const downloadAll = async () => {
        setIsExportingAll(true);
        try {
            const blob = await exportAnnotatedPDF(pdfDoc, students, exercises, annotations, rubricCounts, targetMaxScore);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Correccions_Totals_${new Date().toISOString().slice(0,10)}.pdf`;
            a.click();
        } catch (e) {
            alert("Error exportant el PDF complet");
        } finally {
            setIsExportingAll(false);
        }
    };

    const sendEmail = async (student: Student) => {
        if (!accessToken || !student.email) return;
        setSendStatuses(prev => ({ ...prev, [student.id]: 'sending' }));
        try {
            const scoreValue = calculateScore(student.id).toFixed(2);
            const gradableEx = exercises.filter(ex => ex.type === 'crop' || ex.type === 'pages');
            const maxPossible = gradableEx.reduce((sum, ex) => sum + (ex.maxScore || 0), 0);
            const scale = maxPossible > 0 ? (targetMaxScore / maxPossible) : 1;
            
            const pdfBlob = await generateStudentPDF(pdfDoc, student, exercises, annotations, rubricCounts, scale);
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve) => {
                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                reader.readAsDataURL(pdfBlob);
            });

            const subject = `Nota examen: ${student.name}`;
            const body = `Hola ${student.name},\n\nLa teva nota de l'examen és: ${scoreValue} / ${targetMaxScore}.\n\nT'adjuntem el PDF amb la correcció detallada.\n\nSalutacions,\nEl teu professor.`;
            const boundary = "foo_bar_baz";
            const emailContent = [
                `To: ${student.email}`, `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
                'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
                `--${boundary}`, 'Content-Type: text/plain; charset=utf-8', '', body, '',
                `--${boundary}`, `Content-Type: application/pdf; name="Correccio_${student.name.replace(/\s+/g, '_')}.pdf"`,
                'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="Correccio_${student.name.replace(/\s+/g, '_')}.pdf"`, '',
                base64, '', `--${boundary}--`
            ].join('\r\n');

            const encoded = btoa(unescape(encodeURIComponent(emailContent))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
                method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw: encoded })
            });
            setSendStatuses(prev => ({ ...prev, [student.id]: 'success' }));
        } catch {
            setSendStatuses(prev => ({ ...prev, [student.id]: 'error' }));
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-primary)' }}>
            <header className="header">
                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                    <button className="btn btn-secondary" onClick={onBack} style={{ padding: '0.4rem 0.8rem' }}><ChevronLeft size={18} /> Enrere</button>
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                    <FlowGradingLogo size="2rem" />
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '1rem', alignItems: 'center' }}>
                    {onToggleTheme && <button className="btn-icon" onClick={onToggleTheme}>{theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}</button>}
                    <button className="btn btn-secondary" onClick={downloadAll} disabled={isExportingAll}><Layers size={18} /> Descarregar tots</button>
                    <button className="btn btn-primary" onClick={() => setIsSendingAll(true)} disabled={!accessToken || stats.withEmail === 0}><Send size={18} /> Enviar tot</button>
                </div>
            </header>

            <main style={{ flex: 1, overflow: 'auto', padding: '2.5rem' }}>
                <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                    <div style={{ marginBottom: '3rem' }}>
                        <HandwrittenTitle size="3rem">Resultats i enviament</HandwrittenTitle>
                        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '1.1rem' }}>Revisa les notes finals i envia les correccions.</p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem', border: '1px solid var(--border)' }}>
                            <div style={{ padding: '0.75rem', background: 'var(--accent-light)', borderRadius: '1rem', color: 'var(--accent)' }}><UserCheck size={28} /></div>
                            <div><div style={{ fontSize: '1.75rem', fontWeight: 900 }}>{students.length}</div><div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Alumnes totals</div></div>
                        </div>
                        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem', border: '1px solid var(--border)' }}>
                            <div style={{ padding: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '1rem', color: '#10b981' }}><Trophy size={28} /></div>
                            <div><div style={{ fontSize: '1.75rem', fontWeight: 900 }}>{stats.avg}</div><div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Mitjana classe</div></div>
                        </div>
                        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem', border: '1px solid var(--border)' }}>
                            <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '1rem', color: 'var(--text-secondary)' }}><Mail size={28} /></div>
                            <div><div style={{ fontSize: '1.75rem', fontWeight: 900 }}>{stats.withEmail}</div><div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Amb correu</div></div>
                        </div>
                    </div>

                    <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)', borderRadius: '1.5rem' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead style={{ background: 'var(--bg-tertiary)' }}>
                                <tr>
                                    <th style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Alumne / OCR</th>
                                    <th style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Vinculació Classroom</th>
                                    <th style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)', textAlign: 'center' }}>Nota</th>
                                    <th style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)', textAlign: 'right' }}>Accions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map((student, idx) => {
                                    const scoreValue = calculateScore(student.id);
                                    const status = sendStatuses[student.id];
                                    return (
                                        <tr key={student.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--bg-tertiary)05' }}>
                                            <td style={{ padding: '1rem 1.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    {student.nameCropUrl && <img src={student.nameCropUrl} alt="OCR" style={{ height: '32px', borderRadius: '6px', border: '1px solid var(--border)', background: 'white' }} />}
                                                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>{student.name}</div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <select 
                                                        value={student.email || ''} 
                                                        onChange={e => {
                                                            const email = e.target.value;
                                                            const classroomStudent = classroomStudents.find(cs => cs.profile.emailAddress === email);
                                                            onUpdateStudents(students.map(s => s.id === student.id ? { ...s, email, name: classroomStudent ? classroomStudent.profile.name.fullName : s.name } : s));
                                                        }}
                                                        style={{ fontSize: '0.85rem', padding: '0.4rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: '100%' }}
                                                    >
                                                        <option value="">No vinculat</option>
                                                        {classroomStudents.map(cs => <option key={cs.profile.emailAddress} value={cs.profile.emailAddress}>{cs.profile.name.fullName} ({cs.profile.emailAddress})</option>)}
                                                    </select>
                                                    {student.email ? <CheckCircle size={18} color="var(--success)" /> : <MailQuestion size={18} color="var(--danger)" />}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                                                <Highlighter color={scoreValue >= targetMaxScore/2 ? 'green' : 'red'} textStyle={{ fontSize: '1.25rem', fontWeight: 900 }}>{scoreValue.toFixed(2)}</Highlighter>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                                                    {status === 'success' ? <div style={{ color: 'var(--success)', display:'flex', alignItems:'center', gap:'4px', fontWeight: 800 }}><CheckCircle2 size={20} /> Enviat</div> :
                                                        <button className="btn btn-icon" onClick={() => sendEmail(student)} disabled={!accessToken || !student.email || status === 'sending'} style={{ color: 'var(--accent)', background: 'var(--accent-light)' }} title="Enviar correu"><Send size={18} /></button>
                                                    }
                                                    <button className="btn btn-icon" onClick={async () => {
                                                        const gradableEx = exercises.filter(ex => ex.type === 'crop' || ex.type === 'pages');
                                                        const maxPossible = gradableEx.reduce((sum, ex) => sum + (ex.maxScore || 0), 0);
                                                        const scale = maxPossible > 0 ? (targetMaxScore / maxPossible) : 1;
                                                        const blob = await generateStudentPDF(pdfDoc, student, exercises, annotations, rubricCounts, scale);
                                                        const url = URL.createObjectURL(blob);
                                                        const a = document.createElement('a'); a.href = url; a.download = `Correccio_${student.name.replace(/\s+/g, '_')}.pdf`; a.click();
                                                    }} style={{ background: 'var(--bg-tertiary)' }} title="Baixar PDF"><FileDown size={18} /></button>
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
