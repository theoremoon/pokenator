const types = "ノーマル かくとう ひこう どく じめん いわ むし ゴースト はがね ほのお みず くさ でんき エスパー こおり ドラゴン あく フェアリー".split(" ");
const colors = "黒 青 茶 灰 緑 ピンク 紫 赤 白 黄".split(" ");
// PokéAPI shape IDs follow the order in pokemon_shapes.csv.
const shapes = [
  "頭だけの体", "へびのような体", "ヒレのある体", "頭と腕だけの体", "頭と胴だけの体",
  "しっぽのある二足の体", "頭と脚だけの体", "四足の体", "翼が一対ある体",
  "触手や多数の脚がある体", "体が複数ある姿", "しっぽのない二足の体",
  "翼が二対以上ある体", "昆虫のような体",
];
const eggGroups = [
  "かいじゅう", "すいちゅう１", "むし", "ひこう", "りくじょう", "ようせい",
  "しょくぶつ", "ひとがた", "すいちゅう３", "こうぶつ", "ふていけい",
  "すいちゅう２", "メタモン", "ドラゴン", "タマゴみはっけん",
];
const statNames = ["HP", "こうげき", "ぼうぎょ", "とくこう", "とくぼう", "すばやさ"];

const question = (family, prompt, matches, weight = 1) => ({ family, prompt, matches, weight });
const familyLimit = 2;

const questions = [
  question("evolution", "進化してこの姿になりますか？", p => p.evolved),
  question("evolution", "この姿からさらに進化しますか？", p => p.evolves),
  question("evolution", "進化前も進化先もいないポケモンですか？", p => !p.evolved && !p.evolves),
  question("type", "タイプは１つだけですか？", p => p.types.length === 1),
  question("rarity", "伝説または幻のポケモンですか？", p => p.rarity !== "一般"),
  question("rarity", "幻のポケモンですか？", p => p.rarity === "幻"),
  ...types.map((name, index) => question("type", `${name}タイプを持っていますか？`,
    p => p.types.includes(index + 1))),
  ...colors.map((name, index) => question("color", `図鑑での体の色は「${name}」ですか？`,
    p => p.color === index + 1, .85)),
  ...Array.from({ length: 9 }, (_, index) => question("generation",
    `第${index + 1}世代で初登場しましたか？`, p => p.generation === index + 1, .85)),
  ...shapes.map((shape, index) => question("shape", `図鑑での体型分類は「${shape}」ですか？`,
    p => p.shape == null ? null : p.shape === index + 1, .65)),
  question("gender", "性別が不明のポケモンですか？",
    p => p.gender_rate == null ? null : p.gender_rate === -1, .85),
  question("gender", "オスとメスのどちらも存在しますか？",
    p => p.gender_rate == null ? null : p.gender_rate > 0 && p.gender_rate < 8, .8),
  question("gender", "オスとメスは同じ割合で出現しますか？",
    p => p.gender_rate == null ? null : p.gender_rate === 4, .75),
  ...eggGroups.map(name => question("egg", `タマゴグループに「${name}」が含まれますか？`,
    p => p.egg_groups?.length ? p.egg_groups.includes(name) : null, .75)),
  ...[5, 10, 20].map(height => question("height", `図鑑での高さは${height / 10}m以上ですか？`,
    p => p.height >= height, .6)),
  ...[100, 500, 1000].map(weight => question("weight", `図鑑での重さは${weight / 10}kg以上ですか？`,
    p => p.weight >= weight, .5)),
];

const primaryTypeQuestions = types.map((name, index) => question("type", `先に表示されるタイプは「${name}」ですか？`,
    p => p.types[0] === index + 1, .45));

const statQuestions = statNames.flatMap((name, index) =>
  [50, 70, 100, 130].map(value => question("stats", `${name}の種族値は${value}以上ですか？`,
    p => p.stats ? p.stats[index] >= value : null, .4)));

const detailFields = [
  ["genus", "図鑑での分類は「", "」ですか？", .55, value => value],
  ["ability", "通常特性の１つ目は「", "」ですか？", .5, value => value],
  ["height", "図鑑での高さはちょうど", "mですか？", .4, value => (value / 10).toFixed(1)],
  ["weight", "図鑑での重さはちょうど", "kgですか？", .35, value => (value / 10).toFixed(1)],
];

function detailQuestions(candidates) {
  const predicates = [...primaryTypeQuestions, ...statQuestions];
  for (const [field, prefix, suffix, priority, format] of detailFields) {
    const values = new Set(candidates.map(({ pokemon }) => pokemon[field]));
    if (values.has(null) || values.has(undefined) || values.size < 2) continue;
    for (const value of values) {
      predicates.push(question(field, prefix + format(value) + suffix, p => p[field] === value, priority));
    }
  }
  return predicates;
}

export function selectQuestion(candidates, answered) {
  if (candidates.length < 2) return null;

  const counts = new Map();
  const excluded = new Set();
  for (const { family, prompt } of answered) {
    counts.set(family, (counts.get(family) ?? 0) + 1);
    excluded.add(prompt);
  }

  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  function bestQuestion(available) {
    let best = null;
    let bestScore = 0;
    for (const entry of available) {
      if (excluded.has(entry.prompt) || counts.get(entry.family) >= familyLimit) continue;
      let yes = 0;
      let no = 0;
      let known = true;
      for (const { pokemon, weight } of candidates) {
        const match = entry.matches(pokemon);
        if (match === null) {
          known = false;
          break;
        }
        if (match) yes += weight;
        else no += weight;
      }
      if (!known || !yes || !no) continue;
      const information = (yes / total) * Math.log2(total / yes) +
        (no / total) * Math.log2(total / no);
      const score = entry.weight * information;
      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    return best;
  }

  if (candidates.length <= 6) {
    return bestQuestion([...questions, ...detailQuestions(candidates)]);
  }
  return bestQuestion(questions) ?? bestQuestion(detailQuestions(candidates));
}

export function applyAnswer(candidates, entry, answer) {
  if (answer === 0) return candidates;
  const matches = pokemon => entry.matches(pokemon) === (answer > 0);
  if (Math.abs(answer) === 2) {
    return candidates.filter(({ pokemon }) => matches(pokemon));
  }
  return candidates.map(candidate => matches(candidate.pokemon)
    ? candidate : { ...candidate, weight: candidate.weight * 0.4 });
}
