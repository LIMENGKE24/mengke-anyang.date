(() => {
  const dialog = document.querySelector('#viewer');
  const image = document.querySelector('#viewer-image');
  const caption = document.querySelector('#viewer-caption');
  const surface = dialog?.querySelector('figure');
  const controls = dialog?.querySelector('.viewer-controls');
  let items = [], current = 0, opener, swipe = null;
  let animation, moving = false, motionVersion = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const readyImages = new Map();
  function prepare(item) {
    if (!item) return Promise.resolve();
    if (!readyImages.has(item.href)) {
      const preload = new Image();
      const ready = new Promise(resolve => {
        preload.onload = () => {
          if (preload.decode) preload.decode().catch(() => {}).then(resolve);
          else resolve();
        };
        preload.onerror = resolve;
      });
      readyImages.set(item.href, ready);
      preload.src = item.href;
    }
    return readyImages.get(item.href);
  }
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
    // Keep the current photo visible until the next one has loaded.
    await prepare(items[index]);
    if (version !== motionVersion) return;
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
    image.src = item.href;
    image.alt = item.dataset.caption || item.querySelector('img').alt;
    caption.textContent = image.alt;
    document.querySelector('#previous').disabled = current === 0;
    document.querySelector('#next').disabled = current === items.length - 1;
    if (opener?.matches('.photo-tile')) {prepare(items[current - 1]);prepare(items[current + 1]);}
  }
  document.querySelectorAll('[data-viewer]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || !dialog.showModal) return;
      event.preventDefault();
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
    dialog.addEventListener('close', () => {swipe = null;stopMotion();document.body.style.overflow = '';opener?.focus();});
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
  }));
  document.querySelector('#copy-address')?.addEventListener('click', async () => {
    const status = document.querySelector('#copy-status');
    const address = '陕西省西安市雁塔区丈八北路1号 陕西宾馆 陕西大会堂 咸阳厅';
    try {await navigator.clipboard.writeText(address);status.textContent = '地址已复制，可粘贴到高德地图搜索。';}
    catch {status.textContent = `请长按复制：${address}`;}
  });
})();
