# Sales, Purchases & Returns — Simple Step-by-Step Guide

This guide explains how to use the system in **plain language**.  
No accounting background needed. Follow the steps and examples.

---

## Words you need to know

| Word | Simple meaning |
|------|----------------|
| **Sale** | You sell items to a **customer**. Stock goes **out**. |
| **Purchase** | You buy items from a **supplier**. Stock comes **in**. |
| **Paid / Cash** | Money was paid **now** (cash, bank, mobile money). |
| **Credit** | Money is **not paid now** — someone **owes** later. |
| **Partial** | Only **part** of the money was paid; the rest is still owed. |
| **Outstanding / Balance** | How much is **still owed**. |
| **Return** | Items go **back** (customer returns to you, or you return to supplier). |
| **Stock / Inventory** | How many items you have in the store. |
| **Refund** | You give **money back** (usually for cash sales). |
| **Balance Reduction** | You **reduce what the customer owes** (credit sale return). |
| **Payable Reduction** | You **reduce what you owe the supplier** (credit purchase return). |

---

# PART 1 — SALES (Selling to customers)

---

## 1.1 Paid sale (customer pays full amount now)

**When:** Customer pays everything at the time of sale.

### Example
- Item: **Shirt**
- Quantity: **2**
- Price: **$15 each**
- **Total: $30**
- Customer pays **$30 cash** now.

### What happens in the system

| What | Before | After sale |
|------|--------|------------|
| Your stock | 10 shirts | **8 shirts** (2 sold) |
| Customer owes you | $0 | **$0** (already paid) |
| Your cash/bank | — | **+$30** |

### Steps in the system
1. Go to **Sales** → **New Sale**
2. Select **Customer**
3. Add item, quantity, price
4. Choose **Paid / Cash** payment
5. Select **payment account** (cash or bank)
6. Save

---

## 1.2 Credit sale (customer pays later)

**When:** Customer takes items now but will pay later.

### Example
- Item: **Shirt**
- Quantity: **2**
- Price: **$15 each**
- **Total: $30**
- Customer pays **$0** now — will pay later.

### What happens in the system

| What | Before | After sale |
|------|--------|------------|
| Your stock | 10 shirts | **8 shirts** |
| Customer owes you | $0 | **$30** (outstanding) |
| Your cash/bank | — | **No change** |

### Steps in the system
1. Go to **Sales** → **New Sale**
2. Select **Customer**
3. Add items
4. Choose **Credit**
5. Save

---

## 1.3 Partial sale (customer pays some now, rest later)

**When:** Customer pays part now, owes the rest.

### Example
- **Total: $30**
- Customer pays **$10 now**
- Customer still owes **$20**

### What happens in the system

| What | After sale |
|------|------------|
| Stock | Reduced by items sold |
| Customer owes you | **$20** |
| Your cash/bank | **+$10** |

### Steps in the system
1. Create sale as **Credit** or **Partial**
2. Enter **paid amount** = $10
3. Select account for the $10
4. Save — remaining **$20** stays on customer balance

---

# PART 2 — SALES RETURNS (Customer brings items back)

Go to: **Returns** → **New Sales Return** (or edit/delete from the list)

**Important rule:** Enter the **real quantity** the customer brought back — not what was sold, unless they returned everything.

Under each item you see:
- **Sold** — how many were sold to this customer  
- **Returned** — how many already returned before  
- **Available** — how many can still be returned now  

---

## 2.1 Sales return after a CREDIT sale

**When:** Customer bought on credit and now brings items back.

**You usually do NOT tick “Refund via account”.**  
The system **reduces what the customer owes** (Balance Reduction).

### Example A — Full return (credit sale)

**Original credit sale:**
- 2 shirts × $15 = **$30**
- Customer owes **$30**

**Customer returns both shirts:**

| Step | Action |
|------|--------|
| 1 | Returns → New Sales Return |
| 2 | Select same **Customer** |
| 3 | Select **Shirt**, Qty = **2** |
| 4 | Subtotal = **$30**, Balance Reduction = **$30** |
| 5 | Leave **Refund via account** **unchecked** |
| 6 | Save |

**After return:**

