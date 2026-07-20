// ===== moved from index.html (feature: admin) — 전역(window) 공유 스코프 =====
function renderAdminUsers() {
  setTimeout(loadAdminUsersData, 80);
  return `<div id="admin-users-body" style="padding:40px 16px;text-align:center;color:var(--muted)">
    <div style="font-size:28px;margin-bottom:12px">🔄</div>
    <div style="font-size:13px">전체 사용자 불러오는 중...</div>
  </div>`;
}

async function loadAdminUsersData() {
  const body = document.getElementById('admin-users-body');
  if (!body) return;
  let allUsers = [];
  try {
    if (window._fbReady && window._fb) {
      const snap = await window._fb.getAllUsers();
      snap.forEach(d => allUsers.push({ id: d.id, ...d.data() }));
    }
  } catch(e) { console.error('Firestore 전체 사용자 로드 실패:', e); }
  if (!allUsers.length) allUsers = DB.get('users', []);   // fallback
  allUsers = allUsers.filter(u => !u.deleted);             // 삭제된 계정 제외
  // 로컬 전용 플래그(isAppAdmin)만 보존 — 최신 Firestore 값이 우선
  const localUsers = DB.get('users', []);
  allUsers = allUsers.map(u => { const l = localUsers.find(x => x.id === u.id); return l ? { ...l, ...u, isAppAdmin: u.isAppAdmin || l.isAppAdmin } : u; });
  _adminUsersData = allUsers;
  _membersCache   = allUsers;   // 승인/거절 핸들러 공유 캐시
  body.outerHTML = renderAdminUsersHtml(allUsers);
}

function filterAdminUsers(val) {
  _adminUserSearch = val;
  const body = document.getElementById('admin-users-body');
  if (body && _adminUsersData) body.outerHTML = renderAdminUsersHtml(_adminUsersData);
}

