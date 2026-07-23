const CACHE='arbeitszeit-v5-10-2026-07-23';
const APP_FILES=['./','./index.html','./app.css','./imported-data.js','./app.js','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png','./icon-1024.png'];
const CACHEABLE_PATHS=new Set(APP_FILES.filter(file=>file!=='./').map(file=>new URL(file,self.location.href).pathname));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>response.ok?response:Promise.reject()).catch(()=>caches.match('./index.html')));
    return;
  }
  if(!CACHEABLE_PATHS.has(url.pathname))return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(!response||!response.ok||response.type!=='basic')return response;
    const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;
  })));
});
