/**
 * Pot-App 翻译插件 —— 东北大学 小牛翻译（NiuTrans）
 *
 * 接口契约（依据学校接口文档）：
 *   POST {ENDPOINT}?apikey={APIKEY}
 *   Content-Type: application/json
 *   Body: { "from": "zh", "to": "en", "src_text": "你好" }
 *
 * 学校网关返回：
 *   { "code": 200, "msg": "成功", "data": [ { "sentences": [ { "data": "Hello", ... } ], "order": 0 } ] }
 * 小牛官方 API 返回：
 *   { "from": "zh", "to": "en", "tgt_text": "Hello" }
 * 两种形态本插件都能解析，因此既能接学校网关，也能接 api.niutrans.com。
 */

// 学校网关默认地址；留空则使用此地址
const DEFAULT_ENDPOINT = 'https://trans.neu.edu.cn/niutrans/textTranslation';

// 常见错误码 -> 人话，其余情况直接透传服务端 msg
const ERROR_HINT = {
    3044: '认证失败：请检查 API Key 是否填写正确',
    4012: '用户不存在：API Key 无效或已被学校回收',
    3001: '源语言不支持',
    3002: '目标语言不支持',
    3003: '原文为空',
    3004: '翻译失败，请稍后重试',
    4001: '请求过于频繁，请稍后重试',
};

/**
 * @param {string} text  待翻译文本
 * @param {string} from  Pot 语言代码（已由 info.json 映射为小牛代码）
 * @param {string} to    Pot 语言代码（已由 info.json 映射为小牛代码）
 * @param {object} options Pot 注入的运行时上下文
 * @returns {Promise<string>} 译文
 */
async function translate(text, from, to, options) {
    const { config = {}, utils = {} } = options || {};
    // pot-desktop 3.0.x 暴露 tauriFetch；2.x 暴露 http.fetch。两者都兼容。
    const fetch = utils.tauriFetch || (utils.http && utils.http.fetch);
    if (typeof fetch !== 'function') {
        throw '插件运行环境不支持网络请求（未找到 tauriFetch / http.fetch）';
    }

    const apikey = (config.apikey || '').trim();
    if (!apikey) {
        throw '未配置 API Key\n请在 Pot 设置 - 服务设置 - 翻译 - 本插件 中填写小牛翻译 API Key';
    }

    let endpoint = (config.endpoint || '').trim() || DEFAULT_ENDPOINT;
    if (!/^https?:\/\//i.test(endpoint)) {
        endpoint = `https://${endpoint}`;
    }
    const url = buildUrl(endpoint, apikey);

    const payload = {
        from,
        to,
        src_text: text,
    };

    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // Tauri v1 的 http.fetch 要求 body 是 { type, payload } 结构。
            // 优先使用官方 Body 工具；旧版运行时没有 Body 时退回等价的手写结构。
            body: utils.http && utils.http.Body ? utils.http.Body.json(payload) : { type: 'Json', payload },
        });
    } catch (e) {
        throw `网络请求失败，请检查网络或校园网/VPN 连接\n${endpoint}\n${e && e.message ? e.message : String(e)}`;
    }

    if (!res.ok) {
        throw `Http Request Error\nHttp Status: ${res.status}\n${stringify(res.data)}`;
    }

    return parseResult(res.data);
}

/**
 * 拼接带 apikey 的请求 URL。
 *
 * 注意：接口文档写的是 `...textTranslation?apikey=apikey的值`，很容易被理解成
 * 「把地址填成 ...?apikey= 然后在配置里填 Key」，那会拼出 `?apikey=&apikey=真实Key`，
 * 服务端只取第一个参数，于是永远认证失败。这里做了容错：
 *   1. 地址里已带 apikey 参数：替换其值，不重复追加；
 *   2. 地址里只有 `?apikey=`（留空）：直接补值；
 *   3. 地址里带其他参数：用 & 追加。
 *
 * @param {string} endpoint 已补全协议的接口地址
 * @param {string} apikey API Key
 * @returns {string}
 */
function buildUrl(endpoint, apikey) {
    const encoded = encodeURIComponent(apikey);

    if (!endpoint.includes('?')) {
        return `${endpoint}?apikey=${encoded}`;
    }

    const [base, query] = splitOnce(endpoint, '?');
    const params = query.split('&').filter((p) => p.length > 0);
    const index = params.findIndex((p) => /^apikey=/i.test(p));

    if (index >= 0) {
        params[index] = `apikey=${encoded}`;
    } else {
        params.push(`apikey=${encoded}`);
    }
    return `${base}?${params.join('&')}`;
}

