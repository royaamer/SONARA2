// Drawing ported from EarthJukeBox oceanComparison.js at a568df3fa6a4af815563f77aee2faf4c408e3fc3
const YEAR = 2023;
export function drawComparisonChart(ctx: CanvasRenderingContext2D, values: (number|null)[], base: string, comparison: string){
  const C=ctx.canvas,W=C.width,H=C.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#092335';ctx.fillRect(0,0,W,H);
  const top=17,bottom=H-28,left=52,right=W-20;
  const present=values.filter((v): v is number=>Number.isFinite(v));
  if(!present.length){
    ctx.fillStyle='#a2c3cc';ctx.textAlign='center';ctx.font='17px system-ui';
    ctx.fillText('Empty',W/2,H/2);return;
  }
  const max=Math.max(.1,Math.ceil(Math.max(...present)*10)/10);
  const x=(i:number)=>left+(right-left)*i/11;
  const y=(v:number)=>bottom-(v/max)*(bottom-top);
  for(let j=0;j<=3;j++){
    const v=max*j/3,yy=y(v!);
    ctx.strokeStyle='#244255';ctx.lineWidth=1;ctx.setLineDash([4,7]);
    ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();
    ctx.setLineDash([]);ctx.fillStyle='#8cadb8';ctx.textAlign='right';ctx.font='13px system-ui';
    ctx.fillText(v.toFixed(2),left-9,yy+4);
  }
  ctx.save();ctx.strokeStyle='#68ded2';ctx.lineWidth=3.1;ctx.lineJoin='round';ctx.lineCap='round';
  ctx.beginPath();let begun=false;
  values.forEach((v,i)=>{
    if(!Number.isFinite(v)){begun=false;return;}
    if(begun)ctx.lineTo(x(i),y(v!));else ctx.moveTo(x(i),y(v!));
    begun=true;
  });ctx.stroke();ctx.restore();
  values.forEach((v,i)=>{
    if(!Number.isFinite(v))return;
    ctx.beginPath();ctx.arc(x(i),y(v!),3.6,0,Math.PI*2);
    ctx.fillStyle='#65daca';ctx.fill();
  });
  for(const [key,color] of [[base,'#65e5d6'],[comparison,'#f2bf77']]){
    if(!key||key.slice(0,4)!==String(YEAR))continue;
    const i=Number(key.slice(-2))-1,v=values[i];
    if(!Number.isFinite(v))continue;
    ctx.beginPath();ctx.arc(x(i),y(v!),8,0,Math.PI*2);
    ctx.lineWidth=3;ctx.strokeStyle=color;ctx.stroke();
    ctx.fillStyle='#fff9e8';ctx.beginPath();ctx.arc(x(i),y(v!),3,0,Math.PI*2);ctx.fill();
  }
  ctx.fillStyle='#8caab6';ctx.textAlign='center';ctx.font='12px system-ui';
  ctx.fillText('Monthly mean speed (m/s)',W/2,H-8);
}

