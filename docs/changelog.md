# SmartChurch 개발 변경 이력

> 최종 업데이트: 2026-07-17

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
