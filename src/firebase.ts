import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB8bJZtNsyn9rk9z3uq6kEVwAKFgN9IOf4",
  authDomain: "phurakdin-65862.firebaseapp.com",
  projectId: "phurakdin-65862",
  storageBucket: "phurakdin-65862.firebasestorage.app",
  messagingSenderId: "207176614063",
  appId: "1:207176614063:web:90313715007ccea3d0545a",
  measurementId: "G-NHNLPDY2KK"
};

// ป้องกันการ Initialize ซ้ำซ้อน
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
