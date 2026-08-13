// ===== moved from index.html (feature: challenge) — 전역(window) 공유 스코프 =====
function syncTodoLinkedChallenge(todo) {
  if (!todo || !todo.linkedChallengeUid) return;
  if (dateKey() !== todayDateKey()) return;      // 오늘 할 일에만 적용
  const list = myChallenges();
  const c = list.find(x => x.uid === todo.linkedChallengeUid);
  if (!c) return;
  const today = todayDateKey();
  if (c.endDate && c.endDate < today) return;    // 종료된 챌린지는 건드리지 않음
  if (!c.checkedDates) c.checkedDates = [];
  const has = c.checkedDates.includes(today);
  if (todo.done && !has)       c.checkedDates.push(today);
  else if (!todo.done && has)  c.checkedDates = c.checkedDates.filter(d => d !== today);
  else return;                                   // 상태 변화 없음
  const freqType = c.freqType || (c.type === 'weekly' ? 'weekly' : 'daily');
  c.lastCheckedDate = c.checkedDates[c.checkedDates.length - 1] || '';
  c.streak  = calculateStreak(c.checkedDates);
  c.current = getCurrentPeriodCount(c.checkedDates, freqType);
  saveMyChallenges(list);
  renderChallenge();
  _refreshSubscreenIfCurrent(['my-challenges']);
  if (todo.done) toast(`"${c.label}" 챌린지 자동 체크!`);
}

var _flagTargetIsDraw = false;   // true면 드로잉 할 일 카드, false면 텍스트 할 일
function openChallengePicker(todoId, isDraw) {
  _flagTargetTodoId = todoId;
  _flagTargetIsDraw = !!isDraw;
  const myChals = myChallenges();
  const t = _flagTargetIsDraw
    ? getDrawTodoCards().find(x => x.id === todoId)
    : getDayTodos().find(x => x.id === todoId);
  const currentLinked = t?.linkedChallengeUid || null;

  const list = document.getElementById('challenge-picker-list');
  if (!list) return;

  if (!myChals.length) {
    list.innerHTML = `<div class="todo-empty" style="padding:24px">진행 중인 챌린지가 없어요.<br>챌린지 탭에서 먼저 시작해보세요! </div>`;
  } else {
    const freqLabels = { daily:'매일', weekly:'주간', monthly:'월간', yearly:'연간' };
    list.innerHTML = [
      // 이미 연동된 경우: 챌린지로 이동 + 연동 해제 옵션
      currentLinked ? `
        <div class="ch-picker-item" onclick="closeChallengePicker();goToLinkedChallenge('${currentLinked}')"
             style="background:rgba(201,169,110,0.1)">
          <span style="font-size:18px">➡️</span>
          <div>
            <div class="ch-picker-label">연동된 챌린지로 이동</div>
            <div class="ch-picker-sub">챌린지 탭에서 확인해요</div>
          </div>
        </div>
        <div class="ch-picker-item" onclick="linkFlagTarget(null)"
             style="background:#FFF0F0">
          <span style="font-size:18px">🔗</span>
          <div>
            <div class="ch-picker-label" style="color:#C0392B">연동 해제</div>
            <div class="ch-picker-sub">현재 연동된 챌린지를 분리해요</div>
          </div>
        </div>` : '',
      // 챌린지 목록
      ...myChals.map(c => {
        const isLinked = c.uid === currentLinked;
        const freqType = c.freqType || 'daily';
        const count    = getCurrentPeriodCount(c.checkedDates||[], freqType);
        const freq     = c.freqTarget || c.target;
        const progressTxt = freq
          ? `${freqLabels[freqType]||''} ${count}/${freq}회`
          : `연속 ${calculateStreak(c.checkedDates||[])}일`;
        return `
          <div class="ch-picker-item${isLinked?' ':''}"
               style="${isLinked?'background:rgba(201,169,110,0.12)':''}"
               onclick="linkFlagTarget('${c.uid}')">
            <span style="font-size:20px">🚩</span>
            <div style="flex:1;min-width:0">
              <div class="ch-picker-label">${escHtml(c.label)}</div>
              <div class="ch-picker-sub">${escHtml(c.tag)} · ${progressTxt}</div>
            </div>
            ${isLinked ? '<span style="color:var(--gold);font-size:13px;font-weight:700">연동중</span>' : ''}
          </div>`;
      })
    ].join('');
  }

  document.getElementById('modal-challenge-picker').classList.add('open');
}

function closeChallengePicker(e) {
  if (!e || e.target.id === 'modal-challenge-picker') {
    document.getElementById('modal-challenge-picker').classList.remove('open');
    _flagTargetTodoId = null;
    _flagTargetIsDraw = false;
  }
}

// 피커에서 선택 시 텍스트/드로잉에 맞게 연동 처리
function linkFlagTarget(challengeUid) {
  if (_flagTargetIsDraw) linkDrawCardToChallenge(_flagTargetTodoId, challengeUid);
  else                   linkTodoToChallenge(_flagTargetTodoId, challengeUid);
}

// 드로잉 할 일 카드에 챌린지 연동
function linkDrawCardToChallenge(cardId, challengeUid) {
  const cards = getDrawTodoCards();
  const c = cards.find(x => x.id === cardId);
  if (!c) return;
  c.linkedChallengeUid = challengeUid || null;
  saveDrawTodoCards(cards);
  closeChallengePicker();
  renderDrawTodoSection();
  if (challengeUid) {
    const ch = myChallenges().find(x => x.uid === challengeUid);
    toast(`"${ch?.label||'챌린지'}"와 연동됐어요!`);
  } else {
    toast('챌린지 연동을 해제했어요');
  }
}

function linkTodoToChallenge(todoId, challengeUid) {
  const todos = getDayTodos();
  const t = todos.find(x => x.id === todoId);
  if (!t) return;
  t.linkedChallengeUid = challengeUid || null;
  saveDayTodos(todos);
  closeChallengePicker();
  renderTodos();
  if (challengeUid) {
    const c = myChallenges().find(x => x.uid === challengeUid);
    toast(`"${c?.label||'챌린지'}"와 연동됐어요!`);
  } else {
    toast('챌린지 연동을 해제했어요');
  }
}

