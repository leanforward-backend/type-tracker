/** One line describing what's left of `api.entitlements.me`, e.g. "7 AI uses left". */
export function aiUsesLabel(me) {
  if (!me) return "";
  const n = me.aiRemaining;
  if (me.monthlyLeft > 0 && me.packLeft === 0) return `${n} AI uses left this month`;
  return `${n} AI ${n === 1 ? "use" : "uses"} left`;
}
