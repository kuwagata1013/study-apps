import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Music, 
  Database, 
  FlaskConical, 
  LogOut, 
  Plus, 
  Trash2, 
  Upload, 
  Download, 
  RefreshCw, 
  Play, 
  Pause
} from 'lucide-react';
import { db } from '../../firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

interface AdminAppProps {
  onExitAdmin: () => void;
  isTestEnv?: boolean;
}

interface BgmTrack {
  id: string;
  name: string;
  url: string;
}

interface DBLog {
  id: string;
  uid?: string;
  deviceId?: string;
  mode?: string;
  subject?: string;
  durationSeconds?: number;
  durationMinutes?: number;
  memo?: string;
  createdAt?: any;
}

export const AdminApp: React.FC<AdminAppProps> = ({ onExitAdmin, isTestEnv = false }) => {
  const [activeTab, setActiveTab] = useState<'bgm' | 'database' | 'testenv'>('bgm');

  // --- 1. BGM管理用ステート ---
  const [bgmList, setBgmList] = useState<BgmTrack[]>([
    { id: '1', name: '雨の音', url: 'https://cdn.pixabay.com/download/audio/2021/09/06/audio_4125a254ec.mp3' },
    { id: '2', name: '波の音', url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3' },
    { id: '3', name: 'カフェの環境音', url: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a77d13.mp3' }
  ]);
  const [newBgmName, setNewBgmName] = useState('');
  const [newBgmUrl, setNewBgmUrl] = useState('');
  const [previewAudio, setPreviewAudio] = useState<{ id: string; audio: HTMLAudioElement } | null>(null);

  // --- 2. DB確認用ステート ---
  const [dbLogs, setDbLogs] = useState<DBLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // 初回データ読込 (BGMリスト & DBログ)
  useEffect(() => {
    const savedBgm = localStorage.getItem('admin_custom_bgm_list');
    if (savedBgm) {
      try { setBgmList(JSON.parse(savedBgm)); } catch (e) {}
    }
    fetchFirestoreLogs();
  }, []);

  // Firestore データ取得
  const fetchFirestoreLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const q = query(collection(db, 'researchLogs'), orderBy('createdAt', 'desc'), limit(50));
      const querySnapshot = await getDocs(q);
      const fetched: DBLog[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetched.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString('ja-JP') : '直近'
        });
      });
      setDbLogs(fetched);
    } catch (e) {
      console.error('DB読み込みエラー:', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // MP3ファイル直接アップロード (Base64化)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.includes('audio')) {
        alert('音声ファイル(mp3, wav等)を選択してください');
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
      alert('BGM名とURL（またはファイル）を指定してください');
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
    alert('新しいBGMを追加しました！');
  };

  // 【管理者機能】任意のBGM音源を消す（削除処理）
  const handleDeleteBgm = (id: string, name: string) => {
    if (!confirm(`BGM「${name}」を削除しますか？`)) return;

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
      audio.play().catch(() => alert('音源の再生に失敗しました（URLが無効の可能性があります）'));
      setPreviewAudio({ id: track.id, audio });
    }
  };

  // CSV エクスポート
  const exportToCSV = () => {
    if (dbLogs.length === 0) {
      alert('出力可能なデータがありません');
      return;
    }

    const headers = ['Document ID', 'UID', 'Device ID', 'Mode', 'Subject', 'Duration(Sec)', 'Memo', 'Created At'];
    const rows = dbLogs.map(l => [
      l.id,
      l.uid || 'anonymous',
      l.deviceId || '',
      l.mode || '',
      l.subject || '',
      l.durationSeconds || 0,
      `"${(l.memo || '').replace(/"/g, '""')}"`,
      l.createdAt || ''
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `research_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // テストデータの初期化
  const handleResetTestData = () => {
    if (confirm('テスト環境のローカルデータ（ログ・ToDo）を初期化しますか？')) {
      localStorage.removeItem('test_simple_study_logs');
      localStorage.removeItem('test_simple_tasks');
      alert('テストデータをリセットしました');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-12 antialiased">
      
      {/* 管理者用ヘッダーバー */}
      <header className="bg-slate-950 border-b border-purple-900/50 p-4 sticky top-0 z-30 shadow-md">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-600 rounded-xl text-white">
              <Shield size={20} />
            </div>
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                システム管理コントロールパネル
                {isTestEnv && <span className="text-[10px] bg-amber-500 text-white font-bold px-2 py-0.5 rounded-full">テスト環境</span>}
              </h1>
              <p className="text-[10px] text-slate-400">BGMの追加・削除・データ分析・検証</p>
            </div>
          </div>

          <button
            onClick={onExitAdmin}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-700"
          >
            <LogOut size={14} /> 管理画面を出る
          </button>
        </div>
      </header>

      {/* メインエリア */}
      <main className="max-w-3xl mx-auto p-4 space-y-6 pt-6">
        
        {/* ナビゲーションタブ */}
        <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 gap-1">
          <button
            onClick={() => setActiveTab('bgm')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'bgm' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Music size={16} /> BGMマスター管理（追加・削除）
          </button>
          
          <button
            onClick={() => setActiveTab('database')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'database' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Database size={16} /> DBデータ確認
          </button>

          <button
            onClick={() => setActiveTab('testenv')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'testenv' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FlaskConical size={16} /> テスト環境・検証
          </button>
        </div>

        {/* ===== TAB 1: BGM追加 ＆ 削除 ===== */}
        {activeTab === 'bgm' && (
          <div className="space-y-6">
            
            {/* 新規BGM追加フォーム */}
            <form onSubmit={handleAddBgm} className="bg-slate-950 rounded-3xl p-6 border border-slate-800 space-y-4 shadow-xl">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus size={18} className="text-purple-400" /> 新しいBGMを追加
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">トラック名</label>
                  <input
                    type="text"
                    value={newBgmName}
                    onChange={(e) => setNewBgmName(e.target.value)}
                    placeholder="例: 静かな雨音"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">音源URL (https://...mp3)</label>
                  <input
                    type="url"
                    value={newBgmUrl}
                    onChange={(e) => setNewBgmUrl(e.target.value)}
                    placeholder="https://example.com/audio.mp3"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
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
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer border border-slate-700"
                  >
                    <Upload size={14} /> PCからMP3ファイルを選択
                  </label>
                </div>

                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition shadow-md"
                >
                  BGMを追加
                </button>
              </div>
            </form>

            {/* 登録済みBGM一覧 ＆ 削除ボタン */}
            <div className="bg-slate-950 rounded-3xl p-6 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                登録済みBGM音源（削除・試聴）
              </h3>

              <div className="space-y-2">
                {bgmList.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">登録されているBGMはありません</p>
                ) : (
                  bgmList.map((track) => (
                    <div key={track.id} className="p-3 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <button
                          onClick={() => togglePreview(track)}
                          className="p-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 rounded-xl transition shrink-0"
                          title="試聴トグル"
                        >
                          {previewAudio && previewAudio.id === track.id ? <Pause size={16} /> : <Play size={16} />}
                        </button>
                        <div className="overflow-hidden">
                          <p className="text-xs font-bold text-white truncate">{track.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono truncate">{track.url}</p>
                        </div>
                      </div>

                      {/* 【管理者限定機能】BGM削除ボタン */}
                      <button
                        onClick={() => handleDeleteBgm(track.id, track.name)}
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition shrink-0 ml-2"
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

        {/* ===== TAB 2: DB確認 ===== */}
        {activeTab === 'database' && (
          <div className="bg-slate-950 rounded-3xl p-6 border border-slate-800 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Database size={18} className="text-purple-400" /> Firestore 探究ログ (researchLogs)
                </h2>
                <p className="text-[10px] text-slate-400">直近50件のログを一覧確認・CSV出力できます</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={fetchFirestoreLogs}
                  disabled={isLoadingLogs}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition border border-slate-700"
                  title="更新"
                >
                  <RefreshCw size={16} className={isLoadingLogs ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={exportToCSV}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-md"
                >
                  <Download size={14} /> CSV出力
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-2xl">
              <table className="w-full text-left text-[11px] text-slate-300">
                <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800">
                  <tr>
                    <th className="p-3">日時</th>
                    <th className="p-3">モード</th>
                    <th className="p-3">教科</th>
                    <th className="p-3">学習時間</th>
                    <th className="p-3">端末ID</th>
                    <th className="p-3">メモ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {dbLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500">
                        {isLoadingLogs ? 'データを読み込み中...' : 'ログデータがありません'}
                      </td>
                    </tr>
                  ) : (
                    dbLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-900/50 transition">
                        <td className="p-3 font-mono text-slate-400 whitespace-nowrap">{log.createdAt}</td>
                        <td className="p-3 font-bold">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] ${
                            log.mode?.includes('simple') ? 'bg-blue-900/50 text-blue-300' : 'bg-purple-900/50 text-purple-300'
                          }`}>
                            {log.mode}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-white">{log.subject}</td>
                        <td className="p-3 font-mono font-bold text-green-400">{log.durationSeconds || 0} 秒</td>
                        <td className="p-3 font-mono text-slate-500">{log.deviceId}</td>
                        <td className="p-3 text-slate-400 max-w-xs truncate">{log.memo || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== TAB 3: テスト環境管理 ===== */}
        {activeTab === 'testenv' && (
          <div className="bg-slate-950 rounded-3xl p-6 border border-slate-800 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <FlaskConical size={18} className="text-amber-400" /> テスト環境データ管理
            </h2>
            <p className="text-xs text-slate-400">
              テスト環境で作成された仮のローカルデータを一括リセットできます。
            </p>

            <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-white">テストデータの完全リセット</p>
                  <p className="text-[10px] text-slate-500">テスト環境用ローカルストレージのデータをクリアします</p>
                </div>
                <button
                  onClick={handleResetTestData}
                  className="px-3 py-2 bg-red-900/40 hover:bg-red-900/60 text-red-300 font-bold rounded-xl text-xs transition border border-red-800"
                >
                  テストデータを初期化
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

    </div>
  );
};

export default AdminApp;