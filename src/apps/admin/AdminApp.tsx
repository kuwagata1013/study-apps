import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Users, 
  Clock, 
  FileText, 
  RefreshCw, 
  Smartphone, 
  Database,
  ArrowLeft
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDummyKeyForLocalTest12345",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "localhost",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "local-test",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

interface ResearchLog {
  id?: string;
  subject: string;
  durationMinutes: number;
  createdAt: string;
  memo?: string;
  mode?: 'simple' | 'gamified';
  deviceId?: string;
  uid?: string;
  userEmail?: string | null;
  userAgent?: string;
}

interface AdminAppProps {
  onBack?: () => void;
}

export const AdminApp: React.FC<AdminAppProps> = ({ onBack }) => {
  const [logs, setLogs] = useState<ResearchLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchResearchLogs = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'researchLogs'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const fetchedLogs: ResearchLog[] = [];
      querySnapshot.forEach((doc) => {
        fetchedLogs.push({ id: doc.id, ...doc.data() } as ResearchLog);
      });
      setLogs(fetchedLogs);
    } catch (e) {
      const savedLogs = localStorage.getItem('ios_study_logs');
      if (savedLogs) {
        const parsed = JSON.parse(savedLogs);
        setLogs(parsed.map((l: any) => ({ ...l, mode: 'simple', deviceId: 'local_device' })));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResearchLogs();
  }, []);

  const totalMinutes = logs.reduce((sum, l) => sum + l.durationMinutes, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const totalLogs = logs.length;
  const uniqueDevices = new Set(logs.map(l => l.deviceId || l.uid || 'unknown')).size;

  const gamifiedLogs = logs.filter(l => l.mode === 'gamified');
  const simpleLogs = logs.filter(l => l.mode === 'simple' || !l.mode);

  const gamifiedTotalMins = gamifiedLogs.reduce((sum, l) => sum + l.durationMinutes, 0);
  const simpleTotalMins = simpleLogs.reduce((sum, l) => sum + l.durationMinutes, 0);

  const gamifiedAvgMins = gamifiedLogs.length > 0 ? (gamifiedTotalMins / gamifiedLogs.length).toFixed(1) : '0';
  const simpleAvgMins = simpleLogs.length > 0 ? (simpleTotalMins / simpleLogs.length).toFixed(1) : '0';

  return (
    <div className="space-y-4 max-w-md mx-auto pb-12">
      {/* ヘッダーカード */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex justify-between items-center">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 transition">
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Database size={18} className="text-blue-600" />
              探究データ分析
            </h2>
            <p className="text-xs text-gray-400">ユーザー行動・比較検証データ</p>
          </div>
        </div>
        <button
          onClick={fetchResearchLogs}
          disabled={loading}
          className="p-2.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl transition disabled:opacity-50"
          title="更新"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* サマリーカード（3カラム） */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 text-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">累計時間</span>
          <p className="text-xl font-bold font-mono text-gray-900 mt-1">{totalHours}<span className="text-xs font-sans text-gray-400">h</span></p>
        </div>
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 text-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">セッション</span>
          <p className="text-xl font-bold font-mono text-gray-900 mt-1">{totalLogs}<span className="text-xs font-sans text-gray-400">回</span></p>
        </div>
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 text-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">端末数</span>
          <p className="text-xl font-bold font-mono text-gray-900 mt-1">{uniqueDevices}<span className="text-xs font-sans text-gray-400">台</span></p>
        </div>
      </div>

      {/* 比較分析カード */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 size={16} className="text-blue-600" />
          モード別平均学習時間
        </h3>
        
        <div className="space-y-3">
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex justify-between items-center">
            <div>
              <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                ゲーミフィケーション
              </span>
              <p className="text-xs text-gray-400 mt-1">{gamifiedLogs.length} 件のデータ</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-mono font-bold text-gray-900">{gamifiedAvgMins} <span className="text-xs font-sans text-gray-500">分/回</span></p>
              <p className="text-xs text-gray-400">計 {(gamifiedTotalMins / 60).toFixed(1)}h</p>
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex justify-between items-center">
            <div>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                シンプル版
              </span>
              <p className="text-xs text-gray-400 mt-1">{simpleLogs.length} 件のデータ</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-mono font-bold text-gray-900">{simpleAvgMins} <span className="text-xs font-sans text-gray-500">分/回</span></p>
              <p className="text-xs text-gray-400">計 {(simpleTotalMins / 60).toFixed(1)}h</p>
            </div>
          </div>
        </div>
      </div>

      {/* ログ一覧カード */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <Smartphone size={16} className="text-blue-600" />
          データログ一覧 ({logs.length}件)
        </h3>

        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {logs.length === 0 ? (
            <p className="text-gray-400 text-xs text-center py-6">データログはありません</p>
          ) : (
            logs.map((log, i) => (
              <div key={log.id || i} className="p-3 bg-gray-50 rounded-2xl border border-gray-100 space-y-1 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-gray-900">{log.subject}</span>
                  <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    {log.durationMinutes} 分
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>{new Date(log.createdAt).toLocaleString()}</span>
                  <span className="font-mono text-gray-500">{log.deviceId || log.uid || 'Anonymous'} ({log.mode || 'simple'})</span>
                </div>
                {log.memo && (
                  <p className="text-gray-600 bg-white p-2 rounded-xl border border-gray-100 mt-1">
                    💬 {log.memo}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminApp;