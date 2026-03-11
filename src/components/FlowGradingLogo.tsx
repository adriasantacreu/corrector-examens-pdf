export default function FlowGradingLogo({ 
    size = '3rem', 
    rotation = -4.5, 
    extraThick = false,
    animate = true
}: { 
    size?: string, 
    rotation?: number,
    extraThick?: boolean,
    animate?: boolean
}) {
    const letters = "flowgrading".split("");
    
    return (
        <div className={extraThick ? 'highlighter-extra-thick' : 'highlighter-thick'} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', transform: `rotate(${rotation}deg)` }}>
            {/* New Modern Geometric Background */}
            <div className={animate ? "animate-draw" : ""} style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
                <div 
                    style={{ 
                        position: 'absolute',
                        background: 'var(--hl-blue)',
                        mixBlendMode: 'multiply',
                        borderRadius: '1rem',
                        filter: 'blur(1px)',
                        transform: 'rotate(-1deg) scale(1.05)',
                        clipPath: 'polygon(1% 15%, 99% 8%, 98% 85%, 2% 92%)',
                        top: '25%', 
                        bottom: '10%', 
                        left: '-2%', 
                        right: '-3%',
                        opacity: 0.6
                    }}
                ></div>
            </div>

            <div style={{ position: 'relative', zIndex: 1, fontSize: size, display: 'flex', alignItems: 'baseline', gap: '0.02em', fontFamily: 'Caveat, cursive' }}>
                {letters.map((char, i) => {
                    const y = (i % 3 === 0) ? -2 : (i % 2 === 0) ? 2 : 0;
                    const r = (i % 2 === 0) ? 1.5 : -1.5;
                    const isFlow = i < 4;
                    
                    return (
                        <span 
                            key={i} 
                            style={{ 
                                fontWeight: isFlow ? 400 : 900, // Adjusted weight for better balance with the new shape
                                transform: `translateY(${y}px) rotate(${r}deg)`,
                                display: 'inline-block',
                                color: 'var(--text-primary)',
                                textShadow: '0 0 1px rgba(255,255,255,0.1)'
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
