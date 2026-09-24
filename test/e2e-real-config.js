/**
 * 读取 Pot 中「小牛翻译 (东北大学)」插件的真实配置，原样跑一遍插件。
 * 用途：验证用户的实际填法（含 endpoint 误带 ?apikey=）能否正常工作。
 * Key 不落盘、不完整打印。
 *
 * 用法： node test/e2e-real-config.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CONFIG = path.join(process.env.APPDATA, 'com.pot-app.desktop', 'config.json');
const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));

const instanceKey = Object.keys(config).find((k) => k.startsWith('plugin.com.neu.niutrans@'));
if (!instanceKey) {
    console.error('未在 Pot 配置中找到本插件的实例');
    process.exit(1);
}
const instance = config[instanceKey];
const mask = (s) => (s && s.length > 4 ? s.slice(0, 4) + '*'.repeat(s.length - 4) : '<空>');

console.log(`实例: ${instanceKey}`);
console.log(`apikey: ${mask(instance.apikey)} (长度 ${(instance.apikey || '').length})`);
console.log(`endpoint: ${JSON.stringify(instance.endpoint)}\n`);

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

const calls = [];
const tauriLikeFetch = async (url, init) => {
    calls.push(url);
    const res = await fetch(url, {
        method: init.method,
        headers: init.headers,
        body: JSON.stringify(init.body.payload),
    });
    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        data = text;
    }
    return { ok: res.ok, status: res.status, data };
};
const utils = { tauriFetch: tauriLikeFetch, http: { fetch: tauriLikeFetch, Body: { json: (p) => ({ type: 'Json', payload: p }) } } };

const sandbox = { module: { exports: {} }, console };
vm.createContext(sandbox);
vm.runInContext(`${source}\nmodule.exports = { translate };`, sandbox);
const { translate } = sandbox.module.exports;

const cases = [
    ['zh -> en', '深度学习在遥感图像目标检测中取得了显著进展。', 'zh', 'en'],
    ['en -> zh', 'Remote sensing image captioning is a challenging task.', 'en', 'zh'],
    ['auto -> zh', 'The model achieves state-of-the-art performance.', 'auto', 'zh'],
    ['zh -> ja', '这是一个测试句子。', 'zh', 'ja'],
];

(async () => {
    let pass = 0;
    for (const [name, text, from, to] of cases) {
        try {
            const out = await translate(text, from, to, { config: instance, utils });
            console.log(`  PASS  ${name}:  ${JSON.stringify(out)}`);
            pass++;
        } catch (e) {
            console.log(`  FAIL  ${name}:\n        ${String(e).replace(/\n/g, '\n        ')}`);
        }
    }
    console.log(`\n实际请求 URL（Key 已打码）:`);
    calls.forEach((u) => console.log('  ' + u.replace(encodeURIComponent(instance.apikey), mask(instance.apikey))));
    console.log(`\n${pass}/${cases.length} 成功`);
    if (pass === 0) process.exitCode = 1;
})();
