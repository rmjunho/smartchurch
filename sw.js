// 스마트처치 서비스워커
//
// ★ 핵심 원칙: HTML/CSS/JS 는 반드시 network-first.
//   git push 만으로 즉시 반영돼야 하므로 cache-first 를 쓰지 않는다.
//   캐시는 "네트워크가 실패했을 때만" 쓰는 오프라인 폴백이다.
//
// ★ fetch 를 가로채지 않는 대상 (가로채면 Firebase 로그인과 onSnapshot 실시간 채팅이 깨진다)
//   · 외부 origin 전체 (Firebase, gstatic, jsdelivr 등)
//   · GET 이외의 모든 메서드
//   위 경우는 respondWith 를 호출하지 않고 그대로 브라우저에 넘긴다.

// ★ 배포할 때마다 이 숫자를 올린다. sw.js 의 바이트가 바뀌어야 브라우저가 '새 버전'으로 인식하고,
//   그래야 index.html 의 updatefound 가 떠서 열려 있는 앱이 스스로 새로고침한다.
//   다른 파일만 고치면 sw.js 는 그대로라 브라우저는 바뀐 걸 영영 모른다(배포해도 반영 안 되던 원인).
const SW_VERSION = 50;
const CACHE_NAME = 'smartchurch-v' + SW_VERSION;

// 오프라인 폴백용 최소 자산. 설치 실패를 막기 위해 개별 실패는 무시한다.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/firebase-config.js',
  '/js/auth.js',
  '/js/church.js',
  '/js/challenge.js',
  '/js/matching.js',
  '/js/admin.js',
  '/js/feed.js',
  '/manifest.json',
  '/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png'
];

// 가로채면 안 되는 호스트. 외부 origin 검사에서 이미 걸러지지만 의도를 명시해 둔다.
const BYPASS_HOST_PATTERN = /(^|\.)(googleapis\.com|gstatic\.com|firebaseio\.com|firebaseapp\.com|google\.com)$/i;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(
        // 하나라도 404 면 addAll 전체가 실패하므로 개별로 담는다
        PRECACHE_URLS.map(url => cache.add(url).catch(() => {}))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))   // 이전 버전 캐시 전부 삭제
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // 1) GET 이외는 손대지 않는다 (Firestore 쓰기, Auth POST 등)
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // 2) 외부 origin 전체 제외 — Firebase/CDN 요청은 브라우저가 직접 처리
  if (url.origin !== self.location.origin) return;
  if (BYPASS_HOST_PATTERN.test(url.hostname)) return;

  // 3) 같은 origin GET 만 network-first 로 처리
  //    GitHub Pages 가 max-age=600 을 주므로 그냥 fetch 하면 브라우저 HTTP 캐시에서
  //    최대 10분간 옛 파일이 나온다(푸시했는데 앱에 안 보이는 원인). no-cache 로
  //    항상 ETag 재검증 → 안 바뀌었으면 304 라 비용은 거의 없다.
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        // 정상 응답만 캐시 갱신 (opaque/에러 응답은 저장하지 않음)
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        // 네트워크 실패 시에만 캐시 폴백. 페이지 이동이면 앱 셸을 돌려준다.
        caches.match(req)
          .then(hit => hit || (req.mode === 'navigate' ? caches.match('/index.html') : null))
          // respondWith 에 undefined 를 넘기면 TypeError 가 되므로 항상 Response 를 반환한다
          .then(hit => hit || new Response('오프라인 상태예요', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          }))
      )
  );
});
