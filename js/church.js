// ===== moved from index.html (feature: church) — 전역(window) 공유 스코프 =====
async function _syncChurchStatus() {
  try {
    if (window._fbReady && window._fb) {
      const snap = await window._fb.getUser(me.id);
      if (snap.exists()) {
        const remote = snap.data();
        const remoteStatus = remote.churchStatus;

        // 원격 상태가 변경됐으면 로컬도 업데이트
        if (remoteStatus && remoteStatus !== me.churchStatus) {
          me.churchStatus = remoteStatus;
          if (remote.churchRejectedAt) me.churchRejectedAt = remote.churchRejectedAt;
          if (remote.churchRejectedBy) me.churchRejectedBy = remote.churchRejectedBy;
          if (remote.churchApprovedAt) me.churchApprovedAt = remote.churchApprovedAt;
          DB.saveUser(me);
        }
      }
    }
  } catch(e) {
    console.warn('교회 상태 동기화 실패:', e);
  }

  // 상태에 따른 알림 표시
  setTimeout(() => {
    if (me.churchStatus === 'rejected') {
      _showChurchRejectedBanner();
    } else if (me.church && me.churchStatus === 'pending') {
      toast(`⏳ "${me.church}" 가입 승인을 기다리고 있어요`);
    } else if (me.church && me.churchStatus === 'active') {
      // 정상 — 아무것도 안 함
    }
  }, 1200);
}

