import { API } from '../config/env';
import { apiClient } from './api';

export interface FixedAsset {
  asset_id: number;
  branch_id: number;
  asset_name: string;
  category: string;
  purchase_date: string;
  cost: number;
  useful_life_months: number;
  depreciation_method: string;
  status: string;
  notes: string | null;
  created_by: number | null;
  created_at: string;
}

export interface CreateFixedAssetInput {
  assetName: string;
  category: string;
  purchaseDate: string;
  cost: number;
}

const toQuery = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
};

export const assetsService = {
  async list(input?: { search?: string; status?: string; category?: string }) {
    const query = toQuery({
      search: input?.search,
      status: input?.status,
      category: input?.category,
    });
    return apiClient.get<{ assets: FixedAsset[] }>(`${API.ASSETS.LIST}${query}`);
  },

  async create(input: CreateFixedAssetInput) {
    return apiClient.post<{ asset: FixedAsset }>(API.ASSETS.LIST, input);
  },
};
