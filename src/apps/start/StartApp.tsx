import React, { useState } from 'react';
import { Coffee, Sparkles, LogIn, LogOut, ArrowRight, User, IdCard, UserRound, Pencil, Lock, KeyRound, Shield } from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from '../../firebase';
import {
  getParticipantId,
  saveParticipantId,
  normalizeParticipantId,
  isValidParticipantId,
  PARTICIPANT_ID_MAX
} from '../../lib/participant';
import { claimPlayerName, MAX_NAME_LENGTH, normalizeName } from '../../lib/players';
import { getIssuedId, loginWithParticipantId, participantIdFromEmail, type LoginError } from '../../lib/participantAuth';

const LOGIN_ERROR_TEXT: Record<LoginError, string> = {
  wrong: '参加者IDかパスワードがちがいます',
  deleted: 'この参加者IDは使えなくなりました。先生（管理者）に確認してください',
  too_many: '何度もまちがえたため、しばらくログインできません。少し待ってからお試しください',
  disabled: 'このアカウントは使えません。先生（管理者）に確認してください',
  network: '通信できませんでした。インターネットにつながっているか確認してください',
  unknown: 'ログインできませんでした。もう一度お試しください'
};

// 管理者用の入り口（URL の最後に ?admin を付けたときだけ、Google ログインと管理者ページのボタンを出す）
const isAdminEntry = () => {
  try {
    return new URLSearchParams(window.location.search).has('admin');
  } catch {
    return false;
  }
};

interface StartAppProps {
  onSelectMode: (mode: 'simple' | 'gamified') => void;
  user: any;
  playerName?: string;
  nameStatus?: 'none' | 'checking' | 'ready' | 'missing';
  onNameSaved?: (name: string) => void;
  lockedParticipantId?: string; // アカウントに登録済みの参加者ID（変更できない）
  participantChecking?: boolean; // アカウントの参加者IDを確認中
  onOpenAdmin?: () => void;
  loginNotice?: string; // 使えないアカウントだったのでログアウトさせたときの案内
  onClearLoginNotice?: () => void;
}

