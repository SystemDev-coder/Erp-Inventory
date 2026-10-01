import { apiClient, ApiResponse } from './api';

export interface DeleteImpactEntry {
  table: string;
  label: string;
  count: number;
}

export interface DeleteImpactPreview {
  blocked: boolean;
  blockedBy: DeleteImpactEntry[];
  cascaded: DeleteImpactEntry[];
  preserved: DeleteImpactEntry[];
}

// Central Delete Architecture (Phase 2) "Impact Preview": call before showing
// a delete confirmation so the user sees what will be blocked/cascaded/left
// untouched. `moduleKey` matches trashService's module keys (e.g. 'stores',
// 'customers') - the same keys used by the Trash/Recycle Bin feature.
export const deletePreviewService = {
  async preview(moduleKey: string, id: number): Promise<ApiResponse<{ preview: DeleteImpactPreview }>> {
    return apiClient.get(`/api/trash/preview/${moduleKey}/${id}`);
  },
};
