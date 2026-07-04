# 〖第 13 份〗 文件路径：tasks/M4-sandbox.md

## M4 代码执行沙箱（P0）

### 目标

提供一个持久化 Python kernel（变量常驻、支持多轮迭代）+ Docker 隔离 + 资源 / 超时 / 无网络约束的执行沙箱，执行前固定随机种子、出错自动重试，并把每次执行落成一条 runs（与 M5 协作产出 artifacts / 血缘），同时提供 "干净环境重放" 能力供复现引擎调用。

### 前置依赖

无独立前置；与 M5 溯源复现模块强耦合：M4 负责执行、捕获输出、写入 runs/env_snapshots；M5 负责 artifacts/edges 落库、code_hash 校验、复现比对逻辑；两者共用 sandbox_run 底层原语。

### 上下文加载提示（给 Codex）

开发本卡只需加载：AGENTS.md + 本卡 +（如需精确契约）docs/03-DATA-MODEL.md 的 env_snapshots /runs 表 /docs/04-API.md 的 POST /runs/docs/05-PROVENANCE.md §1.2（code_hash）与 §2.1（固定种子）、§1.3（执行捕获衔接）。不要加载其它模块任务卡或整份 docs。

### 涉及数据表

1. **env_snapshots（写入）**：每次执行前捕获沙箱环境（python_version + pip freeze packages 列表），计算 env_hash 落库；相同 env_hash 复用存量行，避免重复插入。

2. **runs（写入，与 M5 协作）**：每次执行生成一条不可变记录，存储 code /lang/env_snapshot_id /input_hashes/input_hash /code_hash/seed /status/stdout；结构化产物、图表解析入库逻辑归属 M5，M4 仅完整捕获 stdout 与产物结构并对外透出。

   

   表结构以 docs/03-DATA-MODEL.md 为准，不重复 DDL。

### 涉及接口

#### POST /runs

**请求体**

json









```
{
  "project_id": "string",
  "conversation_id?": "string",
  "code": "python代码字符串",
  "lang?": "python",
  "dataset_ids?": ["数据集ID"],
  "seed?": 42
}
```

**响应体**

json









```
{
  "run_id": "执行唯一ID",
  "status": "success/error",
  "stdout": "控制台输出",
  "artifacts": [产物结构化对象列表],
  "code_hash": "64位sha256哈希"
}
```

api/runs.py 仅处理 I/O 与 Pydantic 参数校验，核心业务逻辑下沉 sandbox 服务；携带 conversation_id 代表复用该会话常驻 kernel 执行，变量跨请求持久化。契约见 docs/04-API.md。

### 相关机制

1. docs/05-PROVENANCE.md §1.2 code_hash 哈希计算规则（架构铁律 3：必须纳入环境哈希）

   plaintext

   

   

   

   

   ```
   env_hash = sha256(json.dumps(sorted(packages)) + python_version)
   input_hash = sha256("".join(sorted(dataset_storage_hashes)))
   code_hash = sha256(code + lang + input_hash + env_hash)
   ```

   环境、输入数据集、代码任意一项变更，code_hash 必然改变，保证复现环境层可信。

2. docs/05-PROVENANCE.md §2.1 固定随机种子：执行前置统一注入 SEED 常量（入参 seed 为空则默认 42），同步设置 PYTHONHASHSEED、random.seed、np.random.seed，torch 场景补充 torch.manual_seed；种子写入 runs.seed 字段，为复现一致性提供基础。

3. §1.3 执行捕获完整流程：固定种子注入 → Docker 沙箱执行 → 捕获 stdout / 图表 display_data / 数值结果 → 批量计算 env_hash/input_hash/output_hashes/code_hash → 写入 env_snapshots 与 runs 主表；artifacts / 血缘 edges 由 M5 登记。

### 实现步骤

模块根路径：backend/app/services/sandbox/

1. **Docker 镜像**：docker/sandbox.Dockerfile，基础镜像 python:3.11-slim，预装 numpy/pandas/scipy/matplotlib/statsmodels/scikit-learn/ipykernel；demo 简化：固定单镜像，不支持项目动态构建镜像。

