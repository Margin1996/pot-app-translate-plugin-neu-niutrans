/**
 * main.js 的离线自测脚本（不依赖 Pot App）
 * 运行： node test/test.js
 *
 * 做法：把 main.js 当普通脚本载入，注入假的 fetch 与 Pot runtime utils，
 * 覆盖学校网关成功 / 官方 API 成功 / 各类错误码 / 多段排序 / 空 key 等分支。
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const MAIN = path.join(__dirname, '..', 'main.js');
const source = fs.readFileSync(MAIN, 'utf8');

/** 以指定响应构造一个 sandbox 并取出 translate 函数 */
function loadPlugin(responder) {
    const calls = [];
    const fakeFetch = async (url, init) => {
        calls.push({ url, init });
        return responder(url, init);
    };
    const http = {
        fetch: fakeFetch,
        Body: { json: (payload) => ({ type: 'Json', payload }) },
    };
    const sandbox = { module: { exports: {} }, console };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nmodule.exports = { translate, parseResult, collectFromDataArray };`, sandbox);
    return { api: sandbox.module.exports, utils: { tauriFetch: fakeFetch, http }, calls };
}

/** 学校网关的成功响应样例（截图中的真实结构） */
const NEU_OK = {
    code: 200,
    msg: '成功',
    data: [
        {
            sentences: [
                {
                    data: 'Hello',
                    contrastSourceText: '你好',
                    paragraphOrder: 0,
                    order: 0,
                    uuid: '',
                    historyResult: null,
                    len: 0,
                    sourceLanguageAbbreviation: 'zh',
                    targetLanguageAbbreviation: 'en',
                },
            ],
            order: 0,
        },
    ],
};

const ok = (data) => async () => ({ ok: true, status: 200, data });
const httpError = (status, data) => async () => ({ ok: false, status, data });

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('学校网关：解析 data[].sentences[].data', async () => {
    const { api, utils, calls } = loadPlugin(ok(NEU_OK));
    const out = await api.translate('你好', 'zh', 'en', {
        config: { apikey: 'KEY123' },
        utils,
    });
    assert.strictEqual(out, 'Hello');

    // 校验请求 URL 与 body 契约
    const { url, init } = calls[0];
    assert.strictEqual(url, 'https://trans.neu.edu.cn/niutrans/textTranslation?apikey=KEY123');
    assert.strictEqual(init.method, 'POST');
    assert.strictEqual(init.headers['Content-Type'], 'application/json');
    // 跨 vm realm 的对象原型不同，用 JSON 比较结构
    assert.strictEqual(JSON.stringify(init.body), JSON.stringify({ type: 'Json', payload: { from: 'zh', to: 'en', src_text: '你好' } }));
});

test('自定义接口地址：自动补 https 前缀', async () => {
    const { api, utils, calls } = loadPlugin(ok(NEU_OK));
    await api.translate('你好', 'zh', 'en', {
        config: { apikey: 'K', endpoint: 'trans.neu.edu.cn/niutrans/textTranslation' },
        utils,
    });
    assert.strictEqual(calls[0].url, 'https://trans.neu.edu.cn/niutrans/textTranslation?apikey=K');
});

test('接口地址已带 query 时用 & 拼接', async () => {
    const { api, utils, calls } = loadPlugin(ok(NEU_OK));
    await api.translate('你好', 'zh', 'en', {
        config: { apikey: 'K', endpoint: 'https://example.com/api?v=2' },
        utils,
    });
    assert.strictEqual(calls[0].url, 'https://example.com/api?v=2&apikey=K');
});

test('地址误填成 ?apikey= 时不产生重复参数（真实踩坑场景）', async () => {
    const { api, utils, calls } = loadPlugin(ok(NEU_OK));
    await api.translate('你好', 'zh', 'en', {
        config: { apikey: 'REALKEY', endpoint: 'https://trans.neu.edu.cn/niutrans/textTranslation?apikey=' },
        utils,
    });
    assert.strictEqual(calls[0].url, 'https://trans.neu.edu.cn/niutrans/textTranslation?apikey=REALKEY');
    assert.strictEqual((calls[0].url.match(/apikey=/g) || []).length, 1, '不应出现两个 apikey 参数');
});

test('地址里已带完整 apikey 时被配置值覆盖', async () => {
    const { api, utils, calls } = loadPlugin(ok(NEU_OK));
    await api.translate('你好', 'zh', 'en', {
        config: { apikey: 'NEWKEY', endpoint: 'https://x.com/api?apikey=OLDKEY&v=2' },
        utils,
    });
    assert.strictEqual(calls[0].url, 'https://x.com/api?apikey=NEWKEY&v=2');
});

test('地址里的 apikey 参数位于末尾时也能替换', async () => {
    const { api, utils, calls } = loadPlugin(ok(NEU_OK));
    await api.translate('你好', 'zh', 'en', {
        config: { apikey: 'NEWKEY', endpoint: 'https://x.com/api?v=2&apikey=OLD' },
        utils,
    });
    assert.strictEqual(calls[0].url, 'https://x.com/api?v=2&apikey=NEWKEY');
});

test('官方 API 形态：直取 tgt_text', async () => {
    const { api, utils } = loadPlugin(ok({ from: 'zh', to: 'en', tgt_text: 'Hello world' }));
    const out = await api.translate('你好世界', 'zh', 'en', { config: { apikey: 'K' }, utils });
    assert.strictEqual(out, 'Hello world');
});

test('多段多句：按 order / paragraphOrder 排序拼装（拉丁语系加空格）', async () => {
    const { api, utils } = loadPlugin(
        ok({
            code: 200,
            data: [
                { order: 1, sentences: [{ data: 'Second para', paragraphOrder: 0 }] },
                {
                    order: 0,
                    sentences: [
                        { data: 'world', paragraphOrder: 1 },
                        { data: 'Hello', paragraphOrder: 0 },
                    ],
                },
            ],
        })
    );
    const out = await api.translate('x', 'zh', 'en', { config: { apikey: 'K' }, utils });
    assert.strictEqual(out, 'Hello world\nSecond para');
});

test('中文译文句间不加空格', async () => {
    const { api, utils } = loadPlugin(
        ok({
            code: 200,
            data: [
                {
                    order: 0,
                    sentences: [
                        { data: '深度学习取得了进展。', paragraphOrder: 0 },
                        { data: '效果很好。', paragraphOrder: 1 },
                    ],
                },
            ],
        })
    );
    const out = await api.translate('x', 'en', 'zh', { config: { apikey: 'K' }, utils });
    assert.strictEqual(out, '深度学习取得了进展。效果很好。');
});

test('中英混排时仅在需要处补空格', async () => {
    const { api, utils } = loadPlugin(
        ok({
            code: 200,
            data: [
                {
                    order: 0,
                    sentences: [
                        { data: 'The model', paragraphOrder: 0 },
                        { data: '精度提升。', paragraphOrder: 1 },
                    ],
                },
            ],
        })
    );
    const out = await api.translate('x', 'en', 'zh', { config: { apikey: 'K' }, utils });
    assert.strictEqual(out, 'The model精度提升。');
});

test('识别错误码 3044 并给出中文提示', async () => {
    const { api, utils } = loadPlugin(ok({ code: 3044, msg: '认证失败' }));
    await assert.rejects(
        () => api.translate('你好', 'zh', 'en', { config: { apikey: 'bad' }, utils }),
        (e) => e.includes('3044') && e.includes('API Key')
    );
});

test('识别错误码 4012 用户不存在', async () => {
    const { api, utils } = loadPlugin(ok({ code: 4012, msg: '用户不存在' }));
    await assert.rejects(
        () => api.translate('你好', 'zh', 'en', { config: { apikey: 'bad' }, utils }),
        (e) => e.includes('4012')
    );
});

test('缺失 API Key 时直接报错且不发请求', async () => {
    const { api, utils, calls } = loadPlugin(ok(NEU_OK));
    await assert.rejects(
        () => api.translate('你好', 'zh', 'en', { config: {}, utils }),
        (e) => e.includes('未配置 API Key')
    );
    assert.strictEqual(calls.length, 0);
});

test('HTTP 非 2xx 抛出状态码', async () => {
    const { api, utils } = loadPlugin(httpError(500, 'boom'));
    await assert.rejects(
        () => api.translate('你好', 'zh', 'en', { config: { apikey: 'K' }, utils }),
        (e) => e.includes('500')
    );
});

test('响应为 JSON 字符串时也能解析', async () => {
    const { api, utils } = loadPlugin(ok(JSON.stringify(NEU_OK)));
    const out = await api.translate('你好', 'zh', 'en', { config: { apikey: 'K' }, utils });
    assert.strictEqual(out, 'Hello');
});

test('运行时缺少 fetch 时报错而非静默失败', async () => {
    await assert.rejects(
        () => loadPlugin(ok(NEU_OK)).api.translate('x', 'zh', 'en', { config: { apikey: 'K' }, utils: {} }),
        (e) => e.includes('tauriFetch')
    );
});

test('空 data 数组时抛出可读错误', async () => {
    const { api, utils } = loadPlugin(ok({ code: 200, msg: '成功', data: [] }));
    await assert.rejects(
        () => api.translate('你好', 'zh', 'en', { config: { apikey: 'K' }, utils }),
        (e) => e.includes('未能从接口响应中解析出译文')
    );
});

test('apikey 中的特殊字符会被 URL 编码', async () => {
    const { api, utils, calls } = loadPlugin(ok(NEU_OK));
    await api.translate('你好', 'zh', 'en', { config: { apikey: 'a b&c=d' }, utils });
    assert.ok(calls[0].url.endsWith('?apikey=a%20b%26c%3Dd'), calls[0].url);
});

test('官方 API 错误形态：识别 error_code', async () => {
    const { api, utils } = loadPlugin(ok({ from: 'zh', to: 'en', error_code: '10001', error_msg: 'invalid apikey' }));
    await assert.rejects(
        () => api.translate('你好', 'zh', 'en', { config: { apikey: 'K' }, utils }),
        (e) => e.includes('10001') && e.includes('invalid apikey')
    );
});

test('error_code 为 0 时不误判为错误', async () => {
    const { api, utils } = loadPlugin(ok({ from: 'zh', to: 'en', error_code: '0', tgt_text: 'Hello' }));
    const out = await api.translate('你好', 'zh', 'en', { config: { apikey: 'K' }, utils });
    assert.strictEqual(out, 'Hello');
});

test('网络层异常被包装为可读提示', async () => {
    const { api, utils } = loadPlugin(async () => {
        throw new Error('connect ECONNREFUSED');
    });
    await assert.rejects(
        () => api.translate('你好', 'zh', 'en', { config: { apikey: 'K' }, utils }),
        (e) => e.includes('网络请求失败') && e.includes('ECONNREFUSED')
    );
});

(async () => {
    let pass = 0;
    const failures = [];
    for (const t of tests) {
        try {
            await t.fn();
            pass++;
            console.log(`  PASS  ${t.name}`);
        } catch (e) {
            failures.push({ name: t.name, error: e });
            console.log(`  FAIL  ${t.name}\n        ${e.message}`);
        }
    }
    console.log(`\n${pass}/${tests.length} passed`);
    if (failures.length > 0) {
        process.exitCode = 1;
    }
})();
