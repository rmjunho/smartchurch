# CLAUDE.md

이 파일은 이 저장소에서 작업하는 Claude Code(및 유사 에이전트)를 위한 안내서입니다.

## 프로젝트 개요

**SmartChurch(스마트처치)** 는 한국어 교회 커뮤니티 앱입니다. 묵상/QT, 챌린지, 채팅, 교회 관리, 마이페이지 기능을 제공합니다.

- **구조**: 빌드 없는 SPA. 진입점은 [index.html](index.html)(약 9,800줄 — 화면 마크업 + 앱 코어)이고, 기능별 로직은 `js/*.js`, 스타일은 [css/style.css](css/style.css)로 분리돼 있습니다. `js/*.js`는 일반 `<script>`라 **모두 하나의 전역 스코프를 공유**합니다(import/export 없음 → 함수명 충돌 주의).
- **프레임워크 없음**: 순수 바닐라 JS. 빌드 단계·번들러·npm·`package.json`이 없습니다. 파일을 브라우저에서 바로 엽니다.
- **백엔드**: Firebase (Auth + Firestore). 서버 코드 없음, 클라이언트 전용.
- **배포**: GitHub Pages. 커스텀 도메인은 [CNAME](CNAME) 파일의 `smartchurch.kro.kr`. `main` 브랜치에 푸시하면 배포됩니다.
- **언어**: UI·주석·문자열 모두 한국어. 이 관례를 유지하세요.

## 편집 시 핵심 주의사항

- **기능에 맞는 기존 파일에 수정을 넣으세요** (아래 파일 지도 참고). 새 파일·새 모듈은 만들지 마세요.
- 정밀한 `Edit`(고유한 문자열 매칭)을 사용하고, 대용량 파일이니 전체를 다시 읽지 말고 필요한 구간만 읽으세요.
- CSS는 [css/style.css](css/style.css)에 있습니다. 색상은 `:root` CSS 변수(`--gold`, `--cream`, `--dark`, `--danger`, `--success` 등)를 씁니다.
- 화면 출력에 사용자 입력을 넣을 때는 반드시 `escHtml()`로 이스케이프하세요(렌더링이 문자열 HTML → `innerHTML` 방식이라 XSS에 노출됩니다).
- `onclick="..."` 문자열로 이벤트를 연결하므로 핸들러는 **전역 함수**여야 합니다.

## 파일 지도

| 파일 | 담당 |
|---|---|
| [index.html](index.html) | 화면 마크업 전체, 앱 코어(묵상/바인더, 채팅, 친구, 프로필, 화면 전환) |
| [js/firebase-config.js](js/firebase-config.js) | Firebase 연결 + `window._fb` DB 접근 창구 |
| [js/church.js](js/church.js) | 교회·기관 탭, 교인 관리, 행사, 게시판 |
| [js/challenge.js](js/challenge.js) | 챌린지, 만보기(진입 카드 주석 처리로 비노출) |
| [js/matching.js](js/matching.js) | 취미 모임·기도·멘토링·이성 매칭 |
| [js/admin.js](js/admin.js) | 앱 관리자 패널 |
| [js/feed.js](js/feed.js) | 피드 |
| [css/style.css](css/style.css) | 전체 스타일 |

## 코드 구성

1. **Firebase 계층** ([js/firebase-config.js](js/firebase-config.js), `<script type="module">`)
   - Firebase SDK를 gstatic ESM(`firebasejs/12.15.0`)에서 import 합니다.
   - `firebaseConfig`가 **인라인 하드코딩**되어 있습니다 (projectId: `smartchurch-868e3`).
   - 모듈 스코프 밖에서 쓰기 위해 `window._fb` 파사드 객체에 모든 Firestore/Auth 호출을 노출합니다. 준비 완료 플래그는 `window._fbReady`, 오류 표시는 `window._fbErr(위치, e)`.
   - **새 Firestore 접근이 필요하면 먼저 `window._fb`에 메서드를 추가**하고 앱 코드에서 호출하세요. 앱 코드는 일반 `<script>`라 Firebase 모듈을 직접 import 할 수 없습니다.

2. **HTML 화면 마크업** ([index.html](index.html) 앞부분)
   - 화면(screen): `screen-splash`, `screen-login`, `screen-pending`, `screen-register`, `screen-onboard`, `screen-main`.
   - `go('login'|'main'|'onboard'|'pending')` 로 화면 전환.

