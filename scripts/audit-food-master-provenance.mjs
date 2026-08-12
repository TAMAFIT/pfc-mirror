import fs from 'node:fs';
import assert from 'node:assert/strict';

const input = process.argv[2] || 'food-master-effective.json';
const output = process.argv[3] || 'food-master-provenance-audit.json';
assert.ok(fs.existsSync(input), `missing ${input}`);
const master = JSON.parse(fs.readFileSync(input,'utf8'));
const mext = master.items.filter(item => item.source?.kind === 'mext');
const canonicalIds = mext.map(item => item.canonicalId).filter(Boolean);
const sourceIds = mext.map(item => item.source?.itemNo).filter(Boolean);
const duplicates = values => [...new Set(values.filter((v,i,a)=>a.indexOf(v)!==i))];
const missingCanonical = mext.filter(item => !/^mext:\d{5}$/.test(String(item.canonicalId||''))).map(item=>item.name);
const missingSourceId = mext.filter(item => !/^\d{5}$/.test(String(item.source?.itemNo||''))).map(item=>item.name);
const missingConfidence = mext.filter(item => item.confidence !== 'high').map(item=>item.name);
const registryBacked = master.items.filter(item => item.provenance?.verifiedVersion === '4.0.0');
const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  canonicalRows: master.canonicalRows,
  mextBacked: mext.length,
  mextCoveragePercent: Number((100*mext.length/master.canonicalRows).toFixed(2)),
  registryBacked: registryBacked.length,
  registryVersion: master.markers?.mextRegistry || null,
  missingCanonical,
  missingSourceId,
  missingConfidence,
  duplicateCanonicalIds: duplicates(canonicalIds),
  duplicateMextItemNos: duplicates(sourceIds),
  datasetSha256s: [...new Set(mext.map(item=>item.provenance?.datasetSha256 || item.source?.datasetSha256).filter(Boolean))]
};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
assert.equal(master.markers?.mextRegistry,'4.0.0','central MEXT registry must be active');
assert.equal(registryBacked.length,40,'all current MEXT foods must be controlled by the central registry');
assert.equal(mext.length,40,'registry and effective MEXT food count must agree');
assert.deepEqual(report.missingCanonical,[],'MEXT foods need stable canonical IDs');
assert.deepEqual(report.missingSourceId,[],'MEXT foods need item numbers');
assert.deepEqual(report.missingConfidence,[],'MEXT foods need high confidence');
assert.deepEqual(report.duplicateCanonicalIds,[],'MEXT canonical IDs must be unique');
assert.deepEqual(report.duplicateMextItemNos,[],'MEXT item numbers must be unique across canonical foods');
assert.equal(report.datasetSha256s.length,1,'all central-registry MEXT entries should reference one current workbook snapshot');
console.log(`FOOD_MASTER_PROVENANCE registry=${registryBacked.length} mext=${mext.length}/${master.canonicalRows} coverage=${report.mextCoveragePercent}%`);
