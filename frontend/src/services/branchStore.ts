/**
 * In-memory (and localStorage) store for the admin's currently selected
 * "active branch" for viewing dashboard/lists/reports. Mirrors authStore.ts.
 */

const ACTIVE_BRANCH_KEY = 'erp_active_branch_id';

let memoryBranchId: number | null | undefined;

export function getActiveBranchId(): number | null {
  if (memoryBranchId !== undefined) return memoryBranchId;
  try {
    const stored = localStorage.getItem(ACTIVE_BRANCH_KEY);
    memoryBranchId = stored ? Number(stored) || null : null;
  } catch {
    memoryBranchId = null;
  }
  return memoryBranchId;
}

export function setActiveBranchId(branchId: number | null): void {
  memoryBranchId = branchId;
  try {
    if (branchId) {
      localStorage.setItem(ACTIVE_BRANCH_KEY, String(branchId));
    } else {
      localStorage.removeItem(ACTIVE_BRANCH_KEY);
    }
  } catch {
    // ignore
  }
}

export function clearActiveBranchId(): void {
  memoryBranchId = null;
  try {
    localStorage.removeItem(ACTIVE_BRANCH_KEY);
  } catch {
    // ignore
  }
}
