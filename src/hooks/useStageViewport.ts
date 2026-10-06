/**
 * Zoom i desplaçament d'un escenari Konva (roda, Ctrl+roda, pessic amb dos dits, barra de zoom).
 * El comparteixen el definidor de plantilla i el corrector.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { fitScale, type Size } from '../domain/geometry';

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

/** Mida d'un element, actualitzada quan canvia (la finestra, les barres laterals...). */
export function useElementSize<T extends HTMLElement>() {
    const nodeRef = useRef<T | null>(null);
    const [node, setNode] = useState<T | null>(null);
    const [size, setSize] = useState<Size>({ width: 0, height: 0 });
    const ref = useCallback((el: T | null) => { nodeRef.current = el; setNode(el); }, []);
    useEffect(() => {
        if (!node) return;
        const update = () => setSize(s => (s.width === node.clientWidth && s.height === node.clientHeight ? s : { width: node.clientWidth, height: node.clientHeight }));
        update();
        const ro = new ResizeObserver(update);
        ro.observe(node);
        return () => ro.disconnect();
    }, [node]);
    return { ref, nodeRef, size };
}

export interface FitOptions {
    fitHeight?: boolean;
    /** Si no s'ajusta l'alçada, el contingut queda a dalt de tot (mode scroll). */
    topAligned?: boolean;
}

export interface SavedView {
    scale: number;
    baseScale: number;
    pos: { x: number; y: number };
}

export function useStageViewport() {
    const stageRef = useRef<Konva.Stage>(null);
    const { ref: containerRef, nodeRef: containerEl, size: containerSize } = useElementSize<HTMLDivElement>();
    const [stageScale, setStageScale] = useState(1);
    /** Escala d'ajust inicial: serveix per mantenir el gruix de línies i textos constant a la pantalla. */
    const [baseScale, setBaseScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const lastPinchDist = useRef(0);

    const zoomAround = useCallback((newScale: number, pointer: { x: number; y: number }) => {
        const stage = stageRef.current;
        if (!stage) return;
        const oldScale = stage.scaleX();
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
        const to = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
        setStageScale(scale);
        setStagePos({ x: pointer.x - to.x * scale, y: pointer.y - to.y * scale });
    }, []);

    /** Zoom des de la barra (centrat al mig del visor). */
    const applyZoom = useCallback((newScale: number) => {
        const el = containerEl.current;
        const stage = stageRef.current;
        const center = el ? { x: el.clientWidth / 2, y: el.clientHeight / 2 } : stage ? { x: stage.width() / 2, y: stage.height() / 2 } : { x: 0, y: 0 };
        zoomAround(newScale, center);
    }, [containerEl, zoomAround]);

    const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;
        if (e.evt.ctrlKey) {
            const pointer = stage.getPointerPosition();
            if (!pointer) return;
            const old = stage.scaleX();
            const next = e.evt.deltaY > 0 ? old / 1.1 : old * 1.1;
            if (next < MIN_SCALE || next > MAX_SCALE) return;
            zoomAround(next, pointer);
        } else {
            setStagePos({ x: stage.x() - e.evt.deltaX, y: stage.y() - e.evt.deltaY });
        }
    }, [zoomAround]);

    /** Pessic amb dos dits. Retorna true si l'esdeveniment era un pessic (i no s'ha de dibuixar). */
    const handlePinch = useCallback((e: KonvaEventObject<TouchEvent>): boolean => {
        const [t1, t2] = [e.evt.touches[0], e.evt.touches[1]];
        if (!t1 || !t2) return false;
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (!lastPinchDist.current) { lastPinchDist.current = dist; return true; }
        const stage = stageRef.current;
        const box = containerEl.current?.getBoundingClientRect();
        if (!stage || !box) return true;
        const next = stage.scaleX() * (dist / lastPinchDist.current);
        if (next >= MIN_SCALE && next <= MAX_SCALE) {
            zoomAround(next, { x: (t1.clientX + t2.clientX) / 2 - box.left, y: (t1.clientY + t2.clientY) / 2 - box.top });
        }
        lastPinchDist.current = dist;
        return true;
    }, [containerEl, zoomAround]);

    const endPinch = useCallback(() => { lastPinchDist.current = 0; }, []);

    /** Ajusta el contingut al visor i fixa l'escala base. */
    const fitContent = useCallback((content: Size, opts: FitOptions = {}) => {
        const el = containerEl.current;
        if (!el || !content.width || !content.height) return;
        const container = { width: el.clientWidth, height: el.clientHeight };
        const fitHeight = opts.fitHeight ?? true;
        const scale = fitScale(content, container, { fitHeight });
        setStageScale(scale);
        setBaseScale(scale);
        setStagePos({
            x: (container.width - content.width * scale) / 2,
            y: fitHeight && !opts.topAligned ? Math.max(20, (container.height - content.height * scale) / 2) : 20,
        });
    }, [containerEl]);

    /** Torna a una vista desada (zoom i desplaçament d'abans). */
    const restoreView = useCallback((view: SavedView) => {
        setStageScale(view.scale);
        setBaseScale(view.baseScale);
        setStagePos(view.pos);
    }, []);

    /** Punt del document sota el punter (tenint en compte zoom i desplaçament). */
    const pointerToDocument = useCallback((): { x: number; y: number } | null => {
        const stage = stageRef.current;
        const pos = stage?.getPointerPosition();
        if (!stage || !pos) return null;
        return stage.getAbsoluteTransform().copy().invert().point(pos);
    }, []);

    return {
        stageRef, containerRef, containerEl, containerSize,
        stageScale, baseScale, stagePos, setStagePos,
        applyZoom, handleWheel, handlePinch, endPinch, fitContent, restoreView, pointerToDocument,
    };
}

export type StageViewport = ReturnType<typeof useStageViewport>;
