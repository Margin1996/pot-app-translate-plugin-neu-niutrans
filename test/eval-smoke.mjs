/**
 * 模拟 Pot 真实加载机制的冒烟测试。
 *
 * Pot 的实际加载代码（src/utils/invoke_plugin.js）：
 *     return [eval(`${script} ${pluginType}`), utils];
 * 其中 invoke_plugin.js 是 ES module，因此 eval 运行在严格模式下。
 * 本脚本用 Node 的 ESM 严格模式复现该行为，确认 main.js 能被正确加载并拿到 translate 函数。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

// 完全复刻 Pot 的调用形式
const pluginType = 'translate';
let func, utils;

const fakeFetch = async () => ({
    ok: true,
    status: 200,
    data: { code: 200, msg: '成功', data: [{ sentences: [{ data: 'Hello', paragraphOrder: 0 }], order: 0 }] },
});
utils = { tauriFetch: fakeFetch, http: { fetch: fakeFetch, Body: { json: (p) => ({ type: 'Json', payload: p }) } } };

// eslint-disable-next-line no-eval
[func, utils] = [eval(`${script} ${pluginType}`), utils];

if (typeof func !== 'function') {
    console.error('FAIL  eval 未返回 translate 函数，实际类型:', typeof func);
    process.exit(1);
}
console.log('PASS  eval 加载成功，translate 是函数');

const out = await func('你好', 'zh', 'en', { config: { apikey: 'K' }, detect: 'zh', utils });
if (out !== 'Hello') {
    console.error('FAIL  译文不符:', JSON.stringify(out));
    process.exit(1);
}
console.log('PASS  通过 eval 加载的 translate 正常返回:', out);

// 二次 eval（Pot 每次翻译都会重新加载脚本），确认无状态残留、无重复声明报错
const func2 = eval(`${script} ${pluginType}`);
if (typeof func2 !== 'function') {
    console.error('FAIL  二次 eval 失败');
    process.exit(1);
}
console.log('PASS  重复 eval 不报错（Pot 每次翻译都会重新加载一次）');

// 确认没有污染全局作用域
const leaked = ['DEFAULT_ENDPOINT', 'ERROR_HINT', 'parseResult', 'collectFromDataArray'].filter(
    (k) => k in globalThis
);
if (leaked.length > 0) {
    console.error('FAIL  脚本向全局泄漏了变量:', leaked);
    process.exit(1);
}
console.log('PASS  未向全局作用域泄漏变量');
