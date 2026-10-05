import { Group, Rect, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { displayInk } from '../../domain/colors';
import { SCORE_STAMP_ID } from '../../domain/scoring';
import { STAMP_WIDTH, stampTitleColor, type StampPlacement } from '../../domain/stamp';

export interface StampData extends StampPlacement {
    score: number;
    max: number;
    lines: string[];
}

/** Segell "Nota: x / y" amb el resum, que es pot moure i escalar. */
export default function ScoreStamp({ data, size, isDark, selectable, isSelected, onSelect, onMoved }: {
    data: StampData;
    size: number;
    isDark: boolean;
    selectable: boolean;
    isSelected: boolean;
    onSelect: () => void;
    onMoved: (p: StampPlacement) => void;
}) {
    const height = size * 1.5 + (data.lines.length > 0 ? data.lines.length * size * 0.75 * 1.2 + size * 0.5 : 0);
    const select = (e: KonvaEventObject<Event>) => {
        if (!selectable) return;
        e.cancelBubble = true;
        onSelect();
    };
    return (
        <Group
            id={SCORE_STAMP_ID}
            name="stamp-group"
            x={data.x} y={data.y}
            width={STAMP_WIDTH} height={height}
            scaleX={data.scale} scaleY={data.scale}
            draggable={selectable && isSelected}
            onClick={select}
            onTap={select}
            onDragEnd={e => onMoved({ x: e.target.x(), y: e.target.y(), scale: e.target.scaleX() })}
            onTransformEnd={e => {
                const node = e.target;
                const scale = node.scaleX();
                node.scale({ x: 1, y: 1 });
                onMoved({ x: node.x(), y: node.y(), scale });
            }}
        >
            <Text
                text={`Nota: ${data.score} / ${Math.round(data.max * 100) / 100}`}
                fontSize={size * 1.5} fontFamily="'Caveat', cursive" fontStyle="bold"
                fill={stampTitleColor(data.score, data.max)} align="left" width={STAMP_WIDTH} wrap="word"
            />
            {data.lines.length > 0 && (
                <Text y={size * 1.7} text={data.lines.join('\n')} fontSize={size * 0.75} fontFamily="'Caveat', cursive" fill={displayInk('rgba(0,0,0,0.6)', isDark)} align="left" width={STAMP_WIDTH} wrap="word" />
            )}
            {isSelected && <Rect x={-4} y={-4} width={STAMP_WIDTH + 8} height={height + 8} stroke="#6366f1" dash={[4, 4]} strokeWidth={1} fill="transparent" />}
        </Group>
    );
}
