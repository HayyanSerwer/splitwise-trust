// Balances are always derived, never stored: a stored balance and a stored
// ledger drift apart the first time a write half-fails, and then there is no
// way to tell which one is lying.

// Net position per person, in paise. Positive means the group owes them,
// negative means they owe the group. The values always sum to zero.
export function computeBalances(memberIds, expenses, settlements) {
  const net = new Map(memberIds.map((id) => [id, 0]));
  const add = (id, paise) => net.has(id) && net.set(id, net.get(id) + paise);

  for (const expense of expenses) {
    add(expense.payerId, expense.amountPaise);
    for (const share of expense.shares) add(share.userId, -share.amountPaise);
  }

  // Paying down a debt moves you toward zero from below; receiving moves the
  // creditor toward zero from above.
  for (const s of settlements) {
    add(s.fromUserId, s.amountPaise);
    add(s.toUserId, -s.amountPaise);
  }

  return net;
}

// Minimal set of transfers that clears every balance. Repeatedly settles the
// biggest debtor against the biggest creditor, which zeroes at least one
// person per transfer and so needs at most n-1 payments — rather than the
// n(n-1)/2 that paying each person back individually would take.
export function simplify(balances) {
  const debtors = [];
  const creditors = [];
  for (const [id, amount] of balances) {
    if (amount < 0) debtors.push({ id, amount: -amount });
    else if (amount > 0) creditors.push({ id, amount });
  }

  debtors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  creditors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const transfers = [];
  let d = 0;
  let c = 0;

  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].amount, creditors[c].amount);
    transfers.push({ fromUserId: debtors[d].id, toUserId: creditors[c].id, amountPaise: amount });
    debtors[d].amount -= amount;
    creditors[c].amount -= amount;
    if (debtors[d].amount === 0) d++;
    if (creditors[c].amount === 0) c++;
  }

  return transfers;
}
