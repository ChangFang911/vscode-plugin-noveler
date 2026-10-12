# 打字音效文件

此目录包含 7 种内置音效，默认关闭。通过 `Noveler: 专注模式设置` 选择音效、音量或自定义文件。

| 文件 | 音效 |
|---|---|
| mechanical.wav | 机械键盘 |
| typewriter.wav | 打字机 |
| bubble.wav | 气泡 |
| pop.mp3 | 弹出 |
| click.wav | 点击 |
| click2.wav | 点击变体 2 |
| click3.wav | 点击变体 3 |

加载时优先查找 WAV，再查找 MP3。实际播放依赖系统播放器：macOS 使用 afplay，
Windows 使用 PowerShell Media.SoundPlayer，Linux 使用 aplay。不同平台支持的格式可能不同，
自定义音效优先使用短促的 WAV 文件，并在目标系统试听。

添加资源时检查许可证、控制文件大小，并同步此列表。保存文件时不触发打字音效。

## 音效资源要求

建议使用 50–200ms 的短音效，采样率 44100Hz，单文件尽量小于 50KB。
这些是资源制作建议，实际播放还需检查系统格式兼容性。

## 获取音效

可以从以下来源获取免费音效：

1. [Freesound](https://freesound.org/) - 搜索 "keyboard click", "typewriter", "bubble pop"
2. [Mixkit](https://mixkit.co/free-sound-effects/) - 免费音效库
3. [Zapsplat](https://www.zapsplat.com/) - 免费音效（需注册）
