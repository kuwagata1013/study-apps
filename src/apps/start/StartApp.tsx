import React, { useState } from 'react';
import { Coffee, Sparkles, LogIn, ArrowRight, User, IdCard, UserRound, Pencil } from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../../firebase';
import {
  getParticipantId,
  saveParticipantId,
  normalizeParticipantId,
  isValidParticipantId,
  PARTICIPANT_ID_MAX
} from '../../lib/participant';
import { claimPlayerName, MAX_NAME_LENGTH, normalizeName } from '../../lib/players';

interface StartAppProps {
  onSelectMode: (mode: 'simple' | 'gamified') => void;
  user: any;
  playerName?: string;
  nameStatus?: 'none' | 'checking' | 'ready' | 'missing';
  onNameSaved?: (name: string) => void;
}

export const StartApp: React.FC<StartAppProps> = ({ onSelectMode, user, playerName = '', nameStatus = 'none', onNameSaved }) => {
  const [loading, setLoading] = useState(false);

  // プレイヤー名（ログインしている人だけ。Google アカウントの名前は使わない）
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const needsName = !!user && nameStatus !== 'ready';
  // 名前のステップは、名前がまだ決まっていないときと変更中だけ出す（決まっていれば STEP 1 に名前を表示する）
  const showNameStep = !!user && (nameStatus !== 'ready' || editingName);
  const idStep = showNameStep ? 3 : 2;
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

  const participantId = normalizeParticipantId(participantInput);
  const isParticipantValid = isValidParticipantId(participantId);

  // 参加者IDを確認・保存してからモードを開始
  const handleSelectMode = (mode: 'simple' | 'gamified') => {
    if (needsName) {
      setNameError(nameStatus === 'checking' ? '名前を確認中です。少し待ってからもう一度押してください' : '先にプレイヤー名を決めてください');
      return;
    }
    if (!isParticipantValid) {
      setParticipantError('参加者IDを入力してください（半角英数字・ハイフン・アンダースコア、32文字まで）');
      return;
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
            STEP 1: アカウント確認
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
                  <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
                </div>
              </div>
              <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2.5 py-1 rounded-full shrink-0">
                認証済み
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-md transition active:scale-98 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                <LogIn size={18} />
                {loading ? 'ログイン中...' : 'Googleアカウントでログイン'}
              </button>
              <p className="text-[10px] text-gray-400">
                ※未ログインのままゲストで利用を開始することも可能です
              </p>
            </div>
          )}
        </div>

        {/* STEP 2: プレイヤー名（ログインしていて、名前がまだのときと変更中だけ） */}
        {showNameStep && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-3">
            <div className="text-center">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                STEP 2: {editingName ? 'プレイヤー名を変更' : 'プレイヤー名を決める'}
              </span>
            </div>

            {nameStatus === 'checking' ? (
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

        {/* 参加者ID */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-3">
          <div className="text-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              STEP {idStep}: 参加者IDを入力
            </span>
          </div>
          <label className="block">
            <span className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-1.5">
              <IdCard size={14} /> 参加者ID
            </span>
            <input
              type="text"
              value={participantInput}
              onChange={(e) => {
                setParticipantInput(e.target.value);
                setParticipantError('');
              }}
              maxLength={PARTICIPANT_ID_MAX}
              autoComplete="off"
              placeholder="例: A01"
              className={`w-full px-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-mono ${
                participantError ? 'border-red-400' : 'border-gray-200'
              }`}
            />
          </label>
          {participantError ? (
            <p className="text-[11px] text-red-500 font-bold">{participantError}</p>
          ) : (
            <p className="text-[10px] text-gray-400">
              配布されたIDを入力してください。どの端末でも同じIDを使うと、記録がまとめて集計されます。
            </p>
          )}
        </div>

        {/* モード選択エリア */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="text-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              STEP {idStep + 1}: モードを選択して開始
            </span>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => handleSelectMode('simple')}
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
              onClick={() => handleSelectMode('gamified')}
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
        </div>

      </div>
    </div>
  );
};

export default StartApp;