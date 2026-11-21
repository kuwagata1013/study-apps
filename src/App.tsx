import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signOut, 
  type User as FirebaseUser 
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { getParticipantId, isValidParticipantId } from './lib/participant';
import { setEventMode, setEventUser, startEventTracking } from './lib/researchEvents';
import StartApp from './apps/start/StartApp';
import GamifiedApp from './apps/gamified/GamifiedApp';
import SimpleApp from './apps/simple/SimpleApp';
import AdminApp from './apps/admin/AdminApp';
import NameSetup from './apps/start/NameSetup';
import { claimPlayerName, getCachedName, loadMyName } from './lib/players';
import { Shield } from 'lucide-react';

type AppMode = 'start' | 'simple' | 'gamified' | 'admin';

export const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  // 前回選んだモードを最初の描画から使う（参加者IDが未入力の場合はスタート画面で入力してもらう）
  const [mode, setMode] = useState<AppMode>(() => {
    const savedMode = localStorage.getItem('study_app_preferred_mode');
    return (savedMode === 'simple' || savedMode === 'gamified') && isValidParticipantId(getParticipantId())
      ? savedMode
      : 'start';
  });

  // プレイヤー名（ログイン後に本人が決める。Google アカウントの名前は使わない）
  // none: 未ログイン / checking: 確認中 / ready: 決定済み / missing: まだ決めていない
  const [playerName, setPlayerName] = useState('');
  const [nameStatus, setNameStatus] = useState<'none' | 'checking' | 'ready' | 'missing'>('none');

  // 管理者画面アクセス保護用
  const [isAdminAuthOpen, setIsAdminAuthOpen] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState('');


  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      // 行動データ：ログイン状態がわかってから起動を記録する
      setEventUser(currentUser?.uid);
      startEventTracking();
    });

    return () => unsubscribe();
  }, []);

  // ログインしたら、名前が決まっているか確認する（端末に覚えていればすぐ表示し、裏でサーバーと照らし合わせる）
  const uid = user?.uid ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!uid) {
      setPlayerName('');
      setNameStatus('none');
      return;
    }
    const cached = getCachedName(uid);
    setPlayerName(cached);
    setNameStatus(cached ? 'ready' : 'checking');
    loadMyName(uid)
      .then((name) => {
        if (cancelled) return;
        if (name) {
          setPlayerName(name);
          setNameStatus('ready');
        } else {
          setNameStatus('missing');
        }
      })
      .catch((e) => {
        console.error('プレイヤー名の確認に失敗:', e);
        // 通信できないときは、端末に覚えている名前があればそのまま使う
        if (!cancelled && !cached) setNameStatus('missing');
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // 名前を変える（使われている名前ならエラー文を返す）
  const renamePlayer = async (name: string): Promise<string | null> => {
    if (!uid) return 'ログインすると名前を変えられます';
    try {
      const result = await claimPlayerName(uid, name, playerName);
      if (result === 'taken') return 'この名前はほかの冒険者が使っています';
      if (result === 'invalid') return '名前を入力してください';
      setPlayerName(name);
      return null;
    } catch (e) {
      console.error('名前の変更に失敗:', e);
      return '名前を保存できませんでした。通信状態を確認してください';
    }
  };

  // 行動データに現在のモードを付ける
  useEffect(() => {
    setEventMode(mode);
  }, [mode]);

  // モード選択処理
  const handleSelectMode = (selectedMode: 'simple' | 'gamified') => {
    setMode(selectedMode);
    localStorage.setItem('study_app_preferred_mode', selectedMode);
  };

  // モードリセット（スタート画面に戻る）
  const handleResetMode = () => {
    localStorage.removeItem('study_app_preferred_mode');
    setMode('start');
  };

  const openAdminAuth = () => {
    setAdminAuthError('');
    setIsAdminAuthOpen(true);
  };

  // 管理者認証チェック（Firestore の admins/{uid} ドキュメントの有無で判定）
  const handleAdminAccessAttempt = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAuthError('');
    if (!user) {
      setAdminAuthError('管理者ページを開くには Google でログインしてください');
      return;
    }
    setIsCheckingAdmin(true);
    try {
      const adminDoc = await getDoc(doc(db, 'admins', user.uid));
      if (adminDoc.exists()) {
        setMode('admin');
        setIsAdminAuthOpen(false);
      } else {
        setAdminAuthError('このアカウントには管理者権限がありません');
      }
    } catch (error) {
      console.error('管理者確認エラー:', error);
      setAdminAuthError('このアカウントには管理者権限がありません');
    } finally {
      setIsCheckingAdmin(false);
    }
  };

  // ログアウト処理
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      } catch (error) {
      console.error('ログアウトエラー:', error);
    }
  };

  // ログインしていて名前がまだなら、先に名前を決めてもらう（管理者画面は除く）
  if (user && mode !== 'admin' && nameStatus === 'checking') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center text-xs text-gray-400">
        読み込み中...
      </div>
    );
  }
  if (user && mode !== 'admin' && nameStatus === 'missing') {
    return (
      <NameSetup
        uid={user.uid}
        initialName={playerName}
        onDone={(name) => {
          setPlayerName(name);
          setNameStatus('ready');
        }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="relative min-h-screen bg-gray-50">
      {/* メイン画面切替 */}
      {mode === 'start' && (
        <StartApp onSelectMode={handleSelectMode} user={user} playerName={playerName} />
      )}

      {mode === 'simple' && (
        <SimpleApp 
          user={user} 
          onOpenAdmin={openAdminAuth}
          onResetMode={handleResetMode}
        />
      )}

      {mode === 'gamified' && (
        <GamifiedApp
          user={user}
          playerName={playerName}
          onRenamePlayer={renamePlayer}
          onOpenAdmin={openAdminAuth}
          onResetMode={handleResetMode}
        />
      )}

      {mode === 'admin' && (
        <AdminApp onExitAdmin={() => setMode('start')} />
      )}

      {/* 管理者アクセス確認モーダル */}
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
              管理者として登録された Google アカウントでログインしている場合のみ開けます。
            </p>
            {user && (
              <p className="text-[10px] text-gray-400 break-all">
                あなたのUID: <span className="font-mono select-all">{user.uid}</span>
              </p>
            )}

            <form onSubmit={handleAdminAccessAttempt} className="space-y-3">
              {adminAuthError && (
                <p className="text-xs text-red-500 font-bold">{adminAuthError}</p>
              )}
              <button
                type="submit"
                disabled={isCheckingAdmin}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition"
              >
                {isCheckingAdmin ? '確認中...' : '管理者画面を開く'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;