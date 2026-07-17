// ===== moved from index.html (feature: matching) — 전역(window) 공유 스코프 =====
function matchProfilesKey() { return 'matchProfiles_' + (me.churchCode || me.church || 'default'); }

function matchReqsKey()     { return 'matchReqs_'     + (me.churchCode || me.church || 'default'); }

function getMyMatchProfile(type) {
  return DB.get(matchProfilesKey(), []).find(p => p.userId === me.id && p.type === type);
}

function getMatchProfiles(type) {
  return DB.get(matchProfilesKey(), []).filter(p => p.type === type && p.status !== 'closed');
}

function getAllMyMatchProfiles() {
  return DB.get(matchProfilesKey(), []).filter(p => p.userId === me.id);
}

function matchScope() { return me.churchCode || me.church || 'default'; }

function userAge(birthdate) {
  const bd = birthdate || (me && me.birthdate);
  if (!bd) return null;
  const b = new Date(bd);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

function isAdult() { const a = userAge(); return a !== null && a >= 19; }

function saveMatchProfile(data) {
  const profiles = DB.get(matchProfilesKey(), []);
  const idx = profiles.findIndex(p => p.userId === me.id && p.type === data.type);
  const now = new Date().toISOString();
  let profile;
  if (idx >= 0) { profiles[idx] = { ...profiles[idx], ...data, updatedAt: now }; profile = profiles[idx]; }
  else { profile = { ...data, id: uid(), userId: me.id, userName: me.name, createdAt: now }; profiles.push(profile); }
  profile.churchCode = matchScope();  // Firestore 교회 단위 조회용
  DB.set(matchProfilesKey(), profiles);
  // Firestore 동기화 (교인 간 공유)
  if (window._fbReady && window._fb) window._fb.setMatchProfileDoc(profile.id, profile).catch(() => {});
}

function deleteMyMatchProfile(type) {
  const all     = DB.get(matchProfilesKey(), []);
  const removed = all.filter(p => p.userId === me.id && p.type === type);
  DB.set(matchProfilesKey(), all.filter(p => !(p.userId === me.id && p.type === type)));
  if (window._fbReady && window._fb) removed.forEach(p => window._fb.deleteMatchProfileDoc(p.id).catch(() => {}));
}

function getMatchReqsSent(type) {
  return DB.get(matchReqsKey(), []).filter(r => r.fromId === me.id && (!type || r.type === type));
}

function getMatchReqsReceived(type) {
  return DB.get(matchReqsKey(), []).filter(r => r.toId === me.id && (!type || r.type === type));
}

function doSendMatchReq(toId, profileId, type, msg) {
  const reqs = DB.get(matchReqsKey(), []);
  if (reqs.find(r => r.fromId === me.id && r.profileId === profileId && r.status === 'pending')) {
    toast('이미 신청한 프로필이에요'); return false;
  }
  const req = { id: uid(), fromId: me.id, fromName: me.name, toId, profileId, type, msg: msg||'', status: 'pending', createdAt: new Date().toISOString(), churchCode: matchScope() };
  reqs.push(req);
  DB.set(matchReqsKey(), reqs);
  if (window._fbReady && window._fb) window._fb.setMatchRequestDoc(req.id, req).catch(() => {});
  return true;
}

function respondMatchReq(reqId, accept) {
  const reqs = DB.get(matchReqsKey(), []);
  const req = reqs.find(r => r.id === reqId);
  if (!req) return;

  // 수락 시 인원 초과 체크 (취미 매칭)
  if (accept && req.type === 'hobby') {
    const profiles = DB.get(matchProfilesKey(), []);
    const profile = profiles.find(p => p.id === req.profileId);
    if (profile?.maxCount) {
      const acceptedCount = reqs.filter(r => r.profileId === req.profileId && r.status === 'accepted').length;
      if (acceptedCount >= profile.maxCount - 1) {
        toast('😅 이미 모집 인원이 다 찼어요'); return;
      }
    }
  }

  req.status = accept ? 'accepted' : 'rejected';
  req.respondedAt = new Date().toISOString();
  DB.set(matchReqsKey(), reqs);
  if (window._fbReady && window._fb) window._fb.setMatchRequestDoc(req.id, { status: req.status, respondedAt: req.respondedAt }).catch(() => {});
  if (accept) {
    const profiles = DB.get(matchProfilesKey(), []);
    const p = profiles.find(x => x.id === req.profileId);
    if (p) {
      p.status = 'matched';
      DB.set(matchProfilesKey(), profiles);
      if (window._fbReady && window._fb) window._fb.setMatchProfileDoc(p.id, { status: 'matched' }).catch(() => {});
    }
    // 수락 시 채팅방 자동 생성: 2명 → 1:1 DM, 3명 이상 → 그룹 채팅
    createMatchChatRoom(req);
  }
  toast(accept ? '✅ 수락했어요! 연결이 됐어요 🤝' : '거절했어요');
  openSubscreen('match-inbox');
}

// 수락된 인원수에 따라 1:1 DM 또는 그룹 채팅방으로 라우팅
function createMatchChatRoom(req) {
  if (!req) return;
  const reqs = DB.get(matchReqsKey(), []);
  // 같은 프로필에 수락된 모든 요청 → 그룹 구성원 판단
  const accepted = reqs.filter(r => r.profileId === req.profileId && r.status === 'accepted');
  // 프로필 소유자(toId=수락자=me) + 수락된 요청자(fromId)들
  const ownerId = req.toId;
  const memberMap = new Map();
  memberMap.set(ownerId, ownerId === me.id ? (me.name || '방장') : '방장');
  accepted.forEach(r => { if (r.fromId) memberMap.set(r.fromId, r.fromName || '멤버'); });

  if (memberMap.size >= 3) _createMatchGroupRoom(req, memberMap);
  else                     createMatchDMRoom(req);
}

function _createMatchGroupRoom(req, memberMap) {
  const roomId      = 'match_' + req.profileId;   // 프로필당 하나의 그룹방 (결정적 ID)
  const memberIds   = [...memberMap.keys()];
  const memberNames = [...memberMap.values()];
  const roomName    = matchTypeLabel(req.type) + ' 그룹';
  const rooms = getChatRooms();
  const existing = rooms.find(r => r.id === roomId);
  const room = {
    id:            roomId,
    type:          'group',
    name:          roomName,
    emoji:         '🤝',
    members:       memberIds,        // 전체 멤버 UID → 각자 listenMyRooms 로 방 수신
    memberNames,
    createdBy:     req.toId,
    createdAt:     existing?.createdAt || new Date().toISOString(),
    lastMessage:   `🤝 ${roomName}이 만들어졌어요`,
    lastMessageAt: new Date().toISOString(),
    lastSenderId:  'system',
    fromMatch:     true
  };
  if (existing) Object.assign(existing, room); else rooms.push(room);
  saveChatRooms(rooms);
  if (window._fbReady && window._fb) {
    // 전체 멤버 배열로 덮어써 새로 합류한 멤버도 방을 받도록 함
    window._fb.ensureChatRoom(roomId, room).catch(() => {});
    window._fb.sendChatMsg(roomId, {
      text: `🤝 ${roomName}에 ${memberIds.length}명이 모였어요! 반갑게 인사 나눠보세요 😊`,
      senderId: 'system', senderName: '스마트처치', senderRole: '', senderPhoto: null
    }).catch(() => {});
  }
  toast(`💬 ${roomName} 채팅방이 열렸어요! (${memberIds.length}명)`);
}

function createMatchDMRoom(req) {
  if (!req || !req.fromId || req.fromId === me.id) return;
  const partnerId   = req.fromId;
  const partnerName = req.fromName || '상대방';
  const rooms = getChatRooms();
  // 이미 있는 1:1 방이면 재사용
  let room = rooms.find(r => r.type === 'dm' && (r.members || []).includes(partnerId));
  if (!room) {
    room = {
      id:            'dm_' + [me.id, partnerId].sort().join('_'), // 두 사람 공통 결정적 ID
      type:          'dm',
      name:          partnerName,       // 생성자(수락자) 관점 표시명 — 기존 DM 규칙과 동일
      emoji:         '💛',
      members:       [me.id, partnerId],
      memberNames:   [partnerName],
      createdBy:     me.id,
      createdAt:     new Date().toISOString(),
      lastMessage:   `🤝 ${matchTypeLabel(req.type)}(으)로 연결되었어요`,
      lastMessageAt: new Date().toISOString(),
      lastSenderId:  'system',
      fromMatch:     true
    };
    rooms.push(room);
    saveChatRooms(rooms);
  }
  // Firestore 저장 → 상대방도 listenMyRooms 로 방을 받게 됨
  if (window._fbReady && window._fb) {
    window._fb.ensureChatRoom(room.id, room).catch(() => {});
    window._fb.sendChatMsg(room.id, {
      text: `🤝 ${matchTypeLabel(req.type)} 매칭으로 연결되었어요! 반갑게 인사해보세요 😊`,
      senderId: 'system', senderName: '스마트처치', senderRole: '', senderPhoto: null
    }).catch(() => {});
  }
  toast('💬 매칭 상대와 1:1 채팅방이 열렸어요!');
}

function matchTypeLabel(type) {
  return type === 'hobby' ? '취미 매칭' : type === 'prayer' ? '기도 파트너'
       : type === 'romance' ? '이성 교제' : '멘토링';
}

async function syncMatchingFromFirestore() {
  if (!window._fbReady || !window._fb || !me) return;
  try {
    const [pSnap, rSnap] = await Promise.all([
      window._fb.getMatchProfilesByChurch(matchScope()),
      window._fb.getMatchRequestsByChurch(matchScope())
    ]);
    const profiles = []; pSnap.forEach(d => profiles.push({ id: d.id, ...d.data() }));
    const reqs     = []; rSnap.forEach(d => reqs.push({ id: d.id, ...d.data() }));
    DB.set(matchProfilesKey(), profiles);
    DB.set(matchReqsKey(), reqs);
    _detectNewMatchReqs(reqs);
    _refreshSubscreenIfCurrent(MATCH_SUBSCREENS);
  } catch (e) { /* 색인/권한 문제 시 로컬 캐시 유지 */ }
}

function _detectNewMatchReqs(reqs) {
  const seenKey = 'seenMatchReqs_' + me.id;
  const seen = DB.get(seenKey, []);
  const mine = reqs.filter(r => r.toId === me.id && r.status === 'pending');
  let changed = false;
  mine.forEach(r => {
    if (seen.includes(r.id)) return;
    seen.push(r.id); changed = true;
    pushNotif({
      icon: '📬',
      title: '새 매칭 신청',
      body: `${r.fromName || '누군가'}님이 ${matchTypeLabel(r.type)} 신청을 보냈어요`,
      dedupeId: 'matchreq_' + r.id
    });
  });
  if (changed) DB.set(seenKey, seen);
}

function openMatchingBrowse() { openSubscreen('matching-browse'); }

function renderMatchingBrowse() {
  const hobbyCount  = getMatchProfiles('hobby').filter(p => p.userId !== me.id && p.status !== 'matched').length;
  const prayerCount = getMatchProfiles('prayer').filter(p => p.userId !== me.id && p.status !== 'matched').length;
  const mentorCount = getMatchProfiles('mentor').filter(p => p.userId !== me.id && p.status !== 'matched').length;
  const romanceCount = isAdult() ? getMatchProfiles('romance').filter(p => p.userId !== me.id && p.status !== 'matched').length : 0;
  const myProfiles  = getAllMyMatchProfiles();
  const pendingIn   = getMatchReqsReceived().filter(r => r.status === 'pending');

  const card = (screenId, icon, title, sub, count, hasMe) => `
    <div onclick="openSubscreen('${screenId}')" style="background:white;border-radius:16px;border:1.5px solid var(--border);padding:16px;margin-bottom:12px;cursor:pointer;display:flex;align-items:center;gap:14px">
      <div style="width:52px;height:52px;border-radius:14px;background:var(--cream2);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0">${icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:800;margin-bottom:3px">${title}</div>
        <div style="font-size:12.5px;color:var(--muted);line-height:1.5">${sub}</div>
        <div style="margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${count > 0 ? `<span style="font-size:11.5px;color:#2980B9;font-weight:700">${count}명 모집중</span>` : `<span style="font-size:11.5px;color:var(--muted)">아직 없어요</span>`}
          ${hasMe ? `<span style="font-size:11px;background:rgba(39,174,96,0.12);color:#27AE60;border-radius:6px;padding:2px 7px;font-weight:700">✅ 등록됨</span>` : ''}
        </div>
      </div>
      <span style="color:var(--muted);font-size:20px">›</span>
    </div>`;

  return `<div style="padding:16px 16px 24px">
    ${pendingIn.length ? `
      <div onclick="openSubscreen('match-inbox')" style="background:rgba(201,169,110,0.1);border:1.5px solid rgba(201,169,110,0.4);border-radius:14px;padding:12px 16px;margin-bottom:16px;cursor:pointer;display:flex;align-items:center;gap:10px">
        <span style="font-size:24px">📬</span>
        <div style="flex:1">
          <div style="font-size:13.5px;font-weight:800">받은 매칭 신청 ${pendingIn.length}건</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">확인하고 수락 또는 거절해보세요</div>
        </div>
        <span style="color:var(--muted);font-size:18px">›</span>
      </div>` : ''}
    <div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px;margin-bottom:12px;text-transform:uppercase">매칭 종류 선택</div>
    ${card('hobby-match',  '🎯', '취미 매칭',   '같은 취미를 가진 교인과 소모임을 만들어요', hobbyCount,  !!myProfiles.find(p=>p.type==='hobby'))}
    ${card('prayer-match', '🙏', '기도 파트너', '비슷한 기도 제목으로 함께 중보기도해요',   prayerCount, !!myProfiles.find(p=>p.type==='prayer'))}
    ${card('mentor-match', '🌱', '멘토링',       '신앙 선배/후배와 1:1로 연결돼요',           mentorCount, !!myProfiles.find(p=>p.type==='mentor'))}
    ${isAdult()
      ? card('romance-match', '💑', '이성 교제 <span style="font-size:10px;background:rgba(231,76,60,0.12);color:#E74C3C;border-radius:5px;padding:1px 6px;font-weight:700;margin-left:4px">🔞 성인</span>', '신앙 안에서 진지한 만남을 찾아요', romanceCount, !!myProfiles.find(p=>p.type==='romance'))
      : `<div onclick="_romanceLockedNotice()" style="background:var(--cream2);border-radius:16px;border:1.5px dashed var(--border);padding:16px;margin-bottom:12px;cursor:pointer;display:flex;align-items:center;gap:14px;opacity:0.85">
          <div style="width:52px;height:52px;border-radius:14px;background:white;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0">🔒</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:800;margin-bottom:3px">이성 교제 <span style="font-size:10px;background:rgba(231,76,60,0.12);color:#E74C3C;border-radius:5px;padding:1px 6px;font-weight:700">🔞 성인 전용</span></div>
            <div style="font-size:12.5px;color:var(--muted);line-height:1.5">만 19세 이상만 이용할 수 있어요${userAge()!==null?` · 현재 만 ${userAge()}세`:''}</div>
          </div>
          <span style="color:var(--muted);font-size:20px">›</span>
        </div>`}
  </div>`;
}

function _romanceLockedNotice() {
  const age = userAge();
  if (age === null) toast('마이페이지에서 생년월일을 등록하면 이용할 수 있어요 🔞');
  else toast(`만 19세 이상만 이용할 수 있어요 (현재 만 ${age}세) 🔞`);
}

function _renderMatchProfileCard(p, sentReqs) {
  const sentReq = sentReqs.find(r => r.profileId === p.id);

  // 취미 매칭: 인원 현황
  let isFull = false, memberBadge = '';
  if (p.type === 'hobby' && p.maxCount) {
    const acceptedCount = DB.get(matchReqsKey(), []).filter(r => r.profileId === p.id && r.status === 'accepted').length;
    const remaining = p.maxCount - 1 - acceptedCount;
    isFull = remaining <= 0;
    const pct = Math.round(((acceptedCount + 1) / p.maxCount) * 100);
    memberBadge = `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:12px;font-weight:700;color:${isFull?'#E74C3C':'#2980B9'}">
            👥 ${acceptedCount + 1}/${p.maxCount}명 ${isFull ? '· 마감' : `· 잔여 ${remaining}자리`}
          </span>
        </div>
        <div style="height:5px;background:var(--cream2);border-radius:10px;overflow:hidden">
          <div style="height:100%;width:${Math.min(pct,100)}%;background:${isFull?'#E74C3C':'var(--black)'};border-radius:10px"></div>
        </div>
      </div>`;
  }

  let chips = '';
  if (p.type === 'hobby')  chips = (p.hobbies||[]).map(h=>`<span style="background:var(--cream2);border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:600">${escHtml(h)}</span>`).join('');
  if (p.type === 'prayer') chips = p.prayerTopic ? `<span style="background:rgba(41,128,185,0.1);color:#2980B9;border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:700">${escHtml(p.prayerTopic)}</span>` : '';
  if (p.type === 'mentor') chips = `<span style="background:${p.mentorRole==='mentor'?'rgba(39,174,96,0.1)':'rgba(243,156,18,0.1)'};color:${p.mentorRole==='mentor'?'#27AE60':'#E67E22'};border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:700">${p.mentorRole==='mentor'?'🎓 멘토':'🌱 멘티'}</span>` +
    (p.mentorArea ? ` <span style="background:var(--cream2);border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:600">${escHtml(p.mentorArea)}</span>` : '');
  if (p.type === 'romance') chips = `<span style="background:${p.gender==='brother'?'rgba(41,128,185,0.1)':'rgba(231,76,60,0.1)'};color:${p.gender==='brother'?'#2980B9':'#E74C3C'};border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:700">${p.gender==='brother'?'🙋‍♂️ 형제':'🙋‍♀️ 자매'}</span>` +
    (p.age ? ` <span style="background:var(--cream2);border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:600">만 ${p.age}세</span>` : '') +
    (p.lookingFor ? ` <span style="background:var(--cream2);border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:600">${escHtml(p.lookingFor)}</span>` : '');

  let actionHtml = '';
  if (p.status === 'matched') {
    actionHtml = `<div style="font-size:12px;color:var(--muted);text-align:center;padding:6px;background:var(--cream2);border-radius:8px;font-weight:600">이미 매칭 완료됨</div>`;
  } else if (isFull && (!sentReq || sentReq.status !== 'accepted')) {
    actionHtml = `<div style="font-size:12px;color:#E74C3C;text-align:center;padding:6px;background:rgba(231,76,60,0.08);border-radius:8px;font-weight:700">🚫 모집 마감</div>`;
  } else if (sentReq) {
    if (sentReq.status === 'accepted') {
      // 수락된 참여자: 수락됨 + 나가기 버튼
      actionHtml = `
        <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(39,174,96,0.06);border:1.5px solid rgba(39,174,96,0.2);border-radius:10px;padding:8px 12px">
          <span style="font-size:12.5px;font-weight:700;color:#27AE60">✅ 참여 중</span>
          <button onclick="openMatchActionModal('leave','${sentReq.id}','${p.userName.replace(/'/g,"\\'")}','${p.type}')"
            style="height:28px;padding:0 12px;border-radius:7px;border:1.5px solid rgba(192,57,43,0.3);background:#FBE5E5;color:#C0392B;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">나가기</button>
        </div>`;
    } else if (sentReq.status === 'left') {
      actionHtml = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;color:var(--muted);font-weight:600">나갔어요</span>
          <button onclick="openMatchReqModal('${p.id}','${p.userId}','${p.userName.replace(/'/g,"\\'")}','${p.type}')"
            style="height:28px;padding:0 12px;border-radius:7px;border:1.5px solid var(--border);background:white;color:var(--dark);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">다시 신청</button>
        </div>`;
    } else if (sentReq.status === 'kicked') {
      actionHtml = `<div style="font-size:12px;color:#C0392B;text-align:center;padding:6px;background:rgba(192,57,43,0.06);border-radius:8px;font-weight:600">이 모임에서 내보내졌어요</div>`;
    } else {
      const colors = {pending:'rgba(243,156,18,0.12)/#E67E22/신청 완료', rejected:'var(--cream2)/var(--muted)/거절됨'};
      const [bg, color, label] = (colors[sentReq.status]||'var(--cream2)/var(--muted)/알 수 없음').split('/');
      actionHtml = `<div style="text-align:center"><span style="font-size:12px;background:${bg};color:${color};border-radius:6px;padding:4px 12px;font-weight:700">${label}</span></div>`;
    }
  } else {
    actionHtml = `<button onclick="openMatchReqModal('${p.id}','${p.userId}','${p.userName.replace(/'/g,"\\'")}','${p.type}')" style="width:100%;height:38px;border-radius:10px;border:none;background:var(--black);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">🤝 매칭 신청</button>`;
  }
  return `
    <div style="background:white;border-radius:14px;border:1.5px solid ${isFull&&(!sentReq||sentReq.status!=='accepted')?'rgba(231,76,60,0.2)':'var(--border)'};padding:14px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:14.5px;font-weight:800">${escHtml(p.userName)}</div>
        <span style="font-size:11px;color:var(--muted)">${p.createdAt ? new Date(p.createdAt).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'}) : ''}</span>
      </div>
      ${chips ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">${chips}</div>` : ''}
      ${p.bio ? `<div style="font-size:13px;color:#444;line-height:1.6;margin-bottom:10px">${escHtml(p.bio)}</div>` : ''}
      ${memberBadge}
      ${actionHtml}
    </div>`;
}

function _renderMyMatchBanner(myProfile, type) {
  const pendingReqs = getMatchReqsReceived(type).filter(r => r.status === 'pending');
  const allReqs     = DB.get(matchReqsKey(), []);

  // 내 프로필 ID 찾기
  const myP = DB.get(matchProfilesKey(), []).find(p => p.userId === me.id && p.type === type);
  const myProfileId = myP?.id;

  let chips = '';
  if (type === 'hobby')  chips = (myProfile.hobbies||[]).map(h=>`<span style="background:rgba(201,169,110,0.2);color:var(--dark);border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:600">${escHtml(h)}</span>`).join('');
  if (type === 'prayer') chips = myProfile.prayerTopic ? `<span style="background:rgba(201,169,110,0.2);color:var(--dark);border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:600">${escHtml(myProfile.prayerTopic)}</span>` : '';
  if (type === 'mentor') chips = (myProfile.mentorRole==='mentor'?'🎓 멘토':'🌱 멘티') + (myProfile.mentorArea ? ` · ${myProfile.mentorArea}` : '');
  if (type === 'romance') chips = `<span style="background:rgba(201,169,110,0.2);color:var(--dark);border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:600">${myProfile.gender==='brother'?'🙋‍♂️ 형제':'🙋‍♀️ 자매'}</span>` +
    (myProfile.age ? ` <span style="background:rgba(201,169,110,0.2);color:var(--dark);border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:600">만 ${myProfile.age}세</span>` : '');

  // 인원 현황 바 (취미만)
  let memberBar = '';
  if (type === 'hobby' && myProfile.maxCount && myProfileId) {
    const accepted = allReqs.filter(r => r.profileId === myProfileId && r.status === 'accepted').length;
    const total = accepted + 1;
    const max   = myProfile.maxCount;
    const pct   = Math.round((total / max) * 100);
    memberBar = `
      <div style="margin-top:8px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="font-size:12px;font-weight:700;color:var(--dark)">👥 ${total}/${max}명</span>
          <span style="font-size:11.5px;color:var(--muted)">잔여 ${Math.max(0, max-total)}자리</span>
        </div>
        <div style="height:4px;background:rgba(0,0,0,0.08);border-radius:10px;overflow:hidden">
          <div style="height:100%;width:${Math.min(pct,100)}%;background:var(--gold);border-radius:10px"></div>
        </div>
      </div>`;
  }

  // 멤버 목록 (방장 전용 — 수락된 멤버 + 추방 버튼)
  let memberList = '';
  if (myProfileId) {
    const activeMembers = allReqs.filter(r => r.profileId === myProfileId && r.status === 'accepted');
    if (activeMembers.length) {
      memberList = `
        <div style="margin-top:12px;border-top:1px solid rgba(201,169,110,0.3);padding-top:10px">
          <div style="font-size:11.5px;font-weight:700;color:var(--gold);margin-bottom:8px">참여 멤버 (${activeMembers.length}명)</div>
          ${activeMembers.map(r => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.05)">
              <span style="font-size:13px;font-weight:600">👤 ${escHtml(r.fromName)}</span>
              <button onclick="openMatchActionModal('kick','${r.id}','${r.fromName.replace(/'/g,"\\'")}','${type}')"
                style="height:26px;padding:0 10px;border-radius:6px;border:1.5px solid rgba(192,57,43,0.25);background:#FBE5E5;color:#C0392B;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit">내보내기</button>
            </div>`).join('')}
        </div>`;
    }
  }

  return `
    <div style="background:rgba(201,169,110,0.08);border:1.5px solid rgba(201,169,110,0.35);border-radius:14px;padding:14px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <span style="font-size:11.5px;font-weight:700;color:var(--gold)">MY 프로필 (방장)</span>
        <div style="display:flex;gap:6px;align-items:center">
          ${pendingReqs.length ? `<span onclick="openSubscreen('match-inbox')" style="font-size:11px;background:rgba(231,76,60,0.12);color:#E74C3C;border-radius:6px;padding:2px 8px;cursor:pointer;font-weight:700">📬 신청 ${pendingReqs.length}건</span>` : ''}
          <button onclick="open${type.charAt(0).toUpperCase()+type.slice(1)}ProfileModal()" style="font-size:11.5px;height:26px;padding:0 10px;border-radius:6px;border:1.5px solid var(--border);background:white;cursor:pointer;font-family:inherit;font-weight:600">✏️ 수정</button>
        </div>
      </div>
      <div style="font-size:14px;font-weight:700;margin-bottom:6px">${escHtml(me.name)}</div>
      ${type !== 'mentor' ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:${myProfile.bio?'6px':'0'}">${chips}</div>` : `<div style="font-size:13px;color:#555;margin-bottom:${myProfile.bio?'6px':'0'}">${chips}</div>`}
      ${myProfile.bio ? `<div style="font-size:13px;color:var(--muted);line-height:1.6">${escHtml(myProfile.bio)}</div>` : ''}
      ${memberBar}
      ${memberList}
    </div>`;
}

function renderHobbyMatch() {
  const myProfile = getMyMatchProfile('hobby');
  const others    = getMatchProfiles('hobby').filter(p => p.userId !== me.id);
  const sentReqs  = getMatchReqsSent('hobby');
  let html = `
    <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:13px;font-weight:700;color:var(--muted)">🎯 취미 매칭</span>
      <button onclick="openHobbyProfileModal()" style="height:34px;padding:0 14px;border-radius:20px;border:none;background:var(--black);color:white;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">${myProfile ? '✏️ 내 프로필 수정' : '+ 프로필 등록'}</button>
    </div>
    <div style="padding:14px 16px 24px">`;
  if (myProfile) html += _renderMyMatchBanner(myProfile, 'hobby');
  if (!others.length) {
    html += `<div class="ss-empty" style="padding:24px 0"><div class="ss-empty-icon">🎯</div><div class="ss-empty-title">아직 없어요</div><div class="ss-empty-sub">${myProfile ? '다른 교인이 등록하면 보여요' : '첫 번째로 등록해보세요!'}</div></div>`;
  } else {
    others.forEach(p => { html += _renderMatchProfileCard(p, sentReqs); });
  }
  return html + '</div>';
}

function renderPrayerMatch() {
  const myProfile = getMyMatchProfile('prayer');
  const others    = getMatchProfiles('prayer').filter(p => p.userId !== me.id);
  const sentReqs  = getMatchReqsSent('prayer');
  let html = `
    <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:13px;font-weight:700;color:var(--muted)">🙏 기도 파트너</span>
      <button onclick="openPrayerProfileModal()" style="height:34px;padding:0 14px;border-radius:20px;border:none;background:var(--black);color:white;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">${myProfile ? '✏️ 내 프로필 수정' : '+ 파트너 구하기'}</button>
    </div>
    <div style="padding:14px 16px 24px">`;
  if (myProfile) html += _renderMyMatchBanner(myProfile, 'prayer');
  if (!others.length) {
    html += `<div class="ss-empty" style="padding:24px 0"><div class="ss-empty-icon">🙏</div><div class="ss-empty-title">아직 없어요</div><div class="ss-empty-sub">${myProfile ? '다른 교인이 등록하면 알려드릴게요' : '기도 파트너를 먼저 구해보세요!'}</div></div>`;
  } else {
    others.forEach(p => { html += _renderMatchProfileCard(p, sentReqs); });
  }
  return html + '</div>';
}

function renderMentorMatch() {
  const myProfile = getMyMatchProfile('mentor');
  const others    = getMatchProfiles('mentor').filter(p => p.userId !== me.id);
  const mentors   = others.filter(p => p.mentorRole === 'mentor' && p.status !== 'matched');
  const mentees   = others.filter(p => p.mentorRole === 'mentee' && p.status !== 'matched');
  const sentReqs  = getMatchReqsSent('mentor');
  let html = `
    <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:13px;font-weight:700;color:var(--muted)">🌱 멘토링</span>
      <button onclick="openMentorProfileModal()" style="height:34px;padding:0 14px;border-radius:20px;border:none;background:var(--black);color:white;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">${myProfile ? '✏️ 내 프로필 수정' : '+ 등록하기'}</button>
    </div>
    <div style="padding:14px 16px 24px">`;
  if (myProfile) html += _renderMyMatchBanner(myProfile, 'mentor');
  if (!mentors.length && !mentees.length) {
    html += `<div class="ss-empty" style="padding:24px 0"><div class="ss-empty-icon">🌱</div><div class="ss-empty-title">아직 없어요</div><div class="ss-empty-sub">${myProfile ? '다른 교인이 등록하면 보여요' : '멘토 또는 멘티로 등록해보세요!'}</div></div>`;
  } else {
    if (mentors.length) {
      html += `<div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px;margin-bottom:10px;padding:0 2px">🎓 멘토 (${mentors.length}명)</div>`;
      mentors.forEach(p => { html += _renderMatchProfileCard(p, sentReqs); });
    }
    if (mentees.length) {
      html += `<div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px;margin:${mentors.length?'16px':'0'} 0 10px;padding:0 2px">🌱 멘티 (${mentees.length}명)</div>`;
      mentees.forEach(p => { html += _renderMatchProfileCard(p, sentReqs); });
    }
  }
  return html + '</div>';
}

