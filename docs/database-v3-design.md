# PFC Database V3 Design

## Goal

Turn the current flat food list into a compatibility-safe food input engine without breaking existing history, voice logging, manual search, Quick Input, or production GAS.

V3 separates three concepts that are currently mixed together in `DB[][3]`:

1. **nutrition basis** — the amount the P/F/C/kcal values describe
2. **human input unit** — how people naturally count that food
3. **variants** — size / cut / package / brand variants such as M/L, 6-slice/8-slice, small/large

The legacy `DB` array remains readable. V3 is initially an additive metadata layer.

## Audit baseline

Pinned source: `TAMAFIT/pfc@cf2d53990860a108d96596abc6eed81e0afd32ae`

- 408 legacy rows
- 12 legacy categories
- 307 rows use a count/serving-style basis
- 75 rows use gram-based basis
- 11 use volume in ml
- 11 use spoon measures
- 3 use raw size labels (`M`, `並`)
- 1 uses a vague serving (`小鉢`)
- exact duplicate names: `ゆで卵`, `干し芋`
- broad alias collisions are severe (`肉`, `米`, `ごはん`, `麺`, `コンビニ`, etc.)

The existing V2.1 mirror enrichment adds 12 names that are not present in the pinned source, so V3 must normalize the **effective runtime database**, not only the source file.

## Source policy

Nutrition values and unit conversions are not treated as equally certain.

### General foods

Primary reference: Japanese Ministry of Education, Culture, Sports, Science and Technology food composition data (Standard Tables of Food Composition in Japan 2020, Eighth Revised Edition, Supplement 2023, including current corrections).

### Packaged foods and restaurant products

Use the manufacturer / restaurant official nutrition page where a concrete product is named.

### Generic dishes and variable-size foods

Keep an explicit estimate state. Do not present a guessed portion conversion as an exact conversion.

Every V3 item can therefore carry:

- `source.kind`: `mext`, `manufacturer`, `restaurant`, `legacy`, `estimated`
- `source.label`
- `source.url` when applicable
- `confidence`: `high`, `medium`, `low`

## Energy rule

`kcal` is first-class data.

Do **not** assume official kcal must equal `P*4 + F*9 + C*4`. The Eighth Revised Edition changed energy calculation methodology, and food labels can also differ from a simple macro formula.

For a scaled portion:

- P/F/C/A scale from the nutrition basis
- kcal scales from the stored kcal value
- only synthesize kcal from macros when no kcal source exists

Alcohol remains a separate `A` field where present.

## V3 object shape

```js
{
  id: 'rice-white-cooked',
  legacyIndex: 0,
  category: 'staples',
  legacyCategory: '🍚炭水化物',
  name: '白米',
  aliases: ['ごはん', '白ご飯', '白めし'],

  nutritionBasis: {
    amount: 100,
    unit: 'g'
  },
  nutrition: {
    p: 2.5,
    f: 0.3,
    c: 37.1,
    a: 0,
    kcal: 168
  },

  input: {
    defaultUnit: 'g',
    defaultAmount: 150,
    quickStep: 50,
    quickMin: 50,
    units: [
      { id: 'g', label: 'g', type: 'mass', exact: true },
      { id: 'bowl', label: '杯', type: 'portion', grams: 150, exact: false }
    ]
  },

  variants: [],
  source: { kind: 'legacy', label: 'legacy DB' },
  confidence: 'medium'
}
```

## Unit types

V3 recognizes these unit families explicitly:

- `mass`: g
- `volume`: ml
- `count`: 個, 本, 枚, 粒, 尾, 貫
- `package`: パック, 缶, 袋, 箱
- `portion`: 杯, 皿, 人前, 小鉢
- `cooking`: 大さじ, 小さじ
- `size`: S, M, L, 小盛, 並盛, 大盛, 特盛

The displayed default is selected per food, not globally.

## Conversion rules

A conversion can be:

- `exact: true` — fixed product or a genuinely fixed basis
- `exact: false` — practical estimate, e.g. one banana to grams
- absent — if a reliable conversion is not known

The UI must not require a gram conversion to record a count-based food. If a food is naturally counted as one package, recording one package is valid even without a gram conversion.

## Legacy unit normalization

Examples:

- `1P` -> `1パック`
- `1個` on boxed convenience meals -> display as `1食` or `1パック` via metadata; legacy nutrition basis remains unchanged
- `並` / `M` -> variant label, not a mathematical unit
- `1個分` -> count-derived portion (`卵白 1個分`)
- `小鉢` -> estimated portion; explicitly low/medium confidence

## Category normalization

Legacy categories remain for compatibility, while V3 exposes normalized categories:

- staples
- meat
- seafood
- eggs-dairy-soy
- vegetables
- fruit
- soup
- fats-condiments
- convenience
- dishes
- fast-food
- snacks-sweets
- beverages
- alcohol
- supplements

The existing `🍔ジャンク・菓子` bucket is split in V3 metadata; the source array is not rewritten during the first migration.

## Duplicate policy

Exact duplicated legacy rows are represented once in V3 when nutrition and portion basis are equivalent, with multiple context tags instead of duplicate search results.

Known initial duplicates:

- `ゆで卵` (general + convenience)
- `干し芋` (fruit + junk/sweets)

## Alias policy

Generic category words are tags, not strong aliases.

Examples that must not behave as exact aliases:

- `肉`
- `魚`
- `米`
- `ごはん`
- `麺`
- `パン`
- `コンビニ`
- `お菓子`

Search ranking should prioritize:

1. exact food name
2. explicit synonym
3. variant / brand alias
4. prefix / substring
5. generic category tag

## Quick Input integration

Quick Input asks V3 for:

- display unit
- current amount
- step size
- minimum amount
- optional alternate units

Examples:

- 白米 -> `− 200g ＋`, step 50g
- 鶏むね -> `− 200g ＋`, step 50g
- 卵 -> `− 2個 ＋`, step 1個
- 納豆 -> `− 1パック ＋`, step 1パック
- 牛乳 -> `− 200ml ＋`, step 50ml
- オリーブオイル -> `− 大さじ1 ＋`, step 0.5大さじ

## Migration phases

### Phase A — metadata core

- build V3 objects from every effective runtime DB row
- normalize legacy units and categories
- expose stable lookup helpers
- make Quick Input use V3 unit/step metadata
- keep legacy nutrition unchanged

### Phase B — verified nutrition and conversions

- verify common general foods against MEXT
- verify named products against official manufacturer/restaurant data
- add high-confidence alternate-unit conversions
- mark estimates explicitly

### Phase C — coverage expansion

- add missing high-frequency foods
- deduplicate overlapping rows
- migrate V2.1 runtime DB extensions into one V3-controlled catalog

### Phase D — production migration

Only after mirror validation:

- move V3 metadata/catalog to the production source
- keep a compatibility adapter for historical records
- remove redundant mirror-only DB enrichment

## Non-goals for the first V3 release

- no destructive rewrite of user history
- no forced conversion of every food to grams
- no unverified serving-size guesses presented as fact
- no production frontend change before mirror validation
