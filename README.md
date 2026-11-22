# dsh-onversation-help

DeepSeek Harness 插件：在当前会话内选择、切换、移除专家与技能，并把 WorkBuddy connector 的账号状态接入插件。

- 专家来源：WorkBuddy 专家市场（远程）+ 本机已安装专家（离线）
- 技能：专家自带技能 + 当前全局技能，按会话启用/停用
- 隔离：每个会话通过 `agent.ctx` 独立挂载，销毁即回滚；不写全局配置、不改技能文件
- 身份：默认匿名访问公开市场；可选复用 `dsh-connect-workbuddy` 的账号池，或 DSH 凭据服务中的 token

## 安装

### 从 GitHub 安装（推荐）

```bash
dsh plugin --profile <profile> add git+ssh://git@github.com/awswt/dsh-onversation-help.git
```

或 HTTPS：

```bash
dsh plugin --profile <profile> add https://github.com/awswt/dsh-onversation-help.git
```

安装后重启对应 profile。插件会写入 profile 的 `dsh.profile.bundles`，不需要手动改 `cordis.patch.yml`。

### 本机开发安装

```bash
dsh plugin --profile <profile> add /absolute/path/to/dsh-onversation-help
```

## 使用

### 模型工具

工具名：`onversation_help`

| action | 作用 |
|---|---|
| `status` | 当前会话的专家、技能、应用状态、connector 与认证状态 |
| `expert` | 选择专家，参数 `expertId` 可填专家 id、plugin slug 或 agentName |
| `off` | 移除当前会话的专家，恢复全部全局技能 |
| `skills` | 列出全局技能与专家技能，以及当前启用状态 |
| `set-skills` | 调整技能开关：`mode=all|selected`、`names=a,b`、`expertNames=c,d` |
| `connector` | WorkBuddy connector 检测结果、账号数量、可用账号数（不含 token） |
| `market` | 搜索市场专家，参数 `query` |

示例：

```text
onversation_help(action="connector")
onversation_help(action="market", query="内容")
onversation_help(action="expert", expertId="ai-agent-engineer")
onversation_help(action="skills")
onversation_help(action="off")
```

### 斜杠命令

```text
/onversation-help status
/onversation-help market 内容
/onversation-help expert ai-agent-engineer
/onversation-help skills
/onversation-help off
/onversation-help connector
```

命令与工具都只作用于“发起调用的会话”，不需要 sessionId 参数，也不会影响其他会话。

## 配置

```yaml
- insert:
    - id: onversation-help
      name: dsh-onversation-help
      config:
        enabled: true
        authMode: none
        marketBaseUrl: https://acc-1258344699.cos.accelerate.myqcloud.com/workbuddy/expert-marketplace
        manifestPath: /expert_center.json
        timeoutMs: 20000
        retries: 1
        cacheTtlMs: 21600000
        staleWhileErrorMs: 604800000
        maxPromptChars: 60000
        maxSelectedSkills: 64
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `authMode` | `none` | `none / bearer / header / cookie / workbuddy-connector` |
| `credentialRef` | `WB_EXPERT_TOKEN` | DSH 凭据服务中的键名，仅 `bearer/header/cookie` 使用 |
| `headerName` | `Authorization` | 认证头名 |
| `headerPrefix` | `Bearer ` | 认证头前缀 |
| `connectorRegion` | 自动 | `cn / global`，仅 `workbuddy-connector` 使用 |
| `marketBaseUrl` | WorkBuddy 市场 | 必须是 HTTPS，且在 `allowHosts` 内 |
| `allowHosts` | 市场 host | 允许接收凭据的 host |
| `allowInsecureLoopback` | `false` | 仅本地测试使用 |
| `maxPromptChars` | `60000` | 专家提示词截断上限 |
| `maxSelectedSkills` | `64` | 单会话技能上限 |
| `dataDir` | `$DSH_HOME/onversation-help` | sidecar 与缓存目录 |
| `localRoots` | 两个 WorkBuddy 目录 | 本地专家来源，只读 |

## WorkBuddy connector 接入

插件只读 `dsh-connect-workbuddy` 的账号库：

```text
$DSH_HOME/workbuddy-vault/<region>/<accountId>.json
```

行为：

- `connector` 动作返回 `installed / profile / version / accountCount / usableAccountCount / accounts`；
- 账号 id 与昵称做掩码，token 永远不出现在 `status()`；
- 不刷新 token、不写 vault、不理解密；
- `authMode: workbuddy-connector` 时，市场请求会使用第一个未过期账号的 `accessToken`，只发往 `allowHosts`；
- 默认 `authMode: none`：公开市场不需要 token，避免把 WorkBuddy 凭据发给公共 COS。

企业网关或需要鉴权的市场：

```yaml
authMode: workbuddy-connector
allowHosts:
  - your-enterprise-gateway.example.com
