// Haptic ticks for the mobile web, as far as the device tests in ../README.md go.
//
// Android: the Vibration API. iPhone: there is no Vibration API, and on the iPhone we tested a switch toggled from
// script was silent; what ticks is a real finger on a native <input type="checkbox" switch>. attachTapHaptics and
// attachDragHaptics lay an invisible switch over a control for that. Everywhere else every call does nothing.
//
// The finger-tracked switch technique and its timing values are the ones documented by the MIT-licensed haptick
// library (https://github.com/jcruzfff/haptick). This file is a separate, smaller implementation of the same idea.

const nav = typeof navigator === 'undefined' ? null : navigator;

// Browsers that expose the Vibration API (among the phones we tested: the Android ones).
export const canVibrate = typeof nav?.vibrate === 'function';

// iPhone and iPad: no Vibration API, a native switch control (or an iOS user agent), and a touch screen.
export const usesSwitchHaptics = nav !== null && !canVibrate
  && typeof HTMLInputElement !== 'undefined'
  && ('switch' in HTMLInputElement.prototype || /iPad|iPhone|iPod/.test(nav.userAgent))
  && globalThis.matchMedia?.('(any-pointer: coarse)').matches === true;

// One Android tick of `ms` milliseconds (a pattern array is passed through to navigator.vibrate as well). 18 ms read
// as a crisp per-step tick on a vivo X300 Ultra with the phone's vibration switched on; shorter pulses were not
// re-tested there with vibration on. Returns what navigator.vibrate returned, or false when it was not called. `true`
// does not prove the phone vibrated: with the phone's vibration off it still returned true and nothing played.
//
// There is no iOS branch on purpose. Older snippets, and an earlier version of this code, toggled a hidden switch
// from script (label.click() or input.click()); on the iPhone we tested every such toggle was silent (test rows B, C
// and D), so iOS ticks come only from attachTapHaptics / attachDragHaptics under a real finger.
export function tick(ms = 18) {
  if (!canVibrate) return false;
  // Browsers refuse (and log) vibration before the reader has interacted with the page, e.g. when code moves a
  // control on load.
  if (nav.userActivation && !nav.userActivation.hasBeenActive) return false;
  try {
    return nav.vibrate(ms);
  } catch {
    return false;
  }
}

const ARM_MS = 260; // WebKit starts following a touch on a switch about 200 ms in; moving the switch sooner breaks it
const MOVE_GAP = 2; // finger moves between two ticks: a flip lands on the move after the jump, so jumping again on
// the very next move could undo it
const FAR = 10000; // px: far enough that the moved switch lies wholly on one side of any finger
const SLOP = 10; // px a finger may travel on a tap switch and still count as a tap (haptick's value)

function makeSwitch(host, className) {
  // The switch fills its host, so the host must be a containing block.
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;
  input.className = className;
  host.append(input);
  return input;
}

// What lies at (x, y) under a haptic switch: the switch stops taking pointer events for the hit test. Use it to pass
// on a tap that landed on the switch.
export function elementBelow(input, x, y) {
  const before = input.style.pointerEvents;
  input.style.pointerEvents = 'none';
  const hit = document.elementFromPoint(x, y);
  input.style.pointerEvents = before;
  return hit;
}

