// 管理画面
// タブ：お問い合わせ／研究データ／参加者（発行・一覧・管理者）／グループ／設定（クエスト・BGM の試聴・オフライン版）
import React, { useEffect, useState } from 'react';
import { Database, Download, Inbox, LogOut, Music, Pause, Play, Settings, Shield, Users, UsersRound } from 'lucide-react';
import ResearchDataPanel from './ResearchDataPanel';
import ParticipantAccountsPanel from './ParticipantAccountsPanel';
import IssueAccountsForm from './IssueAccountsForm';
import AdminAccountsPanel from './AdminAccountsPanel';
import QuestSettingsPanel from './QuestSettingsPanel';
import AdminGroupsPanel from './AdminGroupsPanel';
import InquiriesPanel from './InquiriesPanel';
import { auth } from '../../firebase';
import { recordAdminProfile } from '../../lib/admins';
import { BGM_SOURCES } from '../../lib/bgm';
import { fetchInquiries } from '../../lib/inquiries';
import { showAlert } from '../../lib/dialog';

interface AdminAppProps {
  onExitAdmin: () => void;
}

type Tab = 'inquiries' | 'research' | 'participants' | 'groups' | 'settings';
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'research', label: '研究データ', icon: <Database size={15} /> },
  { id: 'participants', label: '参加者', icon: <Users size={15} /> },
  { id: 'groups', label: 'グループ', icon: <UsersRound size={15} /> },
  { id: 'inquiries', label: '問い合わせ', icon: <Inbox size={15} /> },
  { id: 'settings', label: '設定', icon: <Settings size={15} /> }
];
const TAB_KEY = 'admin_tab';
const loadTab = (): Tab => {
  try {
    const t = sessionStorage.getItem(TAB_KEY);
    return TABS.some((x) => x.id === t) ? (t as Tab) : 'research';
  } catch {
    return 'research';
  }
};

// アプリに入っている BGM（シンプル版：雨・波・カフェ、ゲーム版：サイバー・Lo-Fi・ディープ雨）
const BGM_LIST: { name: string; where: string; url: string }[] = [
  { name: '雨の音', where: 'シンプル版', url: BGM_SOURCES.rain },
  { name: '波の音', where: 'シンプル版', url: BGM_SOURCES.waves },
  { name: 'カフェ', where: 'シンプル版', url: BGM_SOURCES.cafe },
  { name: 'サイバー', where: 'ゲーム版', url: BGM_SOURCES.cyber },
  { name: 'Lo-Fi', where: 'ゲーム版', url: BGM_SOURCES.lofi },
  { name: 'ディープ雨', where: 'ゲーム版', url: BGM_SOURCES.deep_rain }
];

