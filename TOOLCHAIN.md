# 可复现的 MoonBit 工具链

CI读取根目录 .moonbit-version，通过官方安装器取得 0.10.14+7d59c7ec9 的编译器和标准库；不再随 latest 漂移。当前发行版的 moonc 为 v0.10.14+7d59c7ec9，moon/moonrun 为 0.1.20260920（914d7da）。这些版本号不相同是该发行版的正常组成，不应只用 moon 的日期猜下载版本。

Linux/macOS安装：

```sh
curl -fsSL https://cli.moonbitlang.com/install/unix.sh | bash -s -- "$(cat .moonbit-version)"
moon version --all
moon update
```

Windows安装器支持 MOONBIT_INSTALL_VERSION；也可以继续使用已验证的本地工具链。版本安装方式见 [MoonBit官方说明](https://www.moonbitlang.com/updates/page/5)。历史记录（2026-09-27）：当时核对官方Linux发行包并在WSL测试旧固定版本 0.10.12+1634b282e（moonc v0.10.12+1634b282e；moon/moonrun 0.1.20260904（94521db））。这只记录旧版本的本地安装，不代表当前 pin 或 GitHub runner 已执行。

CI先执行 `moon update` 初始化注册表及解析依赖，再进行fmt/info/check；不能依赖开发机已有的registry或.mooncakes缓存。

升级时先修改版本文件，在独立目录执行fmt/info/check和受影响测试，更新生成API与编译引擎，再一起提交。不要通过删除确定性检查掩盖版本引起的差异。Node/Python、操作系统和外部服务仍有各自环境范围；固定MoonBit不意味着所有依赖完全冻结。

当前本地验收（2026-09-28，严格检查）：固定 moonc 0.10.14+7d59c7ec9。本轮补齐派生方法显式声明及未使用导入，`moon check --deny-warn`、JS/Wasm-GC `moon test --deny-warn` 和 JS `moon build --deny-warn` 本地通过；CI 与 `verify.ps1` 已启用同样的严格参数。此前 `verify.ps1` 的 CLI/领域检查结果仍按原记录，本轮没有以编译检查代替全部宿主复测。GitHub Actions 远端运行和 Mooncakes 新版发布仍待确认。
