import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middlewares/requireAuth';
import { resolveBranchScope } from '../../utils/branchScope';
import { productsService } from './products.service';
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
    page: parsed.page,
    limit: parsed.limit,
  };
};

const normalizeCategoryBody = (body: any) => ({
  name: body?.name,
  description: body?.description,
  isActive: body?.isActive ?? body?.is_active,
  branchId: body?.branchId ?? body?.branch_id,
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

export const getProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const product = await productsService.getProduct(Number(req.params.id), scope);
  if (!product) throw ApiError.notFound('Product not found');
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
  await productsService.deleteProduct(Number(req.params.id), scope);
  return ApiResponse.success(res, null, 'Product deleted');
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

export const uploadProductImage = asyncHandler(async (_req: AuthRequest, _res: Response) => {
  throw ApiError.badRequest('Product image upload is not available for this schema');
});

export const deleteProductImage = asyncHandler(async (_req: AuthRequest, _res: Response) => {
  throw ApiError.badRequest('Product image delete is not available for this schema');
});
