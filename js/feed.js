// ===== moved from index.html (feature: feed) — 전역(window) 공유 스코프 =====
function boardPostsKey(type) { return 'boardPosts_' + type; }

function getBoardPosts(type) { return DB.get(boardPostsKey(type), []); }

function saveBoardPosts(type, list) { DB.set(boardPostsKey(type), list); }

function getBoardPost(id) {
  return [...getBoardPosts('app'), ...getBoardPosts('user')].find(p => p.id === id);
}

function openBoardScreen(type) {
  _boardType = type || 'app';
  openSubscreen('board');
}

async function loadBoardPosts(type) {
  if (!window._fbReady || !window._fb) return;
  try {
    const snap = await window._fb.getBoardPosts(type);
    const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // localStorage 캐시 업데이트
    saveBoardPosts(type, posts);
    return posts;
  } catch(e) {
    console.warn('게시판 로드 실패:', e);
    return getBoardPosts(type);
  }
}

function canViewBoardPost(p) {
  if (!p || !p.isPrivate) return true;
  return p.authorId === me.id || !!me.isAppAdmin;
}

function renderBoard() {
  const type  = _boardType;
  const posts = getBoardPosts(type).filter(canViewBoardPost);   // 비공개 글 숨김
  const isApp = type === 'app';

  // 비동기 Firestore 로드 후 새로고침
  if (!_boardLoading) {
    _boardLoading = true;
    loadBoardPosts(type).then(() => {
      _boardLoading = false;
      const ss  = document.getElementById('subscreen');
      const cur = ss?.dataset?.current;
      // 서브스크린이 열려있고 정확히 board 화면일 때만 새로고침
      if (cur === 'board' && ss?.classList.contains('open')) {
        ss.querySelector('#subscreen-body') && openSubscreen('board');
      }
    }).catch(() => { _boardLoading = false; });
  }

  const canWrite = isApp ? me.isAppAdmin : true;
  const pinned   = posts.filter(p => p.pinned);
  const normal   = posts.filter(p => !p.pinned);
  const sorted   = [...pinned, ...normal];

  let html = `
    <!-- 탭 헤더 -->
    <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <div style="display:flex;gap:6px">
        <button onclick="openBoardScreen('app')"
          style="height:32px;padding:0 14px;border-radius:20px;border:none;
                 background:${type==='app'?'var(--black)':'var(--cream2)'};
                 color:${type==='app'?'white':'var(--muted)'};
                 font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">
          앱 소식
        </button>
        <button onclick="openBoardScreen('user')"
          style="height:32px;padding:0 14px;border-radius:20px;border:none;
                 background:${type==='user'?'var(--black)':'var(--cream2)'};
                 color:${type==='user'?'white':'var(--muted)'};
                 font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">
          건의함
        </button>
      </div>
      ${canWrite ? `
        <button onclick="openBoardPostModal('${type}')"
          style="height:32px;padding:0 14px;border-radius:20px;border:none;
                 background:${isApp?'var(--black)':'var(--gold)'};
                 color:${isApp?'white':'var(--dark)'};
                 font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">
          ${isApp ? '+ 공지 작성' : '+ 건의하기'}
        </button>` : ''}
    </div>
    <div style="padding:14px 16px 32px">`;

  if (!isApp) {
    html += `<div style="background:rgba(201,169,110,0.08);border:1.5px solid rgba(201,169,110,0.3);
               border-radius:12px;padding:12px 14px;margin-bottom:14px;font-size:12.5px;
               color:var(--muted);line-height:1.7">
      앱 개선을 위한 제안이나 새 챌린지 카테고리를 자유롭게 건의해 주세요!<br>
      앱 관리자가 검토 후 상태를 업데이트해 드려요.
    </div>`;
  }

  if (!sorted.length) {
    html += `<div class="ss-empty">
      <div class="ss-empty-icon">${isApp?'📢':'💡'}</div>
      <div class="ss-empty-title">${isApp?'아직 소식이 없어요':'아직 건의가 없어요'}</div>
      <div class="ss-empty-sub">${isApp?'새 소식이 올라오면 알려드릴게요':canWrite?'첫 번째로 건의해보세요!':''}</div>
    </div>`;
  } else {
    sorted.forEach(p => {
      const st = !isApp && BOARD_STATUS[p.status || 'pending'];
      const commentCount = (DB.get('boardComments_' + p.id, p.comments || []) || []).length;
      const likeCount    = (p.likes    || []).length;
      const liked        = (p.likes    || []).includes(me.id);
      const date         = p.createdAt ? new Date(p.createdAt).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'}) : '';
      html += `
        <div onclick="viewBoardPost('${p.id}')"
          style="background:white;border-radius:14px;border:1.5px solid ${p.pinned?'rgba(201,169,110,0.4)':'var(--border)'};
                 padding:14px;margin-bottom:10px;cursor:pointer">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              ${p.pinned?'<span style="font-size:11px;font-weight:700;color:var(--gold)">고정</span>':''}
              <span style="font-size:11.5px;background:var(--cream2);border-radius:6px;padding:2px 8px;font-weight:600">${escHtml(p.category||'기타')}</span>
              ${st?`<span style="font-size:11.5px;background:${st.bg};color:${st.color};border-radius:6px;padding:2px 8px;font-weight:700">${st.label}</span>`:''}
            </div>
            <span style="font-size:11px;color:var(--muted);flex-shrink:0">${date}</span>
          </div>
          <div style="font-size:14px;font-weight:800;margin-bottom:4px;line-height:1.4">${p.isPrivate?'<span title="비공개">🔒</span> ':''}${escHtml(p.title)}</div>
          <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px;
                      overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.content||'')}</div>
          <div style="display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted)">
            <span>${escHtml(p.authorName||'익명')}</span>
            <span>${likeCount}</span>
            <span>${commentCount}</span>
          </div>
        </div>`;
    });
  }
  return html + '</div>';
}