function goToLinkedChallenge(challengeUid) {
  // 챌린지 탭으로 이동
  const navBtn = document.querySelector('.nav-btn[onclick*="challenge"]');
  if (navBtn) navBtn.click();
  // 잠시 후 해당 챌린지 카드 하이라이트
  setTimeout(() => {
    const cards = document.querySelectorAll('#ch-active .challenge-card');
    const myChals = myChallenges();
    const idx = myChals.findIndex(c => c.uid === challengeUid);
    if (idx >= 0 && cards[idx]) {
      cards[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
      cards[idx].style.outline = '2.5px solid var(--gold)';
      setTimeout(() => { if(cards[idx]) cards[idx].style.outline = ''; }, 1800);
    }
  }, 350);
  toast('연동된 챌린지로 이동했어요');
}

function checkChallengeReminder() {
  if (!notifPrefOn('Challenge')) return;
  const today = todayDateKey();
  if (DB.get('challReminderDate_' + me.id, '') === today) return; // 오늘 이미 알림함
  const pending = myChallenges().filter(c => {
    if (c.endDate && c.endDate < today) return false;            // 종료된 챌린지 제외
    return !(c.checkedDates || []).includes(today);              // 오늘 미체크
  });
  if (!pending.length) return;
  DB.set('challReminderDate_' + me.id, today);
  pushNotif({
    icon: '🔥',
    title: '오늘의 챌린지 체크',
    body: `아직 완료하지 않은 챌린지가 ${pending.length}개 있어요`,
    dedupeId: 'challRemind_' + today
  });
}

function renderMyChallenges() {
  const myList = visibleMyChallenges();   // 삭제된 원본의 참여 기록은 빼고 보여준다
  const today  = todayDateKey();

  // 진행 중 / 종료 분류
  const active  = myList.filter(c => !c.endDate || c.endDate >= today);
  const expired = myList.filter(c => c.endDate  && c.endDate  < today);

  if (!myList.length) return `
    <div class="ss-empty">
      <div class="ss-empty-icon">🏆</div>
      <div class="ss-empty-title">진행 중인 챌린지가 없어요</div>
      <div class="ss-empty-sub">챌린지 탭에서 나에게 맞는 챌린지를 시작해보세요!</div>
    </div>
    <div style="padding:0 16px">
      <button class="btn-confirm" style="width:100%"
        onclick="switchTab('challenge','챌린지',document.querySelectorAll('.nav-btn')[1]);closeSubscreen()">
        챌린지 탭으로 이동
      </button>
    </div>`;

  function buildCard(c, showLeave) {
    const freqType    = c.freqType || (c.type === 'weekly' ? 'weekly' : 'daily');
    const freq        = c.freqTarget || c.target;
    const dates       = c.checkedDates || [];
    const isDaily     = freqType === 'daily';
    const count       = getCurrentPeriodCount(dates, freqType);
    const streak      = isDaily ? calculateStreak(dates) : 0;
    const checkedToday= dates.includes(today);
    const isExpired   = c.endDate && c.endDate < today;
    const goalDone    = !isDaily && freq && count >= freq;

    // 진행률 + 오른쪽 라벨
    let prog, rightLbl;
    if (isDaily) {
      prog     = Math.min(streak / 30, 1);
      rightLbl = `연속 ${streak}일`;
    } else {
      prog     = freq ? Math.min(count / freq, 1) : 0;
      const pm = { weekly:'이번 주', monthly:'이번 달', yearly:'올해' };
      rightLbl = `${pm[freqType]||''} ${count}${freq?'/'+freq:''}회`;
    }

    // 기간 태그
    let periodTag = '';
    if (c.endDate) {
      const dLeft = Math.ceil((new Date(c.endDate+' 23:59') - new Date()) / 86400000);
      if (dLeft < 0)       periodTag = `<span style="color:#E63946;font-size:11px;font-weight:700">기간 종료</span>`;
      else if (dLeft === 0) periodTag = `<span style="color:#E63946;font-size:11px;font-weight:700">오늘 종료</span>`;
      else                 periodTag = `<span style="color:var(--muted);font-size:11px">D-${dLeft}</span>`;
    }
    if (c.startDate && c.endDate)
      periodTag += `<span style="color:var(--muted);font-size:11px;margin-left:6px">${c.startDate} ~ ${c.endDate}</span>`;

    // 체크 버튼
    let btnLabel, btnClass, disabled;
    if (isExpired)          { btnLabel = '기간 종료';  btnClass = 'done'; disabled = true; }
    else if (goalDone)      { btnLabel = '목표 달성!'; btnClass = 'done'; disabled = true; }
    else if (checkedToday)  { btnLabel = '오늘 완료!'; btnClass = 'done'; disabled = true; }
    else                    { btnLabel = '오늘 체크하기'; btnClass = '';     disabled = false; }

    return `
      <div class="challenge-card" style="flex-direction:column;align-items:stretch;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="c-tag">${escHtml(c.tag||'기타')}</span>
          <span class="c-label" style="flex:1">${escHtml(c.label||c.name||'')}</span>
          <span class="c-streak">${rightLbl}</span>
        </div>
        ${periodTag ? `<div style="margin-top:4px;display:flex;align-items:center;gap:4px">${periodTag}</div>` : ''}
        ${isExpired ? `<div style="margin-top:6px">${chResultBadge(c)}</div>` : ''}
        <div class="c-progress"><div class="c-progress-fill" style="width:${Math.round(prog*100)}%"></div></div>
        <button class="ac-check-btn ${btnClass}" ${disabled?'disabled':''}
          onclick="checkChallengeToday('${c.uid}');setTimeout(()=>openSubscreen('my-challenges'),200)">
          ${btnLabel}
        </button>
        <button class="ch-proof-btn" onclick="openChallengeProofs('${c.uid}')">📷 인증샷</button>
        ${showLeave ? `
          <button onclick="leaveChallenge('${c.uid}')"
            style="margin-top:6px;width:100%;height:30px;border-radius:8px;background:none;
                   border:1.5px solid rgba(192,57,43,0.2);color:var(--muted);
                   font-size:12px;cursor:pointer;font-family:inherit">
            챌린지 그만하기
          </button>` : ''}
      </div>`;
  }

  let html = `<div style="padding:14px 16px 32px">`;

  // 진행 중
  if (active.length) {
    html += `<div style="font-size:12px;font-weight:700;color:var(--muted);
                         letter-spacing:0.5px;margin-bottom:10px">진행 중 (${active.length}개)</div>`;
    active.forEach(c => { html += buildCard(c, true); });
  }

  // 기간 종료
  if (expired.length) {
    html += `<div style="font-size:12px;font-weight:700;color:var(--muted);
                         letter-spacing:0.5px;margin:${active.length?'20px':'0'} 0 10px">
               기간 종료 (${expired.length}개)
             </div>`;
    // '그만하기' 는 진행 중인 것에만 — 이미 끝난 챌린지는 그만둘 게 없고,
    // 누르면 결과 기록만 사라진다(지난 챌린지를 돌아볼 수 있어야 한다).
    expired.forEach(c => { html += buildCard(c, false); });
  }

  html += `<button onclick="switchTab('challenge','챌린지',document.querySelectorAll('.nav-btn')[1]);closeSubscreen()"
    style="width:100%;height:40px;border-radius:12px;border:1.5px solid var(--border);
           background:white;color:var(--dark);font-size:13px;font-weight:700;
           cursor:pointer;font-family:inherit;margin-top:8px">
    + 새 챌린지 시작하기
  </button>`;

  return html + '</div>';
}

// ================= 챌린지 인증샷 =================
// 사진은 challengeProofs 컬렉션에만 둔다. myChallenges 는 내 users 문서에 통째로 올라가는데
// (saveMyChallenges 참고) 거기에 사진을 넣으면 교인 누구나 읽을 수 있고 문서 1MB 한도도
// 금방 찬다. 문서 ID 를 {uid}_{챌린지}_{날짜} 로 두어 하루 한 장만 남는다(다시 올리면 덮어씀).
var _proofChallenge = null;   // { uid, id, label }
var _proofList = [];

// 참여 기록의 uid 는 사람마다 다르다. 같은 챌린지를 한데 모으려면 원본(templateId)이 기준이다.
function _proofChallengeId(c) { return c.templateId || c.uid; }

// 채팅 사진과 같은 이유로 1주만 둔다 — 사진이 문서에 base64 로 들어 있어 사람 수 × 날짜 수
// 만큼 쌓이면 무료 요금제 저장 용량을 갉아먹는다. 남길 사진은 눌러서 '저장' 으로 받는다.
var CH_PROOF_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function _proofExpired(p) {
  if (!p || !p.date) return false;
  const end = new Date(String(p.date) + 'T23:59:59');
  return !isNaN(end) && (Date.now() - end.getTime() > CH_PROOF_TTL_MS);
}

async function openChallengeProofs(instanceUid) {
  const c = visibleMyChallenges().find(x => x.uid === instanceUid);
  if (!c) return;
  _proofChallenge = { uid: c.uid, id: _proofChallengeId(c), label: c.label || c.name || '챌린지' };
  _proofList = [];

  let modal = document.getElementById('challenge-proof-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'challenge-proof-modal';
    modal.onclick = e => { if (e.target.id === 'challenge-proof-modal') closeChallengeProofs(); };
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
  _renderChallengeProofs(true);

  if (!window._fbReady || !window._fb?.getChallengeProofs) { _renderChallengeProofs(false); return; }
  try {
    const snap = await window._fb.getChallengeProofs(_proofChallenge.id);
    const rows = [];
    snap.forEach(d => rows.push(Object.assign({ _id: d.id }, d.data())));
    // 1주 지난 것은 화면에서 내리고, 본 김에 서버에서도 지운다(한 번에 5건까지).
    const expired = rows.filter(_proofExpired);
    if (expired.length && window._fb.deleteChallengeProof) {
      expired.slice(0, 5).forEach(r => window._fb.deleteChallengeProof(r._id).catch(() => {}));
    }
    // 같은 교회 것만, 최신 날짜부터. 정렬을 서버에 맡기면 복합 인덱스가 필요해진다.
    _proofList = rows
      .filter(r => !_proofExpired(r))
      .filter(r => !r.churchCode || !me.churchCode || r.churchCode === me.churchCode)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  } catch (e) {
    console.warn('인증샷 불러오기 실패:', e);
  }
  _renderChallengeProofs(false);
}
function closeChallengeProofs() {
  const m = document.getElementById('challenge-proof-modal');
  if (m) m.style.display = 'none';
  _proofChallenge = null;
  _proofList = [];
}

function _renderChallengeProofs(loading) {
  const modal = document.getElementById('challenge-proof-modal');
  if (!modal || !_proofChallenge) return;
  const today = todayDateKey();
  const mine  = _proofList.some(p => p.userId === me.id && p.date === today);

  const rows = _proofList.map(p => {
    const src = _safeImgSrc(p.photo);
    if (!src) return '';
    const canDelete = p.userId === me.id || (typeof isLeader === 'function' && isLeader());
    return `<div class="cp-item">
        <img src="${src}" alt="인증샷" loading="lazy" onclick="openImageLightbox(this.src)">
        <div class="cp-meta">
          <span class="cp-who">${escHtml(p.userName || '이름 없음')}</span>
          <span class="cp-date">${escHtml(p.date || '')}</span>
        </div>
        ${canDelete ? `<button class="cp-del" onclick="deleteChallengeProof('${escHtml(p._id)}')">삭제</button>` : ''}
      </div>`;
  }).join('');

  modal.innerHTML = `<div class="ram-sheet">
    <div class="ram-title">${escHtml(_proofChallenge.label)} · 인증샷</div>
    <div class="cp-note">사진은 1주 뒤 자동으로 지워져요. 남기려면 사진을 눌러 저장하세요.</div>
    <input type="file" id="challenge-proof-input" accept="image/*" style="display:none"
           onchange="uploadChallengeProof(event)">
    <button class="ram-item" id="challenge-proof-btn"
            onclick="document.getElementById('challenge-proof-input').click()">
      ${mine ? '오늘 인증샷 바꾸기' : '오늘 인증샷 올리기'}
    </button>
    <div class="cp-list">
      ${loading ? '<div class="ram-empty">불러오는 중…</div>'
                : (rows || '<div class="ram-empty">아직 올라온 인증샷이 없어요</div>')}
    </div>
    <button class="ram-item" onclick="closeChallengeProofs()">닫기</button>
  </div>`;
}

async function uploadChallengeProof(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || !_proofChallenge) return;
  if (!file.type.startsWith('image/')) { toast('이미지 파일만 올릴 수 있어요'); return; }
  if (file.size > 10 * 1024 * 1024) { toast('사진이 너무 커요 (10MB 이하)'); return; }
  if (!window._fbReady || !window._fb?.setChallengeProof) { toast('연결 중입니다'); return; }

  const btn = document.getElementById('challenge-proof-btn');
  if (btn) { btn.disabled = true; btn.textContent = '올리는 중…'; }
  try {
    const raw = await _readFileAsDataUrl(file);
    // 채팅 사진(260KB)보다 더 조인다 — 한 챌린지에 사람 수 × 날짜 수만큼 쌓인다.
    const photo = await _fitImageForFirestore(raw, 140 * 1024);
    const date  = todayDateKey();
    const id    = `${me.id}_${_proofChallenge.id}_${date}`;
    const row = {
      userId: me.id, userName: me.name || '',
      churchCode: me.churchCode || '',
      challengeId: _proofChallenge.id,
      challengeLabel: _proofChallenge.label,
      date, photo, createdAt: new Date().toISOString()
    };
    await window._fb.setChallengeProof(id, row);
    _proofList = _proofList.filter(p => p._id !== id);
    _proofList.unshift(Object.assign({ _id: id }, row));
    _renderChallengeProofs(false);
    toast('인증샷을 올렸어요');
  } catch (e) {
    console.error('인증샷 올리기 실패:', e);
    toast(e?.code === 'permission-denied' ? '권한이 없어요' : '올리기에 실패했어요');
    if (btn) { btn.disabled = false; btn.textContent = '오늘 인증샷 올리기'; }
  }
}

async function deleteChallengeProof(docId) {
  if (!confirm('이 인증샷을 지울까요?')) return;
  if (!window._fbReady || !window._fb?.deleteChallengeProof) { toast('연결 중입니다'); return; }
  try {
    await window._fb.deleteChallengeProof(docId);
    _proofList = _proofList.filter(p => p._id !== docId);
    _renderChallengeProofs(false);
    toast('지웠어요');
  } catch (e) {
    console.error('인증샷 삭제 실패:', e);
    toast(e?.code === 'permission-denied' ? '권한이 없어요' : '삭제에 실패했어요');
  }
}

function leaveChallenge(instanceUid) {
  saveMyChallenges(myChallenges().filter(c => c.uid !== instanceUid));
  toast('챌린지에서 나갔어요');
  openSubscreen('my-challenges');
}

function allCustomChallenges() {
  const global = DB.get('allCustomChallenges', null);
  if (global !== null) return global;
  // 구 버전 마이그레이션: 교회별 저장 → 전역 저장
  const legacy = DB.get('customChallenges_' + (me.church || '_default'), []);
  if (legacy.length) {
    const migrated = legacy.map(c => ({
      ...c, createdByChurch: me.church || '', isPublic: false
    }));
    DB.set('allCustomChallenges', migrated);
    return migrated;
  }
  return [];
}

function saveAllCustomChallenges(list) { DB.set('allCustomChallenges', list); }

async function syncChallengesFromFirestore() {
  if (!window._fbReady || !window._fb) return;
  // 내 참여 목록 먼저 — 카탈로그만 맞춰봐야 "시작한 챌린지" 가 비어 있으면 소용이 없다.
  try {
    const snap = await window._fb.getUser(me.id);
    if (snap.exists() && mergeMyChallenges(snap.data().myChallenges)) {
      if (document.getElementById('subscreen')?.dataset?.current === 'my-challenges')
        openSubscreen('my-challenges');
    }
  } catch (err) { console.warn('챌린지 참여 목록 불러오기 실패:', err); }

  try {
    const fetched = [];
    const seen = new Set();
    const add = (d) => { if (!seen.has(d.id)) { seen.add(d.id); fetched.push({ id: d.id, ...d.data() }); } };

    // 내 교회 챌린지
    if (me.church) {
      const snap = await window._fb.getChallengesByChurch(me.church);
      snap.forEach(add);
    }

    // 공개 챌린지
    const pubSnap = await window._fb.getPublicChallenges();
    pubSnap.forEach(add);

    // 개인 챌린지
    const perSnap = await window._fb.getPersonalChallenges(me.id);
    perSnap.forEach(add);

    if (!fetched.length) return;

    const local = DB.get('allCustomChallenges', []);
    const fetchedIds = new Set(fetched.map(c => c.id));
    const localOnly = local.filter(c => !fetchedIds.has(c.id));
    saveAllCustomChallenges([...fetched, ...localOnly]);
    _catalogSynced = true;   // 이제부터 삭제된 원본의 참여 기록을 가려도 안전하다
    renderChallenge();
  } catch(e) {
    console.warn('Firestore 챌린지 동기화 실패:', e);
  }
}

function personalChallenges() {
  return allCustomChallenges().filter(c => c.scope === 'personal' && c.createdByUid === me.id);
}

function customChallenges() {
  return allCustomChallenges().filter(c =>
    c.scope !== 'personal' && c.createdByChurch === (me.church || ''));
}

function publicChallenges() {
  return allCustomChallenges().filter(c =>
    c.scope !== 'personal' && c.isPublic && c.createdByChurch !== (me.church || ''));
}

function fullCatalog() {
  return [...CHALLENGE_CATALOG, ...personalChallenges(), ...customChallenges(), ...publicChallenges()];
}

// 참여 기록에는 '참여 상태'(체크한 날짜·연속일)만 있으면 된다. 기간·주기 같은 '정의'는
// 카탈로그가 원본이다. 예전엔 참여하는 순간 정의까지 복사해 둬서, 만든 리더가 시작·종료일을
// 고쳐도 이미 참여한 사람 화면엔 옛 값(대개 빈 값)이 그대로 남았다.
var _CH_DEF_FIELDS = ['tag', 'label', 'desc', 'freqType', 'freqTarget', 'startDate', 'endDate', 'type', 'target'];
function myChallenges() {
  const list = DB.get('myChallenges_' + me.id, []);
  const byId = {};
  fullCatalog().forEach(t => { byId[t.id] = t; });
  return list.map(c => {
    const t = c.templateId && byId[c.templateId];
    if (!t) return c;                       // 카탈로그를 아직 못 받았거나 원본이 삭제됨 → 저장본 그대로
    const out = Object.assign({}, c);
    _CH_DEF_FIELDS.forEach(f => { if (t[f] !== undefined) out[f] = t[f]; });
    return out;
  });
}

// 원본 챌린지가 삭제돼도 참여 기록(myChallenges)은 각자 목록에 그대로 남아 계속 보였다.
// 서버 카탈로그를 실제로 받아온 뒤에만 걸러낸다 — 아직 못 받은 상태에서 거르면
// 멀쩡한 챌린지가 통째로 사라져 보인다. 저장은 건드리지 않고 화면에서만 감춘다.
var _catalogSynced = false;

function visibleMyChallenges() {
  const list = myChallenges();
  if (!_catalogSynced) return list;
  const ids = new Set(fullCatalog().map(c => c.id));
  return list.filter(c => !c.templateId || ids.has(c.templateId));
}

// 참여 목록·체크 기록은 여태 이 기기 localStorage 에만 있었다. 그래서 다른 기기·브라우저로
// 들어오면 시작한 적 없는 것처럼 비어 보였다("빌립보서 시작했는데 안 되어 있다").
// 내 users 문서에 함께 저장한다 — 본인이 쓰고 규칙 변경이 필요 없다.
function saveMyChallenges(list) {
  DB.set('myChallenges_' + me.id, list);
  if (window._fbReady && window._fb && me && me.id) {
    me.myChallenges = list;
    window._fb.updateUser(me.id, { myChallenges: list, myChallengesAt: new Date().toISOString() })
      .catch(err => console.warn('챌린지 참여 동기화 실패:', err));
  }
}

// 서버 목록과 로컬 목록을 합친다.
// ① 같은 챌린지면 한 칸으로 합친다 — 기준은 인스턴스 uid 가 아니라 templateId 다.
//    다시 시작하면 uid 가 새로 생기므로, uid 로 합치면 같은 챌린지가 두 개로 보이고
//    체크 기록도 옛 인스턴스와 새 인스턴스로 갈라진다.
// ② checkedDates 는 합집합이라 어느 쪽 체크도 사라지지 않는다.
// ③ 로컬에만 있는 게 있으면 서버로 올린다 — 받기만 하면 동기화 이전에 다른 기기에서 한
//    체크가 그 기기에 갇힌 채 영영 올라오지 못한다.
function _myChKey(c) { return c.templateId || ('uid:' + c.uid); }

function _myChSig(list) {
  return (list || []).map(c =>
    _myChKey(c) + '|' + [...(c.checkedDates || [])].sort().join(',') + '|' + (c.startedAt || '')
  ).sort().join(';');
}

function mergeMyChallenges(remote) {
  const local  = myChallenges();
  const server = Array.isArray(remote) ? remote : [];
  if (!local.length && !server.length) return false;

  const byKey = new Map();
  [...server, ...local].forEach(c => {
    if (!c || (!c.templateId && !c.uid)) return;
    const k = _myChKey(c), prev = byKey.get(k);
    if (!prev) { byKey.set(k, { ...c, checkedDates: [...(c.checkedDates || [])] }); return; }
    const dates = [...new Set([...prev.checkedDates, ...(c.checkedDates || [])])].sort();
    // 기간·목표 같은 정보는 나중에 시작한 쪽을 쓰고, 체크는 양쪽을 모두 남긴다
    const newer = (c.startedAt || '') > (prev.startedAt || '') ? c : prev;
    byKey.set(k, { ...newer, checkedDates: dates });
  });
  const merged = [...byKey.values()];
  const sig = _myChSig(merged);

  const changed = sig !== _myChSig(local);
  if (changed) DB.set('myChallenges_' + me.id, merged);   // saveMyChallenges 면 방금 받은 걸 되쓴다

  if (sig !== _myChSig(server) && window._fbReady && window._fb && me && me.id) {
    me.myChallenges = merged;
    window._fb.updateUser(me.id, { myChallenges: merged, myChallengesAt: new Date().toISOString() })
      .catch(err => console.warn('챌린지 참여 올리기 실패:', err));
  }
  return changed;
}

// 챌린지를 고칠 수 있는지 판단하는 단 하나의 기준.
// 교회·전체 챌린지는 만든 사람이라도 리더가 아니면 못 고친다 — 여럿이 함께 쓰는 챌린지라,
// 만든 사람이 리더에서 내려온 뒤에도 계속 손댈 수 있으면 곤란하다. 개인 챌린지는 본인 것.
function canEditChallenge(ch) {
  if (!ch || !me) return false;
  if (me.isAppAdmin) return true;
  const isPersonal = ch.scope === 'personal' || !ch.createdByChurch;
  if (isPersonal) return ch.createdByUid === me.id;
  return ch.createdByChurch === (me.church || '') && (isLeader() || hasLeaderPerm('challenge-manage'));
}

async function deleteChallenge(e, id) {
  if (e) e.stopPropagation();
  const list = allCustomChallenges();
  const ch   = list.find(c => c.id === id);
  if (!ch) return;
  if (!canEditChallenge(ch)) {
    toast('삭제 권한이 없어요'); return;
  }
  // 챌린지를 지우면 체크 기록도 함께 지운다. 되돌릴 수 없으니 몇 일치가 사라지는지 먼저 알린다.
  const myRec  = myChallenges().filter(c => c.templateId === id);
  const myDays = myRec.reduce((n, c) => n + (c.checkedDates || []).length, 0);
  if (!confirm(`"${ch.label || ch.name || ''}" 챌린지를 삭제할까요?\n\n`
             + (myDays ? `· 내 체크 기록 ${myDays}일치가 함께 삭제돼요.\n` : '')
             + `· 참여 중인 다른 교인의 목록에서도 사라져요.\n`
             + `· 되돌릴 수 없어요.`)) return;
  // 서버에서 먼저 지운다. 예전엔 로컬만 지우고 서버 삭제 실패를 .catch(()=>{}) 로 삼켜서,
  // 권한 부족 등으로 서버에 남으면 다음 동기화 때 그 챌린지가 그대로 되살아났다.
  if (window._fbReady && window._fb) {
    try {
      await window._fb.deleteChallenge(id);
    } catch (err) {
      console.error('챌린지 삭제 실패:', err);
      toast(err && err.code === 'permission-denied'
        ? '이 챌린지를 지울 권한이 없어요 — 만든 사람이나 리더만 지울 수 있어요'
        : '삭제에 실패했어요. 연결을 확인하고 다시 시도해 주세요');
      return;   // 로컬도 그대로 둔다 — 지운 것처럼 보였다가 되살아나는 게 더 나쁘다
    }
  }
  saveAllCustomChallenges(list.filter(c => c.id !== id));
  // 챌린지가 사라지면 그 체크 기록도 남기지 않는다(위 확인창에서 동의를 받았다).
  // 다른 교인의 기록은 각자 users 문서라 규칙상 여기서 지울 수 없다 —
  // 그쪽 화면에서는 visibleMyChallenges 가 원본 없는 참여를 걸러 준다.
  if (myRec.length) saveMyChallenges(myChallenges().filter(c => c.templateId !== id));
  renderChallenge();
  if (document.getElementById('subscreen')?.dataset?.current === 'challenge-manage')
    setTimeout(() => openSubscreen('challenge-manage'), 150);
  toast('챌린지를 삭제했어요 ');
}

function toggleChallengePublic(id) {
  const list = allCustomChallenges();
  const ch   = list.find(c => c.id === id);
  if (!ch) return;
  ch.isPublic = !ch.isPublic;
  ch.scope = ch.isPublic ? 'public' : 'church';
  ch.updatedAt = new Date().toISOString();
  saveAllCustomChallenges(list);
  if (window._fbReady && window._fb)
    window._fb.setChallenge(id, ch).catch(() => {});
  toast(ch.isPublic ? '전체 공개로 변경됐어요!' : '우리 교회 비공개로 변경됐어요');
  setTimeout(() => openSubscreen('challenge-manage'), 150);
}

function openEditChallengeModal(id) {
  const ch = allCustomChallenges().find(c => c.id === id);
  if (!ch) return;

  if (!canEditChallenge(ch)) {
    toast('수정 권한이 없어요 '); return;
  }

  _editChallengeId = id;

  const sel = document.getElementById('cc-tag');
  sel.innerHTML = CHALLENGE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
  sel.value = ch.tag || CHALLENGE_CATEGORIES[0];
  document.getElementById('cc-label').value  = ch.label || '';
  document.getElementById('cc-desc').value   = ch.desc  || '';
  document.getElementById('cc-target').value = ch.freqTarget || ch.target || 7;
  document.getElementById('cc-start-date').value = ch.startDate || '';
  document.getElementById('cc-end-date').value   = ch.endDate   || '';
  ccSetType(ch.freqType || 'daily');
  const scope = ch.scope || (ch.isPublic ? 'public' : 'church');
  ccSetScope(scope);

  const titleEl = document.querySelector('#modal-create-challenge .modal-title');
  if (titleEl) titleEl.textContent = '챌린지 수정 ';
  const submitBtn = document.getElementById('cc-submit-btn');
  if (submitBtn) submitBtn.textContent = '수정 완료';

  document.getElementById('modal-create-challenge').classList.add('open');
}

function submitEditChallenge() {
  const id  = _editChallengeId;
  const list = allCustomChallenges();
  const idx  = list.findIndex(c => c.id === id);
  if (idx < 0) return;

  const ch = list[idx];
  if (!canEditChallenge(ch)) {
    toast('수정 권한이 없어요 '); return;
  }

  const label = document.getElementById('cc-label').value.trim();
  if (!label) { toast('챌린지 이름을 입력해 주세요'); return; }

  if (_ccScope === 'church' && !me.church) {
    toast('교회에 소속되어 있어야 교회 챌린지를 만들 수 있어요'); return;
  }

  const updated = {
    ...list[idx],
    tag:         document.getElementById('cc-tag').value,
    label,
    desc:        document.getElementById('cc-desc').value.trim() || list[idx].desc,
    freqType:    _ccFreqType,
    freqTarget:  _ccFreqType !== 'daily' ? (parseInt(document.getElementById('cc-target').value)||1) : null,
    startDate:   document.getElementById('cc-start-date').value || null,
    endDate:     document.getElementById('cc-end-date').value   || null,
    scope:       _ccScope,
    isPublic:    _ccScope === 'public',
    updatedAt:   new Date().toISOString(),
    type:        _ccFreqType === 'daily' ? 'streak' : 'weekly',
  };
  list[idx] = updated;
  saveAllCustomChallenges(list);
  if (window._fbReady && window._fb)
    window._fb.setChallenge(id, updated).catch(() => {});

  closeCreateChallengeModal();
  renderChallenge();
  toast(`"${label}" 챌린지가 수정됐어요!`);
}

// 챌린지 종료 결과 계산 — M(기간 내 체크 수) / N(총 목표) / 성공(M≥N, 100% 기준)
function chResult(c) {
  const freqType = c.freqType || (c.type === 'weekly' ? 'weekly' : 'daily');
  const dates = (c.checkedDates || []).filter(d =>
    (!c.startDate || d >= c.startDate) && (!c.endDate || d <= c.endDate));
  const m = dates.length;
  const freq = c.freqTarget || c.target;
  let periods = 1;
  if (c.startDate && c.endDate) {
    const s = new Date(c.startDate + 'T00:00:00');
    const e = new Date(c.endDate + 'T00:00:00');
    const days = Math.floor((e - s) / 86400000) + 1;
    if (freqType === 'daily')        periods = days;
    else if (freqType === 'weekly')  periods = Math.max(1, Math.ceil(days / 7));
    else if (freqType === 'monthly') periods = Math.max(1, (e.getFullYear()*12 + e.getMonth()) - (s.getFullYear()*12 + s.getMonth()) + 1);
    else if (freqType === 'yearly')  periods = Math.max(1, e.getFullYear() - s.getFullYear() + 1);
  } else if (freqType === 'daily') {
    periods = Math.max(m, 1);   // 시작일 미상 → 달성분 기준(성공 처리)
  }
  const n = freqType === 'daily' ? periods : (freq ? freq * periods : 0);
  const success = n > 0 ? m >= n : m > 0;
  return { m, n, success, freqType };
}
// 종료된 챌린지 결과 배지 (성공: 🏆 목표 달성 / 미달: 목표 N회 중 M회 달성)
function chResultBadge(c) {
  const r = chResult(c);
  const unit = r.freqType === 'daily' ? '일' : '회';
  if (r.success)
    return `<span style="display:inline-block;font-size:11.5px;font-weight:800;color:#1a0e00;background:var(--gold);border-radius:6px;padding:2px 9px">🏆 목표 달성</span>`;
  return `<span style="display:inline-block;font-size:11.5px;font-weight:700;color:var(--muted);background:var(--cream2);border-radius:6px;padding:2px 9px">목표 ${r.n}${unit} 중 ${r.m}${unit} 달성</span>`;
}

// 날짜가 속한 주기 키 (주/월/연) — 무기한 챌린지 집계용
function chPeriodKey(d, freqType) {
  switch (freqType) {
    case 'weekly':  return getISOWeekKey(d);
    case 'monthly': return d.slice(0, 7);
    case 'yearly':  return d.slice(0, 4);
    default:        return d;            // daily — 하루가 곧 주기
  }
}
// 무기한(종료일 없음) 챌린지의 달성 집계 — 목표를 채운 주기 수
function chOpenDone(c) {
  const freqType = c.freqType || (c.type === 'weekly' ? 'weekly' : 'daily');
  const dates = [...new Set(c.checkedDates || [])];
  const unit = { weekly:'주', monthly:'달', yearly:'해' }[freqType] || '일';
  if (freqType === 'daily') return { done: dates.length, unit, freqType };
  const target = c.freqTarget || c.target || 1;
  const byPeriod = {};
  dates.forEach(d => { const k = chPeriodKey(d, freqType); byPeriod[k] = (byPeriod[k] || 0) + 1; });
  const done = Object.values(byPeriod).filter(n => n >= target).length;
  return { done, unit, freqType };
}

// 챌린지 횟수 라벨 (모든 화면 공통) — 일/주/월/연간 전부 처리
function chFreqLabel(c) {
  const n = c.freqTarget || c.target;
  switch (c.freqType) {
    case 'daily':   return '매일';
    case 'weekly':  return n ? `주 ${n}회` : '주간';
    case 'monthly': return n ? `월 ${n}회` : '월간';
    case 'yearly':  return n ? `연 ${n}회` : '연간';
    default:        return '';
  }
}
// 챌린지 기간 라벨 (시작~종료 + D-day) — 모든 화면 공통
function chPeriodLabel(c) {
  let out = '';
  if (c.endDate) {
    const dLeft = Math.ceil((new Date(c.endDate + ' 23:59') - new Date()) / 86400000);
    out = dLeft < 0 ? '기간 종료' : dLeft === 0 ? '오늘 종료' : `D-${dLeft}`;
  }
  if (c.startDate && c.endDate) out += (out ? ' · ' : '') + `${c.startDate} ~ ${c.endDate}`;
  else if (c.startDate)         out += (out ? ' · ' : '') + `${c.startDate} 시작`;
  return out;
}

function _cmChCard(ch, showActions) {
  const freqLabel  = chFreqLabel(ch);
  const periodLabel = chPeriodLabel(ch);
  const scopeLabel = ch.scope === 'personal' ? '개인'
    : ch.isPublic ? '전체 공개' : '교회';
  const scopeColor = ch.scope === 'personal' ? 'rgba(142,68,173,0.12)'
    : ch.isPublic ? 'rgba(41,128,185,0.12)' : 'rgba(0,0,0,0.06)';
  const scopeText = ch.scope === 'personal' ? '#8E44AD'
    : ch.isPublic ? '#2980B9' : 'var(--muted)';

  let html = `
    <div style="background:white;border-radius:14px;border:1.5px solid var(--border);padding:14px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:14.5px;font-weight:800;margin-bottom:3px">${escHtml(ch.label)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <span style="font-size:11.5px;background:var(--cream2);border-radius:6px;padding:2px 8px;font-weight:600">${escHtml(ch.tag||'기타')}</span>
            ${freqLabel ? `<span style="font-size:11.5px;background:var(--cream2);border-radius:6px;padding:2px 8px;font-weight:600">${freqLabel}</span>` : ''}
            <span style="font-size:11.5px;background:${scopeColor};color:${scopeText};border-radius:6px;padding:2px 8px;font-weight:700">${scopeLabel}</span>
            ${periodLabel ? `<span style="font-size:11.5px;color:var(--muted);font-weight:600">📅 ${periodLabel}</span>` : ''}
          </div>
        </div>
      </div>
      ${ch.desc ? `<div style="font-size:12.5px;color:var(--muted);line-height:1.6;margin-bottom:10px">${escHtml(ch.desc.slice(0,60)+(ch.desc.length>60?'…':''))}</div>` : ''}`;
  if (showActions) {
    html += `<div style="display:flex;gap:7px">
      <button onclick="openEditChallengeModal('${ch.id}')"
        style="flex:1;height:34px;border-radius:9px;border:1.5px solid var(--border);background:white;
               color:var(--dark);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">수정</button>
      <button onclick="deleteChallenge(null,'${ch.id}')"
        style="height:34px;padding:0 12px;border-radius:9px;border:1.5px solid rgba(192,57,43,0.25);
               background:#FBE5E5;color:#C0392B;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">🗑</button>
    </div>`;
  }
  return html + '</div>';
}

function renderChallengeManage() {
  const perList  = personalChallenges();
  const chList   = customChallenges();
  const pubAll   = allCustomChallenges().filter(c => c.isPublic);

  const tabBtn = (key, label, count) => `
    <button onclick="_cmSetTab('${key}')"
      style="height:32px;padding:0 14px;border-radius:20px;border:none;
             background:${_cmTab===key?'var(--black)':'var(--cream2)'};
             color:${_cmTab===key?'white':'var(--muted)'};
             font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">
      ${label} (${count})
    </button>`;

  let html = `
    <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${tabBtn('personal','개인',perList.length)}
        ${tabBtn('mine','교회',chList.length)}
        ${tabBtn('public','공개',pubAll.length)}
      </div>
      <button onclick="openCreateChallengeModal()"
        style="height:32px;padding:0 14px;border-radius:20px;border:none;background:var(--gold);
               color:var(--dark);font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;flex-shrink:0">
        + 만들기
      </button>
    </div>
    <div style="padding:14px 16px 32px">`;

  if (_cmTab === 'personal') {
    if (!perList.length) {
      html += `<div class="ss-empty"><div class="ss-empty-icon">🔐</div>
        <div class="ss-empty-title">아직 개인 챌린지가 없어요</div>
        <div class="ss-empty-sub">나만의 챌린지를 만들어보세요!</div></div>`;
    } else {
      perList.forEach(ch => { html += _cmChCard(ch, true); });
    }
  } else if (_cmTab === 'mine') {
    if (!chList.length) {
      html += `<div class="ss-empty"><div class="ss-empty-icon">📣</div>
        <div class="ss-empty-title">아직 만든 챌린지가 없어요</div>
        <div class="ss-empty-sub">+ 만들기 버튼으로 첫 챌린지를 시작해보세요!</div></div>`;
    } else {
      chList.forEach(ch => { html += _cmChCard(ch, canEditChallenge(ch)); });
    }
  } else {
    if (!pubAll.length) {
      html += `<div class="ss-empty"><div class="ss-empty-icon">🌐</div>
        <div class="ss-empty-title">공개된 챌린지가 없어요</div></div>`;
    } else {
      pubAll.forEach(ch => {
        const canEdit = ch.createdByUid === me.id || me.isAppAdmin;
        html += _cmChCard(ch, canEdit);
      });
    }
  }
  return html + '</div>';
}

function renderChallengeFilters() {
  const cats = ['전체', ...CHALLENGE_CATEGORIES];
  document.getElementById('ch-filter-row').innerHTML = cats.map(cat => `
    <button class="ch-filter-chip${chFilter === cat ? ' on' : ''}" onclick="setChallengeFilter('${cat}')">${cat}</button>
  `).join('');
}

function setChallengeFilter(cat) {
  chFilter = cat;
  renderChallenge();
}

function renderChallenge() {
  const catalog = fullCatalog();
  const myList = visibleMyChallenges();   // 삭제된 원본의 참여 기록은 빼고 보여준다
  const startedIds = myList.map(c => c.templateId);
  const today = todayDateKey();
  // 기간이 끝난 챌린지는 '내가 신청한 챌린지' 의 기간 종료 칸에만 둔다(renderMyChallenges 와 같은 기준).
  // 여기 남겨 두면 체크할 수 없는 카드가 진행 중 목록을 계속 차지한다.
  const activeList = myList.filter(c => !c.endDate || c.endDate >= today);

  renderLeaderBar();
  renderChallengeFilters();

  // 추천: 아직 시작 안 한 챌린지 중 3개
  const recommended = catalog.filter(c => !startedIds.includes(c.id)).slice(0, 3);

  document.getElementById('ch-recommended').innerHTML = recommended.length
    ? recommended.map(c => `
      <div class="challenge-card" onclick="openChallengeStartModal('${c.id}')">
        <span class="c-tag">${escHtml(c.tag)}</span>
        <span class="c-label">${escHtml(c.label)}</span>
        <span class="c-action">+ 시작</span>
      </div>`).join('')
    : `<div class="todo-empty">추천할 새 챌린지가 없어요. 모든 챌린지를 시작하셨네요! </div>`;

  // 진행 중인 챌린지
  document.getElementById('ch-active').innerHTML = activeList.length
    ? activeList.map(c => {
        const freqType   = c.freqType || (c.type === 'weekly' ? 'weekly' : 'daily');
        const freq       = c.freqTarget || c.target;
        const dates      = c.checkedDates || [];
        const isDaily    = freqType === 'daily';
        const count      = getCurrentPeriodCount(dates, freqType);
        const streak     = isDaily ? calculateStreak(dates) : 0;

        // 진행률 + 오른쪽 라벨
        let prog, rightLbl;
        if (isDaily) {
          prog     = Math.min(streak / 30, 1);
          rightLbl = `연속 ${streak}일`;
        } else {
          prog     = freq ? Math.min(count / freq, 1) : 0;
          const periodMap = { weekly:'이번 주', monthly:'이번 달', yearly:'올해' };
          rightLbl = `${periodMap[freqType]||''} ${count}${freq ? '/'+freq : ''}회`;
        }

        // 기간 남은 일수
        let periodTag = '';
        if (c.endDate) {
          const dLeft = Math.ceil((new Date(c.endDate+' 23:59') - new Date()) / 86400000);
          if (dLeft < 0)      periodTag = `<span style="color:#E63946;font-size:11px;font-weight:700">기간 종료</span>`;
          else if (dLeft === 0) periodTag = `<span style="color:#E63946;font-size:11px;font-weight:700">오늘 종료</span>`;
          else                periodTag = `<span style="color:var(--muted);font-size:11px">D-${dLeft}</span>`;
        }
        if (c.startDate && c.endDate) {
          periodTag += `<span style="color:var(--muted);font-size:11px;margin-left:6px">${c.startDate} ~ ${c.endDate}</span>`;
        }

        // 버튼 상태
        const checkedToday = dates.includes(today);
        const expired      = c.endDate && c.endDate < today;
        const goalDone     = !isDaily && freq && count >= freq;
        let btnLabel, btnClass, disabled;
        if (expired)         { btnLabel='기간 종료';   btnClass='done'; disabled=true; }
        else if (goalDone)   { btnLabel='목표 달성!';  btnClass='done'; disabled=true; }
        else if (checkedToday){ btnLabel='오늘 완료!'; btnClass='done'; disabled=true; }
        else                 { btnLabel='오늘 체크하기';  btnClass='';     disabled=false; }

        const tpl = catalog.find(t => t.id === c.templateId);
        const canEdit = tpl && tpl.createdByUid === me.id;
        return `
        <div class="challenge-card" style="flex-direction:column;align-items:stretch">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="c-tag">${escHtml(c.tag)}</span>
            <span class="c-label" style="flex:1">${escHtml(c.label)}</span>
            ${canEdit ? `<button class="c-delete-btn" onclick="openEditChallengeModal('${c.templateId}')" title="수정" style="font-size:13px">✏️</button>` : ''}
            <span class="c-streak">${rightLbl}</span>
          </div>
          ${periodTag ? `<div style="margin-top:4px;display:flex;align-items:center;gap:4px">${periodTag}</div>` : ''}
          <div class="c-progress"><div class="c-progress-fill" style="width:${Math.round(prog*100)}%"></div></div>
          <button class="ac-check-btn ${btnClass}" ${disabled?'disabled':''} onclick="checkChallengeToday('${c.uid}')">${btnLabel}</button>
        </div>`;
      }).join('')
    : (myList.length
        // 끝난 챌린지만 남은 경우 — '시작한 게 없다' 고 하면 방금 끝낸 챌린지가 사라진 것처럼 보인다
        ? `<div class="todo-empty">진행 중인 챌린지가 없어요.<br>끝난 챌린지는 메뉴의 '내가 신청한 챌린지' 에 있어요.</div>`
        : `<div class="todo-empty">아직 시작한 챌린지가 없어요.<br>추천 챌린지를 시작해보세요! </div>`);

  // 모든 챌린지 (카테고리 필터 적용)
  const filtered = chFilter === '전체' ? catalog : catalog.filter(c => c.tag === chFilter);
  document.getElementById('ch-all').innerHTML = filtered.length
    ? filtered.map(c => {
        const started    = startedIds.includes(c.id);
        const isCustom   = c.id && c.id.startsWith('custom_');
        const isMine     = isCustom && c.createdByUid === me.id;
        const isPersonal = c.scope === 'personal';
        const scopeIcon  = isPersonal ? '🔐' : c.isPublic ? '🌐' : '🔒';
        const scopeText  = isPersonal ? '개인' : (c.createdByChurch || '교회');
        const churchBadge = isCustom
          ? `<span class="c-church-badge${c.isPublic && !isMine ? ' public' : ''}">
               ${scopeIcon} ${escHtml(scopeText)}
             </span>`
          : '';
        // 교회 챌린지는 만든 사람이라도 리더가 아니면 수정 버튼이 보이지 않는다
        const editBtn = canEditChallenge(c)
          ? `<button class="c-delete-btn" onclick="openEditChallengeModal('${c.id}');event.stopPropagation()" title="수정" style="font-size:13px">✏️</button>`
          : '';
        const deleteBtn = canEditChallenge(c) && isCustom
          ? `<button class="c-delete-btn" onclick="deleteChallenge(event,'${c.id}')" title="삭제">🗑</button>`
          : '';
        return `
        <div class="challenge-card${started ? ' started' : ''}"
             style="flex-wrap:wrap"
             ${started ? '' : `onclick="openChallengeStartModal('${c.id}')"`}>
          <span class="c-tag">${escHtml(c.tag)}</span>
          <span class="c-label">${escHtml(c.label)}</span>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
            ${editBtn}${deleteBtn}
            <span class="c-action${started ? ' started' : ''}">${started ? '진행중' : '+ 시작'}</span>
          </div>
          ${churchBadge ? `<div style="flex-basis:100%;padding-top:4px">${churchBadge}</div>` : ''}
        </div>`;
      }).join('')
    : `<div class="todo-empty">이 카테고리에는 챌린지가 없어요</div>`;

  renderCompletedChallenges(myList);
}

function renderCompletedChallenges(myList) {
  const container = document.getElementById('completed-challenges');
  if (!container) return;
  myList = myList || myChallenges();
  const today = todayDateKey();
  const row = (label, badge) => `<div class="challenge-done-row" style="display:flex;align-items:center;gap:8px">
      <span style="flex:1;min-width:0">${escHtml(label)}</span>
      <span style="flex-shrink:0;font-size:11px;font-weight:800;color:var(--gold)">${badge}</span>
    </div>`;

  // 1) 기간이 끝났고 목표 100% 달성 = 완료
  const finished = myList
    .filter(c => c.endDate && c.endDate < today && chResult(c).success)
    .map(c => {
      const r = chResult(c);
      return row(c.label, `🏆 ${r.m}${r.freqType === 'daily' ? '일' : '회'} 달성`);
    });

  // 2) 무기한(종료일 없음) — 목표를 채운 주기가 있으면 진행형으로 표시
  const ongoing = myList
    .filter(c => !c.endDate)
    .map(c => ({ c, o: chOpenDone(c) }))
    .filter(x => x.o.done > 0)
    .map(x => row(x.c.label, `🔥 ${x.o.done}${x.o.unit} 달성 중`));

  const rows = finished.concat(ongoing);
  container.innerHTML = rows.length
    ? rows.join('')
    : `<div class="todo-empty" style="padding:24px 4px">아직 완료한 챌린지가 없어요.<br>챌린지 탭에서 시작해보세요! </div>`;
}

function openChallengeStartModal(templateId) {
  const tpl = fullCatalog().find(c => c.id === templateId);
  if (!tpl) return;
  if (myChallenges().some(c => c.templateId === templateId)) {
    toast('이미 진행 중인 챌린지예요 ');
    return;
  }
  _pendingChallengeId = templateId;
  document.getElementById('mc-tag').textContent = tpl.tag;
  document.getElementById('mc-label').textContent = tpl.label;
  document.getElementById('mc-desc').textContent = tpl.desc || '';
  document.getElementById('modal-challenge').classList.add('open');
}

function closeChallengeModal(e) {
  if (!e || e.target.id === 'modal-challenge' || e.type !== 'click') {
    document.getElementById('modal-challenge').classList.remove('open');
  }
}

function calculateStreak(checkedDates) {
  if (!checkedDates || !checkedDates.length) return 0;
  const sorted = [...new Set(checkedDates)].sort().reverse();
  let streak = 0, cur = todayDateKey();
  for (const d of sorted) {
    if (d === cur) {
      streak++;
      const prev = new Date(cur + 'T00:00:00');
      prev.setDate(prev.getDate() - 1);
      cur = ymdLocal(prev);
    } else if (d < cur) break;
  }
  return streak;
}

function getCurrentPeriodCount(checkedDates, freqType) {
  if (!checkedDates || !checkedDates.length) return 0;
  const today = todayDateKey();
  switch (freqType) {
    case 'weekly':  { const wk = getISOWeekKey(today); return checkedDates.filter(d => getISOWeekKey(d) === wk).length; }
    case 'monthly': { const mo = today.slice(0,7); return checkedDates.filter(d => d.startsWith(mo)).length; }
    case 'yearly':  { const yr = today.slice(0,4); return checkedDates.filter(d => d.startsWith(yr)).length; }
    default:        return calculateStreak(checkedDates);
  }
}

function freqPeriodLabel(freqType) {
  return { weekly:'주', monthly:'달', yearly:'연' }[freqType] || '일';
}

function confirmStartChallenge() {
  const tpl = fullCatalog().find(c => c.id === _pendingChallengeId);
  if (!tpl) return;
  const list = myChallenges();
  const freqType   = tpl.freqType || (tpl.type === 'weekly' ? 'weekly' : 'daily');
  const freqTarget = tpl.freqTarget || tpl.target || null;
  list.push({
    uid:            uid(),
    templateId:     tpl.id,
    tag:            tpl.tag,
    label:          tpl.label,
    freqType,
    freqTarget,
    startDate:      tpl.startDate || null,
    endDate:        tpl.endDate   || null,
    checkedDates:   [],
    // 구 호환 필드
    type:           tpl.type || 'streak',
    target:         freqTarget,
    current:        0,
    streak:         0,
    lastCheckedDate: null,
    startedAt:      new Date().toISOString()
  });
  saveMyChallenges(list);
  closeChallengeModal();
  renderChallenge();
  toast(`"${tpl.label}" 챌린지를 시작했어요!`);
}

function openCreateChallengeModal() {
  _editChallengeId = null;
  const titleEl = document.querySelector('#modal-create-challenge .modal-title');
  if (titleEl) titleEl.textContent = '새 챌린지 만들기 ';
  const submitBtn = document.getElementById('cc-submit-btn');
  if (submitBtn) submitBtn.textContent = '챌린지 만들기';
  const sel = document.getElementById('cc-tag');
  sel.innerHTML = CHALLENGE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
  document.getElementById('cc-label').value = '';
  document.getElementById('cc-desc').value  = '';
  document.getElementById('cc-target').value = 7;
  document.getElementById('cc-start-date').value = '';
  document.getElementById('cc-end-date').value   = '';
  ccSetType('daily');
  ccSetScope('personal');
  document.getElementById('modal-create-challenge').classList.add('open');
}

function closeCreateChallengeModal(e) {
  if (!e || e.target.id === 'modal-create-challenge' || e.type !== 'click') {
    document.getElementById('modal-create-challenge').classList.remove('open');
  }
}

function submitCreateChallenge() {
  if (_editChallengeId) { submitEditChallenge(); return; }

  const label = document.getElementById('cc-label').value.trim();
  if (!label) { toast('챌린지 이름을 입력해 주세요'); return; }

  if (_ccScope === 'church' && !me.church) {
    toast('교회에 소속되어 있어야 교회 챌린지를 만들 수 있어요'); return;
  }

  const tag       = document.getElementById('cc-tag').value;
  const desc      = document.getElementById('cc-desc').value.trim();
  const startDate = document.getElementById('cc-start-date').value || null;
  const endDate   = document.getElementById('cc-end-date').value   || null;
  const freqTarget = _ccFreqType !== 'daily'
    ? Math.max(1, parseInt(document.getElementById('cc-target').value) || 1) : null;

  if (startDate && endDate && endDate < startDate) {
    toast('종료일이 시작일보다 빠를 수 없어요'); return;
  }

  const scopeDesc = _ccScope === 'personal' ? '나만의' : _ccScope === 'public' ? '공개' : (me.church || '우리 교회');

  const newChallenge = {
    id:              'custom_' + uid(),
    tag, label,
    freqType:        _ccFreqType,
    freqTarget,
    startDate,
    endDate,
    desc:            desc || `${scopeDesc} 챌린지예요.`,
    createdBy:       me.name,
    createdByUid:    me.id,
    createdByChurch: _ccScope !== 'personal' ? (me.church || '') : '',
    scope:           _ccScope,
    isPublic:        _ccScope === 'public',
    createdAt:       new Date().toISOString(),
    type:            _ccFreqType === 'daily' ? 'streak' : 'weekly',
    target:          freqTarget
  };

  const list = allCustomChallenges();
  list.push(newChallenge);
  saveAllCustomChallenges(list);

  if (window._fbReady && window._fb) {
    window._fb.setChallenge(newChallenge.id, newChallenge)
      .catch(e => console.warn('Firestore 챌린지 저장 실패:', e));
  }

  closeCreateChallengeModal();
  renderChallenge();
  const scopeMsg = { personal:'개인', church:'교회', public:'전체 공개' }[_ccScope];
  toast(`"${label}" 챌린지를 만들었어요! (${scopeMsg})`);
}

function checkChallengeToday(instanceUid) {
  const list = myChallenges();
  const c = list.find(x => x.uid === instanceUid);
  if (!c) return;
  const today    = todayDateKey();
  const freqType = c.freqType || (c.type === 'weekly' ? 'weekly' : 'daily');
  const freq     = c.freqTarget || c.target;

  // 기간 종료 체크
  if (c.endDate && c.endDate < today) { toast('챌린지 기간이 종료됐어요 '); return; }

  if (!c.checkedDates) c.checkedDates = [];

  // 오늘 이미 체크
  if (c.checkedDates.includes(today)) { toast('오늘은 이미 체크했어요 '); return; }

  // 이번 기간 목표 달성 여부
  if (freqType !== 'daily' && freq) {
    const cnt = getCurrentPeriodCount(c.checkedDates, freqType);
    if (cnt >= freq) {
      toast(`이번 ${freqPeriodLabel(freqType)} 목표를 이미 달성했어요 `); return;
    }
  }

  // 체크
  c.checkedDates.push(today);
  // 구 호환 필드 동기화
  c.lastCheckedDate = today;
  c.streak  = calculateStreak(c.checkedDates);
  c.current = getCurrentPeriodCount(c.checkedDates, freqType);

  saveMyChallenges(list);
  renderChallenge();

  const newCnt = c.current;
  if (freqType !== 'daily' && freq && newCnt >= freq) {
    toast(`이번 ${freqPeriodLabel(freqType)} 목표 달성! "${c.label}"`);
  } else {
    toast('오늘도 완료! ');
  }
}

function obToggleChallenge(id) {
  const idx = obData.picks.indexOf(id);
  if (idx >= 0) {
    obData.picks.splice(idx, 1);
  } else {
    if (obData.picks.length >= 3) { toast('최대 3개까지 선택할 수 있어요'); return; }
    obData.picks.push(id);
  }
  // Update all cards
  document.querySelectorAll('.ob-challenge').forEach(card => {
    const cid = card.dataset.id;
    const on = obData.picks.includes(cid);
    card.classList.toggle('selected', on);
    card.querySelector('.ob-c-check').innerHTML = on
      ? '<svg width="12" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 5l4 4 6-8" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '';
  });
  const cnt = document.getElementById('ob-cnt');
  const n = obData.picks.length;
  cnt.textContent = n > 0 ? n + '개 선택됨' : '선택 안 함';
  cnt.classList.toggle('active', n > 0);
}

function obGetSuggestedChallenges() {
  const today = todayDateKey();
  return fullCatalog()
    .filter(c => !c.endDate || c.endDate >= today)
    .sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1)
    .slice(0, 5);
}

