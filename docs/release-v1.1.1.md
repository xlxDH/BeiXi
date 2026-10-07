# 被汐 v1.1.1

本次将中文名统一更新为“被汐”，同步页面标题、品牌文字、导出预览/水印/文件名及移动端应用显示名。重新打包 Windows、macOS Intel/Apple Silicon、Android 与未签名 iOS 工程。内部应用标识与本地存储键保持兼容。

包含腾讯中国大陆 + MapLibre/MapTiler 海外地图，自动/手动切换、默认 MapTiler 地点查询、WGS84 坐标与旧数据兼容、双地图高清导出和可拖动预览。蘑菇enter默认位置更新为海南三亚海南热带海洋学院附近参考点。

首次使用请点“地图服务设置”，填入自己的 MapTiler / 腾讯浏览器 Key；发布包不包含作者的任何地图凭据。

## Source code

- `BeiXi-v1.1.1-source-code.zip`：源码，含锁文件、桌面启动脚本和移动工程。GitHub 自动生成的 Source code zip/tar.gz 也可用。

## Windows 10/11

- `BeiXi-v1.1.1-windows10-11-x64.zip`：解压后双击 `Start-BeiXi.cmd`。内置 Node，无需安装开发环境；自动打开浏览器。保留命令窗口运行，关闭窗口停止服务。不注册开机启动。

## macOS

- `BeiXi-v1.1.1-macos-intel.tar.gz` / `BeiXi-v1.1.1-macos-apple-silicon.tar.gz`：macOS 13.5+，解压后双击 `Start-BeiXi.command`。未公证启动脚本可能需要右键“打开”；不要求关闭系统安全保护。

## Android APK

- `BeiXi-v1.1.1-android-test-signed.apk`：Android 7+，测试签名、非应用商店版；安装需允许浏览器/文件管理器安装未知应用。CI 每次构建可能使用不同测试证书，后续版本可能需要卸载重装，卸载会删除应用内数据。没有真机兼容性验证，地图和定位/分享权限以设备实际表现为准。

## iOS（未签名工程）

- `BeiXi-v1.1.1-ios-unsigned-project.zip`：这是 Xcode 工程，**不是可直接安装的 IPA**。由于尚无 Apple 签名账号，未提供 iOS 安装包。macOS + Xcode 26+ 打开 `ios/App/App.xcodeproj`，等待 Swift Package 依赖解析，选择自己的 Team 后构建签名。当前未在 Xcode 或真机验证。

## 校验及限制

`SHA256SUMS.txt` 提供附件校验值。桌面资源服务器仅监听 `127.0.0.1:41731`，地图仍需联网；数据只保存在对应浏览器/应用中，不同步。边界和校园位置是近似参考；自托管瓦片需自行配置资源、CORS 和署名。跨日期变更线的智能合并暂不支持。
