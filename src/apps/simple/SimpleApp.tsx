import React, { useState, useEffect, useRef } from 'react';
import { 
  Clock, 
  CheckSquare, 
  BarChart2, 
  User, 
  Play, 
  Pause, 
  RotateCcw, 
  Plus, 
  Trash2, 
  Volume2, 
  VolumeX, 
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Timer,
  Settings,
  Music,
  Upload,
  Save,
  Lock,
  LogOut,
  RefreshCw
} from 'lucide-react';
import { auth } from '../../firebase';
import { getLocalAvatar, setLocalAvatar, resizeImageFile, isDataUrl } from '../../lib/avatar';
import { saveResearchLog } from '../../lib/researchLog';
import { getParticipantId } from '../../lib/participant';
import { updateProfile, signOut } from 'firebase/auth';

interface SimpleAppProps {
  user?: any;
  onSelectMode?: (mode: 'simple' | 'gamified') => void;
  onOpenAdmin?: () => void;
  onResetMode?: () => void; // モード切替（スタート画面へ戻る）用コールバック
}

interface StudyLog {
  id: string;
  subject: string;
  durationSeconds: number;
  durationMinutes?: number;
  createdAt: string;
  dateKey: string;
  memo: string;
}

interface Task {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: string;
  completedAt?: string;
  completedDateKey?: string;
}