function renderObChallenges() {
  const list = obGetSuggestedChallenges();
  const el = document.getElementById('ob-challenge-list');
  if (!el) return;
  el.innerHTML = list.map(c =>
    `<div class="ob-challenge" data-id="${escHtml(c.id)}" onclick="obToggleChallenge('${escHtml(c.id)}')">
       <span class="ob-c-tag">${escHtml(c.tag || '')}</span>
       <span class="ob-c-label">${escHtml(c.label || '')}</span>
       <div class="ob-c-check" id="obck-${escHtml(c.id)}"></div>
     </div>`
  ).join('');
}

// ═══════════════════════════════════════════════════
//  만보기 — 앱 내 가속도 센서 기반 걸음 측정
//  웹 제약: 앱이 열려 있고 화면이 켜져 있는 동안에만 측정됨 (백그라운드 측정 불가)
// ═══════════════════════════════════════════════════
var _pedOn = false, _pedArmed = false, _pedLastStep = 0, _pedFilt = 1, _pedWakeLock = null, _pedSaveTimer = null;
// ponytail: 기기별 센서 감도 차이가 커서 임계값은 설정에서 조절 가능하게 뺌
var PED_MIN_MS = 260;                                  // 걸음 최소 간격 (분당 ~230보 상한)
function pedSens()      { return DB.get('stepsSens_' + me.id, 1.15); }   // 피크 임계값(g)
function setPedSens(v)  { DB.set('stepsSens_' + me.id, v); }

