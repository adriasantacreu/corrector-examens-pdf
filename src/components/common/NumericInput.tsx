import { forwardRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

const toText = (v: number | undefined) => (v !== undefined ? v.toString().replace('.', ',') : '');

/**
 * Camp numèric "natural": accepta coma o punt, estats intermedis ("-", "1,") i confirma en sortir.
 * Abans n'hi havia tres còpies lleugerament diferents.
 */
const NumericInput = forwardRef<HTMLInputElement, {
    value: number | undefined;
    onChange: (val: number | undefined) => void;
    style?: CSSProperties;
    placeholder?: string;
    className?: string;
    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}>(({ value, onChange, style, placeholder = '', className, onKeyDown }, ref) => {
    const [text, setText] = useState(toText(value));
    const [focused, setFocused] = useState(false);

    // Si el valor canvia des de fora s'actualitza el text, però mai mentre s'hi escriu
    // (abans, escriure "-" posava el camp a "0" i no es podien entrar punts negatius).
    const [lastValue, setLastValue] = useState(value);
    if (value !== lastValue) {
        setLastValue(value);
        if (!focused && parseFloat(text.replace(',', '.')) !== value) setText(toText(value));
    }

    return (
        <input
            ref={ref}
            type="text"
            inputMode="decimal"
            placeholder={placeholder}
            value={text}
            className={className}
            onKeyDown={e => {
                if (e.key === 'Escape') e.currentTarget.blur();
                onKeyDown?.(e);
            }}
            onChange={e => {
                const v = e.target.value.replace('.', ',');
                if (v !== '' && v !== '-' && !/^-?\d*,?\d*$/.test(v)) return;
                setText(v);
                const parsed = parseFloat(v.replace(',', '.'));
                if (!isNaN(parsed)) onChange(parsed);
                else onChange(undefined);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
                setFocused(false);
                const parsed = parseFloat(text.replace(',', '.'));
                if (isNaN(parsed)) {
                    setText(toText(value));
                    onChange(value);
                } else {
                    setText(toText(parsed));
                    onChange(parsed);
                }
            }}
            style={style}
        />
    );
});

NumericInput.displayName = 'NumericInput';
export default NumericInput;
