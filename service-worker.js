const CACHE='workout-tracker-v32';
const FILES=['./','./index.html','./styles.css','./manifest.webmanifest','./icon.svg','./icon-192.png','./src/app.js','./src/db.js','./src/charts.js'];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(FILES);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('workout-tracker-')&&key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  const url=new URL(request.url);
  const isAppAsset=url.pathname.endsWith('/')||/\.(html|css|js|webmanifest|svg)$/.test(url.pathname);
  if(isAppAsset){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request,{cache:'no-store'});
        if(response.ok){
          const cache=await caches.open(CACHE);
          await cache.put(request,response.clone());
        }
        return response;
      }catch(error){
        return (await caches.match(request))||(await caches.match('./index.html'));
      }
    })());
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
});