function _showChurchRejectedBanner() {
  // 기존 배너 제거
  document.getElementById('church-reject-banner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'church-reject-banner';
  banner.style.cssText = `
    position: fixed; top: 60px; left: 50%; transform: translateX(-50%);
    width: calc(100% - 32px); max-width: 448px;
    background: #FBE5E5; border: 1.5px solid #E63946; border-radius: 14px;
    padding: 14px 16px; z-index: 200;
    box-shadow: 0 4px 20px rgba(230,57,70,0.15);
  `;
  banner.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px">
      <div style="font-size:22px;flex-shrink:0">❌</div>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:800;color:#C0392B;margin-bottom:4px">
          교회 가입이 거부됐어요
        </div>
        <div style="font-size:12.5px;color:#7B241C;line-height:1.6;margin-bottom:12px">
          <b>${escHtml(me.church || '해당 교회')}</b> 리더가 가입을 거부했어요.<br>
          다른 교회 코드로 다시 신청하거나 리더에게 문의해 보세요.
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="_reapplyChurch()" style="flex:1;height:36px;border:none;border-radius:9px;
            background:#E63946;color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
            🔄 다시 신청하기
          </button>
          <button onclick="document.getElementById('church-reject-banner').remove()" 
            style="height:36px;padding:0 14px;border:1.5px solid #E63946;border-radius:9px;
            background:white;color:#E63946;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
            닫기
          </button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('app')?.appendChild(banner);
}

function _reapplyChurch() {
  document.getElementById('church-reject-banner')?.remove();
  // 거부 상태 초기화
  me.churchStatus     = '';
  me.church           = '';
  me.churchCode       = '';
  me.churchRejectedAt = '';
  me.churchRejectedBy = '';
  DB.saveUser(me);
  // Firestore 초기화
  if (window._fbReady && window._fb) {
    window._fb.updateUser(me.id, {
      churchStatus: '', church: '', churchCode: '',
      churchRejectedAt: '', churchRejectedBy: ''
    }).catch(() => {});
  }
  // 교회 정보 메뉴로 이동
  openSubscreen('church-info');
  toast('새 교회 코드를 입력해 주세요');
}

function bindCanvasEvents(key, canvas, ctx) {
  canvas.addEventListener('pointerdown', e => {
    if (handMode) return;               // ✋ 손 이동 모드: 그리지 않고 스크롤 허용
    if (currentTool === 'select') return;
    e.preventDefault();
    isDrawingNow = true; activeDrawKey = key;
    const p = getCanvasPos(canvas, e);
    lastX = p.x; lastY = p.y;

    if (currentTool === 'highlighter') {
      hlPoints = [{ x: p.x, y: p.y }]; hlActiveKey = key;
      return; // 오버레이에만 미리보기
    }

    applyToolCtx(ctx);
    ctx.beginPath(); ctx.arc(p.x, p.y, lineRadius(), 0, Math.PI * 2); ctx.fill();
  });

  canvas.addEventListener('pointermove', e => {
    if (!isDrawingNow || activeDrawKey !== key || currentTool === 'select') return;
    e.preventDefault();
    const p = getCanvasPos(canvas, e);

    if (currentTool === 'highlighter') {
      hlPoints.push({ x: p.x, y: p.y });
      drawHlPreview(key);
      lastX = p.x; lastY = p.y;
      return;
    }

    applyToolCtx(ctx);
    ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastX = p.x; lastY = p.y;
  });

  const stop = () => {
    if (!isDrawingNow || activeDrawKey !== key) return;
    isDrawingNow = false;
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

    if (currentTool === 'highlighter') {
      commitHighlighter(key);
      return;
    }

    pushHistory(key);
    saveDrawingFor(key);
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointerleave', stop);
  canvas.addEventListener('pointercancel', stop);
}

function bindSelectionEvents(key, selEl) {
  selEl.addEventListener('pointerdown', e => {
    if (currentTool !== 'select') return;
    e.preventDefault();
    const p = getCanvasPos(selEl, e);
    if (SEL.active && SEL.key === key && isInSelBox(p.x, p.y)) {
      // 선택 영역 이동 시작
      SEL.moving = true; SEL.msx = p.x; SEL.msy = p.y;
      SEL.mox = SEL.curX; SEL.moy = SEL.curY;
      selEl.className = 'draw-sel-canvas moving';
    } else {
      // 새 선택 시작 (기존 선택 취소)
      if (SEL.active) cancelSelection();
      SEL.drawing = true; SEL.key = key;
      SEL.sx = p.x; SEL.sy = p.y; SEL.curX = p.x; SEL.curY = p.y;
    }
  });
  selEl.addEventListener('pointermove', e => {
    if (currentTool !== 'select') return;
    if (!SEL.drawing && !SEL.moving) return;
    e.preventDefault();
    const p    = getCanvasPos(selEl, e);
    const sCtx = selCtxMap[key];
    sCtx.clearRect(0, 0, selEl.width, selEl.height);

    if (SEL.moving && SEL.cutData && SEL.key === key) {
      SEL.curX = SEL.mox + (p.x - SEL.msx);
      SEL.curY = SEL.moy + (p.y - SEL.msy);
      sCtx.putImageData(SEL.cutData, Math.round(SEL.curX), Math.round(SEL.curY));
      drawSelRect(sCtx, SEL.curX, SEL.curY, SEL.w, SEL.h);
    } else if (SEL.drawing) {
      const rx = Math.min(SEL.sx, p.x), ry = Math.min(SEL.sy, p.y);
      const rw = Math.abs(p.x - SEL.sx), rh = Math.abs(p.y - SEL.sy);
      drawSelRect(sCtx, rx, ry, rw, rh);
    }
  });
  selEl.addEventListener('pointerup', e => {
    if (currentTool !== 'select') return;
    if (SEL.moving) { SEL.moving = false; selEl.className = 'draw-sel-canvas selecting'; return; }
    if (!SEL.drawing) return;
    SEL.drawing = false;
    const p = getCanvasPos(selEl, e);
    const x = Math.round(Math.min(SEL.sx, p.x)), y = Math.round(Math.min(SEL.sy, p.y));
    const w = Math.round(Math.abs(p.x - SEL.sx)), h = Math.round(Math.abs(p.y - SEL.sy));
    if (w < 5 || h < 5) { selCtxMap[key].clearRect(0, 0, selEl.width, selEl.height); return; }

    // 메인 캔버스에서 잘라내기
    const mCtx = drawCtxMap[key].ctx;
    SEL.cutData = mCtx.getImageData(x, y, w, h);
    mCtx.save(); mCtx.globalCompositeOperation = 'destination-out';
    mCtx.fillStyle = 'rgba(0,0,0,1)'; mCtx.fillRect(x, y, w, h); mCtx.restore();

    SEL.curX = x; SEL.curY = y; SEL.w = w; SEL.h = h;
    SEL.key = key; SEL.active = true;

    // 오버레이에 표시
    const sCtx = selCtxMap[key];
    sCtx.clearRect(0, 0, selEl.width, selEl.height);
    sCtx.putImageData(SEL.cutData, x, y);
    drawSelRect(sCtx, x, y, w, h);
    updateSelActionUI(true);
  });
  selEl.addEventListener('pointerleave', () => {
    if (SEL.drawing) SEL.drawing = false;
  });
}

function approveMinor(userId) {
  const users = DB.get('users', []);
  const u = _resolveMemberForAction(users, userId);  // 목록이 Firestore 기반 → 로컬 없으면 캐시 보강
  if (!u) return;
  u.status     = 'active';
  u.approvedBy = me.id;
  u.approvedAt = new Date().toISOString();
  // 승인자의 교회에 자동 배정
  if (me.churchCode && (!u.churchCode || !u.church)) {
    u.church        = me.church;
    u.churchCode    = me.churchCode;
    u.churchStatus  = 'active';
    u.orgType       = me.orgType || 'church';
  }
  DB.set('users', users);
  const cached = _membersCache.find(x => x.id === userId);
  if (cached) { cached.status = 'active'; if (me.churchCode) cached.churchStatus = 'active'; }
  // Firestore 동기화
  if (window._fbReady && window._fb) {
    const update = { status: 'active', approvedBy: me.id, approvedAt: u.approvedAt };
    if (me.churchCode && u.churchCode === me.churchCode) {
      update.church       = u.church;
      update.churchCode   = u.churchCode;
      update.churchStatus = 'active';
      update.orgType      = u.orgType;
    }
    window._fb.updateUser(userId, update).catch(() => toast('⚠ 서버 동기화 실패 — 잠시 후 다시 승인해 주세요'));
  }
  toast(`✅ ${u.name || '회원'}님의 계정을 승인했어요`);
  const cur = document.getElementById('subscreen')?.dataset?.current;
  if (cur) setTimeout(() => openSubscreen(cur), 200);
}

function rejectMinor(userId) {
  const users = DB.get('users', []);
  const u = _resolveMemberForAction(users, userId);
  if (!u) return;
  u.status = 'rejected';
  u.rejectedAt = new Date().toISOString();
  DB.set('users', users);
  const cached = _membersCache.find(x => x.id === userId);
  if (cached) cached.status = 'rejected';
  // Firestore 동기화
  if (window._fbReady && window._fb) {
    window._fb.updateUser(userId, {
      status: 'rejected', rejectedAt: u.rejectedAt
    }).catch(() => {});
  }
  toast(`${u.name || '회원'}님의 계정 신청을 거절했어요`);
  const cur = document.getElementById('subscreen')?.dataset?.current;
  if (cur) setTimeout(() => openSubscreen(cur), 200);
}

function switchMembersTab(tab) {
  const allV = document.getElementById('members-all-view');
  const penV = document.getElementById('members-pending-view');
  const tabA = document.getElementById('members-tab-all');
  const tabP = document.getElementById('members-tab-pending');
  const isAll = tab === 'all';
  if (allV) allV.style.display = isAll ? 'block' : 'none';
  if (penV) penV.style.display = isAll ? 'none'  : 'block';
  if (tabA) Object.assign(tabA.style, { background: isAll ? 'var(--black)' : 'var(--cream2)', color: isAll ? 'white' : 'var(--muted)' });
  if (tabP) Object.assign(tabP.style, { background: isAll ? 'var(--cream2)' : 'var(--black)', color: isAll ? 'var(--muted)' : 'white' });
}

function renderMyEvents() {
  const myTicketIds = DB.get('myTickets_' + me.id, []);
  const allEvents   = DB.get(getChurchEventsKey(), []);
  const today       = todayDateKey();

  // 내 티켓이 있는 행사만 필터
  const myEvents = myTicketIds
    .map(id => allEvents.find(e => e.id === id))
    .filter(Boolean);

  if (!myEvents.length) return `
    <div class="ss-empty">
      <div class="ss-empty-icon">🎫</div>
      <div class="ss-empty-title">신청한 행사가 없어요</div>
      <div class="ss-empty-sub">교회 탭에서 행사를 신청해보세요!</div>
    </div>
    <div style="padding:0 16px">
      <button class="btn-confirm" style="width:100%"
        onclick="switchTab('church','교회',document.querySelectorAll('.nav-btn')[3]);closeSubscreen()">
        교회 탭으로 이동
      </button>
    </div>`;

  // 예정 / 오늘 / 지난 행사 분류
  const upcoming = myEvents.filter(e => (e.endDate || e.startDate) >= today);
  const past     = myEvents.filter(e => (e.endDate || e.startDate) <  today);

  function buildEventCard(e) {
    const endDate  = e.endDate || e.startDate;
    const isPast   = endDate < today;
    const isToday  = e.startDate === today || endDate === today;
    const dLeft    = Math.ceil((new Date(endDate + ' 23:59') - new Date()) / 86400000);

    // D-day 태그
    let dTag = '';
    if (!isPast) {
      if (isToday)      dTag = `<span style="background:rgba(231,76,60,0.12);color:#E74C3C;font-size:11px;font-weight:800;border-radius:6px;padding:2px 8px">D-DAY</span>`;
      else if (dLeft <= 7) dTag = `<span style="background:rgba(231,76,60,0.08);color:#E74C3C;font-size:11px;font-weight:700;border-radius:6px;padding:2px 8px">D-${dLeft}</span>`;
      else              dTag = `<span style="background:var(--cream2);color:var(--muted);font-size:11px;font-weight:700;border-radius:6px;padding:2px 8px">D-${dLeft}</span>`;
    }

    const dateStr = e.endDate && e.endDate !== e.startDate
      ? `${e.startDate} ~ ${e.endDate}` : e.startDate;
    const priceStr = e.price > 0 ? `${e.price.toLocaleString()}원` : '무료';

    return `
      <div style="background:white;border-radius:16px;
                  border:1.5px solid ${isPast?'var(--border)':'var(--border)'};
                  overflow:hidden;margin-bottom:12px;opacity:${isPast?'0.7':'1'}">
        <!-- 포스터 or 이모지 헤더 -->
        ${e.poster
          ? `<img src="${e.poster}" style="width:100%;height:120px;object-fit:cover;display:block">`
          : `<div style="width:100%;height:72px;background:${isPast?'var(--cream2)':'var(--dark)'};
                         display:flex;align-items:center;justify-content:center;font-size:36px">🎪</div>`}
        <div style="padding:14px">
          <!-- 제목 + D-day -->
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
            <div style="font-size:15px;font-weight:800;flex:1;margin-right:8px;line-height:1.35">${escHtml(e.name)}</div>
            ${dTag}
          </div>
          <!-- 상세 정보 -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;
                      background:var(--cream2);border-radius:10px;padding:10px 12px">
            <div>
              <div style="font-size:10.5px;color:var(--muted);font-weight:700;margin-bottom:2px">📅 행사 일정</div>
              <div style="font-size:12.5px;font-weight:700">${escHtml(dateStr)}</div>
            </div>
            <div>
              <div style="font-size:10.5px;color:var(--muted);font-weight:700;margin-bottom:2px">📍 장소</div>
              <div style="font-size:12.5px;font-weight:700">${escHtml(e.location||'장소 미정')}</div>
            </div>
            <div>
              <div style="font-size:10.5px;color:var(--muted);font-weight:700;margin-bottom:2px">💰 참가비</div>
              <div style="font-size:12.5px;font-weight:700;color:${e.price>0?'var(--dark)':'#27AE60'}">${priceStr}</div>
            </div>
            <div>
              <div style="font-size:10.5px;color:var(--muted);font-weight:700;margin-bottom:2px">👥 신청 현황</div>
              <div style="font-size:12.5px;font-weight:700">
                ${e.maxTickets>0 ? `${e.ticketCount||0}/${e.maxTickets}명` : '제한없음'}
              </div>
            </div>
          </div>
          <!-- 버튼 -->
          <div style="display:flex;gap:8px">
            <button onclick="openEventDetail('${e.id}')"
              style="flex:2;height:38px;border-radius:10px;border:none;background:var(--black);
                     color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
              상세 보기 ›
            </button>
            ${!isPast ? `
              <button onclick="cancelTicketFromMyEvents('${e.id}')"
                style="flex:1;height:38px;border-radius:10px;border:1.5px solid rgba(192,57,43,0.25);
                       background:#FBE5E5;color:#C0392B;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
                취소
              </button>` : `
              <span style="flex:1;height:38px;border-radius:10px;background:var(--cream2);
                           display:flex;align-items:center;justify-content:center;
                           font-size:12px;color:var(--muted);font-weight:700">종료됨</span>`}
          </div>
        </div>
      </div>`;
  }

  let html = '<div style="padding:14px 16px 32px">';

  if (upcoming.length) {
    html += `<div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px;margin-bottom:10px">
      🎫 예정된 행사 (${upcoming.length}건)
    </div>`;
    upcoming.forEach(e => { html += buildEventCard(e); });
  }

  if (past.length) {
    html += `<div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px;
                         margin:${upcoming.length?'20px':'0'} 0 10px">
      📋 지난 행사 (${past.length}건)
    </div>`;
    past.forEach(e => { html += buildEventCard(e); });
  }

  return html + '</div>';
}

function cancelTicketFromMyEvents(eventId) {
  cancelTicket(eventId);
  setTimeout(() => openSubscreen('my-events'), 200);
}

function renderChurchInfo() {
  const statusBadge = me.church
    ? (me.churchStatus === 'pending'
        ? `<span style="color:#E67E22;font-size:11.5px;font-weight:700;background:rgba(230,126,34,0.1);border-radius:6px;padding:2px 7px">⏳ 승인 대기 중</span>`
        : `<span style="color:#27AE60;font-size:11.5px;font-weight:700;background:rgba(39,174,96,0.1);border-radius:6px;padding:2px 7px">✅ 정식 교인</span>`)
    : '';

  const editBtn = isLeader()
    ? `<button onclick="openChurchInfoEdit()" style="height:30px;padding:0 12px;border-radius:8px;
        border:1.5px solid var(--border);background:white;font-size:12px;font-weight:600;
        cursor:pointer;font-family:inherit;color:var(--muted)">✏️ 편집</button>`
    : '';

  let html = `
    <div class="ss-section-title" style="display:flex;justify-content:space-between;align-items:center">
      <span>현재 소속</span>${editBtn}
    </div>
    <div class="ss-card">
      <div class="ss-card-row">
        <div class="ss-card-icon">⛪</div>
        <div class="ss-card-info">
          <div class="ss-card-title">${escHtml(me.church || '소속 없음')}</div>
          <div class="ss-card-sub" style="display:flex;align-items:center;gap:6px;margin-top:4px">
            코드: ${escHtml(me.churchCode || '—')} ${statusBadge}
          </div>
        </div>
      </div>
    </div>
    <div id="church-detail-body">
      <div style="padding:24px 16px;text-align:center;color:var(--muted);font-size:13px">🔄 교회 정보 불러오는 중...</div>
    </div>
    <div class="ss-section-title">교회 코드 변경</div>
    <div class="ss-card">
      <div style="padding:16px">
        <div class="form-group">
          <label class="form-label">새 교회 코드 입력</label>
          <input id="new-church-code" type="text" class="form-input"
                 placeholder="예: SC0001" style="text-transform:uppercase"
                 oninput="this.value=this.value.toUpperCase()">
        </div>
        <button class="btn-confirm" style="width:100%" onclick="changeChurchCode()">교회 변경하기</button>
        <div style="font-size:12px;color:var(--muted);margin-top:10px;text-align:center;line-height:1.6">
          교회에서 받은 코드를 입력하세요<br>변경 후 리더 승인을 받아야 정식 교인이 돼요
        </div>
      </div>
    </div>`;

  // 비동기로 교회 상세 정보 로드
  if (me.churchCode) setTimeout(() => _loadChurchDetail(), 80);
  return html;
}

async function _loadChurchDetail() {
  const body = document.getElementById('church-detail-body');
  if (!body || !me.churchCode) return;

  let info = {};
  try {
    if (window._fbReady && window._fb) {
      const snap = await window._fb.getChurchInfo(me.churchCode);
      if (snap.exists()) info = snap.data();
    }
  } catch(e) { console.warn('교회 정보 로드 실패:', e); }

  const { address = '', description = '', pastorName = '', pastorBio = '' } = info;

  if (!address && !description && !pastorName) {
    body.innerHTML = isLeader()
      ? `<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px">
           ✏️ 위 편집 버튼으로 교회 정보를 등록해보세요!</div>`
      : '';
    return;
  }

  let html = '';
  if (description) html += `
    <div class="ss-section-title">📝 교회 소개</div>
    <div class="ss-card"><div style="padding:16px;font-size:13.5px;color:var(--black);line-height:1.8;white-space:pre-wrap">${escHtml(description)}</div></div>`;

  if (address) html += `
    <div class="ss-section-title">📍 교회 위치</div>
    <div class="ss-card">
      <div class="ss-card-row" onclick="window.open('https://map.kakao.com/?q=${encodeURIComponent(address)}','_blank')" style="cursor:pointer">
        <div class="ss-card-icon">📍</div>
        <div class="ss-card-info">
          <div class="ss-card-title">${escHtml(address)}</div>
          <div class="ss-card-sub" style="color:var(--gold)">카카오맵으로 보기 →</div>
        </div>
      </div>
    </div>`;

  if (pastorName) html += `
    <div class="ss-section-title">👨‍⚕️ 담임 목사</div>
    <div class="ss-card">
      <div style="padding:16px">
        <div style="font-size:16px;font-weight:800;color:var(--black);margin-bottom:6px">목사 ${escHtml(pastorName)}</div>
        ${pastorBio ? `<div style="font-size:13.5px;color:var(--muted);line-height:1.8;white-space:pre-wrap">${escHtml(pastorBio)}</div>` : ''}
      </div>
    </div>`;

  body.innerHTML = html;
}

function _renderChurchEmojiPicker(selected) {
  const row = document.getElementById('nc-emoji-row');
  if (!row) return;
  row.innerHTML = CHURCH_EMOJIS.map(e => `
    <button type="button" onclick="_selectChurchEmoji('${e}')"
      style="width:40px;height:40px;border-radius:10px;font-size:22px;cursor:pointer;
             border:2px solid ${selected===e?'var(--black)':'var(--border)'};
             background:${selected===e?'var(--cream2)':'white'};transition:all 0.15s">${e}</button>
  `).join('');
}

function _selectChurchEmoji(e) {
  document.getElementById('nc-emoji').value = e;
  _renderChurchEmojiPicker(e);
}

function onChurchTypeChange() {
  const type = document.getElementById('nc-type')?.value || 'church';
  const t = CHURCH_TYPES.find(x => x.value === type) || CHURCH_TYPES[0];
  if (document.getElementById('nc-emoji').value === _ncPrevTypeEmoji) {
    document.getElementById('nc-emoji').value = t.emoji;
    _renderChurchEmojiPicker(t.emoji);
  }
  _ncPrevTypeEmoji = t.emoji;
}

function autoGenChurchCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const custom = DB.get('customChurches', {});
  let code;
  do { code = Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join(''); }
  while (custom[code] || OB_CHURCHES[code]);
  document.getElementById('nc-code').value = code;
}

function openCreateChurchModal() {
  _ncEditMode = false; _ncEditCode = '';
  ['nc-name','nc-leader','nc-address','nc-desc'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  document.getElementById('nc-code').value = '';
  document.getElementById('nc-code').disabled = false;
  document.getElementById('nc-type').value = 'church';
  document.getElementById('nc-emoji').value = '⛪';
  document.getElementById('nc-submit-btn').textContent = '만들기';
  document.getElementById('create-church-modal-title').textContent = '⛪ 새 교회/기관 만들기';
  _ncPrevTypeEmoji = '⛪';
  _renderChurchEmojiPicker('⛪');
  document.getElementById('modal-create-church').classList.add('open');
}

function openEditChurchModal(code) {
  const data = getChurchData(code);
  if (!data) { toast('교회 데이터를 찾을 수 없어요'); return; }
  _ncEditMode = true; _ncEditCode = code;
  document.getElementById('nc-name').value    = data.name    || '';
  document.getElementById('nc-code').value    = code;
  document.getElementById('nc-code').disabled = true; // 코드는 수정 불가
  document.getElementById('nc-type').value    = data.type    || 'church';
  document.getElementById('nc-leader').value  = data.leaderName || '';
  document.getElementById('nc-address').value = data.address  || '';
  document.getElementById('nc-desc').value    = data.desc     || '';
  const emoji = data.emoji || getChurchEmoji(data);
  document.getElementById('nc-emoji').value   = emoji;
  document.getElementById('nc-submit-btn').textContent = '저장하기';
  document.getElementById('create-church-modal-title').textContent = '✏️ 교회/기관 수정';
  _ncPrevTypeEmoji = emoji;
  _renderChurchEmojiPicker(emoji);
  document.getElementById('modal-create-church').classList.add('open');
}

function closeCreateChurchModal(e) {
  if (!e || e.target.id === 'modal-create-church')
    document.getElementById('modal-create-church')?.classList.remove('open');
}

function submitCreateChurch() {
  const name    = document.getElementById('nc-name').value.trim();
  const code    = _ncEditMode ? _ncEditCode : document.getElementById('nc-code').value.trim().toUpperCase();
  const type    = document.getElementById('nc-type').value;
  const emoji   = document.getElementById('nc-emoji').value || getChurchEmoji({ type });
  const leader  = document.getElementById('nc-leader').value.trim();
  const address = document.getElementById('nc-address').value.trim();
  const desc    = document.getElementById('nc-desc').value.trim();

  if (!name) { toast('교회·기관명을 입력해 주세요'); return; }
  if (!code || code.length < 4) { toast('코드는 4자 이상 영문+숫자로 입력해 주세요'); return; }

  const custom = DB.get('customChurches', {});
  if (!_ncEditMode && (custom[code] || OB_CHURCHES[code])) {
    toast('이미 사용 중인 코드예요'); return;
  }

  const data = {
    name, code, type, emoji,
    leaderName: leader,
    address,
    desc,
    createdBy:  _ncEditMode ? (custom[code]?.createdBy || me.name) : me.name,
    createdAt:  _ncEditMode ? (custom[code]?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    updatedAt:  _ncEditMode ? new Date().toISOString() : undefined,
    active: true
  };
  custom[code] = data;
  DB.set('customChurches', custom);

  if (window._fbReady && window._fb) {
    window._fb.setChurchInfo(code, data).catch(e => console.warn('Firestore 저장 실패:', e));
  }

  closeCreateChurchModal();
  const msg = _ncEditMode ? `✅ "${name}" 정보가 수정됐어요!` : `✅ "${name}" 이(가) 만들어졌어요! 코드: ${code}`;
  toast(msg);
  setTimeout(() => openSubscreen('admin-panel'), 150);
}

function deleteChurch(code) {
  const data = getChurchData(code);
  if (!data) return;
  const members = getChurchMemberCount(code);
  if (members > 0 && !confirm(`"${data.name}"에 소속된 멤버 ${members}명이 있어요.\n정말 삭제하시겠어요?`)) return;
  const custom = DB.get('customChurches', {});
  delete custom[code];
  DB.set('customChurches', custom);
  // Firestore에서도 삭제 — 아니면 목록 동기화 시 재등장 (item 3+4)
  if (window._fbReady && window._fb) {
    window._fb.deleteChurchInfo(code).catch(e => console.error('Firestore 교회 삭제 실패:', e));
  }
  toast(`"${data.name}" 교회가 삭제됐어요`);
  setTimeout(() => openSubscreen('admin-panel'), 150);
}

function openChurchManage(code) {
  _viewingChurchCode = code;
  openSubscreen('church-manage');
}

function renderChurchManage() {
  const code = _viewingChurchCode;
  const data = getChurchData(code);
  if (!data) return `<div class="ss-empty"><div class="ss-empty-title">교회를 찾을 수 없어요</div></div>`;

  const members = DB.get('users', []).filter(u => u.churchCode === code);
  const active  = members.filter(u => u.churchStatus === 'active');
  const pending = members.filter(u => u.churchStatus === 'pending');
  const emoji   = getChurchEmoji(data);
  const typeLabel = getChurchTypeLabel(data.type);

  let html = `
    <!-- 헤더 카드 -->
    <div style="background:var(--dark);padding:28px 20px 24px;color:white">
      <div style="font-size:48px;margin-bottom:12px;text-align:center">${emoji}</div>
      <div style="text-align:center;font-size:20px;font-weight:800;margin-bottom:4px">${escHtml(data.name)}</div>
      <div style="text-align:center;font-size:12.5px;color:rgba(255,255,255,0.55);margin-bottom:14px">${typeLabel}</div>
      <div style="display:flex;justify-content:center;gap:8px">
        <span style="background:rgba(255,255,255,0.12);border-radius:8px;padding:5px 12px;font-size:12px;font-weight:700;font-family:monospace">🔑 ${escHtml(code)}</span>
        ${data.leaderName ? `<span style="background:rgba(255,255,255,0.12);border-radius:8px;padding:5px 12px;font-size:12px;font-weight:700">👤 ${escHtml(data.leaderName)}</span>` : ''}
      </div>
      <div style="display:flex;justify-content:center;gap:8px;margin-top:14px">
        ${me.churchCode === code
          ? `<span style="font-size:12px;color:rgba(255,255,255,0.55);font-weight:700;padding:6px 14px;background:rgba(255,255,255,0.1);border-radius:8px">현재 소속 중</span>`
          : `<button onclick="adminSwitchChurch('${code}')"
              style="height:34px;padding:0 18px;border-radius:20px;border:none;background:var(--gold);color:var(--dark);font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit">
              이 교회로 이동 ›
            </button>`}
      </div>
    </div>
    <div style="padding:16px 16px 32px">`;

  // 기본 정보
  if (data.address || data.desc) {
    html += `<div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px;margin-bottom:10px">📋 기본 정보</div>
      <div style="background:white;border-radius:14px;border:1.5px solid var(--border);padding:14px;margin-bottom:16px">`;
    if (data.address) html += `<div style="display:flex;gap:8px;margin-bottom:${data.desc?'10px':'0'}"><span style="font-size:13.5px">📍</span><div style="font-size:13px;color:#444">${escHtml(data.address)}</div></div>`;
    if (data.desc)    html += `<div style="display:flex;gap:8px"><span style="font-size:13.5px">📝</span><div style="font-size:13px;color:#444;line-height:1.6">${escHtml(data.desc)}</div></div>`;
    html += `</div>`;
  }

  // 통계
  html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
    ${[['👥','전체',members.length],['✅','활성',active.length],['⏳','대기',pending.length]].map(([ico,lbl,cnt])=>`
      <div style="background:white;border-radius:12px;border:1.5px solid var(--border);padding:12px;text-align:center">
        <div style="font-size:20px;margin-bottom:4px">${ico}</div>
        <div style="font-size:18px;font-weight:800">${cnt}</div>
        <div style="font-size:11px;color:var(--muted)">${lbl}</div>
      </div>`).join('')}
  </div>`;

  // 멤버 목록
  if (active.length) {
    html += `<div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px;margin-bottom:10px">✅ 활성 멤버 (${active.length}명)</div>
      <div style="background:white;border-radius:14px;border:1.5px solid var(--border);overflow:hidden;margin-bottom:16px">`;
    active.forEach(u => {
      html += `<div style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-bottom:1px solid var(--border)">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--cream2);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${u.isLeader||u.role?.includes('목사')||u.role?.includes('전도사')?'👑':'🙏'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13.5px;font-weight:700">${escHtml(u.name||'이름없음')}</div>
          <div style="font-size:11.5px;color:var(--muted)">${escHtml(u.role||'성도')}</div>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  if (pending.length) {
    html += `<div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px;margin-bottom:10px">⏳ 승인 대기 (${pending.length}명)</div>
      <div style="background:white;border-radius:14px;border:1.5px solid var(--border);overflow:hidden;margin-bottom:16px">`;
    pending.forEach(u => {
      html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:13.5px;font-weight:700">${escHtml(u.name||'이름없음')}</div>
          <div style="font-size:11.5px;color:var(--muted)">${escHtml(u.email||'')}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="approveChurchJoin('${u.id}');setTimeout(()=>openChurchManage('${code}'),200)" style="height:28px;padding:0 10px;border-radius:7px;border:none;background:var(--black);color:white;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit">승인</button>
          <button onclick="rejectChurchJoin('${u.id}');setTimeout(()=>openChurchManage('${code}'),200)" style="height:28px;padding:0 10px;border-radius:7px;border:1.5px solid rgba(192,57,43,0.3);background:#FBE5E5;color:#C0392B;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit">거절</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // 수정/삭제 버튼
  html += `<div style="display:flex;gap:10px;margin-top:4px">
    <button onclick="openEditChurchModal('${code}')" style="flex:1;height:44px;border-radius:12px;border:1.5px solid var(--border);background:white;color:var(--dark);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">✏️ 정보 수정</button>
    <button onclick="deleteChurch('${code}')" style="height:44px;padding:0 18px;border-radius:12px;border:1.5px solid rgba(192,57,43,0.25);background:#FBE5E5;color:#C0392B;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">🗑 삭제</button>
  </div>`;

  return html + '</div>';
}

function openChurchInfoEdit() {
  if (!isLeader()) { toast('리더만 수정할 수 있어요'); return; }
  // 기존 데이터 로드 후 모달 열기
  const modal = document.getElementById('modal-church-info-edit');
  if (!modal) return;
  if (window._fbReady && window._fb && me.churchCode) {
    window._fb.getChurchInfo(me.churchCode).then(snap => {
      const d = snap.exists() ? snap.data() : {};
      document.getElementById('ci-address').value     = d.address     || '';
      document.getElementById('ci-description').value = d.description || '';
      document.getElementById('ci-pastor-name').value = d.pastorName  || '';
      document.getElementById('ci-pastor-bio').value  = d.pastorBio   || '';
    }).catch(() => {});
  }
  modal.classList.add('open');
}

function closeChurchInfoEdit(e) {
  if (!e || e.target.id === 'modal-church-info-edit')
    document.getElementById('modal-church-info-edit')?.classList.remove('open');
}

function saveChurchInfoEdit() {
  if (!isLeader() || !me.churchCode) return;
  const data = {
    address:     document.getElementById('ci-address').value.trim(),
    description: document.getElementById('ci-description').value.trim(),
    pastorName:  document.getElementById('ci-pastor-name').value.trim(),
    pastorBio:   document.getElementById('ci-pastor-bio').value.trim(),
    updatedBy:   me.name,
    updatedAt:   new Date().toISOString()
  };
  if (window._fbReady && window._fb) {
    window._fb.setChurchInfo(me.churchCode, data)
      .then(() => {
        toast('✅ 교회 정보를 저장했어요!');
        closeChurchInfoEdit();
        openSubscreen('church-info'); // 새로고침
      })
      .catch(e => { console.error(e); toast('저장 실패. 다시 시도해주세요'); });
  } else {
    toast('Firebase 연결 필요');
  }
}

function _resolveMemberForAction(users, userId) {
  let u = users.find(x => x.id === userId);
  if (!u) {
    const cached = _membersCache.find(x => x.id === userId);
    if (cached) { u = { ...cached }; users.push(u); }
  }
  return u;
}

function approveChurchMember(userId) {
  // 본인 가입 신청 자가 승인 차단 (보안)
  if (userId === me.id) { toast('본인의 가입 신청은 승인할 수 없습니다'); return; }
  const users = DB.get('users', []);
  const u = _resolveMemberForAction(users, userId);
  if (!u) return;
  u.churchStatus     = 'active';
  u.churchApprovedBy = me.id;
  u.churchApprovedAt = new Date().toISOString();
  DB.set('users', users);
  // 캐시도 즉시 갱신 → 목록 새로고침 시 바로 반영
  const cached = _membersCache.find(x => x.id === userId);
  if (cached) cached.churchStatus = 'active';

  // Firestore 동기화
  if (window._fbReady && window._fb) {
    window._fb.updateUser(userId, {
      churchStatus:     'active',
      churchApprovedBy: u.churchApprovedBy,
      churchApprovedAt: u.churchApprovedAt
    }).catch(() => toast('⚠ 서버 동기화 실패 — 잠시 후 다시 승인해 주세요'));
  }

  toast(`✅ ${u.name || '교인'}님의 교회 가입을 승인했어요`);
  const cur = document.getElementById('subscreen')?.dataset?.current;
  if (cur) setTimeout(() => openSubscreen(cur), 150);
}

function rejectChurchMember(userId) {
  // 본인 가입 신청 자가 거절 차단 (보안)
  if (userId === me.id) { toast('본인의 가입 신청은 승인할 수 없습니다'); return; }
  const users = DB.get('users', []);
  const u = _resolveMemberForAction(users, userId);
  if (!u) return;
  u.churchStatus     = 'rejected';
  u.churchRejectedAt = new Date().toISOString();
  u.churchRejectedBy = me.name;
  // 교회 정보는 유지 (교인이 어느 교회에서 거부됐는지 알 수 있게)
  DB.set('users', users);
  const cached = _membersCache.find(x => x.id === userId);
  if (cached) cached.churchStatus = 'rejected';

  // Firestore 동기화 (교인 기기에서도 반영되도록)
  if (window._fbReady && window._fb) {
    window._fb.updateUser(userId, {
      churchStatus:     'rejected',
      churchRejectedAt: u.churchRejectedAt,
      churchRejectedBy: u.churchRejectedBy
    }).catch(() => toast('⚠ 서버 동기화 실패 — 잠시 후 다시 거절해 주세요'));
  }

  toast(`${u.name || '교인'}님의 교회 가입을 거절했어요`);
  const cur = document.getElementById('subscreen')?.dataset?.current;
  if (cur) setTimeout(() => openSubscreen(cur), 150);
}

function approveChurchJoin(userId) { approveChurchMember(userId); }

function rejectChurchJoin(userId)  { rejectChurchMember(userId);  }

function renderMembersScreen() {
  setTimeout(loadMembersScreenData, 80);
  return `<div id="members-screen-body" style="padding:40px 16px;text-align:center;color:var(--muted)">
    <div style="font-size:28px;margin-bottom:12px">🔄</div>
    <div style="font-size:13px">교인 목록 불러오는 중...</div>
  </div>`;
}

async function loadMembersScreenData() {
  const body = document.getElementById('members-screen-body');
  if (!body) return;

  let allUsers = [];
  try {
    // 관리자 포함 — '교인 관리'는 항상 현재 소속 교회만 (전체 사용자는 관리자 패널에서)
    if (window._fbReady && window._fb && me.churchCode) {
      const snap = await window._fb.getUsersByChurch(me.churchCode);
      snap.forEach(d => allUsers.push({ id: d.id, ...d.data() }));
    }
  } catch(e) {
    console.warn('Firestore 교인 로드 실패:', e);
  }

  // fallback — 현재 교회로 제한
  if (!allUsers.length && me.church) {
    allUsers = DB.get('users', []).filter(u => u.church === me.church);
  }

  allUsers = allUsers.filter(u => !u.deleted);   // 삭제된 계정 제외

  // 로컬 전용 플래그(isAppAdmin)만 보존 — 최신 Firestore 값이 우선 (이전: 로컬이 원격을 덮어씀)
  const localUsers = DB.get('users', []);
  allUsers = allUsers.map(u => {
    const local = localUsers.find(l => l.id === u.id);
    return local ? { ...local, ...u, isAppAdmin: u.isAppAdmin || local.isAppAdmin } : u;
  });

  _membersCache = allUsers;   // 승인/거절 핸들러가 대상 사용자를 찾을 수 있도록 캐시
  if (typeof _cacheUserPhotos === 'function') _cacheUserPhotos(allUsers);
  body.outerHTML = renderMembersScreenHtml(allUsers);
}

function renderMembersScreenHtml(allUsers) {
  const minorPending  = allUsers.filter(u => u.status === 'pending');
  const churchPending = allUsers.filter(u => u.status !== 'pending' && u.churchStatus === 'pending');
  const pending       = [...churchPending, ...minorPending];
  const active        = allUsers.filter(u =>
    u.status !== 'pending' && u.status !== 'rejected' && u.churchStatus !== 'pending');
  const orgType = getOrgTypeForChurch(me.churchCode);
  const roles = (ORG_ROLES[orgType] || ORG_ROLES.church).map(r => r.value);

  // 탭 헤더
  let html = `
    <div style="display:flex;border-bottom:1px solid var(--border);background:white;position:sticky;top:0;z-index:5">
      <button id="members-tab-all" onclick="switchMembersTab('all')"
        style="flex:1;height:44px;border:none;background:var(--black);color:white;
               font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit">
        전체 (${active.length}명)
      </button>
      <button id="members-tab-pending" onclick="switchMembersTab('pending')"
        style="flex:1;height:44px;border:none;background:var(--cream2);
               color:${pending.length > 0 ? '#E63946' : 'var(--muted)'};
               font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit">
        승인 대기 ${pending.length > 0 ? `(${pending.length})` : '(0)'}
      </button>
    </div>`;

  // 전체 교인 목록
  html += `<div id="members-all-view">`;
  if (!active.length) {
    html += `<div class="ss-empty"><div class="ss-empty-icon">👥</div><div class="ss-empty-title">등록된 교인이 없어요</div></div>`;
  } else {
    roles.concat(['기타']).forEach(role => {
      const defRole = getDefaultRole(orgType);
      const group = active.filter(u => (u.role||defRole) === role || (role==='기타' && !roles.includes(u.role||defRole)));
      if (!group.length) return;
    html += `<div class="ss-section-title">${role} (${group.length}명)</div>
      <div class="ss-card">${group.map(u => {
        const isMe = u.id === me.id;
        const appointed = u.isAppointedLeader && (u.leaderPerms||[]).length > 0;
        const permSummary = appointed
          ? (u.leaderPerms||[]).map(p => PERM_LABELS[p]).join(', ')
          : '';
        return `
        <div class="member-row" style="flex-wrap:wrap;gap:0">
          <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;padding:2px 0">
            <div class="member-avatar">🙏</div>
            <div class="member-info">
              <div class="member-name">
                ${escHtml(u.name)}
                ${isMe ? '<span class="ss-card-badge ss-badge-gold" style="margin-left:4px">나</span>' : ''}
                ${appointed ? `<span class="appointed-badge" style="margin-left:4px">임명 리더</span>` : ''}
              </div>
              <div class="member-role">${escHtml(u.role||'성도')} · ${escHtml(u.church||'')}</div>
              ${appointed ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${escHtml(permSummary)}</div>` : ''}
            </div>
          </div>
          ${!isMe && isLeader() ? `
          <div style="display:flex;gap:6px;flex-shrink:0">
            ${hasLeaderPerm('binder') && u.binderShareEnabled ? `
            <button onclick="openMemberBinder('${u.id}','${escHtml(u.name)}')"
              style="height:34px;padding:0 10px;border-radius:8px;border:1.5px solid rgba(41,128,185,0.4);
                     background:rgba(41,128,185,0.08);font-size:12px;font-weight:600;
                     cursor:pointer;font-family:inherit;color:#2980B9;flex-shrink:0">
              📖 바인더
            </button>` : ''}
            ${!(LEADER_ROLES[u.orgType||'church']||[]).includes(u.role||'') ? `
            <button onclick="openAppointModal('${u.id}')"
              style="height:34px;padding:0 12px;border:1.5px solid var(--border);border-radius:8px;
                     background:white;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
                     color:${appointed?'var(--gold)':'var(--muted)'};flex-shrink:0">
              ${appointed ? '✏️ 권한 수정' : '👑 리더 임명'}
            </button>` : ''}
          </div>` : ''}
        </div>`;
      }).join('')}</div>`;
    });
  }
  html += `</div>`;

  html += `<div id="members-pending-view" style="display:none">`;
  if (!pending.length) {
    html += `<div class="ss-empty"><div class="ss-empty-icon">✅</div>
      <div class="ss-empty-title">승인 대기 중인 교인이 없어요</div></div>`;
  } else {
    // 교회 가입 대기
    if (churchPending.length) {
      html += `<div class="ss-section-title">⛪ 교회 가입 대기 (${churchPending.length}명)</div>
      <div class="ss-card">`;
      const canApprove   = isLeader() || hasLeaderPerm('approve');
      const canNewFamily = isLeader() || hasLeaderPerm('newfamily') || hasLeaderPerm('approve');
      churchPending.forEach(u => {
        const isNewFamily = u.registrationType === 'newfamily';
        const isSelf      = u.id === me.id;                       // 본인 신청은 자가 승인 불가
        const hasAccess   = !isSelf && (isNewFamily ? canNewFamily : canApprove);
        const typeBadge = isNewFamily
          ? `<span style="font-size:11px;background:rgba(39,174,96,0.12);color:#27AE60;
              border-radius:6px;padding:2px 7px;font-weight:700;margin-left:6px">👋 새가족</span>`
          : `<span style="font-size:11px;background:rgba(52,152,219,0.12);color:#2980B9;
              border-radius:6px;padding:2px 7px;font-weight:700;margin-left:6px">📋 가입 신청</span>`;
        html += `
          <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
              <div class="member-avatar">🙏</div>
              <div>
                <div class="member-name">${escHtml(u.name)} ${typeBadge}</div>
                <div class="member-role">${escHtml(u.role||'성도')} · 신청일 ${(u.createdAt||'').split('T')[0]}</div>
              </div>
            </div>
            ${hasAccess ? `<div style="display:flex;gap:8px">
              <button onclick="approveChurchMember('${u.id}')"
                style="flex:1;height:42px;border:none;border-radius:10px;background:var(--black);
                       color:white;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit">
                ✅ ${isNewFamily ? '새가족 승인' : '가입 승인'}
              </button>
              <button onclick="rejectChurchMember('${u.id}')"
                style="flex:1;height:42px;border:none;border-radius:10px;background:#FBE5E5;
                       color:#C0392B;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit">
                ✕ 거절
              </button>
            </div>` : `<div style="font-size:12px;color:var(--muted);text-align:center;padding:6px 0">
              ${isSelf ? '본인의 가입 신청은 승인할 수 없습니다' : '승인 권한이 없어요 — 담당 리더에게 문의하세요'}
            </div>`}
          </div>`;
      });
      html += `</div>`;
    }
    // 미성년자 가입 대기
    if (minorPending.length) {
      html += `<div class="ss-section-title">🧒 미성년자 승인 대기 (${minorPending.length}명)</div>
      <div class="ss-card">`;
      minorPending.forEach(u => {
        html += `
          <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
              <div class="member-avatar">🧒</div>
              <div>
                <div class="member-name">${escHtml(u.name)}</div>
                <div class="member-role">만 14세 미만 · ${escHtml(u.church||'')} · 신청일 ${(u.createdAt||'').split('T')[0]}</div>
              </div>
            </div>
            <div style="background:var(--cream2);border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:10px">
              <div>👤 보호자&nbsp; <b>${escHtml(u.guardianName||'—')}</b></div>
              <div style="margin-top:5px">📞 연락처&nbsp; <b>${escHtml(u.guardianContact||'—')}</b></div>
            </div>
            <div style="display:flex;gap:8px">
              <button onclick="approveMinor('${u.id}')"
                style="flex:1;height:42px;border:none;border-radius:10px;background:var(--black);
                       color:white;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit">
                ✅ 승인하기
              </button>
              <button onclick="rejectMinor('${u.id}')"
                style="flex:1;height:42px;border:none;border-radius:10px;background:#FBE5E5;
                       color:#C0392B;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit">
                ✕ 거절
              </button>
            </div>
          </div>`;
      });
      html += `</div>`;
    }
  }
  html += `</div>`;
  return `<div id="members-screen-body">${html}</div>`;
}

function renderEventManage() {
  return `
    <div class="ss-empty">
      <div class="ss-empty-icon">📅</div>
      <div class="ss-empty-title">행사 관리</div>
      <div class="ss-empty-sub">행사 등록·수정·취소 기능은<br>곧 오픈될 예정이에요</div>
    </div>
    <div class="ss-card" style="margin:0 16px">
      <div class="ss-card-row" onclick="switchTab('church','교회',document.querySelectorAll('.nav-btn')[3]);closeSubscreen()" style="cursor:pointer">
        <div class="ss-card-icon">📋</div>
        <div class="ss-card-info"><div class="ss-card-title">교회 탭에서 행사 확인</div><div class="ss-card-sub">현재 등록된 행사를 볼 수 있어요</div></div>
        <span class="sm-arrow">›</span>
      </div>
    </div>`;
}

function joinMeeting() {
  const code = document.getElementById('meeting-code').value.trim();
  if (!code) { toast('회의 코드를 입력해 주세요'); return; }
  toast('회의 기능이 곧 오픈됩니다 🚀');
}

function getChurchName(code) {
  if (!code) return null;
  const ob = OB_CHURCHES[code];
  if (ob) return typeof ob === 'string' ? ob : ob.name;
  const c = DB.get('customChurches', {})[code];
  if (!c) return null;
  return typeof c === 'string' ? c : (c.name || null);
}

function getChurchData(code) {
  if (!code) return null;
  const ob = OB_CHURCHES[code];
  if (ob) {
    const name = typeof ob === 'string' ? ob : ob.name;
    const type = (typeof ob === 'object' && ob.type) || 'church';
    const emoji = (CHURCH_TYPES.find(t => t.value === type) || CHURCH_TYPES[0]).emoji;
    return { name, code, type, emoji, readonly: true };
  }
  const c = DB.get('customChurches', {})[code];
  if (!c) return null;
  if (typeof c === 'string') return { name: c, code, type: 'church', emoji: '⛪' };
  return c;
}

function getChurchTypeLabel(type) {
  return (CHURCH_TYPES.find(t => t.value === type) || CHURCH_TYPES[0]).label;
}

function getChurchEmoji(data) {
  if (!data) return '⛪';
  if (data.emoji) return data.emoji;
  return (CHURCH_TYPES.find(t => t.value === data.type) || CHURCH_TYPES[0]).emoji;
}

function getChurchMemberCount(code) {
  return DB.get('users', []).filter(u => u.churchCode === code && u.churchStatus === 'active').length;
}

function toggleCrMember(userId, name, row) {
  if (_crType === 'dm') {
    // 1:1은 하나만 선택
    _crSelected.clear();
    document.querySelectorAll('[id^="cr-cb-"]').forEach(cb => {
      cb.style.background = ''; cb.textContent = '';
    });
  }
  const cb = document.getElementById('cr-cb-' + userId);
  if (_crSelected.has(userId)) {
    _crSelected.delete(userId);
    if (cb) { cb.style.background = ''; cb.textContent = ''; }
  } else {
    _crSelected.add(userId);
    if (cb) { cb.style.background = '#0D0D0D'; cb.style.color = 'white'; cb.textContent = '✓'; cb.style.fontSize = '11px'; }
  }
}

function getMeetings()    { return DB.get('meetings_' + (me.churchCode || me.church || me.id), []); }

function saveMeetings(l)  { DB.set('meetings_' + (me.churchCode || me.church || me.id), l); }

function initMeetingsListener() {
  if (_meetingsUnsubscribe) return; // 이미 구독 중
  const churchCode = me.churchCode || me.church || me.id;
  if (!window._fbReady || !window._fb) {
    renderMeetingList(); return;
  }
  _meetingsUnsubscribe = window._fb.listenMeetings(churchCode, snap => {
    const meetings = [];
    snap.forEach(d => meetings.push({ id: d.id, ...d.data() }));
    // localStorage 캐시 업데이트
    saveMeetings(meetings);
    renderMeetingList();
  });
}

function stopMeetingsListener() {
  if (_meetingsUnsubscribe) { _meetingsUnsubscribe(); _meetingsUnsubscribe = null; }
}

function generateMeetingCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part  = n => Array.from({length:n}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  return `SC-${part(4)}-${part(4)}`;
}

function openCreateMeetingModal() {
  if (!isLeader()) { toast('회의 만들기는 리더만 가능해요'); return; }
  const now = new Date();
  document.getElementById('mtg-name').value  = '';
  document.getElementById('mtg-desc').value  = '';
  document.getElementById('mtg-date').value  = now.toISOString().slice(0,10);
  document.getElementById('mtg-time').value  = `${String(now.getHours()).padStart(2,'0')}:00`;
  document.getElementById('mtg-duration').value = '60';
  document.getElementById('mtg-recur-type').value = 'none';
  document.getElementById('recur-end-date').value = '';
  document.getElementById('recur-month-dates').value = '';
  document.getElementById('recur-days-row').style.display  = 'none';
  document.getElementById('recur-month-row').style.display = 'none';
  document.getElementById('recur-end-row').style.display   = 'none';
  // 요일 버튼 초기화
  _recurDays = new Set();
  [0,1,2,3,4,5,6].forEach(i => {
    const btn = document.getElementById('rday-' + i);
    if (btn) { btn.style.background = 'white'; btn.style.color = 'var(--muted)'; btn.style.borderColor = 'var(--border)'; }
  });
  _pendingMeetingCode = generateMeetingCode();
  document.getElementById('mtg-preview-code').textContent = _pendingMeetingCode;
  document.getElementById('modal-create-meeting').classList.add('open');
}

function closeCreateMeetingModal(e) {
  if (!e || e.target.id === 'modal-create-meeting')
    document.getElementById('modal-create-meeting').classList.remove('open');
}

function createMeeting() {
  const name     = document.getElementById('mtg-name').value.trim();
  const date     = document.getElementById('mtg-date').value;
  const time     = document.getElementById('mtg-time').value;
  const duration = document.getElementById('mtg-duration').value;
  const desc     = document.getElementById('mtg-desc').value.trim();
  const recurType= document.getElementById('mtg-recur-type').value;
  const endDate  = document.getElementById('recur-end-date')?.value || null;

  if (!name) { toast('회의 이름을 입력해 주세요'); return; }
  if (!date || !time) { toast('날짜와 시간을 입력해 주세요'); return; }

  // 반복 유효성 검사
  if ((recurType === 'weekly' || recurType === 'biweekly') && _recurDays.size === 0) {
    toast('반복할 요일을 하나 이상 선택해 주세요'); return;
  }

  // 반복 데이터 구성
  let recurrence = null;
  if (recurType !== 'none') {
    recurrence = { type: recurType, endDate: endDate || null };
    if (recurType === 'weekly' || recurType === 'biweekly') {
      recurrence.days = [..._recurDays].sort();
    }
    if (recurType === 'monthly') {
      const raw = document.getElementById('recur-month-dates')?.value || '';
      const dates = raw.split(',').map(s => parseInt(s.trim())).filter(n => n >= 1 && n <= 31);
      if (!dates.length) { toast('날짜를 입력해 주세요 (예: 1, 15)'); return; }
      recurrence.monthDates = dates;
    }
  }

  const code = _pendingMeetingCode || generateMeetingCode();
  const newMeeting = {
    id: uid(), code, name, date, time,
    duration: parseInt(duration), desc, recurrence,
    createdBy: me.name, createdById: me.id,
    church: me.church || '',
    churchCode: me.churchCode || me.church || me.id, // Firestore 쿼리용
    createdAt: new Date().toISOString()
  };
  const meetings = getMeetings();
  meetings.push(newMeeting);
  saveMeetings(meetings);

  // Firestore 저장 (다른 기기에서도 조회 가능)
  if (window._fbReady && window._fb) {
    window._fb.setMeeting(newMeeting.id, newMeeting)
      .catch(e => console.warn('Firestore 회의 저장 실패:', e));
  }

  closeCreateMeetingModal();
  renderMeetingList();
  const recurLabel = recurrence ? ` (${getRecurrenceLabel({recurrence})})` : '';
  toast(`✅ "${name}" 회의 등록됐어요!${recurLabel}`);
}

function renderMeetingList() {
  const meetings = getMeetings();
  const el       = document.getElementById('meeting-list');
  if (!el) return;
  const createBtn = document.getElementById('meeting-create-btn');
  if (createBtn) createBtn.style.display = isLeader() ? 'block' : 'none';

  if (!meetings.length) {
    el.innerHTML = `<div style="text-align:center;padding:30px 20px;color:var(--muted)">
      <div style="font-size:36px;margin-bottom:10px">📅</div>
      <div style="font-size:14px;font-weight:700;color:var(--black);margin-bottom:6px">예정된 회의가 없어요</div>
      <div style="font-size:12.5px;line-height:1.6">
        ${isLeader() ? '위 "+ 회의 만들기"로 등록해보세요!' : '리더가 회의를 등록하면 여기에 표시돼요'}
      </div>
    </div>`;
    return;
  }

  const now     = new Date();
  const myId    = me.id;
  const sorted  = [...meetings].sort((a, b) => {
    const na = getNextOccurrence(a) || new Date(9999,0,1);
    const nb = getNextOccurrence(b) || new Date(9999,0,1);
    return na - nb;
  });

  // 섹션 분류
  const mine     = sorted.filter(m => m.createdById === myId);
  const upcoming = sorted.filter(m => {
    const next = getNextOccurrence(m) || new Date(m.date + 'T' + m.time);
    return next >= now;
  });

  function renderSection(title, icon, items) {
    if (!items.length) return '';
    let html = `<div style="padding:14px 16px 6px">
      <div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.4px">${icon} ${title} (${items.length})</div>
    </div>`;
    items.forEach(m => {
      const nextOcc = getNextOccurrence(m);
      const st      = nextOcc || new Date(m.date + 'T' + m.time);
      const et      = new Date(st.getTime() + m.duration * 60000);
      const isLive  = now >= st && now <= et;
      const isPast  = now > et && !m.recurrence;
      const dateStr = st.toLocaleDateString('ko-KR', { month:'short', day:'numeric', weekday:'short' });
      const timeStr = st.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit', hour12:true });
      const recurLabel = m.recurrence ? ` · ${getRecurrenceLabel(m)}` : '';
      const isMine  = m.createdById === myId;

      html += `<div class="meeting-item ${isLive ? 'live' : ''} ${isPast ? 'past' : ''}"
                    style="margin:0 16px 8px;background:white;border-radius:14px;
                           border:1.5px solid ${isLive ? 'rgba(39,174,96,0.4)' : 'var(--border)'};
                           padding:14px 16px;opacity:${isPast?'0.55':'1'}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="display:flex;align-items:center;gap:8px">
            ${isLive ? '<span style="font-size:11px;background:rgba(39,174,96,0.15);color:#27AE60;border-radius:6px;padding:2px 8px;font-weight:700">🔴 LIVE</span>' : ''}
            <span style="font-size:14px;font-weight:800;color:var(--black)">${escHtml(m.name)}</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            ${isMine ? `<button onclick="deleteMeeting('${m.id}')"
              style="width:26px;height:26px;border-radius:50%;border:none;background:var(--cream2);
                     color:var(--muted);font-size:12px;cursor:pointer">✕</button>` : ''}
          </div>
        </div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px">
          📅 ${dateStr} ${timeStr} · ${m.duration}분${recurLabel}
          ${m.createdBy ? ' · ' + escHtml(m.createdBy) : ''}
        </div>
        ${m.desc ? `<div style="font-size:12.5px;color:var(--black);margin-bottom:8px;line-height:1.6">${escHtml(m.desc)}</div>` : ''}
        <div style="display:flex;gap:8px">
          <button onclick="copyMeetingCode('${m.code}')"
            style="flex:1;height:36px;border-radius:10px;border:1.5px solid var(--border);
                   background:white;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;color:var(--muted)">
            🔑 ${m.code}
          </button>
          <button onclick="joinMeeting('${m.code}','${escHtml(m.name)}')"
            style="flex:2;height:36px;border-radius:10px;border:none;
                   background:${isLive?'#27AE60':'var(--black)'};color:white;
                   font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
            ${isLive ? '🔴 지금 입장' : '▶ 참여하기'}
          </button>
        </div>
      </div>`;
    });
    return html;
  }

  let html = '';
  // 내가 만든 회의
  if (mine.length) html += renderSection('내가 만든 회의', '👤', mine);
  // 예정된 전체 회의 (내 것 제외)
  const others = upcoming.filter(m => m.createdById !== myId);
  if (others.length) html += renderSection('교회 예정 회의', '⛪', others);
  // 내 것 포함 예정 없음
  if (!mine.length && !others.length) {
    html = `<div style="text-align:center;padding:30px 20px;color:var(--muted)">
      <div style="font-size:36px;margin-bottom:10px">✅</div>
      <div style="font-size:13px">모든 회의가 완료됐어요</div>
    </div>`;
  }
  html += `<div style="height:24px"></div>`;
  el.innerHTML = html;
}

function joinMeeting(code, name) {
  const meetingCode = code || document.getElementById('meeting-code')?.value.trim().toUpperCase();
  if (!meetingCode) { toast('회의 코드를 입력해 주세요'); return; }
  const jitsiRoom = 'SmartChurch' + meetingCode.replace(/[^A-Z0-9]/g,'');
  document.getElementById('meeting-room-title').textContent = name || meetingCode;
  document.getElementById('meeting-room-frame').src = `https://meet.jit.si/${jitsiRoom}`;
  document.getElementById('meeting-room-overlay').classList.add('open');
}

async function joinMeetingByCode() {
  const code = document.getElementById('meeting-code')?.value.trim().toUpperCase();
  if (!code) { toast('회의 코드를 입력해 주세요'); return; }

  // localStorage에서 먼저 찾기
  let mtg = getMeetings().find(m => m.code === code);

  // 없으면 Firestore에서 검색 (다른 기기가 만든 회의)
  if (!mtg && window._fbReady && window._fb) {
    try {
      const snap = await window._fb.getMeetingByCode(code);
      if (!snap.empty) {
        mtg = { id: snap.docs[0].id, ...snap.docs[0].data() };
        // 내 localStorage에도 캐시
        const meetings = getMeetings();
        if (!meetings.find(m => m.id === mtg.id)) {
          meetings.push(mtg);
          saveMeetings(meetings);
        }
        toast(`"${mtg.name}" 회의에 입장해요!`);
      }
    } catch(e) {
      console.warn('Firestore 회의 검색 실패:', e);
    }
  }

  if (!mtg) {
    toast('해당 코드의 회의를 찾을 수 없어요'); return;
  }
  joinMeeting(code, mtg?.name || code);
}

function closeMeetingRoom() {
  document.getElementById('meeting-room-frame').src = '';
  document.getElementById('meeting-room-overlay').classList.remove('open');
}

async function copyMeetingCode(code) {
  try { await navigator.clipboard.writeText(code); toast(`🔑 [${code}] 복사됐어요!`); }
  catch { toast(`코드: ${code}`); }
}

function deleteMeeting(id) {
  saveMeetings(getMeetings().filter(m => m.id !== id));
  // Firestore 삭제
  if (window._fbReady && window._fb) {
    window._fb.deleteMeeting(id).catch(e => console.warn('Firestore 회의 삭제 실패:', e));
  }
  renderMeetingList();
  toast('회의를 삭제했어요');
}

function renderMyChurch() {
  if (!me.church) {
    return `<div class="ss-empty">
      <div class="ss-empty-icon">⛪</div>
      <div class="ss-empty-title">소속 교회가 없어요</div>
      <div class="ss-empty-sub">메뉴 → 교회 정보에서 교회 코드를 등록해보세요</div>
    </div>`;
  }
  // 즉시 로딩 후 비동기 렌더링
  setTimeout(loadMyChurchData, 80);
  return `<div id="my-church-body" style="padding:40px 16px;text-align:center;color:var(--muted)">
    <div style="font-size:28px;margin-bottom:12px">🔄</div>
    <div style="font-size:13px">교회 정보 불러오는 중...</div>
  </div>`;
}

async function loadMyChurchData() {
  const body = document.getElementById('my-church-body');
  if (!body) return;

  // Firestore에서 교인 로드 (기존 _loadChurchMembers 재사용)
  const members = await _loadChurchMembers();

  const events  = DB.get(getChurchEventsKey(), []);
  const myChals = customChallenges();

  let html = `<div id="my-church-body">`;

  // ── 교회 정보 헤더 ──
  html += `
    <div style="background:var(--black);padding:20px 18px;text-align:center">
      <div style="font-size:36px;margin-bottom:8px">⛪</div>
      <div style="font-size:20px;font-weight:800;color:white;margin-bottom:4px">${escHtml(me.church)}</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.55)">
        코드: ${escHtml(me.churchCode||'—')} · 교인 ${members.length}명
        ${me.churchStatus==='pending'
          ? ' · <span style="color:#E67E22;font-weight:700">승인 대기 중</span>' : ''}
      </div>
    </div>`;

  // ── 우리 교회 챌린지 ──
  html += `
    <div class="ss-section-title" style="display:flex;justify-content:space-between;align-items:center">
      <span>🚩 우리 교회 챌린지</span>
      ${isLeader() ? `<span style="font-size:12px;color:var(--muted);cursor:pointer;font-weight:600"
        onclick="openCreateChallengeModal()">+ 만들기</span>` : ''}
    </div>`;
  if (!myChals.length) {
    html += `<div style="padding:16px 18px;text-align:center;color:var(--muted);font-size:13px">
      ${isLeader() ? '아직 챌린지가 없어요. 위 + 만들기로 추가해보세요!' : '아직 등록된 챌린지가 없어요'}
    </div>`;
  } else {
    const startedIds = myChallenges().map(c => c.templateId);
    html += `<div class="ss-card" style="margin:0 16px">`;
    myChals.forEach(c => {
      const started = startedIds.includes(c.id);
      const freqLabel = c.freqType === 'daily' ? '매일'
        : c.freqType === 'weekly'  ? `주 ${c.freqTarget}회`
        : c.freqType === 'monthly' ? `월 ${c.freqTarget}회`
        : c.freqType === 'yearly'  ? `연 ${c.freqTarget}회` : '';
      html += `
        <div class="ss-card-row" ${started ? '' : `onclick="openChallengeStartModal('${c.id}')"`}
             style="${started?'opacity:0.55':'cursor:pointer'}">
          <div class="ss-card-icon">🚩</div>
          <div class="ss-card-info">
            <div class="ss-card-title">${escHtml(c.label)}</div>
            <div class="ss-card-sub">${escHtml(c.tag)} · ${freqLabel}
              ${c.isPublic ? ' · 🌐 공개' : ' · 🔒 비공개'}
            </div>
          </div>
          <span class="ss-card-badge ${started ? 'ss-badge-gray' : 'ss-badge-gold'}">
            ${started ? '진행중' : '+ 시작'}
          </span>
        </div>`;
    });
    html += `</div>`;
  }

  // ── 우리 교회 행사 ──
  html += `
    <div class="ss-section-title" style="display:flex;justify-content:space-between;align-items:center">
      <span>🎫 우리 교회 행사</span>
      <span style="font-size:12px;color:var(--muted);cursor:pointer;font-weight:600"
        onclick="openSubscreen('event-browse')">전체보기 ›</span>
    </div>`;
  if (!events.length) {
    html += `<div style="padding:16px 18px;text-align:center;color:var(--muted);font-size:13px">등록된 행사가 없어요</div>`;
  } else {
    const today = todayDateKey();
    const upcomingEvents = events.filter(e => (!e.endDate || e.endDate >= today)).slice(0, 3);
    html += `<div class="ss-card" style="margin:0 16px">`;
    upcomingEvents.forEach(e => {
      const myTickets = DB.get('myTickets_'+me.id, []);
      const hasTicket = myTickets.includes(e.id);
      html += `
        <div class="ss-card-row" onclick="openEventDetail('${e.id}')" style="cursor:pointer">
          <div class="ss-card-icon" style="background:var(--gold);border-radius:12px">🎪</div>
          <div class="ss-card-info">
            <div class="ss-card-title">${escHtml(e.name)}</div>
            <div class="ss-card-sub">${escHtml(e.startDate)} · ${e.price>0?e.price.toLocaleString()+'원':'무료'}</div>
          </div>
          ${hasTicket ? '<span class="ss-card-badge ss-badge-gold">신청완료</span>' : '<span class="sm-arrow">›</span>'}
        </div>`;
    });
    html += `</div>`;
  }

  // ── 교인 현황 ──
  html += `
    <div class="ss-section-title" style="display:flex;justify-content:space-between;align-items:center">
      <span>👥 교인 현황</span>
      ${isLeader() ? `<span style="font-size:12px;color:var(--muted);cursor:pointer;font-weight:600"
        onclick="openSubscreen('members');closeSideMenu()">관리 ›</span>` : ''}
    </div>
    <div class="ss-card" style="margin:0 16px 24px">`;
  if (!members.length) {
    html += `<div style="padding:14px;text-align:center;color:var(--muted);font-size:13px">교인이 없어요</div>`;
  } else {
    members.slice(0, 4).forEach(u => {
      const photo = getUserPhoto(u);
      const isMe  = u.id === me.id;
      html += `
        <div class="ss-card-row">
          <div class="ss-card-icon" style="border-radius:50%;overflow:hidden;background:var(--cream2)">
            ${photo ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover">` : '👤'}
          </div>
          <div class="ss-card-info">
            <div class="ss-card-title">${escHtml(u.name)}${isMe?' <span style="color:var(--gold);font-size:11px">(나)</span>':''}</div>
            <div class="ss-card-sub">${escHtml(u.role||'성도')}</div>
          </div>
        </div>`;
    });
    if (members.length > 4) {
      html += `<div style="padding:10px 16px;text-align:center;font-size:13px;color:var(--muted)">외 ${members.length-4}명 더 있어요</div>`;
    }
  }
  html += `</div></div>`;

  body.outerHTML = html;
}

function initChurchTab() {
  const cx = document.getElementById('church-box-title');
  if (cx) cx.textContent = me.church || '';
  renderChurchMembers();
}

function renderChurchMembers() {
  const el      = document.getElementById('church-members-list');
  const countEl = document.getElementById('church-member-count');
  if (!el) return;

  // 즉시 로딩 표시
  el.innerHTML = `<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px">🔄 교인 목록 불러오는 중...</div>`;

  // Firestore 비동기 로드
  _loadChurchMembers().then(members => {
    if (countEl) countEl.textContent = `${members.length}명`;
    const allBtn = document.getElementById('see-all-members-btn');
    if (allBtn) allBtn.style.display = members.length > 5 ? 'block' : 'none';
    const show = members.slice(0, 5);
    if (!show.length) {
      el.innerHTML = `<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px">
        ${me.church ? '아직 등록된 교인이 없어요' : '교회 코드를 등록하면 교인을 볼 수 있어요'}</div>`;
      return;
    }
    el.innerHTML = show.map(u => {
      const photo = getUserPhoto(u);
      const isMe  = u.id === me.id;
      const avatar= photo
        ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : '👤';
      return `<div class="member-row">
        <div class="member-avatar" style="overflow:hidden">
          ${avatar}${isMe ? '<div class="online-dot"></div>' : ''}
        </div>
        <div class="member-info">
          <div class="member-name">${escHtml(u.name)}${isMe ? '  <span style="font-size:11px;color:var(--gold)">(나)</span>' : ''}</div>
          <div class="member-role">${escHtml(u.role||'성도')}</div>
        </div>
      </div>`;
    }).join('');
  });
}

async function _loadChurchMembers() {
  if (!me.church && !me.churchCode) return [];
  let members = [];
  try {
    if (window._fbReady && window._fb && me.churchCode) {
      const snap = await window._fb.getUsersByChurch(me.churchCode);
      snap.forEach(d => {
        const data = d.data();
        if (data.churchStatus !== 'pending' && data.status !== 'rejected') {
          members.push({ id: d.id, ...data });
        }
      });
    }
  } catch(e) {
    console.warn('Firestore 교인 로드 실패:', e);
  }
  // Firestore 데이터 없으면 localStorage fallback
  if (!members.length) {
    members = DB.get('users', []).filter(u =>
      u.church === me.church &&
      u.status !== 'pending' && u.status !== 'rejected' &&
      u.churchStatus !== 'pending'
    );
  }
  if (typeof _cacheUserPhotos === 'function') _cacheUserPhotos(members);   // 레거시 photoURL 호환
  if (typeof warmPhotoCache === 'function') await warmPhotoCache();         // userPhotos 벌크 로드 (최초 1회)
  return members;
}

function openEventBrowse() { openSubscreen('event-browse'); }

function getChurchEventsKey() { return 'churchEvents_' + (me.churchCode || me.church || 'default'); }

function openCreateEventModal() {
  if (!isLeader() && !hasLeaderPerm('ticketing')) { toast('행사 등록 권한이 없어요'); return; }
  _eventPosterBase64 = null;
  ['ev-name','ev-tagline','ev-location','ev-desc'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['ev-start','ev-end','ev-ticket-start','ev-ticket-end'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  if (document.getElementById('ev-price')) document.getElementById('ev-price').value = '0';
  if (document.getElementById('ev-max'))   document.getElementById('ev-max').value   = '0';
  const picker = document.getElementById('event-poster-picker');
  if (picker) picker.innerHTML = '<span style="font-size:36px">🖼️</span><div style="font-size:13px;color:var(--muted);margin-top:8px">포스터 / 썸네일 업로드</div>';
  document.getElementById('modal-create-event').classList.add('open');
}

function closeCreateEventModal(e) {
  if (!e || e.target.id === 'modal-create-event')
    document.getElementById('modal-create-event').classList.remove('open');
}

function handleEventPoster(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5*1024*1024) { toast('5MB 이하 이미지를 선택해 주세요'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    _eventPosterBase64 = e.target.result;
    const picker = document.getElementById('event-poster-picker');
    if (picker) picker.innerHTML = '<img src="' + _eventPosterBase64 + '">';
    toast('📸 포스터가 선택됐어요!');
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function createEvent() {
  const name        = document.getElementById('ev-name')?.value.trim();
  const tagline     = document.getElementById('ev-tagline')?.value.trim() || '';
  const start       = document.getElementById('ev-start')?.value;
  const end         = document.getElementById('ev-end')?.value || '';
  const ticketStart = document.getElementById('ev-ticket-start')?.value || '';
  const ticketEnd   = document.getElementById('ev-ticket-end')?.value   || '';
  const location    = document.getElementById('ev-location')?.value.trim() || '';
  const price       = parseInt(document.getElementById('ev-price')?.value) || 0;
  const maxTickets  = parseInt(document.getElementById('ev-max')?.value)   || 0;
  const desc        = document.getElementById('ev-desc')?.value.trim()     || '';
  if (!name)  { toast('행사 이름을 입력해 주세요'); return; }
  if (!start) { toast('행사 시작일을 입력해 주세요'); return; }
  const events = DB.get(getChurchEventsKey(), []);
  const ev = { id:uid(), name, tagline, poster:_eventPosterBase64||null,
    startDate:start, endDate:end||start,
    ticketStartDate:ticketStart||start, ticketEndDate:ticketEnd||end||start,
    location, price, maxTickets, desc, ticketCount:0,
    createdBy:me.name, createdById:me.id, church:me.church||'', churchCode:matchScope(),
    createdAt:new Date().toISOString() };
  events.push(ev);
  DB.set(getChurchEventsKey(), events);
  // Firestore 동기화 (교인 간 공유)
  if (window._fbReady && window._fb) {
    const seen = DB.get('seenEvents_' + me.id, []); if (!seen.includes(ev.id)) { seen.push(ev.id); DB.set('seenEvents_' + me.id, seen); } // 내 행사 자기 알림 방지
    window._fb.setEventDoc(ev.id, ev).catch(() => {});
  }
  closeCreateEventModal();
  setTimeout(() => openSubscreen('event-browse'), 150);
  toast('✅ "' + name + '" 행사가 등록됐어요!');
}

function openEventBrowse() { openSubscreen('event-browse'); }

function renderEventBrowse() {
  const events    = DB.get(getChurchEventsKey(), []);
  const canManage = isLeader() || hasLeaderPerm('ticketing');
  const today     = todayDateKey();
  let html = '<div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px;font-weight:700;color:var(--muted)">행사 · 티켓팅</span>' +
    (canManage ? '<button onclick="openCreateEventModal()" style="height:34px;padding:0 14px;border-radius:20px;border:none;background:var(--black);color:white;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">+ 행사 등록</button>' : '') + '</div>';
  if (!events.length) return html + '<div class="ss-empty"><div class="ss-empty-icon">🎫</div><div class="ss-empty-title">등록된 행사가 없어요</div><div class="ss-empty-sub">' + (canManage?'위 버튼으로 첫 행사를 등록해보세요':'곧 행사가 등록될 거예요') + '</div></div>';
  const myTickets = DB.get('myTickets_'+me.id, []);
  html += '<div style="padding:12px 16px">';
  events.forEach(e => {
    const hasTicket = myTickets.includes(e.id);
    const isSoldOut = e.maxTickets>0 && (e.ticketCount||0)>=e.maxTickets;
    const ticketEnd = e.ticketEndDate||e.endDate;
    const dLeft     = ticketEnd ? Math.ceil((new Date(ticketEnd)-new Date())/86400000) : null;
    const isOpen    = (!e.ticketStartDate||today>=e.ticketStartDate) && (!ticketEnd||today<=ticketEnd);
    let badge = '';
    if (hasTicket) badge = '<span style="background:rgba(39,174,96,0.12);color:#27AE60;font-size:11px;font-weight:700;border-radius:6px;padding:3px 8px">✅ 신청완료</span>';
    else if (isSoldOut) badge = '<span style="background:var(--cream2);color:var(--muted);font-size:11px;font-weight:700;border-radius:6px;padding:3px 8px">마감</span>';
    else if (!isOpen)   badge = '<span style="background:rgba(243,156,18,0.12);color:#E67E22;font-size:11px;font-weight:700;border-radius:6px;padding:3px 8px">접수 예정</span>';
    else if (dLeft!==null&&dLeft<=7) badge = '<span style="background:rgba(231,76,60,0.1);color:#E74C3C;font-size:11px;font-weight:700;border-radius:6px;padding:3px 8px">D-'+dLeft+'</span>';
    html += '<div onclick="openEventDetail(\'' + e.id + '\')" style="background:white;border-radius:16px;border:1.5px solid var(--border);margin-bottom:16px;overflow:hidden;cursor:pointer">' +
      (e.poster ? '<img src="'+e.poster+'" style="width:100%;height:160px;object-fit:cover;display:block">' : '<div style="width:100%;height:90px;background:var(--black);display:flex;align-items:center;justify-content:center;font-size:40px">🎪</div>') +
      '<div style="padding:14px 16px"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px"><div><div style="font-size:16px;font-weight:800;color:var(--black)">' + escHtml(e.name) + '</div>' +
      (e.tagline?'<div style="font-size:13px;color:var(--muted)">' + escHtml(e.tagline) + '</div>':'') + '</div>' + badge + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--muted)">' +
      '<span>📅 ' + escHtml(e.startDate) + (e.endDate&&e.endDate!==e.startDate?' ~ '+escHtml(e.endDate):'') + '</span>' +
      (e.location?'<span>📍 ' + escHtml(e.location) + '</span>':'') +
      '<span>' + (e.price>0?'💰 '+e.price.toLocaleString()+'원':'🆓 무료') + '</span>' +
      (e.maxTickets>0?'<span>👥 잔여 '+(e.maxTickets-(e.ticketCount||0))+'/'+e.maxTickets+'</span>':'') +
      '</div></div></div>';
  });
  return html + '</div>';
}

function openEventDetail(eventId) { _viewingEventId = eventId; openSubscreen('event-detail'); }

function renderEventDetail() {
  const events = DB.get(getChurchEventsKey(), []);
  const e = events.find(x => x.id === _viewingEventId);
  if (!e) return '<div class="ss-empty"><div class="ss-empty-title">행사를 찾을 수 없어요</div></div>';
  const myTickets = DB.get('myTickets_'+me.id, []);
  const hasTicket = myTickets.includes(e.id);
  const isSoldOut = e.maxTickets>0 && (e.ticketCount||0)>=e.maxTickets;
  const today     = todayDateKey();
  const ticketEnd = e.ticketEndDate||e.endDate;
  const dLeft     = ticketEnd ? Math.ceil((new Date(ticketEnd)-new Date())/86400000) : null;
  const isOpen    = (!e.ticketStartDate||today>=e.ticketStartDate)&&(!ticketEnd||today<=ticketEnd);
  const canManage = isLeader()||hasLeaderPerm('ticketing');
  let btn = '';
  if (hasTicket) btn = '<button onclick="cancelTicket(\'' + e.id + '\')" style="flex:1;height:48px;border-radius:12px;border:1.5px solid rgba(220,0,0,0.25);background:#FBE5E5;color:#C0392B;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">신청 취소</button>';
  else if (isSoldOut) btn = '<button disabled style="flex:1;height:48px;border-radius:12px;border:none;background:var(--cream2);color:var(--muted);font-size:14px;font-weight:700;cursor:default;font-family:inherit">마감됨</button>';
  else if (!isOpen)   btn = '<button disabled style="flex:1;height:48px;border-radius:12px;border:none;background:var(--cream2);color:var(--muted);font-size:14px;font-weight:700;cursor:default;font-family:inherit">접수 예정</button>';
  else btn = '<button onclick="applyTicket(\'' + e.id + '\')" style="flex:1;height:48px;border-radius:12px;border:none;background:var(--black);color:white;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">🎫 신청하기</button>';
  return (e.poster?'<img src="'+e.poster+'" style="width:100%;max-height:260px;object-fit:cover;display:block">':'<div style="width:100%;height:130px;background:var(--black);display:flex;align-items:center;justify-content:center;font-size:56px">🎪</div>') +
  '<div style="padding:20px 18px 110px"><div style="font-size:22px;font-weight:800;margin-bottom:6px">'+escHtml(e.name)+'</div>' +
  (e.tagline?'<div style="font-size:14px;color:var(--muted);margin-bottom:16px">'+escHtml(e.tagline)+'</div>':'<div style="margin-bottom:16px"></div>') +
  '<div style="background:var(--cream2);border-radius:14px;padding:16px;margin-bottom:20px"><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px">' +
  '<div><div style="color:var(--muted);font-size:11px;font-weight:700;margin-bottom:3px">행사 기간</div><div style="font-weight:600">'+escHtml(e.startDate)+(e.endDate&&e.endDate!==e.startDate?' ~ '+escHtml(e.endDate):'')+'</div></div>' +
  '<div><div style="color:var(--muted);font-size:11px;font-weight:700;margin-bottom:3px">장소</div><div style="font-weight:600">'+escHtml(e.location||'장소 미정')+'</div></div>' +
  '<div><div style="color:var(--muted);font-size:11px;font-weight:700;margin-bottom:3px">참가비</div><div style="font-weight:600;color:'+(e.price>0?'var(--black)':'#27AE60')+'">'+(e.price>0?e.price.toLocaleString()+'원':'무료')+'</div></div>' +
  '<div><div style="color:var(--muted);font-size:11px;font-weight:700;margin-bottom:3px">신청 현황</div><div style="font-weight:600">'+(e.maxTickets>0?(e.ticketCount||0)+'/'+e.maxTickets+'명':'제한없음')+'</div></div></div>' +
  (ticketEnd?'<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)"><div style="color:var(--muted);font-size:11px;font-weight:700;margin-bottom:3px">예약 기간</div><div style="font-size:13px;font-weight:600">'+escHtml(e.ticketStartDate||'—')+' ~ '+escHtml(ticketEnd)+(dLeft!==null?'<span style="color:'+(dLeft<=7?'#E74C3C':'var(--muted)')+';margin-left:8px;font-size:12px">'+(dLeft>0?'D-'+dLeft:dLeft===0?'오늘 마감':'마감됨')+'</span>':'')+'</div></div>':'') +
  '</div>' +
  (e.desc?'<div style="margin-bottom:20px"><div style="font-size:14px;font-weight:700;margin-bottom:10px">행사 안내</div><div style="font-size:13.5px;line-height:1.8;color:#333;white-space:pre-line">'+escHtml(e.desc)+'</div></div>':'') +
  (canManage&&e.createdById===me.id?'<button onclick="deleteEvent(\'' + e.id + '\')" style="width:100%;height:42px;border-radius:12px;border:1.5px solid rgba(220,0,0,0.25);background:#FBE5E5;color:#C0392B;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">🗑️ 행사 삭제</button>':'') +
  '</div><div style="position:fixed;bottom:0;left:0;right:0;background:white;border-top:1px solid var(--border);padding:12px 16px;display:flex;gap:10px;z-index:100;box-shadow:0 -4px 20px rgba(0,0,0,0.08)">' +
  '<button onclick="shareEvent(\'' + e.id + '\')" style="height:48px;width:52px;border-radius:12px;border:1.5px solid var(--border);background:white;font-size:20px;cursor:pointer;flex-shrink:0">📤</button>' +
  btn + '</div>';
}

async function shareEvent(eventId) {
  const e = DB.get(getChurchEventsKey(),[]).find(x=>x.id===eventId);
  if (!e) return;
  const text = '🎪 ' + e.name + '\n📅 ' + e.startDate + (e.endDate&&e.endDate!==e.startDate?' ~ '+e.endDate:'') + '\n📍 ' + (e.location||'장소 미정') + '\n' + (e.price>0?'💰 '+e.price.toLocaleString()+'원':'🆓 무료') + '\n\n스마트처치에서 확인하세요!';
  try {
    if (navigator.share) await navigator.share({ title: e.name, text });
    else { await navigator.clipboard.writeText(text); toast('\U0001f4cb 행사 정보가 복사됐어요!'); }
  } catch { toast('공유 기능을 지원하지 않는 기기예요'); }
}

function applyTicket(eventId) {
  const events = DB.get(getChurchEventsKey(),[]);
  const e = events.find(x=>x.id===eventId);
  if (!e) return;
  if (e.maxTickets>0&&(e.ticketCount||0)>=e.maxTickets) { toast('마감된 행사예요'); return; }
  const myTickets = DB.get('myTickets_'+me.id,[]);
  if (myTickets.includes(eventId)) { toast('이미 신청했어요'); return; }
  myTickets.push(eventId); DB.set('myTickets_'+me.id, myTickets);
  e.ticketCount=(e.ticketCount||0)+1; DB.set(getChurchEventsKey(), events);
  // Firestore: 예약 문서 생성 + 행사 신청 수 반영
  if (window._fbReady && window._fb) {
    const scope = e.churchCode || matchScope();
    window._fb.setReservation(scope, e.id, me.id, {
      uid: me.id, eventId: e.id, churchCode: scope, name: me.name || '', createdAt: new Date().toISOString()
    }).catch(() => {});
    window._fb.setEventDoc(e.id, { ticketCount: e.ticketCount }).catch(() => {});
  }
  openSubscreen('event-detail'); toast('✅ "'+e.name+'" 신청 완료!');
}

function cancelTicket(eventId) {
  DB.set('myTickets_'+me.id, DB.get('myTickets_'+me.id,[]).filter(id=>id!==eventId));
  const events=DB.get(getChurchEventsKey(),[]), e=events.find(x=>x.id===eventId);
  if (e&&e.ticketCount>0){e.ticketCount--;DB.set(getChurchEventsKey(),events);}
  // Firestore: 예약 문서 삭제 + 행사 신청 수 반영
  if (e && window._fbReady && window._fb) {
    const scope = e.churchCode || matchScope();
    window._fb.deleteReservation(scope, e.id, me.id).catch(() => {});
    window._fb.setEventDoc(e.id, { ticketCount: e.ticketCount || 0 }).catch(() => {});
  }
  openSubscreen('event-detail'); toast('신청을 취소했어요');
}

function deleteEvent(eventId) {
  DB.set(getChurchEventsKey(), DB.get(getChurchEventsKey(),[]).filter(e=>e.id!==eventId));
  if (window._fbReady && window._fb) window._fb.deleteEventDoc(eventId).catch(() => {});
  closeSubscreen(); toast('행사를 삭제했어요');
}

async function syncEventsFromFirestore() {
  if (!window._fbReady || !window._fb || !me) return;
  try {
    const snap = await window._fb.getEventsByChurch(matchScope());
    const events = []; snap.forEach(d => events.push({ id: d.id, ...d.data() }));
    DB.set(getChurchEventsKey(), events);
    _detectNewEvents(events);
    _refreshSubscreenIfCurrent(EVENT_SUBSCREENS);
  } catch (e) { /* 로컬 캐시 유지 */ }
  // 내 티켓 예약도 Firestore 기준으로 동기화
  syncMyTicketsFromFirestore();
}

async function syncMyTicketsFromFirestore() {
  if (!window._fbReady || !window._fb || !me) return;
  try {
    const snap = await window._fb.getMyReservations(me.id);
    const ids = [];
    snap.forEach(d => { const r = d.data(); if (r && r.eventId) ids.push(r.eventId); });
    DB.set('myTickets_' + me.id, ids);   // Firestore 가 소스 → 로컬 덮어쓰기
    _refreshSubscreenIfCurrent(EVENT_SUBSCREENS);
  } catch (e) { /* collectionGroup 색인 필요 시 로컬 유지 */ }
}

function _detectNewEvents(events) {
  if (!notifPrefOn('Event')) return;
  const seenKey = 'seenEvents_' + me.id;
  const seen = DB.get(seenKey, []);
  let changed = false;
  events.forEach(e => {
    if (seen.includes(e.id)) return;
    seen.push(e.id); changed = true;
    if (e.createdById === me.id) return; // 내가 만든 행사는 알림 생략
    pushNotif({
      icon: '🎫',
      title: '새 행사가 등록됐어요',
      body: `${e.name || '행사'} · ${e.startDate || ''}`,
      dedupeId: 'event_' + e.id
    });
  });
  if (changed) DB.set(seenKey, seen);
}

async function openMemberBinder(userId, userName) {
  if (!hasLeaderPerm('binder')) { toast('삶의 예배 열람 권한이 없어요'); return; }

  // Firestore에서 공유 여부 확인 (localStorage 대신)
  let shareEnabled = false;
  try {
    if (window._fbReady && window._fb) {
      const snap = await window._fb.getUser(userId);
      if (snap.exists()) shareEnabled = snap.data().binderShareEnabled === true;
    }
  } catch(e) {
    // fallback: localStorage
    const u = DB.get('users', []).find(x => x.id === userId);
    shareEnabled = u?.binderShareEnabled === true;
  }

  if (!shareEnabled) {
    toast(`${userName}님이 공유를 허용하지 않았어요`); return;
  }
  _viewingMemberId   = userId;
  _viewingMemberName = userName;
  _viewingDate       = todayDateKey();
  openSubscreen('member-binder');
}

var _mbCalBase = null;

function renderMemberBinderScreen() {
  if (!_viewingMemberId) return `<div class="ss-empty"><div class="ss-empty-title">교인을 선택해주세요</div></div>`;
  if (!_viewingDate) _viewingDate = todayDateKey();
  _mbCalBase = null;
  setTimeout(() => {
    renderMbCalStrip();
    _loadMemberBinder(_viewingMemberId, _viewingMemberName, _viewingDate);
  }, 80);
  return `
    <!-- 날짜 네비게이터 (캘린더 스트립) -->
    <div style="background:var(--dark);position:sticky;top:0;z-index:5">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px 0">
        <span style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.7)" id="mb-cal-month"></span>
        <span style="font-size:12px;color:rgba(255,255,255,0.5)">${escHtml(_viewingMemberName)}님</span>
      </div>
      <div class="cal-strip">
        <button class="cal-strip-arrow" onclick="shiftMbCalStrip(-7)">‹</button>
        <div class="cal-strip-days" id="mb-cal-strip-days"></div>
        <button class="cal-strip-arrow" onclick="shiftMbCalStrip(7)">›</button>
      </div>
    </div>
    <!-- 바인더 내용 -->
    <div id="member-binder-body" style="padding:16px">
      <div style="text-align:center;padding:40px 16px;color:var(--muted)">
        <div style="font-size:28px;margin-bottom:12px">🔄</div>
        <div style="font-size:13px">바인더 불러오는 중...</div>
      </div>
    </div>`;
}

function renderMbCalStrip() {
  const container = document.getElementById('mb-cal-strip-days');
  if (!container) return;
  const sel = new Date(_viewingDate + 'T00:00:00');
  const weekStart = _mbCalBase ? new Date(_mbCalBase) : new Date(sel);
  if (!_mbCalBase) weekStart.setDate(sel.getDate() - sel.getDay());
  const today = todayDateKey();
  const DOW = ['일','월','화','수','목','금','토'];
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dk = d.toISOString().split('T')[0];
    const isSun = d.getDay() === 0;
    let cls = 'cal-strip-day';
    if (dk === _viewingDate) cls += ' selected';
    if (dk === today) cls += ' today';
    if (dk > today) cls += ' future';
    if (isSun) cls += ' sunday';
    html += `<div class="${cls}" onclick="goToMbDate('${dk}')">
      <div class="cal-strip-dow">${DOW[d.getDay()]}</div>
      <div class="cal-strip-num">${d.getDate()}</div>
    </div>`;
  }
  container.innerHTML = html;
  const mEl = document.getElementById('mb-cal-month');
  if (mEl) mEl.textContent = `${sel.getFullYear()}년 ${sel.getMonth()+1}월`;
}

function shiftMbCalStrip(days) {
  if (!_mbCalBase) {
    const sel = new Date(_viewingDate + 'T00:00:00');
    _mbCalBase = new Date(sel);
    _mbCalBase.setDate(sel.getDate() - sel.getDay());
  }
  _mbCalBase.setDate(_mbCalBase.getDate() + days);
  renderMbCalStrip();
}

function goToMbDate(dk) {
  if (dk > todayDateKey()) return;
  _viewingDate = dk;
  renderMbCalStrip();
  const body = document.getElementById('member-binder-body');
  if (body) body.innerHTML = `<div style="text-align:center;padding:40px 16px;color:var(--muted)">
    <div style="font-size:28px;margin-bottom:12px">🔄</div>
    <div style="font-size:13px">불러오는 중...</div>
  </div>`;
  _loadMemberBinder(_viewingMemberId, _viewingMemberName, _viewingDate);
}

function navigateMemberBinder(dir) {
  goToMbDate((() => {
    const d = new Date(_viewingDate + 'T00:00:00');
    d.setDate(d.getDate() + dir);
    return d.toISOString().split('T')[0];
  })());
}

async function _loadMemberBinder(userId, userName, date) {
  const body = document.getElementById('member-binder-body');
  if (!body) return;

  let data = {};
  try {
    if (window._fbReady && window._fb) {
      const snap = await window._fb.getBinderEntry(`${userId}_${date}`);
      if (snap.exists()) data = snap.data();
    }
  } catch(e) {
    console.warn('Firestore 바인더 로드 실패, localStorage 사용:', e);
  }
  if (!Object.keys(data).length) {
    data = DB.get(`binder_${userId}_${date}`, {});
  }

  const share    = data.shareItems || { verse:1, qt:1, todos:1, schedule:1, diary:1 };
  const verse    = (share.verse && data.verse) ? data.verse : '';
  const qt       = (share.qt    && data.qt)    ? data.qt    : '';
  const diary    = (share.diary && data.diary) ? data.diary : '';
  const schRows  = (share.schedule && Array.isArray(data.schRows))
                     ? data.schRows.filter(r => (r.time||'').trim() || (r.plan||'').trim()) : [];
  const todos    = (share.todos && Array.isArray(data.todos)) ? data.todos : [];
  const drawings = data.drawings || {};

  const hasText = verse || qt || diary || schRows.length || todos.length;
  const hasDrawing = drawings.qt || drawings.schedule || drawings.diary;

  if (!hasText && !hasDrawing) {
    body.innerHTML = `<div style="text-align:center;padding:40px 16px;color:var(--muted)">
      <div style="font-size:40px;margin-bottom:12px">📭</div>
      <div style="font-size:13px">공유된 바인더 내용이 없어요</div>
    </div>`;
    return;
  }

  let html = '<div style="display:flex;flex-direction:column;gap:10px">';

  if (verse) html += accSection('📖','말씀 묵상', `<div style="font-size:14px;line-height:1.8;white-space:pre-wrap">${escHtml(verse)}</div>`);
  if (qt) html += accSection('✍️','QT (묵상)', `<div style="font-size:14px;line-height:1.8;white-space:pre-wrap">${escHtml(qt)}</div>`);

  if (todos.length) {
    const done = todos.filter(t => t.done).length;
    html += accSection('✅', `할 일 (${done}/${todos.length})`,
      todos.map(t => `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13.5px;
        color:${t.done?'var(--muted)':'var(--black)'};text-decoration:${t.done?'line-through':'none'}">
        <span style="font-size:16px">${t.done?'☑':'☐'}</span>${escHtml(t.text||'')}</div>`).join(''));
  }

  if (schRows.length) {
    html += accSection('📅','시간표',
      schRows.map(r => `<div style="display:flex;gap:10px;font-size:13px;padding:5px 0;border-bottom:1px solid var(--cream2)">
        <span style="min-width:78px;color:var(--muted);font-weight:600">${escHtml(r.time||'')}</span>
        <span>${escHtml(r.plan||'')}</span></div>`).join(''));
  }

  if (diary) html += accSection('📓','일기', `<div style="font-size:14px;line-height:1.8;white-space:pre-wrap">${escHtml(diary)}</div>`);

  if (drawings.qt) html += accSection('🖌️','QT 손글씨', `<img src="${drawings.qt}" style="width:100%;border-radius:10px">`);
  if (drawings.schedule) html += accSection('🖌️','시간표 손글씨', `<img src="${drawings.schedule}" style="width:100%;border-radius:10px">`);
  if (drawings.diary) html += accSection('🖌️','일기 손글씨', `<img src="${drawings.diary}" style="width:100%;border-radius:10px">`);

  html += '</div>';
  body.innerHTML = html;
}

function getInviteCodes() { return DB.get('inviteCodes', {}); }

function saveInviteCodes(c) { DB.set('inviteCodes', c); }

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 문자 제외
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createInviteCode(expiryDays) {
  if (!hasLeaderPerm('invite')) { toast('초대 코드 발급 권한이 없어요'); return; }
  const codes = getInviteCodes();
  let code;
  do { code = generateInviteCode(); } while (codes[code]); // 중복 방지
  const expiresAt = expiryDays
    ? new Date(Date.now() + expiryDays * 86400000).toISOString() : null;
  codes[code] = {
    code,
    church:      me.church || '',
    orgType:     me.orgType || 'church',
    createdBy:   me.name,
    createdById: me.id,
    createdAt:   new Date().toISOString(),
    expiresAt,
    usedBy:      []
  };
  saveInviteCodes(codes);
  const expLabel = expiryDays === 7 ? '7일 유효' : expiryDays === 30 ? '30일 유효' : '무제한';
  toast(`🎫 초대 코드 [${code}] 발급됐어요! (${expLabel})`);
  // Firestore에도 저장 (다른 기기에서 사용 가능하게)
  if (window._fbReady && window._fb) {
    window._fb.setInviteCode(code, codes[code]).catch(e => console.warn('초대코드 Firestore 저장 실패:', e));
  }
  // 서브스크린 새로고침
  const cur = document.getElementById('subscreen')?.dataset?.current;
  if (cur === 'invite-codes') setTimeout(() => openSubscreen('invite-codes'), 100);
}

function deleteInviteCode(code) {
  const codes = getInviteCodes();
  delete codes[code];
  saveInviteCodes(codes);
  // Firestore에서도 삭제
  if (window._fbReady && window._fb) {
    window._fb.deleteInviteCode(code).catch(() => {});
  }
  toast(`코드 [${code}]를 삭제했어요`);
  setTimeout(() => openSubscreen('invite-codes'), 100);
}

async function copyInviteCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    toast(`📋 [${code}] 복사됐어요! 교인에게 공유하세요`);
  } catch {
    toast(`코드: ${code}  (직접 복사해 주세요)`);
  }
}

function validateInviteCode(code) {
  const codes = getInviteCodes();
  const entry = codes[code];
  if (!entry) return null;
  if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) return null;
  return entry;
}

function markInviteCodeUsed(code, userId) {
  const codes = getInviteCodes();
  if (codes[code] && !codes[code].usedBy.includes(userId)) {
    codes[code].usedBy.push(userId);
    saveInviteCodes(codes);
  }
}

function renderInviteCodesScreen() {
  if (!hasLeaderPerm('invite')) {
    return `<div class="ss-empty"><div class="ss-empty-icon">🔒</div>
      <div class="ss-empty-title">초대 코드 발급 권한이 없어요</div></div>`;
  }
  const codes = getInviteCodes();
  const myCodes = Object.values(codes).filter(c => c.createdById === me.id);
  const today = new Date();

  let html = `
    <div class="ss-section-title">새 초대 코드 발급</div>
    <div class="ss-card">
      <div style="padding:14px 16px">
        <div style="font-size:13px;color:var(--muted);margin-bottom:12px;line-height:1.6">
          발급된 코드를 교인에게 공유하면<br>승인 없이 바로 교회에 입장할 수 있어요 🎫
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button onclick="createInviteCode(7)"
            style="flex:1;min-width:80px;height:40px;border-radius:10px;border:1.5px solid var(--border);
                   background:white;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit">
            7일 유효
          </button>
          <button onclick="createInviteCode(30)"
            style="flex:1;min-width:80px;height:40px;border-radius:10px;border:1.5px solid var(--border);
                   background:white;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit">
            30일 유효
          </button>
          <button onclick="createInviteCode(null)"
            style="flex:1;min-width:80px;height:40px;border-radius:10px;border:none;
                   background:var(--black);color:white;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">
            ♾ 무제한
          </button>
        </div>
      </div>
    </div>`;

  if (myCodes.length === 0) {
    html += `<div class="ss-empty"><div class="ss-empty-icon">🎫</div>
      <div class="ss-empty-title">발급한 코드가 없어요</div>
      <div class="ss-empty-sub">위에서 새 코드를 발급해보세요</div></div>`;
  } else {
    html += `<div class="ss-section-title">내가 발급한 코드 (${myCodes.length}개)</div>
    <div class="ss-card">`;
    myCodes.reverse().forEach(c => {
      const expired = c.expiresAt && new Date(c.expiresAt) < today;
      const dLeft   = c.expiresAt
        ? Math.ceil((new Date(c.expiresAt) - today) / 86400000) : null;
      const expLabel = expired ? '⚠️ 만료됨'
        : dLeft === null ? '♾ 무제한'
        : `D-${dLeft}`;
      html += `
        <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span style="font-size:20px;font-weight:800;letter-spacing:2px;font-family:monospace;
                         color:${expired?'var(--muted)':'var(--black)'}">${c.code}</span>
            <span style="font-size:11.5px;color:${expired?'#E63946':'var(--muted)'};">${expLabel}</span>
            <span style="font-size:11.5px;color:var(--muted);margin-left:auto">${c.usedBy.length}명 사용</span>
          </div>
          <div style="display:flex;gap:8px">
            <button onclick="copyInviteCode('${c.code}')"
              style="flex:1;height:38px;border-radius:10px;border:1.5px solid var(--border);
                     background:white;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
              📋 복사
            </button>
            <button onclick="deleteInviteCode('${c.code}')"
              style="height:38px;padding:0 14px;border-radius:10px;border:1.5px solid rgba(220,0,0,0.2);
                     background:#FBE5E5;color:#C0392B;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
              삭제
            </button>
          </div>
        </div>`;
    });
    html += `</div>`;
  }
  return html;
}

function obInviteCodeInput(el) {
  el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
  const result = document.getElementById('ob-invite-result');
  const btn    = document.getElementById('ob-invite-btn');

  if (el.value.length < 8) {
    result.classList.remove('show');
    if (btn) { btn.style.opacity='0.3'; btn.disabled=true; }
    return;
  }

  // ① localStorage 먼저
  const local = validateInviteCode(el.value);
  if (local) {
    result.classList.add('show');
    document.getElementById('ob-invite-church-name').textContent = local.church || '';
    if (btn) { btn.style.opacity='1'; btn.disabled=false; }
    return;
  }

  // ② Firestore 조회
  if (window._fbReady && window._fb) {
    window._fb.getInviteCode(el.value).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        const expired = data.expiresAt && new Date(data.expiresAt) < new Date();
        if (!expired) {
          result.classList.add('show');
          document.getElementById('ob-invite-church-name').textContent = data.church || '';
          if (btn) { btn.style.opacity='1'; btn.disabled=false; }
          return;
        }
      }
      result.classList.remove('show');
      if (btn) { btn.style.opacity='0.3'; btn.disabled=true; }
    }).catch(() => {
      result.classList.remove('show');
      if (btn) { btn.style.opacity='0.3'; btn.disabled=true; }
    });
  } else {
    result.classList.remove('show');
    if (btn) { btn.style.opacity='0.3'; btn.disabled=true; }
  }
}

async function obEnterWithInviteCode() {
  const code  = document.getElementById('ob-invite-code')?.value || '';

  // ① localStorage 먼저 확인
  let entry = validateInviteCode(code);

  // ② 없으면 Firestore에서 조회 (다른 기기에서 발급된 코드)
  if (!entry && window._fbReady && window._fb) {
    try {
      const snap = await window._fb.getInviteCode(code);
      if (snap.exists()) {
        const data = snap.data();
        // 만료 확인
        if (!data.expiresAt || new Date(data.expiresAt) >= new Date()) {
          entry = data;
          // localStorage에도 캐싱
          const codes = getInviteCodes();
          codes[code] = data;
          saveInviteCodes(codes);
        }
      }
    } catch(e) { console.warn('Firestore 초대코드 조회 실패:', e); }
  }

  if (!entry) { toast('유효하지 않거나 만료된 초대 코드예요'); return; }

  // 교회 연결 (승인 없이 바로)
  obData.churchName  = entry.church;
  me.church          = entry.church;
  me.churchCode      = entry.churchCode || '';
  me.churchStatus    = 'active';
  me.orgType         = me.orgType || entry.orgType || getOrgTypeForChurch(entry.churchCode) || 'church';
  DB.saveUser(me);

  // 사용 기록
  markInviteCodeUsed(code, me.id);
  if (window._fbReady && window._fb) {
    window._fb.useInviteCode(code, me.id).catch(() => {});
  }

  toast(`🎉 "${entry.church}"에 바로 입장했어요!`);
  obGoNextAfterChurch();
}

function obRegisterNewChurch() {
  const code  = document.getElementById('ob-code').value.toUpperCase().trim();
  const name  = (document.getElementById('ob-new-church-name')?.value || '').trim();
  if (code.length < 4)   { toast('코드를 4자 이상 입력해 주세요 (예: JOYFUL)'); return; }
  if (!name)              { toast('교회/기관 이름을 입력해 주세요'); return; }
  if (OB_CHURCHES[code]) { toast(`이미 등록된 코드예요 (${getChurchName(code)})`); return; }
  const custom  = DB.get('customChurches', {});
  const existingName = getChurchName(code);
  if (existingName) { toast(`이미 ${existingName}이(가) 사용 중인 코드예요`); return; }
  // 이미 신청 중인지 확인
  const pending = DB.get('pendingChurches', []);
  if (pending.find(c => c.code === code)) {
    toast(`[${code}] 코드는 이미 승인 대기 중이에요`); return;
  }
  // 승인 대기 목록에 추가 (바로 활성화 X)
  pending.push({
    code, name,
    requestedBy:     me.id,
    requestedByName: me.name,
    requestedAt:     new Date().toISOString(),
    orgType:         me.orgType || 'church'
  });
  DB.set('pendingChurches', pending);
  // 신청자 정보 임시 저장 (승인 후 활성화)
  me.pendingChurchCode = code;
  me.pendingChurchName = name;
  me.churchStatus      = 'church-pending'; // 교회 자체가 미승인
  me.role              = me.role || '목사';
  DB.saveUser(me);
  // UI 표시
  document.getElementById('ob-code-church-name').textContent = name;
  document.getElementById('ob-code-result').classList.add('show');
  toast(`📋 "${name}" 등록 신청이 접수됐어요! 앱 관리자 승인 후 활성화돼요 🙏`);
}

function obConnectChurch() {
  const code = document.getElementById('ob-code').value.toUpperCase();
  const found = getChurchName(code);

  // 교회 코드가 유효하면 해당 교회의 orgType을 적용
  const resolvedOrgType = (code && found) ? getOrgTypeForChurch(code) : _obOrgType;

  // 유형/직분 저장
  const selectedRole = resolvedOrgType === 'personal'
    ? '개인'
    : (document.getElementById('ob-role-select')?.value || getDefaultRole(resolvedOrgType));
  me.role    = selectedRole;
  me.orgType = resolvedOrgType;

  if (code && found) {
    obData.churchName  = found;
    me.church          = found;
    me.churchCode      = code;
    const isFounder = me.churchCode === code && me.churchStatus === 'active';
    me.churchStatus = isFounder ? 'active' : 'pending';
    me.registrationType = 'regular'; // 온보딩 첫 가입
  }
  DB.saveUser(me);

  // Firestore 동기화
  if (window._fbReady && window._fb) {
    window._fb.updateUser(me.id, {
      role: me.role, orgType: me.orgType,
      church: me.church || '', churchCode: me.churchCode || '',
      churchStatus: me.churchStatus || ''
    }).catch(() => {});
  }

  obGoNextAfterChurch();
}

function changeChurchCode() {
  const code     = (document.getElementById('new-church-code')?.value || '').trim().toUpperCase();
  const churchName = getChurchName(code);
  if (!code)        { toast('교회 코드를 입력해 주세요'); return; }
  if (!churchName)  { toast('유효하지 않은 교회 코드예요'); return; }
  if (churchName === me.church) { toast('이미 소속된 교회예요'); return; }

  const wasPersonal = me.orgType === 'personal';
  const newOrgType = getOrgTypeForChurch(code);
  const newDefRole = getDefaultRole(newOrgType);
  if (wasPersonal) { me.orgType = newOrgType; me.role = newDefRole; }

  const users = DB.get('users', []);
  const u = users.find(x => x.id === me.id);
  if (u) {
    u.church           = churchName;
    u.churchCode       = code;
    u.churchStatus     = me.isAppAdmin ? 'active' : 'pending';
    u.registrationType = wasPersonal ? 'newfamily' : 'regular';
    if (wasPersonal) { u.orgType = newOrgType; u.role = newDefRole; }
    DB.set('users', users);
    me.church           = churchName;
    me.churchCode       = code;
    me.churchStatus     = me.isAppAdmin ? 'active' : 'pending';
    me.registrationType = wasPersonal ? 'newfamily' : 'regular';
  }

  if (window._fbReady && window._fb) {
    const update = { church: me.church, churchCode: me.churchCode, churchStatus: me.churchStatus, registrationType: me.registrationType };
    if (wasPersonal) { update.orgType = newOrgType; update.role = newDefRole; }
    window._fb.updateUser(me.id, update).catch(() => {});
    // 사진 문서의 churchCode 도 갱신 → 새 교회 교인 목록에 사진 노출
    if (typeof getMyPhoto === 'function' && getMyPhoto()) {
      window._fb.setUserPhoto(me.id, { churchCode: me.churchCode }).catch(() => {});
    }
  }
  // 새 교회 사진 캐시를 다시 로드하도록 예열 가드 해제
  if (typeof _photoCacheWarmed !== 'undefined') _photoCacheWarmed = false;

  updateProfileDisplay();
  initSideMenu();
  closeSubscreen();

  const msg = me.isAppAdmin
    ? `✅ ${churchName}으로 이동했어요!`
    : wasPersonal
      ? `✅ ${churchName} 새가족으로 등록됐어요! 리더 승인 후 정식 성도가 돼요 🙏`
      : `✅ ${churchName}으로 변경됐어요! 리더 승인 후 정식 성도가 돼요 🙏`;
  toast(msg);
}

function obGoNextAfterChurch() {
  if (obGetSuggestedChallenges().length > 0) {
    renderObChallenges();
    obData.picks = []; // 선택 초기화
    obGo(3);
  } else {
    obFinish();
  }
}

