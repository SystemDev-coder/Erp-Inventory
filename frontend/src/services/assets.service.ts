import { API } from '../config/env';
import { apiClient } from './api';

export type AssetType = 'current' | 'fixed';
export type AssetState = 'active' | 'inactive' | 'disposed';

export interface Asset {
  asset_id: number;
  branch_id: number;
  asset_name: string;
  asset_type: AssetType;
  purchased_date: string;
  amount: number;
  state: AssetState;
  created_by: number | null;
  created_at: string;
}

export interface CreateAssetInput {
  assetName: string;
  type: AssetType;
  purchasedDate?: string;
  amount: number;
  state?: AssetState;
}

export interface UpdateAssetInput {
  assetName?: string;
  type?: AssetType;
  purchasedDate?: string;
  amount?: number;
  state?: AssetState;
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
  async list(input?: { search?: string; type?: AssetType; state?: string; fromDate?: string; toDate?: string }) {
    const query = toQuery({
      search: input?.search,
      type: input?.type,
      state: input?.state,
      fromDate: input?.fromDate,
      toDate: input?.toDate,
    });
    return apiClient.get<{ assets: Asset[] }>(`${API.ASSETS.LIST}${query}`);
  },

  async create(input: CreateAssetInput) {
    return apiClient.post<{ asset: Asset }>(API.ASSETS.LIST, input);
  },

  async update(id: number, input: UpdateAssetInput) {
    return apiClient.put<{ asset: Asset }>(API.ASSETS.ITEM(id), input);
  },

  async delete(id: number) {
    return apiClient.delete(API.ASSETS.ITEM(id));
  },
};