function renderAdminUsersHtml(allUsers) {
  const q = _adminUserSearch.toLowerCase();
  const filtered = q
    ? allUsers.filter(u =>
        (u.name||'').toLowerCase().includes(q) ||
        (u.email||'').toLowerCase().includes(q) ||
        (u.church||'').toLowerCase().includes(q))
    : allUsers;

  const STATUS_BADGE = {
    active:   ['#27AE60','rgba(39,174,96,0.1)','활성'],
    pending:  ['#E67E22','rgba(243,156,18,0.1)','대기'],
    rejected: ['#E74C3C','rgba(231,76,60,0.1)','거절'],
    disabled: ['var(--muted)','var(--cream2)','비활성'],
  };

  let html = `<div id="admin-users-body">
    <div style="padding:12px 16px;border-bottom:1px solid var(--border)">
      <input type="text" value="${escHtml(_adminUserSearch)}"
        oninput="filterAdminUsers(this.value)"
        placeholder="🔍 이름, 이메일, 교회 검색..."
        style="width:100%;height:40px;border-radius:10px;border:1.5px solid var(--border);
               padding:0 14px;font-size:13.5px;font-family:inherit;box-sizing:border-box">
    </div>
    <div style="padding:10px 16px 4px;font-size:12px;color:var(--muted);font-weight:600">
      총 ${filtered.length}명 ${q?`(검색: "${_adminUserSearch}")`:''}
    </div>
    <div style="padding:0 16px 32px">`;

  if (!filtered.length) {
    html += `<div class="ss-empty"><div class="ss-empty-icon">👥</div>
      <div class="ss-empty-title">검색 결과가 없어요</div></div>`;
  } else {
    filtered.forEach(u => {
      const st = STATUS_BADGE[u.status||'active'] || STATUS_BADGE.active;
      const cs = u.churchStatus;
      const isDisabled = u.status === 'disabled';
      html += `
        <div style="background:white;border-radius:14px;border:1.5px solid var(--border);
                    padding:14px;margin-bottom:10px;opacity:${isDisabled?'0.6':'1'}">
          <!-- 기본 정보 -->
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
            <div>
              <div style="font-size:14px;font-weight:800;margin-bottom:2px">
                ${escHtml(u.name||'이름없음')}
                ${u.isAppAdmin?'<span style="font-size:11px;background:rgba(231,76,60,0.12);color:#C0392B;border-radius:4px;padding:1px 6px;margin-left:4px;font-weight:700">관리자</span>':''}
              </div>
              <div style="font-size:12px;color:var(--muted)">${escHtml(u.email||'—')}</div>
            </div>
            <span style="font-size:11.5px;background:${st[1]};color:${st[0]};
                         border-radius:6px;padding:2px 8px;font-weight:700;flex-shrink:0">${st[2]}</span>
          </div>
          <!-- 교회/역할 -->
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            ${u.church?`<span style="font-size:11.5px;background:var(--cream2);border-radius:6px;padding:2px 8px;font-weight:600">⛪ ${escHtml(u.church)}</span>`:''}
            ${u.role?`<span style="font-size:11.5px;background:var(--cream2);border-radius:6px;padding:2px 8px;font-weight:600">${escHtml(u.role)}</span>`:''}
            ${cs==='pending'?`<span style="font-size:11.5px;background:rgba(243,156,18,0.1);color:#E67E22;border-radius:6px;padding:2px 8px;font-weight:700">교회 가입 대기</span>`:''}
          </div>
          <!-- 액션 버튼 -->
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${u.status==='pending'?`
              <button onclick="approveMinor('${u.id}')"
                style="flex:1;height:32px;border-radius:8px;border:none;background:var(--black);
                       color:white;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">✅ 승인</button>
              <button onclick="rejectMinor('${u.id}')"
                style="flex:1;height:32px;border-radius:8px;border:1.5px solid rgba(192,57,43,0.25);
                       background:#FBE5E5;color:#C0392B;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">거절</button>
            `:''}
            ${cs==='pending'?`
              <button onclick="approveChurchJoin('${u.id}')"
                style="flex:1;height:32px;border-radius:8px;border:none;background:var(--black);
                       color:white;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">⛪ 교회 승인</button>
            `:''}
            <button onclick="adminToggleDisable('${u.id}')"
              style="height:32px;padding:0 12px;border-radius:8px;border:1.5px solid var(--border);
                     background:white;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">
              ${isDisabled?'🔓 활성화':'🚫 비활성화'}
            </button>
            <button onclick="adminDeleteUser('${u.id}','${u.name?.replace(/'/g,"\\'")}')"
              style="height:32px;padding:0 12px;border-radius:8px;border:1.5px solid rgba(192,57,43,0.25);
                     background:#FBE5E5;color:#C0392B;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">🗑</button>
          </div>
        </div>`;
    });
  }
  return html + '</div></div>';   // 카드 컨테이너 + admin-users-body 래퍼 닫기
}

function adminToggleDisable(userId) {
  const users = DB.get('users', []);
  const u = users.find(x => x.id === userId);
  if (!u) return;
  u.status = u.status === 'disabled' ? 'active' : 'disabled';
  DB.set('users', users);
  if (window._fbReady && window._fb) {
    window._fb.updateUser(userId, { status: u.status }).catch(() => {});
  }
  toast(u.status === 'disabled' ? `🚫 ${u.name}님을 비활성화했어요` : `✅ ${u.name}님을 활성화했어요`);
  setTimeout(() => openSubscreen('admin-users'), 150);
}