export const SimpleApp: React.FC<SimpleAppProps> = ({ 
  user, 
  onOpenAdmin,
  onResetMode 
}) => {
  // 1. タブ管理 (timer | todo | calendar | stats | profile)
  const [activeTab, setActiveTab] = useState<'timer' | 'todo' | 'calendar' | 'stats' | 'profile'>('timer');

  // 2. タイマー関連ステート
  const [timerMode, setTimerMode] = useState<'countup' | 'countdown'>('countup');
  const [targetMinutes, setTargetMinutes] = useState(25);
  const [seconds, setSeconds] = useState(0);
  const [elapsedSecondsCount, setElapsedSecondsCount] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [subject, setSubject] = useState('英語');
  const [customSubject, setCustomSubject] = useState('');
  const [memo, setMemo] = useState('');

  // 3. データステート
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', title: '英語 単語帳 p.20-40', completed: false, dueDate: new Date().toISOString().split('T')[0] },
    { id: '2', title: '数学 ワーク2ページ', completed: true, dueDate: '2026-09-15', completedAt: '2026-09-15 14:30:15', completedDateKey: '2026-09-15' },
  ]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');

  // 4. BGM関連ステート
  const [isPlayingBgm, setIsPlayingBgm] = useState(false);
  const [bgmType, setBgmType] = useState<'rain' | 'waves' | 'cafe'>('rain');

  // 5. カレンダー・統計操作ステート
  const [statsPeriod, setStatsPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
  const [selectedCalendarDateStr, setSelectedCalendarDateStr] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // 6. マイページ内 アカウント設定編集ステート
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');

  // 7. 管理者認証モーダルステート

  // ユーザー情報の同期
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setPhotoURL(getLocalAvatar(user.uid) || user.photoURL || '');
    }
  }, [user]);

  // モード切替時（タイマー計測中でない場合のみ初期化）
  const handleSwitchTimerMode = (newMode: 'countup' | 'countdown') => {
    if (isActive) {
      alert('計測中はモードを変更できません。一度一時停止してください。');
      return;
    }

    setTimerMode(newMode);

    if (elapsedSecondsCount === 0 && seconds === 0) {
      if (newMode === 'countdown') {
        setSeconds(targetMinutes * 60);
      } else {
        setSeconds(0);
      }
    }
  };

  // 減算モードの目標分数指定
  const handleChangeTargetMinutes = (mins: number) => {
    setTargetMinutes(mins);
    if (!isActive && elapsedSecondsCount === 0) {
      setSeconds(mins * 60);
    }
  };

  // 計測セッションの開始時刻（最初に開始を押した時刻。保存・リセットで解除）
  const sessionStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (isActive && sessionStartRef.current === null) {
      sessionStartRef.current = Date.now();
    }
  }, [isActive]);

  // タイマーカウント処理
  // 実時間との差分で進めるため、タブが裏に回って処理が間引かれても時間がずれない
  const secondsRef = useRef(seconds);
  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  useEffect(() => {
    if (!isActive) return;
    let lastTick = Date.now();
    const interval = setInterval(() => {
      const delta = Math.floor((Date.now() - lastTick) / 1000);
      if (delta <= 0) return;
      lastTick += delta * 1000;

      if (timerMode === 'countup') {
        setSeconds((sec) => sec + delta);
        setElapsedSecondsCount((sec) => sec + delta);
      } else {
        const remaining = secondsRef.current;
        const step = Math.min(delta, remaining);
        const next = remaining - step;
        secondsRef.current = next;
        setSeconds(next);
        setElapsedSecondsCount((sec) => sec + step);
        if (next <= 0) {
          clearInterval(interval);
          setIsActive(false);
          alert('設定時間が経過しました！');
        }
      }
    }, 250);
    return () => clearInterval(interval);
  }, [isActive, timerMode]);

  // LocalStorage からデータ読み込み
  useEffect(() => {
    const logKey = 'simple_study_logs';
    const taskKey = 'simple_tasks';

    const savedLogs = localStorage.getItem(logKey);
    if (savedLogs) {
      try { setLogs(JSON.parse(savedLogs)); } catch (e) {}
    }
    const savedTasks = localStorage.getItem(taskKey);
    if (savedTasks) {
      try { setTasks(JSON.parse(savedTasks)); } catch (e) {}
    }
  }, []);

  // プロフィール更新
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    setIsUpdatingProfile(true);
    setProfileMessage('');

    try {
      // 端末内の画像は localStorage に保存し、Auth には URL の場合のみ保存する
      if (isDataUrl(photoURL)) {
        setLocalAvatar(auth.currentUser.uid, photoURL);
        await updateProfile(auth.currentUser, { displayName: displayName });
      } else {
        setLocalAvatar(auth.currentUser.uid, null);
        await updateProfile(auth.currentUser, {
          displayName: displayName,
          photoURL: photoURL || null
        });
      }
      setProfileMessage('プロフィールを保存しました！');
      setTimeout(() => setProfileMessage(''), 3000);
    } catch (error) {
      console.error('プロフィール更新エラー:', error);
      setProfileMessage('更新に失敗しました。');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // 画像ファイルアップロード（縮小してこの端末に保存）
  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('画像サイズは10MB以下にしてください');
      return;
    }
    try {
      setPhotoURL(await resizeImageFile(file));
    } catch (error) {
      console.error('画像の読み込みエラー:', error);
      alert('画像を読み込めませんでした');
    }
  };

  // ログアウト処理
  const handleLogout = async () => {
    try {
      await signOut(auth);
      alert('ログアウトしました');
    } catch (error) {
      console.error('ログアウトエラー:', error);
    }
  };

  // スタート画面に戻る（モード再選択）
  const handleResetModeCall = () => {
    if (onResetMode) {
      onResetMode();
    } else {
      localStorage.removeItem('study_app_preferred_mode');
      window.location.reload();
    }
  };

  // ログ保存
  const handleSaveLog = async () => {
    const recordSeconds = elapsedSecondsCount > 0 ? elapsedSecondsCount : (timerMode === 'countup' ? seconds : (targetMinutes * 60 - seconds));
    if (recordSeconds < 3) {
      alert('3秒以上の計測のみ保存されます');
      return;
    }

    const finalSubject = subject === 'その他' ? (customSubject.trim() || 'その他') : subject;
    const now = new Date();
    const dateKey = now.toISOString().split('T')[0];
    
    const newLog: StudyLog = {
      id: Date.now().toString(),
      subject: finalSubject,
      durationSeconds: recordSeconds,
      durationMinutes: Math.round(recordSeconds / 60),
      createdAt: now.toLocaleString('ja-JP'),
      dateKey: dateKey,
      memo
    };

    const logKey = 'simple_study_logs';
    const updatedLogs = [newLog, ...logs];
    setLogs(updatedLogs);
    localStorage.setItem(logKey, JSON.stringify(updatedLogs));

    await saveResearchLog({
      mode: 'simple',
      uid: user?.uid,
      subject: finalSubject,
      durationSeconds: recordSeconds,
      startedAtMs: sessionStartRef.current,
      memo,
      timerType: timerMode
    });
    sessionStartRef.current = null;

    setIsActive(false);
    setSeconds(timerMode === 'countdown' ? targetMinutes * 60 : 0);
    setElapsedSecondsCount(0);
    setMemo('');
    alert(`学習ログを保存しました（${formatTimeDetail(recordSeconds)}）`);
  };

  // ToDo タスク追加
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    
    const newTask: Task = {
      id: Date.now().toString(),
      title: newTaskTitle.trim(),
      completed: false,
      dueDate: newTaskDueDate || undefined
    };

    const taskKey = 'simple_tasks';
    const updated = [newTask, ...tasks];
    setTasks(updated);
    localStorage.setItem(taskKey, JSON.stringify(updated));

    setNewTaskTitle('');
    setNewTaskDueDate('');
  };

  // ToDo 完了処理
  const toggleTask = (id: string) => {
    const taskKey = 'simple_tasks';
    const now = new Date();
    const dateKey = now.toISOString().split('T')[0];

    const updated = tasks.map((t) => {
      if (t.id === id) {
        const nextState = !t.completed;
        return {
          ...t,
          completed: nextState,
          completedAt: nextState ? now.toLocaleString('ja-JP') : undefined,
          completedDateKey: nextState ? dateKey : undefined
        };
      }
      return t;
    });
    setTasks(updated);
    localStorage.setItem(taskKey, JSON.stringify(updated));
  };

  // ToDo 削除
  const deleteTask = (id: string) => {
    const taskKey = 'simple_tasks';
    const updated = tasks.filter((t) => t.id !== id);
    setTasks(updated);
    localStorage.setItem(taskKey, JSON.stringify(updated));
  };

  // フォーマット関数
  const formatTime = (totalSeconds: number) => {
    const validSecs = isNaN(totalSeconds) || totalSeconds < 0 ? 0 : totalSeconds;
    const mins = Math.floor(validSecs / 60);
    const secs = validSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimeDetail = (totalSeconds: number) => {
    const validSeconds = isNaN(totalSeconds) || !totalSeconds ? 0 : totalSeconds;
    const hours = Math.floor(validSeconds / 3600);
    const mins = Math.floor((validSeconds % 3600) / 60);
    const secs = validSeconds % 60;
    
    if (hours > 0) return `${hours}時間${mins}分${secs}秒`;
    return `${mins}分${secs}秒`;
  };

  const totalSecondsAll = logs.reduce((acc, log) => {
    const secs = log.durationSeconds ?? ((log.durationMinutes || 0) * 60);
    return acc + (isNaN(secs) ? 0 : secs);
  }, 0);

  // カレンダー計算
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const prevMonth = () => setCurrentCalendarDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentCalendarDate(new Date(year, month + 1, 1));

  // 選択日のログおよび合計時間計算
  const logsOnSelectedDate = logs.filter(l => (l.dateKey || l.createdAt.split(' ')[0].replace(/\//g, '-')) === selectedCalendarDateStr);
  const totalSecondsOnSelectedDate = logsOnSelectedDate.reduce((acc, log) => {
    const secs = log.durationSeconds ?? ((log.durationMinutes || 0) * 60);
    return acc + (isNaN(secs) ? 0 : secs);
  }, 0);

  const tasksCompletedOnSelectedDate = tasks.filter(t => t.completed && t.completedDateKey === selectedCalendarDateStr);
  const tasksDueOnSelectedDate = tasks.filter(t => t.dueDate === selectedCalendarDateStr);

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 pb-24 antialiased">
      
      <main className="max-w-md mx-auto p-4 space-y-6 pt-4">

        {/* ===== TAB 1: タイマー ===== */}
        {activeTab === 'timer' && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 text-center space-y-4">
              
              {/* 加算 vs 減算 切替 */}
              <div className="flex justify-center pt-2">
                <div className="bg-gray-100 p-1 rounded-2xl flex gap-1 border border-gray-200">
                  <button
                    onClick={() => handleSwitchTimerMode('countup')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                      timerMode === 'countup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    <Clock size={14} /> 加算
                  </button>
                  <button
                    onClick={() => handleSwitchTimerMode('countdown')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                      timerMode === 'countdown' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    <Timer size={14} /> 減算
                  </button>
                </div>
              </div>

              {/* 減算時 目標時間指定 */}
              {timerMode === 'countdown' && !isActive && elapsedSecondsCount === 0 && (
                <div className="flex justify-center gap-1.5 pt-1">
                  {[10, 15, 25, 30, 60].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => handleChangeTargetMinutes(mins)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                        targetMinutes === mins 
                          ? 'bg-blue-50 text-blue-700 border-blue-300 font-bold' 
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {mins}分
                    </button>
                  ))}
                </div>
              )}

              {/* 科目選択 */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-center flex-wrap gap-1.5">
                  {['英語', '数学', '国語', '理科', '社会', 'その他'].map((sub) => (
                    <button
                      key={sub}
                      onClick={() => setSubject(sub)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                        subject === sub 
                          ? 'bg-gray-900 text-white shadow-sm' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>

                {subject === 'その他' && (
                  <input
                    type="text"
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    placeholder="教科・勉強内容を入力"
                    className="w-full max-w-xs px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-center focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                )}
              </div>

              {/* タイマー表示 */}
              <div className="py-8 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col items-center justify-center">
                <span className="text-6xl font-extrabold tracking-tight text-gray-900 font-mono">
                  {formatTime(seconds)}
                </span>
                <p className="text-xs text-gray-400 mt-2 font-medium">
                  {elapsedSecondsCount > 0 
                    ? `計測実績: ${formatTimeDetail(elapsedSecondsCount)}` 
                    : (timerMode === 'countup' ? '経過時間を計測中' : `目標: ${targetMinutes}分 カウントダウン`)}
                </p>
              </div>

              {/* 操作ボタン */}
              <div className="flex gap-3">
                <button
                  onClick={() => setIsActive(!isActive)}
                  className={`flex-1 py-4 rounded-2xl font-bold text-white transition flex items-center justify-center gap-2 shadow-md ${
                    isActive ? 'bg-amber-500 hover:bg-amber-600' : 'bg-gray-900 hover:bg-gray-800'
                  }`}
                >
                  {isActive ? <Pause size={20} /> : <Play size={20} />}
                  {isActive ? '一時停止' : '計測開始'}
                </button>
                
                <button
                  onClick={() => {
                    setIsActive(false);
                    setSeconds(timerMode === 'countdown' ? targetMinutes * 60 : 0);
                    setElapsedSecondsCount(0);
                    sessionStartRef.current = null;
                  }}
                  className="p-4 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-2xl transition"
                  title="リセット"
                >
                  <RotateCcw size={20} />
                </button>
              </div>

              {(elapsedSecondsCount > 0 || seconds > 0) && !isActive && (
                <div className="pt-4 border-t border-gray-100 space-y-3">
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="振り返りメモ（例: 公式の暗記を完了）"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                  <button
                    onClick={handleSaveLog}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-xs transition shadow-sm"
                  >
                    学習時間を保存する
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== TAB 2: ToDo ===== */}
        {activeTab === 'todo' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center justify-between">
                <span className="flex items-center gap-2"><CheckSquare size={18} /> 学習タスク & 期限管理</span>
              </h2>

              <form onSubmit={handleAddTask} className="space-y-2">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="やることを入力..."
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
                    <CalendarIcon size={14} />
                    <input
                      type="date"
                      value={newTaskDueDate}
                      onChange={(e) => setNewTaskDueDate(e.target.value)}
                      className="bg-transparent focus:outline-none w-full"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-gray-900 text-white font-bold rounded-xl text-xs hover:bg-gray-800 transition flex items-center gap-1 shrink-0"
                  >
                    <Plus size={16} /> 追加
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                タスク一覧・こなした履歴
              </h3>

              <div className="space-y-2">
                {tasks.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">タスクはありません</p>
                ) : (
                  tasks.map((task) => (
                    <div 
                      key={task.id} 
                      className="p-3 bg-gray-50 rounded-2xl border border-gray-100 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2.5 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => toggleTask(task.id)}
                            className="w-4 h-4 rounded text-gray-900 focus:ring-gray-400"
                          />
                          <span className={task.completed ? 'line-through text-gray-400 font-normal' : 'text-gray-900 font-bold'}>
                            {task.title}
                          </span>
                        </label>
                        <button
                          onClick={() => deleteTask(task.id)}
                          className="text-gray-400 hover:text-red-500 transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="flex justify-between items-center text-[10px] text-gray-400 pl-6 pt-1 border-t border-gray-100">
                        {task.dueDate ? (
                          <span className="flex items-center gap-1 font-semibold text-amber-600">
                            <CalendarIcon size={10} /> 期限: {task.dueDate}
                          </span>
                        ) : (
                          <span>期限なし</span>
                        )}

                        {task.completedAt && (
                          <span className="flex items-center gap-1 text-green-600 font-bold">
                            <CheckCircle2 size={10} /> 達成日時: {task.completedAt}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 3: カレンダー ===== */}
        {activeTab === 'calendar' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <CalendarIcon size={16} className="text-blue-600" />
                  {year}年 {month + 1}月 学習・タスクカレンダー
                </h3>
                <div className="flex items-center gap-1">
                  <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded-lg text-gray-600"><ChevronLeft size={16} /></button>
                  <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded-lg text-gray-600"><ChevronRight size={16} /></button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
                {['日', '月', '火', '水', '木', '金', '土'].map((d, idx) => (
                  <div key={d} className={`font-bold py-1 ${idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-gray-400'}`}>
                    {d}
                  </div>
                ))}

                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-9" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
                  const isSelected = dateStr === selectedCalendarDateStr;

                  const hasLog = logs.some(l => (l.dateKey || l.createdAt.split(' ')[0].replace(/\//g, '-')) === dateStr);
                  const hasCompletedTask = tasks.some(t => t.completed && t.completedDateKey === dateStr);
                  const hasDueTask = tasks.some(t => t.dueDate === dateStr);

                  return (
                    <button
                      key={dayNum}
                      onClick={() => setSelectedCalendarDateStr(dateStr)}
                      className={`h-9 rounded-xl flex flex-col items-center justify-center relative transition ${
                        isSelected 
                          ? 'bg-blue-600 text-white font-bold shadow-sm' 
                          : 'hover:bg-gray-100 text-gray-800'
                      }`}
                    >
                      <span>{dayNum}</span>
                      <div className="flex gap-0.5 mt-0.5">
                        {hasLog && <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-green-500'}`} />}
                        {hasCompletedTask && <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-yellow-300' : 'bg-blue-500'}`} />}
                        {hasDueTask && <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-pink-300' : 'bg-amber-500'}`} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 選択日の詳細 */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
              <div className="border-b pb-2 flex justify-between items-center">
                <span className="text-xs font-bold text-gray-900">選択中: {selectedCalendarDateStr} の記録</span>
                <span className="text-xs font-extrabold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                  合計: {formatTimeDetail(totalSecondsOnSelectedDate)}
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase">学習時間ログ</p>
                {logsOnSelectedDate.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-1">この日の勉強記録はありません</p>
                ) : (
                  logsOnSelectedDate.map(log => {
                    const secs = log.durationSeconds ?? ((log.durationMinutes || 0) * 60);
                    return (
                      <div key={log.id} className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center text-xs">
                        <span className="font-bold text-gray-900 bg-white px-2 py-0.5 rounded border border-gray-200">{log.subject}</span>
                        <span className="font-mono font-bold text-gray-800">{formatTimeDetail(secs)}</span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="space-y-2 pt-2 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase">こなしたタスク & 期限付きタスク</p>
                {tasksCompletedOnSelectedDate.length === 0 && tasksDueOnSelectedDate.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-1">この日にこなしたタスクはありません</p>
                ) : (
                  <div className="space-y-1.5">
                    {tasksCompletedOnSelectedDate.map(t => (
                      <div key={t.id} className="p-2 bg-green-50/60 rounded-xl border border-green-100 flex items-center justify-between text-xs text-green-900 font-semibold">
                        <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-green-600" /> {t.title}</span>
                        <span className="text-[10px] text-green-700">達成</span>
                      </div>
                    ))}
                    {tasksDueOnSelectedDate.map(t => (
                      <div key={t.id} className="p-2 bg-amber-50/60 rounded-xl border border-amber-100 flex items-center justify-between text-xs text-amber-900 font-semibold">
                        <span className="flex items-center gap-1.5"><CalendarIcon size={14} className="text-amber-600" /> {t.title}</span>
                        <span className="text-[10px] text-amber-700">本日期限</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 4: 詳細統計 ===== */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex justify-between items-center">
              <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                <BarChart2 size={16} /> 集計期間
              </span>
              <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
                {(['day', 'week', 'month'] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => setStatsPeriod(period)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      statsPeriod === period ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {period === 'day' ? '日' : period === 'week' ? '週' : '月'}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                通算統計サマリー (秒単位)
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">累計勉強時間</p>
                  <p className="text-base font-extrabold text-gray-900 mt-1">{formatTimeDetail(totalSecondsAll)}</p>
                  <p className="text-[9px] text-gray-400">({totalSecondsAll} 秒)</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">総セッション数</p>
                  <p className="text-2xl font-extrabold text-gray-900 mt-1">{logs.length} <span className="text-xs font-normal">回</span></p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                全学習ログ履歴
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {logs.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">履歴データがありません</p>
                ) : (
                  logs.map((log) => {
                    const secs = log.durationSeconds ?? ((log.durationMinutes || 0) * 60);
                    return (
                      <div key={log.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-gray-900 bg-white px-2 py-0.5 rounded-md border border-gray-200">
                            {log.subject}
                          </span>
                          <span className="font-mono font-bold text-gray-800">{formatTimeDetail(secs)}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-gray-400 pt-0.5">
                          <span>{log.createdAt}</span>
                          {log.memo && <span className="italic text-gray-600">"{log.memo}"</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 5: マイページ ===== */}
        {activeTab === 'profile' && (
          <div className="space-y-4">
            
            {/* プロフィール設定フォーム */}
            <form onSubmit={handleUpdateProfile} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                <User size={18} /> アカウント・プロフィール設定
              </h2>

              <div className="flex items-center gap-4 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-200 border border-gray-300 flex items-center justify-center shrink-0">
                  {photoURL ? (
                    <img src={photoURL} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <User size={28} className="text-gray-400" />
                  )}
                </div>
                <div className="text-xs text-gray-500 overflow-hidden">
                  <p className="font-bold text-gray-900 text-sm truncate">{displayName || '未設定'}</p>
                  <p className="truncate text-gray-400">{user?.email || 'ゲストアカウント'}</p>
                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">参加者ID: {getParticipantId() || '未入力'}</p>
                </div>
              </div>

              {user && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">名前</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                      placeholder="表示名を入力"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">アイコン画像</label>
                    <div className="space-y-2">
                      <input
                        type="url"
                        value={isDataUrl(photoURL) ? '' : photoURL}
                        onChange={(e) => setPhotoURL(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                        placeholder={isDataUrl(photoURL) ? '端末の画像を使用中（URLを入力すると置き換え）' : '画像URLを入力 (https://...)'}
                      />
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageFileUpload}
                          className="hidden"
                          id="profile-icon-file-input"
                        />
                        <label
                          htmlFor="profile-icon-file-input"
                          className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition border border-gray-200"
                        >
                          <Upload size={14} /> 画像ファイルを選択
                        </label>
                      </div>
                    </div>
                  </div>

                  {profileMessage && (
                    <p className="text-xs font-semibold text-green-600 text-center">{profileMessage}</p>
                  )}

                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
                  >
                    <Save size={16} />
                    {isUpdatingProfile ? '更新中...' : 'プロフィールを保存'}
                  </button>
                </>
              )}
            </form>

            {/* BGM環境音設定 */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                <Music size={18} /> 集中BGM環境音
              </h2>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'rain', label: '雨の音' },
                  { id: 'waves', label: '波の音' },
                  { id: 'cafe', label: 'カフェ' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setBgmType(item.id as any)}
                    className={`py-3 px-2 rounded-2xl text-xs font-bold transition border ${
                      bgmType === item.id 
                        ? 'bg-gray-900 text-white border-gray-900' 
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setIsPlayingBgm(!isPlayingBgm)}
                className={`w-full py-3.5 rounded-2xl font-bold text-white transition flex items-center justify-center gap-2 shadow-sm ${
                  isPlayingBgm ? 'bg-amber-500 hover:bg-amber-600' : 'bg-gray-900 hover:bg-gray-800'
                }`}
              >
                {isPlayingBgm ? <VolumeX size={18} /> : <Volume2 size={18} />}
                {isPlayingBgm ? 'BGMを停止' : 'BGMを再生'}
              </button>
            </div>

            {/* システム連携・モード切替・管理者認証ボタン */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-3">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                <Settings size={18} /> アプリ設定・検証
              </h2>

              {/* モード切替（スタート画面へ戻る）ボタン */}
              <button
                onClick={handleResetModeCall}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-2xl transition text-xs flex items-center justify-center gap-2 border border-gray-200"
              >
                <RefreshCw size={16} />
                モードを再選択する（スタート画面へ）
              </button>

              <button
                onClick={() => onOpenAdmin?.()}
                className="w-full py-3 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-2xl transition text-xs flex items-center justify-center gap-2 border border-purple-100"
              >
                <Lock size={16} />
                管理者用分析ページ（管理者アカウント限定）
              </button>

              {user && (
                <button
                  onClick={handleLogout}
                  className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-2xl transition text-xs flex items-center justify-center gap-2 border border-red-100"
                >
                  <LogOut size={16} />
                  ログアウト
                </button>
              )}
            </div>

          </div>
        )}

      </main>

      {/* 下部5タブバー */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-200 py-2 px-4 z-30">
        <div className="max-w-md mx-auto flex justify-around items-center">
          <button
            onClick={() => setActiveTab('timer')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'timer' ? 'text-gray-900 font-bold' : 'text-gray-400'}`}
          >
            <Clock size={20} />
            <span className="text-[10px]">タイマー</span>
          </button>

          <button
            onClick={() => setActiveTab('todo')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'todo' ? 'text-gray-900 font-bold' : 'text-gray-400'}`}
          >
            <CheckSquare size={20} />
            <span className="text-[10px]">ToDo</span>
          </button>

          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'calendar' ? 'text-gray-900 font-bold' : 'text-gray-400'}`}
          >
            <CalendarIcon size={20} />
            <span className="text-[10px]">カレンダー</span>
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'stats' ? 'text-gray-900 font-bold' : 'text-gray-400'}`}
          >
            <BarChart2 size={20} />
            <span className="text-[10px]">詳細統計</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'profile' ? 'text-gray-900 font-bold' : 'text-gray-400'}`}
          >
            <User size={20} />
            <span className="text-[10px]">マイページ</span>
          </button>
        </div>
      </nav>

    </div>
  );
};

export default SimpleApp; 