function renderRomanceMatch() {
  if (!isAdult()) {
    return `<div class="ss-empty">
      <div class="ss-empty-icon">🔒</div>
      <div class="ss-empty-title">성인 전용 서비스예요</div>
      <div class="ss-empty-sub">만 19세 이상만 이용할 수 있어요${userAge()!==null?` (현재 만 ${userAge()}세)`:'<br>마이페이지에서 생년월일을 등록해 주세요'}</div>
    </div>`;
  }
  const myProfile = getMyMatchProfile('romance');
  let others      = getMatchProfiles('romance').filter(p => p.userId !== me.id);
  // 내 프로필이 있으면 반대 성별만 노출
  if (myProfile?.gender) {
    const opp = myProfile.gender === 'brother' ? 'sister' : 'brother';
    others = others.filter(p => p.gender === opp);
  }
  const sentReqs = getMatchReqsSent('romance');
  let html = `
    <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:13px;font-weight:700;color:var(--muted)">💑 이성 교제 <span style="font-size:10px;background:rgba(231,76,60,0.12);color:#E74C3C;border-radius:5px;padding:1px 6px;font-weight:700">🔞 성인</span></span>
      <button onclick="openRomanceProfileModal()" style="height:34px;padding:0 14px;border-radius:20px;border:none;background:var(--black);color:white;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">${myProfile ? '✏️ 내 프로필 수정' : '+ 프로필 등록'}</button>
    </div>
    <div style="padding:14px 16px 24px">`;
  if (myProfile) html += _renderMyMatchBanner(myProfile, 'romance');
  if (!others.length) {
    html += `<div class="ss-empty" style="padding:24px 0"><div class="ss-empty-icon">💑</div><div class="ss-empty-title">아직 없어요</div><div class="ss-empty-sub">${myProfile ? '상대가 등록하면 보여드릴게요' : '먼저 프로필을 등록해보세요!'}</div></div>`;
  } else {
    others.forEach(p => { html += _renderMatchProfileCard(p, sentReqs); });
  }
  return html + '</div>';
}

