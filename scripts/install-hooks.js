#!/usr/bin/env node
/**
 * 安装 git 钩子（提交前自动做泄露检查）。
 * 用法： node scripts/install-hooks.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HOOKS = path.join(ROOT, '.git', 'hooks');
const SRC = path.join(__dirname, 'pre-commit');
const DEST = path.join(HOOKS, 'pre-commit');

if (!fs.existsSync(path.join(ROOT, '.git'))) {
    console.error('当前目录不是 git 仓库，请先执行 git init');
    process.exit(1);
}

fs.mkdirSync(HOOKS, { recursive: true });
fs.copyFileSync(SRC, DEST);
try {
    fs.chmodSync(DEST, 0o755);
} catch (e) {
    // Windows 上 chmod 可能无效，不影响 git 执行
}
console.log(`已安装 pre-commit 钩子: ${path.relative(ROOT, DEST)}`);