| What | Result |
|------|--------|
| Stock | **+2 shirts** (back in store) |
| Customer owes | **$0** |
| Cash/bank | **No change** |

---

### Example B — Partial return (credit sale)

**Original:** Credit sale 2 shirts = **$30** owed  

**Customer returns only 1 shirt:**

| Step | Action |
|------|--------|
| 1 | New Sales Return |
| 2 | Customer + Shirt, Qty = **1** |
| 3 | Subtotal = **$15**, Balance Reduction = **$15** |
| 4 | Save |

**After return:**

| What | Result |
|------|--------|
| Stock | **+1 shirt** |
| Customer owes | **$15** (for the 1 shirt they kept) |
| Still available to return | **1** more shirt if they bring it later |

---

## 2.2 Sales return after a PAID (cash) sale

**When:** Customer already paid in full and now brings items back.

**You usually need to give money back** — use **Refund via account** (cash or bank).

### Example — Full return (paid sale)

**Original paid sale:**
- 2 shirts × $15 = **$30** — customer paid **$30 cash**

**Customer returns both shirts:**

| Step | Action |
|------|--------|
| 1 | New Sales Return |
| 2 | Select **Customer** |
| 3 | Shirt, Qty = **2**, Subtotal = **$30** |
| 4 | Tick **Refund via account** |
| 5 | Select **Cash** or **Bank** account |
| 6 | Save |

**After return:**

| What | Result |
|------|--------|
| Stock | **+2 shirts** |
| Customer owes | **$0** |
| Your cash/bank | **−$30** (money returned to customer) |

---

### Example — Paid sale but customer had other credit balance

If customer **already owes you money** from other credit sales, and that balance is **big enough**, the system may reduce their balance instead of cash refund. The form shows **Customer Outstanding** and **Balance Reduction** to guide you.

**Simple rule:**
- Customer **paid cash** for **this** sale → refund from **account**
- Customer **bought on credit** → reduce **balance**, no cash refund

---

## 2.3 Edit a sales return

**When:** Return was real but **wrong details** (wrong quantity, wrong note).

**Do NOT delete** if something was actually returned — **edit** instead.

### Example — Recorded 2, only 1 was returned (credit sale)

| Step | Action |
|------|--------|
| 1 | Returns → find **SR-00013** → **Edit** |
| 2 | Keep same **Customer** |
| 3 | Change **Qty** from **2** to **1** |
| 4 | Check Subtotal = **$15**, Balance Reduction = **$15** |
| 5 | Save |

**What the system fixes:**
- Stock corrected (removes 1 extra shirt that was wrongly added)
- Customer balance corrected (they owe $15 again instead of $0)
- **1 shirt** still available to return later

### On the edit form

| Field | What to do |
|-------|------------|
| Customer | Usually **do not change** |
| Qty | Enter **actual** returned quantity |
| Refund via account | **Off** for credit returns |
| Reload | Click if you want to undo changes and start over |

---

## 2.4 Delete a sales return

**When:** Return was **never real** — entered by mistake, customer did not return anything.

| Step | Action |
|------|--------|
| 1 | Returns → Sales Returns list |
| 2 | Click **Delete** on the return |
| 3 | Type a **reason** (required), e.g. *"Mistake — no items returned"* |
| 4 | Confirm |

**What the system undoes (as if return never happened):**

| Credit sale return deleted | Paid sale return deleted |
|----------------------------|--------------------------|
| Stock goes **down** again (items no longer “returned”) | Same — stock corrected |
| Customer **owes more** again (balance restored) | Customer balance restored if it was reduced |
| No cash change | **Refund reversed** — money back in your account |

### Edit vs Delete — quick choice

| Situation | Do this |
|-----------|---------|
| Nothing was returned | **Delete** |
| Something returned, wrong qty | **Edit** qty |
| Return is correct | **Keep it** |

---

# PART 3 — PURCHASES (Buying from suppliers)

---

## 3.1 Paid purchase (you pay supplier now)

**When:** You pay the supplier in full when receiving goods.

### Example
- Item: **Box of pens**
- Quantity: **5**
- Cost: **$4 each**
- **Total: $20**
- You pay **$20** now from bank.

