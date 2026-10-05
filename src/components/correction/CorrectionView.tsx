/**
 * Pantalla de correcció: uneix la capçalera, les eines, el llenç, el banc de comentaris i la barra de notes.
 * Totes les notes es calculen aquí amb `domain/scoring` (la mateixa funció que fa servir l'exportació).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { layoutPages, relayoutAnnotation, relayoutPoint } from '../../domain/pageLayout';
import {
    SCORE_STAMP_ID, buildScoreSummaryLines, computeExerciseScore, computeStudentScore, formatScaledPoints,
    getGradableExercises, getMaxScore, getScaleFactor, getTotalPossiblePoints, hasWork, round2,
} from '../../domain/scoring';
import { DEFAULT_STAMP_SIZE, customStampAnnotation, resolveStamp, type StampPlacement } from '../../domain/stamp';
import { newAnnotationId } from '../../domain/annotations';
import { useStageViewport } from '../../hooks/useStageViewport';
import type { PDFDocumentProxy } from '../../services/pdf/pdfDocument';
import type {
    Annotation, AnnotationComment, AnnotationStore, ExerciseDef, GradableExercise, HighlighterLegendAnnotation,
    PenColor, PresetHighlighter, RubricCountStore, Student, TextAnnotation,
} from '../../types';
import type { AccountProps } from '../common/HeaderParts';
import CommentBankBar from './CommentBankBar';
import CorrectionCanvas, { type EditingText } from './CorrectionCanvas';
import CorrectionHeader from './CorrectionHeader';
import EndScreen from './EndScreen';
import GradingSidebar from './GradingSidebar';
import type { StampData } from './ScoreStamp';
import StampMoveDialog from './StampMoveDialog';
import ToolSidebar from './ToolSidebar';
import { useAnnotationHistory } from './useAnnotationHistory';
import { useCorrectionTools } from './useCorrectionTools';
import { useExerciseRender } from './useExerciseRender';

interface Props extends AccountProps {
    pdfDoc: PDFDocumentProxy;
    solutionPdfDoc?: PDFDocumentProxy | null;
    students: Student[];
    exercises: ExerciseDef[];
    annotations: AnnotationStore;
    rubricCounts: RubricCountStore;
    commentBank: AnnotationComment[];
    targetMaxScore: number;
    onUpdateCommentBank: (bank: AnnotationComment[]) => void;
    onUpdateTargetMaxScore: (score: number) => void;
    stampSize: number;
    onUpdateStampSize: (size: number) => void;
    presets: PresetHighlighter[];
    onUpdatePresets: (presets: PresetHighlighter[]) => void;
    onUpdateAnnotations: (studentId: string, exerciseId: string, annotations: Annotation[]) => void;
    onUpdateRubricCounts: (studentId: string, exerciseId: string, itemId: string, delta: number) => void;
    onUpdateExercise: (exercise: ExerciseDef) => void;
    onBack?: () => void;
    onFinish?: () => void;
    studentIdx: number;
    exerciseIdx: number;
    onUpdateStudentIdx: (idx: number) => void;
    onUpdateExerciseIdx: (idx: number) => void;
    showConfirm: (title: string, message: string, onConfirm: () => void) => void;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
}

/** Tecles de color: Q vermell, W taronja, E blau, R indi, A verd, S negre. */
const COLOR_KEYS: Record<string, PenColor> = {
    q: '#ef4444', w: '#f97316', e: '#3b82f6', r: '#6366f1', a: '#10b981', s: '#000000',
};

const EMPTY_ANNS: Annotation[] = [];
const EMPTY_COUNTS: Record<string, number> = {};

