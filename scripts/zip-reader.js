/**
 * 纯 Node 实现的 ZIP 读取工具（跨平台，供测试脚本使用）。
 *
 * 为什么不用系统命令：test/migrate-sim.js 会在 GitHub Actions 的 ubuntu-latest 上运行，
 * 那里没有 powershell；而 check-secrets.js 也可能在 Linux/macOS 上跑。
 * 因此这里手工解析 ZIP，不依赖任何外部程序。
 */

const fs = require('fs');
const zlib = require('zlib');

/** 读取 zip 中某个条目的内容，返回 Buffer */
function readZipEntry(zipPath, entryName) {
    const buf = fs.readFileSync(zipPath);

    // 从尾部向前查找中央目录结束记录 (0x06054b50)
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) {
        throw new Error(`不是合法的 ZIP 文件: ${zipPath}`);
    }

    const count = buf.readUInt16LE(eocd + 10);
    let ptr = buf.readUInt32LE(eocd + 16); // 中央目录起始偏移

    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(ptr) !== 0x02014b50) {
            throw new Error('中央目录头损坏');
        }
        const method = buf.readUInt16LE(ptr + 10);
        const compSize = buf.readUInt32LE(ptr + 20);
        const uncompSize = buf.readUInt32LE(ptr + 24);
        const nameLen = buf.readUInt16LE(ptr + 28);
        const extraLen = buf.readUInt16LE(ptr + 30);
        const commentLen = buf.readUInt16LE(ptr + 32);
        const localOffset = buf.readUInt32LE(ptr + 42);
        const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);

        if (name === entryName) {
            // 解析局部头以定位数据区
            if (buf.readUInt32LE(localOffset) !== 0x04034b50) {
                throw new Error('局部文件头损坏');
            }
            const lNameLen = buf.readUInt16LE(localOffset + 26);
            const lExtraLen = buf.readUInt16LE(localOffset + 28);
            const dataStart = localOffset + 30 + lNameLen + lExtraLen;
            const data = buf.subarray(dataStart, dataStart + compSize);

            if (method === 0) return Buffer.from(data);
            if (method === 8) {
                const out = zlib.inflateRawSync(data);
                if (out.length !== uncompSize) {
                    throw new Error(`解压长度不符: 期望 ${uncompSize}, 实际 ${out.length}`);
                }
                return out;
            }
            throw new Error(`不支持的压缩方法: ${method}`);
        }

        ptr += 46 + nameLen + extraLen + commentLen;
    }

    throw new Error(`ZIP 中找不到条目: ${entryName}`);
}

/** 列出 zip 内所有条目名 */
function listZipEntries(zipPath) {
    const buf = fs.readFileSync(zipPath);
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error(`不是合法的 ZIP 文件: ${zipPath}`);

    const count = buf.readUInt16LE(eocd + 10);
    let ptr = buf.readUInt32LE(eocd + 16);
    const names = [];
    for (let i = 0; i < count; i++) {
        const nameLen = buf.readUInt16LE(ptr + 28);
        const extraLen = buf.readUInt16LE(ptr + 30);
        const commentLen = buf.readUInt16LE(ptr + 32);
        names.push(buf.toString('utf8', ptr + 46, ptr + 46 + nameLen));
        ptr += 46 + nameLen + extraLen + commentLen;
    }
    return names;
}

module.exports = { readZipEntry, listZipEntries };
