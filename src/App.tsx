import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signOut, 
  updateProfile, 
  type User as FirebaseUser 
} from 'firebase/auth';
import { auth } from './firebase';
import StartApp from './apps/start/StartApp';
import GamifiedApp from './apps/gamified/GamifiedApp';
import SimpleApp from './apps/simple/SimpleApp';
import AdminApp from './apps/admin/AdminApp';
import { Settings, LogOut, User, RefreshCw, Save, Shield, Upload, Lock, FlaskConical } from 'lucide-react';

type AppMode = 'start' | 'simple' | 'gamified' | 'admin';

export const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [mode, setMode] = useState<AppMode>('start');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 管理者画面アクセス保護用
  const [isAdminAuthOpen, setIsAdminAuthOpen] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');

  // テスト環境モードフラグ
  const [isTestEnvironment, setIsTestEnvironment] = useState(false);

  // プロフィール編集用ステート
  const [displayName, setDisplayName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState('');

  // 初回起動時のモード自動読み込み＆認証状態の監視
  useEffect(() => {
    const savedMode = localStorage.getItem('study_app_preferred_mode') as AppMode;
    if (savedMode && (savedMode === 'simple' || savedMode === 'gamified')) {
      setMode(savedMode);
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setDisplayName(currentUser.displayName || '');
        setPhotoURL(currentUser.photoURL || '');
      }
    });

    return () => unsubscribe();
  }, []);

  // モード選択処理
  const handleSelectMode = (selectedMode: 'simple' | 'gamified') => {
    setMode(selectedMode);
    localStorage.setItem('study_app_preferred_mode', selectedMode);
  };

  // モードリセット（スタート画面に戻る）
  const handleResetMode = () => {
    localStorage.removeItem('study_app_preferred_mode');
    setMode('start');
    setIsSettingsOpen(false);
  };

  // ローカル画像ファイルの読み込み (Base64変換)
  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('画像サイズは2MB以下にしてください');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoURL(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // プロフィール更新
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    setIsUpdating(true);
    setMessage('');

    try {
      await updateProfile(auth.currentUser, {
        displayName: displayName,
        photoURL: photoURL
      });
      setUser({ ...auth.currentUser } as FirebaseUser);
      setMessage('プロフィールを更新しました！');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('プロフィール更新エラー:', error);
      setMessage('更新に失敗しました。');
    } finally {
      setIsUpdating(false);
    }
  };

  // 管理者認証チェック (安全なリンク保護)
  const handleAdminAccessAttempt = (e: React.FormEvent) => {
    e.preventDefault();
    // デフォルトパスワード: admin123
    if (adminPasswordInput === 'admin123') {
      setMode('admin');
      setIsAdminAuthOpen(false);
      setIsSettingsOpen(false);
      setAdminPasswordInput('');
      setAdminAuthError('');
    } else {
      setAdminAuthError('パスワードが正しくありません');
    }
  };

  // ログアウト処理
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setIsSettingsOpen(false);
    } catch (error) {
      console.error('ログアウトエラー:', error);
    }
  };

  return (
    <div className="relative min-h-screen bg-gray-50">
      {/* テスト環境バナー */}
      {isTestEnvironment && (
        <div className="bg-amber-500 text-white text-[11px] font-bold py-1 px-4 text-center sticky top-0 z-50 flex justify-between items-center shadow-sm">
          <span className="flex items-center gap-1">
            <FlaskConical size={14} /> テストシミュレーション環境（本番データには影響しません）
          </span>
          <button 
            onClick={() => setIsTestEnvironment(false)}
            className="underline hover:opacity-80"
          >
            テスト終了
          </button>
        </div>
      )}

      {/* メイン画面切替 */}
      {mode === 'start' && (
        <StartApp onSelectMode={handleSelectMode} user={user} />
      )}

      {mode === 'simple' && (
        <SimpleApp user={user} isTestEnv={isTestEnvironment} />
      )}

      {mode === 'gamified' && (
        <GamifiedApp />
      )}

      {mode === 'admin' && (
        <AdminApp onExitAdmin={() => setMode('start')} isTestEnv={isTestEnvironment} />
      )}

      {/* 共通設定ボタン（右上） */}
      {mode !== 'start' && (
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="fixed top-4 right-4 z-40 p-3 bg-white/80 backdrop-blur-md rounded-full shadow-md border border-gray-200 text-gray-700 hover:bg-gray-100 transition"
          title="設定"
        >
          <Settings size={20} />
        </button>
      )}

      {/* 設定・プロフィール編集モーダル */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl space-y-6 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Settings size={20} /> 設定・アカウント管理
              </h2>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* アカウント・アイコン画像変更 */}
            {user ? (
              <form onSubmit={handleUpdateProfile} className="space-y-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                  プロフィール設定
                </span>

                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-200 border border-gray-300 flex items-center justify-center shrink-0">
                    {photoURL ? (
                      <img src={photoURL} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <User size={28} className="text-gray-400" />
                    )}
                  </div>
                  <div className="text-xs text-gray-500 overflow-hidden">
                    <p className="font-bold text-gray-800 truncate">{user.displayName || '未設定'}</p>
                    <p className="truncate">{user.email}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">名前</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="表示名を入力"
                  />
                </div>

                {/* アイコン画像：URL＆ローカルファイルアップロード対応 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">アイコン画像</label>
                  <div className="space-y-2">
                    <input
                      type="url"
                      value={photoURL}
                      onChange={(e) => setPhotoURL(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="画像URLを入力 (https://...)"
                    />
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileUpload}
                        className="hidden"
                        id="icon-upload-input"
                      />
                      <label
                        htmlFor="icon-upload-input"
                        className="w-full py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition"
                      >
                        <Upload size={14} /> PC・スマホから画像を選択
                      </label>
                    </div>
                  </div>
                </div>

                {message && (
                  <p className="text-xs font-semibold text-green-600 text-center">{message}</p>
                )}

                <button
                  type="submit"
                  disabled={isUpdating}
                  className="w-full py-2.5 bg-blue-600 text-white font-bold rounded-xl text-xs hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Save size={16} />
                  {isUpdating ? '更新中...' : 'プロフィールを保存'}
                </button>
              </form>
            ) : (
              <div className="p-4 bg-gray-50 rounded-2xl text-center text-xs text-gray-500">
                ゲストとして利用中（スタート画面からログインできます）
              </div>
            )}

            {/* アプリ設定・テスト環境・管理者保護リンク */}
            <div className="space-y-3 pt-2 border-t">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                アプリ設定・検証
              </span>

              <button
                onClick={handleResetMode}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition text-xs flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} />
                モードを再選択する（スタート画面へ）
              </button>

              <button
                onClick={() => {
                  setIsTestEnvironment(!isTestEnvironment);
                  setIsSettingsOpen(false);
                }}
                className={`w-full py-3 font-bold rounded-2xl transition text-xs flex items-center justify-center gap-2 border ${
                  isTestEnvironment 
                    ? 'bg-amber-100 text-amber-800 border-amber-300' 
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                }`}
              >
                <FlaskConical size={16} />
                {isTestEnvironment ? 'テスト環境モードを終了' : 'テスト環境モードを起動'}
              </button>

              <button
                onClick={() => setIsAdminAuthOpen(true)}
                className="w-full py-3 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-2xl transition text-xs flex items-center justify-center gap-2 border border-purple-100"
              >
                <Lock size={16} />
                管理者用データ分析ページ（パスワード保護）
              </button>
            </div>

            {/* ログアウト */}
            {user && (
              <div className="pt-2 border-t">
                <button
                  onClick={handleLogout}
                  className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-2xl transition text-xs flex items-center justify-center gap-2 border border-red-100"
                >
                  <LogOut size={16} />
                  ログアウト
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* 管理者用アクセスパスワード確認モーダル */}
      {isAdminAuthOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Shield size={18} className="text-purple-600" /> 管理者認証
              </h3>
              <button onClick={() => setIsAdminAuthOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <p className="text-xs text-gray-500">
              管理者用分析ページへアクセスするには認証パスワードを入力してください。
            </p>

            <form onSubmit={handleAdminAccessAttempt} className="space-y-3">
              <input
                type="password"
                value={adminPasswordInput}
                onChange={(e) => setAdminPasswordInput(e.target.value)}
                placeholder="パスワードを入力"
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {adminAuthError && (
                <p className="text-xs text-red-500 font-bold">{adminAuthError}</p>
              )}
              <button
                type="submit"
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition"
              >
                管理者画面を開く
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;