export const StartApp: React.FC<StartAppProps> = ({
  onSelectMode,
  user,
  playerName = '',
  nameStatus = 'none',
  onNameSaved,
  lockedParticipantId = '',
  participantChecking = false,
  onOpenAdmin,
  loginNotice = '',
  onClearLoginNotice
}) => {
  const [loading, setLoading] = useState(false);
  const adminEntry = isAdminEntry();

  // 参加者ID＋パスワードでのログイン
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const handleIdLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = loginId.trim();
    if (!id || !loginPassword || loading) return;
    setLoading(true);
    setLoginError('');
    onClearLoginNotice?.();
    const err = await loginWithParticipantId(id, loginPassword);
    setLoading(false);
    if (err) setLoginError(LOGIN_ERROR_TEXT[err]);
    else setLoginPassword('');
  };
  const handleLogout = async () => {
    if (!confirm('ログアウトしますか？')) return;
    try {
      await signOut(auth);
    } catch (err) {
      console.error('ログアウトエラー:', err);
    }
  };


  // プレイヤー名（ログインしている人だけ。Google アカウントの名前は使わない）
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const needsName = !!user && nameStatus !== 'ready';
  // ステップの出し方
  // - ログイン前：1 ログイン → 2 プレイヤー名（ログイン後に決める）→ 3 モード
  // - 名前が決まっていれば名前のステップは出さない（STEP 1 に名前を表示する）
  // - 参加者IDの入力は、Google でログインした人（管理者など）で、まだアカウントに登録されていないときだけ
  //   （参加者ID＋パスワードでログインした人は、ログインしたIDがそのまま参加者IDになる）
  const isParticipantUser = !!participantIdFromEmail(user?.email);
  const showNameStep = !user || nameStatus !== 'ready' || editingName;
  const showPidStep = !!user && !isParticipantUser && !lockedParticipantId;
  const pidStep = showNameStep ? 3 : 2;
  const modeStep = pidStep + (showPidStep ? 1 : 0);
  // モード選択のエラー（ログインした・ログアウトしたら消えるよう、そのときのアカウントと一緒に持つ）
  const [modeErrorState, setModeErrorState] = useState<{ text: string; uid: string | null }>({ text: '', uid: null });
  const modeError = modeErrorState.uid === (user?.uid ?? null) ? modeErrorState.text : '';
  const setModeError = (text: string) => setModeErrorState({ text, uid: user?.uid ?? null });
  const startEditingName = () => {
    setNameInput(playerName);
    setNameError('');
    setEditingName(true);
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = normalizeName(nameInput);
    if (!user || !name || nameSaving) return;
    if (name === playerName) {
      setEditingName(false);
      return;
    }
    setNameSaving(true);
    setNameError('');
    try {
      const result = await claimPlayerName(user.uid, name, playerName || undefined);
      if (result === 'ok') {
        onNameSaved?.(name);
        setModeError('');
        setEditingName(false);
      } else {
        setNameError(result === 'taken' ? 'この名前はほかの人が使っています。別の名前にしてください' : 'この名前は使えません');
      }
    } catch (err) {
      console.error('名前の登録に失敗:', err);
      setNameError('保存できませんでした。通信状態を確認して、もう一度お試しください');
    } finally {
      setNameSaving(false);
    }
  };
  const [participantInput, setParticipantInput] = useState(getParticipantId());
  const [participantError, setParticipantError] = useState('');

  const participantId = lockedParticipantId || normalizeParticipantId(participantInput);
  const isParticipantValid = isValidParticipantId(participantId);

  // 参加者IDを確認・保存してからモードを開始
  const [pidVerifying, setPidVerifying] = useState(false);
  const handleSelectMode = async (mode: 'simple' | 'gamified') => {
    setModeError('');
    if (!user) {
      setModeError('先に STEP 1 で、配られた参加者IDとパスワードでログインしてください');
      return;
    }
    if (needsName) {
      const msg = nameStatus === 'checking' ? '名前を確認中です。少し待ってからもう一度押してください' : '先にプレイヤー名を決めてください';
      setNameError(msg);
      setModeError(msg);
      return;
    }
    if (participantChecking) {
      setModeError('参加者IDを確認中です。少し待ってからもう一度押してください');
      return;
    }
    if (!isParticipantValid) {
      if (showPidStep) setParticipantError('参加者IDを入力してください（半角英数字・ハイフン・アンダースコア、32文字まで）');
      else setModeError('参加者IDを確認できませんでした。通信状態を確認して、ログインし直してください');
      return;
    }
    // 自分で入力した参加者IDは、管理者が発行したものだけ使える
    if (showPidStep) {
      if (pidVerifying) return;
      setPidVerifying(true);
      try {
        const issued = await getIssuedId(participantId);
        if (!issued || issued.deleted) {
          setParticipantError('この参加者IDは発行されていません。発行済みの参加者IDを入力してください');
          return;
        }
      } catch (err) {
        console.error('参加者IDの確認に失敗:', err);
        setModeError('参加者IDを確認できませんでした。通信状態を確認して、もう一度お試しください');
        return;
      } finally {
        setPidVerifying(false);
      }
    }
    saveParticipantId(participantId);
    onSelectMode(mode);
  };

  // Google ログイン処理
  const handleGoogleLogin = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      console.error('ログインエラー:', e);
      if (e.code === 'auth/unauthorized-domain') {
        alert('Firebase Console の Authentication > 設定 > 承認済みドメイン に現在のドメインを追加してください。');
      } else {
        alert('ログインに失敗しました（ゲストモードのまま利用できます）');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4 antialiased">
      <div className="w-full max-w-md space-y-6">
        
        {/* タイトルロゴ */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
            Study Log
          </h1>
          <p className="text-xs text-gray-500 font-medium">
            集中と習慣化のための学習記録プラットフォーム
          </p>
        </div>

        {/* STEP 1: アカウント確認 */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4 text-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            STEP 1: ログイン
          </span>

          {user ? (
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                {/* アイコン表示部分（URL・ローカル画像参照のブロック回避処理含む） */}
                <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 border border-gray-200 flex items-center justify-center shrink-0">
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt={playerName || 'ユーザー'} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <User size={20} className="text-gray-400" />
                  )}
                </div>
                <div className="text-left min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className={`text-sm font-bold truncate ${playerName ? 'text-gray-900' : 'text-gray-400'}`}>
                      {playerName || (nameStatus === 'checking' ? '名前を確認中...' : 'プレイヤー名 未設定')}
                    </p>
                    {nameStatus === 'ready' && !editingName && (
                      <button
                        type="button"
                        onClick={startEditingName}
                        aria-label="プレイヤー名を変更"
                        title="プレイヤー名を変更"
                        className="shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition"
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 truncate">
                    {isParticipantUser
                      ? `参加者ID：${lockedParticipantId || participantIdFromEmail(user.email)}`
                      : `${user.email ?? ''}${lockedParticipantId ? ` ・ 参加者ID：${lockedParticipantId}` : ''}`}
                  </p>
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1.5">
                <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2.5 py-1 rounded-full">ログイン中</span>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600"
                >
                  <LogOut size={11} /> ログアウト
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleIdLogin} className="space-y-3 text-left">
              <p className="text-[11px] text-gray-500 text-center">配られた参加者IDとパスワードでログインしてください</p>
              <label className="block">
                <span className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-1.5">
                  <IdCard size={14} /> 参加者ID
                </span>
                <input
                  value={loginId}
                  onChange={(e) => {
                    setLoginId(e.target.value);
                    setLoginError('');
                  }}
                  maxLength={PARTICIPANT_ID_MAX}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="例: A01"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-mono"
                />
              </label>
              <label className="block">
                <span className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-1.5">
                  <KeyRound size={14} /> パスワード
                </span>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => {
                    setLoginPassword(e.target.value);
                    setLoginError('');
                  }}
                  autoComplete="current-password"
                  placeholder="パスワード"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-mono"
                />
              </label>
              {(loginError || loginNotice) && <p className="text-[11px] text-red-500 font-bold">{loginError || loginNotice}</p>}
              <button
                type="submit"
                disabled={loading || !loginId.trim() || !loginPassword}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-md transition active:scale-98 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                <LogIn size={18} />
                {loading ? 'ログイン中...' : 'ログイン'}
              </button>
            </form>
          )}
        </div>

        {/* STEP 2: プレイヤー名（ログイン前は案内だけ。ログイン後、名前がまだのときと変更中に入力する） */}
        {showNameStep && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-3">
            <div className="text-center">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                STEP 2: {editingName ? 'プレイヤー名を変更' : 'プレイヤー名を決める'}
              </span>
            </div>

            {!user ? (
              <div className="space-y-1.5 opacity-60">
                <span className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                  <UserRound size={14} /> プレイヤー名（{MAX_NAME_LENGTH}文字まで）
                </span>
                <div className="px-3 py-2.5 text-sm border border-dashed border-gray-300 rounded-xl bg-gray-50 text-gray-400">
                  ログインすると決められます
                </div>
              </div>
            ) : nameStatus === 'checking' ? (
              <p className="text-xs text-gray-400 text-center py-2">確認中...</p>
            ) : (
              <form onSubmit={handleSaveName} className="space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                  <UserRound size={14} /> プレイヤー名（{MAX_NAME_LENGTH}文字まで）
                </span>
                <div className="flex items-center gap-2">
                  <input
                    value={nameInput}
                    maxLength={MAX_NAME_LENGTH}
                    onChange={(e) => {
                      setNameInput(e.target.value);
                      setNameError('');
                    }}
                    autoComplete="off"
                    placeholder="ニックネームを入力"
                    className={`flex-1 min-w-0 px-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 ${
                      nameError ? 'border-red-400' : 'border-gray-200'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={!normalizeName(nameInput) || nameSaving}
                    className="shrink-0 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition disabled:opacity-40"
                  >
                    {nameSaving ? '確認中' : '決定'}
                  </button>
                  {editingName && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingName(false);
                        setNameError('');
                      }}
                      className="shrink-0 px-2 py-2.5 text-xs text-gray-400 hover:text-gray-600"
                    >
                      やめる
                    </button>
                  )}
                </div>
                {nameError ? (
                  <p className="text-[11px] text-red-500 font-bold">{nameError}</p>
                ) : (
                  <p className="text-[10px] text-gray-400">フレンドはこの名前であなたを探せます。本名ではなくニックネームがおすすめです</p>
                )}
              </form>
            )}
            {nameStatus === 'checking' && nameError && <p className="text-[11px] text-red-500 font-bold text-center">{nameError}</p>}
          </div>
        )}

        {/* 参加者ID（Google でログインした人で、まだアカウントに登録されていないときだけ） */}
        {showPidStep && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-3">
            <div className="text-center">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">STEP {pidStep}: 参加者IDを入力</span>
            </div>
            <label className="block">
              <span className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-1.5">
                <IdCard size={14} /> 参加者ID
              </span>
              <input
                type="text"
                value={participantInput}
                disabled={participantChecking}
                onChange={(e) => {
                  setParticipantInput(e.target.value);
                  setParticipantError('');
                }}
                maxLength={PARTICIPANT_ID_MAX}
                autoComplete="off"
                placeholder={participantChecking ? '確認中...' : '例: A01'}
                className={`w-full px-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-mono disabled:opacity-50 ${
                  participantError ? 'border-red-400' : 'border-gray-200'
                }`}
              />
            </label>
            {participantError ? (
              <p className="text-[11px] text-red-500 font-bold">{participantError}</p>
            ) : (
              <p className="text-[10px] text-gray-400">
                <span className="font-bold text-gray-500">このIDはアカウントに登録され、あとから変更できません。</span>
                入力まちがいに気をつけてください。
              </p>
            )}
          </div>
        )}

        {/* モード選択エリア */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="text-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              STEP {modeStep}: モードを選択して開始
            </span>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => void handleSelectMode('simple')}
              className="w-full p-4 bg-gray-50 hover:bg-blue-50/50 border border-gray-200 hover:border-blue-200 rounded-2xl transition flex items-center justify-between group text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-white rounded-xl shadow-sm text-gray-700 group-hover:text-blue-600 border border-gray-100">
                  <Coffee size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-blue-600">
                    シンプルモード (Focus Log)
                  </h3>
                  <p className="text-xs text-gray-400">
                    無駄のない洗練されたUIで勉強に集中
                  </p>
                </div>
              </div>
              <ArrowRight size={18} className="text-gray-300 group-hover:text-blue-600 transition" />
            </button>

            <button
              onClick={() => void handleSelectMode('gamified')}
              className="w-full p-4 bg-purple-50/50 hover:bg-purple-100/50 border border-purple-100 hover:border-purple-300 rounded-2xl transition flex items-center justify-between group text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-white rounded-xl shadow-sm text-purple-600 border border-purple-100">
                  <Sparkles size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-purple-950 group-hover:text-purple-700">
                    ゲーミフィケーションモード
                  </h3>
                  <p className="text-xs text-purple-400">
                    Lv・EXP・ストリークで楽しく習慣化
                  </p>
                </div>
              </div>
              <ArrowRight size={18} className="text-purple-300 group-hover:text-purple-600 transition" />
            </button>
          </div>
          {modeError && <p className="text-[11px] text-red-500 font-bold text-center">{modeError}</p>}
        </div>

        {/* 管理者用（URL に ?admin を付けたときだけ表示） */}
        {adminEntry && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-purple-100 space-y-3">
            <p className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-purple-500 uppercase tracking-widest">
              <Shield size={12} /> 管理者用
            </p>
            {!user ? (
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full py-3 bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 font-bold rounded-2xl transition flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                <LogIn size={16} /> Googleアカウントでログイン（管理者）
              </button>
            ) : (
              <button
                onClick={() => onOpenAdmin?.()}
                className="w-full py-3 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-2xl transition text-xs flex items-center justify-center gap-2 border border-purple-100"
              >
                <Lock size={16} /> 管理者ページを開く
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StartApp;