function adminDeleteUser(userId, name) {
  if (!confirm(`"${name}"님의 계정을 삭제할까요?\n\n· 앱 데이터(Firestore)는 바로 삭제되고, 이 사용자는 앱에서 자동 로그아웃돼요.\n· 로그인 계정(Authentication)은 보안상 앱에서 지울 수 없어, Firebase 콘솔에서 직접 삭제해야 완전히 지워져요.\n\n이 작업은 되돌릴 수 없어요.`)) return;
  // 로컬/UI 제거는 Firestore 삭제 성공 후에만 (이전: 소프트 플래그만 남겨 새로고침 시 재등장)
  const removeLocal = () => {
    DB.set('users', DB.get('users', []).filter(u => u.id !== userId));
    _adminUsersData = (_adminUsersData || []).filter(u => u.id !== userId);
    _membersCache   = (_membersCache   || []).filter(u => u.id !== userId);
    toast('앱 데이터를 삭제했어요. 로그인 계정은 Firebase 콘솔 → Authentication 에서 삭제해 주세요');
    setTimeout(() => openSubscreen('admin-users'), 150);
  };
  if (window._fbReady && window._fb) {
    window._fb.deleteUserDoc(userId)
      .then(removeLocal)
      .catch(e => { console.error('Firestore 계정 삭제 실패:', e); toast('삭제에 실패했어요. 잠시 후 다시 시도해 주세요'); });
  } else {
    removeLocal();   // 오프라인(로컬 모드) — 기존 동작 유지
  }
}

async function adminSyncAllToFirestore() {
  if (!window._fbReady || !window._fb) {
    toast('Firestore에 연결되지 않았어요 🔴'); return;
  }
  const users = DB.get('users', []);
  if (!users.length) { toast('동기화할 사용자가 없어요'); return; }
  toast('☁️ 서버 동기화 중...');
  let count = 0;
  for (const u of users) {
    try {
      // setUser(setDoc merge) → Firestore에 문서가 없어도 생성됨 (updateDoc는 실패)
      await window._fb.setUser(u.id, u);
      count++;
    } catch(e) { console.warn('동기화 실패:', u.id, e); }
  }
  // 교회 데이터도 동기화
  const churches = DB.get('customChurches', {});
  for (const [code, data] of Object.entries(churches)) {
    try {
      if (typeof data === 'object') await window._fb.setChurchInfo(code, data);
    } catch(e) {}
  }
  toast(`✅ ${count}명 서버 동기화 완료!`);
  setTimeout(() => openSubscreen('admin-panel'), 300);
}

function activateAdminCode() {
  const code = document.getElementById('admin-code-input')?.value.trim();
  if (code !== ADMIN_SECRET) { toast('올바르지 않은 코드예요 🔒'); return; }
  const users = DB.get('users', []);
  const u = users.find(x => x.id === me.id);
  if (u) { u.isAppAdmin = true; DB.set('users', users); me.isAppAdmin = true; }
  initSideMenu();
  closeSubscreen();
  toast('🔑 앱 관리자 권한이 활성화됐어요! 사이드 메뉴를 확인해 주세요');
}

function approveChurchRegistration(code) {
  const pending = DB.get('pendingChurches', []);
  const entry   = pending.find(c => c.code === code);
  if (!entry) return;
  // customChurches에 전체 객체로 저장
  const custom = DB.get('customChurches', {});
  custom[code] = {
    name: entry.name, code,
    type: entry.orgType || 'church',
    emoji: (CHURCH_TYPES.find(t => t.value === (entry.orgType||'church')) || CHURCH_TYPES[0]).emoji,
    createdBy: entry.requestedByName || '',
    createdAt: entry.requestedAt || new Date().toISOString(),
    active: true
  };
  DB.set('customChurches', custom);
  DB.set('pendingChurches', pending.filter(c => c.code !== code));
  const users = DB.get('users', []);
  const u = users.find(x => x.id === entry.requestedBy);
  if (u) {
    u.church = entry.name; u.churchCode = code; u.churchStatus = 'active';
    u.pendingChurchCode = null; u.pendingChurchName = null;
    DB.set('users', users);
  }
  // Firestore 동기화: 교회 정보 + 신청자 상태(다른 기기에도 반영)
  if (window._fbReady && window._fb) {
    window._fb.setChurchInfo(code, custom[code]).catch(() => {});
    window._fb.updateUser(entry.requestedBy, {
      church: entry.name, churchCode: code, churchStatus: 'active',
      pendingChurchCode: null, pendingChurchName: null
    }).catch(() => {});
  }
  toast(`✅ "${entry.name}" [${code}] 교회 등록을 승인했어요!`);
  setTimeout(() => openSubscreen('admin-panel'), 150);
}