function openRomanceProfileModal() {
  if (!isAdult()) { _romanceLockedNotice(); return; }
  const existing = getMyMatchProfile('romance');
  const g = existing?.gender;
  document.getElementById('romance-gender-m').checked = g === 'brother';
  document.getElementById('romance-gender-f').checked = g === 'sister';
  document.getElementById('romance-bio').value     = existing?.bio || '';
  document.getElementById('romance-looking').value = existing?.lookingFor || '';
  document.getElementById('modal-romance-profile').classList.add('open');
}

function closeRomanceProfileModal(e) {
  if (!e || e.target.id === 'modal-romance-profile')
    document.getElementById('modal-romance-profile').classList.remove('open');
}

function saveRomanceProfile() {
  if (!isAdult()) { _romanceLockedNotice(); return; }
  const gender = document.getElementById('romance-gender-m').checked ? 'brother'
               : document.getElementById('romance-gender-f').checked ? 'sister' : '';
  if (!gender) { toast('성별을 선택해 주세요'); return; }
  const bio = document.getElementById('romance-bio').value.trim();
  if (!bio) { toast('자기소개를 입력해 주세요'); return; }
  const lookingFor = document.getElementById('romance-looking').value.trim();
  saveMatchProfile({ type:'romance', gender, bio, lookingFor, age: userAge(), status:'open' });
  closeRomanceProfileModal();
  toast('✅ 이성 교제 프로필이 등록됐어요!');
  setTimeout(() => openSubscreen('romance-match'), 150);
}

