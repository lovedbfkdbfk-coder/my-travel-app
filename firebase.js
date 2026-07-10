// Firebase SDK 불러오기
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  push,
  remove
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyDMTPOkpKYJBi-6yQn9DQIksXbRL6GzKrA",
  authDomain: "fukuoka-6315e.firebaseapp.com",
  databaseURL: "https://fukuoka-6315e-default-rtdb.firebaseio.com",
  projectId: "fukuoka-6315e",
  storageBucket: "fukuoka-6315e.firebasestorage.app",
  messagingSenderId: "566795703366",
  appId: "1:566795703366:web:5dcb3ff8d1939e723f2647"
};

// Firebase 시작
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 다른 파일에서도 사용할 수 있도록 내보내기
export {
  db,
  ref,
  onValue,
  set,
  push,
  remove
};

console.log("✅ Firebase 연결 성공!");