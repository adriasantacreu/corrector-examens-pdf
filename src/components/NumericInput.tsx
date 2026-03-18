import { useState, useEffect } from 'react';

interface NumericInputProps {
    value: number | undefined;
    onChange: (val: number | undefined) => void;
    style?: React.CSSProperties;
    placeholder?: string;
    className?: string;
}

export default function NumericInput({ value, onChange, style, placeholder = "", className = "" }: NumericInputProps) {
    const [tempValue, setTempValue] = useState<string>(value !== undefined ? value.toString().replace('.', ',') : "");

    // Sync tempValue with value prop when it changes externally
    useEffect(() => {
        if (value === undefined) {
            if (tempValue !== "") setTempValue("");
        } else {
            const formatted = value.toString().replace('.', ',');
            if (parseFloat(tempValue.replace(',', '.')) !== value) {
                setTempValue(formatted);
            }
        }
    }, [value, tempValue]);

    return (
        <input
            type="text"
            inputMode="decimal"
            placeholder={placeholder}
            value={tempValue}
            className={`field-input${className ? ' ' + className : ''}`}
            onChange={(e) => {
                const val = e.target.value.replace('.', ',');
                if (val === "" || val === "-" || /^-?\d*,?\d*$/.test(val)) {
                    setTempValue(val);
                    const parsed = parseFloat(val.replace(',', '.'));
                    if (!isNaN(parsed)) {
                        onChange(parsed);
                    } else if (val === "" || val === "-") {
                        onChange(undefined);
                    }
                }
            }}
            onBlur={() => {
                const parsed = parseFloat(tempValue.replace(',', '.'));
                if (isNaN(parsed)) {
                    setTempValue(value !== undefined ? value.toString().replace('.', ',') : "");
                    onChange(value);
                } else {
                    setTempValue(parsed.toString().replace('.', ','));
                    onChange(parsed);
                }
            }}
            style={{ textAlign: 'center', ...style }}
        />
    );
}
