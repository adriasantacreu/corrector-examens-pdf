import React from 'react';
import Highlighter from './Highlighter';

type HighlighterColor = 'blue' | 'green' | 'red' | 'yellow' | 'purple';

export default function HandwrittenTitle({ 
    children, 
    size = '2rem', 
    color,
    thick = false,
    rotation = -1,
    style = {},
    noMargin = false
}: { 
    children: string, 
    size?: string, 
    color?: HighlighterColor,
    thick?: boolean,
    rotation?: number,
    style?: React.CSSProperties,
    noMargin?: boolean
}) {
    // Exclude blue to avoid redundancy with the logo
    const colors: HighlighterColor[] = ['green', 'red', 'yellow', 'purple'];
    const selectedColor = color || colors[Math.abs(children.length + (children.charCodeAt(0) || 0)) % colors.length];

    const chars = children.split('');
    
    return (
        <div style={{ 
            marginLeft: noMargin ? '0' : '-3.5rem', 
            paddingLeft: noMargin ? '0' : '0.5rem',
            ...style 
        }}>
            <Highlighter thick={thick} color={selectedColor} rotation={rotation} textStyle={{ fontSize: size }}>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', transform: `rotate(${rotation * 0.2}deg)` }}>
                    {chars.map((char, i) => {
                        const y = (i % 3 === 0) ? -1.5 : (i % 2 === 0) ? 1.5 : 0;
                        const r = (i % 2 === 0) ? 1.2 : -1.2;
                        const isSpace = char === ' ';
                        
                        return (
                            <span 
                                key={i} 
                                style={{ 
                                    display: 'inline-block',
                                    transform: isSpace ? 'none' : `translateY(${y}px) rotate(${r}deg)`,
                                    transition: 'all 0.3s ease',
                                    width: isSpace ? '0.3em' : 'auto'
                                }}
                            >
                                {char}
                            </span>
                        );
                    })}
                </span>
            </Highlighter>
        </div>
    );
}
