import { useState, type ChangeEvent, type DragEvent } from 'react';
import { ChevronRight, ClipboardPaste, FileCheck, RefreshCw, Trash2, Upload, UserCheck, UserMinus, Users, X } from 'lucide-react';
import type { SessionData } from '../../domain/session';
import { parseNameList } from '../../domain/students';
import type { OcrProgress } from '../../app/useNameRecognition';
import type { SessionUpdater } from '../../state/useSessionStore';
import type { ShowConfirm } from '../../state/useDialogs';
import type { ClassroomCourse, ThemeMode } from '../../types';
import CloudToggle from '../common/CloudToggle';
import HandwrittenTitle from '../common/HandwrittenTitle';
import { AccountBadge, AppHeader, BackButton, SessionTitle, ThemeToggle, type AccountProps } from '../common/HeaderParts';

interface Props extends AccountProps {
    session: SessionData;
    update: SessionUpdater;
    numPages: number;
    theme: ThemeMode;
    onToggleTheme: () => void;
    courses: ClassroomCourse[];
    ocrProgress: OcrProgress | null;
    onBack: () => void;
    onNext: () => void;
    onImportClassroom: (courseId: string) => void;
    onSolutionFile: (file: File) => void;
    onInvalidSolution: () => void;
    onRemoveSolution: () => void;
    onToggleCloudPdf: () => void;
    onToggleCloudSolution: () => void;
    showConfirm: ShowConfirm;
}