2. **Kernel 管理 kernel.py**：基于 jupyter_client 实现持久内核管理

   python

   

   运行

   

   

   

   ```
   def get_or_create(conversation_id: str | None) -> KernelClient: ...
   
   def execute(kc, code: str, timeout=30) -> ExecResult:
       # 拼接种子前置代码+用户业务代码
       # 发送执行指令，监听iopub消息流
       # 聚合stdout、绘图display_data、数值返回结果
       # 超时触发内核中断，抛出TimeoutError
   ```

   容器启动约束：

   ```
   --network=none
   ```

   （默认禁用外网）、内存限制 512m、CPU 1 核、只读挂载数据集存储目录 storage/；demo 简化仅实现单容器多内核，多容器运维调度不实现。

3. **种子注入 seed.py**：生成标准化前置代码片段，统一设置各类随机库种子，返回可拼接代码字符串，SEED = seed or 42。

4. **哈希工具 hashing.py**：独立实现 env_hash/input_hash/code_hash 三个哈希函数，拼接顺序、序列化规则严格遵循 §1.2，禁止自定义实现。

5. **环境快照 env.py**：容器内执行 pip freeze 序列化 packages 列表，计算 env_hash；查询 env_snapshots 匹配存量，无匹配则插入新快照记录。

6. **执行编排 runner.py 核心函数 run_code**

   - 根据 dataset_ids 读取数据集 storage_hash，拼接计算 input_hash
   - 获取环境快照、注入固定种子代码
   - 内核执行并捕获全部输出与结构化产物
   - 统一计算 output_hashes/code_hash
   - 持久化 env_snapshots、runs 记录；图表文件写入 storage/<content_hash> 持久存储
   - 返回 RunResult 对象，交由 M5 完成产物与血缘登记

7. **自动重试封装 run_with_retry**：执行状态为 error 时捕获完整 traceback，最多重试 2 次；每次重试独立生成一条不可变 run 记录，完整报错文本透传给上层 M3 Agent。

8. **干净环境重放原语**：对外暴露 sandbox_run (code, inputs, seed, env)，无状态全新临时内核，按指定环境快照执行；专供 M5 复现引擎调用，独立于常驻 kernel 迭代链路。

9. **接口层 api/runs.py**：定义 POST /runs 路由；schemas/runs.py 编写请求、响应 Pydantic 模型；异步执行使用 FastAPI BackgroundTasks，不引入消息队列。

10. 依赖补充：requirements.txt 新增 jupyter_client、docker（Python SDK）

### demo 表现

分析对话页输入 Python 代码读取数据集做回归分析，执行后即时返回 stdout 与图表产物；连续发送绘图参数修改指令，内核变量持久保留无需重跑数据加载逻辑，实现多轮迭代绘图；返回 run_id 与 code_hash 作为 M5 溯源、复现唯一锚点。

### 验收 DoD（给定 → 操作 → 期望）

1. 常驻变量校验：同一 conversation_id，先执行`x=41`，再执行`print(x+1)` → stdout 输出 42，变量跨请求持久生效
2. 种子一致性校验：两段完全相同代码，传入相同 seed 执行两次，随机数值输出完全一致；runs 表 seed 字段正常落库
3. code_hash 环境绑定校验：代码、数据集完全一致，仅 packages 环境包版本变更 → 两次 code_hash 不相等；环境、代码、数据集全部一致则 code_hash 完全相同
4. 资源超时校验：死循环代码`while True: pass`，30s 内内核强制中断，run 记录 status=error，服务不崩溃，内核可接收后续请求
5. 网络隔离校验：执行`urllib.request.urlopen("http://example.com")`，抛出网络不可达异常，`--network=none`约束生效
6. 落库完整性校验：单次成功执行，runs 新增一条 status=success 记录，env_snapshots 存在对应 env_hash 行；POST /runs 响应完整返回 run_id/code_hash/stdout
7. 重试机制校验：首次执行报 NameError 的代码调用 run_with_retry，返回完整可阅读堆栈信息，每次重试单独生成一条 run 记录
8. 干净重放原语校验：调用 sandbox_run，全新临时内核 + 指定环境快照执行相同代码，数值产物与常驻内核执行结果在容差内一致，可供 M5 复现调用