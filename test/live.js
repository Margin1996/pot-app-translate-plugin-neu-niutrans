/**
 * 真实网络联调脚本（走真实 HTTPS，验证 main.js 端到端链路）
 *
 * 用法：
 *   node test/live.js                 # 无 key 时验证错误分支
 *   node test/live.js <APIKEY>        # 有 key 时验证真实翻译
 *
 * 说明：用 Node 的全局 fetch 适配成 Tauri http.fetch 的形状（{ok,status,data}），
 * 从而在不启动 Pot 的情况下验证 URL 拼接、body 序列化、响应解析与错误处理。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MAIN = path.join(__dirname, '..', 'main.js');
const source = fs.readFileSync(MAIN, 'utf8');

const apikey = process.argv[2] || '';

// 把 Node fetch 的 Response 转成 Tauri http.fetch 的返回形状
const tauriLikeFetch = async (url, init) => {
    const res = await fetch(url, {
        method: init.method,
        headers: init.headers,
        body: JSON.stringify(init.body.payload),
    });
    let data;
    const text = await res.text();
    try {
        data = JSON.parse(text);
    } catch (e) {
        data = text;
    }
    return { ok: res.ok, status: res.status, data };
};

const http = { fetch: tauriLikeFetch, Body: { json: (payload) => ({ type: 'Json', payload }) } };

const sandbox = { module: { exports: {} }, console };
vm.createContext(sandbox);
vm.runInContext(`${source}\nmodule.exports = { translate };`, sandbox);
const { translate } = sandbox.module.exports;

(async () => {
    console.log('--- 1. 原件回显：验证请求确实到达学校接口（预期 code 3044/4012）');
    try {
        const out = await translate('你好', 'zh', 'en', {
            config: { apikey: 'definitely-invalid-key' },
            utils: { tauriFetch: tauriLikeFetch, http },
        });
        console.log('    意外成功，返回:', out);
    } catch (e) {
        console.log('    捕获到预期错误:\n      ' + String(e).replace(/\n/g, '\n      '));
    }

    if (!apikey) {
        console.log('\n未提供 API Key，跳过真实翻译。用法: node test/live.js <APIKEY>');
        return;
    }

    console.log('\n--- 2. 真实翻译 zh -> en');
    const out = await translate('深度学习模型在遥感图像目标检测中取得了显著进展。', 'zh', 'en', {
        config: { apikey },
        utils: { tauriFetch: tauriLikeFetch, http },
    });
    console.log('    译文:', out);

    console.log('\n--- 3. 反向翻译 en -> zh');
    const back = await translate('Hello, world.', 'en', 'zh', {
        config: { apikey },
        utils: { tauriFetch: tauriLikeFetch, http },
    });
    console.log('    译文:', back);
})();
