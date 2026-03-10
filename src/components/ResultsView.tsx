import { useState, useMemo } from 'react';
import { ChevronLeft, Send, Download, Sun, Moon, UserCheck, RefreshCw, FileDown } from 'lucide-react';
import type { Student, ExerciseDef, AnnotationStore, RubricCountStore } from '../types';
import { exportCombinedPDF, exportStudentPDF } from '../utils/pdfExport';
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
    accessToken, userEmail, onAuthorize, courses, isAuthorizing, classroomStudents,
    showDialog, showConfirm
}: Props) {
    const [isExporting, setIsProcessing] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);

    const stats = useMemo(() => {
        const scores = students.map(s => {
            let total = 0;
            exercises.forEach(ex => {
                if (ex.type === 'crop' || ex.type === 'pages') {
                    const anns = annotations[s.id]?.[ex.id] || [];
                    const rubrics = rubricCounts[s.id]?.[ex.id] || {};
                    let score = (ex.scoringMode ?? 'from_max') === 'from_max' ? (ex.maxScore || 0) : 0;
                    anns.forEach(a => { if (a.score) score += a.score; });
                    Object.entries(rubrics).forEach(([_, count]) => { if (count) score += count * -0.5; });
                    total += Math.max(0, score);
                }
            });
            const maxPossible = exercises.reduce((acc, ex) => acc + (ex.maxScore || 0), 0);
            return maxPossible > 0 ? (total / maxPossible) * targetMaxScore : 0;
        });

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
            await exportStudentPDF(pdfDoc, student, exercises, annotations[student.id] || {}, rubricCounts[student.id] || {}, targetMaxScore);
        } catch (err) {
            showDialog("Error", "Error generant el PDF individual.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleManualLink = (studentId: string, classroomEmail: string) => {
        const updated = students.map(s => s.id === studentId ? { ...s, email: classroomEmail } : s);
        onUpdateStudents(updated);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-primary)' }}>
            <header className="header">
                <div style={{ flex: 1 }}><button className="btn-icon" onClick={onBack} title="Enrere"><ChevronLeft size={28} /></button></div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}><FlowGradingLogo size="2.2rem" /></div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '1.25rem', alignItems: 'center' }}>
                    <button className="btn-icon" onClick={onToggleTheme}>{theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}</button>
                    <button className="btn btn-primary" onClick={handleDownloadAll} disabled={isExporting}>
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
                                    let total = 0;
                                    exercises.forEach(ex => {
                                        if (ex.type === 'crop' || ex.type === 'pages') {
                                            const anns = annotations[s.id]?.[ex.id] || [];
                                            const rubrics = rubricCounts[s.id]?.[ex.id] || {};
                                            let score = (ex.scoringMode ?? 'from_max') === 'from_max' ? (ex.maxScore || 0) : 0;
                                            anns.forEach(a => { if (a.score) score += a.score; });
                                            Object.entries(rubrics).forEach(([_, count]) => { if (count) score += count * -0.5; });
                                            total += Math.max(0, score);
                                        }
                                    });
                                    const maxPossible = exercises.reduce((acc, ex) => acc + (ex.maxScore || 0), 0);
                                    const finalScore = maxPossible > 0 ? (total / maxPossible) * targetMaxScore : 0;
                                    const isPass = finalScore >= targetMaxScore / 2;

                                    return (
                                        <tr key={s.id}>
                                            <td style={{ fontWeight: 800, color: 'var(--text-secondary)' }}>{i + 1}</td>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>{s.name}</span>
                                                    {s.email && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.email}</span>}
                                                </div>
                                            </td>
                                            <td>
                                                {s.email ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontWeight: 700, fontSize: '0.8rem' }}>
                                                        <UserCheck size={14} /> Vinculat
                                                    </div>
                                                ) : classroomStudents.length > 0 ? (
                                                    <select 
                                                        onChange={(e) => handleManualLink(s.id, e.target.value)}
                                                        style={{ padding: '0.3rem 0.6rem', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: 600, border: '1px solid var(--accent)', color: 'var(--accent)', background: 'transparent' }}
                                                        defaultValue=""
                                                    >
                                                        <option value="" disabled>Vincular amb...</option>
                                                        {classroomStudents.map(cs => (
                                                            <option key={cs.profile.emailAddress} value={cs.profile.emailAddress}>{cs.profile.name.fullName}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                                        <RefreshCw size={14} /> No vinculat
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <span style={{ fontSize: '1.25rem', fontWeight: 900, color: isPass ? 'var(--success)' : 'var(--danger)' }}>
                                                    {finalScore.toFixed(2)}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                                    <button className="btn-icon" title="Baixar PDF" onClick={() => handleDownloadStudent(s)}>
                                                        <Download size={18} />
                                                    </button>
                                                    <button className="btn-icon" title="Enviar per correu" disabled={!s.email || !accessToken}>
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
