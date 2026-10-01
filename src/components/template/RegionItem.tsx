/**
 * Una regió (retall, nom o nota) sobre la pàgina de la plantilla. Es pot moure i, amb doble clic,
 * redimensionar. Correccions respecte l'original:
 *  - el `dragend` dels ancoratges del Transformer ja no mou la regió (abans la feia saltar);
 *  - els límits de redimensionament es calculen en coordenades de pàgina (abans barrejaven píxels de pantalla);
 *  - moure sense desplaçament ja no deixa la regió a (0,0).
 */
import { useEffect, useRef } from 'react';
import { Group, Rect, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { clampPositionToBounds, clampResizeToBounds, type Size } from '../../domain/geometry';
import type { Rect as RectShape, RegionExercise } from '../../types';

interface Props {
    region: RegionExercise;
    fill: string;
    stroke: string;
    label: string;
    selectable: boolean;
    isTransforming: boolean;
    baseScale: number;
    pageSize: Size;
    onSelect: () => void;
    onStartTransform: () => void;
    onChange: (rect: RectShape) => void;
}

export default function RegionItem({ region, fill, stroke, label, selectable, isTransforming, baseScale, pageSize, onSelect, onStartTransform, onChange }: Props) {
    const groupRef = useRef<Konva.Group>(null);
    const rectRef = useRef<Konva.Rect>(null);
    const labelRef = useRef<Konva.Group>(null);
    const trRef = useRef<Konva.Transformer>(null);

    useEffect(() => {
        if (isTransforming && trRef.current && rectRef.current) {
            trRef.current.nodes([rectRef.current]);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [isTransforming]);

    /** Converteix la caixa del Transformer (en píxels de pantalla) a coordenades de pàgina. */
    const toPageBox = (box: { x: number; y: number; width: number; height: number }) => {
        const inv = groupRef.current!.getLayer()!.getAbsoluteTransform().copy().invert();
        const p1 = inv.point({ x: box.x, y: box.y });
        const p2 = inv.point({ x: box.x + box.width, y: box.y + box.height });
        return { x: p1.x, y: p1.y, width: p2.x - p1.x, height: p2.y - p1.y };
    };

    const handleTransformEnd = () => {
        const node = rectRef.current;
        if (!node) return;
        const next = {
            x: region.x + node.x(),
            y: region.y + node.y(),
            width: Math.max(10, node.width() * node.scaleX()),
            height: Math.max(10, node.height() * node.scaleY()),
        };
        node.position({ x: 0, y: 0 });
        node.scale({ x: 1, y: 1 });
        labelRef.current?.position({ x: 0, y: 0 });
        onChange(next);
    };

    const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
        // Els ancoratges del Transformer també emeten dragend i arriben aquí: només ens interessa el grup
        if (e.target !== groupRef.current) return;
        e.cancelBubble = true;
        onChange({ x: e.target.x(), y: e.target.y(), width: region.width, height: region.height });
    };

    const select = (e: KonvaEventObject<Event>) => {
        if (!selectable) return;
        e.cancelBubble = true;
        onSelect();
    };
    const startTransform = (e: KonvaEventObject<Event>) => {
        if (!selectable) return;
        e.cancelBubble = true;
        onStartTransform();
    };

    return (
        <Group
            ref={groupRef}
            x={region.x}
            y={region.y}
            draggable={selectable}
            onClick={select}
            onTap={select}
            onDblClick={startTransform}
            onDblTap={startTransform}
            onDragEnd={handleDragEnd}
            dragBoundFunc={pos => {
                const layer = groupRef.current?.getLayer();
                if (!layer) return pos;
                const t = layer.getAbsoluteTransform();
                const inv = t.copy().invert();
                const local = clampPositionToBounds(inv.point(pos), region, pageSize);
                return t.point(local);
            }}
        >
            <Rect
                ref={rectRef}
                name="regionRect"
                x={0} y={0}
                width={region.width} height={region.height}
                fill={fill} stroke={stroke}
                strokeWidth={1 / baseScale}
                strokeScaleEnabled={true}
            />
            <Group ref={labelRef}>
                <Rect x={0} y={-(24 / baseScale)} width={Math.max(80, label.length * 8 + 16) / baseScale} height={24 / baseScale} fill={stroke} />
                <Text text={label} fill="white" x={8 / baseScale} y={-(18 / baseScale)} fontSize={12 / baseScale} fontStyle="bold" />
            </Group>
            {isTransforming && selectable && (
                <Transformer
                    ref={trRef}
                    rotateEnabled={false}
                    keepRatio={false}
                    onTransform={() => {
                        // L'etiqueta segueix la cantonada del requadre mentre es redimensiona
                        if (rectRef.current && labelRef.current) labelRef.current.position(rectRef.current.position());
                    }}
                    onTransformEnd={handleTransformEnd}
                    borderStrokeWidth={1 / baseScale}
                    anchorSize={5 / baseScale}
                    padding={5 / baseScale}
                    boundBoxFunc={(oldBox, newBox) => {
                        if (!groupRef.current?.getLayer()) return oldBox;
                        const clamped = clampResizeToBounds(toPageBox(newBox), pageSize);
                        if (!clamped) return oldBox;
                        const t = groupRef.current.getLayer()!.getAbsoluteTransform();
                        const p1 = t.point({ x: clamped.x, y: clamped.y });
                        const p2 = t.point({ x: clamped.x + clamped.width, y: clamped.y + clamped.height });
                        return { ...newBox, x: p1.x, y: p1.y, width: p2.x - p1.x, height: p2.y - p1.y };
                    }}
                />
            )}
        </Group>
    );
}
