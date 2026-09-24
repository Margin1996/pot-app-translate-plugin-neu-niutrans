/**
 * 纯 Node 实现的 .potext 打包脚本（不依赖 zip 命令，跨平台可用）
 *
 * 用法： node build.js
 * 产物： plugin.com.neu.niutrans.potext
 *
 * Pot 插件包结构要求（见 src-tauri/src/cmd.rs install_plugin）：
 *   - 文件名必须以 plugin 开头，扩展名为 .potext
 *   - 压缩包根目录直接放 info.json、main.js、图标文件（不允许有外层文件夹）
 *   - info.json 必须含 plugin_type 字段，main.js 必须存在
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const info = JSON.parse(fs.readFileSync(path.join(ROOT, 'info.json'), 'utf8'));

// 包内文件顺序：info.json -> main.js -> 图标
const files = ['info.json', 'main.js', info.icon].filter(Boolean).map((name) => ({
    name,
    data: fs.readFileSync(path.join(ROOT, name)),
}));

const output = path.join(ROOT, `${info.id}.potext`);

// ---------- ZIP 写入 ----------

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c;
    }
    return table;
})();

function crc32(buf) {
    let c = 0 ^ -1;
    for (let i = 0; i < buf.length; i++) {
        c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
    }
    return (c ^ -1) >>> 0;
}

function buildZip(entries) {
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBuf = Buffer.from(entry.name, 'utf8');
        const crc = crc32(entry.data);
        const compressed = zlib.deflateRawSync(entry.data, { level: 9 });

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); // 局部文件头签名
        local.writeUInt16LE(20, 4); // 解压所需版本
        local.writeUInt16LE(0x0800, 6); // 标志位：文件名为 UTF-8
        local.writeUInt16LE(8, 8); // 压缩方法：deflate
        local.writeUInt16LE(0, 10); // 修改时间
        local.writeUInt16LE(0x21, 12); // 修改日期（1980-01-01，保证可复现）
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(compressed.length, 18);
        local.writeUInt32LE(entry.data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);

        chunks.push(local, nameBuf, compressed);

        const cd = Buffer.alloc(46);
        cd.writeUInt32LE(0x02014b50, 0); // 中央目录头签名
        cd.writeUInt16LE(20, 4); // 创建版本
        cd.writeUInt16LE(20, 6); // 解压所需版本
        cd.writeUInt16LE(0x0800, 8);
        cd.writeUInt16LE(8, 10);
        cd.writeUInt16LE(0, 12);
        cd.writeUInt16LE(0x21, 14);
        cd.writeUInt32LE(crc, 16);
        cd.writeUInt32LE(compressed.length, 20);
        cd.writeUInt32LE(entry.data.length, 24);
        cd.writeUInt16LE(nameBuf.length, 28);
        cd.writeUInt16LE(0, 30); // extra
        cd.writeUInt16LE(0, 32); // comment
        cd.writeUInt16LE(0, 34); // 起始磁盘号
        cd.writeUInt16LE(0, 36); // 内部属性
        cd.writeUInt32LE(0, 38); // 外部属性
        cd.writeUInt32LE(offset, 42); // 局部头偏移
        central.push(cd, nameBuf);

        offset += local.length + nameBuf.length + compressed.length;
    }

    const centralBuf = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); // 中央目录结束记录
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuf.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([...chunks, centralBuf, end]);
}

// ---------- 执行 ----------

if (!info.plugin_type) {
    console.error('info.json 缺少 plugin_type 字段，Pot 会拒绝安装');
    process.exit(1);
}
if (!info.id.startsWith('plugin')) {
    console.error(`插件 id 必须以 plugin 开头，当前为 ${info.id}`);
    process.exit(1);
}

fs.writeFileSync(output, buildZip(files));
console.log(`已生成 ${path.basename(output)} (${fs.statSync(output).size} bytes)`);
for (const f of files) {
    console.log(`  + ${f.name} (${f.data.length} bytes)`);
}