### What happens

| What | After purchase |
|------|----------------|
| Stock | **+5 boxes** |
| You owe supplier | **$0** |
| Your bank | **−$20** |

### Steps
1. **Purchases** → **New Purchase**
2. Select **Supplier**
3. Add items
4. Choose **Paid**
5. Select payment account
6. Save

---

## 3.2 Credit purchase (you pay supplier later)

**When:** You receive goods now, pay supplier later.

### Example
- 5 boxes × $4 = **$20**
- Pay **$0** now

### What happens

| What | After purchase |
|------|----------------|
| Stock | **+5 boxes** |
| You owe supplier | **$20** |
| Your bank | **No change** |

### Steps
1. **Purchases** → **New Purchase**
2. Select **Supplier**
3. Add items
4. Choose **Credit**
5. Save

---

## 3.3 Partial purchase (you pay some now, rest later)

### Example
- **Total: $20**
- You pay **$8** now
- You still owe **$12**

| What | After purchase |
|------|----------------|
| Stock | +items received |
| You owe supplier | **$12** |
| Your bank | **−$8** |

---

# PART 4 — PURCHASE RETURNS (You send items back to supplier)

Go to: **Returns** → **New Purchase Return**

**Important:** Purchase return **removes stock** (items leave your store and go back to supplier).

Under each item you see:
- **Purchased** — bought from this supplier  
- **Returned** — already sent back before  
- **On hand** — what you have in stock now  
- **Available** — how many you can return now  

You **cannot return more than you have in stock**.

---

## 4.1 Purchase return after a CREDIT purchase

**When:** You bought on credit and send items back to supplier.

**Usually do NOT tick “Refund via account”.**  
The system **reduces what you owe** (Payable Reduction).

### Example — Full return (credit purchase)

**Original credit purchase:**
- 5 boxes × $4 = **$20**
- You owe supplier **$20**

**You return all 5 boxes:**

| Step | Action |
|------|--------|
| 1 | Returns → New Purchase Return |
| 2 | Select **Supplier** |
| 3 | Box of pens, Qty = **5** |
| 4 | Subtotal = **$20**, Payable Reduction = **$20** |
| 5 | Leave **Refund via account** **unchecked** |
| 6 | Save |

**After return:**

| What | Result |
|------|--------|
| Stock | **−5 boxes** (sent back) |
| You owe supplier | **$0** |
| Your bank | **No change** |

---

### Example — Partial return (credit purchase)

**Original:** 5 boxes = **$20** owed  

**You return only 2 boxes:**

| Step | Action |
|------|--------|
| 1 | New Purchase Return |
| 2 | Supplier + item, Qty = **2** |
| 3 | Subtotal = **$8**, Payable Reduction = **$8** |
| 4 | Save |

**After return:**

| What | Result |
|------|--------|
| Stock | **−2 boxes** |
| You owe supplier | **$12** |
| Can return later | Up to **3** more (if still in stock) |

---

## 4.2 Purchase return after a PAID purchase

**When:** You already paid supplier and now get money back.

**Usually tick “Refund via account”** — supplier refunds to your cash/bank.

### Example

**Original paid purchase:** 5 boxes × $4 = **$20** — you paid **$20**

**You return all 5 boxes and supplier refunds you:**

| Step | Action |
|------|--------|
| 1 | New Purchase Return |
| 2 | Select **Supplier** |
| 3 | Qty = **5**, Subtotal = **$20** |
| 4 | Tick **Refund via account** |
| 5 | Select **Bank** or **Cash** |
| 6 | Save |

**After return:**

| What | Result |
|------|--------|
| Stock | **−5 boxes** |
| You owe supplier | **$0** |
| Your bank | **+$20** (money back from supplier) |

---

## 4.3 Edit a purchase return

**When:** Return was real but quantity or details are wrong.

### Example — Recorded 5, only 2 sent back (credit purchase)

| Step | Action |
|------|--------|
| 1 | Returns → Purchase Returns → **Edit** (e.g. PR-00005) |
| 2 | Keep same **Supplier** |
| 3 | Change **Qty** from **5** to **2** |
| 4 | Check Subtotal and Payable Reduction |
| 5 | Save |

