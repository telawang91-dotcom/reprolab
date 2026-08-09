# 交付产物目录

这里统一存放可交付的大文件，避免与源码混在项目根目录。除本说明外，目录内容
均被 Git 和 Docker 构建上下文忽略。

- `docker/current/`：最近一次校准并可直接交付的 Docker 镜像包。
- `docker/archive/`：历史 Docker 镜像包，只归档、不覆盖。
- `submission/`：比赛最终提交材料、演示视频和校验清单。

更新 Docker 离线包：

```powershell
.\scripts\export_docker_delivery.ps1
```

更新比赛材料的 SHA-256 清单：

```powershell
.\.venv\Scripts\python.exe .\scripts\regenerate_submission_manifest.py
```

这两个命令会更新对应的 current/清单文件，不会处理 archive/。不要在未备份的
情况下批量清理本目录。