marketBaseUrl: https://your-enterprise-gateway.example.com/workbuddy/expert-marketplace
```

或使用 DSH 凭据服务：

```yaml
authMode: bearer
credentialRef: WB_EXPERT_TOKEN
```

凭据通过 DSH 的 credentials 服务写入，配置里只出现键名。

## 会话隔离

- 选择专家时，插件在 `agent.ctx` 下挂载一个子插件：`systemPrompt.section` + 两个技能 provider。
- `onversation-help-expert-<gen>`（rank 200）提供专家自带技能。
- `onversation-help-filter-<gen>`（rank 1000）影子化全局技能，未选中的设为不可调用。
- 新 fiber 挂载成功后才销毁旧 fiber；失败时旧人格保留。
- 状态写入 `$DSH_HOME/onversation-help/sessions/<sha256(sessionId)>.json`，`agent/created` 时恢复。
- 子代理与 fork 默认不继承；它们有独立的 Agent/Session。

## 安全

- 专家包是数据，不是代码：只读 markdown/资源，不执行脚本，不 `npm install`。
- 解包拒绝绝对路径、`..`、符号链接/硬链接，限制条目数与解压体积。
- 专家提示词以 `<expert_selection>` 包裹，转义闭合标签，并声明不得覆盖安全规则、工具权限与危险操作确认。
- 凭据只发往 allow-list 的 HTTPS host；重定向逐跳校验；错误与日志不包含 token。
- 市场内容仍可能包含提示注入，权限系统与用户确认仍是最后防线，不承诺 100% 免疫。

## 数据与缓存

```text
$DSH_HOME/onversation-help/
├─ cache/
│  ├─ manifest.json
│  ├─ manifest.meta.json
│  ├─ bundles/
│  └─ downloads/
└─ sessions/
   └─ <sha256(sessionId)>.json
```

清理缓存不会影响会话选择；下次使用会重新下载。

## 开发与测试

```bash
npm install
npm test
```

当前测试覆盖：提示词转义、HTTPS/host 允许列表、内联密钥拒绝、WorkBuddy connector 只读解析、市场缓存与认证头、本机专家解析、路径穿越。

### 手工端到端测试（假模型）

`test/fake-model-e2e.mjs` 与 `test/fake-model-expert-e2e.mjs` 会启动一个本地 Messages 兼容 SSE 服务，冒充模型返回 `onversation_help` 工具调用，用来验证真实 DSH 宿主里的工具执行、专家提示段与技能目录注入。需要先安装到测试 profile，并设置：

```bash
DSH_APP_EXE="D:/Program Files/deepseek harness/DeepSeek Harness.exe" DSH_BIN="D:/Program Files/deepseek harness/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js" DSH_TEST_PROFILE=onversation-gh node test/fake-model-expert-e2e.mjs
```

脚本不会访问真实模型，也不会消耗 token；假 token 只发给本地 127.0.0.1 服务。

设计文档：[docs/dsh-onversation-help-design.md](docs/dsh-onversation-help-design.md)

## License

MIT
