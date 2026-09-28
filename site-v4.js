(() => {
  const dialog = document.querySelector('#viewer');
  const image = document.querySelector('#viewer-image');
  const caption = document.querySelector('#viewer-caption');
  const surface = dialog?.querySelector('figure');
  const controls = dialog?.querySelector('.viewer-controls');
  let items = [], current = 0, opener, swipe = null;
  function show(index) {
    current = index;
    const item = items[current];
    image.src = item.href;
    image.alt = item.dataset.caption || item.querySelector('img').alt;
    caption.textContent = image.alt;
    document.querySelector('#previous').disabled = current === 0;
    document.querySelector('#next').disabled = current === items.length - 1;
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
    dialog.addEventListener('close', () => {swipe = null;document.body.style.overflow = '';opener?.focus();});
    // Track one-finger album swipes; leave vertical gestures and pinch zoom alone.
    surface.addEventListener('touchstart', event => {
      swipe = null;
      if (!opener?.matches('.photo-tile') || items.length < 2 || event.touches.length !== 1 || (window.visualViewport?.scale || 1) > 1.01) return;
      const touch = event.touches[0];
      swipe = {id: touch.identifier, x: touch.clientX, y: touch.clientY};
    }, {passive: true});
    surface.addEventListener('touchmove', event => {
      if (!swipe) return;
      if (event.touches.length !== 1 || (window.visualViewport?.scale || 1) > 1.01) {swipe = null;return;}
      const touch = event.touches[0];
      const dx = Math.abs(touch.clientX - swipe.x), dy = Math.abs(touch.clientY - swipe.y);
      if (dy > 15 && dy > dx) {swipe = null;return;}
      if (dx > 15 && dx > dy * 1.4 && event.cancelable) event.preventDefault();
    }, {passive: false});
    surface.addEventListener('touchend', event => {
      const start = swipe;
      swipe = null;
      if (!start || event.touches.length || (window.visualViewport?.scale || 1) > 1.01) return;
      const touch = [...event.changedTouches].find(touch => touch.identifier === start.id);
      if (!touch) return;
      const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy) * 1.4) return;
      const next = current + (dx < 0 ? 1 : -1);
      if (next >= 0 && next < items.length) show(next);
    }, {passive: true});
    surface.addEventListener('touchcancel', () => {swipe = null;}, {passive: true});
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
