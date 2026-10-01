import { useCallback, useEffect, useRef, useState } from 'react';

export interface DialogState {
    show: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm?: () => void;
    onCancel?: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
    checkboxLabel?: string;
    checkboxChecked?: boolean;
    onCheckboxChange?: (checked: boolean) => void;
}

export type ToastType = 'loading' | 'success' | 'error';

export interface ToastState {
    show: boolean;
    title: string;
    text: string;
    type: ToastType;
}

export interface ConfirmOptions {
    /** Acció del botó secundari. Si no n'hi ha, el botó només tanca. Esc sempre només tanca. */
    onCancel?: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
}

export interface AlertOptions {
    checkboxLabel?: string;
    initialCheckboxState?: boolean;
    onCheckboxChange?: (checked: boolean) => void;
}

export type ShowAlert = (title: string, message: string, options?: AlertOptions) => void;
export type ShowConfirm = (title: string, message: string, onConfirm: () => void, options?: ConfirmOptions) => void;
export type ShowToast = (title: string, text: string, type: ToastType) => void;

const HIDDEN_DIALOG: DialogState = { show: false, title: '', message: '', type: 'alert' };

export function useDialogs() {
    const [dialog, setDialog] = useState<DialogState>(HIDDEN_DIALOG);
    const [toast, setToast] = useState<ToastState>({ show: false, title: '', text: '', type: 'loading' });
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = useCallback<ShowToast>((title, text, type) => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ show: true, title, text, type });
        if (type !== 'loading') toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 4000);
    }, []);

    const hideToast = useCallback(() => setToast(t => ({ ...t, show: false })), []);

    const showAlert = useCallback<ShowAlert>((title, message, options) => {
        setDialog({
            show: true, title, message, type: 'alert',
            checkboxLabel: options?.checkboxLabel,
            checkboxChecked: options?.initialCheckboxState,
            onCheckboxChange: options?.onCheckboxChange,
        });
    }, []);

    const showConfirm = useCallback<ShowConfirm>((title, message, onConfirm, options) => {
        setDialog({
            show: true, title, message, type: 'confirm', onConfirm,
            onCancel: options?.onCancel,
            confirmLabel: options?.confirmLabel,
            cancelLabel: options?.cancelLabel,
        });
    }, []);

    const close = useCallback(() => setDialog(d => ({ ...d, show: false })), []);
    const confirm = useCallback(() => { dialog.onConfirm?.(); close(); }, [dialog, close]);
    const cancel = useCallback(() => { dialog.onCancel?.(); close(); }, [dialog, close]);

    // Enter confirma i Esc tanca (sense executar cap acció), amb prioritat sobre qualsevol altra drecera
    useEffect(() => {
        if (!dialog.show) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Enter' && e.key !== 'Escape') return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.key === 'Enter') confirm();
            else close();
        };
        window.addEventListener('keydown', onKey, { capture: true });
        return () => window.removeEventListener('keydown', onKey, { capture: true });
    }, [dialog.show, confirm, close]);

    return { dialog, setDialog, toast, showToast, hideToast, showAlert, showConfirm, confirm, cancel, close };
}

export type Dialogs = ReturnType<typeof useDialogs>;
