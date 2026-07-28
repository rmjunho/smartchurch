# SmartChurch 개발 변경 이력

> 최종 업데이트: 2026-07-28

---

## 0. PWA 전환 (Android TWA 빌드 선행 단계)
**날짜:** 2026-07-28

### 변경 파일
- `manifest.json` — **신규**. 정적 웹 앱 매니페스트
- `sw.js` — **신규**. 서비스워커 (network-first)
- `.nojekyll` — **신규**. GitHub Pages 의 Jekyll 처리 비활성화
- `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-512-maskable.png` — **신규**(외부 제작)
- `index.html` — `<head>` 메타 정리, `setupPWA()` 재작성, 안내 배너 로직 추가
- `css/style.css` — `.bottom-nav` safe-area 대응, `.pwa-tip` 배너 스타일

### 상세 내용

#### 정적 매니페스트로 전환 (중요)
- 기존에는 `setupPWA()` 가 캔버스로 아이콘을 그려 **`blob:` URL 매니페스트를 런타임 주입**했음
- `blob:` 매니페스트는 **TWA(Play Store)에서 사용 불가** — 고정 URL + Digital Asset Links 검증이 필요
- 주입 코드를 제거하고 `<head>` 의 `<link rel="manifest" href="/manifest.json">` 로 대체
- `_appIconUrl`(시스템 알림 아이콘)은 유지하되 `icons/icon-192.png` 를 가리키도록 변경

#### 색상 통일 — `#0D0D0D`
- `background_color` / `theme_color` 모두 `#0D0D0D` (`--black`)
- 근거: `#screen-splash`, `.topbar`, `.bottom-nav` 가 모두 `var(--black)` 사용
- 기존 `theme-color: #C9A96E`(골드)는 실제 UI 와 불일치해 상태바에 경계선이 생겼음
- `apple-mobile-web-app-status-bar-style` 은 `black-translucent` 유지 (검은 헤더에 흰 글자가 맞음)

#### 서비스워커 정책
- **HTML/CSS/JS 는 network-first** — `git push` 만으로 즉시 반영되어야 하므로 cache-first 금지
- 네트워크 실패 시에만 캐시 폴백, 페이지 이동이면 `/index.html` 반환
- **fetch 를 가로채지 않는 대상**: 외부 origin 전체, GET 이외 메서드
  (가로채면 Firebase 로그인과 `onSnapshot` 실시간 채팅이 깨짐)
- `CACHE_NAME = 'smartchurch-v1'`, `activate` 에서 이전 캐시 전부 삭제, `skipWaiting` + `clients.claim`

#### 아이콘
- maskable 안전영역은 정사각형이 아니라 **지름 80% 의 원** — 로고는 296×307 로 배치
  (410×410 정사각으로 채우면 원형 마스크에서 모서리가 잘림. 한계값 410÷√2 ≈ 290)
- 배경은 `#0D0D0D` 단색으로 여백까지 채움

#### safe-area 대응
- `viewport` 에 `viewport-fit=cover` 추가
- `.bottom-nav`: `height: calc(72px + env(safe-area-inset-bottom, 0px))` + 동일 값 `padding-bottom`
  (`box-sizing:border-box` 라 height 를 함께 키우지 않으면 아이콘이 눌림)
- `.tab-panel`: `bottom` 도 같은 `calc()` 로 맞춰 콘텐츠가 내비에 가리지 않게 함

#### 안내 배너 (`.pwa-tip`)
- **iOS + 非standalone**: "공유 → 홈 화면에 추가" 안내
- **카카오톡 인앱브라우저**(UA 에 `KAKAOTALK`): "다른 브라우저로 열기" 안내
- 닫으면 `localStorage.pwaTipClosed_{ios|kakao}` 에 기록해 재노출 안 함
- 색상은 기존 CSS 변수(`--dark`, `--gold`, `--white`)만 사용

---

## 1. 바인더 공유 + 리더 뷰 강화
**커밋:** `12c2887` — `feat: binder sharing + leader view (all formats, accordion, calendar)`

### 변경 파일
- `index.html` — 캘린더 스트립 HTML, 커뮤니티 바인더 컨테이너, 공유 모드 JS
- `css/style.css` — 캘린더 스트립·아코디언·커뮤니티 바인더 스타일 (~97줄)
- `js/church.js` — 리더 교인 바인더 뷰 전면 리팩토링
- `js/firebase-config.js` — `getBinderEntriesByDate()` 쿼리 추가

### 상세 내용

#### 캘린더 스트립 (주간 뷰)
- 기존 ←/→ 날짜 이동 버튼을 **7일 주간 캘린더 스트립**으로 교체
- 좌우 화살표(‹/›)로 주 단위 이동, 날짜 클릭으로 바로 이동
- 오늘·선택일·일요일·미래 날짜 시각적 구분
- **예배(묵상) 탭**과 **리더 교인 바인더 뷰** 모두에 적용

#### 아코디언 UI
- 각 바인더 섹션(말씀 묵상, QT, 할 일, 시간표, 일기)에 **접기/펴기 chevron** 적용
- CSS 기반: `.acc-hd.open + .acc-body { display: block }` 패턴
- 커뮤니티 바인더와 리더 뷰 모두에서 사용

#### 커뮤니티 바인더 (리더용 "나눔" 모드)
- 리더에게 "📤 나눔" 모드 버튼 표시 (`showShareModeIfLeader()`)
- Firestore에서 날짜별 공유 바인더 조회 → 교회 코드로 필터
- 사용자별 아코디언 카드로 그룹핑
- 텍스트 + 손글씨(캔버스 드로잉) 모두 표시

