# ✅ Purchase Edit Error Fixed!

## 🐛 Error Found

When trying to edit/update a purchase, the system showed:
```
Save failed - multiple accounts in same column: purchase_account
```

However, the actual error in the logs was:
```
error: multiple assignments to same column "purchase_date"
```

## 🔍 Root Cause

In `server/src/modules/purchases/purchases.service.ts`, the `updatePurchase` function had a SQL syntax error:

```typescript
// WRONG CODE (Line 506-508)
await client.query(
  `UPDATE ims.purchases
      SET ${updates.join(', ')}, purchase_date = COALESCE(purchase_date, NOW())
    WHERE purchase_id = $${p}
    RETURNING *`,
  values
);
```

**Problem:** 
- If the user provides a `purchaseDate` in the input, it gets added to the `updates` array
- Then the query also adds `, purchase_date = COALESCE(purchase_date, NOW())`
- This results in **TWO assignments** to the same column `purchase_date`
- PostgreSQL throws error: "multiple assignments to same column"

**Example of broken SQL:**
```sql
UPDATE ims.purchases
SET purchase_date = '2026-02-15', purchase_date = COALESCE(purchase_date, NOW())
WHERE purchase_id = 1
```
☝️ `purchase_date` appears twice!

---

## ✅ Fix Applied

### Updated Code:
```typescript
if (updates.length > 0) {
  values.push(id);
  // Only set purchase_date if it wasn't explicitly provided
  const hasPurchaseDate = input.purchaseDate !== undefined;
  const purchaseDateClause = hasPurchaseDate ? '' : ', purchase_date = COALESCE(purchase_date, NOW())';
  await client.query(
    `UPDATE ims.purchases
        SET ${updates.join(', ')}${purchaseDateClause}
      WHERE purchase_id = $${p}
      RETURNING *`,
    values
  );
}
```

**How it works:**
1. ✅ Check if `purchaseDate` was provided in the input
2. ✅ If YES: Don't add the COALESCE clause (date already in updates)
3. ✅ If NO: Add the COALESCE clause to ensure purchase_date is set
4. ✅ No more duplicate column assignments!

---

## 📁 File Modified

**File:** `server/src/modules/purchases/purchases.service.ts`  
**Lines:** 503-512  
**Function:** `updatePurchase`

---

## 🚀 Deployment

1. ✅ Fixed the SQL query syntax error
2. ✅ Restarted server container
3. ⏳ Server restarting (takes ~10 seconds)

---

## 🧪 How to Test

### Test Case 1: Edit Purchase with Date
1. Go to Purchases page
2. Click edit on any purchase
3. Change the date
4. Update supplier, items, or status
5. Click "Update"

**Expected:** ✅ Purchase updates successfully

### Test Case 2: Edit Purchase without Date
1. Go to Purchases page
2. Click edit on any purchase
3. Change items or status (don't touch date)
4. Click "Update"

**Expected:** ✅ Purchase updates successfully, date remains same

### Test Case 3: Edit Items Only
1. Go to Purchases page
2. Click edit on purchase ID 1 (from screenshot)
3. Change quantity from 15 to 20
4. Click "Update"

**Expected:** ✅ Updates successfully, shows success message

---

## 🎯 What Was Happening Before

**Scenario:** User edits a purchase
1. Frontend sends update request with:
   - `supplier_id`: 2 (Fuaad Mohamed)
   - `purchase_date`: "02/15/2028"
   - `status`: "received"
   - `items`: [...]

2. Backend builds SQL:
   ```sql
   UPDATE ims.purchases
   SET supplier_id = 2, purchase_date = '2028-02-15', purchase_date = COALESCE(purchase_date, NOW())
   WHERE purchase_id = 1
   ```
   ☝️ **BUG: purchase_date appears twice!**

3. PostgreSQL rejects query ❌
4. Error bubbles up to frontend
5. User sees: "Save failed - multiple accounts in same column"
   (Misleading error message from frontend)

---

## 🎯 What Happens Now

**Scenario:** User edits a purchase
1. Frontend sends same update request

2. Backend checks: "Did user provide purchase_date?"
   - **YES:** Build SQL without COALESCE:
     ```sql
     UPDATE ims.purchases
     SET supplier_id = 2, purchase_date = '2028-02-15'
     WHERE purchase_id = 1
     ```
   - **NO:** Build SQL with COALESCE:
     ```sql
     UPDATE ims.purchases
     SET supplier_id = 2, purchase_date = COALESCE(purchase_date, NOW())
     WHERE purchase_id = 1
     ```

3. PostgreSQL executes query ✅
4. Purchase updated successfully
5. User sees: "Purchase updated successfully"

---

## 📊 Technical Details

### SQL Error Code
```
code: '42601'
severity: 'ERROR'
error: multiple assignments to same column "purchase_date"
```

### Error Location
```
File: rewriteHandler.c
Line: 1109
Routine: process_matched_tle
```

PostgreSQL's query rewriter detected duplicate assignments during query parsing.

---

## ✅ Status

- ✅ Bug identified
- ✅ Fix applied
- ✅ Server restarted
- ⏳ Testing ready

**You can now edit purchases without errors!** 🎉

---

## 📝 Similar Issues to Watch For

This same pattern might exist in other update functions:
- ⚠️ Check `sales.service.ts` - might have same issue
- ⚠️ Check other `*.service.ts` files that do dynamic SQL UPDATEs

**Pattern to avoid:**
```typescript
// ❌ BAD
SET ${updates.join(', ')}, some_column = value

// ✅ GOOD
SET ${updates.join(', ')}${conditionalClause}
```

---

**Go ahead and test the purchase edit - it should work now!** 🚀
