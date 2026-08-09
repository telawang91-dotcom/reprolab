# 11・本地工作区目录约定

本文只说明开发机上的缓存、运行产物和交付文件如何归类。业务代码结构仍以
`docs/00-README.md` 为准。

## 目录边界

| 目录 | 用途 | Git | 保留原则 |
| --- | --- | --- | --- |
| `.models/` | bge-m3、reranker 等本地模型缓存 | 忽略 | 不自动移动或删除 |
| `.downloads/` | 数据集和演示上传文件的下载缓存 | 忽略 | 只放输入数据，不放维护脚本 |
| `.runtime/` | 验收报告、日志、临时工作区和审计产物 | 忽略 | 默认保留，确认无用后才人工清理 |
| `.runtime/logs/` | 当前验证脚本生成的日志 | 忽略 | 新日志统一写入这里 |
| `.runtime/logs/legacy/` | 整理前散落日志的只读归档 | 忽略 | 不覆盖同名文件 |
| `.venv/` | Python 本地虚拟环境 | 忽略 | 不移动；移动会破坏环境路径 |
| `frontend/node_modules/` | 前端本地依赖 | 忽略 | 由 npm 管理 |
| `deliverables/docker/current/` | 当前 Docker 离线镜像交付包 | 忽略 | 由导出脚本更新，整理时不删除 |
| `deliverables/docker/archive/` | 历史 Docker 离线镜像包 | 忽略 | 只归档，不覆盖 |
| `deliverables/submission/` | 比赛最终提交材料及校验清单 | 忽略 | 只在明确授权后修改内容 |

## 根目录规则

根目录只保留项目入口文件和一级功能目录。运行日志不得写在根目录；脚本生成的
日志进入 `.runtime/logs/`，报告仍按对应脚本声明的输出路径写入 `.runtime/`。

本地模型、虚拟环境、`deliverables/` 和运行产物可能体积很大。整理目录时不得通过
批量清理命令处理这些目录，也不得执行 `docker compose down -v`；数据库与对象
存储卷需要单独备份后才能做破坏性操作。

## 本地维护脚本

本地数据和提交材料的维护脚本放在 `scripts/`。例如重新生成最终提交材料校验表：

```powershell
.\.venv\Scripts\python.exe scripts\regenerate_submission_manifest.py
```

该脚本会直接重写 `deliverables/submission/MANIFEST-SHA256.txt`，
因此只应在提交材料内容已经确认后执行。

提交或推送前运行仓库卫生检查：

```powershell
.\.venv\Scripts\python.exe scripts\check_repository_hygiene.py
git diff --check
```

检查会拦截本地缓存、运行产物、内容存储、交付大包、超过 25 MiB 的普通 Git 文件、
明显密钥和 README 断链。`deliverables/` 只跟踪本目录说明，Docker 镜像和比赛材料
继续留在本地。
