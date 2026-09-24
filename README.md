# Pot-App 小牛翻译插件（东北大学版）

[Pot App](https://github.com/pot-app/pot-desktop) 的翻译插件，用于调用东北大学提供的小牛翻译（NiuTrans）接口。

与 Pot 内置的「小牛翻译」服务的区别：内置服务写死了 `api.niutrans.com`，只能用小牛官方的自费 Key；本插件调用学校的网关地址 `trans.neu.edu.cn`，使用学校统一发放的 API Key，不消耗个人额度。

## 功能

- 调用学校网关 `POST /niutrans/textTranslation?apikey=...`
- 同时兼容小牛官方 API 的返回格式（`tgt_text`），因此接口地址可切换
- 多段落、多句结果按 `order` / `paragraphOrder` 排序后合并
- 错误码翻译成人话（认证失败、用户不存在、语种不支持、频率超限等）
- 接口地址与 API Key 均可在 Pot 设置界面配置，无需改代码

## 安装

1. 下载 `plugin.com.neu.niutrans.potext`
2. 打开 Pot → 偏好设置 → 服务设置 → 翻译 → 添加外部插件 → 安装外部插件
3. 选择该 `.potext` 文件
4. 在服务列表中添加「小牛翻译 (东北大学)」

## 配置

| 配置项 | 说明 | 必填 |
| --- | --- | --- |
| `API Key` | 学校发放的小牛翻译 API Key | 是 |
| `接口地址` | **留空即可**，默认使用 `https://trans.neu.edu.cn/niutrans/textTranslation` | 否 |

API Key 的获取方式以学校通知为准（通常在统一认证/信息化平台申请，登录后在个人中心查看）。

### 关于「接口地址」这个配置项

接口文档写的是 `https://trans.neu.edu.cn/niutrans/textTranslation?apikey=apikey的值`，这容易被理解成「把地址填成 `...?apikey=`，再在另一个框里填 Key」。**但地址栏只需要填到 `textTranslation` 为止，不要带 `?apikey=`。**

如果填成 `...textTranslation?apikey=`，插件会拼出 `?apikey=&apikey=真实Key`。服务端只取第一个 `apikey`（空值），于是永远返回 `3044 认证失败`——这个坑实测确认过。

插件已对此做了容错：地址里若已存在 `apikey` 参数，会替换其值而不是重复追加。因此下面三种填法都能正常工作：

| 接口地址填法 | 实际请求 URL |
| --- | --- |
| 留空（推荐） | `...textTranslation?apikey=KEY` |
| `...textTranslation` | `...textTranslation?apikey=KEY` |
| `...textTranslation?apikey=` | `...textTranslation?apikey=KEY` |

## 支持的语言

Pot 内置的全部语言均已映射，对应关系如下：

| Pot | 小牛 | Pot | 小牛 |
| --- | --- | --- | --- |
| `auto` | `auto` | `ar` | `ar` |
| `zh_cn` | `zh` | `hi` | `hi` |
| `zh_tw` | `cht` | `mn_cy` | `mn` |
| `yue` | `yue` | `mn_mo` | `mo` |
| `en` | `en` | `km` | `km` |
| `ja` | `ja` | `nb_no` | `nb` |
| `ko` | `ko` | `nn_no` | `nn` |
| `fr` | `fr` | `fa` | `fa` |
| `es` | `es` | `sv` | `sv` |
| `ru` | `ru` | `pl` | `pl` |
| `de` | `de` | `nl` | `nl` |
| `it` | `it` | `uk` | `uk` |
| `tr` | `tr` | `he` | `he` |
| `pt_pt` / `pt_br` | `pt` | `th` | `th` |
| `vi` | `vi` | `ms` | `ms` |
| `id` | `id` | | |

小牛翻译实际支持 400+ 语种，但 Pot 界面只会使用它自己 `languageList` 中列出的 30 种语言（本插件已全部覆盖）。

`yue`（粤语）不在 Pot 3.0.7 的语言列表中，属于预留映射：Pot 未提供该选项，因此当前不会被调用，保留是为了 POT 后续支持粤语时可直接生效。若要在 Pot 中使用粤语，需通过 `zh_tw` 等方式间接实现，或等待 Pot 更新语言列表。

映射表位于 `info.json` 的 `language` 字段，格式为 `"Pot语言代码": "小牛语言代码"`。

## 在另一台电脑上安装

只需要一个文件：`plugin.com.neu.niutrans.potext`。**插件包里不含 API Key**，可以安全地通过微信/网盘/邮件传递。

> API Key 保存在 Pot 的 `config.json` 里，不在插件包内，所以换电脑后需重新填一次 Key。不要试图把 `config.json` 一起拷过去——里面有你的 Key 和全部翻译历史。

### 方法一：图形界面安装（推荐）

1. 把 `plugin.com.neu.niutrans.potext` 拷到新电脑
2. Pot → 偏好设置 → 服务设置 → 翻译 → 添加外部插件 → 安装外部插件
3. 选择该 `.potext` 文件
4. 在服务列表中添加「小牛翻译 (东北大学)」，填入 API Key
5. 接口地址**留空**

### 方法二：手动复制目录

目标路径（`%APPDATA%` 即 `C:\Users\<用户名>\AppData\Roaming`）：

```
%APPDATA%\com.pot-app.desktop\plugins\translate\plugin.com.neu.niutrans\
├── info.json
├── main.js
└── niutrans.svg
```

**三条硬性规则**（均对应 Pot 源码中的检查）：

1. **目录名必须以 `plugin` 开头**。`get_plugin_list()` 会**直接删除**不符合的目录（`config.rs:156-161`）。
2. **`info.json`、`main.js`、图标三个文件都要在**。缺 `info.json` 或 `main.js` 会报 `Invalid Plugin`；缺图标则界面图标显示异常。
3. **在 Pot 启动前放好**，或放好后重启 Pot（见下）。

### 顺序陷阱（重要）

Pot 启动时会执行 `check_service_available()`（`config.rs:53`），把服务列表中「引用了、但插件目录下不存在」的条目**永久删除并写回 `config.json`**（`set()` → `store.save()`）。

所以若先恢复 `config.json`、期间又启动过一次 Pot，那条插件服务记录就已被清除。**正确顺序：先放插件文件 → 启动 Pot → 再在界面里添加服务并填 Key。**

手动复制的完整流程：

1. 关闭 Pot
2. 创建上述目录并放入三个文件
3. 启动 Pot
4. 服务设置 → 翻译 → 添加服务 → 选「小牛翻译 (东北大学)」
5. 填入 API Key（接口地址留空）

验证是否成功：`plugins\translate\` 下存在 `plugin.com.neu.niutrans` 目录，且 Pot 服务列表中出现该插件。

## 开发

```
pot-app-translate-plugin-neu-niutrans/
├── info.json                  # 插件元信息、配置项、语言映射
├── main.js                    # 插件实现（Pot 以 eval 方式加载，仅可使用函数声明）
├── niutrans.svg               # 图标
├── test/
│   ├── test.js                # 离线单测，不联网（21 个用例）
│   ├── eval-smoke.mjs         # 复刻 Pot 的 eval 加载机制，验证可被正确加载
│   ├── live.js                # 真实网络联调，Key 由命令行传入
│   ├── e2e.js                 # 端到端联调，Key 自动从 Pot config.json 读取
│   ├── e2e-real-config.js     # 直接用 Pot 中本插件的实例配置跑真实翻译
│   └── migrate-sim.js         # 模拟全新电脑安装迁移，验证顺序陷阱
└── .github/workflows/build.yml # 推送后自动打包 .potext
```

离线单测（21 个用例，覆盖接口契约、多种响应形态、错误分支、URL 拼接容错）：

```bash
node test/test.js
node test/eval-smoke.mjs
node test/migrate-sim.js
```

真实联调（需要真实 API Key）：

```bash
node test/live.js <你的学校APIKEY>
# 复用 Pot 中已配置的小牛 Key
node test/e2e.js
# 直接使用 Pot 中本插件的实例配置（含接口地址）
node test/e2e-real-config.js
```

打包：

```bash
# 将 info.json、main.js、图标文件压缩为 zip，再重命名为 <插件id>.potext
zip plugin.com.neu.niutrans.potext info.json main.js niutrans.svg
```

### 实现说明

- Pot 3.0.x（Tauri v1）通过 `eval` 加载 `main.js`，因此**只能使用函数声明，不能用 `import` / `export`**。
- 网络请求使用运行时注入的 `utils.tauriFetch`（对 POT 2.x 的 `utils.http.fetch` 做了回退兼容）。
- 请求体使用 `utils.http.Body.json()` 构造，这是 Tauri v1 `http.fetch` 要求的 `{ type, payload }` 结构。

## 接口契约

```
POST https://trans.neu.edu.cn/niutrans/textTranslation?apikey={APIKEY}
Content-Type: application/json

{ "from": "zh", "to": "en", "src_text": "你好" }
```

成功响应：

```json
{
  "code": 200,
  "msg": "成功",
  "data": [
    {
      "sentences": [
        { "data": "Hello", "contrastSourceText": "你好", "paragraphOrder": 0, "order": 0 }
      ],
      "order": 0
    }
  ]
}
```

## License

MIT
