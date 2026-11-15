/** Redraw in stable geographic coordinates at display, DPR and zoom resolution. */
export function observeMapResolution(canvas: HTMLCanvasElement, width: number, height: number, draw: () => void) {
 const update=()=>{
  const b=canvas.getBoundingClientRect();if(!b.width||!b.height)return;
  const d=window.devicePixelRatio||1,w=Math.round(b.width*d),h=Math.round(b.height*d);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  canvas.getContext('2d')?.setTransform(w/width,0,0,h/height,0,0);draw();
 };
 const resize=new ResizeObserver(update);resize.observe(canvas);
 const mutation=new MutationObserver(update),transform=canvas.closest('.map-transform');
 if(transform)mutation.observe(transform,{attributes:true,attributeFilter:['style']});
 if(transform?.firstElementChild)mutation.observe(transform.firstElementChild,{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('resize',update);update();
 return ()=>{resize.disconnect();mutation.disconnect();window.removeEventListener('resize',update);};
}
