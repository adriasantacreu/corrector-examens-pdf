import { useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../../config/constants';
import type { PenColor, ToolType } from '../../types';

const TOOLS: ToolType[] = ['select', 'pen', 'highlighter', 'text', 'eraser'];

function usePersistentState<T>(key: string, read: (raw: string | null) => T): [T, (v: T | ((p: T) => T)) => void] {
    const [value, setValue] = useState<T>(() => read(localStorage.getItem(key)));
    useEffect(() => { localStorage.setItem(key, String(value)); }, [key, value]);
    return [value, setValue];
}

/** Eina activa i preferències de dibuix (es recorden entre sessions). */
export function useCorrectionTools() {
    const [tool, setTool] = usePersistentState<ToolType>(STORAGE_KEYS.lastTool, r => (TOOLS.includes(r as ToolType) ? r as ToolType : 'pen'));
    const [penColor, setPenColor] = usePersistentState<PenColor>(STORAGE_KEYS.lastPenColor, r => r || '#ef4444');
    const [highlighterColor, setHighlighterColor] = usePersistentState<string>(STORAGE_KEYS.lastHighlighterColor, r => r || 'rgba(253, 224, 71, 0.4)');
    const [penWidth, setPenWidth] = usePersistentState<number>(STORAGE_KEYS.lastPenWidth, r => Number(r) || 3);
    const [penOpacity, setPenOpacity] = usePersistentState<number>(STORAGE_KEYS.lastPenOpacity, r => Number(r) || 1);
    const [activePresetId, setActivePresetId] = useState<string | null>(null);
    const [commentDefaultSize, setCommentDefaultSize] = useState(18);
    const [highlighterLabelMode, setHighlighterLabelMode] = useState<'individual' | 'legend'>('individual');

    return {
        tool, setTool, penColor, setPenColor, highlighterColor, setHighlighterColor,
        penWidth, setPenWidth, penOpacity, setPenOpacity, activePresetId, setActivePresetId,
        commentDefaultSize, setCommentDefaultSize, highlighterLabelMode, setHighlighterLabelMode,
    };
}

export type CorrectionTools = ReturnType<typeof useCorrectionTools>;