function viewBoardPost(id) {
  _viewPostId = id;
  openSubscreen('board-post');
}

function renderBoardPost() {
  const p = getBoardPost(_viewPostId);
  if (!p) return `<div class="ss-empty"><div class="ss-empty-title">게시글을 찾을 수 없어요</div></div>`;
  // 비공개 게시글 접근 차단 (작성자 + 앱 관리자만)
  if (!canViewBoardPost(p)) return `<div class="ss-empty">
    <div class="ss-empty-icon">🔒</div>
    <div class="ss-empty-title">비공개 게시글이에요</div>
    <div class="ss-empty-sub">작성자와 앱 관리자만 볼 수 있어요</div></div>`;

  const isApp  = p.type === 'app';
  const isOwner = p.authorId === me.id;
  const canAdmin = me.isAppAdmin;
  const liked  = (p.likes    || []).includes(me.id);
  const comments = p.comments || [];
  const st     = !isApp && BOARD_STATUS[p.status || 'pending'];
  const date   = p.createdAt ? new Date(p.createdAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';

  let html = `<div style="padding:16px 16px 40px">
    <!-- 카테고리/상태 배지 -->
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      <span style="font-size:12px;background:var(--cream2);border-radius:6px;padding:3px 10px;font-weight:600">${escHtml(p.category||'기타')}</span>
      ${p.pinned?'<span style="font-size:12px;color:var(--gold);font-weight:700">고정</span>':''}
      ${p.isPrivate?'<span style="font-size:12px;background:rgba(201,169,110,0.15);color:var(--gold-deep,#c9a227);border-radius:6px;padding:3px 10px;font-weight:700">비공개</span>':''}
      ${st?`<span style="font-size:12px;background:${st.bg};color:${st.color};border-radius:6px;padding:3px 10px;font-weight:700">${st.label}</span>`:''}
    </div>
    <!-- 제목 -->
    <div style="font-size:18px;font-weight:900;line-height:1.4;margin-bottom:8px">${escHtml(p.title)}</div>
    <!-- 작성자/날짜 -->
    <div style="font-size:12px;color:var(--muted);margin-bottom:16px;display:flex;gap:8px">
      <span>${escHtml(p.authorName||'익명')}</span>
      <span>${date}</span>
    </div>
    <!-- 본문 -->
    <div style="font-size:14px;line-height:1.9;color:#333;white-space:pre-wrap;margin-bottom:20px">${escHtml(p.content||'')}</div>

    <!-- 좋아요 -->
    <button onclick="likeBoardPost('${p.id}')"
      style="display:flex;align-items:center;gap:6px;height:38px;padding:0 18px;border-radius:20px;
             border:1.5px solid ${liked?'rgba(231,76,60,0.3)':'var(--border)'};
             background:${liked?'rgba(231,76,60,0.06)':'white'};
             color:${liked?'#E74C3C':'var(--muted)'};font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:16px">
      ${liked?'❤️':'🤍'} 좋아요 ${(p.likes||[]).length}
    </button>`;

  // 관리자 전용 컨트롤
  if (canAdmin) {
    if (!isApp) {
      html += `<div style="background:rgba(231,76,60,0.05);border:1.5px solid rgba(231,76,60,0.15);
                border-radius:12px;padding:12px 14px;margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;color:#C0392B;margin-bottom:8px">관리자 — 상태 변경</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${[['reviewing','검토 중'],['adopted','반영됨'],['declined','보류']].map(([s,l])=>`
            <button onclick="changeBoardPostStatus('${p.id}','${s}')"
              style="height:30px;padding:0 12px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;
                     border:1.5px solid ${(p.status||'pending')===s?'var(--black)':'var(--border)'};
                     background:${(p.status||'pending')===s?'var(--black)':'white'};
                     color:${(p.status||'pending')===s?'white':'var(--muted)'}">${l}</button>`).join('')}
        </div>
      </div>`;
    } else {
      html += `<div style="background:rgba(231,76,60,0.05);border:1.5px solid rgba(231,76,60,0.15);
                border-radius:12px;padding:12px 14px;margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;color:#C0392B;margin-bottom:8px">관리자</div>
        <div style="display:flex;gap:6px">
          <button onclick="toggleBoardPostPin('${p.id}')"
            style="flex:1;height:32px;border-radius:8px;border:1.5px solid var(--border);background:white;
                   font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">
            ${p.pinned?'고정 해제':'상단 고정'}
          </button>
        </div>
      </div>`;
    }
    html += `<button onclick="deleteBoardPost('${p.id}')"
      style="width:100%;height:36px;border-radius:10px;border:1.5px solid rgba(192,57,43,0.25);
             background:#FBE5E5;color:#C0392B;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:16px">
      게시글 삭제
    </button>`;
  }

  // 댓글 섹션 (Firestore 서브컬렉션 + 실시간 onSnapshot)
  html += `<div style="border-top:1px solid var(--border);padding-top:16px">
    <div id="board-comment-count" style="font-size:13px;font-weight:800;margin-bottom:12px">댓글</div>
    <!-- 댓글 작성 (모든 로그인 사용자) -->
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <textarea id="bc-inline" rows="1" placeholder="댓글을 입력하세요"
        style="flex:1;border:1.5px solid var(--border);border-radius:10px;padding:9px 12px;
               font-size:13px;font-family:inherit;resize:none;line-height:1.6;box-sizing:border-box"></textarea>
      <button onclick="submitBoardComment('${p.id}')"
        style="flex-shrink:0;height:38px;padding:0 16px;border-radius:10px;border:none;background:var(--black);
               color:white;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;align-self:flex-start">등록</button>
    </div>
    <div id="board-comments-list">
      <div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">댓글 불러오는 중...</div>
    </div>
  </div>`;

  setTimeout(() => initBoardComments(p.id), 60);  // 실시간 댓글 구독 시작
  return html + '</div>';
}

function openBoardPostModal(type) {
  _boardPostModalType = type;
  const isApp = type === 'app';
  document.getElementById('board-post-modal-title').textContent = isApp ? '공지 작성' : '건의하기';
  document.getElementById('bp-submit-btn').textContent = isApp ? '공지 등록' : '건의 등록';
  const cats = isApp ? BOARD_APP_CATEGORIES : BOARD_USER_CATEGORIES;
  document.getElementById('bp-category').innerHTML = cats.map(c=>`<option value="${c}">${c}</option>`).join('');
  document.getElementById('bp-title').value   = '';
  document.getElementById('bp-content').value = '';
  const pinRow = document.getElementById('bp-pin-row');
  if (pinRow) pinRow.style.display = isApp && me.isAppAdmin ? 'block' : 'none';
  // 비공개 토글 — 건의함(user)에서만 노출
  const privRow = document.getElementById('bp-private-row');
  if (privRow) privRow.style.display = isApp ? 'none' : 'block';
  const privCb = document.getElementById('bp-private');
  if (privCb) privCb.checked = false;
  document.getElementById('modal-board-post').classList.add('open');
}

function closeBoardPostModal(e) {
  if (!e || e.target.id === 'modal-board-post')
    document.getElementById('modal-board-post').classList.remove('open');
}

function submitBoardPost() {
  const title   = document.getElementById('bp-title').value.trim();
  const content = document.getElementById('bp-content').value.trim();
  const category= document.getElementById('bp-category').value;
  if (!title)   { toast('제목을 입력해 주세요'); return; }
  if (!content) { toast('내용을 입력해 주세요'); return; }
  const pinned  = _boardPostModalType === 'app' && document.getElementById('bp-pinned')?.checked;
  const isPrivate = _boardPostModalType === 'user' && document.getElementById('bp-private')?.checked;

  const post = {
    id: 'bp_' + uid(), type: _boardPostModalType,
    category, title, content,
    authorId: me.id, authorName: me.name,
    pinned: !!pinned,
    isPrivate: !!isPrivate,   // 비공개: 작성자 + 앱 관리자만 열람
    status: 'pending',
    likes: [], comments: [],
    createdAt: new Date().toISOString()
  };
  const list = getBoardPosts(_boardPostModalType);
  list.unshift(post);
  saveBoardPosts(_boardPostModalType, list);

  if (window._fbReady && window._fb)
    window._fb.setBoardPost(post.id, post).catch(() => {});

  closeBoardPostModal();
  toast(_boardPostModalType === 'app' ? '공지가 등록됐어요!' : '건의가 등록됐어요! 검토 후 상태가 업데이트돼요 ');
  openBoardScreen(_boardPostModalType);
}

function likeBoardPost(id) {
  ['app','user'].forEach(type => {
    const list = getBoardPosts(type);
    const p    = list.find(x => x.id === id);
    if (!p) return;
    p.likes = p.likes || [];
    const idx = p.likes.indexOf(me.id);
    if (idx >= 0) p.likes.splice(idx, 1);
    else p.likes.push(me.id);
    saveBoardPosts(type, list);
    if (window._fbReady && window._fb)
      window._fb.updateBoardPost(id, { likes: p.likes }).catch(() => {});
  });
  openSubscreen('board-post');
}

function toggleBoardPostPin(id) {
  ['app','user'].forEach(type => {
    const list = getBoardPosts(type);
    const p    = list.find(x => x.id === id);
    if (!p) return;
    p.pinned = !p.pinned;
    saveBoardPosts(type, list);
    if (window._fbReady && window._fb)
      window._fb.updateBoardPost(id, { pinned: p.pinned }).catch(() => {});
  });
  toast('고정 설정이 변경됐어요');
  openSubscreen('board-post');
}

function changeBoardPostStatus(id, status) {
  const list = getBoardPosts('user');
  const p    = list.find(x => x.id === id);
  if (!p) return;
  p.status = status;
  saveBoardPosts('user', list);
  if (window._fbReady && window._fb)
    window._fb.updateBoardPost(id, { status }).catch(() => {});
  const st = BOARD_STATUS[status];
  toast(`상태를 "${st?.label||status}"로 변경했어요`);
  openSubscreen('board-post');
}

function deleteBoardPost(id) {
  ['app','user'].forEach(type => {
    saveBoardPosts(type, getBoardPosts(type).filter(p => p.id !== id));
  });
  if (window._fbReady && window._fb)
    window._fb.deleteBoardPost(id).catch(() => {});
  toast('게시글을 삭제했어요');
  openBoardScreen(_boardType);
}

function commentsCacheKey(postId) { return 'boardComments_' + postId; }

function initBoardComments(postId) {
  stopBoardComments();
  _boardCommentPostId = postId;
  _editingCommentId   = null;
  // 로컬 캐시(또는 레거시 post.comments) 즉시 표시
  let cached = DB.get(commentsCacheKey(postId), null);
  if (cached === null) cached = (getBoardPost(postId)?.comments) || [];
  _boardCommentsCache = cached;
  renderBoardCommentsList(postId, _boardCommentsCache);

  if (!window._fbReady || !window._fb) return;
  _boardCommentUnsub = window._fb.listenBoardComments(postId, snap => {
    // 레거시 배열 댓글 → 서브컬렉션 1회 이관
    if (snap.empty) {
      const legacy = (getBoardPost(postId)?.comments) || [];
      if (legacy.length && !DB.get('migratedComments_' + postId, false)) {
        DB.set('migratedComments_' + postId, true);
        legacy.forEach(c => {
          const cid = c.id || ('bc_' + uid());
          window._fb.setBoardComment(postId, cid, { ...c, id: cid, createdAt: c.createdAt || new Date().toISOString() }).catch(() => {});
        });
        return; // 다음 스냅샷에서 반영
      }
    }
    const comments = [];
    snap.forEach(d => comments.push({ id: d.id, ...d.data() }));
    _boardCommentsCache = comments;
    DB.set(commentsCacheKey(postId), comments);   // 캐시 갱신
    if (_boardCommentPostId === postId) renderBoardCommentsList(postId, comments);
  });
}

function stopBoardComments() {
  if (_boardCommentUnsub) { try { _boardCommentUnsub(); } catch(e) {} _boardCommentUnsub = null; }
  _boardCommentPostId = '';
  _editingCommentId   = null;
}

function renderBoardCommentsList(postId, comments) {
  const cntEl  = document.getElementById('board-comment-count');
  const listEl = document.getElementById('board-comments-list');
  if (cntEl)  cntEl.textContent = `댓글 ${comments.length}개`;
  if (!listEl) return;
  if (!comments.length) {
    listEl.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">첫 번째 댓글을 남겨보세요 </div>`;
    return;
  }
  const canAdmin = !!me.isAppAdmin;
  listEl.innerHTML = comments.map(c => {
    const isMine   = c.authorId === me.id;
    const isAdminC = c.isAdmin;
    const editing  = _editingCommentId === c.id;
    const cDate = c.createdAt ? new Date(c.createdAt).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
    const body = editing
      ? `<div>
           <textarea id="bc-edit-${c.id}" rows="2"
             style="width:100%;border:1.5px solid var(--gold);border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit;resize:none;line-height:1.6;box-sizing:border-box">${escHtml(c.content||'')}</textarea>
           <div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end">
             <button onclick="cancelEditBoardComment('${postId}')" style="height:28px;padding:0 12px;border-radius:7px;border:1.5px solid var(--border);background:white;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">취소</button>
             <button onclick="saveEditBoardComment('${postId}','${c.id}')" style="height:28px;padding:0 12px;border-radius:7px;border:none;background:var(--black);color:white;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">저장</button>
           </div>
         </div>`
      : `<div style="font-size:13px;line-height:1.7;color:#333;white-space:pre-wrap">${escHtml(c.content||'')}${c.editedAt?' <span style="font-size:11px;color:var(--muted)">(수정됨)</span>':''}</div>`;
    return `
      <div style="background:${isAdminC?'rgba(201,169,110,0.06)':'white'};
                  border:1.5px solid ${isAdminC?'rgba(201,169,110,0.35)':'var(--border)'};
                  border-radius:12px;padding:12px 14px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:13px;font-weight:700">${escHtml(c.authorName||'익명')}</span>
            ${isAdminC?'<span style="font-size:11px;background:rgba(201,169,110,0.18);color:var(--gold-deep,#c9a227);border-radius:4px;padding:1px 6px;font-weight:700">관리자</span>':''}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:11px;color:var(--muted)">${cDate}</span>
            ${(!editing && isMine)?`<button onclick="startEditBoardComment('${postId}','${c.id}')" title="수정" style="background:none;border:none;font-size:13px;cursor:pointer;padding:0">✏️</button>`:''}
            ${(!editing && (isMine||canAdmin))?`<button onclick="deleteBoardComment('${postId}','${c.id}')" title="${isMine?'삭제':'관리자 삭제'}" style="background:none;border:none;color:${isMine?'var(--muted)':'#C0392B'};font-size:13px;cursor:pointer;padding:0">🗑️</button>`:''}
          </div>
        </div>
        ${body}
      </div>`;
  }).join('');
}

function submitBoardComment(postId) {
  postId = postId || _viewPostId;
  const inp = document.getElementById('bc-inline');
  const content = (inp?.value || '').trim();
  if (!content) { toast('댓글 내용을 입력해 주세요'); return; }
  const cid = 'bc_' + uid();
  const comment = {
    id: cid, postId,
    authorId: me.id, authorName: me.name,
    isAdmin: !!me.isAppAdmin,
    content, createdAt: new Date().toISOString()
  };
  // 로컬 캐시 먼저 → 즉시 반영
  const cache = DB.get(commentsCacheKey(postId), []);
  cache.push(comment);
  DB.set(commentsCacheKey(postId), cache);
  _boardCommentsCache = cache;
  renderBoardCommentsList(postId, cache);
  if (inp) inp.value = '';
  // Firestore 서브컬렉션 저장 (onSnapshot이 canonical 목록으로 다시 렌더)
  if (window._fbReady && window._fb)
    window._fb.setBoardComment(postId, cid, comment).catch(() => {});
  toast('댓글이 등록됐어요 ');
}

function startEditBoardComment(postId, commentId) {
  const c = _boardCommentsCache.find(x => x.id === commentId);
  if (!c || c.authorId !== me.id) { toast('본인 댓글만 수정할 수 있어요'); return; }
  _editingCommentId = commentId;
  renderBoardCommentsList(postId, _boardCommentsCache);
  const ta = document.getElementById('bc-edit-' + commentId);
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

function cancelEditBoardComment(postId) {
  _editingCommentId = null;
  renderBoardCommentsList(postId, _boardCommentsCache);
}

function saveEditBoardComment(postId, commentId) {
  const ta = document.getElementById('bc-edit-' + commentId);
  const content = (ta?.value || '').trim();
  if (!content) { toast('내용을 입력해 주세요'); return; }
  const c = _boardCommentsCache.find(x => x.id === commentId);
  if (!c || c.authorId !== me.id) { toast('본인 댓글만 수정할 수 있어요'); return; }
  c.content  = content;
  c.editedAt = new Date().toISOString();
  _editingCommentId = null;
  DB.set(commentsCacheKey(postId), _boardCommentsCache);
  renderBoardCommentsList(postId, _boardCommentsCache);
  if (window._fbReady && window._fb)
    window._fb.updateBoardComment(postId, commentId, { content, editedAt: c.editedAt }).catch(() => {});
  toast('댓글을 수정했어요 ');
}

function deleteBoardComment(postId, commentId) {
  const c = _boardCommentsCache.find(x => x.id === commentId);
  const isMine = c && c.authorId === me.id;
  if (!isMine && !me.isAppAdmin) { toast('삭제 권한이 없어요'); return; }
  _boardCommentsCache = _boardCommentsCache.filter(x => x.id !== commentId);
  DB.set(commentsCacheKey(postId), _boardCommentsCache);
  renderBoardCommentsList(postId, _boardCommentsCache);
  if (window._fbReady && window._fb)
    window._fb.deleteBoardComment(postId, commentId).catch(() => {});
  toast(isMine ? '댓글을 삭제했어요' : '관리자 권한으로 삭제했어요');
}

function startOnboarding() {
  // 이미 온보딩 완료한 유저는 메인으로 (안전망)
  if (me && (me.onboarded || DB.get('onboarded_' + me.id, false))) {
    bootApp(); go('main'); return;
  }
  obData = { step: 1, churchName: '', picks: [] };
  // Reset step UI
  document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('ob-in','ob-out'));
  document.getElementById('ob-code').value = '';
  document.getElementById('ob-code').classList.remove('valid');
  document.getElementById('ob-code-result').classList.remove('show');
  document.querySelectorAll('.ob-challenge').forEach(c => {
    c.classList.remove('selected');
    c.querySelector('.ob-c-check').innerHTML = '';
  });
  document.getElementById('ob-cnt').textContent = '선택 안 함';
  document.getElementById('ob-cnt').classList.remove('active');
  document.getElementById('ob1').classList.add('ob-in');
  // Set name
  document.getElementById('ob-welcome-name').textContent = `환영합니다,\n${me.name}님 `;
  // 흰색 로고 이미지 설정
  const logoSrc = document.querySelector('.splash-logo')?.src || document.querySelector('.auth-hero-logo')?.src || '';
  const logoImg = document.getElementById('ob-welcome-logo-img');
  if (logoImg && logoSrc) logoImg.src = logoSrc;
  go('onboard');
  // ob2 유형/직분 초기화
  _obOrgType = 'church';
  setTimeout(_initObRoleSelect, 100);
}

function _markOnboardingDone() {
  // ① localStorage 플래그
  DB.set('onboarded_' + me.id, true);
  // ② me 객체 + users 배열에도 저장 (기기 바뀌어도 유지)
  me.onboarded = true;
  const users = DB.get('users', []);
  const u = users.find(x => x.id === me.id);
  if (u) { u.onboarded = true; DB.set('users', users); }
  // ③ Firestore 동기화
  if (window._fbReady && window._fb) {
    window._fb.updateUser(me.id, { onboarded: true }).catch(() => {});
  }
}

