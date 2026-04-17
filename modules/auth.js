export function isMasterPinValid(inputPin, state) {
  const masterPin = state?.settings?.masterPin ?? "4851";
  return String(inputPin) === String(masterPin);
}

export function requireMaster(state, inputPin) {
  return isMasterPinValid(inputPin, state);
}
