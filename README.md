# Web haptics field notes（移动网页触感实测笔记）

**English summary.** Field notes, a small dependency-free ES module and a phone test page for haptic feedback on the mobile web, from one round of device testing in November 2026.
On the iPhone tested (Safari) there is no `navigator.vibrate`, and every switch toggled from script was silent; only a real finger on a native `<input type="checkbox" switch>` ticked.
Ticks during a drag work with the finger-tracked switch technique documented by [haptick](https://github.com/jcruzfff/haptick): confirmed on a device with `touch-action: none`, not verified with `pan-y`.
On Android, `navigator.vibrate(ms)` worked, including in WeChat's in-app browser on a vivo X300 Ultra. Check the phone's own vibration setting first: with it off the call still returns `true` and nothing plays. 18 ms is what we use.
Also: hairline digits that lose their thin strokes on phone screens, with measured stroke widths.
Data: `data/devices.json`, `data/thin-strokes.json`. Module: `src/haptics.js`. Test page: `demo/` ([open it on a phone](https://shikaizhong-design.github.io/web-haptics-field-notes/demo/)). Device results from other phones are welcome as issues.

---

## 这是什么，给谁看

这是 2026 年 11 月一轮真机测试的记录：在手机网页里做触感反馈（haptics），哪些方式真的会震，哪些不会，以及踩过的坑。仓库里有：

- 这份笔记：结论和测试细节；
- `src/haptics.js` + `src/haptics.css`：无依赖的 ES 模块，Android 用 Vibration API，iPhone 用手指跟踪的原生 switch；
- `demo/`：一个在手机上打开的测试页，可以在自己的设备上重复这些测试；
- `data/`：机器可读的设备结果和字形笔画测量。

适合想给按钮、滑块、拨盘加触感的前端开发者，以及想知道自己手机上哪种方式有效的人。样本很小（iPhone、vivo X300 Ultra、Huawei P50），结论只代表这些设备。欢迎补充其他设备的结果，见文末。

## 一屏总结（what works where）

| 场景 | 做法 | 状态 |
|---|---|---|
| iOS 点按 | 手指点在真实的原生 switch 上（可见的，或透明地盖在内容上） | 真机确认 |
| iOS 点按 | 脚本切换 switch（`label.click()`、`input.click()`） | 不可行（测试机上无震感） |
| iOS | `navigator.vibrate` | 不可行（API 不存在） |
| iOS 拖动 | 手指跟踪的 switch，`touch-action: none` | 真机确认 |
| iOS 拖动 | 同上，`touch-action: pan-y` | 未验证 |
| Android | `navigator.vibrate(ms)` | 真机确认（vivo X300 Ultra；Huawei P50 能振但不清脆） |
| 应用内浏览器 | Android 微信内置浏览器里的 `navigator.vibrate` | 真机确认（vivo X300 Ultra） |
| 应用内浏览器 | iOS 应用内浏览器（如微信）里的拖动技术 | 未验证（没有单独测） |

## iPhone

iOS 没有 Vibration API：`navigator.vibrate` 是 `undefined`。

### 测试页结果（A–F）

测试机：一台 iPhone，Safari，当时最新的 iOS 版本，具体版本号没有记录。公开资料（[jcruzfff/haptick](https://github.com/jcruzfff/haptick) 和 [tijnjh/ios-haptics](https://github.com/tijnjh/ios-haptics) 的 README）称 Apple 在 iOS 26.5 屏蔽了脚本切换 switch 产生的触感；我们没有在不同 iOS 版本上对照验证这一点。

| 行 | 做法 | 结果 |
|---|---|---|
| A | 页面上可见的原生 `<input type="checkbox" switch>`，手指点 | 有震感 |
| B | 新建一个隐藏的 `<label>` + switch，在按钮的 click 处理函数里调用 `label.click()`，然后移除 | 无 |
| C | 常驻、放在屏幕外的 label + switch，由脚本 click | 无 |
| D | 隐藏的 switch，脚本调用 `input.click()` | 无 |
| F | 透明的真实 switch（`opacity: .01`）盖在一个数字上，手指点 | 有震感 |

字母沿用原测试页的编号，结果里没有 E 行。

结论：在这台手机上，只有"真实的手指点在真实的 switch 上"才会震，任何由脚本发起的切换都没有震感。haptick 的 README 也提到，大多数"iOS haptics"代码片段依赖的正是脚本点击。本模块所提取自的代码里有过这样一个隐藏 switch 的后备方案，本模块没有收录它。

### 拖动时连续震动：手指跟踪的 switch

这是 haptick 文档里描述的技术，本仓库的模块是同一思路的独立实现：

1. 一个透明的原生 switch 盖满整个控件，触摸必须从它上面开始。
2. WebKit 会在整个拖动过程中一直跟踪这次触摸。手指每越过 switch 的中线一次，拨钮就翻转一次，系统播放一次触感。比较的是手指和 switch **当前**所在的位置。
3. 所以要在拖动中途按需震一下，就把 switch 整个平移到手指的某一侧（我们用 `translateX(±10000px)`），选能让拨钮翻转的那一侧。下一次手指移动时，WebKit 发现手指已经"越过中线"，拨钮翻转，触感播放。
4. 没有要播的震动时，把 switch 停在让拨钮保持不动的那一侧，这样手指划过控件中间时不会意外震动。

拨钮在左边（off）时：

```
要震一下：switch 移到手指左边          [off |    ] . . . . . . ●手指     translateX(-10000px)
          下一次手指移动 → WebKit 认为手指在中线右侧 → 拨到 on → 一次触感

不要震：  switch 停到手指右边          ●手指 . . . . . . [off |    ]     translateX(+10000px)
          手指怎么动都在中线左侧 → 保持 off → 不响
```

拨钮在右边（on）时方向相反。

我们使用的数值（取自 haptick 文档给出的值）：

- 触摸开始后约 **260 ms** 内不移动 switch。WebKit 大约在触摸 200 ms 后才开始跟踪，提前移动会打乱跟踪。
- 两次震动之间至少隔 **2 次**手指移动事件。翻转发生在平移之后的那次移动上，紧接着再平移可能把它抵消。
- 没有要播的震动时，switch 停在保持拨钮不动的一侧（见上图）。

真机确认：一位测试者在 iPhone 上用一个横向数字拨盘确认过，switch 上设 `touch-action: none`，拖动时每一步震一次，单击也震一次。

### 代价和限制

- switch 接管了触摸，下面原生的滚动容器不会再滚动。控件要用 JS 根据 pointer 事件来移动：拖动时 1:1 跟手，松手后再吸附到位。
- 没有移动的触摸是一次点按，要把它转发出去：暂时把 switch 的 `pointer-events` 设为 `none`，用 `document.elementFromPoint()` 找到手指下面的元素。
- 触摸结束时 WebKit 会 click 这个 switch，要阻止这个 click 冒泡，否则上层会把它当成一次点击。
- 手指离开屏幕后就不能再震了，惯性滑动时没有触感。
- 触摸开始后约四分之一秒内的快速轻扫无法震动。
- `touch-action: pan-y`（我们在一个较大的图表上用它，让上下滑动仍然滚动页面）：代码在模拟环境中可以运行，但没有人在真机 iPhone 上确认过它会震。
- iOS 上的应用内浏览器（如微信）没有单独测试这个拖动技术。
- haptick 的 README 还提到：在触感元素上对 `touchstart` 调用 `preventDefault()` 会让 WebKit 在整个触摸期间停止跟踪 switch。我们没有单独验证这一点。

## Android

### 先查手机设置

"什么都没发生"时，第一件事是检查手机自己的振动 / 触感反馈设置。

在 vivo X300 Ultra 上，最初几轮测试完全没有振动，原因是手机的振动被关掉了（状态栏里有静音图标）。这种状态下 `navigator.vibrate()` 仍然返回 `true`。

在发现这一点之前得出的结论全部作废。特别是早先"6 ms 太短，播不出来"的判断，是在振动关闭时得出的，之后没有重测，所以 6 ms 应视为未测试。

### 脉冲长度

- `navigator.vibrate(ms)` 在 Chromium 内核的浏览器里可用；在 vivo X300 Ultra 的微信内置浏览器里也可用。
- 振动打开后，在 vivo X300 Ultra 上，18 ms、60 ms、400 ms 的单次脉冲和 `[80, 60, 80, 60, 80]` 模式都能播放。
- 18 ms 作为每一步的触感手感最好（"清脆"），这是我们使用的值。在 vivo 上，短于 18 ms 的长度在振动打开后没有重测。
- 网页只能设置脉冲长度，不能设置振幅或波形，所以除了时长没有别的可调。
- 浏览器在用户与页面交互之前会拒绝振动。调用前检查 `navigator.userActivation?.hasBeenActive`，这样程序自己移动控件时不会在控制台产生报错。
- 我们找到的网络资料里没有按设备给出的脉冲长度，只能在设备上实测。

### 设备表

| 手机 | 系统 | 浏览器 | 结果 |
|---|---|---|---|
| vivo X300 Ultra | Android（版本未记录） | 微信内置浏览器 | `navigator.vibrate(ms)` 可用 |
| vivo X300 Ultra | Android（版本未记录） | 未记录 | 振动关闭时什么都不播，调用仍返回 `true`。振动打开后 18 / 60 / 400 ms 和模式都能播放，18 ms 手感最好 |
| Huawei P50 | HarmonyOS（版本未记录） | 未记录 | 能振，但在试过的长度下都不像清脆的"咔哒"。测试者推测这台手机没有线性马达（没有对照规格确认）。没有别的可调，保持 18 ms |

同样的内容在 `data/devices.json` 里，未记录或未验证的字段为 `null`。

## 手机屏幕上的细笔画（Thin strokes on phone screens）

同一轮测试、同样的设备上发现的另一个问题：一种发丝线很细的展示用数字字形（Bodoni Moda，光学尺寸 opsz 96）在手机上丢了细笔画。vivo 上 18–20px 时，数字 4 和 7 看起来像 1；iPhone 在浅色字、深色底的主题下，即使是 84px，4 也丢了斜线和横线。

数字"4"在 84 CSS px 下的最细笔画（以 3 倍渲染后扫描，取斜线宽度和横线厚度中较小的一个，单位 CSS px）：

| 字体 | 最细笔画 |
|---|---|
| Bodoni Moda opsz 96 | 0.14 |
| Bodoni Moda opsz 28（wght 500） | 0.63 |
| Bodoni Moda opsz 11（wght 500 和 600） | 1.64 |
| Playfair Display 500 | 1.73 |
| DM Serif Display 400 | 2.70 |
| Noto Serif SC 500（数字） | 2.86 |
| Fraunces（opsz 72，wght 500，SOFT 50） | 3.80 |
| Libre Caslon Text 500 | 5.07 |

笔画随字号等比缩放：24px 时，opsz 11 的 Bodoni 最细笔画约 0.47px，Noto 约 0.82px，Caslon 约 1.45px。我们把 opsz 96 的字形换成了 DM Serif Display。

测量是在 macOS 上的 headless Chromium 里做的，不是在手机上。数据见 `data/thin-strokes.json`。

顺带一个 CSP 的坑：`default-src 'self'` 而没有 `font-src` 时，`data:` URL 形式的字体会被拦截。

## 使用模块

```html
<link rel="stylesheet" href="src/haptics.css">
<script type="module">
  import { tick, attachTapHaptics, attachDragHaptics, elementBelow, canVibrate } from './src/haptics.js';
</script>
```

导出：

- `canVibrate`、`usesSwitchHaptics`：特征检测（布尔值）。后者在没有 Vibration API、支持原生 switch（或 iOS 的 UA）、并且有触屏时为真。
- `tick(ms = 18)`：Android 振一次（也可以传模式数组），用户还没和页面交互过时不调用。其他环境什么都不做。返回 `navigator.vibrate` 的返回值，没调用时返回 `false`。这里没有 iOS 分支：脚本切换 switch 在测试机上没有震感（行 B、C、D）。
- `attachDragHaptics(surface, { touchAction = 'none' })`：iPhone 上返回 `{ input, tick(), destroy() }`，其他环境返回 `null`。
- `attachTapHaptics(element)`：iPhone 上返回 `{ input, destroy() }`，其他环境返回 `null`。
- `elementBelow(input, x, y)`：switch 下面 (x, y) 处的元素，用来转发点按。

### 点按目标

```js
const button = document.querySelector('#save');
attachTapHaptics(button); // iPhone：透明 switch 盖在按钮上，手指点按会震，然后把 click 转发给按钮
button.addEventListener('click', () => {
  tick(); // Android 振 18 ms；iPhone 上什么都不做
  save();
});
```

`attachTapHaptics` 本身没有在真机上验证过：真机确认的是拖动用的 switch 和一个被手指点按的透明 switch（行 F），这个辅助函数的转发逻辑只在模拟环境里跑过。在 iPhone 上按钮收到的是转发的 click（`isTrusted` 为 `false`）；上层 capture 阶段的 click 监听器会先看到 switch 自己的 click（目标带 `haptic-tap` 类）。

### 每一步震一次的拖动控件

```js
const dial = document.querySelector('.dial'); // 没有定位的话，模块会给它 position: relative
// 先 attach，再加自己的 pointermove 监听，这样移动中请求的 tick 会在同一次移动里放出。
const haptics = attachDragHaptics(dial); // iPhone：{ input, tick, destroy }；其他：null
const surface = haptics ? haptics.input : dial;
const pulse = () => (haptics ? haptics.tick() : tick());
const STEP = 28; // 每一步的像素
let drag = null;

surface.addEventListener('pointerdown', (event) => {
  drag = { id: event.pointerId, x: event.clientX, step: 0, moved: false };
});
addEventListener('pointermove', (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  if (Math.abs(dx) > 6) drag.moved = true;
  moveControlBy(dx); // 自己的 1:1 移动：iPhone 上 switch 接管了触摸，原生滚动不会动
  const step = Math.round(dx / STEP);
  if (step !== drag.step) {
    drag.step = step;
    pulse(); // 一步一震
  }
}, { capture: true, passive: true });
addEventListener('pointerup', (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  const { moved } = drag;
  drag = null;
  if (moved) settle(); // 松手后吸附到位（不会再震）
  // 没有移动的触摸是点按：iPhone 上转发给 switch 下面的元素
  else if (haptics) elementBelow(haptics.input, event.clientX, event.clientY)?.click();
}, { capture: true });
```

需要上下滑动仍然滚动页面时可以用 `attachDragHaptics(chart, { touchAction: 'pan-y' })`，但这个设置在真机 iPhone 上是否会震还没有确认。

### 只用 Android 振动

```js
import { canVibrate, tick } from './src/haptics.js';

if (canVibrate) slider.addEventListener('input', () => tick(18));
done.addEventListener('click', () => tick([80, 60, 80])); // 模式数组原样传给 navigator.vibrate
```

## 在自己的手机上跑测试页

在线测试页（用手机打开）：<https://shikaizhong-design.github.io/web-haptics-field-notes/demo/>

想自己部署的话：测试页是 `demo/index.html`，从 `../src/` 加载模块，所以静态服务器要从仓库根目录起：

- GitHub Pages：在仓库设置里开启 Pages（从 `main` 分支根目录发布），然后在手机上打开 `https://<用户名>.github.io/<仓库名>/demo/`。
- 本地：在仓库根目录运行 `python3 -m http.server 8000`，手机和电脑连同一个网络，打开 `http://<电脑的局域网地址>:8000/demo/`。

页面内容：

- iPhone 行 A、B、C、D、F（同上表），加一行用 `attachTapHaptics` 的按钮（T，未在真机验证）；
- 两个拖动板：P1 用 `touch-action: none`，P2 用 `touch-action: pan-y`（未在真机验证）。左右拖动，每 28px 一步；
- Android 行：18 ms、60 ms、400 ms 和 `[80, 60, 80, 60, 80]`；
- 一排脉冲长度按钮（4、6、8、10、12、15、18、22、28、35 ms）和一个拖动板，拖动时每 28px 用选中的长度振一次；
- 页面底部：UA、`typeof navigator.vibrate`、是否支持 `switch`，以及每次按下的返回值记录。

每一行都有"你的结果"下拉框（有震感 / 无 / 不确定）。试完后点"复制结果"，会得到一段包含环境信息、各行结果、选中的脉冲长度和记录的文本。

Android 上先确认手机的振动没有关；iPhone 上开始拖动的前四分之一秒和手指离开之后都不会震，这是预期行为。

## 未验证 / 待补充

- iPhone 上 `touch-action: pan-y` 的拖动 switch 是否会震。
- iOS 应用内浏览器（如微信）里的拖动技术。
- `attachTapHaptics` 的转发逻辑（只在模拟环境里跑过）。
- iPhone 的具体型号和 iOS 版本没有记录。"iOS 26.5 起脚本切换 switch 不再有触感"来自公开库的 README，我们没有在多个 iOS 版本上对照。
- 6 ms 以及其他短于 18 ms 的脉冲：在 vivo 上，手机振动打开后没有重测。
- Huawei P50 是否有线性马达（没有查规格），以及试过的具体长度（这份笔记里没有列出）。
- 两台 Android 手机的系统版本、浏览器（微信以外）没有记录。
- 字形笔画是在 macOS 的 headless Chromium 里测的，不是在手机上。

欢迎通过 issue 补充设备结果。请包含：

| 手机型号 | 系统版本 | 浏览器或应用内浏览器 | 哪些行有震感 | 偏好的脉冲长度 |
|---|---|---|---|---|

测试页"复制结果"得到的文本可以直接贴进去。

## 致谢

- [jcruzfff/haptick](https://github.com/jcruzfff/haptick)（MIT）：拖动时手指跟踪 switch 的技术，以及 260 ms、2 次移动、停放规则这些数值，都来自它的文档和源码。本仓库的模块是同一思路的独立实现，没有复制它的代码。
- [tijnjh/ios-haptics](https://github.com/tijnjh/ios-haptics)：更早的 switch 技巧（由脚本切换隐藏的 switch）。按它和 haptick 的 README，这种做法自 iOS 26.5 起不再有触感；在我们的测试机上也没有触感（行 B、C、D）。

## 许可证

MIT，见 [LICENSE](LICENSE)。
