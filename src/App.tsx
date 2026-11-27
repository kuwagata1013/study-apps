import React, { useState, useEffect, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signOut, 
  type User as FirebaseUser 
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { clearParticipantId, getParticipantId, isValidParticipantId, saveParticipantId } from './lib/participant';
import {
  claimAccountParticipantId,
  clearParticipantOwner,
  getParticipantOwner,
  loadAccountParticipantId,
  setParticipantOwner
} from './lib/accounts';
import {
  checkParticipantLogin,
  participantIdFromEmail,
  takePendingLoginId,
  type ParticipantLoginState
} from './lib/participantAuth';
import { setEventMode, setEventUser, startEventTracking } from './lib/researchEvents';
import StartApp from './apps/start/StartApp';
import GamifiedApp from './apps/gamified/GamifiedApp';
import SimpleApp from './apps/simple/SimpleApp';
import AdminApp from './apps/admin/AdminApp';
import { pullProgress, startProgressSync } from './lib/progressSync';
import NameSetup from './apps/start/NameSetup';
import { claimPlayerName, getCachedName, loadMyName } from './lib/players';
import { setDialogTheme } from './lib/dialog';
import { Shield } from 'lucide-react';

type AppMode = 'start' | 'simple' | 'gamified' | 'admin';

// 使えない参加者アカウントでログインしたときに、スタート画面に出す文
const BLOCKED_LOGIN_TEXT: Record<Exclude<ParticipantLoginState, 'ok'>, string> = {
  not_issued: 'この参加者IDは発行されていません。管理者に確認してください',
  deleted: 'この参加者IDは使えなくなりました。管理者に確認してください',
  replaced: 'パスワードが新しくなりました。新しいパスワードでログインしてください'
};

export const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  // ログイン状態がわかったか（わかる前は「未ログイン」と区別がつかないため）
  const [authReady, setAuthReady] = useState(false);
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

  // アカウントに登録した参加者ID（ログイン中だけ。登録済みなら変更できない）
  // none: 未ログイン / checking: 確認中 / locked: 登録済み / unset: まだ登録していない
  const [accountPid, setAccountPid] = useState('');
  const [pidStatus, setPidStatus] = useState<'none' | 'checking' | 'locked' | 'unset'>('none');
  // 使えない参加者アカウントだったのでログアウトさせたときの案内
  const [loginNotice, setLoginNotice] = useState('');

  // 管理者画面アクセス保護用
  const [isAdminAuthOpen, setIsAdminAuthOpen] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState('');


  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
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

  // 学習の記録をアカウントのものと合わせる（別の端末で記録した分も使えるように）。合わせ終わるまで記録の画面は出さない
  const [syncedUid, setSyncedUid] = useState<string | null>(null);
  useEffect(() => {
    if (!uid) {
      setSyncedUid(null);
      return;
    }
    let cancelled = false;
    let stop: (() => void) | undefined;
    pullProgress(uid).finally(() => {
      if (cancelled) return;
      setSyncedUid(uid);
      stop = startProgressSync(uid);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [uid]);

  // ゲーム版を開いたままにしておいて戻ってきたとき（スマホでほかのアプリから戻ったときなど）：
  // - アプリが新しくなっていたら読み直す（古い版のまま使い続けないように）
  // - ほかの端末で記録が増えていたら読み直す。開いている画面は自分の端末の記録しか知らないため、
  //   そのままだとフレンド・グループに見せる今日・今週の勉強時間が少なく保存されてしまう
  // 計測中のタイマーは端末に残しているので、読み直しても続きから再開する
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    if (!uid || syncedUid !== uid) return;
    let hiddenAt = 0;
    let checking = false;
    const isNewVersion = async () => {
      if (!import.meta.env.PROD || import.meta.env.MODE === 'offline') return false;
      const current = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src');
      if (!current) return false;
      const html = await fetch('/index.html', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''));
      const latest = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1];
      return !!latest && latest !== current;
    };
    const onVisible = async () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (modeRef.current !== 'gamified' || checking || !hiddenAt || Date.now() - hiddenAt < 30_000) return;
      checking = true;
      try {
        if ((await isNewVersion().catch(() => false)) || (await pullProgress(uid))) window.location.reload();
      } finally {
        checking = false;
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [uid, syncedUid]);

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

  // 参加者IDをアカウントに結び付ける
  // - アカウントに登録済みなら、この端末の参加者IDをそれに合わせる
  // - まだなら、この端末で使っている参加者IDを登録する（最初の1回だけ）
  // - ログアウトしたら、アカウントから来た参加者IDはこの端末から消して、スタート画面に戻す（ログインしないと使えない）
  const backToStartIfNoPid = () => {
    if (!isValidParticipantId(getParticipantId())) setMode((m) => (m === 'simple' || m === 'gamified' ? 'start' : m));
  };
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    const owner = getParticipantOwner();
    if (!uid) {
      setAccountPid('');
      setPidStatus('none');
      if (owner) {
        clearParticipantId();
        clearParticipantOwner();
      }
      // ログインしていなければ使えない（参加者IDとパスワードでログインしてもらう）ので、スタート画面に戻す
      setMode((m) => (m === 'simple' || m === 'gamified' ? 'start' : m));
      return;
    }
    // 別のアカウントの参加者IDが残っていたら使わない
    if (owner && owner !== uid) {
      clearParticipantId();
      clearParticipantOwner();
    }
    setPidStatus('checking');
    (async () => {
      try {
        // 発行していない・削除した・パスワードを再発行した参加者アカウントは使わせない
        const loginState = await checkParticipantLogin(uid, auth.currentUser?.email);
        if (cancelled) return;
        if (loginState !== 'ok') {
          takePendingLoginId();
          setLoginNotice(BLOCKED_LOGIN_TEXT[loginState]);
          await signOut(auth).catch(() => undefined);
          return;
        }
        // 参加者ID＋パスワードでログインしたときに入力したID（大文字・小文字をそのまま使うため）
        const typed = takePendingLoginId();
        let pid = await loadAccountParticipantId(uid);
        if (!pid) {
          // 参加者ID＋パスワードのアカウントはログインに使ったID、それ以外はこの端末で使っているIDを登録する
          const fromEmail = participantIdFromEmail(auth.currentUser?.email);
          // 管理者の Google アカウントには、この端末の参加者IDを登録しない
          const isAdminUser = !fromEmail && (await getDoc(doc(db, 'admins', uid)).catch(() => null))?.exists();
          const candidate = fromEmail ? (typed.toLowerCase() === fromEmail ? typed : fromEmail) : isAdminUser ? '' : getParticipantId();
          if (isValidParticipantId(candidate)) {
            await claimAccountParticipantId(uid, candidate);
            pid = candidate;
          }
        }
        if (cancelled) return;
        if (pid) {
          saveParticipantId(pid);
          setParticipantOwner(uid);
          setAccountPid(pid);
          setPidStatus('locked');
        } else {
          setPidStatus('unset');
          backToStartIfNoPid();
        }
      } catch (e) {
        console.error('参加者IDの確認に失敗:', e);
        if (!cancelled) setPidStatus('unset');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, uid]);

  // 行動データに現在のモードを付ける。ポップアップの見た目もモードに合わせる
  useEffect(() => {
    setEventMode(mode);
    setDialogTheme(mode === 'gamified' ? 'game' : mode === 'admin' ? 'admin' : 'light');
  }, [mode]);

  // モード選択処理
  const handleSelectMode = (selectedMode: 'simple' | 'gamified') => {
    setMode(selectedMode);
    localStorage.setItem('study_app_preferred_mode', selectedMode);
    // ログイン中で参加者IDがまだ登録されていなければ、いま入力したIDを登録する
    const pid = getParticipantId();
    if (uid && pidStatus === 'unset' && isValidParticipantId(pid)) {
      claimAccountParticipantId(uid, pid)
        .then(() => {
          setParticipantOwner(uid);
          setAccountPid(pid);
          setPidStatus('locked');
        })
        .catch((e) => console.error('参加者IDの登録に失敗:', e));
    }
  };

  // モードリセット（スタート画面に戻る）
  const handleResetMode = () => {
    localStorage.removeItem('study_app_preferred_mode');
    setMode('start');
  };

  const openAdminAuth = () => {
    // オフライン版（確認・デモ用）は確認なしで管理画面を開く
    if (import.meta.env.MODE === 'offline') {
      setMode('admin');
      return;
    }
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

  // ログインしていて名前がまだなら、先に名前を決めてもらう
  // （スタート画面では「プレイヤー名」のステップで決める。管理者画面は除く）
  const needsNameScreen = user && mode !== 'admin' && mode !== 'start';
  if ((needsNameScreen && nameStatus === 'checking') || ((mode === 'simple' || mode === 'gamified') && (!authReady || (uid && syncedUid !== uid)))) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center text-xs text-gray-400">
        読み込み中...
      </div>
    );
  }
  if (needsNameScreen && nameStatus === 'missing') {
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
        <StartApp
          onSelectMode={handleSelectMode}
          user={user}
          playerName={playerName}
          nameStatus={nameStatus}
          lockedParticipantId={pidStatus === 'locked' ? accountPid : ''}
          participantChecking={pidStatus === 'checking'}
          onOpenAdmin={openAdminAuth}
          loginNotice={loginNotice}
          onClearLoginNotice={() => setLoginNotice('')}
          onNameSaved={(name) => {
            setPlayerName(name);
            setNameStatus('ready');
          }}
        />
      )}

      {mode === 'simple' && (
        <SimpleApp 
          user={user} 
          onResetMode={handleResetMode}
        />
      )}

      {mode === 'gamified' && (
        <GamifiedApp
          user={user}
          playerName={playerName}
          onRenamePlayer={renamePlayer}
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