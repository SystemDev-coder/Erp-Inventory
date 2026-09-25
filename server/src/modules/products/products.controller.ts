import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middlewares/requireAuth';
import { resolveBranchScope } from '../../utils/branchScope';
import { deleteCloudinaryImage, getUploadedImageUrl } from '../../config/cloudinary';
import { productsService } from './products.service';
import { settingsService } from '../settings/settings.service';
import { PRODUCT_ATTRIBUTE_CATALOG, isKnownAttributeKey } from '../../config/productAttributes';

const loadSheetJs = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('xlsx') as any;
  } catch (_error) {
    throw ApiError.internal('Excel export dependency is missing. Install xlsx, then restart server.');
  }
};
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  listQuerySchema,
  productCreateSchema,
  productUpdateSchema,
  taxCreateSchema,
  taxUpdateSchema,
  unitCreateSchema,
  unitUpdateSchema,
} from './products.schemas';
import { logAudit } from '../../utils/audit';

const listPayload = <T extends { rows: unknown[]; total: number; page: number; limit: number }>(
  key: string,
  result: T
) => ({
  [key]: result.rows,
  pagination: {
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 0,
  },
});

const parseListFilters = (query: Record<string, unknown>) => {
  const parsed = listQuerySchema.parse(query);
  return {
    search: parsed.search,
    categoryId: parsed.categoryId ?? parsed.category_id,
    unitId: parsed.unitId ?? parsed.unit_id,
    taxId: parsed.taxId ?? parsed.tax_id,
    storeId: parsed.storeId ?? parsed.store_id,
    branchId: parsed.branchId ?? parsed.branch_id,
    includeInactive: parsed.includeInactive,
    stockStatus: parsed.stockStatus,
    page: parsed.page,
    limit: parsed.limit,
    fromDate: parsed.fromDate,
    toDate: parsed.toDate,
  };
};

const normalizeCategoryBody = (body: any) => ({
  name: body?.name,
  description: body?.description,
  isActive: body?.isActive ?? body?.is_active,
  branchId: body?.branchId ?? body?.branch_id,
  attributeKeys: body?.attributeKeys ?? body?.attribute_keys,
});

const normalizeUnitBody = (body: any) => ({
  unitName: body?.unitName ?? body?.unit_name ?? body?.name,
  symbol: body?.symbol,
  isActive: body?.isActive ?? body?.is_active,
  branchId: body?.branchId ?? body?.branch_id,
});

const normalizeTaxBody = (body: any) => ({
  taxName: body?.taxName ?? body?.tax_name ?? body?.name,
  ratePercent: body?.ratePercent ?? body?.rate_percent ?? body?.rate,
  isInclusive: body?.isInclusive ?? body?.is_inclusive,
  isActive: body?.isActive ?? body?.is_active,
  branchId: body?.branchId ?? body?.branch_id,
});

const normalizeProductBody = (body: any) => ({
  name: body?.name,
  barcode: body?.barcode ?? body?.sku,
  storeId: body?.storeId ?? body?.store_id,
  categoryId: body?.categoryId ?? body?.category_id,
  unitId: body?.unitId ?? body?.unit_id,
  supplierId: body?.supplierId ?? body?.supplier_id,
  brand: body?.brand,
  size: body?.size,
  color: body?.color,
  genericName: body?.genericName ?? body?.generic_name,
  strength: body?.strength,
  serialNumber: body?.serialNumber ?? body?.serial_number,
  attributes: body?.attributes,
  quantity: body?.quantity,
  stockAlert: body?.stockAlert ?? body?.stock_alert,
  openingBalance: body?.openingBalance ?? body?.opening_balance,
  costPrice: body?.costPrice ?? body?.cost_price ?? body?.cost,
  sellPrice: body?.sellPrice ?? body?.sell_price ?? body?.price,
  status: body?.status,
  isActive: body?.isActive ?? body?.is_active,
  branchId: body?.branchId ?? body?.branch_id,
});

export const listProducts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const filters = parseListFilters(req.query as Record<string, unknown>);
  const result = await productsService.listProducts(scope, filters);
  return ApiResponse.success(res, listPayload('products', result));
});