function rejectChurchRegistration(code) {
  const pending = DB.get('pendingChurches', []);
  const entry   = pending.find(c => c.code === code);
  if (!entry) return;
  DB.set('pendingChurches', pending.filter(c => c.code !== code));
  // 신청자 계정 초기화
  const users = DB.get('users', []);
  const u = users.find(x => x.id === entry.requestedBy);
  if (u) {
    u.churchStatus      = null;
    u.pendingChurchCode = null;
    u.pendingChurchName = null;
    DB.set('users', users);
  }
  // Firestore 동기화: 신청자 상태 초기화(다른 기기에도 반영)
  if (window._fbReady && window._fb) {
    window._fb.updateUser(entry.requestedBy, {
      churchStatus: null, pendingChurchCode: null, pendingChurchName: null
    }).catch(() => {});
  }
  toast(`"${entry.name}" 교회 등록 신청을 거절했어요`);
  setTimeout(() => openSubscreen('admin-panel'), 150);
}

function renderAdminPanel() {
  // 즉시 로딩 상태 반환 후 Firestore 비동기 로드
  setTimeout(loadAdminPanelData, 80);
  return `<div id="admin-panel-body" style="padding:40px 16px;text-align:center;color:var(--muted)">
    <div style="font-size:28px;margin-bottom:12px">🔄</div>
    <div style="font-size:13px">사용자 데이터 불러오는 중...</div>
  </div>`;
}

async function loadAdminPanelData() {
  const body = document.getElementById('admin-panel-body');
  if (!body) return;

  let allUsers = [];

  try {
    if (window._fbReady && window._fb) {
      const snap = await window._fb.getAllUsers();
      snap.forEach(d => allUsers.push({ id: d.id, ...d.data() }));
    }
  } catch(e) {
    console.error('Firestore 사용자 로드 실패, localStorage 사용:', e);
  }

  // Firestore에 없으면 localStorage fallback
  if (allUsers.length === 0) allUsers = DB.get('users', []);

  // 삭제된 계정(구 소프트삭제 포함) 제외
  allUsers = allUsers.filter(u => !u.deleted);

  // 로컬 전용 플래그(isAppAdmin)만 보존 — 최신 Firestore 값이 우선 (이전: 로컬이 원격을 덮어써 수치 고정)
  const localUsers = DB.get('users', []);
  allUsers = allUsers.map(u => {
    const local = localUsers.find(l => l.id === u.id);
    return local ? { ...local, ...u, isAppAdmin: u.isAppAdmin || local.isAppAdmin } : u;
  });

  // 교회 목록도 Firestore(churchInfo)에서 병합 — 다른 기기에서 등록한 교회 표시 (item 3+4)
  await syncChurchesFromFirestore();

  _membersCache = allUsers;   // 승인/거절 핸들러 공유 캐시
  body.outerHTML = renderAdminPanelHtml(allUsers);
}

// churchInfo 컬렉션 → 로컬 customChurches 병합 (name 필드가 있는 문서 = 등록된 교회)
async function syncChurchesFromFirestore() {
  if (!window._fbReady || !window._fb) return;
  try {
    const snap = await window._fb.getAllChurchInfo();
    const custom = DB.get('customChurches', {});
    let changed = false;
    snap.forEach(d => {
      const data = d.data();
      if (!data || !data.name) return;   // 주소/소개만 있는 정보성 문서는 제외
      custom[d.id] = { ...(custom[d.id] || {}), ...data, code: d.id };
      changed = true;
    });
    if (changed) DB.set('customChurches', custom);
  } catch(e) { console.error('Firestore 교회 목록 로드 실패:', e); }
}