export default function CorrectionView(props: Props) {
    const {
        pdfDoc, students, exercises, annotations, rubricCounts, commentBank, targetMaxScore, presets,
        onUpdateAnnotations, onUpdateRubricCounts, onUpdateExercise, studentIdx, exerciseIdx,
        onUpdateStudentIdx, onUpdateExerciseIdx, showConfirm, theme,
    } = props;
    const isDarkMode = theme === 'dark';

    const gradable = useMemo(() => getGradableExercises(exercises), [exercises]);
    const student = students[studentIdx];
    const exercise = gradable[exerciseIdx] as GradableExercise | undefined;

    const tools = useCorrectionTools();
    const vp = useStageViewport();
    const { render, isLoading } = useExerciseRender(pdfDoc, student, students[studentIdx + 1], exercise, isDarkMode);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState<EditingText | null>(null);
    const [pendingStampComment, setPendingStampComment] = useState<AnnotationComment | null>(null);
    const [pendingStampChange, setPendingStampChange] = useState<StampPlacement | null>(null);
    const stampSize = props.stampSize || DEFAULT_STAMP_SIZE;
    const [isCommentBankExpanded, setIsCommentBankExpanded] = useState(true);

    // --- Anotacions de l'alumne i exercici actuals ---
    const current = (student && exercise ? annotations[student.id]?.[exercise.id] : undefined) ?? EMPTY_ANNS;
    const counts = (student && exercise ? rubricCounts[student.id]?.[exercise.id] : undefined) ?? EMPTY_COUNTS;

    const commit = useCallback((anns: Annotation[]) => {
        if (student && exercise) onUpdateAnnotations(student.id, exercise.id, anns);
    }, [student, exercise, onUpdateAnnotations]);

    const history = useAnnotationHistory(`${student?.id}|${exercise?.id}`, current, commit);
    const { apply } = history;

    // Canviar d'alumne o d'exercici tanca la selecció i l'edició de text
    useEffect(() => {
        setSelectedId(null);
        setEditingText(null);
        setPendingStampChange(null);
    }, [studentIdx, exerciseIdx]);

    // --- Llegenda de fluorescents (una sola caixa en lloc d'etiquetes individuals) ---
    const hasHighlighters = current.some(a => a.type === 'highlighter');
    const hasLegend = current.some(a => a.type === 'highlighter_legend');
    const wantsLegend = tools.highlighterLabelMode === 'legend' && hasHighlighters;
    useEffect(() => {
        if (!student || !exercise) return;
        if (wantsLegend && !hasLegend) {
            const legend: HighlighterLegendAnnotation = { id: newAnnotationId('legend'), type: 'highlighter_legend', x: 100, y: 100, scale: 1 };
            commit([...current, legend]);
        } else if (!wantsLegend && hasLegend) {
            commit(current.filter(a => a.type !== 'highlighter_legend'));
        }
    }, [wantsLegend, hasLegend]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Ajust del zoom quan canvia l'estructura del que es mostra ---
    const fit = useCallback(() => {
        if (!render || !exercise) return;
        const spans = exercise.type === 'pages' && !!exercise.spansTwoPages;
        vp.fitContent(render.bounds, spans ? { fitHeight: true } : { fitHeight: false, topAligned: true });
    }, [render, exercise, vp]);
    const renderKey = render?.key;
    useEffect(() => { fit(); }, [renderKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Notes ---
    const scoringCtx = useMemo(() => ({ presets, commentBank }), [presets, commentBank]);
    const factor = getScaleFactor(exercises, targetMaxScore);
    const totalPossible = getTotalPossiblePoints(exercises);
    const studentScore = student ? computeStudentScore(student.id, exercises, annotations, rubricCounts, targetMaxScore, scoringCtx) : null;
    const exScore = exercise ? computeExerciseScore(exercise, current, counts, scoringCtx) : null;
    const formatPoints = useCallback((p: number) => formatScaledPoints(p, factor), [factor]);

    const correctedIds = useMemo(() => new Set(students
        .filter(st => gradable.some(ex => hasWork(annotations[st.id]?.[ex.id], rubricCounts[st.id]?.[ex.id])))
        .map(st => st.id)), [students, gradable, annotations, rubricCounts]);

    // --- Segell de nota ---
    const stamp: StampData | null = useMemo(() => {
        if (!render || !exercise || !exScore) return null;
        const last = render.placements[render.placements.length - 1];
        const placement = resolveStamp(exercise, current, last ? last.x + last.width : render.bounds.width, render.bounds);
        return {
            ...placement,
            score: round2(exScore.score * factor),
            max: getMaxScore(exercise) * factor,
            lines: buildScoreSummaryLines(exercise, current, counts, presets, factor),
        };
    }, [render, exercise, exScore, current, counts, presets, factor]);

    const stampAll = () => {
        if (!pendingStampChange || !exercise) return;
        onUpdateExercise({ ...exercise, stampX: pendingStampChange.x, stampY: pendingStampChange.y, stampScale: pendingStampChange.scale });
        // La posició pròpia d'aquest alumne deixaria d'aplicar la nova posició comuna
        if (current.some(a => a.id === SCORE_STAMP_ID)) apply(current.filter(a => a.id !== SCORE_STAMP_ID));
        setPendingStampChange(null);
    };
    const stampThisStudent = () => {
        if (!pendingStampChange) return;
        apply([...current.filter(a => a.id !== SCORE_STAMP_ID), customStampAnnotation(pendingStampChange, stampSize)]);
        setPendingStampChange(null);
    };

    // --- Text ---
    const commitTextEdit = useCallback(() => {
        if (!editingText) return;
        const text = editingText.text;
        const existing = current.find(a => a.id === editingText.id) as TextAnnotation | undefined;
        if (!text.trim()) {
            if (existing) apply(current.filter(a => a.id !== existing.id));
        } else if (existing) {
            apply(current.map(a => (a.id === existing.id ? { ...existing, text } : a)));
        } else {
            const ann: TextAnnotation = {
                id: editingText.id || newAnnotationId('text'), type: 'text', x: editingText.x, y: editingText.y,
                width: editingText.width, height: editingText.height, text, color: '#111827', fontSize: tools.commentDefaultSize,
            };
            apply([...current, ann]);
        }
        setEditingText(null);
        tools.setTool('select');
    }, [editingText, current, apply, tools]);

    const deleteSelected = useCallback(() => {
        if (!selectedId) return;
        apply(current.filter(a => a.id !== selectedId));
        setSelectedId(null);
    }, [selectedId, current, apply]);

    // --- Mode "complet" (dues pàgines en paral·lel): es recol·loquen les anotacions de tots els alumnes ---
    const toggleSpans = () => {
        if (!exercise || exercise.type !== 'pages' || !render) return;
        const spans = !exercise.spansTwoPages;
        const slots = render.placements.map(p => ({ order: p.order, size: { width: p.width, height: p.height } }));
        const from = render.placements;
        const to = layoutPages(slots, spans);
        for (const st of students) {
            const anns = annotations[st.id]?.[exercise.id];
            if (anns?.length) onUpdateAnnotations(st.id, exercise.id, anns.map(a => relayoutAnnotation(a, from, to)));
        }
        let next: GradableExercise = { ...exercise, spansTwoPages: spans };
        if (exercise.stampX !== undefined && exercise.stampY !== undefined) {
            const pt = relayoutPoint({ x: exercise.stampX, y: exercise.stampY }, from, to);
            next = { ...next, stampX: pt.x, stampY: pt.y };
        }
        onUpdateExercise(next);
        // El zoom s'ajusta sol quan arriba el nou render (canvia la clau)
    };

    const clearAll = () => showConfirm('Eliminar anotacions', "Vols eliminar TOTES les anotacions d'aquest exercici?", () => {
        apply([]);
        setSelectedId(null);
    });

    // --- Teclat (un sol gestor) ---
    const keyState = useRef({ current, selectedId, editingText, studentIdx, exerciseIdx });
    keyState.current = { current, selectedId, editingText, studentIdx, exerciseIdx };
    const keyActions = useRef({ deleteSelected, commitTextEdit, undo: history.undo, redo: history.redo });
    keyActions.current = { deleteSelected, commitTextEdit, undo: history.undo, redo: history.redo };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
            const st = keyState.current;
            const act = keyActions.current;
            const key = e.key.toLowerCase();
            const mod = e.ctrlKey || e.metaKey;

            if (mod && key === 'z') {
                e.preventDefault();
                if (e.shiftKey) act.redo(); else act.undo();
                return;
            }
            if (mod && key === 'y') { e.preventDefault(); act.redo(); return; }
            if (mod || e.altKey) return;

            if (key === 'delete' || key === 'backspace') {
                if (!st.editingText) act.deleteSelected();
                return;
            }
            if (key === 'escape') {
                if (st.editingText) act.commitTextEdit(); else setSelectedId(null);
                return;
            }

            switch (key) {
                case 'v': tools.setTool('select'); return;
                case 'p': tools.setTool('pen'); setSelectedId(null); return;
                case 'x': tools.setTool('eraser'); setSelectedId(null); return;
                case 't': tools.setTool('text'); setSelectedId(null); return;
                case 'h': tools.setTool('highlighter'); tools.setActivePresetId(null); setSelectedId(null); return;
            }

            if (COLOR_KEYS[key]) {
                const hex = COLOR_KEYS[key];
                if (tools.tool === 'highlighter') {
                    const n = parseInt(hex.slice(1), 16);
                    tools.setHighlighterColor(`rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.4)`);
                    tools.setActivePresetId(null);
                } else {
                    tools.setPenColor(hex);
                    tools.setTool('pen');
                }
                return;
            }

            if (/^[1-9]$/.test(key)) {
                const exId = gradable[st.exerciseIdx]?.id;
                const ordered = [...presets.filter(p => !p.exerciseId), ...presets.filter(p => p.exerciseId === exId)];
                const preset = ordered[Number(key) - 1];
                if (preset) {
                    tools.setTool('highlighter');
                    tools.setActivePresetId(preset.id);
                    setSelectedId(null);
                }
                return;
            }

            if (key === ' ' || key === 'arrowright') {
                e.preventDefault();
                if (st.studentIdx < students.length - 1) onUpdateStudentIdx(st.studentIdx + 1);
            } else if (key === 'arrowleft') {
                e.preventDefault();
                if (st.studentIdx > 0) onUpdateStudentIdx(st.studentIdx - 1);
            } else if (key === 'arrowdown') {
                e.preventDefault();
                if (st.exerciseIdx < gradable.length - 1) onUpdateExerciseIdx(st.exerciseIdx + 1);
            } else if (key === 'arrowup') {
                e.preventDefault();
                if (st.exerciseIdx > 0) onUpdateExerciseIdx(st.exerciseIdx - 1);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [tools, presets, gradable, students.length, onUpdateStudentIdx, onUpdateExerciseIdx]);

    // --- Pantalla final ---
    if (!student || !exercise || !studentScore || !exScore) {
        return (
            <EndScreen
                hasNoExercises={exercises.length === 0}
                onBack={() => props.onBack?.()}
                onRestart={() => { onUpdateStudentIdx(0); onUpdateExerciseIdx(0); }}
            />
        );
    }

    const noOp = () => undefined;
    const back = props.onBack ?? noOp;

    return (
        <div style={{ display: 'flex', width: '100%', flex: 1, flexDirection: 'column', minHeight: 0 }}>
            {pendingStampChange && (
                <StampMoveDialog onAll={stampAll} onThisStudent={stampThisStudent} onCancel={() => setPendingStampChange(null)} />
            )}

            <CorrectionHeader
                exercises={gradable}
                exerciseIdx={exerciseIdx}
                onExerciseIdx={onUpdateExerciseIdx}
                spansTwoPages={exercise.type === 'pages' && !!exercise.spansTwoPages}
                onToggleSpans={toggleSpans}
                theme={theme}
                onToggleTheme={props.onToggleTheme}
                onBack={back}
                onFinish={props.onFinish ?? noOp}
                accessToken={props.accessToken}
                userEmail={props.userEmail}
                userPicture={props.userPicture}
                onAuthorize={props.onAuthorize}
                onLogout={props.onLogout}
            />

            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <ToolSidebar
                    tools={tools}
                    stampSize={stampSize}
                    onStampSize={props.onUpdateStampSize}
                    onClearAll={clearAll}
                    onUndo={history.undo}
                    canUndo={history.canUndo}
                    onDeleteSelected={deleteSelected}
                    hasSelection={!!selectedId}
                    onDeselect={() => setSelectedId(null)}
                />

                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', position: 'relative', background: 'var(--bg-primary)' }}>
                    <CorrectionCanvas
                        vp={vp}
                        render={render}
                        isLoading={isLoading}
                        student={student}
                        exercise={exercise}
                        annotations={current}
                        apply={apply}
                        commit={commit}
                        pushHistory={history.push}
                        tools={tools}
                        presets={presets}
                        isDarkMode={isDarkMode}
                        selectedId={selectedId}
                        setSelectedId={setSelectedId}
                        editingText={editingText}
                        setEditingText={setEditingText}
                        commitTextEdit={commitTextEdit}
                        pendingStampComment={pendingStampComment}
                        clearPendingStampComment={() => setPendingStampComment(null)}
                        onCommentDragEnd={noOp}
                        stamp={stamp}
                        stampSize={stampSize}
                        onStampMoved={setPendingStampChange}
                        formatPoints={formatPoints}
                        scaleFactor={factor}
                        onFit={fit}
                        isCommentBankExpanded={isCommentBankExpanded}
                        onToggleCommentBank={() => setIsCommentBankExpanded(v => !v)}
                        onBack={back}
                        onTryNextStudent={() => { if (studentIdx < students.length - 1) onUpdateStudentIdx(studentIdx + 1); }}
                    />
                    <CommentBankBar
                        expanded={isCommentBankExpanded}
                        exerciseId={exercise.id}
                        exerciseNumber={exerciseIdx + 1}
                        commentBank={commentBank}
                        onUpdateCommentBank={props.onUpdateCommentBank}
                        isDarkMode={isDarkMode}
                        pendingStampComment={pendingStampComment}
                        onTogglePendingStamp={c => setPendingStampComment(prev => (prev?.id === c.id ? null : c))}
                        annotations={current}
                        apply={apply}
                        selectedId={selectedId}
                        setSelectedId={setSelectedId}
                    />
                </div>

                <GradingSidebar
                    rawTotal={studentScore.raw}
                    totalPossible={totalPossible}
                    targetMaxScore={targetMaxScore}
                    onTargetMaxScore={props.onUpdateTargetMaxScore}
                    factor={factor}
                    students={students}
                    studentIdx={studentIdx}
                    onStudentIdx={onUpdateStudentIdx}
                    correctedIds={correctedIds}
                    annotations={current}
                    apply={apply}
                    selectedId={selectedId}
                    onDeleteSelected={deleteSelected}
                    exercise={exercise}
                    exerciseIdx={exerciseIdx}
                    exerciseScore={exScore.score}
                    onUpdateExercise={ex => onUpdateExercise(ex)}
                    rubricCounts={counts}
                    onRubricDelta={(itemId, delta) => onUpdateRubricCounts(student.id, exercise.id, itemId, delta)}
                    highlightPoints={exScore.highlights}
                    commentPoints={exScore.comments}
                    presets={presets}
                    onUpdatePresets={props.onUpdatePresets}
                    tools={tools}
                    onDeselect={() => setSelectedId(null)}
                />
            </div>
        </div>
    );
}
