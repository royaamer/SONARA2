import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const { code } = await transform(await readFile('src/electric-sky/activity-scale.ts', 'utf8'), { loader: 'ts', format: 'cjs' });
const module = { exports: {} };
new Function('module', 'exports', code)(module, module.exports);
const { buildActivityGrid, activityColor } = module.exports;

test('activity colors aggregate original records without losing boundary flashes or inventing empty cells', () => {
  const flashes = [
    { longitude: -180, latitude: 90 },
    { longitude: 180, latitude: -90 },
    { longitude: 0, latitude: 0 },
    { longitude: 0, latitude: 0 },
  ];
  const grid = buildActivityGrid({ day: '2017-03-01', flashes });
  assert.equal(grid.cells.reduce((sum, cell) => sum + cell.count, 0), flashes.length);
  assert.equal(grid.cells.length, 3);
  assert.equal(grid.maximum, 2);
  assert.ok(grid.cells.every(cell => cell.x >= 0 && cell.x < 72 && cell.y >= 0 && cell.y < 36));
  assert.equal(activityColor(0, 2), 'rgb(40,235,255)');
  assert.equal(activityColor(2, 2), 'rgb(255,55,205)');
  assert.deepEqual(buildActivityGrid({ day: '2017-03-02', flashes: [] }).cells, []);
});

test('daily activity bins reconcile with every original ISS LIS record including the April boundary', async () => {
  const dataset = JSON.parse(await readFile('public/data/lightning/2017-03.json', 'utf8'));
  const days = new Map();
  for (const flash of dataset.flashes) {
    const day = flash.time.slice(0, 10);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(flash);
  }
  let total = 0;
  for (const [day, flashes] of days) {
    const grid = buildActivityGrid({ day, flashes });
    const count = grid.cells.reduce((sum, cell) => sum + cell.count, 0);
    assert.equal(count, flashes.length, day);
    total += count;
  }
  assert.equal(total, dataset.flash_count);
  assert.equal(days.get('2017-04-01').length, 9);
});

test('selected lightning readings use recorded cell counts and shared normalization',()=>{
 const {activityAt,activityPosition}=module.exports;
 const grid=buildActivityGrid({flashes:[{longitude:0,latitude:0},{longitude:1,latitude:-1},{longitude:30,latitude:30}]});
 assert.equal(activityAt(grid,0,0),2);
 assert.equal(activityAt(grid,-100,0),null);
 assert.equal(activityPosition(2,grid.maximum),1);
 assert.equal(activityPosition(9,grid.maximum),1);
 assert.notEqual(activityColor(1,grid.maximum),activityColor(2,grid.maximum));
});

async function loadModule(file){
 const {code}=await transform(await readFile(file,'utf8'),{loader:'ts',format:'cjs'});
 const m={exports:{}};new Function('module','exports',code)(m,m.exports);return m.exports;
}
test('temperature scale and numeric raster use shared mapping with clipped endpoints',async()=>{
 const m=await loadModule('src/temperature/mapping.ts');
 for(const value of [-12,-5,-3,-1,0,1,3,5,12]){
   const bytes=new Uint8ClampedArray(4);m.writeColor(bytes,0,value,165);
   assert.deepEqual([...bytes.slice(0,3)],m.colorAt(value));
   assert.equal(m.temperaturePosition(value),Math.max(0,Math.min(1,(value+5)/10)));
 }
});
test('ocean readings interpolate real components and preserve missing data',async()=>{
 const m=await loadModule('src/living-ocean/inspection.ts');
 const manifest={grid:{width:2,height:2,lonStart:0,lonStep:180,latStart:45,latStep:90},days:[{date:'2023-01-01'},{date:'2023-01-02'}]};
 const data={manifest,audit:{duration_seconds:10},fields:[{u:[1,1,1,1],v:[0,0,0,0]},{u:[3,3,3,3],v:[0,0,0,0]}]};
 assert.equal(m.inspectOcean(data,5,0,0).speed,2);
 data.fields[1].u[0]=null;
 assert.equal(m.inspectOcean(data,5,0,0).speed,null);
 const c=await loadModule('src/living-ocean/current-color.ts');assert.equal(c.currentPosition(2),1);
});

 test('GISTEMP selection returns original cells, preserves missing values and clamps polar boundaries',async()=>{
 const source=(await readFile('src/temperature/data.ts','utf8')).replace('import.meta.env.BASE_URL',"'/'");
 const {code}=await transform(source,{loader:'ts',format:'cjs'});
 const m={exports:{}};new Function('module','exports',code)(m,m.exports);
 const data=JSON.parse(await readFile('public/data/temperature/2025-01.json','utf8'));
 for(const [lon,lat,row,column] of [[-180,-90,0,0],[180,90,89,179],[0,0,45,90]]){
  const cell=m.exports.temperatureCell(data,lon,lat);
  assert.equal(cell.row,row);assert.equal(cell.column,column);
  assert.equal(cell.value,data.anomalies[row][column]);
  assert.equal(cell.east-cell.west,2);assert.equal(cell.north-cell.south,2);
 }
 data.anomalies[45][90]=null;
 assert.equal(m.exports.temperatureCell(data,0,0).value,null);
 });

test('ocean footprint follows four interpolation centers and splits the dateline',async()=>{
 const {oceanSamplingFootprint}=await loadModule('src/living-ocean/inspection.ts');
 const manifest={grid:{width:4,height:3,lonStart:-135,lonStep:90,latStart:60,latStep:60}};
 assert.deepEqual(oceanSamplingFootprint(manifest,0,10),[{west:-45,east:45,north:60,south:0}]);
 assert.deepEqual(oceanSamplingFootprint(manifest,179,10),[{west:135,east:180,north:60,south:0},{west:-180,east:-135,north:60,south:0}]);
 assert.deepEqual(oceanSamplingFootprint(manifest,0,-90),[]);
});
