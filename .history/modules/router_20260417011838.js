const ROUTES = ["dashboard", "quests", "store", "shop", "arena", "honesty", "admin"];

export function isRouteValid(route) {
  return ROUTES.includes(route);
}

export function setActiveRoute(route) {
  if (!isRouteValid(route)) return;
  const normalizedRoute = route === "shop" ? "store" : route;
  document.querySelectorAll(".tab-content").forEach((node) => {
    node.classList.remove("active");
  });
  const target = document.getElementById(`tab-${normalizedRoute}`);
  if (target) target.classList.add("active");
}
