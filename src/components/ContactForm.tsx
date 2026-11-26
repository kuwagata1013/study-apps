import React, { useState } from 'react';
import { Check, Mail } from 'lucide-react';
import DialogFrame, { DIALOG_STYLES } from './DialogFrame';
import { INQUIRY_CATEGORIES, MAX_INQUIRY_LENGTH, sendInquiry, type InquiryCategory } from '../lib/inquiries';

// お問い合わせ（開くボタンとポップアップ。シンプル版・ゲーム版共通。見た目だけモードに合わせる）
const ContactForm: React.FC<{ theme: 'game' | 'light'; uid: string | null; buttonClassName: string }> = ({ theme, uid, buttonClassName }) => {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<InquiryCategory | ''>('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const s = DIALOG_STYLES[theme];
  const mode = theme === 'game' ? 'gamified' : 'simple';

  const close = () => {
    if (sending) return;
    setOpen(false);
    if (sent) {
      setSent(false);
      setCategory('');
      setMessage('');
    }
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || !category || !message.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      await sendInquiry({ uid, mode, category, message });
      setSent(true);
    } catch (err) {
      console.error('お問い合わせの送信に失敗:', err);
      setError('送れませんでした。通信状態を確認して、もう一度お試しください');
    } finally {
      setSending(false);
    }
  };

  const chip = (on: boolean) =>
    theme === 'game'
      ? on
        ? 'bg-[#fdd69f] text-[#312117] border-[#fdd69f]'
        : 'border-[#fdd69f]/30 text-[#fdd69f]/80 hover:bg-[#fdd69f]/10'
      : on
        ? 'bg-gray-900 text-white border-gray-900'
        : 'border-gray-200 text-gray-600 hover:bg-gray-100';

  return (
    <>
      <button onClick={() => setOpen(true)} className={buttonClassName}>
        <Mail size={16} /> お問い合わせ
      </button>
      {open && (
        <DialogFrame theme={theme} labelledBy="contact-title" wide onCancel={close}>
          <h2 id="contact-title" className="text-base font-black">
            お問い合わせ
          </h2>
          {!uid ? (
            <>
              <p className={`mt-3 text-sm ${s.sub}`}>ログインするとお問い合わせを送れます。</p>
              <button data-autofocus onClick={close} className={`mt-5 w-full py-3 text-sm font-black ${s.ok}`}>
                閉じる
              </button>
            </>
          ) : sent ? (
            <>
              <div className={`w-14 h-14 mx-auto mt-4 rounded-full flex items-center justify-center ${s.icon}`}>
                <Check size={28} />
              </div>
              <p className="mt-3 text-sm font-bold">送信しました。ありがとうございます！</p>
              <p className={`mt-1 text-xs ${s.sub}`}>内容は先生（管理者）が確認します。</p>
              <button data-autofocus onClick={close} className={`mt-5 w-full py-3 text-sm font-black ${s.ok}`}>
                閉じる
              </button>
            </>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-4 text-left">
              <div className="space-y-2">
                <p className={`text-xs font-bold ${s.sub}`}>種類</p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(INQUIRY_CATEGORIES) as [InquiryCategory, string][]).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={category === id}
                      onClick={() => setCategory(id)}
                      className={`py-2 rounded-lg border text-xs font-bold transition ${chip(category === id)}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block space-y-2">
                <span className={`text-xs font-bold ${s.sub}`}>内容</span>
                <textarea
                  data-autofocus
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={MAX_INQUIRY_LENGTH}
                  rows={6}
                  placeholder="困っていること・気づいたこと・ほしい機能などを書いてください"
                  className={`w-full px-3 py-2 text-sm resize-y focus:outline-none ${s.input}`}
                />
                <span className={`block text-right text-[10px] ${s.sub}`}>
                  {message.length} / {MAX_INQUIRY_LENGTH}
                </span>
              </label>
              <p className={`text-[11px] ${s.sub}`}>参加者ID・プレイヤー名・使っている端末の種類も一緒に送られます。個人情報（本名・住所など）は書かないでください。</p>
              {error && (
                <p role="alert" className="text-xs font-bold text-red-500">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={close} disabled={sending} className={`flex-1 py-3 text-sm font-bold ${s.cancel}`}>
                  やめる
                </button>
                <button type="submit" disabled={sending || !category || !message.trim()} className={`flex-1 py-3 text-sm font-black disabled:opacity-40 ${s.ok}`}>
                  {sending ? '送信中…' : '送信する'}
                </button>
              </div>
            </form>
          )}
        </DialogFrame>
      )}
    </>
  );
};

export default ContactForm;
