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
  // 로컬 캐시(users)에서 딸려온 번호는 버리고 서버가 허용한 조회 결과만 쓴다 (교인 관리와 동일한 유출 차단)
  allUsers.forEach(u => { delete u.phone; });
  await ensureMemberPhones(allUsers);   // userPhones 조회 — 앱 관리자는 규칙상 전체 열람 가능
  _adminUsersData = allUsers;
  _membersCache   = allUsers;   // 승인/거절 핸들러 공유 캐시
  body.outerHTML = renderAdminUsersHtml(allUsers);
}

function filterAdminUsers(val) {
  _adminUserSearch = val;
  const body = document.getElementById('admin-users-body');
  if (body && _adminUsersData) body.outerHTML = renderAdminUsersHtml(_adminUsersData);
}

// 접속자 항목 → 그 기간 사용자만 보이는 명단 화면으로 진입 (전체 사용자 화면 재사용)
function openAdminUsersByPeriod(period) {
  _adminUsersPeriod = period || null;
  _adminUserSearch  = '';
  openSubscreen('admin-users');
}
// 기간별 lastActiveAt 하한 (ISO) — null 이면 필터 없음(전체 사용자)
function _adminPeriodCutoff(period) {
  const D = 864e5, now = Date.now();
  if (period === 'online') return new Date(now - 3 * 60 * 1000).toISOString();
  if (period === 'today')  { const t = new Date(); t.setHours(0,0,0,0); return t.toISOString(); }
  if (period === 'week')   return new Date(now -   7 * D).toISOString();
  if (period === 'month')  return new Date(now -  30 * D).toISOString();
  if (period === 'year')   return new Date(now - 365 * D).toISOString();
  return null;   // all / null → 필터 없음. (전체 기간은 아래에서 lastActiveAt 존재로 거름)
}
var _ADMIN_PERIOD_LABEL = { online:'현재 접속자', today:'오늘 접속', week:'최근 7일', month:'최근 30일', year:'최근 1년', all:'전체 기간 접속' };

// 리더 권한의 실제 근거는 role 이 아니라 leaderStatus 인데 목록에 안 보여서,
// 직분은 '담임목사' 인데 왜 권한이 없는지 화면만 봐서는 알 수 없었다.
function _leaderBadge(u) {
  if (!u.leaderStatus && !isLeaderRole(u.role)) return '';
  const m = {
    approved: ['리더 승인됨',   '#27AE60', 'rgba(39,174,96,0.12)'],
    pending:  ['리더 승인 대기', '#E67E22', 'rgba(243,156,18,0.10)'],
    rejected: ['리더 거절됨',   '#C0392B', 'rgba(231,76,60,0.10)']
  };
  const b = m[u.leaderStatus] || ['리더 미승인', '#C0392B', 'rgba(231,76,60,0.10)'];
  return `<span style="font-size:11.5px;background:${b[2]};color:${b[1]};
                       border-radius:6px;padding:2px 8px;font-weight:700">${b[0]}</span>`;
}

