# Enhancers — 阶段增强能力包

> 让每个 phase skill 在执行时**额外加载领域专家规范**，提升产物质量。主流程不变，只是在生成产物时多遵守一组规则。

---

## 设计思想

三个主 phase skill（`dev-proto` / `dev-dev` / `dev-deploy`）内置的是**通用流程和默认约定**。但每个项目有自己的领域规范，比如：

- 原型阶段要遵守某套表单生成模式
- 开发阶段要套用某个状态管理库的最佳实践
- 部署阶段要走某个 CDN 的优化清单

这些规范不应该塞进主 skill（会让主 skill 越长越乱），而是放在本目录下作为**可插拔的增强包**。主 skill 在 Step 0 自动扫描并加载本阶段的所有 enhancer，后续生成产物时把它们当作"必须遵守的领域专家规范"。

**关键边界**：

- enhancer **只提供知识和约束**，不破坏主流程的步骤顺序
- enhancer 默认全部启用，用户不想要的删除文件即可
- enhancer 维护在 ai-forge 框架级，通过 `scripts/create.sh` 复制到每个生成的项目

---

## 目录结构

```
.claude/enhancers/
├── README.md                 # 本文件
├── proto/                    # 原型阶段（dev-proto 加载）
│   └── *.md
├── dev/                      # 开发阶段（dev-dev 加载）
│   └── *.md
└── deploy/                   # 部署阶段（dev-deploy 加载）
    └── *.md
```

---

## 一个 enhancer 的格式

每个 enhancer 是一份带 frontmatter 的 markdown 文件。

```markdown
---
name: shadcn-form-patterns                   # 必填，kebab-case
description: 表单生成统一规范（react-hook-form + zod）  # 必填，一句话
enhances: proto                              # 必填，所属阶段：proto | dev | deploy
priority: medium                             # 可选，冲突时优先级：high | medium | low（默认 medium）
appliesTo: [form, input, validation]         # 可选，关键词数组，主 skill 用来判断"当前任务是否相关"
---

# 表单生成规范

## 必须遵守

- 所有表单使用 react-hook-form + zod schema
- 错误信息走 `<FormMessage>`，不用 toast
- ...

## 推荐模式

- ...

## 反模式（禁止）

- ❌ 直接用 `useState` 管理表单字段值
- ❌ 在 `onChange` 里手写校验
```

### Frontmatter 字段说明

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `name` | ✅ | string | kebab-case 唯一标识，写到 session.json 的 enhancers 数组 |
| `description` | ✅ | string | 一句话描述，方便用户查清单 |
| `enhances` | ✅ | enum | `proto` / `dev` / `deploy`，必须与所在目录一致 |
| `priority` | ❌ | enum | `high` / `medium` / `low`，冲突排序用，默认 `medium` |
| `appliesTo` | ❌ | string[] | 关键词数组，主 skill 可据此判断是否相关 |

### 正文写作建议

- 用「**必须遵守** / **推荐模式** / **反模式（禁止）**」三段式，便于主 skill 直接引用
- 用具体代码示例和反例，不要写抽象原则
- 控制在 200 行以内；规范多的拆成多个 enhancer
- 引用具体文件路径用相对路径（`src/components/ui/button.tsx`），方便主 skill 实操

---

## 主 skill 如何使用 enhancer

三个主 phase skill 在 **Step 0 末尾**采用**两段式加载**（避免一上来全量预加载、撑爆上下文）：

1. **第一段：仅扫 frontmatter**
   ```bash
   node scripts/lib/enhancers.mjs list <phase>
   ```
   输出 JSON manifest（`name` / `description` / `priority` / `appliesTo`），不读全文。

2. **第二段：按需选择 + 全文 Read**
   ```bash
   node scripts/lib/enhancers.mjs select <phase> --keywords "<kw1,kw2,...>"
   ```
   关键词来自 Step 0 提取的需求要素（如 `form,validation,login`）。
   - `appliesTo` 与关键词有交集 → 选中
   - `appliesTo` 为空 → 默认选中（通用规范）
   - 命令同时返回 `selected` 和 `skipped`，主 skill 据此对 `selected` 逐份 `Read`

3. **告知用户启用清单 + 落盘**
   ```bash
   node scripts/lib/enhancers.mjs manifest --phase <phase> \
     --selected "<name1>,<name2>" --skipped "<name3>"
   ```
   写入 `.loop/<phase>/enhancers-manifest.md`，并把 `selected` 数组写入 `session.json.phases.<phase>.enhancers`。

4. 后续每个产物步骤开始前，**显式回顾本阶段启用的增强规范**。

**冲突解决顺序**（同一规则被多份 enhancer 矛盾时）：

1. `priority: high` > `medium` > `low`
2. 同优先级时按文件名字典序（前面的覆盖后面的）
3. enhancer 与主 skill 默认约定冲突 → enhancer 胜（除非主 skill 红线明确不允许，如"全局 globals.css 不可修改"）

---

## 写一个新 enhancer 的步骤

1. 决定属于哪个阶段（proto/dev/deploy）
2. 在对应目录新建 `<name>.md`
3. 填 frontmatter（`name`、`description`、`enhances`、可选 `priority`/`appliesTo`）
4. 用三段式（必须 / 推荐 / 反模式）写规范，附代码示例
5. 不需要注册，下一次跑 phase skill 自动加载

---

## 检查启用了哪些 enhancer

```bash
# 列本阶段所有启用的
ls .claude/enhancers/proto/*.md

# 看上一次跑完后启用的
cat .loop/session.json | jq '.phases'
```

如果不想要某个 enhancer，直接删文件即可（或在自己的 fork 里删除）。

---

## 框架级 vs 项目级

- **维护源**：`ai-forge/.claude/enhancers/`（框架级单一来源）
- **分发**：`scripts/create.sh` 把整个目录复制到每个生成的项目
- **本地修改**：项目里可以直接编辑/新增 enhancer，但不会同步回框架。需要全局生效请回到 ai-forge 仓库提交

未来如果需要"项目级覆盖框架级"，再扩展加载逻辑（目前不做，避免过度设计）。
