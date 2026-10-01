import { useCallback, useRef, useState } from 'react';
import type { Annotation } from '../../types';

const MAX_STEPS = 20;

/**
 * Historial per desfer (Ctrl+Z), separat per alumne i exercici.
 * Abans era un sol historial global: desfer després de canviar d'exercici hi copiava les anotacions d'un altre.
 */
export function useAnnotationHistory(key: string, current: Annotation[], commit: (anns: Annotation[]) => void) {
    const [stacks, setStacks] = useState<Record<string, Annotation[][]>>({});
    const lastCoalesce = useRef<string | null>(null);

    const push = useCallback((snapshot: Annotation[]) => {
        setStacks(prev => ({ ...prev, [key]: [...(prev[key] ?? []).slice(-(MAX_STEPS - 1)), snapshot] }));
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

    const stack = stacks[key];
    const undo = useCallback(() => {
        if (!stack?.length) return;
        lastCoalesce.current = null;
        setStacks(prev => ({ ...prev, [key]: stack.slice(0, -1) }));
        commit(stack[stack.length - 1]);
    }, [key, stack, commit]);

    return { apply, push, undo, canUndo: (stack?.length ?? 0) > 0 };
}
