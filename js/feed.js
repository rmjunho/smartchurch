// ===== moved from index.html (feature: feed) — 전역(window) 공유 스코프 =====
function boardPostsKey(type) { return 'boardPosts_' + type; }

function getBoardPosts(type) { return DB.get(boardPostsKey(type), []); }

function saveBoardPosts(type, list) { DB.set(boardPostsKey(type), list); }

function getBoardPost(id) {
  return [...getBoardPosts('app'), ...getBoardPosts('user')].find(p => p.id === id);
}

function openBoardScreen(type) {
  _boardType   = type || 'app';
  _boardLoaded = '';   // 화면에 새로 들어올 때(탭 전환·글 등록 후)만 서버에서 다시 읽는다
  openSubscreen('board');
}

async function loadBoardPosts(type) {
  if (!window._fbReady || !window._fb) return;
  try {
    const snap = await window._fb.getBoardPosts(type);
    const posts = _sweepAdoptedPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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

  // 비동기 Firestore 로드 후 새로고침 — 화면 진입당 1회.
  // 로드가 끝나면 openSubscreen('board') 이 renderBoard 를 다시 부르는데, 거기서 또 로드하면
  // 로드 → 재렌더 → 로드 가 끝없이 돈다. 그러면 서브스크린 HTML 이 계속 통째로 교체되면서
  // 버튼 DOM 이 갈려나가고, 클릭(mousedown·mouseup 이 같은 요소여야 성립)이 아예 먹지 않는다.
  if (!_boardLoading && _boardLoaded !== type) {
    _boardLoading = true;
    loadBoardPosts(type).then(() => {
      _boardLoaded  = type;
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
      앱 관리자가 검토 후 상태를 업데이트해 드려요.<br>
      <b>반영됨</b>이 된 건의는 2주 뒤 사진과 함께 자동으로 정리돼요.
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
      const cover        = _safeImgSrc(p.coverThumb);
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
          <div style="display:flex;gap:10px;align-items:flex-start">
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:800;margin-bottom:4px;line-height:1.4">${p.isPrivate?'<span title="비공개">🔒</span> ':''}${escHtml(p.title)}</div>
              <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px;
                          overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.content||'')}</div>
            </div>
            ${cover ? `<img class="bp-card-cover" src="${cover}" alt="대표사진" loading="lazy">` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted)">
            <span>${escHtml(p.authorName||'익명')}</span>
            <span>${likeCount}</span>
            <span>${commentCount}</span>
            ${p.photoCount ? `<span>📷 ${p.photoCount}</span>` : ''}
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
      ${p.editedAt?'<span>(수정됨)</span>':''}
    </div>
    <!-- 본문 -->
    <div style="font-size:14px;line-height:1.9;color:#333;white-space:pre-wrap;margin-bottom:20px">${escHtml(p.content||'')}</div>
    <!-- 첨부 사진 — 서브컬렉션에서 비동기로 채운다 -->
    <div id="board-photos" class="board-photos"></div>

    <!-- 좋아요 -->
    <button onclick="likeBoardPost('${p.id}')"
      style="display:flex;align-items:center;gap:6px;height:38px;padding:0 18px;border-radius:20px;
             border:1.5px solid ${liked?'rgba(231,76,60,0.3)':'var(--border)'};
             background:${liked?'rgba(231,76,60,0.06)':'white'};
             color:${liked?'#E74C3C':'var(--muted)'};font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:16px">
      ${liked?'❤️':'🤍'} 좋아요 ${(p.likes||[]).length}
    </button>`;

  // 글 수정 — 작성자 본인 + 앱 관리자 (관리자 블록 밖에 둬야 작성자에게도 보인다)
  if (isOwner || canAdmin) {
    html += `<button onclick="openBoardPostModal('${p.type || _boardType}','${p.id}')"
      style="width:100%;height:36px;border-radius:10px;border:1.5px solid var(--border);background:white;
             color:var(--black);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:10px">
      글 수정
    </button>`;
  }

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
  if (p.photoCount) setTimeout(() => loadBoardPostPhotos(p.id, p.coverId), 60);
  return html + '</div>';
}

// editId 가 있으면 그 글을 고치는 모드 — 작성 모달을 그대로 재사용한다.
function openBoardPostModal(type, editId) {
  const p = editId ? getBoardPost(editId) : null;
  if (editId && !p) { toast('글을 찾을 수 없어요'); return; }
  _boardPostEditId    = p ? p.id : null;
  _boardPostModalType = p ? (p.type || type) : type;
  const isApp = _boardPostModalType === 'app';
  document.getElementById('board-post-modal-title').textContent = p ? '글 수정' : (isApp ? '공지 작성' : '건의하기');
  document.getElementById('bp-submit-btn').textContent = p ? '수정 완료' : (isApp ? '공지 등록' : '건의 등록');
  const cats = isApp ? BOARD_APP_CATEGORIES : BOARD_USER_CATEGORIES;
  // 옛 글의 분류가 목록에서 빠졌을 수 있다 — 없으면 그 값을 임시로 넣어 원래 분류가 날아가지 않게
  const list = (p && p.category && !cats.includes(p.category)) ? [p.category, ...cats] : cats;
  document.getElementById('bp-category').innerHTML = list.map(c=>`<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  if (p && p.category) document.getElementById('bp-category').value = p.category;
  document.getElementById('bp-title').value   = p ? (p.title   || '') : '';
  document.getElementById('bp-content').value = p ? (p.content || '') : '';
  const pinRow = document.getElementById('bp-pin-row');
  if (pinRow) pinRow.style.display = isApp && me.isAppAdmin ? 'block' : 'none';
  const pinCb = document.getElementById('bp-pinned');
  if (pinCb) pinCb.checked = !!(p && p.pinned);
  // 비공개 토글 — 건의함(user)에서만 노출
  const privRow = document.getElementById('bp-private-row');
  if (privRow) privRow.style.display = isApp ? 'none' : 'block';
  const privCb = document.getElementById('bp-private');
  if (privCb) privCb.checked = !!(p && p.isPrivate);
  // 사진 — 수정 모드면 서버에서 불러와 채운다(그동안 빈 자리로 먼저 보인다)
  _bpPhotos = []; _bpCoverId = p ? (p.coverId || null) : null; _bpRemovedPhotos = [];
  _bpRenderPhotoStrip();
  if (p && p.photoCount && window._fbReady && window._fb?.getBoardPhotos) {
    window._fb.getBoardPhotos(p.id).then(snap => {
      if (_boardPostEditId !== p.id) return;          // 그 사이 모달이 바뀜
      snap.forEach(d => _bpPhotos.push({ id: d.id, url: d.data().url, isNew: false }));
      if (!_bpCoverId && _bpPhotos.length) _bpCoverId = _bpPhotos[0].id;
      _bpRenderPhotoStrip();
    }).catch(() => {});
  }
  document.getElementById('modal-board-post').classList.add('open');
  // 열릴 때 내용 높이를 맞춘다 — 글 수정으로 긴 글을 불러오면 5줄에 잘린 채 열렸다.
  // 모달이 화면에 붙은 뒤라야 scrollHeight 가 제대로 나온다.
  setTimeout(() => autoGrow(document.getElementById('bp-content')), 30);
}

// ── 게시글 첨부 사진 ──
// 사진은 boardPosts/{id}/photos 서브컬렉션에 한 장씩. 글 문서에는 목록용 작은 썸네일
// (coverThumb) 만 둔다 — 목록은 글 50개를 한 번에 읽어서 원본이 딸려 오면 감당이 안 된다.
var BP_PHOTO_MAX      = 10;
var BP_PHOTO_BYTES    = 200 * 1024;   // 장당 목표 (문서 1MB 한도 안쪽)
// 목록 썸네일은 예산이 아니라 크기를 고정한다. _fitImageForFirestore 는 한도에 못
// 들어가면 마지막(560px) 결과를 그냥 돌려주는데, 그게 100KB 면 글 50개짜리 목록이
// 5MB 가 된다. 카드에 58px 로 들어가므로 320px 이면 고해상도에서도 충분하다.
var BP_COVER_DIM      = 320;
var BP_COVER_Q        = 0.6;

function _bpRenderPhotoStrip() {
  const box = document.getElementById('bp-photo-strip');
  if (!box) return;
  const thumbs = _bpPhotos.map(p => {
    const src = _safeImgSrc(p.url);
    if (!src) return '';
    const isCover = p.id === _bpCoverId;
    return `<div class="bp-thumb${isCover ? ' cover' : ''}" onclick="setBoardPostCover('${escHtml(p.id)}')">
        <img src="${src}" alt="첨부 사진" loading="lazy">
        ${isCover ? '<span class="bp-thumb-tag">대표</span>' : ''}
        <button class="bp-thumb-x" onclick="event.stopPropagation();removeBoardPostPhoto('${escHtml(p.id)}')"
          aria-label="사진 빼기">✕</button>
      </div>`;
  }).join('');
  const addBtn = _bpPhotos.length >= BP_PHOTO_MAX ? '' :
    `<button type="button" class="bp-thumb-add" onclick="document.getElementById('bp-photo-input').click()">
       <span>＋</span><span class="bp-thumb-add-n">${_bpPhotos.length}/${BP_PHOTO_MAX}</span>
     </button>`;
  box.innerHTML = thumbs + addBtn;
}

async function addBoardPostPhotos(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (!files.length) return;
  const room = BP_PHOTO_MAX - _bpPhotos.length;
  if (room <= 0) { toast(`사진은 최대 ${BP_PHOTO_MAX}장까지예요`); return; }
  if (files.length > room) toast(`${room}장만 담았어요 (최대 ${BP_PHOTO_MAX}장)`);
  loading(true);
  try {
    for (const file of files.slice(0, room)) {
      if (!file.type.startsWith('image/')) { toast('이미지 파일만 올릴 수 있어요'); continue; }
      if (file.size > 10 * 1024 * 1024) { toast('사진이 너무 커요 (10MB 이하)'); continue; }
      const raw = await _readFileAsDataUrl(file);
      const url = await _fitImageForFirestore(raw, BP_PHOTO_BYTES);
      const id  = 'ph_' + uid();
      _bpPhotos.push({ id, url, isNew: true });
      if (!_bpCoverId) _bpCoverId = id;      // 첫 장이 기본 대표
    }
  } catch (e) {
    console.error('사진 준비 실패:', e);
    toast('사진을 불러오지 못했어요');
  }
  loading(false);
  _bpRenderPhotoStrip();
}

function setBoardPostCover(id) {
  if (!_bpPhotos.some(p => p.id === id)) return;
  _bpCoverId = id;
  _bpRenderPhotoStrip();
  toast('대표사진으로 정했어요');
}

function removeBoardPostPhoto(id) {
  const p = _bpPhotos.find(x => x.id === id);
  if (!p) return;
  if (!p.isNew) _bpRemovedPhotos.push(id);   // 이미 서버에 있는 것만 지울 목록에
  _bpPhotos = _bpPhotos.filter(x => x.id !== id);
  if (_bpCoverId === id) _bpCoverId = _bpPhotos.length ? _bpPhotos[0].id : null;
  _bpRenderPhotoStrip();
}

// 저장 시점의 사진 반영. 글 문서 쓰기가 성공한 뒤에 부른다.
async function _bpCommitPhotos(postId) {
  if (!window._fbReady || !window._fb?.setBoardPhoto) return;
  for (const id of _bpRemovedPhotos) {
    await window._fb.deleteBoardPhoto(postId, id).catch(() => {});
  }
  for (const p of _bpPhotos) {
    if (!p.isNew) continue;
    await window._fb.setBoardPhoto(postId, p.id, {
      url: p.url, authorId: me.id, at: new Date().toISOString()
    }).catch(e => { console.error('사진 저장 실패:', e); });
  }
  _bpRemovedPhotos = [];
  _bpPhotos.forEach(p => { p.isNew = false; });
}

// 목록 카드에 띄울 대표사진 썸네일. 원본을 그대로 글 문서에 넣으면 목록 한 번에 수 MB 다.
async function _bpCoverThumb() {
  const cover = _bpPhotos.find(p => p.id === _bpCoverId) || _bpPhotos[0];
  if (!cover) return '';
  try { return await _compressImageDataUrl(cover.url, BP_COVER_DIM, BP_COVER_Q); }
  catch (e) { return ''; }
}

// 상세 화면의 사진 — 렌더는 동기라 자리만 만들어 두고 여기서 채운다(댓글과 같은 방식).
async function loadBoardPostPhotos(postId, coverId) {
  const box = document.getElementById('board-photos');
  if (!box) return;
  if (!window._fbReady || !window._fb?.getBoardPhotos) { box.innerHTML = ''; return; }
  try {
    const snap = await window._fb.getBoardPhotos(postId);
    const rows = [];
    snap.forEach(d => rows.push({ id: d.id, url: d.data().url }));
    if (document.getElementById('board-photos') !== box) return;   // 그 사이 화면이 바뀜
    // 대표를 맨 앞으로
    rows.sort((a, b) => (a.id === coverId ? -1 : b.id === coverId ? 1 : 0));
    box.innerHTML = rows.map(r => {
      const src = _safeImgSrc(r.url);
      return src ? `<img src="${src}" alt="첨부 사진" loading="lazy" onclick="openImageLightbox(this.src)">` : '';
    }).join('');
  } catch (e) {
    console.warn('게시글 사진 로드 실패:', e);
    box.innerHTML = '';
  }
}

function closeBoardPostModal(e) {
  if (!e || e.target.id === 'modal-board-post')
    document.getElementById('modal-board-post').classList.remove('open');
}

async function submitBoardPost() {
  const title   = document.getElementById('bp-title').value.trim();
  const content = document.getElementById('bp-content').value.trim();
  const category= document.getElementById('bp-category').value;
  if (!title)   { toast('제목을 입력해 주세요'); return; }
  if (!content) { toast('내용을 입력해 주세요'); return; }
  const pinned  = _boardPostModalType === 'app' && document.getElementById('bp-pinned')?.checked;
  const isPrivate = _boardPostModalType === 'user' && document.getElementById('bp-private')?.checked;

  const coverThumb = await _bpCoverThumb();

  // ── 수정 모드 ── 서버가 거절하면 로컬도 건드리지 않는다(등록과 같은 이유)
  if (_boardPostEditId) {
    const patch = { category, title, content, editedAt: new Date().toISOString(),
                    coverThumb, coverId: _bpCoverId || '', photoCount: _bpPhotos.length };
    if (_boardPostModalType === 'app')  patch.pinned    = !!pinned;
    if (_boardPostModalType === 'user') patch.isPrivate = !!isPrivate;
    if (window._fbReady && window._fb) {
      try {
        await window._fb.updateBoardPost(_boardPostEditId, patch);
      } catch(e) {
        console.error('게시글 수정 실패:', e);
        toast(`수정 실패 (${e.code || e.message || e})`);
        return;
      }
    }
    await _bpCommitPhotos(_boardPostEditId);
    const list = getBoardPosts(_boardPostModalType);
    const cur  = list.find(x => x.id === _boardPostEditId);
    if (cur) { Object.assign(cur, patch); saveBoardPosts(_boardPostModalType, list); }
    closeBoardPostModal();
    toast('글을 수정했어요');
    openSubscreen('board-post');   // 상세로 되돌아오며 새 내용 반영
    return;
  }

  const post = {
    id: 'bp_' + uid(), type: _boardPostModalType,
    category, title, content,
    authorId: me.id, authorName: me.name,
    pinned: !!pinned,
    isPrivate: !!isPrivate,   // 비공개: 작성자 + 앱 관리자만 열람
    status: 'pending',
    likes: [], comments: [],
    coverThumb, coverId: _bpCoverId || '', photoCount: _bpPhotos.length,
    createdAt: new Date().toISOString()
  };
  // 서버 저장이 먼저다. 로컬에만 넣고 "등록됐어요" 라고 하면, 목록을 다시 불러오는 순간
  // 서버 목록으로 덮여 글이 사라진다 — 사용자 눈에는 등록 자체가 안 된 것으로 보인다.
  if (window._fbReady && window._fb) {
    try {
      await window._fb.setBoardPost(post.id, post);
    } catch(e) {
      console.error('게시글 저장 실패:', e);
      toast(`등록 실패 (${e.code || e.message || e})`);
      return;
    }
  }

  await _bpCommitPhotos(post.id);

  const list = getBoardPosts(_boardPostModalType);
  list.unshift(post);
  saveBoardPosts(_boardPostModalType, list);

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
  // '반영됨' 으로 바뀐 시각을 남긴다 — 2주 뒤 자동 정리의 기준.
  // 이 필드가 없는 옛 글은 정리 대상이 아니다(어느 날 반영됐는지 알 수 없다).
  const patch = { status };
  if (status === 'adopted') patch.adoptedAt = new Date().toISOString();
  Object.assign(p, patch);
  saveBoardPosts('user', list);
  if (window._fbReady && window._fb)
    window._fb.updateBoardPost(id, patch).catch(() => {});
  const st = BOARD_STATUS[status];
  toast(`상태를 "${st?.label||status}"로 변경했어요`);
  openSubscreen('board-post');
}

function deleteBoardPost(id) {
  const p = getBoardPost(id);
  ['app','user'].forEach(type => {
    saveBoardPosts(type, getBoardPosts(type).filter(x => x.id !== id));
  });
  _deleteBoardPostEverywhere(id, p && p.photoCount);
  toast('게시글을 삭제했어요');
  openBoardScreen(_boardType);
}

// 글 문서만 지우면 사진 서브컬렉션은 서버에 그대로 남는다(Firestore 는 하위 문서를
// 같이 지워주지 않는다). 사진부터 훑어 지운 뒤 글을 지운다.
async function _deleteBoardPostEverywhere(id, hasPhotos) {
  if (!window._fbReady || !window._fb) return;
  if (hasPhotos && window._fb.getBoardPhotos) {
    try {
      const snap = await window._fb.getBoardPhotos(id);
      const ids  = [];
      snap.forEach(d => ids.push(d.id));
      for (const pid of ids) await window._fb.deleteBoardPhoto(id, pid).catch(() => {});
    } catch (e) { console.warn('첨부 사진 삭제 실패:', e); }
  }
  await window._fb.deleteBoardPost(id).catch(() => {});
}

// ── 반영된 건의 자동 정리 ──
// 사진이 base64 로 들어 있어 그냥 두면 무료 요금제 저장 용량을 갉아먹는다(인증샷·채팅과 같은 이유).
// 예약 정리(Cloud Functions)는 Blaze 전용이라 못 쓴다 → 목록을 여는 사람이 조금씩 치운다.
// 규칙상 지울 수 있는 사람은 작성자와 앱 관리자뿐이라, 그 둘이 건의함을 열 때 실제로 지워진다.
var BOARD_ADOPTED_TTL_MS = 14 * 24 * 60 * 60 * 1000;
function _boardPostExpired(p) {
  if (!p || p.status !== 'adopted' || !p.adoptedAt) return false;
  const t = Date.parse(p.adoptedAt);
  return !isNaN(t) && (Date.now() - t > BOARD_ADOPTED_TTL_MS);
}
function _sweepAdoptedPosts(posts) {
  if (!me || !window._fbReady || !window._fb) return posts;
  const expired = posts.filter(_boardPostExpired)
                       .filter(p => p.authorId === me.id || me.isAppAdmin);
  expired.slice(0, 5).forEach(p => _deleteBoardPostEverywhere(p.id, p.photoCount));
  const gone = new Set(expired.slice(0, 5).map(p => p.id));
  return posts.filter(p => !gone.has(p.id));
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