function getStepGoal()  { return DB.get('stepsGoal_' + me.id, 10000); }
function getStepData()  { return DB.get('steps_' + me.id, {}); }
function getStepsFor(d) { return getStepData()[d] || 0; }

function addSteps(n) {
  const data = getStepData();
  const d = todayDateKey();
  data[d] = (data[d] || 0) + n;
  const keys = Object.keys(data).sort();
  while (keys.length > 60) delete data[keys.shift()];   // 최근 60일만 보관
  DB.set('steps_' + me.id, data);
  _pedQueueSync(data);
  return data[d];
}

// 기기 간 동기화 — 잦은 쓰기를 막기 위해 5초 디바운스
function _pedQueueSync(data) {
  if (!window._fbReady || !window._fb) return;
  clearTimeout(_pedSaveTimer);
  _pedSaveTimer = setTimeout(() => {
    window._fb.updateUser(me.id, { steps: data })
      .catch(e => { if (window._fbErr) window._fbErr('걸음 수 동기화', e); });
  }, 5000);
}
// 로그인 시 서버 기록 병합 (같은 날짜는 큰 값 채택 — 기기별 부분 측정 보존)
function syncStepsFromMe() {
  if (!me || !me.steps || typeof me.steps !== 'object') return;
  const local = getStepData();
  let changed = false;
  Object.keys(me.steps).forEach(d => {
    if ((me.steps[d] || 0) > (local[d] || 0)) { local[d] = me.steps[d]; changed = true; }
  });
  if (changed) DB.set('steps_' + me.id, local);
}

