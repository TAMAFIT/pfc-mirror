import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const input=process.argv[2] || 'overrides/pfc-scan-v28.js';
assert.ok(fs.existsSync(input),`missing ${input}`);
const context={console,window:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null;}},localStorage:{getItem(){return null;},setItem(){}},fetch(){throw new Error('network must not run in unit tests')}};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(input,'utf8'),context,{filename:input});
const api=context.__PFC_SCAN_V28__;
assert.ok(api);
assert.equal(api.version,'2.8.0');
assert.equal(api.localFirst,true);
assert.equal(api.lazyLibraries,true);
assert.equal(api.barcode.zxing,'0.2.1');
assert.equal(api.ocr.tesseract,'7.0.0');

for(const code of ['4901234567894','4902430096331','012345678905','96385074']) assert.equal(api.barcode.validate(code),true,code);
for(const code of ['4901234567893','1234567','abcdefgh']) assert.equal(api.barcode.validate(code),false,code);
assert.equal(api.parseServingGrams('1本 (200 g)'),200);
assert.equal(api.parseServingGrams('内容量113g'),113);
assert.equal(api.parseServingGrams('1個'),null);

const off=api.barcode.mapProduct({status:1,product:{code:'4901234567894',product_name:'高たんぱくヨーグルト',brands:'Example',quantity:'113 g',serving_size:'113g',nutriments:{proteins_100g:10.6,fat_100g:0,carbohydrates_100g:5.2,'energy-kcal_100g':63}}},'4901234567894');
assert.ok(off);
assert.equal(off.basisAmount,100);
assert.equal(off.basisUnit,'g');
assert.equal(off.servingGrams,113);
assert.equal(off.source.kind,'open-food-facts');
assert.equal(off.source.confidence,'medium');
assert.deepEqual(JSON.parse(JSON.stringify(api.scaleCandidate(off,113))),{p:12,f:0,c:5.9,a:0,kcal:71});
assert.equal(api.barcode.mapProduct({status:0},'4901234567894'),null);
assert.equal(api.barcode.mapProduct({status:1,product:{nutriments:{proteins_100g:1}}},'4901234567894'),null);

const label=api.ocr.parseNutritionLabelText('栄養成分表示 1個(120g)当たり エネルギー 250kcal たんぱく質 12.3g 脂質 8.4g 炭水化物 30.1g');
assert.ok(label);
assert.equal(label.basisAmount,1);
assert.equal(label.basisUnit,'個');
assert.equal(label.servingGrams,120);
assert.deepEqual(JSON.parse(JSON.stringify(label.nutrition)),{p:12.3,f:8.4,c:30.1,a:0,kcal:250});
const per100=api.ocr.parseNutritionLabelText('100g当たり 熱量 180 kcal 蛋白質 20.0 g 脂質 5.0g 炭水化物 10.0g');
assert.ok(per100);
assert.equal(per100.basisAmount,100);
assert.equal(per100.basisUnit,'g');
assert.deepEqual(JSON.parse(JSON.stringify(api.scaleCandidate(per100,150))),{p:30,f:7.5,c:15,a:0,kcal:270});
assert.equal(api.ocr.parseNutritionLabelText('エネルギー 100kcal たんぱく質 10g'),null);

const record=api.buildLogRecord(per100,150,'テスト食品');
assert.equal(record.N,'テスト食品(150g)');
assert.equal(record.P,30);
assert.equal(record.F,7.5);
assert.equal(record.C,15);
assert.equal(record.Cal,270);
assert.equal(record._scan.source,'label-ocr');
console.log('PFC scan V2.8 parser/scaling tests passed.');
