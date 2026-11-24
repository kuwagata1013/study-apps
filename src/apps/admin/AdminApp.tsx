import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Music, 
  Database, 
  LogOut, 
  Plus, 
  Trash2, 
  Upload, 
  Play, 
  Pause,
  Users,
  ListChecks
} from 'lucide-react';
import ResearchDataPanel from './ResearchDataPanel';
import ParticipantAccountsPanel from './ParticipantAccountsPanel';
import IssueAccountsForm from './IssueAccountsForm';
import AdminAccountsPanel from './AdminAccountsPanel';
import QuestSettingsPanel from './QuestSettingsPanel';
import { auth } from '../../firebase';
import { recordAdminProfile } from '../../lib/admins';
import { BGM_SOURCES } from '../../lib/bgm';
import { showAlert, showConfirm } from '../../lib/dialog';

interface AdminAppProps {
  onExitAdmin: () => void;
}

interface BgmTrack {
  id: string;
  name: string;
  url: string;
}

// 既定の音源はアプリに同梱した MP3（オンライン版・オフライン版どちらでも再生できる）
const DEFAULT_BGM_LIST: BgmTrack[] = [
  { id: '1', name: '雨の音', url: BGM_SOURCES.rain },
  { id: '2', name: '波の音', url: BGM_SOURCES.waves },
  { id: '3', name: 'カフェの環境音', url: BGM_SOURCES.cafe },
  { id: '4', name: 'Lo-Fi', url: BGM_SOURCES.lofi },
  { id: '5', name: 'サイバー', url: BGM_SOURCES.cyber },
  { id: '6', name: 'ディープ雨', url: BGM_SOURCES.deep_rain }
];
const DEFAULT_IDS = new Set(DEFAULT_BGM_LIST.map((t) => t.id));

