export function showToast(message, timeout = 2200) {
  const dock = document.querySelector(".bottom-dock");
  const dockHeight = dock ? dock.getBoundingClientRect().height : 64;
  const safeInset = window.visualViewport
    ? Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop)
    : 0;
  const bottomOffset = Math.max(20, Math.ceil(dockHeight + safeInset + 14));

  const el = document.createElement("div");
  el.className = "ns-toast";
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed",
    left: "50%",
    bottom: `${bottomOffset}px`,
    transform: "translateX(-50%)",
    background: "rgba(15, 17, 26, 0.96)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    padding: "10px 14px",
    zIndex: "3000"
  });
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), timeout);
}
