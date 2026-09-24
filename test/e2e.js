/**
 * 端到端联调：使用 Pot 配置中已有的小牛 API Key 验证插件真实可用性。
 *
 * 出于安全考虑，Key 从 Pot 的 config.json 中读取，不落盘、不打印。
 * 用法： node test/e2e.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CONFIG = path.join(process.env.APPDATA, 'com.pot-app.desktop', 'config.json');
const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));

// 取配置中第一个填了 apikey 的 niutrans 实例
const key = Object.keys(config)
    .filter((k) => k.startsWith('niutrans@'))
    .map((k) => config[k].apikey)
    .find((v) => typeof v === 'string' && v.trim().length > 0);

if (!key) {
    console.error('未能从 Pot 配置中找到小牛 API Key');
    process.exit(1);
}
const masked = key.slice(0, 4) + '*'.repeat(Math.max(0, key.length - 4));
console.log(`使用 Pot 配置中的 Key: ${masked} (长度 ${key.length})\n`);

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

const tauriLikeFetch = async (url, init) => {
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
    ['学校接口 zh -> en', '深度学习在遥感图像目标检测中取得了显著进展。', 'zh', 'en', {}],
    ['学校接口 en -> zh', 'Remote sensing image captioning is challenging.', 'en', 'zh', {}],
    ['学校接口 auto -> zh', 'The model achieves state-of-the-art performance.', 'auto', 'zh', {}],
    ['学校接口 zh -> ja', '这是一个测试句子。', 'zh', 'ja', {}],
    ['官方接口 zh -> en（同一 Key 对照）', '你好，世界。', 'zh', 'en', { endpoint: 'https://api.niutrans.com/NiuTransServer/translation' }],
];

(async () => {
    let pass = 0;
    for (const [name, text, from, to, extra] of cases) {
        try {
            const out = await translate(text, from, to, { config: { apikey: key, ...extra }, utils });
            console.log(`  PASS  ${name}\n        ${JSON.stringify(out)}`);
            pass++;
        } catch (e) {
            console.log(`  FAIL  ${name}\n        ${String(e).replace(/\n/g, '\n        ')}`);
        }
    }
    console.log(`\n${pass}/${cases.length} 真实翻译成功`);
    if (pass === 0) process.exitCode = 1;
})();
