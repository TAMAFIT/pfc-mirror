import fs from 'node:fs';
import assert from 'node:assert/strict';

const input = process.argv[2] || 'food-master-effective.json';
const output = process.argv[3] || 'food-master-official-source-audit.json';
assert.ok(fs.existsSync(input), `missing ${input}`);
const master = JSON.parse(fs.readFileSync(input,'utf8'));
const official = master.items.filter(item => ['mext','manufacturer','restaurant'].includes(item.source?.kind));
const mext = official.filter(item => item.source?.kind === 'mext');
const restaurant = official.filter(item => item.source?.kind === 'restaurant');
const dup = values => [...new Set(values.filter((v,i,a)=>v && a.indexOf(v)!==i))];
const missingCanonical = official.filter(item => !item.canonicalId).map(item=>item.name);
const duplicateCanonicalIds = dup(official.map(item=>item.canonicalId));
const lowConfidence = official.filter(item => item.confidence !== 'high').map(item=>item.name);
const restaurantBadNamespace = restaurant.filter(item => !/^restaurant:mcd-jp:[a-z0-9-]+$/.test(String(item.canonicalId||''))).map(item=>item.name);
const restaurantMissingUrl = restaurant.filter(item => !/^https:\/\/www\.mcdonalds\.co\.jp\/products\//.test(String(item.source?.url||''))).map(item=>item.name);
const restaurantMissingProvider = restaurant.filter(item => item.source?.provider !== "McDonald's Japan").map(item=>item.name);
const restaurantMissingServing = restaurant.filter(item => !item.source?.servingNutrition || item.source?.servingNutrition?.kcal == null).map(item=>item.name);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  canonicalRows: master.canonicalRows,
  officialBacked: official.length,
  officialCoveragePercent: Number((100*official.length/master.canonicalRows).toFixed(2)),
  sourceCounts: {
    mext: mext.length,
    restaurant: restaurant.length,
    manufacturer: official.filter(item=>item.source?.kind==='manufacturer').length
  },
  missingCanonical,
  duplicateCanonicalIds,
  lowConfidence,
  restaurantBadNamespace,
  restaurantMissingUrl,
  restaurantMissingProvider,
  restaurantMissingServing,
  markers: master.markers
};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
assert.equal(mext.length,46,'MEXT official coverage must remain 46 in D6');
assert.equal(restaurant.length,11,'D6 must expose 11 McDonald’s official records');
assert.equal(official.length,57,'D6 total official-backed foods must be 57');
for (const [label,list] of Object.entries({missingCanonical,duplicateCanonicalIds,lowConfidence,restaurantBadNamespace,restaurantMissingUrl,restaurantMissingProvider,restaurantMissingServing})) {
  assert.deepEqual(list,[],`${label} must be empty`);
}
console.log(`FOOD_MASTER_OFFICIAL official=${official.length}/${master.canonicalRows} coverage=${report.officialCoveragePercent}% mext=${mext.length} restaurant=${restaurant.length}`);