function deleteRomanceProfile() {
  deleteMyMatchProfile('romance');
  closeRomanceProfileModal();
  toast('프로필을 삭제했어요');
  setTimeout(() => openSubscreen('romance-match'), 150);
}

function renderMatchInbox() {
  const all     = getMatchReqsReceived();
  const pending = all.filter(r => r.status === 'pending');
  const history = all.filter(r => r.status !== 'pending');
  if (!all.length) return `<div class="ss-empty"><div class="ss-empty-icon">📬</div><div class="ss-empty-title">받은 신청이 없어요</div><div class="ss-empty-sub">매칭 신청이 오면 여기서 확인할 수 있어요</div></div>`;
  let html = '<div style="padding:14px 16px 24px">';
  if (pending.length) {
    html += `<div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px;margin-bottom:10px">⏳ 대기 중 (${pending.length})</div>`;
    pending.forEach(r => {
      html += `
        <div style="background:white;border-radius:14px;border:1.5px solid rgba(201,169,110,0.4);padding:14px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
            <div style="font-size:14.5px;font-weight:800">${escHtml(r.fromName)}</div>
            <span style="font-size:11.5px;background:rgba(41,128,185,0.1);color:#2980B9;border-radius:6px;padding:2px 8px;font-weight:700">${matchTypeLabel(r.type)}</span>
          </div>
          ${r.msg ? `<div style="font-size:13px;color:#444;background:var(--cream2);border-radius:8px;padding:8px 12px;margin-bottom:12px;line-height:1.6">"${escHtml(r.msg)}"</div>` : '<div style="margin-bottom:12px"></div>'}
          <div style="display:flex;gap:8px">
            <button onclick="respondMatchReq('${r.id}',false)" style="flex:1;height:38px;border-radius:10px;border:1.5px solid rgba(220,0,0,0.25);background:#FBE5E5;color:#C0392B;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">거절</button>
            <button onclick="respondMatchReq('${r.id}',true)"  style="flex:2;height:38px;border-radius:10px;border:none;background:var(--black);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">✅ 수락</button>
          </div>
        </div>`;
    });
  }
  if (history.length) {
    html += `<div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px;margin:${pending.length?'16px':'0'} 0 10px">📋 처리 완료 (${history.length})</div>`;
    history.forEach(r => {
      const isAccepted = r.status === 'accepted';
      html += `
        <div style="background:white;border-radius:14px;border:1.5px solid var(--border);padding:14px;margin-bottom:10px;opacity:0.75">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:13.5px;font-weight:700">${escHtml(r.fromName)}</div>
            <span style="font-size:11.5px;background:${isAccepted?'rgba(39,174,96,0.12)':'var(--cream2)'};color:${isAccepted?'#27AE60':'var(--muted)'};border-radius:6px;padding:2px 8px;font-weight:700">${isAccepted?'✅ 수락됨':'거절됨'}</span>
          </div>
          <div style="font-size:12px;color:var(--muted);margin-top:3px">${matchTypeLabel(r.type)}</div>
        </div>`;
    });
  }
  return html + '</div>';
}

