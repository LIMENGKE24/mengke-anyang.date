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
  const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
  function fetchPhoto(src, priority, attempt) {
    return new Promise((resolve,reject) => {
      const photo = new Image();
      let ended = false;
      const timer = setTimeout(() => finish(false), 20000);
      function finish(ok) {
        if (ended) return;
        ended = true;clearTimeout(timer);
        photo.onload = photo.onerror = null;
        if (!ok) {photo.src = placeholder;reject(new Error('Image unavailable'));return;}
        Promise.resolve(photo.decode?.()).catch(() => {}).then(() => resolve(photo.src));
      }
      photo.onload = () => finish(true);
      photo.onerror = () => finish(false);
      photo.fetchPriority = priority;
      photo.src = retryURL(src, attempt);
    });
  }
  function prepare(item, background = false) {
    if (!item) return Promise.resolve(null);
    const key = item.href;
    const existing = readyImages.get(key);
    if (existing) return !background && existing.background ? existing.promise.catch(() => prepare(item,false)) : existing.promise;
    const entry = {background};
    entry.promise = (async () => {
      for (let attempt=0; attempt<3; attempt++) {
        try {entry.src = await fetchPhoto(key,background ? 'low' : 'high',attempt);return entry.src;}
        catch (error) {
          if (background || attempt===2) throw error;
          await sleep(attempt ? 1600 : 600);
        }
      }
    })().catch(error => {if (readyImages.get(key)===entry) readyImages.delete(key);throw error;});
    readyImages.set(key,entry);
    return entry.promise;
  }
  const retryButton = document.querySelector('#viewer-retry');
  let renderVersion = 0, preloadTimer;
  function preloadNeighbors(version) {
    clearTimeout(preloadTimer);
    preloadTimer = setTimeout(async () => {
      if (!dialog.open || version !== renderVersion || moving) return;
      for (const item of [items[current+1],items[current-1]]) {
        if (!dialog.open || version !== renderVersion) return;
        if (item) await prepare(item,true).catch(() => {});
      }
    }, 800);
  }
  async function upgradePhoto(item, version) {
    try {
      const src = await prepare(item);
      if (!dialog.open || version !== renderVersion) return;
      image.src = src;
      retryButton.hidden = true;
      preloadNeighbors(version);
    } catch (error) {
      if (dialog.open && version === renderVersion) retryButton.hidden = false;
    }
  }
  retryButton.addEventListener('click',() => {
    retryButton.hidden = true;
    upgradePhoto(items[current],renderVersion);
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
    clearTimeout(preloadTimer);
    retryButton.hidden = true;
    const thumb = item.querySelector('img');
    const cached = readyImages.get(item.href)?.src;
    image.src = cached || (thumb.dataset.state === 'ready' ? thumb.currentSrc || thumb.src : thumb.dataset.src || thumb.src);
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
    dialog.addEventListener('close', () => {renderVersion++;clearTimeout(preloadTimer);retryButton.hidden = true;swipe = null;stopMotion();document.body.style.overflow = '';opener?.focus();});
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
