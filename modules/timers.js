export function isNightModeActive(
  date = new Date(),
  bedtimeHour = 22,
  bedtimeMinute = 0,
  wakeHour = 6,
  wakeMinute = 30
) {
  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  const startMinutes = bedtimeHour * 60 + bedtimeMinute;
  const endMinutes = wakeHour * 60 + wakeMinute;

  if (startMinutes === endMinutes) {
    return false;
  }

  // Overnight range, e.g. 22:00 -> 06:30.
  if (startMinutes > endMinutes) {
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }

  // Same-day range fallback.
  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

export function getCountdownToBedtime(now = new Date(), bedtimeHour = 21, bedtimeMinute = 0) {
  const target = new Date(now);
  target.setHours(bedtimeHour, bedtimeMinute, 0, 0);
  if (now > target) target.setDate(target.getDate() + 1);

  const diff = target.getTime() - now.getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  return { hours, minutes, seconds };
}