function renderMyMatches() {
  const sentReqs   = getMatchReqsSent().filter(r => r.status === 'accepted');
  const myProfiles = getAllMyMatchProfiles();
  if (!sentReqs.length && !myProfiles.length) return `
    <div class="ss-empty">
      <div class="ss-empty-icon">🤝</div>
      <div class="ss-empty-title">함께하는 매칭이 없어요</div>
      <div class="ss-empty-sub">매칭 탭에서 파트너를 찾아보세요!</div>
    </div>
    <div style="padding:0 16px">
      <button class="btn-confirm" style="width:100%" onclick="openMatchingBrowse();closeSubscreen()">매칭 탭으로 이동</button>
    </div>`;

  let html = '<div style="padding:14px 16px 24px">';

  if (sentReqs.length) {
    html += `<div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px;margin-bottom:10px">✅ 참여 중인 매칭 (${sentReqs.length})</div>`;
    sentReqs.forEach(r => {
      const profile = DB.get(matchProfilesKey(), []).find(p => p.id === r.profileId);
      html += `
        <div style="background:white;border-radius:14px;border:1.5px solid rgba(39,174,96,0.3);padding:14px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div style="font-size:14px;font-weight:800">${escHtml(profile?.userName || '상대방')}</div>
            <span style="font-size:11.5px;background:rgba(39,174,96,0.12);color:#27AE60;border-radius:6px;padding:2px 8px;font-weight:700">참여 중</span>
          </div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:10px">${matchTypeLabel(r.type)}</div>
          <button onclick="openMatchActionModal('leave','${r.id}','${(profile?.userName||'').replace(/'/g,"\\'")}','${r.type}')"
            style="width:100%;height:34px;border-radius:9px;border:1.5px solid rgba(192,57,43,0.25);background:#FBE5E5;color:#C0392B;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">이 매칭에서 나가기</button>
        </div>`;
    });
  }

  if (myProfiles.length) {
    html += `<div style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.5px;margin:${sentReqs.length?'16px':'0'} 0 10px">📋 내가 만든 매칭 프로필 (${myProfiles.length})</div>`;
    myProfiles.forEach(p => {
      const acceptedMembers = DB.get(matchReqsKey(), []).filter(r => r.profileId === p.id && r.status === 'accepted');
      html += `
        <div style="background:white;border-radius:14px;border:1.5px solid var(--border);padding:14px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div style="font-size:13.5px;font-weight:700">${matchTypeLabel(p.type)}</div>
            <span style="font-size:11.5px;background:${p.status==='matched'?'rgba(39,174,96,0.12)':'rgba(41,128,185,0.1)'};color:${p.status==='matched'?'#27AE60':'#2980B9'};border-radius:6px;padding:2px 8px;font-weight:700">${p.status==='matched'?'✅ 완료':'🟢 모집 중'}</span>
          </div>
          ${acceptedMembers.length ? `<div style="font-size:12px;color:var(--muted);margin-bottom:10px">참여 멤버 ${acceptedMembers.length}명</div>` : ''}
          <div style="display:flex;gap:8px">
            <button onclick="openSubscreen('${p.type==='hobby'?'hobby-match':p.type==='prayer'?'prayer-match':'mentor-match'}')" style="flex:1;height:32px;border-radius:8px;border:1.5px solid var(--border);background:white;color:var(--dark);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">멤버 관리</button>
            <button onclick="deleteMyMatchProfile('${p.type}');openSubscreen('my-matches')" style="height:32px;padding:0 14px;border-radius:8px;border:1.5px solid rgba(220,0,0,0.25);background:#FBE5E5;color:#C0392B;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">삭제</button>
          </div>
        </div>`;
    });
  }
  return html + '</div>';
}

