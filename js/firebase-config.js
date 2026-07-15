// Firebase 설정 + 초기화 + Firestore 파사드 (ESM 모듈)
// auth 부분은 js/auth.js 로 분리됨 (이 파일 다음에 로드)
import { initializeApp }                              from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc,
         updateDoc, deleteDoc, collection, collectionGroup, getDocs,
         addDoc, query, where, orderBy, limit,
         arrayUnion, onSnapshot, serverTimestamp }              from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBSjbD1j0mQBw6KFFgetTwk-iDHXkkBX0A",
  authDomain:        "smartchurch-868e3.firebaseapp.com",
  projectId:         "smartchurch-868e3",
  storageBucket:     "smartchurch-868e3.firebasestorage.app",
  messagingSenderId: "826976279573",
  appId:             "1:826976279573:web:49c222868c44f82071821c"
};

const fbApp  = initializeApp(firebaseConfig);
const fbDb   = getFirestore(fbApp);

// 전역 노출
window.fbApp = fbApp;   // auth.js 에서 getAuth 에 사용
window._fbDb = fbDb;
window.db    = fbDb;    // 요청된 별칭
window._fb = {
      setUser:    (uid, data) => setDoc(doc(fbDb, 'users', uid), data, { merge: true }),
      getUser:    (uid)       => getDoc(doc(fbDb, 'users', uid)),
      updateUser: (uid, data) => updateDoc(doc(fbDb, 'users', uid), data),
      deleteUserDoc: (uid)    => deleteDoc(doc(fbDb, 'users', uid)),   // 관리자: 계정 실제 삭제
      // 교회 교인 목록 실시간
      watchChurch: (churchCode, cb) =>
        onSnapshot(query(collection(fbDb, 'users'), where('churchCode','==',churchCode)), cb),
      // 전체 사용자 (관리자용)
      getAllUsers: () => getDocs(collection(fbDb, 'users')),
      // 교회별 사용자
      getUsersByChurch: (churchCode) =>
        getDocs(query(collection(fbDb, 'users'), where('churchCode','==',churchCode))),
      // 챌린지 저장/삭제
      setChallenge:    (id, data) => setDoc(doc(fbDb, 'challenges', id), data, { merge: true }),
      deleteChallenge: (id)       => deleteDoc(doc(fbDb, 'challenges', id)),
      // 교회별 챌린지 (공개+비공개)
      getChallengesByChurch: (churchCode) =>
        getDocs(query(collection(fbDb, 'challenges'), where('createdByChurch','==',churchCode))),
      // 모든 공개 챌린지
      getPublicChallenges: () =>
        getDocs(query(collection(fbDb, 'challenges'), where('isPublic','==',true))),
      // 바인더 공유 (리더 열람용)
      setBinderEntry:  (key, data) => setDoc(doc(fbDb, 'binderEntries', key), data, { merge: true }),
      getBinderEntry:  (key)       => getDoc(doc(fbDb, 'binderEntries', key)),
      // 교회 상세 정보 (위치, 소개, 목사 프로필)
      setChurchInfo:   (code, data) => setDoc(doc(fbDb, 'churchInfo', code), data, { merge: true }),
      getChurchInfo:   (code)       => getDoc(doc(fbDb, 'churchInfo', code)),
      getAllChurchInfo: ()          => getDocs(collection(fbDb, 'churchInfo')),   // 관리자: 전체 교회 목록
      deleteChurchInfo: (code)      => deleteDoc(doc(fbDb, 'churchInfo', code)),
      // 오픈채팅 실시간 메시지
      sendChatMsg: (roomId, msg) =>
        addDoc(collection(fbDb, 'chatRooms', roomId, 'messages'),
          { ...msg, createdAt: serverTimestamp() }),
      listenChatMsgs: (roomId, n, cb) =>
        onSnapshot(
          query(collection(fbDb, 'chatRooms', roomId, 'messages'),
            orderBy('createdAt', 'asc'), limit(n)), cb),
      ensureChatRoom: (roomId, data) =>
        setDoc(doc(fbDb, 'chatRooms', roomId), data, { merge: true }),
      // DM/그룹 채팅방 목록 (내가 멤버인 방)
      listenMyRooms: (uid, cb) =>
        onSnapshot(
          query(collection(fbDb, 'chatRooms'),
            where('members', 'array-contains', uid),
            orderBy('lastMessageAt', 'desc'), limit(50)), cb),
      updateChatRoom: (roomId, data) =>
        updateDoc(doc(fbDb, 'chatRooms', roomId), data),
      // 채팅방 읽음 처리 (lastReadAt.userId 업데이트)
      markRoomRead: (roomId, userId) => {
        const update = {};
        update[`lastReadAt.${userId}`] = new Date().toISOString();
        return updateDoc(doc(fbDb, 'chatRooms', roomId), update);
      },
      // 친구 코드로 사용자 검색
      getUserByFriendCode: (code) =>
        getDocs(query(collection(fbDb, 'users'), where('friendCode', '==', code))),
      // 전체 공개 프로필 검색 (이름)
      searchPublicUsers: (name) =>
        getDocs(query(collection(fbDb, 'users'),
          where('profilePublic', '==', true),
          where('name', '>=', name),
          where('name', '<=', name + '\uf8ff'), limit(20))),
      // 회의 저장/삭제/조회
      setMeeting:          (id, data)       => setDoc(doc(fbDb, 'meetings', id), data, { merge: true }),
      deleteMeeting:       (id)             => deleteDoc(doc(fbDb, 'meetings', id)),
      listenMeetings:      (churchCode, cb) => {
        try {
          return onSnapshot(query(collection(fbDb, 'meetings'),
            where('churchCode', '==', churchCode),
            orderBy('date', 'asc')), cb);
        } catch(e) {
          // orderBy 인덱스 없을 때 fallback (정렬 없이)
          return onSnapshot(query(collection(fbDb, 'meetings'),
            where('churchCode', '==', churchCode)), cb);
        }
      },
      getMeetingByCode:    (code)           =>
        getDocs(query(collection(fbDb, 'meetings'), where('code', '==', code))),
      // ── 게시판 ──
      getBoardPosts: (type) => getDocs(query(
        collection(fbDb, 'boardPosts'),
        where('type', '==', type), orderBy('createdAt', 'desc'), limit(50))),
      setBoardPost:    (id, data) => setDoc(doc(fbDb, 'boardPosts', id), data),
      updateBoardPost: (id, data) => updateDoc(doc(fbDb, 'boardPosts', id), data),
      deleteBoardPost: (id)       => deleteDoc(doc(fbDb, 'boardPosts', id)),
      // ── 게시판 댓글 (서브컬렉션: boardPosts/{postId}/comments/{commentId}) ──
      setBoardComment:    (postId, commentId, data) => setDoc(doc(fbDb, 'boardPosts', postId, 'comments', commentId), data),
      updateBoardComment: (postId, commentId, data) => updateDoc(doc(fbDb, 'boardPosts', postId, 'comments', commentId), data),
      deleteBoardComment: (postId, commentId)       => deleteDoc(doc(fbDb, 'boardPosts', postId, 'comments', commentId)),
      listenBoardComments:(postId, cb) => onSnapshot(query(
        collection(fbDb, 'boardPosts', postId, 'comments'), orderBy('createdAt', 'asc')), cb),
      // 사용자 문서 실시간 감지 (승인/거절 대기용)
      listenUser: (uid, cb) => onSnapshot(doc(fbDb, 'users', uid), cb),
      // 초대 코드 (Firestore - 기기 간 공유)
      setInviteCode: (code, data) => setDoc(doc(fbDb, 'inviteCodes', code), data),
      getInviteCode: (code)       => getDoc(doc(fbDb, 'inviteCodes', code)),
      deleteInviteCode: (code)    => deleteDoc(doc(fbDb, 'inviteCodes', code)),
      useInviteCode: (code, userId) => updateDoc(doc(fbDb, 'inviteCodes', code),
        { usedBy: arrayUnion(userId) }),
      // ── 매칭 (취미/기도/멘토 — 교회 단위 공유) ──
      setMatchProfileDoc:       (id, data)    => setDoc(doc(fbDb, 'matchProfiles', id), data, { merge: true }),
      deleteMatchProfileDoc:    (id)          => deleteDoc(doc(fbDb, 'matchProfiles', id)),
      getMatchProfilesByChurch: (churchCode)  =>
        getDocs(query(collection(fbDb, 'matchProfiles'), where('churchCode', '==', churchCode))),
      setMatchRequestDoc:       (id, data)    => setDoc(doc(fbDb, 'matchRequests', id), data, { merge: true }),
      deleteMatchRequestDoc:    (id)          => deleteDoc(doc(fbDb, 'matchRequests', id)),
      getMatchRequestsByChurch: (churchCode)  =>
        getDocs(query(collection(fbDb, 'matchRequests'), where('churchCode', '==', churchCode))),
      // ── 행사/티켓팅 (교회 단위 공유) ──
      setEventDoc:       (id, data)   => setDoc(doc(fbDb, 'events', id), data, { merge: true }),
      deleteEventDoc:    (id)         => deleteDoc(doc(fbDb, 'events', id)),
      getEventsByChurch: (churchCode) =>
        getDocs(query(collection(fbDb, 'events'), where('churchCode', '==', churchCode))),
      // ── 행사 예약(티켓) — churchData/{churchCode}/events/{eventId}/reservations/{uid} ──
      setReservation:    (churchCode, eventId, uid, data) =>
        setDoc(doc(fbDb, 'churchData', churchCode, 'events', eventId, 'reservations', uid), data),
      deleteReservation: (churchCode, eventId, uid) =>
        deleteDoc(doc(fbDb, 'churchData', churchCode, 'events', eventId, 'reservations', uid)),
      getEventReservations: (churchCode, eventId) =>
        getDocs(collection(fbDb, 'churchData', churchCode, 'events', eventId, 'reservations')),
      getMyReservations: (uid) =>
        getDocs(query(collectionGroup(fbDb, 'reservations'), where('uid', '==', uid))),
};
