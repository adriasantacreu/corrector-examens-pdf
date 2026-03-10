export default function FlowGradingLogo({ 
    size = '3rem', 
    rotation = -4.5, 
    extraThick = false 
}: { 
    size?: string, 
    rotation?: number,
    extraThick?: boolean
}) {
    const letters = "FlowGrading".split("");
    
    return (
        <div className={`highlighter-container ${extraThick ? 'highlighter-extra-thick' : 'highlighter-thick'}`} style={{ transform: `rotate(${rotation}deg)` }}>
            <div className="highlighter-stroke" style={{ top: '48%' }}></div>
            <div className="highlighter-text" style={{ fontSize: size, display: 'flex', alignItems: 'baseline', gap: '0.02em' }}>
                {letters.map((char, i) => {
                    // Random-ish handwriting feel
                    const y = (i % 3 === 0) ? -2 : (i % 2 === 0) ? 2 : 0;
                    const r = (i % 2 === 0) ? 1.5 : -1.5;
                    const isFlow = i < 4;
                    
                    return (
                        <span 
                            key={i} 
                            style={{ 
                                fontWeight: isFlow ? 200 : 900,
                                transform: `translateY(${y}px) rotate(${r}deg)`,
                                display: 'inline-block',
                                transition: 'all 0.3s ease'
                            }}
                        >
                            {char}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
