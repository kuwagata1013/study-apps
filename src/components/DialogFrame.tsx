import React, { useEffect, useRef } from 'react';
import type { DialogTheme } from '../lib/dialog';

// ポップアップの見た目（シンプル版・スタート画面／ゲーム版／管理画面）
export const DIALOG_STYLES = {
  game: {
    panel: 'bg-[#312117] border-2 border-[#fdd69f]/60 rounded-xl text-white',
    icon: 'bg-[#fdd69f]/15 border border-[#fdd69f]/50 text-[#fdd69f]',
    box: 'bg-black/25 border border-[#fdd69f]/25 rounded-lg',
    sub: 'text-[#fdd69f]/80',
    accent: 'text-[#fdd69f]',
    input: 'bg-black/25 border border-[#fdd69f]/30 rounded-md text-white',
    ok: 'bg-[#fdd69f] hover:bg-[#ffe3b8] text-[#312117] rounded-md',
    danger: 'bg-red-800 hover:bg-red-700 text-white rounded-md',
    cancel: 'border border-[#fdd69f]/35 text-[#fdd69f] hover:bg-[#fdd69f]/10 rounded-md'
  },
  light: {
    panel: 'bg-white border border-gray-100 rounded-3xl text-gray-900',
    icon: 'bg-gray-100 text-gray-700',
    box: 'bg-gray-50 border border-gray-100 rounded-2xl',
    sub: 'text-gray-500',
    accent: 'text-gray-900',
    input: 'bg-gray-50 border border-gray-200 rounded-xl text-gray-900',
    ok: 'bg-gray-900 hover:bg-gray-800 text-white rounded-2xl',
    danger: 'bg-red-600 hover:bg-red-700 text-white rounded-2xl',
    cancel: 'bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-2xl'
  },
  admin: {
    panel: 'bg-neutral-900 border border-neutral-700 rounded-2xl text-neutral-100',
    icon: 'bg-neutral-800 text-neutral-200',
    box: 'bg-neutral-950 border border-neutral-800 rounded-xl',
    sub: 'text-neutral-400',
    accent: 'text-white',
    input: 'bg-neutral-950 border border-neutral-700 rounded-xl text-white',
    ok: 'bg-sky-600 hover:bg-sky-500 text-white rounded-xl',
    danger: 'bg-red-600 hover:bg-red-700 text-white rounded-xl',
    cancel: 'border border-neutral-700 text-neutral-300 hover:bg-neutral-800 rounded-xl'
  }
} as const satisfies Record<DialogTheme, Record<string, string>>;

// 画面の最前面に出すポップアップの枠。data-autofocus を付けた要素に最初のフォーカスを当てる
const DialogFrame: React.FC<{
  theme: DialogTheme;
  labelledBy: string;
  wide?: boolean;
  onCancel: () => void; // Esc キー
  children: React.ReactNode;
}> = ({ theme, labelledBy, wide, onCancel, children }) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.open) el.showModal();
    const target = el.querySelector<HTMLElement>('[data-autofocus]');
    target?.focus({ preventScroll: true });
    if (target instanceof HTMLInputElement) target.select();
    el.scrollTop = 0;
  }, []);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby={labelledBy}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-sm' : 'max-w-xs'} max-h-[85vh] overflow-y-auto p-6 text-center shadow-2xl outline-none backdrop:bg-black/60 ${DIALOG_STYLES[theme].panel}`}
    >
      {children}
    </dialog>
  );
};

export default DialogFrame;