// 가속도 크기의 피크를 세는 단순 검출 — 저역 통과 후 임계값 상향 교차 시 1보
function _pedOnMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) / 9.81;   // g 단위 (중력 포함 → 정지 시 ≈1)
  _pedFilt = _pedFilt * 0.8 + mag * 0.2;
  const now = Date.now();
  if (!_pedArmed && _pedFilt > pedSens() && now - _pedLastStep > PED_MIN_MS) {
    _pedArmed = true;
    _pedLastStep = now;
    _pedPaint(addSteps(1));
  } else if (_pedArmed && _pedFilt < 1.03) {
    _pedArmed = false;                                   // 히스테리시스 — 한 걸음에 여러 번 세는 것 방지
  }
}

async function startPedometer() {
  if (_pedOn) return;
  if (typeof DeviceMotionEvent === 'undefined') { toast('이 기기는 걸음 측정을 지원하지 않아요'); return; }
  // iOS 13+ 는 사용자 제스처 안에서 센서 권한을 받아야 함
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      if (await DeviceMotionEvent.requestPermission() !== 'granted') {
        toast('동작 센서 권한을 허용해 주세요'); return;
      }
    } catch (_) { toast('센서 권한 요청에 실패했어요'); return; }
  }
  window.addEventListener('devicemotion', _pedOnMotion);
  _pedOn = true;
  // 화면이 꺼지면 측정이 멈추므로 가능한 기기에서는 화면을 깨워 둠
  if (navigator.wakeLock) {
    navigator.wakeLock.request('screen').then(l => { _pedWakeLock = l; }).catch(() => {});
  }
  _pedRefresh();
  toast('걸음 측정을 시작했어요');
}