**What the system fixes:**
- Stock corrected (adds back 3 boxes that were wrongly removed)
- Supplier balance corrected (you owe more again)
- Remaining qty can be returned later if needed

**Note on edit:** When editing, **Available** includes quantity already on this return, so you can change qty without errors.

---

## 4.4 Delete a purchase return

**When:** Return was **never real** — mistake entry, nothing sent to supplier.

| Step | Action |
|------|--------|
| 1 | Returns → Purchase Returns |
| 2 | Click **Delete** |
| 3 | Enter **reason**, e.g. *"Wrong entry — goods not returned"* |
| 4 | Confirm |

**What the system undoes:**

| Credit purchase return deleted | Paid purchase return deleted |
|--------------------------------|------------------------------|
| Stock **increases** (items back in store) | Same |
| You **owe supplier more** again | Same |
| No bank change | **Refund reversed** from your account |

---

# PART 5 — BIG PICTURE (Side by side)

## Sales vs Purchase

| | **Sales** | **Purchase** |
|---|-----------|--------------|
| Who | **Customer** buys from you | You buy from **Supplier** |
| Stock | Goes **out** ↓ | Comes **in** ↑ |
| Credit means | Customer **owes you** | You **owe supplier** |
| Return direction | Customer → **you** (stock **in** ↑) | You → **supplier** (stock **out** ↓) |
| Return on credit | **Balance Reduction** | **Payable Reduction** |
| Return on paid | **Refund** from your account | **Refund** to your account |

---

## Credit vs Paid — returns summary

### Sales return

| Original sale type | What return does | Refund via account? |
|--------------------|--------------------|---------------------|
| **Credit** | Lowers what customer owes | Usually **NO** |
| **Paid (cash)** | Money back to customer | Usually **YES** |
| **Partial** | Mix: reduce balance and/or refund | Follow what the form shows |

### Purchase return

| Original purchase type | What return does | Refund via account? |
|------------------------|------------------|---------------------|
| **Credit** | Lowers what you owe supplier | Usually **NO** |
| **Paid (cash)** | Money back to you | Usually **YES** |
| **Partial** | Mix: reduce payable and/or refund | Follow what the form shows |

---

## Edit vs Delete — both sales and purchase

| Situation | Action |
|-----------|--------|
| Entry was a **mistake**, nothing returned/sent | **Delete** + give reason |
| Return **happened** but **wrong quantity** | **Edit** quantity |
| Return **happened** and is **correct** | Do nothing |
| Wrong customer/supplier on a **real** return | Edit carefully or delete and re-enter correctly |

---

# PART 6 — COMMON MISTAKES (Avoid these)

1. **Returning more qty than customer/supplier actually returned**  
   → Always enter **physical** quantity.

2. **Using Refund via account on a credit return**  
   → Usually wrong — use balance/payable reduction instead.

3. **Deleting when you should edit**  
   → If 1 item came back but you typed 2, **edit to 1** — don’t delete.

4. **Deleting when you should keep**  
   → Only delete if **nothing** was returned/sent.

5. **Changing customer/supplier on edit**  
   → Avoid — it clears items and can cause confusion.

6. **Ignoring “Available”**  
   → You cannot return more than **Available** (sold − already returned, and for purchases also limited by stock on hand).

---

# PART 7 — FULL STORY EXAMPLE (Credit sale → wrong return → fix)

### Step 1 — Credit sale
- Customer **Ali** buys **2** items × **$15** = **$30** on credit  
- Ali owes **$30**, stock −2  

### Step 2 — Wrong return (mistake: typed 2, only 1 came back)
- Return recorded: Qty **2**  
- Ali owes **$0**, stock +2  
- **Problem:** Ali still has 1 item; books show everything returned  

### Step 3 — Fix by EDIT (not delete)
- Edit return → change Qty **2 → 1**  
- Ali owes **$15**, stock +1 only  
- **1 item** still available to return if Ali brings it later  

### Alternative — If NO item was returned (pure mistake)
- **Delete** the return with reason  
- Ali owes **$30** again, stock as before return  

---

*Guide for ERP Inventory System — Sales, Purchases & Returns*
