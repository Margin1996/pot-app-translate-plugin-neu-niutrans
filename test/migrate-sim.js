/**
 * 模拟「另一台电脑」的全新安装，验证迁移方案是否可靠。
 *
 * 复刻 Pot 的真实启动逻辑（src-tauri/src/config.rs）：
 *   init_config() 加载 config.json -> check_service_available()
 *   check_service_available() 会把「服务列表里引用了、但 plugins 目录下不存在」的
 *   服务条目永久删除（retain + store.save()），这里一并复刻以验证顺序风险。
 *
 * 用法： node test/migrate-sim.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SRC = path.join(__dirname, '..');
const POTEXT = path.join(SRC, 'plugin.com.neu.niutrans.potext');

// 本测试需要一个已打包的 .potext。若不存在就自己构建，
// 这样无论 CI 里打包步骤排在测试之前还是之后都能正常运行。
if (!fs.existsSync(POTEXT)) {
    console.log('未找到 .potext，先执行构建...\n');
    require('child_process').execFileSync(process.execPath, [path.join(SRC, 'build.js')], {
        stdio: 'inherit',
    });
    console.log('');
}
const BUILTIN_TRANSLATE = ['niutrans', 'openai', 'bing', 'google', 'lingva']; // 相关子集

let failures = 0;
const check = (name, cond, detail) => {
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`);
    if (!cond) failures++;
};

/** 复刻 get_plugin_list：扫描 plugins/<type>/ 下以 plugin 开头的目录 */
function getPluginList(configDir, type) {
    const dir = path.join(configDir, 'plugins', type);
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .filter((name) => name.startsWith('plugin'));
}

/** 复刻 check_available：移除不可用服务并持久化 */
function checkServiceAvailable(configDir, config) {
    const available = [
        ...BUILTIN_TRANSLATE,
        ...getPluginList(configDir, 'translate'),
    ];
    const before = config.translate_service_list || [];
    const after = before.filter((s) => available.includes(s.split('@')[0]));
    const removed = before.filter((s) => !after.includes(s));
    if (removed.length > 0) {
        config.translate_service_list = after; // set() -> store.save()
    }
    return removed;
}

/** 模拟 Pot 安装 .potext（复刻 cmd.rs install_plugin） */
function installPlugin(configDir, potextPath) {
    const fileName = path.basename(potextPath).replace('.potext', '');
    if (!fileName.startsWith('plugin')) throw new Error('文件名必须以 plugin 开头');
    const info = JSON.parse(readZipEntry(potextPath, 'info.json'));
    const dest = path.join(configDir, 'plugins', info.plugin_type, fileName);
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of ['info.json', 'main.js', info.icon]) {
        fs.writeFileSync(path.join(dest, entry), readZipEntry(potextPath, entry));
    }
    return dest;
}

/** 读取 .potext 内的文件（纯 Node 实现，不依赖 powershell，可在 CI 的 Linux 上运行） */
function readZipEntry(zipPath, entryName) {
    return require('../scripts/zip-reader').readZipEntry(zipPath, entryName);
}

console.log('=== 场景：全新电脑，按「先装插件、再放配置」的顺序迁移 ===\n');

const newPc = fs.mkdtempSync(path.join(os.tmpdir(), 'newpc-'));
console.log(`模拟配置目录: ${newPc}\n`);

// ---- 步骤 1：先安装插件 ----
console.log('步骤 1：安装 .potext');
const dest = installPlugin(newPc, POTEXT);
check('插件目录已创建', fs.existsSync(dest), dest);
check('目录名以 plugin 开头（get_plugin_list 硬性要求）', path.basename(dest).startsWith('plugin'));
check('info.json 存在', fs.existsSync(path.join(dest, 'info.json')));
check('main.js 存在', fs.existsSync(path.join(dest, 'main.js')));
check('图标文件存在（由 info.json 的 icon 字段指定）', fs.existsSync(path.join(dest, 'niutrans.svg')));

const pluginList = getPluginList(newPc, 'translate');
check('插件被 get_plugin_list 识别', pluginList.includes('plugin.com.neu.niutrans'), pluginList.join(', '));

// ---- 步骤 2：放入带本插件服务条目的 config.json ----
console.log('\n步骤 2：放入 config.json（含插件服务条目）');
const config = {
    translate_service_list: ['openai@filx3xdzalp', 'niutrans@e88nwft65dp', 'plugin.com.neu.niutrans@avpg6wxubik'],
    'plugin.com.neu.niutrans@avpg6wxubik': {
        instanceName: '小牛翻译 (东北大学)',
        apikey: 'FAKE_KEY_FOR_TEST',
        endpoint: 'https://trans.neu.edu.cn/niutrans/textTranslation',
    },
};
fs.writeFileSync(path.join(newPc, 'config.json'), JSON.stringify(config));

// ---- 步骤 3：模拟 Pot 启动 ----
console.log('\n步骤 3：模拟 Pot 启动（init_config -> check_service_available）');
const removed = checkServiceAvailable(newPc, config);
check('插件服务未被误删', removed.length === 0, removed.length ? `被删除: ${removed.join(', ')}` : '');
check(
    '服务列表保留本插件',
    config.translate_service_list.includes('plugin.com.neu.niutrans@avpg6wxubik')
);

// ---- 对照：错误顺序（先放配置、后装插件）----
console.log('\n=== 对照实验：错误顺序（config.json 先于插件就位）===\n');
const badPc = fs.mkdtempSync(path.join(os.tmpdir(), 'badpc-'));
const badConfig = JSON.parse(JSON.stringify(config));
fs.writeFileSync(path.join(badPc, 'config.json'), JSON.stringify(badConfig));
const badRemoved = checkServiceAvailable(badPc, badConfig); // 此时 plugins 目录还不存在
check(
    '复现风险：插件未就位时启动，服务条目被永久删除',
    badRemoved.includes('plugin.com.neu.niutrans@avpg6zxubik') || badRemoved.length > 0,
    `被删除: ${badRemoved.join(', ')}`
);

fs.rmSync(newPc, { recursive: true, force: true });
fs.rmSync(badPc, { recursive: true, force: true });

console.log(`\n${failures === 0 ? '全部通过' : failures + ' 项失败'}`);
process.exitCode = failures === 0 ? 0 : 1;
