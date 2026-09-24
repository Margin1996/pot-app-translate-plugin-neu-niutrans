#!/usr/bin/env node
/**
 * 提交前泄露检查。
 *
 * 用法：
 *   node scripts/check-secrets.js
 *
 * 检查内容：
 *   1. 每一个将被提交的文件里，是否存在长十六进制串、sk- 开头的 Key、
 *      "apikey": "xxx" 赋值等敏感模式；
 *   2. 是否存在个人路径（Windows 用户目录）、个人邮箱等隐私信息；
 *   3. 待打包/已存在的 .potext 内是否含敏感内容。
 *
 * 退出码非 0 表示检查未通过，禁止提交。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules']);

/** 敏感模式：命中即失败 */
const SECRET_PATTERNS = [
    { name: '小牛 Key 常见前缀 f4c6/9892', re: /\b(f4c6|9892)[A-Za-z0-9]{20,}\b/g },
    { name: 'OpenAI 风格 Key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
    { name: '长十六进制串(疑似 Key)', re: /\b[A-Fa-f0-9]{32,}\b/g },
    { name: 'JSON apikey 赋值', re: /"apikey"\s*:\s*"[A-Za-z0-9]{16,}"/gi },
    { name: 'ini/env 风格 apikey 赋值', re: /^\s*apikey\s*[=:]\s*["']?[A-Za-z0-9]{16,}/gim },
];

/** 明确无害的字面量（测试用的假 Key） */
const SAFE_LITERALS = [
    'KEY123', 'REALKEY', 'NEWKEY', 'OLDKEY', 'OLD', 'FAKEKEY123', 'FAKE_KEY_FOR_TEST', 'definitely-invalid-key',
];

/**
 * 隐私模式：命中即失败。
 * 注意：模式用拼接/转义构造，避免本文件自身被这些规则命中（否则脚本会举报自己）。
 */
const PRIVACY_PATTERNS = [
    { name: '本机 Windows 用户目录', re: new RegExp('C:' + '\\\\Users\\\\[A-Za-z0-9_.-]+', 'g') },
    { name: '本机用户名', re: new RegExp('\\b' + 'l' + 'wb' + '\\b', 'g') },
    { name: '个人邮箱', re: new RegExp('[A-Za-z0-9._%+-]+@(' + 'neuq' + '|neu' + ')\\.edu\\.cn', 'g') },
    { name: '中文姓名', re: new RegExp('\\u8c22\\u6167\\u6cfd', 'g') },
];

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, out);
        } else {
            out.push(full);
        }
    }
    return out;
}

function isProbablySafe(match) {
    if (SAFE_LITERALS.some((s) => match.includes(s))) return true;
    // 全小写/全大写的纯字母串多为哈希样式常量，但长度 32+ 且含数字的一律不放行
    return false;
}

const failures = [];
const files = walk(ROOT);

for (const file of files) {
    const rel = path.relative(ROOT, file);
    let content;
    try {
        content = fs.readFileSync(file, 'utf8');
    } catch (e) {
        continue; // 二进制文件跳过
    }

    for (const { name, re } of SECRET_PATTERNS) {
        re.lastIndex = 0;
        const matches = content.match(re) || [];
        for (const m of matches) {
            if (isProbablySafe(m)) continue;
            failures.push({ file: rel, kind: '密钥', name, match: m.slice(0, 60) });
        }
    }

    for (const { name, re } of PRIVACY_PATTERNS) {
        re.lastIndex = 0;
        const matches = content.match(re) || [];
        for (const m of matches) {
            failures.push({ file: rel, kind: '隐私', name, match: m.slice(0, 60) });
        }
    }
}

// 额外检查：.potext 包是否为最新且不含敏感信息
const info = JSON.parse(fs.readFileSync(path.join(ROOT, 'info.json'), 'utf8'));
const potext = path.join(ROOT, `${info.id}.potext`);
if (fs.existsSync(potext)) {
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'secretscan-'));
    try {
        execFileSync('powershell', [
            '-NoProfile', '-Command',
            `Expand-Archive -LiteralPath '${potext}' -DestinationPath '${tmp}' -Force`,
        ], { stdio: 'ignore' });
        const inner = walk(tmp);
        const joined = inner.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
        for (const { name, re } of SECRET_PATTERNS) {
            re.lastIndex = 0;
            const matches = joined.match(re) || [];
            for (const m of matches) {
                if (isProbablySafe(m)) continue;
                failures.push({ file: path.basename(potext), kind: '密钥(包内)', name, match: m.slice(0, 60) });
            }
        }
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

console.log(`已扫描 ${files.length} 个文件${fs.existsSync(potext) ? ' + .potext 包内文件' : ''}\n`);

if (failures.length === 0) {
    console.log('通过：未发现 API Key 或隐私信息。');
    process.exit(0);
}

console.error(`发现 ${failures.length} 处可疑内容，禁止提交：\n`);
for (const f of failures) {
    console.error(`  [${f.kind}] ${f.file}\n    规则: ${f.name}\n    内容: ${f.match}`);
}
process.exit(1);
