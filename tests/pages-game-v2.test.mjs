import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../pages-game.js", import.meta.url), "utf8");
const KEY = "wildsquad-github-pages-v1";

function runClient(initialState) {
  const storage = new Map([[KEY, JSON.stringify(initialState)]]);
  const elements = new Map();
  const timers = [];
  const math = Object.create(Math);
  math.random = () => 1;
  let clickHandler;
  const element = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        textContent: "",
        innerHTML: "",
        classList: { add() {}, remove() {}, toggle() {} },
      });
    }
    return elements.get(id);
  };
  const context = {
    console,
    Date,
    JSON,
    Math: math,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    navigator: {},
    document: {
      getElementById: element,
      querySelectorAll: () => [],
      addEventListener: (type, handler) => { if (type === "click") clickHandler = handler; },
    },
    setInterval: handler => { timers.push(handler); return timers.length; },
    clearInterval() {},
    setTimeout() { return 1; },
    clearTimeout() {},
  };
  vm.runInNewContext(source, context);
  return {
    click(dataset) { clickHandler({ target: { closest: () => ({ dataset }) } }); },
    runLatestTimer() { timers.at(-1)?.(); },
    state() { return JSON.parse(storage.get(KEY)); },
  };
}

test("legacy save reaches an adventure event and records its consequence", () => {
  const game = runClient({ stage: 3, coins: 1000, bones: 100, auto: false });
  game.click({ action: "event", id: "cleanse" });
  const state = game.state();
  assert.equal(state.version, 2);
  assert.equal(state.stage, 4);
  assert.equal(state.bones, 82);
  assert.equal(state.boonPower, 0.18);
  assert.equal(state.eventChoices[3], "cleanse");
});

test("boss failure report explains the missed mechanic", () => {
  const game = runClient({
    stage: 5,
    auto: false,
    skills: [
      { id: "break", name: "破甲骨矛", level: 0 },
      { id: "interrupt", name: "战吼打断", level: 0 },
      { id: "burst", name: "野火爆发", level: 0 },
    ],
    order: ["burst", "interrupt", "break"],
  });
  game.click({ tab: "battle" });
  game.click({ action: "toggle-auto" });
  game.runLatestTimer();
  const state = game.state();
  assert.equal(state.stage, 5);
  assert.equal(state.battleReport.result, "失败");
  assert.match(state.battleReport.reason, /破盾/);
  assert.match(state.battleReport.advice, /破甲骨矛/);
});
