# CLAUDE.md

이 파일은 이 저장소에서 작업하는 Claude Code(및 유사 에이전트)를 위한 안내서입니다.

## 프로젝트 개요

**SmartChurch(스마트처치)** 는 한국어 교회 커뮤니티 앱입니다. 묵상/QT, 챌린지, 채팅, 교회 관리, 마이페이지 기능을 제공합니다.

- **구조**: 단일 파일 SPA. 모든 HTML·CSS·JS가 [index.html](index.html) 하나에 들어 있습니다 (약 14,900줄, ~1.3MB).
- **프레임워크 없음**: 순수 바닐라 JS. 빌드 단계·번들러·npm·`package.json`이 없습니다. 파일을 브라우저에서 바로 엽니다.
- **백엔드**: Firebase (Auth + Firestore). 서버 코드 없음, 클라이언트 전용.
- **배포**: GitHub Pages. 커스텀 도메인은 [CNAME](CNAME) 파일의 `smartchurch.kro.kr`. `main` 브랜치에 푸시하면 배포됩니다.
- **언어**: UI·주석·문자열 모두 한국어. 이 관례를 유지하세요.

## 편집 시 핵심 주의사항

- **단일 파일이므로 변경은 항상 [index.html](index.html)에 합니다.** 정밀한 `Edit`(고유한 문자열 매칭)을 사용하고, 대용량 파일이니 전체를 다시 읽지 말고 필요한 구간만 읽으세요.
- 새 파일을 만들거나 모듈로 쪼개지 마세요. 의도적으로 단일 HTML 구조입니다.
- CSS는 `<style>` 블록(약 라인 158–2956) 안에 있습니다. 색상은 `:root` CSS 변수(`--gold`, `--cream`, `--dark`, `--danger`, `--success` 등)를 씁니다.

## index.html 내부 구조

파일은 3개의 `<script>` 영역으로 나뉩니다.

1. **Firebase ESM 모듈** (라인 18–157, `<script type="module">")
   - Firebase SDK를 gstatic ESM(`firebasejs/12.15.0`)에서 import 합니다.
   - `firebaseConfig`가 **인라인 하드코딩**되어 있습니다 (projectId: `smartchurch-868e3`).
   - 모듈 스코프 밖에서 쓰기 위해 `window._fb` 파사드 객체에 모든 Firestore/Auth 호출을 노출합니다. 준비 완료 플래그는 `window._fbReady`.
   - **새 Firestore 접근이 필요하면 여기 `window._fb`에 메서드를 추가**하고, 아래 앱 스크립트에서 호출하세요. 앱 스크립트는 일반 `<script>`라 Firebase 모듈을 직접 import 할 수 없습니다.

2. **HTML 화면 마크업** (`<style>` 종료 이후 ~5376)
   - 화면(screen): `screen-splash`, `screen-login`, `screen-pending`, `screen-register`, `screen-onboard`, `screen-main`.
   - `go('login'|'main'|'onboard'|'pending')` 로 화면 전환.

3. **앱 로직** (라인 5376–14899, 일반 `<script>`)
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

## 자주 쓰는 헬퍼 (앱 스크립트)

- `toast(...)` — 토스트 알림, `loading(...)` / `showLoadingOverlay()` — 로딩 표시.
- `go(screen)` — 화면 전환, `switchTab(...)` — 탭 전환.
- `uid()` — 현재 사용자 UID, `me` — 현재 사용자 객체.
- 묵상 바인더는 날짜 기반 키(`dateKey`, `binderKey`)와 그리기 캔버스(손글씨) 로직이 큰 비중을 차지합니다.

## 배포·검증

- **빌드/테스트 명령 없음.** 검증은 `index.html`을 브라우저에서 직접 열어 확인합니다.
- `<head>` 상단에 전역 JS 에러를 화면에 띄우는 `_err_overlay` 오버레이가 있어 런타임 오류를 눈으로 확인할 수 있습니다.
- 배포: 변경을 커밋하고 `main`에 푸시 → GitHub Pages 자동 반영. 사용자가 명시적으로 요청할 때만 커밋/푸시하세요.

## 보안 메모

- Firebase 웹 API 키(`apiKey`)는 클라이언트에 노출되는 게 정상이지만, 실제 접근 제어는 **Firestore 보안 규칙**에 의존합니다. 데이터 모델을 바꿀 때 보안 규칙 정합성을 함께 고려하세요(규칙은 이 저장소가 아닌 Firebase 콘솔에서 관리).
