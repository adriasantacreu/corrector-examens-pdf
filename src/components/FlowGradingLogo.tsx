import React from 'react';
import Highlighter from './Highlighter';

export default function FlowGradingLogo({ size = '2.2rem', rotation = -2.5, extraThick = false }: { size?: string, rotation?: number, extraThick?: boolean }) {
    // Letters with individual offsets for "real handwritten" look
    // "Flow" uses fontWeight 200 for maximum contrast with "Grading" (900)
    const letters = [
        { char: 'F', y: -2, r: 2, weight: 200 },
        { char: 'l', y: 1, r: -1.5, weight: 200 },
        { char: 'o', y: -3, r: 3, weight: 200 },
        { char: 'w', y: 0, r: -1, weight: 200 },
        { char: 'G', y: 2, r: 2, weight: 900, ml: '4px' },
        { char: 'r', y: -1, r: -2, weight: 900 },
        { char: 'a', y: 3, r: 1.5, weight: 900 },
        { char: 'd', y: -2, r: 2.5, weight: 900 },
        { char: 'i', y: 1, r: -1.5, weight: 900 },
        { char: 'n', y: 0, r: 2, weight: 900 },
        { char: 'g', y: -3, r: -2, weight: 900 },
    ];

    return (
        <Highlighter thick={!extraThick} className={extraThick ? 'highlighter-extra-thick' : ''} color="blue" rotation={rotation} textStyle={{ fontSize: size }}>
            <span style={{ 
                display: 'inline-flex', 
                alignItems: 'baseline', 
                transform: `rotate(${rotation * 0.15}deg)`,
                padding: '0 0.5rem'
            }}>
                {letters.map((l, i) => (
                    <span 
                        key={i} 
                        style={{ 
                            display: 'inline-block',
                            transform: `translateY(${l.y}px) rotate(${l.r}deg)`,
                            fontWeight: l.weight,
                            marginLeft: l.ml || '0',
                            transition: 'all 0.3s ease'
                        }}
                    >
                        {l.char}
                    </span>
                ))}
            </span>
        </Highlighter>
    );
}
