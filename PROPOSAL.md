# MoonBit WebDAV 客户端与协议核心 · 项目申报书

## 一、项目名称

MoonBit WebDAV 客户端与协议核心

## 二、项目说明

MoonBit 实现请求构造、有界 XML、属性和锁信息；Node 22+ 提供 HTTP(S)、认证及流式传输。XML 拒绝 DTD/外部实体，不是通用完整 XML 实现。

## 三、方向与通用性

基础软件与网络协议。用于授权 WebDAV 服务的文件操作和协作锁；生态已有 CalDAV/iCalendar 相邻项目，不能由同名搜索未命中宣称协议生态空白。

## 四、应用场景

创建目录、stat 与条件写入；流式上传使用可重建的读取工厂，下载等待 completed；显式 lock/refreshLock/unlock 管理令牌，COPY/MOVE 按两端条件控制。

## 五、功能与验证边界

支持列明方法、Digest 变体与安全默认设置；WsgiDAV/Cheroot 的记录只证明特定版本及路径互通，不能扩展成 Nextcloud、NAS、所有认证或长期生产负载保证。

## 六、原创性与参考材料

原创代码 MIT。依据 RFC 4918/7616，参考 gowebdav（BSD-3-Clause，https://github.com/studio-b12/gowebdav）公开行为独立实现；WsgiDAV/Cheroot 仅为外部互通依赖，未复制其实现到生产源码。

## 七、仓库链接

https://github.com/liu-fang38/moonbit-webdav
