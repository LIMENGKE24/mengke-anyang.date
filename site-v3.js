(() => {
  const dialog = document.querySelector('#viewer');
  const image = document.querySelector('#viewer-image');
  const caption = document.querySelector('#viewer-caption');
  let items = [], current = 0, opener;
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
      show(items.indexOf(link));
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    });
  });
  if (dialog) {
    dialog.querySelector('.viewer-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {document.body.style.overflow = '';opener?.focus();});
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