function stopPedometer() {
  if (!_pedOn) return;
  window.removeEventListener('devicemotion', _pedOnMotion);
  _pedOn = false;
  if (_pedWakeLock) { _pedWakeLock.release().catch(() => {}); _pedWakeLock = null; }
  _pedRefresh();
  toast('걸음 측정을 멈췄어요');
}

function togglePedometer() { _pedOn ? stopPedometer() : startPedometer(); }

function setStepGoal() {
  const v = prompt('하루 목표 걸음 수를 입력하세요', getStepGoal());
  if (v === null) return;
  const n = parseInt(v, 10);
  if (!n || n < 100 || n > 100000) { toast('100~100,000 사이로 입력해 주세요'); return; }
  DB.set('stepsGoal_' + me.id, n);
  _pedRefresh();
}

function setPedSensPrompt() {
  const v = prompt('걸음 감지 민감도 (숫자가 작을수록 민감하게 셉니다)\n권장 1.05 ~ 1.30', pedSens());
  if (v === null) return;
  const n = parseFloat(v);
  if (!(n >= 1.0 && n <= 2.0)) { toast('1.0 ~ 2.0 사이로 입력해 주세요'); return; }
  setPedSens(n);
  toast('민감도를 저장했어요');
}

// 걸음 수만 빠르게 갱신 (측정 중 매 걸음 호출 — 전체 렌더는 하지 않음)
function _pedPaint(total) {
  const c = document.getElementById('ped-count');
  if (!c) return;
  const goal = getStepGoal();
  c.textContent = total.toLocaleString();
  const bar = document.getElementById('ped-bar');
  if (bar) bar.style.width = Math.min(100, Math.round(total / goal * 100)) + '%';
  const pct = document.getElementById('ped-pct');
  if (pct) pct.textContent = Math.round(total / goal * 100) + '%';
}

