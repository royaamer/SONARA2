/** Typed adaptation of EarthJukeBox sonification.js; formulas and rounding are unchanged. */
export function normalize(value:number,min:number,max:number) {
  if(max<=min) throw Error('max must be greater than min');
  return Math.max(0,Math.min(1,(value-min)/(max-min)));
}
export function mapToPitchWithDensity(latitude:number,scale:number[],flashCount:number,minFlashCount:number,maxFlashCount:number,maxRegisterSteps=12) {
  if(!Array.isArray(scale)||!scale.length) throw Error('Scale must be a non-empty array');
  if(flashCount<0 || minFlashCount<0 || maxFlashCount<minFlashCount) throw Error('Invalid flash count range');
  const latitudeValue=normalize(latitude,-90,90);
  const baseIndex=Math.round(latitudeValue*(scale.length-1));
  const basePitch=scale[baseIndex];
  const density=maxFlashCount===minFlashCount ? 0 : normalize(flashCount,minFlashCount,maxFlashCount);
  const registerShift=density*maxRegisterSteps;
  return basePitch*Math.pow(2,registerShift/12);
}
export function mapToIntensity(radiance:number,minRadiance:number,maxRadiance:number,flashCount:number,minFlashCount:number,maxFlashCount:number) {
  if(radiance<0) throw Error('Radiance cannot be negative');
  if(flashCount<0 || minFlashCount<0 || maxFlashCount<minFlashCount) throw Error('Invalid flash count range');
  const radianceValue=normalize(radiance,minRadiance,maxRadiance);
  const density=maxFlashCount===minFlashCount ? 0 : normalize(flashCount,minFlashCount,maxFlashCount);
  const intensity=0.2+(radianceValue*0.6)+(density*0.2);
  return Math.max(0,Math.min(1,intensity));
}