function splitOnce(text, sep) {
    const i = text.indexOf(sep);
    return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + sep.length)];
}

/**
 * 从多种响应结构中提取译文
 * @param {any} raw 响应体
 * @returns {string}
 */
function parseResult(raw) {
    const data = typeof raw === 'string' ? tryParse(raw) : raw;
    if (data === null || data === undefined) {
        throw '接口返回内容为空';
    }
    if (typeof data !== 'object') {
        throw `接口返回格式异常\n${String(data)}`;
    }

    // 1) 小牛官方 API 形态
    const direct = data.tgt_text || data.target_text;
    if (typeof direct === 'string' && direct.length > 0) {
        return direct.trim();
    }

    // 2) 小牛官方 API 错误形态：{ error_code, error_msg }
    const officialError = data.error_code !== undefined ? data.error_code : data.errorCode;
    if (officialError !== undefined && officialError !== null && officialError !== '' && Number(officialError) !== 0) {
        throw `小牛翻译接口报错 [error_code ${officialError}] ${data.error_msg || data.errorMsg || ''}`;
    }

    // 3) 学校网关形态：按业务码判断
    const code = data.code;
    const isSuccess = code === 200 || code === '200' || code === 0 || code === '0' || code === undefined;
    if (!isSuccess) {
        const hint = ERROR_HINT[Number(code)];
        throw `小牛翻译接口报错 [code ${code}] ${data.msg || ''}${hint ? `\n${hint}` : ''}`;
    }

    // 4) 学校网关形态：从 data[].sentences[].data 组装译文
    const translated = collectFromDataArray(data);
    if (translated !== null) {
        return translated.trim();
    }

    throw `未能从接口响应中解析出译文\n${stringify(data)}`;
}

/**
 * 解析学校网关的 data 数组，按 order / paragraphOrder 排序后拼装
 * @param {object} data
 * @returns {string|null}
 */
function collectFromDataArray(data) {
    const blocks = data.data || data.result;
    if (!Array.isArray(blocks)) {
        return null;
    }

    const ordered = blocks
        .map((block, index) => ({ block, index }))
        .sort((a, b) => numberOr(a.block && a.block.order, a.index) - numberOr(b.block && b.block.order, b.index));

    const paragraphs = [];
    for (const { block } of ordered) {
        const sentences = (block && block.sentences) || [];
        const pieces = sentences
            .map((sentence, index) => ({ sentence, index }))
            .sort(
                (a, b) =>
                    numberOr(a.sentence && a.sentence.paragraphOrder, a.index) -
                    numberOr(b.sentence && b.sentence.paragraphOrder, b.index)
            )
            .map(({ sentence }) => sentence && typeof sentence.data === 'string' ? sentence.data.trim() : '')
            .filter((x) => x.length > 0);

        if (pieces.length > 0) {
            paragraphs.push(joinSentences(pieces));
        }
    }

    return paragraphs.length > 0 ? paragraphs.join('\n') : null;
}

/**
 * 拼接同一段落内的句子。
 * 中文/日文等语言句间不加空格，英文等拉丁语系需要空格，否则 "Hello" + "world" 会粘成 "Helloworld"。
 * @param {string[]} pieces
 * @returns {string}
 */
function joinSentences(pieces) {
    return pieces.reduce((acc, piece) => {
        if (acc.length === 0) {
            return piece;
        }
        const prev = acc[acc.length - 1];
        const needSpace = !isCjk(prev) && !isCjk(piece[0]);
        return acc + (needSpace ? ' ' : '') + piece;
    }, '');
}

function isCjk(ch) {
    if (!ch) {
        return false;
    }
    const c = ch.codePointAt(0);
    return (
        (c >= 0x3000 && c <= 0x303f) || // CJK 标点
        (c >= 0x3040 && c <= 0x30ff) || // 平假名 / 片假名
        (c >= 0x3400 && c <= 0x4dbf) || // CJK 扩展 A
        (c >= 0x4e00 && c <= 0x9fff) || // CJK 基本区
        (c >= 0xac00 && c <= 0xd7af) || // 谚文
        (c >= 0xf900 && c <= 0xfaff) || // CJK 兼容表意
        (c >= 0xff00 && c <= 0xffef) // 全角字符
    );
}

function numberOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function tryParse(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

function stringify(value) {
    try {
        return typeof value === 'string' ? value : JSON.stringify(value);
    } catch (e) {
        return String(value);
    }
}