export const AdminApp: React.FC<AdminAppProps> = ({ onExitAdmin }) => {
  const [activeTab, setActiveTab] = useState<'bgm' | 'database' | 'accounts' | 'quests'>('bgm');
  // 発行したら一覧を読み直す
  const [accountsVersion, setAccountsVersion] = useState(0);

  // --- 1. BGM管理用ステート ---
  const [bgmList, setBgmList] = useState<BgmTrack[]>(DEFAULT_BGM_LIST);
  const [newBgmName, setNewBgmName] = useState('');
  const [newBgmUrl, setNewBgmUrl] = useState('');
  const [previewAudio, setPreviewAudio] = useState<{ id: string; audio: HTMLAudioElement } | null>(null);

  // 管理画面を開いたら、自分のメールアドレスを管理者の一覧に残す（管理者どうしで誰かわかるように）
  useEffect(() => {
    const me = auth.currentUser;
    if (me) recordAdminProfile(me.uid, me.email).catch((e) => console.error('管理者情報の保存に失敗:', e));
  }, []);

  useEffect(() => {
    const savedBgm = localStorage.getItem('admin_custom_bgm_list');
    if (savedBgm) {
      try {
        // 既定の音源は保存時点の URL ではなく、いま同梱している MP3 を使う
        const saved: BgmTrack[] = JSON.parse(savedBgm);
        const custom = saved.filter((t) => !DEFAULT_IDS.has(t.id));
        const keptDefaults = DEFAULT_BGM_LIST.filter((d) => saved.some((t) => t.id === d.id));
        setBgmList([...keptDefaults, ...custom]);
      } catch {
        // 読めない場合は既定の一覧のまま
      }
    }
  }, []);

  // MP3ファイル直接アップロード (Base64化)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.includes('audio')) {
        showAlert('音声ファイル(mp3, wav等)を選択してください');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewBgmUrl(reader.result as string);
        if (!newBgmName) setNewBgmName(file.name.replace(/\.[^/.]+$/, ''));
      };
      reader.readAsDataURL(file);
    }
  };

  // BGM追加
  const handleAddBgm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBgmName.trim() || !newBgmUrl.trim()) {
      showAlert('BGM名とURL（またはファイル）を指定してください');
      return;
    }

    const newTrack: BgmTrack = {
      id: Date.now().toString(),
      name: newBgmName.trim(),
      url: newBgmUrl.trim()
    };

    const updated = [...bgmList, newTrack];
    setBgmList(updated);
    localStorage.setItem('admin_custom_bgm_list', JSON.stringify(updated));

    setNewBgmName('');
    setNewBgmUrl('');
    showAlert('新しいBGMを追加しました！');
  };

  // 【管理者機能】任意のBGM音源を消す（削除処理）
  const handleDeleteBgm = async (id: string, name: string) => {
    if (!(await showConfirm(`BGM「${name}」を削除しますか？`, { okLabel: '削除する', danger: true }))) return;

    // 再生中の音源を削除する場合は停止する
    if (previewAudio && previewAudio.id === id) {
      previewAudio.audio.pause();
      setPreviewAudio(null);
    }

    const updated = bgmList.filter((b) => b.id !== id);
    setBgmList(updated);
    localStorage.setItem('admin_custom_bgm_list', JSON.stringify(updated));
  };

  // 音源試聴トグル
  const togglePreview = (track: BgmTrack) => {
    if (previewAudio && previewAudio.id === track.id) {
      previewAudio.audio.pause();
      setPreviewAudio(null);
    } else {
      if (previewAudio) previewAudio.audio.pause();
      const audio = new Audio(track.url);
      audio.play().catch(() => showAlert('音源の再生に失敗しました（URLが無効の可能性があります）'));
      setPreviewAudio({ id: track.id, audio });
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 pb-12 antialiased">
      
      {/* 管理者用ヘッダーバー */}
      <header className="bg-black border-b border-sky-900/50 p-4 sticky top-0 z-30 shadow-md">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-sky-600 rounded-xl text-white">
              <Shield size={20} />
            </div>
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                システム管理コントロールパネル
              </h1>
              <p className="text-[10px] text-neutral-400">BGMの追加・削除・データ分析</p>
            </div>
          </div>

          <button
            onClick={onExitAdmin}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-neutral-700"
          >
            <LogOut size={14} /> 管理画面を出る
          </button>
        </div>
      </header>

      {/* メインエリア */}
      <main className="max-w-3xl mx-auto p-4 space-y-6 pt-6">
        
        {/* ナビゲーションタブ */}
        <div className="flex bg-black p-1.5 rounded-2xl border border-neutral-800 gap-1">
          <button
            onClick={() => setActiveTab('bgm')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'bgm' ? 'bg-sky-600 text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Music size={16} /> BGMマスター管理（追加・削除）
          </button>
          
          <button
            onClick={() => setActiveTab('database')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'database' ? 'bg-sky-600 text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Database size={16} /> 研究データ
          </button>

          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'accounts' ? 'bg-sky-600 text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Users size={16} /> 参加者アカウント
          </button>

          <button
            onClick={() => setActiveTab('quests')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'quests' ? 'bg-sky-600 text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <ListChecks size={16} /> クエスト
          </button>
        </div>

        {/* ===== TAB 1: BGM追加 ＆ 削除 ===== */}
        {activeTab === 'bgm' && (
          <div className="space-y-6">
            
            {/* 新規BGM追加フォーム */}
            <form onSubmit={handleAddBgm} className="bg-black rounded-3xl p-6 border border-neutral-800 space-y-4 shadow-xl">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus size={18} className="text-sky-400" /> 新しいBGMを追加
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-1">トラック名</label>
                  <input
                    type="text"
                    value={newBgmName}
                    onChange={(e) => setNewBgmName(e.target.value)}
                    placeholder="例: 静かな雨音"
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-1">音源URL (https://...mp3)</label>
                  <input
                    type="url"
                    value={newBgmUrl}
                    onChange={(e) => setNewBgmUrl(e.target.value)}
                    placeholder="https://example.com/audio.mp3"
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* PCからのローカルファイル選択 */}
              <div className="flex justify-between items-center pt-1">
                <div className="relative">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="admin-mp3-upload"
                  />
                  <label
                    htmlFor="admin-mp3-upload"
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer border border-neutral-700"
                  >
                    <Upload size={14} /> PCからMP3ファイルを選択
                  </label>
                </div>

                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-md"
                >
                  BGMを追加
                </button>
              </div>
            </form>

            {/* 登録済みBGM一覧 ＆ 削除ボタン */}
            <div className="bg-black rounded-3xl p-6 border border-neutral-800 space-y-3">
              <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                登録済みBGM音源（削除・試聴）
              </h3>

              <div className="space-y-2">
                {bgmList.length === 0 ? (
                  <p className="text-xs text-neutral-500 text-center py-4">登録されているBGMはありません</p>
                ) : (
                  bgmList.map((track) => (
                    <div key={track.id} className="p-3 bg-neutral-900 rounded-2xl border border-neutral-800 flex items-center justify-between">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <button
                          onClick={() => togglePreview(track)}
                          className="p-2 bg-sky-600/20 hover:bg-sky-600/40 text-sky-400 rounded-xl transition shrink-0"
                          title="試聴トグル"
                        >
                          {previewAudio && previewAudio.id === track.id ? <Pause size={16} /> : <Play size={16} />}
                        </button>
                        <div className="overflow-hidden">
                          <p className="text-xs font-bold text-white truncate">{track.name}</p>
                          <p className="text-[10px] text-neutral-500 font-mono truncate">{track.url}</p>
                        </div>
                      </div>

                      {/* 【管理者限定機能】BGM削除ボタン */}
                      <button
                        onClick={() => handleDeleteBgm(track.id, track.name)}
                        className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition shrink-0 ml-2"
                        title="このBGMを削除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* ===== TAB 2: 研究データ ===== */}
        {activeTab === 'database' && <ResearchDataPanel />}

        {/* ===== TAB 3: 参加者ID・名前・アカウントの対応 ===== */}
        {activeTab === 'accounts' && (
          <div className="space-y-6">
            <AdminAccountsPanel />
            <IssueAccountsForm onIssued={() => setAccountsVersion((v) => v + 1)} />
            <ParticipantAccountsPanel key={accountsVersion} />
          </div>
        )}

        {/* ===== TAB 4: デイリークエストの設定 ===== */}
        {activeTab === 'quests' && <QuestSettingsPanel />}

      </main>

    </div>
  );
};

export default AdminApp;