3. **앱 로직** ([index.html](index.html) 뒷부분 + `js/*.js`)
   - 로그인 후 `bootApp()` → 메인 화면.
   - 하단 탭 5개: `switchTab(tab, label, el)` 로 전환.
     - `worship`(묵상/예배), `challenge`(챌린지), `chat`(채팅), `church`(교회), `mypage`(마이페이지).
   - 탭 진입 시 지연 초기화: `initChatTab()`, `initChurchTab()`, `syncChallengesFromFirestore()`. 탭을 벗어나면 `onSnapshot` 구독을 해제합니다 (`_ocUnsubscribe`, `_roomUnsubscribe`, `_roomsUnsubscribe`, `stopMeetingsListener()`).

## 데이터 모델 (Firestore 컬렉션)

- `users` — 사용자 프로필. `me` 전역 객체가 현재 사용자. 주요 필드: `churchCode`, `churchStatus`(가입 승인 상태), `orgType`(`church` | `personal`), `friendCode`, `profilePublic`.
- `challenges` — 챌린지. `createdByChurch`, `isPublic` 로 조회.
- `chatRooms` + 하위 `messages` 서브컬렉션 — 오픈채팅·DM·그룹. `members`(array-contains 조회), `lastMessageAt`, `lastReadAt.{uid}`(읽음 처리).
- `meetings` — 교회 모임/일정. `churchCode`, `date`.
- `boardPosts` — 게시판.
- `matchProfiles`, `matchRequests` — 매칭 기능.
- `binderEntries` — 묵상 바인더 공유(리더 열람용).
- `churchInfo` — 교회 상세(위치·소개·목사 프로필). 문서 ID = 교회 코드.
- `userPhones` — 전화번호. 문서 ID = uid, 필드 `{ phone, guardianPhone }`(`guardianPhone` = 미성년자 보호자 번호). **`users` 에 `phone`·`guardianContact` 같은 번호를 넣지 마세요** — `users` 는 로그인한 모든 교인이 읽을 수 있어 규칙상 번호가 새어나갑니다. 공유 로컬 캐시(`DB.get('users')`)에도 저장 금지(같은 기기의 다른 계정에 병합돼 노출됨). 읽기는 본인·같은 교회 리더·앱 관리자만 (`isLeader()` 가드 + 서버 규칙 이중 차단). 보호자 *이름*(`guardianName`)은 `users` 에 그대로 있습니다.

## 자주 쓰는 헬퍼 (앱 스크립트)

- `toast(...)` — 토스트 알림, `loading(...)` / `showLoadingOverlay()` — 로딩 표시.
- `go(screen)` — 화면 전환, `switchTab(...)` — 탭 전환.
- `uid()` — 현재 사용자 UID, `me` — 현재 사용자 객체.
- 묵상 바인더는 날짜 기반 키(`dateKey`, `binderKey`)와 그리기 캔버스(손글씨) 로직이 큰 비중을 차지합니다.

## 배포·검증

- **빌드/테스트 명령 없음.** 검증은 `index.html`을 브라우저에서 직접 열어 확인합니다.
- `<head>` 상단에 전역 JS 에러를 화면에 띄우는 `_err_overlay` 오버레이가 있어 런타임 오류를 눈으로 확인할 수 있습니다.
- 배포: 변경을 커밋하고 `main`에 푸시 → GitHub Pages 자동 반영.
- **자동 배포(사용자 상시 승인)**: 코드 변경을 마치면 매번 물어보지 말고 바로 `git add -A` → 커밋 → `git push origin main` 까지 실행하세요. 커밋 메시지는 한국어로, 증상이 아니라 원인을 적습니다.
  - 단, 다음은 자동 푸시 금지: 파싱/로드 확인이 안 된 변경, 작업이 중간 상태인 경우, 사용자가 "일단 보류/확인만" 이라고 한 경우.

## 보안 메모

- Firebase 웹 API 키(`apiKey`)는 클라이언트에 노출되는 게 정상이지만, 실제 접근 제어는 **Firestore 보안 규칙**에 의존합니다. 데이터 모델을 바꿀 때 보안 규칙 정합성을 함께 고려하세요. 규칙 원본은 [firestore.rules](firestore.rules) 에 있고, **배포는 Firebase 콘솔에 붙여넣는 수동 작업**입니다 — 이 파일을 고쳐도 콘솔에 반영하지 않으면 서버는 옛 규칙으로 동작합니다.
