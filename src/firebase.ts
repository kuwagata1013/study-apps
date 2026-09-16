// src/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyANTxapE-5rPsHrau-ht6sXtVpc5lde2Y0",
  authDomain: "study-app-f9521.firebaseapp.com",
  projectId: "study-app-f9521",
  storageBucket: "study-app-f9521.firebasestorage.app",
  messagingSenderId: "844982321447",
  appId: "1:844982321447:web:338a35ec2ee104256ec902",
  measurementId: "G-QSX0W6GX2P"
};

// 二重初期化を防止する判定
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);
export const auth = getAuth(app);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export default app;