# 🔧 Server Integration Guide

## Step 1: Install Required Packages

```bash
cd server
npm install cloudinary multer multer-storage-cloudinary @types/multer
```

## Step 2: Register Routes in Main Server

Add to `server/src/server.ts` or your main app file:

```typescript
import systemRoutes from './modules/system/system.routes';
import suppliersRoutes from './modules/suppliers/suppliers.routes';
// products routes already registered

// Register routes
app.use('/api/system', systemRoutes);
app.use('/api/suppliers', suppliersRoutes);
// app.use('/api/products', productRoutes); // Already exists
```

## Step 3: Initialize Cloudinary

Add to your server startup (in `server.ts`):

```typescript
import { verifyCloudinaryConfig } from './config/cloudinary';

// After database connection
verifyCloudinaryConfig();
```

## Step 4: Update Environment Variables

Copy `.env.example` to `.env` and add your Cloudinary credentials:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Step 5: Add Permissions to Database

Add these permissions to your `seed_permissions.sql`:

```sql
-- System permissions
INSERT INTO ims.permissions (perm_key, perm_name, description, category) VALUES
('system.view', 'View System Info', 'Can view system information', 'System'),
('system.update', 'Update System Info', 'Can update system information and images', 'System');

-- Supplier permissions
INSERT INTO ims.permissions (perm_key, perm_name, description, category) VALUES
('suppliers.view', 'View Suppliers', 'Can view supplier list', 'Suppliers'),
('suppliers.create', 'Create Supplier', 'Can create new suppliers', 'Suppliers'),
('suppliers.update', 'Update Supplier', 'Can update supplier information', 'Suppliers'),
('suppliers.delete', 'Delete Supplier', 'Can delete suppliers', 'Suppliers');

-- Grant to Admin role
INSERT INTO ims.role_permissions (role_id, perm_id)
SELECT 
    (SELECT role_id FROM ims.roles WHERE role_name = 'Admin'),
    permission_id
FROM ims.permissions
WHERE perm_key LIKE 'system.%' OR perm_key LIKE 'suppliers.%';
```

## Step 6: Run Migration

The migration will run automatically when you start Docker:

```bash
docker-compose down
docker-compose up --build
```

Or manually run:

```bash
psql -U postgres -d erp_inventory -f server/sql/20260210_image_upload_tables.sql
```

## Step 7: Test Endpoints

### Get System Info
```bash
curl http://localhost:5000/api/system \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Upload Logo
```bash
curl -X POST http://localhost:5000/api/system/logo \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "logo=@/path/to/image.jpg"
```

### List Suppliers
```bash
curl http://localhost:5000/api/suppliers \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Complete File Structure

```
server/
├── src/
│   ├── config/
│   │   └── cloudinary.ts              ✅ NEW
│   ├── modules/
│   │   ├── system/                    ✅ NEW
│   │   │   ├── system.service.ts
│   │   │   ├── system.controller.ts
│   │   │   └── system.routes.ts
│   │   ├── suppliers/                 ✅ NEW
│   │   │   ├── suppliers.service.ts
│   │   │   ├── suppliers.controller.ts
│   │   │   └── suppliers.routes.ts
│   │   └── products/                  ✅ UPDATED
│   │       ├── products.service.ts    (added image support)
│   │       ├── products.controller.ts (added upload methods)
│   │       └── products.routes.ts     (added image routes)
│   └── server.ts                      ✅ UPDATE (register routes)
├── sql/
│   └── 20260210_image_upload_tables.sql ✅ NEW
└── .env.example                       ✅ UPDATED
```

## Verification Checklist

- [ ] Cloudinary credentials in `.env`
- [ ] Dependencies installed
- [ ] Routes registered in server
- [ ] Migration run successfully
- [ ] Permissions added to database
- [ ] Test upload works
- [ ] Images display in frontend

## Troubleshooting

### Multer Error: "Unexpected field"
- Check the field name in `formData.append()` matches the route
- System: `logo` or `banner`
- Products: `image`
- Suppliers: `logo`

### "Cloudinary credentials not configured"
- Verify all three env variables are set
- Restart Docker containers

### "Permission denied"
- Check user has the required permission
- Admin should have all permissions by default

### TypeScript Errors
```bash
npm install --save-dev @types/multer
```
