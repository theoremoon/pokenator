import { applyAnswer, selectQuestion } from "./web-engine.mjs";

const ui = Object.fromEntries(
  ["phase", "remaining", "prompt", "note", "choices", "undo", "reset", "start"]
    .map(id => [id, document.getElementById(id)])
);
const answers = [
  ["はい", 2],
  ["いいえ", -2],
  ["どちらかといえばはい", 1],
  ["どちらかといえばいいえ", -1],
  ["わからない", 0],
];
let pokemon;
let candidates;
let current;
const history = [];

function button(label, handler, primary = false) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  if (primary) element.className = "primary";
  element.addEventListener("click", handler);
  ui.choices.append(element);
}

function screen(phase, prompt, note = "") {
  ui.phase.textContent = phase;
  ui.remaining.textContent = candidates ? `候補 ${candidates.length.toLocaleString("ja")}種` : "";
  ui.prompt.textContent = prompt;
  ui.note.textContent = note;
  ui.note.hidden = !note;
  ui.choices.replaceChildren();
  ui.undo.hidden = history.length === 0;
  ui.reset.hidden = !candidates;
  ui.prompt.focus();
}

function render() {
  const answered = history.flatMap(step => step.question ? [step.question] : []);
  current = selectQuestion(candidates, answered);
  const ordered = [...candidates].sort((a, b) => b.weight - a.weight);
  const [top, runnerUp] = ordered;
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const questionCount = answered.length;
  if (top && (top.weight / total >= .9 || (!current && top.weight > runnerUp?.weight))) {
    const { name } = top.pokemon;
    screen("予想", `${name} ですか？`);
    button("正解！", () => {
      screen("結果", `${questionCount}問で当たりました！`, name);
      button("もう一度遊ぶ", start, true);
    }, true);
    button("ちがう", () => {
      history.push({ candidates });
      candidates = candidates.filter(candidate => candidate !== top);
      render();
    });
    return;
  }

  if (current) {
    screen(`質問 ${questionCount + 1}`, current.prompt);
    for (const [label, value] of answers) button(label, () => respond(value));
    return;
  }

  const names = ordered.slice(0, 12).map(({ pokemon }) => pokemon.name).join("、");
  if (candidates.length) {
    screen("結果", `候補が ${candidates.length}種 残りました`,
      names + (candidates.length > 12 ? " など" : ""));
  } else {
    screen("結果", "候補が見つかりませんでした", "前の質問に戻って、回答を見直せます。");
  }
  button("もう一度遊ぶ", start, true);
}

function respond(value) {
  history.push({ candidates, question: current });
  candidates = applyAnswer(candidates, current, value);
  render();
}

function start() {
  candidates = pokemon.map(entry => ({ pokemon: entry, weight: 1 }));
  history.length = 0;
  render();
}

ui.undo.addEventListener("click", () => {
  const previous = history.pop();
  candidates = previous.candidates;
  render();
});
ui.reset.addEventListener("click", start);
ui.start.addEventListener("click", start);

try {
  const response = await fetch("./data/pokemon.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  pokemon = await response.json();
  ui.phase.textContent = `全国図鑑 ${pokemon.length.toLocaleString("ja")}種`;
  ui.start.textContent = "ゲームを始める";
  ui.start.disabled = false;
} catch {
  screen("読み込みエラー", "図鑑データを読み込めませんでした",
    "リポジトリで python3 -m http.server --bind 127.0.0.1 8000 を実行し、http://127.0.0.1:8000 を開いてください。");
  button("再読み込み", () => location.reload());
}
