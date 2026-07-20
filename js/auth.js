// Firebase Auth (ESM 모듈) — firebase-config.js 다음에 로드
import { getAuth, createUserWithEmailAndPassword,
         signInWithEmailAndPassword, signOut,
         onAuthStateChanged }                         from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

const fbAuth = getAuth(window.fbApp);
window._fbAuth = fbAuth;
window.auth    = fbAuth;   // 요청된 별칭

// 인증 함수 — Firestore 파사드(window._fb)에 병합
Object.assign(window._fb, {
  createUser: (email, pw) => createUserWithEmailAndPassword(fbAuth, email, pw),
  signIn:     (email, pw) => signInWithEmailAndPassword(fbAuth, email, pw),
  signOut:    ()          => signOut(fbAuth),
});

// 로그인 상태 → window.currentUser 노출
onAuthStateChanged(fbAuth, (user) => { window.currentUser = user; });

window._fbReady = true;
console.log('Firebase 초기화 완료');
