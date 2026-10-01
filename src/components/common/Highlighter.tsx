import React from 'react';

type HighlighterColor = 'blue' | 'green' | 'red' | 'yellow' | 'purple';

interface HighlighterProps {
    children: React.ReactNode;
    color?: HighlighterColor;
    className?: string;
    style?: React.CSSProperties;
    textStyle?: React.CSSProperties;
    strokeHeight?: string;
    rotation?: number;
    thick?: boolean;
}

export default function Highlighter({ 
    children, 
    color = 'blue', 
    className = '', 
    style = {}, 
    textStyle = {},
    strokeHeight,
    rotation = -1.2,
    thick = false
}: HighlighterProps) {
    const colorVar = `var(--hl-${color})`;

    return (
        <span className={`highlighter-container ${thick ? 'highlighter-thick' : ''} ${className}`} style={style}>
            <span className="animate-draw" style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
                <span 
                    className="highlighter-stroke" 
                    style={{ 
                        background: colorVar,
                        height: strokeHeight,
                        transform: `translateY(-50%) rotate(${rotation}deg) scale(1.02)`
                    }} 
                />
            </span>
            <span className="highlighter-text" style={textStyle}>
                {children}
            </span>
        </span>
    );
}
