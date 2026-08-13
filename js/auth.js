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
  // 세션 복원의 원본. SDK 가 저장소에서 로그인 상태를 복원한 뒤 반드시 한 번은 부른다
  // (이력이 없으면 null 로). 앱 부팅은 localStorage 가 아니라 이 신호를 기다린다.
  onAuth:     (cb)        => onAuthStateChanged(fbAuth, cb),
});

// 로그인 상태 → window.currentUser 노출
onAuthStateChanged(fbAuth, (user) => { window.currentUser = user; });

window._fbReady = true;
// 부팅보다 늦게 준비됐을 때(느린 회선) 앱이 건너뛴 실시간 초기화를 다시 걸도록 알림
window.dispatchEvent(new Event('fb-ready'));
console.log('Firebase 초기화 완료');
