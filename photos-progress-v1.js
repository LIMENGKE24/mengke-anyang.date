(() => {
  const dialog = document.querySelector('#viewer');
  const image = document.querySelector('#viewer-image');
  const caption = document.querySelector('#viewer-caption');
  const surface = dialog?.querySelector('figure');
  const controls = dialog?.querySelector('.viewer-controls');
  let items = [], current = 0, opener, swipe = null;
  let animation, moving = false, motionVersion = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const thumbs = [...document.querySelectorAll('.photo-tile > img[data-src]')];
  const placeholder = thumbs[0]?.src || '';
  let activeThumbs = 0;
  const thumbRecords = new Map(thumbs.map(img => [img, {img, tile:img.closest('.photo-tile'), state:'idle', attempts:0, near:false}]));
  const retryURL = (src, attempt) => {
    if (!attempt) return src;
    const url = new URL(src, document.baseURI);
    url.searchParams.set('retry', String(attempt));
    return url.href;
  };
  function resetThumb(record) {
    record.attempts = 0;
    record.state = 'idle';
    record.near = true;
    record.tile.classList.remove('thumbnail-error');
    record.tile.querySelector('.zoom-label').textContent = '放大 ＋';
    pumpThumbs();
  }
  function loadThumb(record) {
    const {img, tile} = record;
    record.state = img.dataset.state = 'loading';
    activeThumbs++;
    const attempt = record.attempts++;
    let finished = false, timer;
    const end = ok => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      img.onload = img.onerror = null;
      activeThumbs--;
      if (ok) {
        record.state = img.dataset.state = 'ready';
      } else {
        img.removeAttribute('srcset');
        img.src = placeholder;
        if (record.attempts < 3) {
          record.state = img.dataset.state = 'waiting';
          setTimeout(() => {record.state = img.dataset.state = 'idle';pumpThumbs();}, attempt ? 2000 : 800);
        } else {
          record.state = img.dataset.state = 'failed';
          tile.classList.add('thumbnail-error');
          tile.querySelector('.zoom-label').textContent = '加载失败 · 点击重试';
        }
      }
      pumpThumbs();
    };
    img.onload = () => {if (img.naturalWidth > 1) end(true);};
    img.onerror = () => end(false);
    timer = setTimeout(() => end(false), 20000);
    const box = img.getBoundingClientRect();
    img.fetchPriority = box.top < innerHeight && box.bottom > 0 ? 'high' : 'low';
    img.srcset = img.dataset.srcset.split(',').map(candidate => {
      const [src, width] = candidate.trim().split(/\s+/);
      return `${retryURL(src, attempt)} ${width}`;
    }).join(', ');
    img.src = retryURL(img.dataset.src, attempt);
  }
  function pumpThumbs() {
    const candidates = [...thumbRecords.values()].filter(r => r.near && !r.tile.hidden && r.state === 'idle');
    candidates.sort((a,b) => {
      const distance = r => {
        const rect = r.img.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < innerHeight ? 0 : Math.min(Math.abs(rect.top), Math.abs(rect.bottom));
      };
      return distance(a)-distance(b);
    });
    while (activeThumbs < 3 && candidates.length) loadThumb(candidates.shift());
  }
  function scanThumbs() {
    for (const record of thumbRecords.values()) {
      const box = record.img.getBoundingClientRect();
      record.near = !record.tile.hidden && box.bottom >= -240 && box.top <= innerHeight + 240;
    }
    pumpThumbs();
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) thumbRecords.get(entry.target).near = entry.isIntersecting;
      pumpThumbs();
    }, {rootMargin:'240px 0px'});
    thumbs.forEach(img => observer.observe(img));
  } else {
    let pending = false;
    window.addEventListener('scroll', () => {
      if (!pending) {pending = true;requestAnimationFrame(() => {pending = false;scanThumbs();});}
    }, {passive:true});
  }
  window.addEventListener('resize',scanThumbs,{passive:true});
  document.fonts?.ready.then(scanThumbs);
  scanThumbs();
  const readyImages = new Map();
  const retryButton = document.querySelector('#viewer-retry');
  const loading = document.querySelector('#viewer-loading');
  const ring = document.querySelector('#download-ring');
  const percent = document.querySelector('#download-percent');
  const status = document.querySelector('#download-status');
  const size = document.querySelector('#download-size');
  let renderVersion = 0, activeRequest = null;
  function cancelDownload() {activeRequest?.abort();activeRequest = null;}
  function updateProgress(loaded,total) {
    const known = total > 0;
    const value = known ? Math.min(100,Math.floor(loaded / total * 100)) : 0;
    ring.hidden = false;
    ring.classList.toggle('indeterminate',!known);
    ring.style.setProperty('--progress',String(value));
    if (known) ring.setAttribute('aria-valuenow',String(value));
    else ring.removeAttribute('aria-valuenow');
    percent.textContent = known ? `${value}%` : '';
    status.textContent = value === 100 ? '下载完成，正在呈现照片' : '正在加载高清照片';
    const mb = bytes => `${(bytes/1048576).toFixed(1)} MB`;
    size.textContent = known ? `${mb(loaded)} / ${mb(total)}` : loaded ? `已下载 ${mb(loaded)}` : '请稍候';
  }
  function fetchPhoto(src,attempt,version) {
    return new Promise((resolve,reject) => {
      const request = new XMLHttpRequest();
      activeRequest = request;
      let timer,finished = false;
      const finish = (ok,value) => {
        if (finished) return;
        finished = true;clearTimeout(timer);
        request.onload = request.onerror = request.onabort = request.onprogress = null;
        if (activeRequest === request) activeRequest = null;
        ok ? resolve(value) : reject(value);
      };
      const watch = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          finish(false,new Error('Download stalled'));
          request.abort();
        },45000);
      };
      request.open('GET',retryURL(src,attempt));
      request.responseType = 'blob';
      request.onprogress = event => {
        watch();
        if (version === renderVersion && dialog.open) updateProgress(event.loaded,event.lengthComputable ? event.total : 0);
      };
      request.onload = () => {
        if (request.status < 200 || request.status >= 300 || !request.response?.size) {finish(false,new Error('Image unavailable'));return;}
        finish(true,request.response);
      };
      request.onerror = () => finish(false,new Error('Network unavailable'));
      request.onabort = () => finish(false,Object.assign(new Error('Cancelled'),{name:'AbortError'}));
      watch();request.send();
    });
  }
  async function decodePhoto(src) {
    const photo = new Image();
    if (photo.decode) {photo.src = src;await photo.decode();}
    else await new Promise((resolve,reject) => {photo.onload=resolve;photo.onerror=reject;photo.src=src;});
  }
  function cachePhoto(key,src) {
    readyImages.delete(key);readyImages.set(key,src);
    while (readyImages.size > 3) {
      const first = readyImages.keys().next().value;
      URL.revokeObjectURL(readyImages.get(first));readyImages.delete(first);
    }
  }
  async function upgradePhoto(item,version) {
    await Promise.resolve();
    if (version !== renderVersion || !dialog.open) return;
    let src = readyImages.get(item.href);
    if (src) {readyImages.delete(item.href);readyImages.set(item.href,src);}
    else for (let attempt=0;attempt<3;attempt++) {
      let temporary;
      try {
        const blob = await fetchPhoto(item.href,attempt,version);
        if (version !== renderVersion || !dialog.open) return;
        updateProgress(blob.size,blob.size);
        temporary = URL.createObjectURL(blob);
        await decodePhoto(temporary);
        if (version !== renderVersion || !dialog.open) {URL.revokeObjectURL(temporary);return;}
        src=temporary;cachePhoto(item.href,src);break;
      } catch (error) {
        if (temporary) URL.revokeObjectURL(temporary);
        if (version !== renderVersion || !dialog.open || error?.name === 'AbortError') return;
        if (attempt < 2) {
          ring.classList.add('indeterminate');ring.removeAttribute('aria-valuenow');percent.textContent='';
          status.textContent='连接中断，正在重试';size.textContent='';
          await new Promise(resolve=>setTimeout(resolve,attempt ? 1800 : 800));
          if (version !== renderVersion || !dialog.open) return;
          updateProgress(0,0);
        } else {
          ring.hidden=true;status.textContent='照片暂时未能加载';size.textContent='可以重试，或继续查看下一张';
          retryButton.hidden=false;dialog.setAttribute('aria-busy','false');return;
        }
      }
    }
    if (version !== renderVersion || !dialog.open) return;
    image.src=src;image.style.visibility='visible';
    loading.hidden=true;retryButton.hidden=true;dialog.setAttribute('aria-busy','false');
  }
  retryButton.addEventListener('click',()=>{
    cancelDownload();retryButton.hidden=true;dialog.setAttribute('aria-busy','true');updateProgress(0,0);
    upgradePhoto(items[current],++renderVersion);
  });
  function stopMotion() {
    motionVersion++;
    moving = false;
    animation?.cancel();
    animation = null;
    image.style.transform = '';
    image.style.opacity = '';
    image.style.willChange = '';
  }
  async function animate(frames, duration) {
    animation?.cancel();
    animation = image.animate(frames, {duration, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards'});
    await animation.finished.catch(() => {});
  }
  function settle() {
    const from = image.style.transform;
    stopMotion();
    if (!from || reducedMotion.matches || !image.animate) return;
    const version = motionVersion;
    animate([{transform: from}, {transform: 'translateX(0)'}], 180).then(() => {
      if (version === motionVersion) stopMotion();
    });
  }
  async function slideTo(index, dx) {
    if (moving) return;
    if (reducedMotion.matches || !image.animate) {show(index);return;}
    const version = ++motionVersion;
    moving = true;
    const direction = dx < 0 ? -1 : 1;
    const distance = Math.min(surface.clientWidth * .3, 150);
    image.style.willChange = 'transform, opacity';
    await animate([
      {transform: image.style.transform || 'translateX(0)', opacity: 1},
      {transform: `translateX(${direction * distance}px)`, opacity: 0}
    ], 120);
    if (version !== motionVersion) return;
    render(index);
    await animate([
      {transform: `translateX(${-direction * distance * .5}px)`, opacity: 0},
      {transform: 'translateX(0)', opacity: 1}
    ], 220);
    if (version === motionVersion) stopMotion();
  }
  function show(index) {
    stopMotion();
    render(index);
  }
  function render(index) {
    current = index;
    const item = items[current];
    const version = ++renderVersion;
    cancelDownload();
    image.style.visibility = 'hidden';
    image.removeAttribute('src');
    retryButton.hidden = true;
    loading.hidden = false;
    dialog.setAttribute('aria-busy','true');
    updateProgress(0,0);
    upgradePhoto(item,version);
    image.alt = item.dataset.caption || item.querySelector('img').alt;
    caption.textContent = image.alt;
    document.querySelector('#previous').disabled = current === 0;
    document.querySelector('#next').disabled = current === items.length - 1;
  }
  document.querySelectorAll('[data-viewer]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || !dialog.showModal) return;
      event.preventDefault();
      const thumbRecord = thumbRecords.get(link.querySelector('img'));
      if (thumbRecord?.state === 'failed') {resetThumb(thumbRecord);return;}
      items = [...document.querySelectorAll('[data-viewer]')].filter(item => !item.hidden);
      opener = link;
      controls.style.display = items.length > 1 ? '' : 'none';
      surface.style.touchAction = link.matches('.photo-tile') ? 'pan-y pinch-zoom' : '';
      swipe = null;
      show(items.indexOf(link));
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    });
  });
  if (dialog) {
    dialog.querySelector('.viewer-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {renderVersion++;cancelDownload();loading.hidden = true;retryButton.hidden = true;dialog.setAttribute('aria-busy','false');image.removeAttribute('src');swipe = null;stopMotion();document.body.style.overflow = '';opener?.focus();});
    // Track one-finger album swipes; leave vertical gestures and pinch zoom alone.
    surface.addEventListener('touchstart', event => {
      swipe = null;
      if (moving) return;
      stopMotion();
      if (!opener?.matches('.photo-tile') || items.length < 2 || event.touches.length !== 1 || (window.visualViewport?.scale || 1) > 1.01) return;
      const touch = event.touches[0];
      swipe = {id: touch.identifier, x: touch.clientX, y: touch.clientY};
    }, {passive: true});
    surface.addEventListener('touchmove', event => {
      if (!swipe) return;
      if (event.touches.length !== 1 || (window.visualViewport?.scale || 1) > 1.01) {swipe = null;settle();return;}
      const touch = event.touches[0];
      const dx = Math.abs(touch.clientX - swipe.x), dy = Math.abs(touch.clientY - swipe.y);
      if (dy > 15 && dy > dx) {swipe = null;settle();return;}
      if (dx > 15 && dx > dy * 1.4) {
        if (event.cancelable) event.preventDefault();
        if (!reducedMotion.matches) {
          const delta = touch.clientX - swipe.x;
          const atEdge = (delta > 0 && current === 0) || (delta < 0 && current === items.length - 1);
          const offset = Math.max(-120, Math.min(120, delta * (atEdge ? .16 : .55)));
          image.style.transform = `translateX(${offset}px)`;
        }
      }
    }, {passive: false});
    surface.addEventListener('touchend', event => {
      const start = swipe;
      swipe = null;
      if (!start || event.touches.length || (window.visualViewport?.scale || 1) > 1.01) {if (!moving) settle();return;}
      const touch = [...event.changedTouches].find(touch => touch.identifier === start.id);
      if (!touch) {settle();return;}
      const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy) * 1.4) {settle();return;}
      const next = current + (dx < 0 ? 1 : -1);
      if (next >= 0 && next < items.length) slideTo(next, dx);
      else settle();
    }, {passive: true});
    surface.addEventListener('touchcancel', () => {swipe = null;if (!moving) settle();}, {passive: true});
    dialog.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight' && current < items.length - 1) {event.preventDefault();show(current + 1);}
      if (event.key === 'ArrowLeft' && current > 0) {event.preventDefault();show(current - 1);}
    });
    document.querySelector('#previous').addEventListener('click', () => {if (current > 0) show(current - 1);});
    document.querySelector('#next').addEventListener('click', () => {if (current < items.length - 1) show(current + 1);});
  }
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    let count = 0;
    document.querySelectorAll('.photo-tile').forEach(tile => {
      tile.hidden = button.dataset.filter !== '全部' && tile.dataset.group !== button.dataset.filter;
      if (!tile.hidden) count++;
    });
    document.querySelector('#photo-count').textContent = '点击照片，可放大查看';
    requestAnimationFrame(scanThumbs);
  }));
  document.querySelector('#copy-address')?.addEventListener('click', async () => {
    const status = document.querySelector('#copy-status');
    const address = '陕西省西安市雁塔区丈八北路1号 陕西宾馆 陕西大会堂 咸阳厅';
    try {await navigator.clipboard.writeText(address);status.textContent = '地址已复制，可粘贴到高德地图搜索。';}
    catch {status.textContent = `请长按复制：${address}`;}
  });
  document.documentElement.dataset.albumLoader = 'ready';
})();
