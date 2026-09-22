# 读取远端资源的条件写入元数据

将通用远程文件操作接入应用，支持条件请求、锁刷新和流式传输，减少覆盖并发更新或一次性载入大文件的风险。

## 输入、操作、输出

离线合成 PROPFIND 响应；实际锁/流式上传的回环验证另列，本例不发网络请求。

最简运行：先按 README 构建，然后 `node examples/run-use-case.mjs`。它自动创建输出目录并执行下面命令。下列 `{out}` 是运行器替换的实际目录，不是直接输入 shell 的变量；stdin 文件由运行器传递，以避免 Windows 与 POSIX 重定向差异。

```text
node tools/cli.mjs --file examples/use-case/multistatus.xml
```

观察：解析 href、42 字节长度、ETag v1；不把属性响应当作成功完成条件写入的证明。

每一步输出见实际目录下 `step-N.stdout.txt` / `step-N.stderr.txt`；本轮已保存回执见 `evidence/value-rework-20260922/use-case.json`。

## 为什么保留这个实现

需要互通通用 DAV 文件端点、条件写入与锁时评估；与日历 CalDAV 服务端不同，但协议版本完整性有限。

moon-ical 的 CalDAV 服务端已存在；本项目是通用 WebDAV authoring 客户端，文件锁/传输工作流不同于日历服务端。不称整个 DAV 生态空白。

## 不能由样例推出的结论

不提供完整 CalDAV/CardDAV 客户端或所有服务器扩展，兼容性以固定服务端和已测请求为限。

该样例是可修改的使用入口，不能证明存在真实用户、全部兼容或性能领先。继续投入的依据应是明确的输入或接入需求；若对接任务用既有成熟库即可完成，应优先复用而不是为保留参赛数量扩张本项目。