function openMatchActionModal(type, reqId, targetName, matchType) {
  _matchAction = { type, reqId, matchType };
  const isLeave = type === 'leave';
  document.getElementById('match-action-title').textContent = isLeave ? '매칭 나가기 ✋' : '멤버 내보내기';
  document.getElementById('match-action-desc').textContent  = isLeave
    ? '정말 이 매칭에서 나가시겠어요?\n다시 참여하려면 새로 신청해야 해요.'
    : `"${targetName}"님을 정말 내보내시겠어요?`;
  document.getElementById('match-action-btn').textContent = isLeave ? '나가기' : '내보내기';
  document.getElementById('modal-match-action').classList.add('open');
}

function closeMatchActionModal(e) {
  if (!e || e.target.id === 'modal-match-action') {
    document.getElementById('modal-match-action').classList.remove('open');
    _matchAction = null;
  }
}

function execMatchAction() {
  if (!_matchAction) return;
  const { type, reqId, matchType } = _matchAction;
  const reqs = DB.get(matchReqsKey(), []);
  const req  = reqs.find(r => r.id === reqId);
  if (!req) { closeMatchActionModal(); return; }

  if (type === 'leave') {
    req.status = 'left';
    req.leftAt = new Date().toISOString();
    DB.set(matchReqsKey(), reqs);
    if (window._fbReady && window._fb) window._fb.setMatchRequestDoc(req.id, { status: 'left', leftAt: req.leftAt }).catch(() => {});
    closeMatchActionModal();
    toast('매칭에서 나갔어요');
    const screenMap = { hobby:'hobby-match', prayer:'prayer-match', mentor:'mentor-match', romance:'romance-match' };
    setTimeout(() => openSubscreen(screenMap[matchType] || 'matching-browse'), 150);
  } else if (type === 'kick') {
    req.status = 'kicked';
    req.kickedAt = new Date().toISOString();
    DB.set(matchReqsKey(), reqs);
    if (window._fbReady && window._fb) window._fb.setMatchRequestDoc(req.id, { status: 'kicked', kickedAt: req.kickedAt }).catch(() => {});
    closeMatchActionModal();
    toast('멤버를 내보냈어요');
    const cur = document.getElementById('subscreen')?.dataset?.current;
    if (cur) setTimeout(() => openSubscreen(cur), 150);
  }
  _matchAction = null;
}

