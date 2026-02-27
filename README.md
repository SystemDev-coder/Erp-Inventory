# ERP Inventory

## Excel/CSV Import Feature

The system now supports bulk import for:

- Customers
- Suppliers
- Items

### UI Flow

Import is embedded in existing tabs:

- Customers tab -> `Upload Data`
- Suppliers tab -> `Upload Data`
- Items tab -> `Upload Data`

Each upload modal flow:

1. Upload file (`.xlsx` or `.csv`)
2. Check / Preview (parse + validate + skip detection)
3. Import valid rows
4. Review summary and download error report (`CSV` or `JSON`)

### Backend Endpoints

- `POST /api/import/customers`
- `POST /api/import/suppliers`
- `POST /api/import/items`

Request format:

- `multipart/form-data`
- file field: `file`
- mode field: `mode` (`preview` or `import`)

### Items Import Rules

- `branch_id` must not come from file; it is always taken from authenticated branch context.
- Expected columns (case-insensitive):  
  `store_id` (optional), `name` (required), `barcode`, `stock_alert`, `opening_balance`, `cost_price`, `sell_price`
- `is_active` is optional; when omitted, imported rows default to active (`true`).
- Unique conflicts in the same branch are treated as **skipped** rows (not fatal for the whole import):
  - duplicate item name
  - duplicate barcode

### Response Summary

Each import returns:

- `inserted_count`
- `failed_count`
- `skipped_count`
- `failed_rows` with row number + errors
- `skipped_rows` with row number + reason
- `preview_rows` for UI preview table

### Dependency

Install backend parser dependency in `server`:

```bash
npm install xlsx
```
