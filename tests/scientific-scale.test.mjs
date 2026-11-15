import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { transform } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
const require = createRequire(import.meta.url);
const {code} = await transform(await readFile('src/experiences/scientific-scale.tsx','utf8'), {loader:'tsx',format:'cjs',jsx:'automatic'});
const module = {exports:{}};
new Function('module','exports','require',code)(module,module.exports,require);
const render = (value,position) => renderToStaticMarkup(createElement(module.exports.ScientificScale,{title:'Measurement',gradient:'linear-gradient(90deg,blue,red)',ticks:['-5','0','5'],measurement:{value,position,minimum:-5,maximum:5,unit:'degrees Celsius',color:'white',label:'Selected source cell'},children:null}));
test('scientific pointer preserves actual values, clamps both ends and labels saturation',()=>{
 for(const [value,position,left,saturated] of [[-8,-.3,0,true],[-5,0,0,false],[0,.5,50,false],[5,1,100,false],[8,1.3,100,true]]){
  const html=render(value,position);assert.ok(html.includes('left:'+left+'%'));assert.ok(html.includes('data-value="'+value+'"'));assert.equal(html.includes('Scale saturated'),saturated);assert.ok(html.includes(value.toFixed(3)+' degrees Celsius'));assert.ok(html.includes('aria-label="Selected source cell.'));
 }
});
test('missing and nonfinite scientific values remove the pointer and expose No data',()=>{
 for(const value of [null,NaN,Infinity,-Infinity]){const html=render(value,.5);assert.ok(html.includes('No data'));assert.ok(!html.includes('data-value='));}
});