function renderAdminUsersHtml(allUsers) {
  // 접속 기간 필터 (접속자 항목에서 진입한 경우) — 먼저 기간으로 거르고, 그 안에서 검색
  const period = _adminUsersPeriod;
  let base = allUsers;
  if (period === 'all') {
    base = allUsers.filter(u => u.lastActiveAt);   // 접속 기록이 한 번이라도 있는 사용자
  } else if (period) {
    const cut = _adminPeriodCutoff(period);
    base = allUsers.filter(u => u.lastActiveAt && u.lastActiveAt >= cut);
  }
  // 최근 접속 순 정렬 (기간 필터 시 유용)
  if (period) base = [...base].sort((a, b) => (b.lastActiveAt || '').localeCompare(a.lastActiveAt || ''));

  const q = _adminUserSearch.toLowerCase();
  const filtered = q
    ? base.filter(u =>
        (u.name||'').toLowerCase().includes(q) ||
        (u.email||'').toLowerCase().includes(q) ||
        (u.church||'').toLowerCase().includes(q))
    : base;

  const STATUS_BADGE = {
    active:   ['#27AE60','rgba(39,174,96,0.1)','활성'],
    pending:  ['#E67E22','rgba(243,156,18,0.1)','대기'],
    rejected: ['#E74C3C','rgba(231,76,60,0.1)','거절'],
    disabled: ['var(--muted)','var(--cream2)','비활성'],
  };

  let html = `<div id="admin-users-body">
    ${period ? `<div style="margin:12px 16px 0;background:rgba(201,169,110,0.12);border:1.5px solid rgba(201,169,110,0.35);
                border-radius:10px;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span style="font-size:12.5px;font-weight:700;color:var(--dark)">🟢 ${_ADMIN_PERIOD_LABEL[period] || '접속'} · ${base.length}명</span>
      <button onclick="openAdminUsersByPeriod(null)"
        style="height:28px;padding:0 12px;border-radius:7px;border:1.5px solid var(--border);background:white;
               font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">전체 보기</button>
    </div>` : ''}
    <div style="padding:12px 16px;border-bottom:1px solid var(--border)">
      <input type="text" value="${escHtml(_adminUserSearch)}"
        oninput="filterAdminUsers(this.value)"
        placeholder="이름, 이메일, 교회 검색..."
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
              ${(u.phone && me && me.isAppAdmin) ? `<a href="tel:${escHtml(u.phone.replace(/[^0-9]/g,''))}"
                 style="display:inline-block;font-size:12px;color:#2980B9;font-weight:600;margin-top:3px;text-decoration:none">📞 ${escHtml(u.phone)}</a>` : ''}
            </div>
            <span style="font-size:11.5px;background:${st[1]};color:${st[0]};
                         border-radius:6px;padding:2px 8px;font-weight:700;flex-shrink:0">${st[2]}</span>
          </div>
          <!-- 교회/역할 -->
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            ${u.church?`<span style="font-size:11.5px;background:var(--cream2);border-radius:6px;padding:2px 8px;font-weight:600">${escHtml(u.church)}</span>`:''}
            ${u.role?`<span style="font-size:11.5px;background:var(--cream2);border-radius:6px;padding:2px 8px;font-weight:600">${escHtml(u.role)}</span>`:''}
            ${_leaderBadge(u)}
            ${cs==='pending'?`<span style="font-size:11.5px;background:rgba(243,156,18,0.1);color:#E67E22;border-radius:6px;padding:2px 8px;font-weight:700">교회 가입 대기</span>`:''}
          </div>
          <!-- 액션 버튼 -->
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${u.status==='pending'?`
              <button onclick="approveMinor('${u.id}')"
                style="flex:1;height:32px;border-radius:8px;border:none;background:var(--black);
                       color:white;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">승인</button>
              <button onclick="rejectMinor('${u.id}')"
                style="flex:1;height:32px;border-radius:8px;border:1.5px solid rgba(192,57,43,0.25);
                       background:#FBE5E5;color:#C0392B;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">거절</button>
            `:''}
            ${cs==='pending'?`
              <button onclick="approveChurchJoin('${u.id}')"
                style="flex:1;height:32px;border-radius:8px;border:none;background:var(--black);
                       color:white;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">교회 승인</button>
            `:''}
            <!-- 리더 승인 대기·기존 리더 목록은 leaderStatus 나 리더 직분이 있어야 잡힌다.
                 둘 다 없는 사람(직분이 성도인 개설자 등)은 어느 목록에도 안 떠서 관리자가
                 리더 권한을 줄 방법이 아예 없었다 → 모든 사용자 줄에서 직접 줄 수 있게 한다. -->
            ${u.leaderStatus === 'approved' ? `
              <button onclick="_setLeaderStatus('${u.id}','rejected','의 리더 권한을 해제했어요')"
                style="height:32px;padding:0 12px;border-radius:8px;border:1.5px solid var(--border);
                       background:white;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">리더 해제</button>
            ` : `
              <button onclick="approveLeader('${u.id}')"
                style="height:32px;padding:0 12px;border-radius:8px;border:1.5px solid rgba(201,169,110,0.5);
                       background:rgba(201,169,110,0.12);color:#8A6D3B;font-size:12px;font-weight:700;
                       cursor:pointer;font-family:inherit">리더 승인</button>
            `}
            <button onclick="adminToggleDisable('${u.id}')"
              style="height:32px;padding:0 12px;border-radius:8px;border:1.5px solid var(--border);
                     background:white;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">
              ${isDisabled?'활성화':'비활성화'}
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
  toast(u.status === 'disabled' ? `${u.name}님을 비활성화했어요` : `${u.name}님을 활성화했어요`);
  setTimeout(() => openSubscreen('admin-users'), 150);
}

async function adminDeleteUser(userId, name) {
  if (!confirm(`"${name}"님의 계정을 삭제할까요?\n\n· 앱 데이터(Firestore)는 바로 삭제되고, 이 사용자는 앱에서 자동 로그아웃돼요.\n  프로필·사진·전화번호·바인더·챌린지·매칭·예약까지 함께 지워져요.\n· 로그인 계정(Authentication)은 보안상 앱에서 지울 수 없어, Firebase 콘솔에서 직접 삭제해야 완전히 지워져요.\n\n이 작업은 되돌릴 수 없어요.`)) return;
  // 로컬/UI 제거는 Firestore 삭제 성공 후에만 (이전: 소프트 플래그만 남겨 새로고침 시 재등장)
  const removeLocal = () => {
    DB.set('users', DB.get('users', []).filter(u => u.id !== userId));
    _adminUsersData = (_adminUsersData || []).filter(u => u.id !== userId);
    _membersCache   = (_membersCache   || []).filter(u => u.id !== userId);
    toast('앱 데이터를 삭제했어요. 로그인 계정은 Firebase 콘솔 → Authentication 에서 삭제해 주세요');
    setTimeout(() => openSubscreen('admin-users'), 150);
  };
  if (window._fbReady && window._fb) {
    try {
      // 본인 탈퇴와 같은 정리 — users 문서만 지우면 사진·바인더·매칭이 주인 없는 잔해로 남는다.
      // (개별 실패는 _purgeUserData 안에서 로그만 남기고 넘어간다)
      await _purgeUserData(userId);
      await window._fb.deleteUserDoc(userId);
      removeLocal();
    } catch(e) {
      console.error('Firestore 계정 삭제 실패:', e);
      toast(`삭제에 실패했어요 (${e.code || e.message || e})`);
    }
  } else {
    removeLocal();   // 오프라인(로컬 모드) — 기존 동작 유지
  }
}

// adminSyncAllToFirestore 제거됨.
// 이 기기의 localStorage 스냅샷(sc2_users)을 전 사용자 문서에 setDoc(merge) 로 되쓰는 함수였다.
// 원본이 서버가 아니라 로컬 캐시라, 누르면 남이 폰에서 바꾼 직분·교회·승인 상태가 이 기기가
// 기억하는 옛 값으로 되돌아가고, merge 는 문서가 없으면 만들어내므로 삭제한 계정까지 부활했다.
// 서버가 진실이므로 로컬을 서버로 밀어 올리는 경로는 존재하면 안 된다.

function activateAdminCode() {
  const code = document.getElementById('admin-code-input')?.value.trim();
  if (code !== ADMIN_SECRET) { toast('올바르지 않은 코드예요 '); return; }
  const users = DB.get('users', []);
  const u = users.find(x => x.id === me.id);
  if (u) { u.isAppAdmin = true; DB.set('users', users); me.isAppAdmin = true; }
  initSideMenu();
  closeSubscreen();
  toast('앱 관리자 권한이 활성화됐어요! 사이드 메뉴를 확인해 주세요');
}

// 교회 등록 신청 목록 — 신청은 신청자의 users 문서(pendingChurchCode)에 남는다.
// 로컬 pendingChurches 는 신청한 그 기기에만 있어, 관리자가 다른 기기면 목록이 통째로 비어 있었다.
// 서버(users)를 기준으로 삼고 로컬은 오프라인·구버전 신청을 잃지 않도록 합치기만 한다.
var _pendingChurchCache = [];

function _collectPendingChurches(allUsers) {
  const byCode = {};
  DB.get('pendingChurches', []).forEach(c => { if (c && c.code) byCode[c.code] = c; });
  (allUsers || []).forEach(u => {
    if (!u || !u.pendingChurchCode) return;
    byCode[u.pendingChurchCode] = {
      code:            u.pendingChurchCode,
      name:            u.pendingChurchName || u.pendingChurchCode,
      requestedBy:     u.id,
      requestedByName: u.name || '',
      requestedByEmail:u.email || '',
      requestedAt:     u.pendingChurchAt || u.createdAt || '',
      orgType:         u.pendingChurchOrgType || u.orgType || 'church',
      // 개설자가 될 직분. pendingChurchRole 은 신청 때만 담기고 지금 직분을 덮지 않는다
      // — 이미 다른 교회 교인인 사람이 신청해도 그 교회에서의 직분은 그대로 둬야 한다.
      role:            u.pendingChurchRole || u.role || ''
    };
  });
  _pendingChurchCache = Object.values(byCode);
  return _pendingChurchCache;
}

function _findPendingChurch(code) {
  return (_pendingChurchCache || []).find(c => c.code === code)
      || DB.get('pendingChurches', []).find(c => c.code === code);
}

// 승인/거절 후 로컬·캐시 양쪽에서 신청을 지운다(목록 재조회 전까지 남아 보이지 않도록).
function _dropPendingChurch(code) {
  DB.set('pendingChurches', DB.get('pendingChurches', []).filter(c => c.code !== code));
  _pendingChurchCache = (_pendingChurchCache || []).filter(c => c.code !== code);
}

// 신청자 문서(users)를 고치는 게 승인의 본체다. 예전에는 그 쓰기를 기다리지 않고 먼저
// 대기 목록에서 지우고 "승인했어요" 를 띄웠다 — 서버가 거부해도 화면은 성공처럼 보였고,
// 목록을 다시 읽으면 서버에 남아 있던 신청이 되살아났다("이미 등록됐는데 또 떠 있어요").
// 신청은 신청자 users 문서에 남으므로, 그 문서가 안 바뀌면 승인은 일어나지 않은 것이다.
async function approveChurchRegistration(code) {
  const entry = _findPendingChurch(code);
  if (!entry) { toast('신청 정보를 찾을 수 없어요. 목록을 새로고침해 주세요'); return; }
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
  const users = DB.get('users', []);
  const u = users.find(x => x.id === entry.requestedBy);
  // 등록을 승인한다는 건 이 사람을 그 공동체의 리더로 세운다는 뜻이다. 직분 이름이 리더로
  // 인식될 때만 권한을 주다 보니, 직분이 비어 오면(로컬 신청 항목에 role 이 없던 경우)
  // 리더가 한 명도 없는 공동체가 만들어졌다 — 가입 승인도 관리도 아무도 못 한다.
  // 그래서 직분 이름과 무관하게 개설자에게 권한을 준다. 직분이 리더 이름이 아니면
  // 유형에 맞는 리더 직분으로 채운다(권한과 화면 표시가 어긋나지 않게).
  const orgType      = entry.orgType || 'church';
  const rawRole      = entry.role || (u && u.role) || '';
  const foundersRole = isLeaderRole(rawRole) ? rawRole : (orgType === 'org' ? '기관장' : '담임목사');
  const grantsLeader = true;
  if (u) {
    u.church = entry.name; u.churchCode = code; u.churchStatus = 'active';
    u.pendingChurchCode = null; u.pendingChurchName = null; u.pendingChurchAt = null;
    u.pendingChurchRole = null; u.pendingChurchOrgType = null;
    u.orgType = entry.orgType || 'church';
    // 승인된 지금에서야 개설자 직분을 붙인다 (신청 때 붙이면 원래 교회에서 담임목사로 보인다)
    if (grantsLeader) { u.leaderStatus = 'approved'; u.role = foundersRole; }
    DB.set('users', users);
  }
  // Firestore 동기화: 교회 정보 + 신청자 상태(다른 기기에도 반영)
  if (window._fbReady && window._fb) {
    window._fb.setChurchInfo(code, custom[code]).catch(() => {});
    const update = {
      church: entry.name, churchCode: code, churchStatus: 'active',
      pendingChurchCode: null, pendingChurchName: null, pendingChurchAt: null,
      pendingChurchRole: null, pendingChurchOrgType: null, orgType: entry.orgType || 'church'
    };
    if (grantsLeader) { update.leaderStatus = 'approved'; update.role = foundersRole; }
    // 이 쓰기가 승인의 본체다 — 반드시 기다린다. 실패하면 신청을 그대로 두고 알린다.
    // 여기서 지워 버리면 화면에서만 사라지고 서버에는 남아, 다시 불러올 때 되살아난다.
    try {
      await window._fb.updateUser(entry.requestedBy, update);
    } catch (e) {
      if (window._fbErr) window._fbErr('교회 등록 승인', e);
      toast(`승인 실패 (${e.code || e.message || e}) — 신청은 그대로 뒀어요`);
      return;
    }
    // 공동체별 리더 명부에도 세운다(4단계) — 이게 있어야 개설자가 다른 공동체에 다녀와도
    // 자기 공동체의 리더로 남는다. users 쪽 권한은 옮길 때 비워지기 때문이다.
    if (typeof saveChurchLeader === 'function')
      saveChurchLeader(entry.requestedBy, entry.requestedByName || (u && u.name) || '', code, true, [])
        .catch(() => {});
  }
  _dropPendingChurch(code);   // 서버가 받아준 뒤에야 대기 목록에서 뺀다
  // 캐시가 옛 users 를 들고 있으면 방금 승인한 신청이 다시 그려진다 — 다음 렌더에서 새로 읽게 한다
  _adminUsersData = null;
  toast(`"${entry.name}" [${code}] 교회 등록을 승인했어요!`);
  setTimeout(() => openSubscreen('admin-panel'), 150);
}

// 승인과 같은 이유로 서버 쓰기를 기다린다 — 먼저 지우면 화면에서만 사라지고 되살아난다.
async function rejectChurchRegistration(code) {
  const entry = _findPendingChurch(code);
  if (!entry) { toast('신청 정보를 찾을 수 없어요. 목록을 새로고침해 주세요'); return; }
  if (!confirm(`"${entry.name}" [${code}] 등록 신청을 거절할까요?\n\n신청자는 교회 없는 상태로 돌아가고, 다시 신청할 수 있어요.`)) return;
  // 신청자 계정 초기화
  const users = DB.get('users', []);
  const u = users.find(x => x.id === entry.requestedBy);
  if (u) {
    u.churchStatus      = null;
    u.pendingChurchCode = null;
    u.pendingChurchName = null;
    u.pendingChurchAt   = null;
    DB.set('users', users);
  }
  // Firestore 동기화: 신청자 상태 초기화(다른 기기에도 반영)
  if (window._fbReady && window._fb) {
    try {
      await window._fb.updateUser(entry.requestedBy, {
        churchStatus: null, pendingChurchCode: null, pendingChurchName: null, pendingChurchAt: null
      });
    } catch (e) {
      if (window._fbErr) window._fbErr('교회 등록 거절', e);
      toast(`거절 실패 (${e.code || e.message || e}) — 신청은 그대로 뒀어요`);
      return;
    }
  }
  _dropPendingChurch(code);
  _adminUsersData = null;   // 캐시의 옛 users 로 신청이 다시 그려지지 않게
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
  // 패널의 액션 핸들러(일괄 승인 등)도 이 목록을 봐야 한다. 예전에는 _adminUsersData 가
  // '전체 사용자' 화면을 열 때만 채워져서, 패널만 열고 일괄 승인을 누르면 서버 목록 대신
  // 이 기기의 로컬 캐시를 뒤졌다 — 다른 기기에서 가입한 리더는 대상에서 통째로 빠지고
  // 화면에는 '1명', 버튼은 '계정이 없어요' 라 서로 다른 말을 했다.
  _adminUsersData = allUsers;

  // 보호자 번호는 userPhones 에 있다. 승인 판단에 필요한 건 대기 중인 미성년자뿐이라
  // 전체 사용자에게 1건씩 조회를 돌리지 않는다(사용자 수만큼 읽기가 발생한다).
  const pendingMinors = allUsers.filter(u => u.status === 'pending');
  await migrateGuardianContacts(pendingMinors);
  await ensureMemberPhones(pendingMinors);

  body.outerHTML = renderAdminPanelHtml(allUsers);
}

// 예전 가입자는 보호자 번호가 users 문서에 남아 있다 — 규칙상 로그인한 모든 교인이 읽는 위치다.
// 관리자가 패널을 열 때 userPhones 로 옮기고 원본 값을 지운다(이 쓰기는 규칙상 관리자만 가능).
// 옮긴 뒤 지우는 순서라 중간에 실패해도 번호가 사라지지는 않는다.
async function migrateGuardianContacts(users) {
  if (!me || !me.isAppAdmin || !window._fbReady || !window._fb) return;
  const legacy = (users || []).filter(u => u && u.id && u.guardianContact);
  if (!legacy.length) return;
  await Promise.all(legacy.map(async u => {
    try {
      await window._fb.setUserPhone(u.id, null, u.guardianContact);
      await window._fb.updateUser(u.id, { guardianContact: null });
      u.guardianPhone = u.guardianContact;
      delete u.guardianContact;
    } catch (e) { console.warn('보호자 번호 이전 실패:', u.id, e); }
  }));
}

// 관리자 패널 안의 섹션으로 스크롤.
// scrollIntoView 는 대상을 화면 맨 위로 올리려다 스크롤 끝을 넘어서, 아래가 배경(검정)으로 남았다.
// 컨테이너 최대 스크롤량으로 잘라 그 현상을 막는다.
// 대기 0건이면 섹션 자체가 렌더되지 않으므로, 눌러도 반응 없어 보이지 않게 안내를 띄운다.
function scrollToAdminSection(sectionId, emptyMsg) {
  const el = document.getElementById(sectionId);
  if (!el) { if (emptyMsg) toast(emptyMsg); return; }
  const box = el.closest('.subscreen-body') || document.getElementById('subscreen-body');
  if (!box) { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
  const max = Math.max(0, box.scrollHeight - box.clientHeight);
  box.scrollTo({ top: Math.min(el.offsetTop - 12, max), behavior: 'smooth' });
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

// ── 리더 권한 승인/거절 (앱 관리자 전용) ──
// 직분(role)은 본인이 자기 문서에 쓸 수 있으므로 권한의 근거가 될 수 없다.
// leaderStatus 만 권한의 근거이고, 'approved' 는 여기서만 만들어진다.
function _setLeaderStatus(userId, status, msg) {
  if (!me || !me.isAppAdmin) { toast('권한이 없어요'); return; }
  const users = DB.get('users', []);
  const local = users.find(x => x.id === userId);
  const known = local || (_adminUsersData || []).find(x => x.id === userId);
  if (local) { local.leaderStatus = status; DB.set('users', users); }
  if (known) known.leaderStatus = status;   // 관리자 목록 캐시도 함께 (재조회 없이 반영)
  if (window._fbReady && window._fb) {
    window._fb.updateUser(userId, { leaderStatus: status })
      .catch(() => toast('서버 반영 실패 — 잠시 후 다시 시도해 주세요'));
  }
  toast(`${(known && known.name) || '회원'}님 ${msg}`);
  setTimeout(() => openSubscreen('admin-panel'), 150);
}

function approveLeader(userId) { _setLeaderStatus(userId, 'approved', '에게 리더 권한을 부여했어요'); }

function rejectLeader(userId) {
  if (!confirm('리더 권한 신청을 거절할까요?\n\n계정은 그대로 두고 리더 권한만 주지 않아요. 나중에 다시 승인할 수 있어요.')) return;
  _setLeaderStatus(userId, 'rejected', '의 리더 권한 신청을 거절했어요');
}

// 기능 도입 전부터 리더로 활동하던 계정을 한 번에 승인 처리한다.
// 이걸 누르기 전까지는 isLeaderApproved 의 가입일 유예가 그들을 지탱하고 있고,
// 보안 규칙에는 그 유예가 없으므로 규칙을 붙여넣기 전에 반드시 눌러야 한다.
async function backfillExistingLeaders() {
  if (!me || !me.isAppAdmin) { toast('권한이 없어요'); return; }
  const targets = (_adminUsersData || DB.get('users', []))
    .filter(u => !u.leaderStatus && isLeaderRole(u.role));
  if (!targets.length) { toast('일괄 승인할 계정이 없어요'); return; }
  if (!confirm(`리더 직분인데 승인 기록이 없는 계정 ${targets.length}명을 모두 승인 처리할까요?\n\n지금 활동 중인 리더들이 권한을 잃지 않게 하려면 보안 규칙을 바꾸기 전에 눌러야 해요.`)) return;
  let done = 0, failed = 0;
  for (const u of targets) {
    try {
      if (window._fbReady && window._fb) await window._fb.updateUser(u.id, { leaderStatus: 'approved' });
      u.leaderStatus = 'approved';
      done++;
    } catch (e) { failed++; console.warn('리더 일괄 승인 실패:', u.id, e); }
  }
  // 실제로 서버에 써진 계정만 로컬에도 반영한다. 예전에는 조건이 맞는 계정을 전부 승인으로
  // 표시해서, 서버 쓰기가 실패한 사람도 '기존 리더 정리' 목록에서 사라졌다 — 관리자 화면에는
  // 아무 문제가 없어 보이는데 서버는 계속 거부하니 원인을 찾을 길이 없었다.
  const okIds = new Set(targets.filter(u => u.leaderStatus === 'approved').map(u => u.id));
  const users = DB.get('users', []);
  users.forEach(u => { if (okIds.has(u.id)) u.leaderStatus = 'approved'; });
  DB.set('users', users);
  toast(failed ? `${done}명 승인, ${failed}명 실패 — 다시 눌러 주세요` : `${done}명을 리더로 승인했어요`);
  setTimeout(() => openSubscreen('admin-panel'), 300);
}

// 앱에 존재하는 모든 교회/기관 — 기본 제공(OB_CHURCHES) + 등록분(customChurches) + 교인 소속.
// 한 곳에서만 만든다. 관리자 패널이 이걸 세 군데서 제각각 계산해 서로 다른 목록을 보여줬다:
//  - 교회·기관 관리는 OB_CHURCHES 를 안 봐서, 교인이 아직 없는 기본 교회(스마트처치)가 통째로 빠졌다.
//  - 교인 소속에서 만든 항목은 유형을 몰라 전부 '교회' 로 표시됐다(기관인 AK 훈련센터가 교회로 나온 원인).
function _allChurchMap(allUsers) {
  const map = {};
  Object.entries(typeof OB_CHURCHES === 'object' ? OB_CHURCHES : {}).forEach(([code, v]) => {
    map[code] = typeof v === 'string' ? { name: v, code, type: 'church' } : { ...v, code };
  });
  Object.entries(DB.get('customChurches', {})).forEach(([code, v]) => {
    const d = typeof v === 'string' ? { name: v } : (v || {});
    map[code] = { ...(map[code] || {}), ...d, code };   // 등록·수정한 정보가 기본값을 덮는다
  });
  (allUsers || []).forEach(u => {
    if (!u.churchCode || map[u.churchCode]) return;
    map[u.churchCode] = { name: u.church || u.churchCode, code: u.churchCode };
  });
  return map;
}

function renderAdminPanelHtml(allUsers) {
  const pendingChurch = _collectPendingChurches(allUsers);
  const minorPending  = allUsers.filter(u => u.status === 'pending');
  const leaderPending = allUsers.filter(u => u.leaderStatus === 'pending');
  // 리더 직분인데 승인 기록이 아예 없는 계정 = 기능 도입 전부터 활동하던 리더 (일괄 승인 대상)
  const leaderLegacy  = allUsers.filter(u => !u.leaderStatus && isLeaderRole(u.role));
  const churchJoinPen = allUsers.filter(u => u.status !== 'pending' && u.churchStatus === 'pending');
  const active        = allUsers.filter(u => u.status === 'active' || !u.status);
  // 접속 기준 3분 — 앱이 60초마다 lastActiveAt 을 갱신하므로 한 번 놓쳐도 접속 중으로 유지
  const onlineCutoff  = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const onlineNow     = allUsers.filter(u => u.lastActiveAt && u.lastActiveAt > onlineCutoff)
                                .sort((a, b) => (b.lastActiveAt || '').localeCompare(a.lastActiveAt || ''));
  // 기간별 접속자 수 — lastActiveAt(마지막 사용 시각)이 각 기간 안에 드는 사용자 (기간 내 활성 사용자)
  const _todayStart = new Date(); _todayStart.setHours(0, 0, 0, 0);
  const activeSince  = ms => allUsers.filter(u => u.lastActiveAt && u.lastActiveAt >= ms).length;
  const cntToday = allUsers.filter(u => u.lastActiveAt && u.lastActiveAt >= _todayStart.toISOString()).length;
  const cntWeek  = activeSince(new Date(Date.now() -   7 * 864e5).toISOString());
  const cntMonth = activeSince(new Date(Date.now() -  30 * 864e5).toISOString());
  const cntYear  = activeSince(new Date(Date.now() - 365 * 864e5).toISOString());
  const cntAll   = allUsers.filter(u => u.lastActiveAt).length;   // 전체 기간 — 접속 기록이 한 번이라도 있는 사용자(옛 기록 포함)
  const churchMap     = _allChurchMap(allUsers);
  const churchCodes   = Object.keys(churchMap);

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
      <div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px;margin-bottom:8px">퀵 액션</div>
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
      </div>
    </div>

    <div class="ss-section-title" style="margin-top:14px">현황 요약</div>
    <div class="ss-card">
      <div class="ss-card-row" onclick="openAdminUsersByPeriod(null)" style="cursor:pointer">
        <div class="ss-card-icon">👥</div>
        <div class="ss-card-info"><div class="ss-card-title">전체 사용자</div><div class="ss-card-sub">${allUsers.length}명 등록됨</div></div>
        <span class="sm-arrow">›</span>
      </div>
      <div class="ss-card-row" onclick="scrollToAdminSection('admin-church-section')" style="cursor:pointer">
        <div class="ss-card-icon">⛪</div>
        <div class="ss-card-info"><div class="ss-card-title">등록된 교회/기관</div><div class="ss-card-sub">${churchCodes.length}개</div></div>
        <span class="sm-arrow">›</span>
      </div>
      <div class="ss-card-row" onclick="scrollToAdminSection('admin-church-pending-section','대기 중인 교회 등록 신청이 없어요')" style="cursor:pointer">
        <div class="ss-card-icon">📋</div>
        <div class="ss-card-info"><div class="ss-card-title">교회 등록 대기</div><div class="ss-card-sub">눌러서 승인/거절</div></div>
        <span class="ss-card-badge ${pendingChurch.length > 0 ? 'ss-badge-gold' : 'ss-badge-gray'}">${pendingChurch.length}</span><span class="sm-arrow">›</span>
      </div>
      <div class="ss-card-row" onclick="scrollToAdminSection('admin-minor-section','대기 중인 미성년자 가입 신청이 없어요')" style="cursor:pointer">
        <div class="ss-card-icon">⏳</div>
        <div class="ss-card-info"><div class="ss-card-title">미성년자 승인 대기</div><div class="ss-card-sub">눌러서 승인/거절</div></div>
        <span class="ss-card-badge ${minorPending.length > 0 ? 'ss-badge-gold' : 'ss-badge-gray'}">${minorPending.length}</span><span class="sm-arrow">›</span>
      </div>
      <div class="ss-card-row" onclick="scrollToAdminSection('admin-leader-section','대기 중인 리더 권한 신청이 없어요')" style="cursor:pointer">
        <div class="ss-card-icon">🔑</div>
        <div class="ss-card-info"><div class="ss-card-title">리더 권한 대기</div><div class="ss-card-sub">눌러서 승인/거절</div></div>
        <span class="ss-card-badge ${leaderPending.length > 0 ? 'ss-badge-gold' : 'ss-badge-gray'}">${leaderPending.length}</span><span class="sm-arrow">›</span>
      </div>
      <div class="ss-card-row">
        <div class="ss-card-icon">🤝</div>
        <div class="ss-card-info"><div class="ss-card-title">교회 가입 대기</div></div>
        <span class="ss-card-badge ${churchJoinPen.length > 0 ? 'ss-badge-gold' : 'ss-badge-gray'}">${churchJoinPen.length}</span>
      </div>
    </div>

    <div class="ss-section-title" style="margin-top:14px">접속자</div>
    <div class="ss-card">
      <div class="ss-card-row" onclick="openAdminUsersByPeriod('online')" style="cursor:pointer">
        <div class="ss-card-icon">🟢</div>
        <div class="ss-card-info"><div class="ss-card-title">현재 접속자</div><div class="ss-card-sub">최근 3분 내 접속 · 눌러서 명단</div></div>
        <span class="ss-card-badge ss-badge-green">${onlineNow.length}</span><span class="sm-arrow">›</span>
      </div>
      <div class="ss-card-row" onclick="openAdminUsersByPeriod('today')" style="cursor:pointer">
        <div class="ss-card-icon">📅</div>
        <div class="ss-card-info"><div class="ss-card-title">오늘 접속</div><div class="ss-card-sub">오늘 0시 이후 접속</div></div>
        <span class="ss-card-badge ss-badge-gray">${cntToday}</span><span class="sm-arrow">›</span>
      </div>
      <div class="ss-card-row" onclick="openAdminUsersByPeriod('week')" style="cursor:pointer">
        <div class="ss-card-icon">🗓️</div>
        <div class="ss-card-info"><div class="ss-card-title">최근 7일</div><div class="ss-card-sub">일주일 내 접속</div></div>
        <span class="ss-card-badge ss-badge-gray">${cntWeek}</span><span class="sm-arrow">›</span>
      </div>
      <div class="ss-card-row" onclick="openAdminUsersByPeriod('month')" style="cursor:pointer">
        <div class="ss-card-icon">📆</div>
        <div class="ss-card-info"><div class="ss-card-title">최근 30일</div><div class="ss-card-sub">한 달 내 접속</div></div>
        <span class="ss-card-badge ss-badge-gray">${cntMonth}</span><span class="sm-arrow">›</span>
      </div>
      <div class="ss-card-row" onclick="openAdminUsersByPeriod('year')" style="cursor:pointer">
        <div class="ss-card-icon">📈</div>
        <div class="ss-card-info"><div class="ss-card-title">최근 1년</div><div class="ss-card-sub">1년 내 접속</div></div>
        <span class="ss-card-badge ss-badge-gray">${cntYear}</span><span class="sm-arrow">›</span>
      </div>
      <div class="ss-card-row" onclick="openAdminUsersByPeriod('all')" style="cursor:pointer">
        <div class="ss-card-icon">🗄️</div>
        <div class="ss-card-info"><div class="ss-card-title">전체 기간</div><div class="ss-card-sub">접속 기록이 있는 누적 사용자</div></div>
        <span class="ss-card-badge ss-badge-gold">${cntAll}</span><span class="sm-arrow">›</span>
      </div>
    </div>`;

  // ── 관리자 전용: 현재 소속 + 자유 이동 ──
  const ALL_CHURCHES = Object.fromEntries(churchCodes.map(c => [c, churchMap[c].name || c]));
  const currentChurchName = me.church || '소속 없음';
  const currentCode       = me.churchCode || '—';

  html += `
    <div style="background:rgba(201,169,110,0.08);border:1.5px solid rgba(201,169,110,0.35);border-radius:14px;margin:0 16px 6px;padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:11.5px;font-weight:700;color:var(--gold)">관리자 현재 소속</span>
        <span style="font-size:11px;color:var(--muted);background:var(--cream2);border-radius:6px;padding:2px 8px;font-family:monospace">${escHtml(currentCode)}</span>
      </div>
      <div style="font-size:15px;font-weight:800;margin-bottom:12px">${escHtml(currentChurchName)}</div>
      <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px">빠른 이동</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${Object.entries(ALL_CHURCHES).map(([code, name]) => {
          const isCurrent = code === me.churchCode;
          const data  = churchMap[code] || {};
          const emoji = data.emoji || (CHURCH_TYPES.find(t => t.value === data.type) || CHURCH_TYPES[0]).emoji;
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
    html += `<div class="ss-section-title">교회 가입 승인 대기 (${churchJoinPen.length}명)</div><div class="ss-card">`;
    churchJoinPen.forEach(u => {
      const isNF = u.registrationType === 'newfamily';
      const badge = isNF
        ? `<span style="font-size:11px;background:rgba(39,174,96,0.12);color:#27AE60;border-radius:6px;padding:1px 7px;font-weight:700">새가족</span>`
        : `<span style="font-size:11px;background:rgba(52,152,219,0.12);color:#2980B9;border-radius:6px;padding:1px 7px;font-weight:700">가입 신청</span>`;
      html += `<div style="padding:14px 16px;border-bottom:1px solid var(--border)">
        <div style="font-size:14px;font-weight:700;margin-bottom:2px">${escHtml(u.name)} ${badge}</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px">${escHtml(u.church||'—')} · ${escHtml(u.email||'')}</div>
        <div style="display:flex;gap:8px">
          <button onclick="approveChurchJoin('${u.id}')"
            style="flex:1;height:40px;border:none;border-radius:10px;background:var(--black);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">${isNF?'새가족 승인':'승인'}</button>
          <button onclick="rejectChurchJoin('${u.id}')"
            style="flex:1;height:40px;border:none;border-radius:10px;background:#FBE5E5;color:#C0392B;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">거절</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // 교회 등록 대기
  if (pendingChurch.length) {
    html += `<div class="ss-section-title" id="admin-church-pending-section">교회 등록 승인 대기</div><div class="ss-card">`;
    pendingChurch.forEach(c => {
      const typeLabel = (CHURCH_TYPES.find(t => t.value === (c.orgType||'church')) || CHURCH_TYPES[0]);
      html += `<div style="padding:14px 16px;border-bottom:1px solid var(--border)">
        <div style="font-size:15px;font-weight:800;letter-spacing:1px;margin-bottom:4px">
          ${typeLabel.emoji||'⛪'} ${escHtml(c.name)}
        </div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">
          코드: <b>${escHtml(c.code)}</b> · 신청자: ${escHtml(c.requestedByName||'—')}${c.requestedByEmail?' ('+escHtml(c.requestedByEmail)+')':''} · ${(c.requestedAt||'').split('T')[0]}
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="approveChurchRegistration('${c.code}')"
            style="flex:1;height:42px;border:none;border-radius:10px;background:var(--black);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">등록 승인</button>
          <button onclick="rejectChurchRegistration('${c.code}')"
            style="flex:1;height:42px;border:none;border-radius:10px;background:#FBE5E5;color:#C0392B;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">거절</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // 미성년자 승인 대기 — 가입 직후 교회를 아직 못 고른 상태라 교회 리더에게는 안 보인다(운영팀이 처리).
  if (minorPending.length) {
    html += `<div class="ss-section-title" id="admin-minor-section">미성년자 승인 대기</div><div class="ss-card">`;
    minorPending.forEach(u => {
      const gRaw   = u.guardianPhone || u.guardianContact || '';   // 이전 전 계정은 users 에 남아 있다
      const gPhone = gRaw.replace(/[^0-9]/g, '');
      html += `<div style="padding:14px 16px;border-bottom:1px solid var(--border)">
        <div style="font-size:14px;font-weight:700;margin-bottom:4px">
          ${escHtml(u.name)}<span style="font-size:12px;color:var(--muted);font-weight:400"> · ${escHtml(u.church||'교회 미지정')}</span>
        </div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:4px">
          ${escHtml(u.email||'')}${u.birthdate ? ' · ' + escHtml(u.birthdate) : ''} · 신청 ${(u.createdAt||'').split('T')[0]}
        </div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">
          보호자: ${escHtml(u.guardianName||'—')} /
          ${gPhone ? `<a href="tel:${gPhone}" style="color:#2980B9;font-weight:600;text-decoration:none">📞 ${escHtml(gRaw)}</a>`
                   : '—'}
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="approveMinor('${u.id}')"
            style="flex:1;height:40px;border:none;border-radius:10px;background:var(--black);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">승인</button>
          <button onclick="rejectMinor('${u.id}')"
            style="flex:1;height:40px;border:none;border-radius:10px;background:#FBE5E5;color:#C0392B;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">거절</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // 리더 권한 승인 대기 — 직분만으로는 권한이 붙지 않고 여기서 승인해야 붙는다
  if (leaderPending.length) {
    html += `<div class="ss-section-title" id="admin-leader-section">리더 권한 승인 대기 (${leaderPending.length}명)</div><div class="ss-card">`;
    leaderPending.forEach(u => {
      html += `<div style="padding:14px 16px;border-bottom:1px solid var(--border)">
        <div style="font-size:14px;font-weight:700;margin-bottom:2px">
          ${escHtml(u.name || '이름 없음')}
          <span style="font-size:11px;background:rgba(201,169,110,0.15);color:var(--gold);border-radius:6px;padding:1px 7px;font-weight:700;margin-left:4px">${escHtml(u.role || '—')}</span>
        </div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">
          ${escHtml(u.church || '교회 미지정')}${u.churchCode ? ' · ' + escHtml(u.churchCode) : ''} · ${escHtml(u.email || '')}
          ${u.createdAt ? ' · 가입 ' + escHtml(String(u.createdAt).split('T')[0]) : ''}
        </div>
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:10px;line-height:1.5">
          승인하면 교인 관리·전화번호 열람·공지 등 리더 기능이 열려요. 본인이 맞는지 확인 후 승인해 주세요.
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="approveLeader('${u.id}')"
            style="flex:1;height:40px;border:none;border-radius:10px;background:var(--black);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">리더 승인</button>
          <button onclick="rejectLeader('${u.id}')"
            style="flex:1;height:40px;border:none;border-radius:10px;background:#FBE5E5;color:#C0392B;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">거절</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // 기존 리더 일괄 승인 — 보안 규칙을 바꾸기 전에 눌러야 지금 활동 중인 리더가 권한을 잃지 않는다
  if (leaderLegacy.length) {
    html += `<div class="ss-section-title" style="margin-top:14px">기존 리더 정리</div>
      <div style="margin:0 16px;background:rgba(201,169,110,0.08);border:1.5px solid rgba(201,169,110,0.35);border-radius:14px;padding:14px">
        <div style="font-size:13px;font-weight:700;margin-bottom:6px">승인 기록이 없는 리더 ${leaderLegacy.length}명</div>
        <div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:10px">
          리더 승인 기능이 생기기 전부터 활동하던 계정이에요. 지금은 가입일 기준으로 권한이 유지되고 있어요.
          보안 규칙을 바꾸기 전에 한 번 눌러 정리해 주세요.
        </div>
        <button onclick="backfillExistingLeaders()"
          style="width:100%;height:42px;border:none;border-radius:10px;background:var(--black);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
          ${leaderLegacy.length}명 일괄 승인
        </button>
      </div>`;
  }

  // ── 계정 전환 (관리자 패널 전용) ──
  // 이 기기에서 로그인한 적 있는 계정 목록. 비밀번호는 저장하지 않으므로 전환 시 한 번 입력해야 한다.
  // recentAccounts 는 로그인 폼(doLogin)을 거칠 때만 쌓인다. 세션이 유지된 채 들어오면
  // 목록이 비어 섹션이 쓸모없어 보였다 → 이메일 직접 입력 항목을 항상 둔다.
  const recentAccts = DB.get('recentAccounts', []).filter(a => a && a.email && a.email !== me.email);
  // 슬롯마다 Firebase 세션이 따로 살아 있다 — 한 번 로그인해 둔 슬롯은 비밀번호 없이 오간다.
  // 비밀번호는 저장하지 않는다(아래 '이메일로 전환' 이 여전히 비밀번호를 묻는 이유다).
  const curSlot = typeof currentAuthSlot === 'function' ? currentAuthSlot() : '';
  html += `<div class="ss-section-title" style="margin-top:14px">계정 슬롯 <span style="font-weight:600;color:var(--muted)">· 비밀번호 없이 전환</span></div>`
    + `<div class="ss-card">`
    + AUTH_SLOTS.map(s => {
        const info  = getAuthSlotInfo(s);
        const isCur = s === curSlot;
        const safe  = String(s).replace(/[^A-Za-z0-9_-]/g, '');
        const title = info ? escHtml(info.name || info.email) : '비어 있음';
        const sub   = info ? escHtml(info.email) : '눌러서 이 슬롯에 로그인하세요';
        return `<div class="ss-card-row" ${isCur ? '' : `onclick="switchAuthSlot('${safe}')"`}
            style="cursor:${isCur ? 'default' : 'pointer'};${isCur ? 'background:rgba(201,169,110,0.10)' : ''}">
          <div class="ss-card-icon">${info ? '👤' : '➕'}</div>
          <div class="ss-card-info">
            <div class="ss-card-title">${title}</div>
            <div class="ss-card-sub">${escHtml(authSlotLabel(s))} · ${sub}</div>
          </div>
          ${isCur ? '<span style="font-size:11px;font-weight:700;color:var(--gold)">현재</span>'
                  : '<span class="sm-arrow">›</span>'}
        </div>`;
      }).join('')
    + `<div style="padding:10px 14px 14px;font-size:12px;color:var(--muted);line-height:1.6">
         한 번 로그인해 둔 슬롯은 비밀번호 없이 오갈 수 있어요.<br>
         비밀번호는 저장하지 않아요 — 기기를 잃어도 계정이 열리지 않게요.
       </div></div>`;

  html += `<div class="ss-section-title" style="margin-top:14px">이메일로 전환 <span style="font-weight:600;color:var(--muted)">· 비밀번호 필요</span></div><div class="ss-card">`
    + recentAccts.map(a => `
      <div class="ss-card-row" onclick="switchAccount('${escHtml(a.email).replace(/'/g, "\\'")}')" style="cursor:pointer">
        <div class="ss-card-icon">🔄</div>
        <div class="ss-card-info">
          <div class="ss-card-title">${escHtml(a.name || a.email)}</div>
          <div class="ss-card-sub">${escHtml(a.email)}${a.role ? ' · ' + escHtml(a.role) : ''}</div>
        </div>
        <span class="sm-arrow">›</span>
      </div>`).join('')
    + `<div class="ss-card-row" onclick="switchAccountPrompt()" style="cursor:pointer">
        <div class="ss-card-icon">✏️</div>
        <div class="ss-card-info">
          <div class="ss-card-title">이메일 직접 입력</div>
          <div class="ss-card-sub">${recentAccts.length ? '목록에 없는 계정으로 전환' : '이 기기에 로그인 기록이 아직 없어요'}</div>
        </div>
        <span class="sm-arrow">›</span>
      </div></div>
      <div style="font-size:11.5px;color:var(--muted);padding:8px 16px 0;line-height:1.6">
        보안을 위해 비밀번호는 저장하지 않아요. 전환할 때 한 번만 입력하면 돼요.
      </div>`;

  html += `<div id="admin-church-section" style="display:flex;justify-content:space-between;align-items:center;padding:0 16px;margin:16px 0 10px">
    <span style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px">교회·기관 관리 (${churchCodes.length}개)</span>
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
      const c     = churchMap[code];
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
            <span>활성 ${mCnt}명</span>
            ${pCnt>0?`<span style="color:#E67E22">⏳ 대기 ${pCnt}명</span>`:''}
            ${data.leaderName?`<span>${escHtml(data.leaderName)}</span>`:''}
            ${data.address?`<span>${escHtml(data.address.slice(0,15)+(data.address.length>15?'…':''))}</span>`:''}
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
  // 관리자도 옮길 때마다 직분이 따라다녔다 — 교회 변경과 같은 규칙으로 떠 두고 되살린다.
  // 교회 이름만은 스냅샷이 아니라 지금 등록된 이름을 쓴다(그 사이 이름이 바뀌었을 수 있다).
  const prev        = typeof getMembership       === 'function' ? getMembership(code) : null;
  const memberships = typeof snapshotMemberships === 'function' ? snapshotMemberships() : null;
  const restored    = {};
  if (prev) MEMBERSHIP_FIELDS.forEach(f => { if (prev[f]) restored[f] = prev[f]; });
  const base = Object.assign({}, restored, {
    church: name, churchCode: code, churchStatus: code ? 'active' : ''
  });
  if (memberships) base.memberships = memberships;

  Object.assign(me, base);   // me 객체 업데이트

  // localStorage 저장
  const users = DB.get('users', []);
  const u     = users.find(x => x.id === me.id);
  if (u) { Object.assign(u, base); DB.set('users', users); }

  // Firestore 동기화
  if (window._fbReady && window._fb) {
    window._fb.updateUser(me.id, base).catch(() => {});
  }

  if (typeof _photoCacheWarmed !== 'undefined') _photoCacheWarmed = false;
  if (typeof _userInfoWarmed !== 'undefined') _userInfoWarmed = false;
  if (typeof startChurchMembersWatch === 'function') startChurchMembersWatch();   // 새 교회 교인 실시간 감시
  if (typeof loadMyLeadership === 'function') loadMyLeadership();   // 옮긴 공동체 기준으로 리더 판정
  updateProfileDisplay();
  initSideMenu();

  const msg = code ? `"${name}"(으)로 이동했어요!` : '소속 없음으로 변경됐어요';
  toast(msg);

  // 관리자 패널 새로고침
  setTimeout(() => openSubscreen('admin-panel'), 200);
}