// Ticks while a finger drags across `surface`, on iPhone. An invisible switch covers the surface and must take the
// touch. WebKit follows that touch for the whole drag and plays the system haptic each time the finger crosses the
// switch's midline, comparing the finger with where the switch is now. So tick() moves the switch wholly to the side
// of the finger that makes its thumb flip, and the next finger movement plays the tick. Confirmed on an iPhone with
// touchAction 'none'; 'pan-y' (vertical swipes stay with the page) has not been confirmed on a device.
//
// Returns { input, tick(), destroy() }, or null where the technique does not apply (call tick() above instead).
// Attach before adding your own pointermove listener, so a tick() asked for during a move is released on that move.
// The switch takes the touches: a native scroller under it stops scrolling (move the control from pointer events),
// a touch that did not move is a tap to pass on (elementBelow), and nothing ticks after the finger lifts or during
// the first ARM_MS of the touch.
export function attachDragHaptics(surface, { touchAction = 'none' } = {}) {
  if (!usesSwitchHaptics) return null;
  const input = makeSwitch(surface, 'haptic-drag');
  input.style.touchAction = touchAction;
  let active = false;
  let on = false; // where the thumb is: off = left
  let armedAt = 0;
  let queued = false;
  let moves = Infinity;
  let parked = false;
  const place = (left) => { input.style.transform = `translateX(${left ? -FAR : FAR}px)`; };
  const release = () => {
    if (!queued || performance.now() < armedAt || moves < MOVE_GAP) return false;
    queued = false;
    moves = 0;
    parked = true;
    place(!on); // to the thumb's side: the finger is now past the midline, so the thumb flips on the next move
    on = !on;
    return true;
  };
  const listening = new AbortController();
  const { signal } = listening;
  input.addEventListener('pointerdown', () => {
    active = true;
    on = input.checked;
    armedAt = performance.now() + ARM_MS;
    queued = false;
    moves = Infinity;
    parked = false;
  }, { signal });
  // Window, capture phase: counts every move even if something below stops propagation.
  addEventListener('pointermove', () => {
    if (!active) return;
    moves += 1;
    if (release() || parked || performance.now() < armedAt) return;
    // Nothing to play: park the switch on the side that keeps the thumb where it is, so a finger crossing the
    // middle of the control does not tick by accident.
    parked = true;
    place(on);
  }, { capture: true, passive: true, signal });
  const end = () => {
    active = false;
    queued = false;
    input.style.transform = '';
  };
  addEventListener('pointerup', end, { capture: true, signal });
  addEventListener('pointercancel', end, { capture: true, signal });
  // WebKit clicks the switch when a touch on it ends; nothing above should read that as a tap.
  input.addEventListener('click', (event) => event.stopPropagation(), { signal });
  return {
    input,
    // One tick, played on the finger's next move. Asked again before then, it is still one tick.
    tick() {
      if (!active) return;
      queued = true;
      release();
    },
    destroy() {
      listening.abort();
      input.remove();
    },
  };
}

// Ticks on a real tap on iPhone: an invisible switch inside `element` takes the tap (a finger on a transparent real
// switch ticked on a device, test row F). The switch's own click is stopped and one click is dispatched to whatever
// lies under the finger inside `element`, so its listeners see one click and links and buttons still activate.
// Capture-phase click listeners above still see the switch's click first (its target has class haptic-tap). A touch
// that travels more than SLOP is a swipe: the switch is moved aside so it cannot flip, and nothing is clicked.
//
// Only the drag variant and a tapped overlay were confirmed on a device; this helper's forwarding logic was
// exercised only in emulation. Returns { input, destroy() }, or null where it does not apply; call tick() from the
// element's click handler as well, for Android.
export function attachTapHaptics(element) {
  if (!usesSwitchHaptics) return null;
  const input = makeSwitch(element, 'haptic-tap');
  const listening = new AbortController();
  const { signal } = listening;
  let touch = null;
  input.addEventListener('pointerdown', (event) => {
    input.style.transform = '';
    touch = { id: event.pointerId, x: event.clientX, y: event.clientY, swiped: false };
  }, { signal });
  addEventListener('pointermove', (event) => {
    if (!touch || touch.swiped || event.pointerId !== touch.id) return;
    if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) <= SLOP) return;
    touch.swiped = true;
    input.style.transform = `translateX(${input.checked ? -FAR : FAR}px)`; // keeps the thumb where it is
  }, { capture: true, passive: true, signal });
  const lift = (event) => {
    if (!touch || event.pointerId !== touch.id) return;
    if (event.type === 'pointercancel') touch.swiped = true; // the page took the touch to scroll
    input.style.transform = '';
  };
  addEventListener('pointerup', lift, { capture: true, signal });
  addEventListener('pointercancel', lift, { capture: true, signal });
  // WebKit clicks the switch when the touch ends, and also when a scroll ends it.
  input.addEventListener('click', (event) => {
    event.stopPropagation();
    const tap = touch;
    touch = null;
    if (tap?.swiped) {
      event.preventDefault(); // also undoes the toggle
      return;
    }
    const x = tap ? tap.x : event.clientX;
    const y = tap ? tap.y : event.clientY;
    const hit = elementBelow(input, x, y);
    const target = hit && element.contains(hit) ? hit : element;
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  }, { signal });
  return {
    input,
    destroy() {
      listening.abort();
      input.remove();
    },
  };
}
