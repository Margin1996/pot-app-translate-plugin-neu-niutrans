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
