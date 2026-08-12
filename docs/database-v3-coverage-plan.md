# Database V3 Coverage Plan

This plan is based on the full 408-row legacy audit plus the effective mirror runtime additions.

## Current strengths

The current catalog is already broad in:

- rice / bread / noodles
- common chicken, beef and pork cuts
- convenience-store meals
- fast food and sweets
- alcoholic drinks

## Highest-priority gaps

These should be verified against an authoritative source before adding nutrition values.

### Condiments / cooking basics

- こいくち醤油
- 米みそ / 合わせみそ
- 上白糖
- 本みりん
- ポン酢しょうゆ
- 中濃ソース / ウスターソース
- 料理酒

Reason: small servings are common, but calorie-bearing condiments are easy to omit from PFC records.

### Common proteins

- 鶏手羽元
- 豚肩ロース
- 牛肩ロース
- さば（焼き / 生）
- たら
- あじ（生 / 焼き）
- かき

### Common vegetables

- ピーマン
- なす
- 長ねぎ
- 白菜
- 小松菜
- アスパラガス
- にんにく
- とうもろこし
- ズッキーニ

### Common fruit

- マンゴー（生）
- ブルーベリー（生）
- オレンジ
- レモン

### Common ready-to-eat dishes

- 焼き魚定食
- 生姜焼き（単品）
- チキン南蛮（単品）
- から揚げ（個数入力対応）
- 焼きそば（一般料理）
- 焼きうどん
- そぼろ丼
- 海鮮丼

## Source hierarchy

1. General foods: MEXT Food Composition Database / Standard Tables of Food Composition in Japan (Eighth Revised Edition, Supplement 2023, current corrections).
2. Named retail products: manufacturer official nutrition information.
3. Named restaurant products: restaurant official nutrition information.
4. Generic mixed dishes: explicitly marked estimate; no false precision.

## Unit work before nutrition expansion

The following structural fixes are safe without changing nutrition values:

- packaged convenience meals currently stored as `1個` -> human display `1食`
- bundled counts such as `ナゲット(5個)` -> basis 5個 rather than 1箱
- `餃子(6個)` -> basis 6個 rather than 1皿
- `唐揚げ(5個)` -> basis 5個 rather than 1皿
- raw size labels (`並`, `M`) -> variants, not arithmetic units
- duplicate names -> one canonical search result with context tags

## Multiple-unit policy

Multiple units are added only when conversion quality is known.

- fixed / regulatory conversion -> exact
- government serving reference -> reference / approximate
- biological item with size variation -> range, not a fake exact gram value
- restaurant / home-cooked item with large variance -> keep portion unit unless a concrete product is selected

Examples:

- cooked rice: keep g as primary; government serving presets 100/150/200g can be offered
- egg M/L: keep 個 as primary; official gross-weight ranges can be shown, but do not convert nutrition to edible grams from shell weight
- banana: keep 本 until an explicit edible-weight estimate is deliberately introduced and labeled approximate

## Deduplication targets

Legacy exact duplicates identified by audit:

- ゆで卵
- 干し芋

The V3 metadata layer should canonicalize these for search without rewriting historical records.

## Delivery sequence

1. V3 unit normalization core
2. natural-unit catalog and bundle-count correction
3. high-frequency source-verified nutrition overrides
4. missing-food additions
5. alternate-unit UI only for foods with reliable conversions
6. production-source migration after mirror validation
