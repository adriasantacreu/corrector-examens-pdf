import { useCallback, useRef, useState } from 'react';
import type { Annotation } from '../../types';

const MAX_STEPS = 20;

interface Stacks {
    past: Annotation[][];
    future: Annotation[][];
}

const EMPTY: Stacks = { past: [], future: [] };

/**
 * Historial per desfer (Ctrl+Z) i refer (Ctrl+Shift+Z), separat per alumne i exercici.
 * Abans era un sol historial global: desfer després de canviar d'exercici hi copiava les anotacions d'un altre.
 */
export function useAnnotationHistory(key: string, current: Annotation[], commit: (anns: Annotation[]) => void) {
    const [stacks, setStacks] = useState<Record<string, Stacks>>({});
    const lastCoalesce = useRef<string | null>(null);

    const push = useCallback((snapshot: Annotation[]) => {
        setStacks(prev => {
            const s = prev[key] ?? EMPTY;
            return { ...prev, [key]: { past: [...s.past.slice(-(MAX_STEPS - 1)), snapshot], future: [] } };
        });
    }, [key]);

    /**
     * Desa un canvi deixant-ne rastre a l'historial. Si `coalesce` coincideix amb el del canvi anterior
     * (p. ex. escriure lletra a lletra al mateix comentari), no s'hi afegeix un pas nou.
     */
    const apply = useCallback((next: Annotation[], coalesce?: string) => {
        if (!coalesce || coalesce !== lastCoalesce.current) push(current);
        lastCoalesce.current = coalesce ?? null;
        commit(next);
    }, [current, commit, push]);

    const s = stacks[key] ?? EMPTY;

    const undo = useCallback(() => {
        if (!s.past.length) return;
        lastCoalesce.current = null;
        setStacks(prev => ({ ...prev, [key]: { past: s.past.slice(0, -1), future: [...s.future, current] } }));
        commit(s.past[s.past.length - 1]);
    }, [key, s, current, commit]);

    const redo = useCallback(() => {
        if (!s.future.length) return;
        lastCoalesce.current = null;
        setStacks(prev => ({ ...prev, [key]: { past: [...s.past, current], future: s.future.slice(0, -1) } }));
        commit(s.future[s.future.length - 1]);
    }, [key, s, current, commit]);

    return { apply, push, undo, redo, canUndo: s.past.length > 0, canRedo: s.future.length > 0 };
}