#### 드로잉 Firestore 동기화
- `saveBinderNow()`에 `drawings` 필드 추가 (qt, schedule, diary)
- `hasDrawings` 플래그로 드로잉 유무 표시
- `churchCode` 필드 추가로 교회별 필터 지원

#### 리더 교인 바인더 뷰 (church.js)
- `renderMemberBinderScreen()` — 캘린더 스트립 적용
- `_loadMemberBinder()` — 아코디언 UI + 드로잉 이미지 표시
- `renderMbCalStrip()`, `shiftMbCalStrip()`, `goToMbDate()` 추가

---

## 2. TODO 시스템 강화
**커밋:** `6b43e7b` — `feat: TODO persistence toggle + category reorder + alignment setting`

### 변경 파일
- `index.html` — 설정 모달 UI + JS 로직
- `css/style.css` — 토글·정렬 버튼·순서 변경 버튼 스타일 (~36줄)

### 상세 내용

#### [1] 할 일 지속 활성화 ("완료 항목 이월")
- **설정 토글**: Todo List 설정 모달에 "할 일 지속 활성화" 스위치 추가
- **OFF (기본값)**: 미완료 할 일만 다음 날로 이월 (기존 동작)
- **ON**: 완료된 할 일도 완료 상태 그대로 이월
- 텍스트형 TODO (`carryOverTodosIfNeeded`)와 드로잉형 TODO (`carryOverDrawTodosIfNeeded`) 모두 적용
- `getTodoKeepDone()` / `setTodoKeepDone()` — localStorage + Firestore `updateUser` 동기화

#### [2] 카테고리 순서 변경
- 설정 모달 카테고리 목록에 **↑/↓ 버튼** 추가
- `moveCategoryUp(idx)` / `moveCategoryDown(idx)` — 인접 카테고리 교환
- 순서 변경 시 텍스트 TODO와 드로잉 TODO 모두 즉시 리렌더링
- 카테고리 순서는 `todoCats_{userId}` 키로 localStorage 저장

#### [3] 카테고리 제목 정렬 설정
- **기본값: 오른쪽 정렬** (`.todo-category-title { text-align: right }`)
- 설정 모달에 "오른쪽" / "왼쪽" 토글 버튼 추가
- `getTodoCatAlign()` / `setTodoCatAlign()` — localStorage + Firestore 동기화
- 텍스트형 `renderTodos()`와 드로잉형 `renderDrawTodoSection()` 모두에 적용
- 드로잉형은 카테고리별 그룹 헤더 추가 (기존에는 카드별 태그만 표시)

---

## 3. 챌린지 시스템 대폭 개편
**커밋:** `c921efa` — `feat: personal challenges + all users create + direct edit from tab`

### 변경 파일
- `index.html` — 공개 범위 UI 변경, 변수/함수 업데이트
- `js/challenge.js` — 데이터 레이어·렌더링·권한 전면 수정
- `js/firebase-config.js` — `getPersonalChallenges(uid)` 쿼리 추가

### 상세 내용

#### [1] 개인 챌린지 추가
- 새 필드: `scope` (`'personal'` | `'church'` | `'public'`) + `createdByUid` (사용자 UID)
- **개인 챌린지**: 만든 사람만 볼 수 있음, Firestore에 `scope: 'personal'`로 저장
- `personalChallenges()` 필터 함수 추가
- `syncChallengesFromFirestore()` — 개인 챌린지도 동기화 (`getPersonalChallenges`)
- `fullCatalog()` — 개인 + 교회 + 공개 챌린지 통합
- 챌린지 관리 서브스크린: **3개 탭** (개인 / 교회 / 공개)

#### [2] 모든 사용자 챌린지 생성 가능
- `openCreateChallengeModal()`, `submitCreateChallenge()` — `isLeader()` / `hasLeaderPerm('challenge')` 제한 **제거**
- `renderLeaderBar()` — 모든 인증 사용자에게 "+ 챌린지 만들기" 버튼 표시
- 생성 모달 공개 범위: 기존 2개(🔒 교회 / 🌐 공개) → **3개**(🔐 개인 / 🔒 교회 / 🌐 공개)
- 교회 챌린지 생성 시 교회 소속 여부 검증 유지

#### [3] 챌린지 탭에서 직접 수정
- **"모든 챌린지" 목록**: 내가 만든 챌린지에 ✏️ 수정 버튼 표시
- **"진행 중인 챌린지"**: 내가 만든 템플릿 기반이면 ✏️ 수정 버튼 표시
- 소유권 판단: `createdByUid === me.id` (기존: 교회 리더 여부)
- `openEditChallengeModal()`, `submitEditChallenge()` — 소유권 체크를 UID 기반으로 변경
- `deleteChallenge()` — 생성자(UID) 또는 교회 리더 또는 앱 관리자만 삭제 가능

---

## 이전 커밋 요약

| 커밋 | 내용 |
|------|------|
| `5691287` | 기관 유형 시스템 + 동적 직분/역할 + 리더 임명 Firestore 동기화 |
| `8a854c4` | 바인더 제목 '말씀 묵상' 통일 + 회원가입 폼 스크롤 수정 |
| `b9ce4a7` | 관리자 패널 — 현재 접속자 + 교회 목록 수정 |
| `67ddda4` | 관리자 패널 5건 버그 수정 + 전체 앱 감사 |
| `e689a16` | 바인더 첫 항목 제목 변경 |
| `4fdd8ea` | JS 모듈 분리 (feed, challenge, church, matching, admin) |
| `b3c019e` | firebase-config.js + auth.js 분리 |