function renderAdminPanelHtml(allUsers) {
  const pendingChurch = DB.get('pendingChurches', []);
  const minorPending  = allUsers.filter(u => u.status === 'pending');
  const churchJoinPen = allUsers.filter(u => u.status !== 'pending' && u.churchStatus === 'pending');
  const active        = allUsers.filter(u => u.status === 'active' || !u.status);
  const thirtyMinAgo  = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const onlineNow     = allUsers.filter(u => u.lastActiveAt && u.lastActiveAt > thirtyMinAgo);
  const churches      = [...new Set(allUsers.map(u => u.church).filter(Boolean))];

  let html = `<div id="admin-panel-body">

    <!-- Firestore 연결 상태 -->
    <div style="margin:12px 16px 0;background:${window._fbReady?'rgba(39,174,96,0.08)':'rgba(231,76,60,0.08)'};
                border:1.5px solid ${window._fbReady?'rgba(39,174,96,0.25)':'rgba(231,76,60,0.25)'};
                border-radius:12px;padding:10px 14px;display:flex;align-items:center;gap:8px">
      <span style="font-size:18px">${window._fbReady?'🟢':'🔴'}</span>
      <div>
        <div style="font-size:12.5px;font-weight:700;color:${window._fbReady?'#27AE60':'#E74C3C'}">
          Firestore ${window._fbReady?'연결됨':'연결 안 됨 (로컬 모드)'}
        </div>
        <div style="font-size:11.5px;color:var(--muted)">
          ${window._fbReady?'실시간 서버 연동 활성화됨':'데이터가 이 기기에만 저장돼요'}
        </div>
      </div>
    </div>

    <!-- 퀵 액션 -->
    <div style="padding:12px 16px 0">
      <div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px;margin-bottom:8px">⚡ 퀵 액션</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button onclick="openSubscreen('admin-users')"
          style="height:52px;border-radius:12px;border:1.5px solid var(--border);background:white;
                 font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;
                 display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px">
          <span>👥</span><span style="font-size:11.5px">전체 사용자</span>
        </button>
        <button onclick="openCreateChurchModal()"
          style="height:52px;border-radius:12px;border:1.5px solid var(--border);background:white;
                 font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;
                 display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px">
          <span>⛪</span><span style="font-size:11.5px">교회 만들기</span>
        </button>
        <button onclick="openBoardPostModal('app')"
          style="height:52px;border-radius:12px;border:1.5px solid var(--border);background:white;
                 font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;
                 display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px">
          <span>📢</span><span style="font-size:11.5px">공지 작성</span>
        </button>
        <button onclick="adminSyncAllToFirestore()"
          style="height:52px;border-radius:12px;border:1.5px solid var(--border);background:white;
                 font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;
                 display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px">
          <span>☁️</span><span style="font-size:11.5px">서버 동기화</span>
        </button>
      </div>
    </div>

    <div class="ss-section-title" style="margin-top:14px">📊 현황 요약</div>
    <div class="ss-card">
      <div class="ss-card-row" onclick="openSubscreen('admin-users')" style="cursor:pointer">
        <div class="ss-card-icon">👥</div>
        <div class="ss-card-info"><div class="ss-card-title">전체 사용자</div><div class="ss-card-sub">${allUsers.length}명 등록됨</div></div>
        <span class="sm-arrow">›</span>
      </div>
      <div class="ss-card-row" onclick="document.getElementById('admin-church-section')?.scrollIntoView({behavior:'smooth'})" style="cursor:pointer">
        <div class="ss-card-icon">⛪</div>
        <div class="ss-card-info"><div class="ss-card-title">등록된 교회/기관</div><div class="ss-card-sub">${churches.length}개</div></div>
        <span class="sm-arrow">›</span>
      </div>
      <div class="ss-card-row">
        <div class="ss-card-icon">📋</div>
        <div class="ss-card-info"><div class="ss-card-title">교회 등록 대기</div><div class="ss-card-sub">관리자 승인 필요</div></div>
        <span class="ss-card-badge ${pendingChurch.length > 0 ? 'ss-badge-gold' : 'ss-badge-gray'}">${pendingChurch.length}</span>
      </div>
      <div class="ss-card-row">
        <div class="ss-card-icon">⏳</div>
        <div class="ss-card-info"><div class="ss-card-title">미성년자 승인 대기</div></div>
        <span class="ss-card-badge ${minorPending.length > 0 ? 'ss-badge-gold' : 'ss-badge-gray'}">${minorPending.length}</span>
      </div>
      <div class="ss-card-row">
        <div class="ss-card-icon">🤝</div>
        <div class="ss-card-info"><div class="ss-card-title">교회 가입 대기</div></div>
        <span class="ss-card-badge ${churchJoinPen.length > 0 ? 'ss-badge-gold' : 'ss-badge-gray'}">${churchJoinPen.length}</span>
      </div>
      <div class="ss-card-row">
        <div class="ss-card-icon">🟢</div>
        <div class="ss-card-info"><div class="ss-card-title">현재 접속자</div><div class="ss-card-sub">최근 30분 내 접속</div></div>
        <span class="ss-card-badge ss-badge-green">${onlineNow.length}</span>
      </div>
    </div>`;

  // ── 관리자 전용: 현재 소속 + 자유 이동 ──
  const allCustom  = DB.get('customChurches', {});
  const allCodes   = Object.keys(allCustom);
  const ALL_CHURCHES = { ...Object.fromEntries(Object.entries(OB_CHURCHES).map(([c, v]) =>
    [c, typeof v === 'string' ? v : v.name]
  )), ...Object.fromEntries(allCodes.map(c => {
    const d = allCustom[c]; return [c, typeof d === 'string' ? d : d.name];
  })) };
  const currentChurchName = me.church || '소속 없음';
  const currentCode       = me.churchCode || '—';

  html += `
    <div style="background:rgba(201,169,110,0.08);border:1.5px solid rgba(201,169,110,0.35);border-radius:14px;margin:0 16px 6px;padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:11.5px;font-weight:700;color:var(--gold)">🔑 관리자 현재 소속</span>
        <span style="font-size:11px;color:var(--muted);background:var(--cream2);border-radius:6px;padding:2px 8px;font-family:monospace">${escHtml(currentCode)}</span>
      </div>
      <div style="font-size:15px;font-weight:800;margin-bottom:12px">${escHtml(currentChurchName)}</div>
      <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px">빠른 이동</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${Object.entries(ALL_CHURCHES).map(([code, name]) => {
          const isCurrent = code === me.churchCode;
          const data = allCustom[code];
          const emoji = (typeof data === 'object' && data?.emoji) ? data.emoji : '⛪';
          return `<div onclick="${isCurrent ? '' : `adminSwitchChurch('${code}')`}"
            style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;
                   background:${isCurrent ? 'var(--black)' : 'white'};
                   border:1.5px solid ${isCurrent ? 'var(--black)' : 'var(--border)'};
                   cursor:${isCurrent ? 'default' : 'pointer'};transition:all 0.15s">
            <span style="font-size:20px">${emoji}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;color:${isCurrent ? 'white' : 'var(--dark)'}">${escHtml(name)}</div>
              <div style="font-size:11px;color:${isCurrent ? 'rgba(255,255,255,0.55)' : 'var(--muted)'};font-family:monospace">${escHtml(code)}</div>
            </div>
            ${isCurrent
              ? '<span style="font-size:11px;color:rgba(255,255,255,0.7);font-weight:700">현재</span>'
              : '<span style="font-size:16px;color:var(--muted)">›</span>'}
          </div>`;
        }).join('')}
        <div onclick="adminSwitchChurch('')"
          style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;
                 background:${!me.churchCode ? 'var(--black)' : 'white'};
                 border:1.5px solid ${!me.churchCode ? 'var(--black)' : 'var(--border)'};
                 cursor:${!me.churchCode ? 'default' : 'pointer'}">
          <span style="font-size:20px">👤</span>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:700;color:${!me.churchCode ? 'white' : 'var(--dark)'}">소속 없음 (개인)</div>
          </div>
          ${!me.churchCode
            ? '<span style="font-size:11px;color:rgba(255,255,255,0.7);font-weight:700">현재</span>'
            : '<span style="font-size:16px;color:var(--muted)">›</span>'}
        </div>
      </div>
    </div>`;

  // 교회 가입 대기
  if (churchJoinPen.length) {
    html += `<div class="ss-section-title">🕐 교회 가입 승인 대기 (${churchJoinPen.length}명)</div><div class="ss-card">`;
    churchJoinPen.forEach(u => {
      const isNF = u.registrationType === 'newfamily';
      const badge = isNF
        ? `<span style="font-size:11px;background:rgba(39,174,96,0.12);color:#27AE60;border-radius:6px;padding:1px 7px;font-weight:700">👋 새가족</span>`
        : `<span style="font-size:11px;background:rgba(52,152,219,0.12);color:#2980B9;border-radius:6px;padding:1px 7px;font-weight:700">📋 가입 신청</span>`;
      html += `<div style="padding:14px 16px;border-bottom:1px solid var(--border)">
        <div style="font-size:14px;font-weight:700;margin-bottom:2px">${escHtml(u.name)} ${badge}</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px">${escHtml(u.church||'—')} · ${escHtml(u.email||'')}</div>
        <div style="display:flex;gap:8px">
          <button onclick="approveChurchJoin('${u.id}')"
            style="flex:1;height:40px;border:none;border-radius:10px;background:var(--black);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">✅ ${isNF?'새가족 승인':'승인'}</button>
          <button onclick="rejectChurchJoin('${u.id}')"
            style="flex:1;height:40px;border:none;border-radius:10px;background:#FBE5E5;color:#C0392B;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">✕ 거절</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // 교회 등록 대기
  if (pendingChurch.length) {
    html += `<div class="ss-section-title">⛪ 교회 등록 승인 대기</div><div class="ss-card">`;
    pendingChurch.forEach(c => {
      html += `<div style="padding:14px 16px;border-bottom:1px solid var(--border)">
        <div style="font-size:15px;font-weight:800;letter-spacing:1px;margin-bottom:4px">${escHtml(c.name)}</div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">
          코드: <b>${escHtml(c.code)}</b> · 신청자: ${escHtml(c.requestedByName)} · ${(c.requestedAt||'').split('T')[0]}
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="approveChurchRegistration('${c.code}')"
            style="flex:1;height:42px;border:none;border-radius:10px;background:var(--black);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">✅ 등록 승인</button>
          <button onclick="rejectChurchRegistration('${c.code}')"
            style="flex:1;height:42px;border:none;border-radius:10px;background:#FBE5E5;color:#C0392B;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">✕ 거절</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // 미성년자 승인 대기
  if (minorPending.length) {
    html += `<div class="ss-section-title">🧒 미성년자 승인 대기</div><div class="ss-card">`;
    minorPending.forEach(u => {
      html += `<div style="padding:14px 16px;border-bottom:1px solid var(--border)">
        <div style="font-size:14px;font-weight:700;margin-bottom:4px">
          ${escHtml(u.name)}<span style="font-size:12px;color:var(--muted);font-weight:400"> · ${escHtml(u.church||'교회 미지정')}</span>
        </div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">
          보호자: ${escHtml(u.guardianName||'—')} / 📞 ${escHtml(u.guardianContact||'—')}
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="approveMinor('${u.id}')"
            style="flex:1;height:40px;border:none;border-radius:10px;background:var(--black);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">✅ 승인</button>
          <button onclick="rejectMinor('${u.id}')"
            style="flex:1;height:40px;border:none;border-radius:10px;background:#FBE5E5;color:#C0392B;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">✕ 거절</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── 교회/기관 관리 ──
  const customChurches = DB.get('customChurches', {});
  const churchCodes = Object.keys(customChurches);

  html += `<div id="admin-church-section" style="display:flex;justify-content:space-between;align-items:center;padding:0 16px;margin:16px 0 10px">
    <span style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px">⛪ 교회·기관 관리 (${churchCodes.length}개)</span>
    <button onclick="openCreateChurchModal()" style="height:30px;padding:0 14px;border-radius:20px;border:none;background:var(--black);color:white;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">+ 새로 만들기</button>
  </div>`;

  if (!churchCodes.length) {
    html += `<div style="margin:0 16px 16px;background:white;border-radius:14px;border:1.5px solid var(--border);padding:28px;text-align:center">
      <div style="font-size:36px;margin-bottom:10px">⛪</div>
      <div style="font-size:14px;font-weight:700;margin-bottom:6px">등록된 교회·기관이 없어요</div>
      <div style="font-size:12.5px;color:var(--muted)">위 버튼으로 첫 번째 교회를 만들어보세요!</div>
    </div>`;
  } else {
    html += `<div style="padding:0 16px;margin-bottom:16px">`;
    churchCodes.forEach(code => {
      const c     = customChurches[code];
      const data  = typeof c === 'string' ? { name: c, code, type: 'church', emoji: '⛪' } : (c || {});
      const emoji = data.emoji || (CHURCH_TYPES.find(t=>t.value===data.type)||CHURCH_TYPES[0]).emoji;
      const type  = (CHURCH_TYPES.find(t=>t.value===data.type)||CHURCH_TYPES[0]).label;
      const mCnt  = allUsers.filter(u => u.churchCode === code && u.churchStatus === 'active').length;
      const pCnt  = allUsers.filter(u => u.churchCode === code && u.churchStatus === 'pending').length;
      html += `
        <div style="background:white;border-radius:16px;border:1.5px solid var(--border);padding:16px;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">
            <div style="width:50px;height:50px;border-radius:14px;background:var(--cream2);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0">${emoji}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:15px;font-weight:800;margin-bottom:2px">${escHtml(data.name||code)}</div>
              <div style="font-size:11.5px;color:var(--muted)">${type}</div>
            </div>
            <span style="background:rgba(0,0,0,0.06);border-radius:7px;padding:3px 9px;font-size:11.5px;font-weight:700;font-family:monospace">${escHtml(code)}</span>
          </div>
          <div style="display:flex;gap:10px;font-size:12px;color:var(--muted);margin-bottom:12px;padding-left:4px">
            <span>👥 활성 ${mCnt}명</span>
            ${pCnt>0?`<span style="color:#E67E22">⏳ 대기 ${pCnt}명</span>`:''}
            ${data.leaderName?`<span>👤 ${escHtml(data.leaderName)}</span>`:''}
            ${data.address?`<span>📍 ${escHtml(data.address.slice(0,15)+(data.address.length>15?'…':''))}</span>`:''}
          </div>
          <div style="display:flex;gap:8px">
            <button onclick="openChurchManage('${code}')" style="flex:2;height:36px;border-radius:9px;border:none;background:var(--black);color:white;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">상세 보기</button>
            <button onclick="openEditChurchModal('${code}')" style="flex:1;height:36px;border-radius:9px;border:1.5px solid var(--border);background:white;color:var(--dark);font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">수정</button>
            <button onclick="deleteChurch('${code}')" style="height:36px;padding:0 12px;border-radius:9px;border:1.5px solid rgba(192,57,43,0.25);background:#FBE5E5;color:#C0392B;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">삭제</button>
          </div>
        </div>`;
    });
    html += `</div>`;
  }

  html += '</div>';
  return html;
}

function adminSwitchChurch(code) {
  if (!me.isAppAdmin) { toast('관리자 전용 기능이에요'); return; }

  const name = getChurchName(code) || '';

  // me 객체 업데이트
  me.church       = name;
  me.churchCode   = code;
  me.churchStatus = code ? 'active' : '';

  // localStorage 저장
  const users = DB.get('users', []);
  const u     = users.find(x => x.id === me.id);
  if (u) {
    u.church       = name;
    u.churchCode   = code;
    u.churchStatus = code ? 'active' : '';
    DB.set('users', users);
  }

  // Firestore 동기화
  if (window._fbReady && window._fb) {
    window._fb.updateUser(me.id, {
      church: name, churchCode: code, churchStatus: code ? 'active' : ''
    }).catch(() => {});
  }

  updateProfileDisplay();
  initSideMenu();

  const msg = code ? `✅ "${name}"(으)로 이동했어요!` : '👤 소속 없음으로 변경됐어요';
  toast(msg);

  // 관리자 패널 새로고침
  setTimeout(() => openSubscreen('admin-panel'), 200);
}

