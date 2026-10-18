// 키 입력: 키보드 + 터치 오버레이. RGSS Input 코드 -> 비트마스크로 Ruby 에 전달한다.
const DOWN = 2, LEFT = 4, RIGHT = 6, UP = 8, A = 11, B = 12, C = 13, X = 14, Y = 15, Z = 16, L = 17, R = 18,
  SHIFT = 21, CTRL = 22, ALT = 23, F5 = 25, F6 = 26, F7 = 27, F8 = 28, F9 = 29;

const KEYMAP = {
  ArrowDown: [DOWN], ArrowLeft: [LEFT], ArrowRight: [RIGHT], ArrowUp: [UP],
  Numpad2: [DOWN], Numpad4: [LEFT], Numpad6: [RIGHT], Numpad8: [UP],
  ShiftLeft: [A, SHIFT], ShiftRight: [A, SHIFT],
  Escape: [B], KeyX: [B], Numpad0: [B],
  Space: [C], Enter: [C], KeyZ: [C], NumpadEnter: [C],
  KeyA: [X], KeyS: [Y], KeyD: [Z],
  KeyQ: [L], PageUp: [L], KeyW: [R], PageDown: [R],
  ControlLeft: [CTRL], ControlRight: [CTRL], AltLeft: [ALT], AltRight: [ALT],
  F5: [F5], F6: [F6], F7: [F7], F8: [F8], F9: [F9],
};

const held = new Map();   // 코드 -> 누르고 있는 입력원 수
const sources = new Map();// 입력원(키/터치 id) -> 코드 목록

function press(src, codes) {
  if (sources.has(src)) return;
  sources.set(src, codes);
  for (const c of codes) held.set(c, (held.get(c) || 0) + 1);
}
function release(src) {
  const codes = sources.get(src);
  if (!codes) return;
  sources.delete(src);
  for (const c of codes) { const n = (held.get(c) || 1) - 1; if (n > 0) held.set(c, n); else held.delete(c); }
}

export function keyMask() {
  let m = 0;
  for (const c of held.keys()) m += 2 ** c;
  return m;
}

export function initInput(onFirstGesture) {
  const gesture = () => onFirstGesture && onFirstGesture();
  addEventListener('keydown', (e) => {
    const codes = KEYMAP[e.code];
    gesture();
    if (!codes) return;
    e.preventDefault();
    press('k:' + e.code, codes);
  });
  addEventListener('keyup', (e) => { if (KEYMAP[e.code]) { e.preventDefault(); release('k:' + e.code); } });
  addEventListener('blur', () => { for (const s of [...sources.keys()]) release(s); });
  addEventListener('pointerdown', gesture, { passive: true });
}

// ---- 터치 오버레이 (D패드 + 버튼)
export function initTouchControls(root) {
  const dpad = root.querySelector('#dpad');
  const dirOf = (e) => {
    const r = dpad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const dead = r.width * 0.12;
    const codes = [];
    if (Math.abs(dx) > dead || Math.abs(dy) > dead) {
      // 8방향 -> 상하좌우 조합 (대각선 입력은 두 키를 함께 누른 것으로 취급)
      const ang = Math.atan2(dy, dx);
      const oct = Math.round(ang / (Math.PI / 4));
      const map = { 0: [RIGHT], 1: [RIGHT, DOWN], 2: [DOWN], 3: [LEFT, DOWN], [-3]: [LEFT, UP], [-2]: [UP], [-1]: [RIGHT, UP], 4: [LEFT], [-4]: [LEFT] };
      return map[oct] || [];
    }
    return codes;
  };
  const dpadActive = new Map();
  const setDir = (id, codes) => {
    release('t:' + id);
    if (codes.length) press('t:' + id, codes);
  };
  dpad.addEventListener('pointerdown', (e) => { e.preventDefault(); dpad.setPointerCapture(e.pointerId); dpadActive.set(e.pointerId, 1); setDir(e.pointerId, dirOf(e)); });
  dpad.addEventListener('pointermove', (e) => { if (dpadActive.has(e.pointerId)) setDir(e.pointerId, dirOf(e)); });
  const end = (e) => { dpadActive.delete(e.pointerId); release('t:' + e.pointerId); };
  dpad.addEventListener('pointerup', end);
  dpad.addEventListener('pointercancel', end);

  for (const b of root.querySelectorAll('[data-key]')) {
    const codes = b.dataset.key.split(',').map((n) => ({ A, B, C, X, Y, Z, L, R, SHIFT, CTRL }[n]));
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('on'); press('b:' + b.dataset.key + e.pointerId, codes); });
    const up = (e) => { b.classList.remove('on'); release('b:' + b.dataset.key + e.pointerId); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  }
}
