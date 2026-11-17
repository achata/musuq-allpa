window.CampoMotion = Object.freeze({
  get reduced() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; },
  spring(body, target, omega, zeta, dt) {
    const delta = Math.min(Math.max(dt, 0), 1 / 30);
    body.v += (-omega * omega * (body.x - target) - 2 * zeta * omega * body.v) * delta;
    body.x += body.v * delta;
  }
});
