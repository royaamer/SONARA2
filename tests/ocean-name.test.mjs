import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const boundaries=JSON.parse(await readFile('src/living-ocean/ocean-boundaries.json','utf8'));
const source=(await readFile('src/living-ocean/ocean-name.ts','utf8')).replace("import boundaries from './ocean-boundaries.json';",'const boundaries = '+JSON.stringify(boundaries)+';');
const {code}=await transform(source,{loader:'ts',format:'cjs'});
const module={exports:{}};new Function('module','exports',code)(module,module.exports);
const {oceanName,OCEAN_UNAVAILABLE}=module.exports;
test('all five oceans, hemispheres and antimeridian use geographic polygons',()=>{
 for(const [lon,lat,name] of [[-150,20,'Pacific Ocean'],[160,-30,'Pacific Ocean'],[-40,30,'Atlantic Ocean'],[-20,-30,'Atlantic Ocean'],[80,-20,'Indian Ocean'],[0,85,'Arctic Ocean'],[0,-65,'Southern Ocean'],[-180,20,'Pacific Ocean'],[180,20,'Pacific Ocean']])assert.equal(oceanName(lon,lat),name,`${lon},${lat}`);
});
test('land, marginal seas, uncertain boundaries and invalid coordinates stay unavailable',()=>{
 for(const [lon,lat] of [[35,31],[0,51],[10,10],[180,90],[NaN,0],[0,Infinity],[181,0],[19.615837,-40]])assert.equal(oceanName(lon,lat),OCEAN_UNAVAILABLE,`${lon},${lat}`);
});