// Phase 9: Excel export - columns always match the active Business
// Profile/Product Category/DataTable, because they're computed the same
// way for all three: the fixed product fields, plus whichever Dynamic
// Product Attributes catalog keys are actually assigned (via
// ims.categories.attribute_keys) to the categories present in the rows
// being exported.
export const exportProducts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const filters = parseListFilters(req.query as Record<string, unknown>);
  const XLSX = loadSheetJs();

  const result = await productsService.listProducts(scope, { ...filters, page: 1, limit: 5000 });
  const products = result.rows;

  const categoryIds = Array.from(
    new Set(products.map((p) => p.category_id).filter((id): id is number => Boolean(id)))
  );
  const categories = await productsService.getCategoriesByIds(categoryIds);
  const attributeKeySet = new Set<string>();
  for (const category of categories) {
    for (const key of category.attribute_keys || []) {
      if (isKnownAttributeKey(key)) attributeKeySet.add(key);
    }
  }
  const attributeKeys = Array.from(attributeKeySet);

  const rows = products.map((p) => {
    const row: Record<string, unknown> = {
      name: p.name,
      barcode: p.barcode || '',
      category: p.category_name || '',
      unit: p.unit_name || '',
      supplier: p.supplier_name || '',
      quantity: p.quantity ?? p.stock ?? 0,
      cost_price: p.cost_price,
      sell_price: p.sell_price,
      stock_alert: p.stock_alert,
      is_active: p.is_active ? 'active' : 'inactive',
    };
    for (const key of attributeKeys) {
      const def = PRODUCT_ATTRIBUTE_CATALOG[key];
      const value = def.column ? (p as unknown as Record<string, unknown>)[def.column] : (p.attributes || {})[key];
      row[def.label] = value ?? '';
    }
    return row;
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Products');

  const buffer: Buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const today = new Date().toISOString().slice(0, 10);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="products_${today}.xlsx"`);
  return res.status(200).send(buffer);
});

export const getProductsSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  const summary = await productsService.getProductsSummary(scope, branchId);
  return ApiResponse.success(res, { summary });
});

export const getProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const product = await productsService.getProduct(Number(req.params.id), scope);
  if (!product) throw ApiError.notFound('Product not found');
  return ApiResponse.success(res, { product });
});

export const getProductByBarcode = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const barcode = String(req.params.barcode || '').trim();
  if (!barcode) throw ApiError.badRequest('Barcode is required');
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  const product = await productsService.getProductByBarcode(barcode, scope, branchId);
  if (!product) throw ApiError.notFound('No product found for this barcode');
  return ApiResponse.success(res, { product });
});

export const createProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = productCreateSchema.parse(normalizeProductBody(req.body));
  const product = await productsService.createProduct(input, scope);
  return ApiResponse.created(res, { product }, 'Product created');
});

export const updateProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = productUpdateSchema.parse(normalizeProductBody(req.body));
  const product = await productsService.updateProduct(Number(req.params.id), input, scope);
  if (!product) throw ApiError.notFound('Product not found');
  return ApiResponse.success(res, { product }, 'Product updated');
});

export const deleteProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  // Phase 3 (Central Delete Architecture): deleteProduct now soft-deletes
  // (archives, restorable via Trash) rather than hard-deleting, so the
  // product's image must survive - deleting the Cloudinary asset here would
  // leave a restored product permanently broken.
  await productsService.deleteProduct(id, scope);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'delete',
    entity: 'items',
    entityId: id,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });

  return ApiResponse.success(res, null, 'Product deleted');
});

export const mergeProducts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const fromId = Number(req.params.id);
  const toId = Number(req.params.targetId);
  if (!fromId || !toId) throw ApiError.badRequest('Invalid item id');
  await productsService.mergeItems(fromId, toId, scope);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'merge',
    entity: 'items',
    entityId: fromId,
    newValue: { mergedInto: toId },
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });

  return ApiResponse.success(res, null, 'Products merged');
});

export const listCategories = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const filters = parseListFilters(req.query as Record<string, unknown>);
  const result = await productsService.listCategories(scope, filters);
  return ApiResponse.success(res, listPayload('categories', result));
});

export const createCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = categoryCreateSchema.parse(normalizeCategoryBody(req.body));
  const category = await productsService.createCategory(input, scope);
  return ApiResponse.created(res, { category }, 'Category created');
});

export const updateCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = categoryUpdateSchema.parse(normalizeCategoryBody(req.body));
  const category = await productsService.updateCategory(Number(req.params.id), input, scope);
  if (!category) throw ApiError.notFound('Category not found');
  return ApiResponse.success(res, { category }, 'Category updated');
});

// Phase 9: seeds the current Business Profile's starter categories (e.g.
// Electronics -> Mobile Phones/Laptops/TVs/...) on request. Additive and
// idempotent - safe to click more than once.
export const seedDefaultCategories = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const profile = await settingsService.getBusinessProfile();
  const businessType = profile.businessType || 'general';
  const branchId = req.body?.branchId ? Number(req.body.branchId) : undefined;
  const categories = await productsService.seedDefaultCategories(businessType, scope, branchId);
  return ApiResponse.success(res, { categories }, `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} seeded`);
});

export const deleteCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  await productsService.deleteCategory(Number(req.params.id), scope);
  return ApiResponse.success(res, null, 'Category deleted');
});

export const listUnits = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const filters = parseListFilters(req.query as Record<string, unknown>);
  const result = await productsService.listUnits(scope, filters);
  return ApiResponse.success(res, listPayload('units', result));
});

export const createUnit = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = unitCreateSchema.parse(normalizeUnitBody(req.body));
  const unit = await productsService.createUnit(input, scope);
  return ApiResponse.created(res, { unit }, 'Unit created');
});

export const updateUnit = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = unitUpdateSchema.parse(normalizeUnitBody(req.body));
  const unit = await productsService.updateUnit(Number(req.params.id), input, scope);
  if (!unit) throw ApiError.notFound('Unit not found');
  return ApiResponse.success(res, { unit }, 'Unit updated');
});

export const deleteUnit = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  await productsService.deleteUnit(Number(req.params.id), scope);
  return ApiResponse.success(res, null, 'Unit deleted');
});

export const listTaxes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const filters = parseListFilters(req.query as Record<string, unknown>);
  const result = await productsService.listTaxes(scope, filters);
  return ApiResponse.success(res, listPayload('taxes', result));
});

export const createTax = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = taxCreateSchema.parse(normalizeTaxBody(req.body));
  const tax = await productsService.createTax(input, scope);
  return ApiResponse.created(res, { tax }, 'Tax created');
});

export const updateTax = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = taxUpdateSchema.parse(normalizeTaxBody(req.body));
  const tax = await productsService.updateTax(Number(req.params.id), input, scope);
  if (!tax) throw ApiError.notFound('Tax not found');
  return ApiResponse.success(res, { tax }, 'Tax updated');
});

export const deleteTax = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  await productsService.deleteTax(Number(req.params.id), scope);
  return ApiResponse.success(res, null, 'Tax deleted');
});

export const uploadProductImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw ApiError.badRequest('No file uploaded');
  }
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  const existing = await productsService.getProduct(id, scope);
  if (!existing) throw ApiError.notFound('Product not found');

  const imageUrl = getUploadedImageUrl(req.file.path);
  if (existing.image_url) {
    await deleteCloudinaryImage(existing.image_url);
  }

  const product = await productsService.setProductImageUrl(id, imageUrl, scope);
  return ApiResponse.success(res, { product, imageUrl }, 'Image uploaded successfully');
});

export const deleteProductImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  const existing = await productsService.getProduct(id, scope);
  if (!existing) throw ApiError.notFound('Product not found');

  if (existing.image_url) {
    await deleteCloudinaryImage(existing.image_url);
  }
  const product = await productsService.setProductImageUrl(id, null, scope);
  return ApiResponse.success(res, { product }, 'Image deleted successfully');
});
