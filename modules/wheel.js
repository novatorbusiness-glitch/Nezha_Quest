export function spinWheel(items = []) {
  if (!items.length) {
    return { index: -1, value: null, rotation: 0 };
  }
  const index = Math.floor(Math.random() * items.length);
  const rotation = Math.floor(Math.random() * 360) + 2880;
  return { index, value: items[index], rotation };
}