const BgmPreview: React.FC = () => {
  const [playing, setPlaying] = useState<{ url: string; audio: HTMLAudioElement } | null>(null);
  useEffect(() => () => playing?.audio.pause(), [playing]);
  const toggle = (url: string) => {
    playing?.audio.pause();
    if (playing?.url === url) return setPlaying(null);
    const audio = new Audio(url);
    audio.play().catch(() => showAlert('音源を再生できませんでした'));
    setPlaying({ url, audio });
  };
  return (
    <div className="bg-black rounded-3xl p-6 border border-neutral-800 space-y-3 shadow-xl">
      <h2 className="text-sm font-bold text-white flex items-center gap-2">
        <Music size={18} className="text-sky-400" /> BGM の試聴
      </h2>
      <p className="text-[11px] text-neutral-400">アプリに入っている BGM です（研究の条件として、各モード3曲で固定しています）。</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {BGM_LIST.map((t) => (
          <button
            key={t.url}
            onClick={() => toggle(t.url)}
            className="flex items-center gap-3 p-3 bg-neutral-900 rounded-2xl border border-neutral-800 hover:border-sky-700 text-left"
          >
            <span className="p-2 bg-sky-600/20 text-sky-400 rounded-xl shrink-0">{playing?.url === t.url ? <Pause size={16} /> : <Play size={16} />}</span>
            <span className="min-w-0">
              <span className="block text-xs font-bold text-white">{t.name}</span>
              <span className="block text-[10px] text-neutral-500">{t.where}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export const AdminApp: React.FC<AdminAppProps> = ({ onExitAdmin }) => {
  const [tab, setTab] = useState<Tab>(loadTab);
  const [accountsVersion, setAccountsVersion] = useState(0); // 発行したら一覧を読み直す
  const [openInquiries, setOpenInquiries] = useState(0);

  const selectTab = (t: Tab) => {
    setTab(t);
    try {
      sessionStorage.setItem(TAB_KEY, t);
    } catch {
      // 無視
    }
    window.scrollTo({ top: 0 });
  };

  // 管理画面を開いたら、自分のメールアドレスを管理者の一覧に残す（管理者どうしで誰かわかるように）
  useEffect(() => {
    const me = auth.currentUser;
    if (me) recordAdminProfile(me.uid, me.email).catch((e) => console.error('管理者情報の保存に失敗:', e));
  }, []);

  // 未対応のお問い合わせの数（タブの印）
  useEffect(() => {
    fetchInquiries()
      .then((list) => setOpenInquiries(list.filter((x) => x.status === 'open').length))
      .catch((e) => console.error('お問い合わせの確認に失敗:', e));
  }, []);

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 pb-12 antialiased">
      <header className="bg-black border-b border-sky-900/50 sticky top-0 z-30 shadow-md">
        <div className="max-w-3xl mx-auto px-4 pt-3 flex justify-between items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 bg-sky-600 rounded-xl text-white shrink-0">
              <Shield size={18} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-white truncate">管理画面</h1>
              <p className="text-[10px] text-neutral-400 truncate">研究データ・参加者・お問い合わせの管理</p>
            </div>
          </div>
          <button
            onClick={onExitAdmin}
            className="shrink-0 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-neutral-700 whitespace-nowrap"
          >
            <LogOut size={14} /> 出る
          </button>
        </div>
        {/* タブ（スマホでは横にスクロール） */}
        <nav className="max-w-3xl mx-auto px-1 mt-2 grid grid-cols-5" aria-label="管理画面のメニュー">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`relative min-w-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1 py-2 text-[10px] sm:text-xs font-bold border-b-2 transition whitespace-nowrap ${
                tab === t.id ? 'border-sky-500 text-white' : 'border-transparent text-neutral-400 hover:text-white'
              }`}
            >
              {t.icon}
              {t.label}
              {t.id === 'inquiries' && openInquiries > 0 && (
                <span className="absolute top-0.5 right-[calc(50%-26px)] sm:static min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] leading-4 text-center" aria-label={`未対応 ${openInquiries} 件`}>
                  {openInquiries}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6 pt-6">
        {tab === 'research' && <ResearchDataPanel />}

        {tab === 'participants' && (
          <>
            <IssueAccountsForm onIssued={() => setAccountsVersion((v) => v + 1)} />
            <ParticipantAccountsPanel key={accountsVersion} />
            <AdminAccountsPanel />
          </>
        )}

        {tab === 'groups' && <AdminGroupsPanel />}

        {tab === 'inquiries' && <InquiriesPanel onOpenCount={setOpenInquiries} />}

        {tab === 'settings' && (
          <>
            <QuestSettingsPanel />
            <BgmPreview />
            {/* オフライン版のダウンロード（npm run build で一緒に作られる。オフライン版自身と開発中は出さない） */}
            {import.meta.env.PROD && import.meta.env.MODE !== 'offline' && (
              <div className="bg-black rounded-3xl p-5 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-bold text-white">オフライン版</h2>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    ログインも通信もせずに試せる確認用のファイルです（約4MB）。ダウンロードしてダブルクリックで開きます。本物の記録やアカウントは入っていません。
                  </p>
                </div>
                <a
                  href="/study-app-offline.html"
                  download="study-app-offline.html"
                  className="shrink-0 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <Download size={14} /> ダウンロード
                </a>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default AdminApp;