function _pedRefresh() {
  const ss = document.getElementById('subscreen');
  if (ss && ss.classList.contains('open') && ss.dataset.current === 'pedometer')
    document.getElementById('subscreen-body').innerHTML = renderPedometer();
}

function renderPedometer() {
  const today = todayDateKey();
  const cnt   = getStepsFor(today);
  const goal  = getStepGoal();
  const pct   = Math.min(100, Math.round(cnt / goal * 100));
  const data  = getStepData();

  // 최근 7일 (이전 6일 + 오늘)
  let hist = '';
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(today + 'T00:00:00');
    dt.setDate(dt.getDate() - i);
    const k = ymdLocal(dt);
    const v = data[k] || 0;
    const p = Math.min(100, Math.round(v / goal * 100));
    hist += `
      <div style="display:flex;align-items:center;gap:10px;padding:7px 0">
        <span style="width:52px;flex-shrink:0;font-size:12px;color:var(--muted)">${dt.getMonth()+1}/${dt.getDate()}</span>
        <div style="flex:1;height:8px;background:var(--cream2);border-radius:10px;overflow:hidden">
          <div style="height:100%;width:${p}%;background:${v>=goal?'var(--gold)':'var(--black)'};border-radius:10px"></div>
        </div>
        <span style="width:62px;flex-shrink:0;text-align:right;font-size:12px;font-weight:700">${v.toLocaleString()}</span>
      </div>`;
  }

  return `
    <div style="padding:18px 16px 32px">
      <div style="background:white;border-radius:16px;border:1.5px solid var(--border);padding:22px 18px;text-align:center;margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px">오늘 걸음 수</div>
        <div id="ped-count" style="font-size:44px;font-weight:900;line-height:1.2;margin:4px 0">${cnt.toLocaleString()}</div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:12px">목표 ${goal.toLocaleString()}보 · <span id="ped-pct">${pct}%</span></div>
        <div style="height:10px;background:var(--cream2);border-radius:10px;overflow:hidden;margin-bottom:16px">
          <div id="ped-bar" style="height:100%;width:${pct}%;background:${cnt>=goal?'var(--gold)':'var(--black)'};border-radius:10px;transition:width 0.3s"></div>
        </div>
        ${cnt >= goal ? `<div style="font-size:13px;font-weight:800;color:var(--gold);margin-bottom:12px">🎉 오늘 목표를 달성했어요!</div>` : ''}
        <button onclick="togglePedometer()"
          style="width:100%;height:46px;border-radius:12px;border:none;
                 background:${_pedOn ? '#C0392B' : 'var(--black)'};color:white;
                 font-size:14.5px;font-weight:800;cursor:pointer;font-family:inherit">
          ${_pedOn ? '■ 측정 멈추기' : '▶ 걷기 시작'}
        </button>
        ${_pedOn ? `<div style="font-size:11.5px;color:#27AE60;font-weight:700;margin-top:8px">측정 중 · 앱을 켜둔 채로 걸어주세요</div>` : ''}
      </div>

      <div style="background:rgba(41,128,185,0.06);border:1.5px solid rgba(41,128,185,0.18);border-radius:12px;padding:12px 14px;margin-bottom:16px">
        <div style="font-size:12.5px;color:#2980B9;font-weight:700;margin-bottom:4px">측정 안내</div>
        <div style="font-size:12px;color:var(--muted);line-height:1.7">
          웹앱이라 <b>앱 화면이 켜져 있는 동안만</b> 걸음이 세어져요.<br>
          화면을 끄거나 다른 앱으로 이동하면 측정이 멈춥니다.
        </div>
      </div>

      <div class="ss-section-title">최근 7일</div>
      <div class="ss-card" style="padding:8px 14px">${hist}</div>

      <div style="display:flex;gap:8px;margin-top:14px">
        <button onclick="setStepGoal()" style="flex:1;height:40px;border-radius:10px;border:1.5px solid var(--border);background:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">목표 변경</button>
        <button onclick="setPedSensPrompt()" style="flex:1;height:40px;border-radius:10px;border:1.5px solid var(--border);background:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">민감도 조절</button>
      </div>
    </div>`;
}