const inputStyle = { width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', fontSize: '1.25rem', fontWeight: 800, textAlign: 'center' as const };
const labelStyle = { display: 'block', fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase' as const, color: 'var(--text-secondary)', letterSpacing: '0.05em' };

export default function SetupView(props: Props) {
    const { session, update, numPages, theme, onToggleTheme, courses, ocrProgress, onBack, onNext, onImportClassroom, onSolutionFile, onInvalidSolution, onRemoveSolution, onToggleCloudPdf, onToggleCloudSolution, showConfirm, accessToken } = props;

    // Els dos camps estan lligats: canviar-ne un recalcula l'altre en confirmar (Enter o sortir del camp)
    const [pagesText, setPagesText] = useState(String(session.pagesPerExam));
    const [studentsText, setStudentsText] = useState(String(session.students.length || Math.floor(numPages / (session.pagesPerExam || 1))));
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [showPasteArea, setShowPasteArea] = useState(false);
    const [isDraggingSolution, setIsDraggingSolution] = useState(false);

    const commitPages = () => {
        const val = parseInt(pagesText) || 1;
        update({ pagesPerExam: val });
        setStudentsText(String(Math.floor(numPages / val)));
    };
    const commitStudents = () => {
        const per = Math.max(1, Math.floor(numPages / (parseInt(studentsText) || 1)));
        update({ pagesPerExam: per });
        setPagesText(String(per));
    };

    const onSolutionPick = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (file.type === 'application/pdf') onSolutionFile(file);
        else onInvalidSolution();
    };
    const onSolutionDrop = (e: DragEvent) => {
        e.preventDefault();
        setIsDraggingSolution(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        if (file.type === 'application/pdf') onSolutionFile(file);
        else onInvalidSolution();
    };

    const manualNames = parseNameList(session.studentList);

    return (
        <>
            <AppHeader
                style={{ position: 'relative' }}
                leftGap="0.75rem"
                left={<>
                    <BackButton onClick={onBack} />
                    <SessionTitle fileName={session.fileName} alias={session.sessionAlias} onRename={alias => update({ sessionAlias: alias })} />
                </>}
                right={<>
                    <ThemeToggle theme={theme} onToggle={onToggleTheme} />
                    <AccountBadge {...props} />
                    <button className="btn btn-primary" onClick={onNext}>
                        Continuar <ChevronRight size={18} />
                    </button>
                </>}
            >
                {ocrProgress && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'var(--bg-tertiary)', zIndex: 100, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'var(--accent)', width: `${(ocrProgress.current / ocrProgress.total) * 100}%`, transition: 'width 0.3s ease-out', boxShadow: '0 0 10px var(--accent)' }} />
                    </div>
                )}
            </AppHeader>

            <main className="main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ flex: 1, overflowY: 'auto', padding: '3rem 4rem' }}>
                    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3rem', marginBottom: '3.5rem', flexWrap: 'wrap' }}>
                            <HandwrittenTitle size="3rem" color="green">Configuració de l'examen</HandwrittenTitle>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2.5rem', marginBottom: '3.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div className="card" style={{ flex: 1, background: 'var(--bg-tertiary)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <label style={labelStyle}>Pàgines i alumnes</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>Pàgines/Examen</span>
                                            <input type="text" value={pagesText} onChange={e => setPagesText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitPages(); }} onBlur={commitPages} style={inputStyle} />
                                        </div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)', marginTop: '1rem' }}>O</div>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>Total alumnes</span>
                                            <input type="text" value={studentsText} onChange={e => setStudentsText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitStudents(); }} onBlur={commitStudents} style={inputStyle} />
                                        </div>
                                    </div>
                                    <div style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '0.4rem', border: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                                        <span>Total PDF: <strong>{numPages}</strong> pàgines</span>
                                        {accessToken && (
                                            <CloudToggle
                                                on={session.cloudSyncPDF}
                                                onToggle={onToggleCloudPdf}
                                                label={`Núvol ${session.cloudSyncPDF ? 'actiu' : 'desactivat'}`}
                                                style={{ background: 'var(--bg-tertiary)' }}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div
                                    className="card"
                                    onDragOver={e => { e.preventDefault(); setIsDraggingSolution(true); }}
                                    onDragLeave={() => setIsDraggingSolution(false)}
                                    onDrop={onSolutionDrop}
                                    style={{
                                        flex: 1, background: isDraggingSolution ? 'var(--accent-light)' : 'var(--bg-tertiary)',
                                        padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
                                        border: isDraggingSolution ? '2px dashed var(--accent)' : '1px solid transparent',
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    <label style={labelStyle}>Solucionari</label>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1rem' }}>
                                        {!session.solutionFileName ? (
                                            <label className="btn btn-secondary" style={{ width: '100%', cursor: 'pointer', border: '2px dashed var(--border)', background: 'transparent' }}>
                                                <Upload size={18} /> Pujar Solucionari
                                                <input type="file" accept="application/pdf" onChange={onSolutionPick} style={{ display: 'none' }} />
                                            </label>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
                                                    <div style={{ width: '32px', height: '32px', background: 'var(--accent-light)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <FileCheck size={18} color="var(--accent)" />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.solutionFileName}</div>
                                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600 }}>PDF Solucionari</div>
                                                    </div>
                                                    <button className="btn-icon" onClick={onRemoveSolution} style={{ color: 'var(--danger)' }}><Trash2 size={16} /></button>
                                                </div>
                                                {accessToken && (
                                                    <CloudToggle
                                                        on={session.cloudSyncSolution}
                                                        onToggle={onToggleCloudSolution}
                                                        label={`Núvol ${session.cloudSyncSolution ? 'actiu' : 'desactivat'}`}
                                                        size="md"
                                                        labelSize="0.7rem"
                                                        style={{ gap: '0.6rem', padding: '0.4rem 0.8rem', background: 'var(--bg-secondary)', width: 'fit-content', alignSelf: 'center' }}
                                                    />
                                                )}
                                            </div>
                                        )}
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', fontWeight: 500 }}>
                                            {isDraggingSolution ? "Deixa'l anar aquí!" : 'Opcional: Arrossega o puja el PDF de referència.'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div className="card" style={{ flex: 1, background: 'var(--bg-tertiary)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <label style={labelStyle}>Carrega el teu llistat</label>
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
                                                <button className="btn btn-primary" onClick={() => onImportClassroom(selectedCourseId)} disabled={!selectedCourseId} style={{ padding: '0.75rem', borderRadius: '50%', width: '42px', height: '42px', flexShrink: 0 }} title="Sincronitzar ara">
                                                    <RefreshCw size={18} />
                                                </button>
                                            </div>
                                            <button className="btn btn-secondary" style={{ width: '100%', fontSize: '0.85rem' }} onClick={() => setShowPasteArea(true)}>
                                                <ClipboardPaste size={16} /> O enganxar llista manual
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0' }}>Connecta amb Google per importar alumnes de Classroom.</p>
                                            <button className="btn-google" onClick={props.onAuthorize} style={{ width: '100%', justifyContent: 'center' }}>Connecta amb Google</button>
                                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <div style={{ position: 'absolute', left: 0, right: 0, height: '1px', background: 'var(--border)', zIndex: 1 }}></div>
                                                <span style={{ position: 'relative', zIndex: 2, background: 'var(--bg-tertiary)', padding: '0 0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700 }}>O BÉ</span>
                                            </div>
                                            <button onClick={() => setShowPasteArea(true)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                                                Enganxar llista manualment
                                            </button>
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
                                    <textarea value={session.studentList} onChange={e => update({ studentList: e.target.value })} style={{ width: '100%', height: '300px', padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--border)', fontSize: '1rem' }} />
                                    <button className="btn btn-primary" onClick={() => setShowPasteArea(false)}>Guardar llista</button>
                                </div>
                            </div>
                        )}

                        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingLeft: '1rem' }}>
                            <HandwrittenTitle size="2.2rem" color="red">Llistat d'alumnes importats</HandwrittenTitle>
                            {(session.classroomStudents.length > 0 || session.studentList.trim()) && (
                                <button className="btn btn-secondary" style={{ color: 'var(--danger)', fontSize: '0.8rem', padding: '0.4rem 1rem' }} onClick={() => {
                                    showConfirm('Eliminar-ho tot', 'Vols eliminar TOTS els alumnes del llistat?', () => update({ classroomStudents: [], studentList: '' }));
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
                                    {session.classroomStudents.length > 0 ? (
                                        session.classroomStudents.map((cs, i) => (
                                            <tr key={cs.profile?.emailAddress ?? i}>
                                                <td style={{ fontWeight: 800, color: 'var(--text-secondary)' }}>{i + 1}</td>
                                                <td style={{ fontWeight: 700 }}>{cs.profile?.name?.fullName || 'Desconegut'}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontWeight: 600, fontSize: '0.85rem' }}>
                                                        <UserCheck size={14} /> {cs.profile?.emailAddress}
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button className="btn-icon" style={{ color: 'var(--danger)', padding: '4px' }} onClick={() => update(s => ({ classroomStudents: s.classroomStudents.filter((_, idx) => idx !== i) }))}>
                                                        <X size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : manualNames.length ? (
                                        manualNames.map((name, i) => (
                                            <tr key={name}>
                                                <td style={{ fontWeight: 800, color: 'var(--text-secondary)' }}>{i + 1}</td>
                                                <td style={{ fontWeight: 700 }}>{name}</td>
                                                <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>Introduït manualment</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button className="btn-icon" style={{ color: 'var(--danger)', padding: '4px' }} onClick={() => update({ studentList: manualNames.filter((_, idx) => idx !== i).join('\n') })}>
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
            </main>
        </>
    );
}
