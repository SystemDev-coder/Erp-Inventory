# 🚀 Cloudinary Setup - Quick Start (5 Minutes)

## ✅ Current Status

**✓ Database Tables Created:**
- system_information (logo + banner)
- products (with product_image_url)
- suppliers (with logo_url)
- image_uploads (tracking)

**✓ Backend Ready:**
- Cloudinary config (optional)
- Upload routes ready
- Auto image cleanup
- Error handling

**✓ Docker Running:**
- Database: ✅ Ready
- Server: ✅ Running on port 5000
- Frontend: ✅ Running on port 5173

---

## 🎯 To Enable Image Uploads (Optional)

### Step 1: Get Cloudinary Account (2 min)

1. **Sign up FREE**: https://cloudinary.com/users/register/free
2. **Go to Dashboard**: https://console.cloudinary.com/
3. **Copy these 3 values:**
   - Cloud Name
   - API Key
   - API Secret

### Step 2: Add Credentials to Docker (1 min)

Edit `server/.env.docker` and add your credentials:

```env
# Cloudinary Configuration (Image Upload)
CLOUDINARY_CLOUD_NAME=your_cloud_name_here
CLOUDINARY_API_KEY=your_api_key_here
CLOUDINARY_API_SECRET=your_api_secret_here
```

### Step 3: Restart Docker (2 min)

```bash
docker-compose down
docker-compose up
```

**✅ Done! Image uploads now work!**

---

## 📸 How to Use

### Upload Product Image

```typescript
import { imageService } from './services/image.service';

// Upload
const imageUrl = await imageService.uploadProductImage(productId, file);

// Delete
await imageService.deleteProductImage(productId);
```

### Upload System Logo

```typescript
// Upload logo
const logoUrl = await imageService.uploadSystemLogo(file);

// Upload banner
const bannerUrl = await imageService.uploadSystemBanner(file);
```

### Upload Supplier Logo

```typescript
const logoUrl = await imageService.uploadSupplierLogo(supplierId, file);
```

---

## 🎨 Using ImageUpload Component

```tsx
import { ImageUpload } from '../components/common/ImageUpload';
import { imageService } from '../services/image.service';

// In your component
<ImageUpload
  currentImage={product?.product_image_url}
  onUpload={(file) => imageService.uploadProductImage(product.id, file)}
  onDelete={() => imageService.deleteProductImage(product.id)}
  label="Product Image"
  aspectRatio="square"
  maxSizeMB={5}
/>
```

**Props:**
- `currentImage` - URL of current image (optional)
- `onUpload` - Function that uploads and returns URL
- `onDelete` - Function to delete image (optional)
- `label` - Label text
- `aspectRatio` - 'square' | 'landscape' | 'portrait'
- `maxSizeMB` - Max file size (default: 5)

---

## 🔌 API Endpoints

All endpoints require authentication and proper permissions.

### System
```
GET    /api/system              - Get system info
PUT    /api/system              - Update system info
POST   /api/system/logo         - Upload logo (multipart/form-data)
POST   /api/system/banner       - Upload banner (multipart/form-data)
DELETE /api/system/logo         - Delete logo
DELETE /api/system/banner       - Delete banner
```

### Products
```
POST   /api/products/:id/image  - Upload product image
DELETE /api/products/:id/image  - Delete product image
```

### Suppliers
```
GET    /api/suppliers           - List suppliers
POST   /api/suppliers           - Create supplier
PUT    /api/suppliers/:id       - Update supplier
DELETE /api/suppliers/:id       - Delete supplier
POST   /api/suppliers/:id/logo  - Upload logo
DELETE /api/suppliers/:id/logo  - Delete logo
```

---

## 🌍 Environment Variables (for Docker)

### Required for all developers:

**File: `server/.env.docker`**
```env
# Database (already configured)
PGHOST=db
PGPORT=5432
PGUSER=postgres
PGPASSWORD=123

# Cloudinary (add your credentials)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

### For local development (outside Docker):

**File: `server/.env`**
```env
# Database
PGHOST=localhost
PGPORT=5433
PGUSER=postgres
PGPASSWORD=123

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

---

## ⚠️ Important Notes

### Image Uploads are OPTIONAL
- ✅ Server works without Cloudinary
- ✅ Just shows warning if not configured
- ✅ Won't crash if credentials missing
- ✅ Each developer can use their own account

### Production Ready
- ✅ Automatic image optimization
- ✅ Old image cleanup (prevents bloat)
- ✅ Error handling
- ✅ File size validation (5MB max)
- ✅ File type validation
- ✅ Permission-based access

### Cloudinary Free Tier
- 25GB storage
- 25GB bandwidth/month
- 25,000 transformations/month
- **Perfect for development and small apps!**

---

## 🎓 For Team Members

### Option 1: Share One Cloudinary Account
**Pros:** Simple, one account
**Cons:** Shared credentials

1. Get credentials from team lead
2. Add to your `server/.env.docker`
3. Restart Docker

### Option 2: Each Member Uses Own Account
**Pros:** Independent, better for testing
**Cons:** Images won't sync between accounts

1. Sign up for FREE Cloudinary
2. Add your own credentials
3. Images upload to your account

### Option 3: Skip Image Uploads (Development)
**Pros:** No setup needed
**Cons:** Can't test image features

- Just leave Cloudinary vars empty
- Server works fine without it

---

## ✅ Verification

Check if Cloudinary is working:

```bash
# Server logs should show:
✓ Cloudinary configured successfully

# Or if not configured:
⚠️  Cloudinary credentials not configured. Image uploads will not work.
```

---

## 🎉 That's It!

**Your image upload system is ready!**

- Tables: ✅ Created
- Backend: ✅ Ready
- Frontend: ✅ Components available
- Docker: ✅ Configured
- Optional: ⚡ Add Cloudinary when needed

**No credentials? No problem! Server still works perfectly.**
