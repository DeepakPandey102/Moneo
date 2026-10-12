// Duplicate receipt / transaction detection.
//
// Scanning the same receipt twice is almost always a mistake, so Moneo keeps
// only one copy. Three levels of evidence, strongest first:
//
//   1. Same photo        → SHA-256 fingerprint of the image file matches.
//                          Caught BEFORE calling the AI, so no quota is wasted.
//   2. Same card payment → same card approval number (승인번호) and amount.
//   3. Same details      → same date + amount + merchant, and the same
//                          purchase time when both receipts show one.
//
// 1, 2 and "3 with matching time" are certain ("exact") and are blocked.
// "3 without a time" is "likely": blocked by default, but the user can say it
// was a genuinely separate purchase (e.g. two identical coffees that day).

// "(주)아성다이소 화성남양점" and "아성다이소화성남양점" → same key
export function normalizeMerchant(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\(주\)|㈜|주식회사|\(유\)|co\.?,?\s*ltd\.?|inc\.?/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function merchantsMatch(a, b) {
  const namesA = [a.merchant, a.merchantOriginal].map(normalizeMerchant).filter((n) => n.length >= 2);
  const namesB = [b.merchant, b.merchantOriginal].map(normalizeMerchant).filter((n) => n.length >= 2);
  // No merchant on one side (e.g. a quick manual entry): fall back to category.
  if (!namesA.length || !namesB.length) return Boolean(a.category) && a.category === b.category;
  return namesA.some((x) => namesB.some((y) => x === y || x.includes(y) || y.includes(x)));
}

// SHA-256 of the original image file, as hex. Returns null if the browser
// can't hash (very old browsers / non-HTTPS pages) — detection then relies
// on the receipt details instead.
export async function fileFingerprint(file) {
  try {
    if (!window.crypto?.subtle) return null;
    const hash = await window.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

// candidate: { type, amount, date, merchant, merchantOriginal, category,
//              receiptHash, receiptTime, approvalNo }
// Returns null, or { level: "exact" | "likely", reason, tx } for the first match.
export function findDuplicate(transactions, candidate, { ignoreId } = {}) {
  if (!candidate || !Array.isArray(transactions)) return null;
  const amount = Number(candidate.amount);
  let likely = null;

  for (const tx of transactions) {
    if (ignoreId && tx.id === ignoreId) continue;

    if (candidate.receiptHash && tx.receiptHash === candidate.receiptHash) {
      return { level: "exact", reason: "photo", tx };
    }

    const sameAmount = Number(tx.amount) === amount;
    if (candidate.approvalNo && tx.approvalNo === candidate.approvalNo && sameAmount) {
      return { level: "exact", reason: "approval", tx };
    }

    if ((tx.type || "expense") !== (candidate.type || "expense")) continue;
    if (tx.date !== candidate.date || !sameAmount) continue;
    if (!merchantsMatch(tx, candidate)) continue;

    // Both receipts are card payments with different approval numbers →
    // two real purchases, not a duplicate.
    if (candidate.approvalNo && tx.approvalNo && candidate.approvalNo !== tx.approvalNo) continue;

    if (candidate.receiptTime && tx.receiptTime) {
      if (candidate.receiptTime === tx.receiptTime) return { level: "exact", reason: "details", tx };
      continue; // same store, same amount, different time → separate purchases
    }
    if (!likely) likely = { level: "likely", reason: "details", tx };
  }
  return likely;
}