function openMatchReqModal(profileId, userId, userName, type) {
  if (userId === me.id) { toast('내 프로필에는 신청할 수 없어요'); return; }
  _matchReqTargetProfileId = profileId;
  _matchReqTargetUserId    = userId;
  _matchReqTargetName      = userName;
  _matchReqTargetType      = type;
  document.getElementById('match-req-to-name').textContent = userName + '님에게';
  document.getElementById('match-req-type-label').textContent = matchTypeLabel(type);
  document.getElementById('match-req-msg').value = '';
  document.getElementById('modal-match-req').classList.add('open');
}

function closeMatchReqModal(e) {
  if (!e || e.target.id === 'modal-match-req')
    document.getElementById('modal-match-req').classList.remove('open');
}

function submitMatchReq() {
  const msg = document.getElementById('match-req-msg').value.trim();
  if (doSendMatchReq(_matchReqTargetUserId, _matchReqTargetProfileId, _matchReqTargetType, msg)) {
    closeMatchReqModal();
    toast('✅ 매칭 신청을 보냈어요!');
    const screenMap = {hobby:'hobby-match', prayer:'prayer-match', mentor:'mentor-match', romance:'romance-match'};
    setTimeout(() => openSubscreen(screenMap[_matchReqTargetType]||'matching-browse'), 150);
  }
}

