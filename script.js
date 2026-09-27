'use strict';
const address='陕西省西安市陕西宾馆 · 陕西大会堂 · 咸阳厅。大会堂前广场免费停车，车辆可自由进出陕西宾馆。';
document.getElementById('copy-address')?.addEventListener('click',async()=>{
 const status=document.getElementById('copy-status');
 try{await navigator.clipboard.writeText(address);status.textContent='地址已复制，期待与你相见。';}
 catch{status.textContent='可长按选中上方地址，复制后在高德地图搜索。';}
});
const photos=Array.from(document.querySelectorAll('[data-photo]'));
const dialog=document.getElementById('lightbox');
let current=0,opener=null;
function showPhoto(index){current=(index+photos.length)%photos.length;const a=photos[current],img=a.querySelector('img');document.getElementById('lightbox-image').src=a.href;document.getElementById('lightbox-image').alt=img.alt;document.getElementById('lightbox-caption').textContent=`${current+1} / ${photos.length} · ${img.alt}`;}
photos.forEach((a,index)=>a.addEventListener('click',event=>{if(typeof dialog.showModal!=='function')return;event.preventDefault();opener=a;showPhoto(index);dialog.showModal();document.body.classList.add('modal-open');}));
dialog?.querySelector('.lightbox-close').addEventListener('click',()=>dialog.close());
dialog?.querySelector('.lightbox-prev').addEventListener('click',()=>showPhoto(current-1));
dialog?.querySelector('.lightbox-next').addEventListener('click',()=>showPhoto(current+1));
dialog?.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'){event.preventDefault();showPhoto(current-1);}if(event.key==='ArrowRight'){event.preventDefault();showPhoto(current+1);}});
dialog?.addEventListener('close',()=>{document.body.classList.remove('modal-open');if(opener)opener.focus({preventScroll:true});});
