import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const input=process.argv[2] || 'overrides/pfc-dish-photo-v29.js';
assert.ok(fs.existsSync(input),`missing ${input}`);
const meta={runtimeIndex:10,name:'白米',input:{defaultAmount:150,defaultUnit:'g'},nutritionBasis:{amount:100,unit:'g'}};
const context={
  console, window:null, AbortController,
  document:{readyState:'loading',addEventListener(){},getElementById(){return null;}},
  URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(){}}, Image:function(){},
  fetch(){throw new Error('network must not run in unit tests')},
  __PFC_DB_V3_SEARCH__:{search(name){
    if(name==='白米')return[{source:'db',index:10,name:'白米',score:5240,meta}];
    if(name==='鶏の唐揚げ')return[{source:'db',index:20,name:'唐揚げ',score:4100,meta:{...meta,runtimeIndex:20,name:'唐揚げ',input:{defaultAmount:100,defaultUnit:'g'}}}];
    if(name==='肉')return[{source:'db',index:30,name:'鶏むね(皮なし)',score:900,meta:{...meta,runtimeIndex:30,name:'鶏むね(皮なし)'}}];
    return[];
  }},
  __PFC_DB_V3__:{get(i){return i===10?meta:null;},amountChoices(i){return i===10?[100,150,200]:[];}}
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(input,'utf8'),context,{filename:input});
const api=context.__PFC_DISH_PHOTO_V29__;
assert.ok(api);
assert.equal(api.version,'2.9.0');
assert.equal(api.model,'gemini31-lite');
assert.equal(api.identityOnly,true);
assert.equal(api.nutritionFromAI,false);

const parsed=api.parseIdentityResponse('```json\n{"dishName":"唐揚げ定食","uncertain":false,"foods":[{"name":"白米","confidence":0.96},{"name":"鶏の唐揚げ","confidence":0.91,"note":"主菜"},{"name":"白米","confidence":0.5}]}\n```');
assert.ok(parsed);
assert.equal(parsed.dishName,'唐揚げ定食');
assert.equal(parsed.foods.length,2);
assert.equal(parsed.foods[0].name,'白米');
assert.equal(parsed.foods[0].confidence,0.96);
assert.equal(parsed.foods[1].note,'主菜');
assert.equal(api.parseIdentityResponse('not json'),null);
assert.equal(api.parseIdentityResponse('{"foods":[]}'),null);

const resolved=api.resolveFoods(parsed);
assert.equal(resolved.length,2);
assert.equal(resolved[0].match.name,'白米');
assert.equal(resolved[0].amount,150);
assert.deepEqual(Array.from(resolved[0].choices),[100,150,200]);
assert.equal(resolved[1].match.name,'唐揚げ');
const broad=api.resolveFoods({foods:[{name:'肉',confidence:.6,note:''}]});
assert.equal(broad[0].match,null,'broad/low-score category result must not auto-resolve');

const containsForbiddenNutrition=/nutrition\s*:\s*\{|kcal\s*:/i.test(fs.readFileSync(input,'utf8').match(/function identityPrompt\(\)[\s\S]*?\n  }/)[0]);
assert.equal(containsForbiddenNutrition,false,'identity prompt must not request nutrition JSON');
console.log('PFC dish photo V2.9 identity-only tests passed.');