function openHobbyProfileModal() {
  const existing = getMyMatchProfile('hobby');
  _hobbySelected = new Set(existing?.hobbies || []);
  document.getElementById('hobby-bio').value = existing?.bio || '';
  document.getElementById('hobby-max').value = existing?.maxCount ?? 5;
  _renderHobbyChips();
  document.getElementById('modal-hobby-profile').classList.add('open');
}

function closeHobbyProfileModal(e) {
  if (!e || e.target.id === 'modal-hobby-profile')
    document.getElementById('modal-hobby-profile').classList.remove('open');
}

function _renderHobbyChips() {
  const container = document.getElementById('hobby-chips');
  if (!container) return;
  container.innerHTML = MATCH_HOBBY_LIST.map(h => `
    <button type="button" onclick="_toggleHobby('${h}')" id="hchip-${h.replace(/\s/g,'_')}"
      style="height:32px;padding:0 14px;border-radius:20px;border:1.5px solid ${_hobbySelected.has(h)?'var(--black)':'var(--border)'};
             background:${_hobbySelected.has(h)?'var(--black)':'white'};color:${_hobbySelected.has(h)?'white':'var(--muted)'};
             font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s">${h}</button>
  `).join('');
}

function _toggleHobby(h) {
  if (_hobbySelected.has(h)) _hobbySelected.delete(h); else _hobbySelected.add(h);
  _renderHobbyChips();
}

function saveHobbyProfile() {
  if (_hobbySelected.size === 0) { toast('취미를 하나 이상 선택해 주세요'); return; }
  const bio      = document.getElementById('hobby-bio').value.trim();
  const maxCount = parseInt(document.getElementById('hobby-max').value) || 5;
  if (maxCount < 2 || maxCount > 100) { toast('인원은 2~100명 사이로 입력해 주세요'); return; }
  saveMatchProfile({ type:'hobby', hobbies: Array.from(_hobbySelected), bio, maxCount, status:'open' });
  closeHobbyProfileModal();
  toast('✅ 취미 매칭 프로필이 등록됐어요!');
  setTimeout(() => openSubscreen('hobby-match'), 150);
}

function deleteHobbyProfile() {
  deleteMyMatchProfile('hobby');
  closeHobbyProfileModal();
  toast('프로필을 삭제했어요');
  setTimeout(() => openSubscreen('hobby-match'), 150);
}

function openPrayerProfileModal() {
  const existing = getMyMatchProfile('prayer');
  document.getElementById('prayer-topic').value = existing?.prayerTopic || '';
  document.getElementById('prayer-bio').value   = existing?.bio || '';
  _renderPrayerTopicChips(existing?.prayerTopic);
  document.getElementById('modal-prayer-profile').classList.add('open');
}

function closePrayerProfileModal(e) {
  if (!e || e.target.id === 'modal-prayer-profile')
    document.getElementById('modal-prayer-profile').classList.remove('open');
}

function _renderPrayerTopicChips(selected) {
  const container = document.getElementById('prayer-topic-chips');
  if (!container) return;
  container.innerHTML = MATCH_PRAYER_TOPICS.map(t => `
    <button type="button" onclick="_selectPrayerTopic('${t}')"
      style="height:30px;padding:0 12px;border-radius:20px;border:1.5px solid ${selected===t?'var(--black)':'var(--border)'};
             background:${selected===t?'var(--black)':'white'};color:${selected===t?'white':'var(--muted)'};
             font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit">${t}</button>
  `).join('');
}

function _selectPrayerTopic(t) {
  document.getElementById('prayer-topic').value = t;
  _renderPrayerTopicChips(t);
}

function savePrayerProfile() {
  const topic = document.getElementById('prayer-topic').value.trim();
  const bio   = document.getElementById('prayer-bio').value.trim();
  if (!topic) { toast('기도 제목을 입력해 주세요'); return; }
  saveMatchProfile({ type:'prayer', prayerTopic: topic, bio, status:'open' });
  closePrayerProfileModal();
  toast('✅ 기도 파트너 프로필이 등록됐어요!');
  setTimeout(() => openSubscreen('prayer-match'), 150);
}

function deletePrayerProfile() {
  deleteMyMatchProfile('prayer');
  closePrayerProfileModal();
  toast('프로필을 삭제했어요');
  setTimeout(() => openSubscreen('prayer-match'), 150);
}

function openMentorProfileModal() {
  const existing = getMyMatchProfile('mentor');
  document.getElementById('mentor-role-mentor').checked = (existing?.mentorRole !== 'mentee');
  document.getElementById('mentor-role-mentee').checked = (existing?.mentorRole === 'mentee');
  document.getElementById('mentor-area').value = existing?.mentorArea || '';
  document.getElementById('mentor-bio').value  = existing?.bio || '';
  _renderMentorAreaChips(existing?.mentorArea);
  document.getElementById('modal-mentor-profile').classList.add('open');
}

function closeMentorProfileModal(e) {
  if (!e || e.target.id === 'modal-mentor-profile')
    document.getElementById('modal-mentor-profile').classList.remove('open');
}

function _renderMentorAreaChips(selected) {
  const container = document.getElementById('mentor-area-chips');
  if (!container) return;
  container.innerHTML = MATCH_MENTOR_AREAS.map(a => `
    <button type="button" onclick="_selectMentorArea('${a}')"
      style="height:30px;padding:0 12px;border-radius:20px;border:1.5px solid ${selected===a?'var(--black)':'var(--border)'};
             background:${selected===a?'var(--black)':'white'};color:${selected===a?'white':'var(--muted)'};
             font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit">${a}</button>
  `).join('');
}

function _selectMentorArea(a) {
  document.getElementById('mentor-area').value = a;
  _renderMentorAreaChips(a);
}

function saveMentorProfile() {
  const role = document.getElementById('mentor-role-mentor').checked ? 'mentor' : 'mentee';
  const area = document.getElementById('mentor-area').value.trim();
  const bio  = document.getElementById('mentor-bio').value.trim();
  if (!area) { toast('분야를 선택하거나 입력해 주세요'); return; }
  saveMatchProfile({ type:'mentor', mentorRole: role, mentorArea: area, bio, status:'open' });
  closeMentorProfileModal();
  toast('✅ 멘토링 프로필이 등록됐어요!');
  setTimeout(() => openSubscreen('mentor-match'), 150);
}

function deleteMentorProfile() {
  deleteMyMatchProfile('mentor');
  closeMentorProfileModal();
  toast('프로필을 삭제했어요');
  setTimeout(() => openSubscreen('mentor-match'), 150);
}

