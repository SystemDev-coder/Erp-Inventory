/**
 * "Active branch" state for all three user tiers:
 * - Single-branch users: one branch, no switcher, nothing to select.
 * - Multi-branch (non-admin) users: must always have exactly one of their
 *   assigned branches selected — never "All Branches", never mixed data.
 * - Admins: can pick one branch, or null ("All Branches" combined view).
 */

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { authService, MyBranch } from '../services/auth.service';
import { getActiveBranchId, setActiveBranchId } from '../services/branchStore';

interface BranchContextType {
  isAdmin: boolean;
  primaryBranchId: number | null;
  branches: MyBranch[];
  activeBranchId: number | null;
  setActiveBranch: (branchId: number | null) => void;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

interface BranchProviderProps {
  children: ReactNode;
}

export function BranchProvider({ children }: BranchProviderProps) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [primaryBranchId, setPrimaryBranchId] = useState<number | null>(null);
  const [branches, setBranches] = useState<MyBranch[]>([]);
  const [activeBranchId, setActiveBranchIdState] = useState<number | null>(() => getActiveBranchId());

  useEffect(() => {
    if (!user) {
      setBranches([]);
      setIsAdmin(false);
      setPrimaryBranchId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await authService.getMyBranches();
      if (cancelled) return;
      if (!res.success || !res.data) return;

      const { isAdmin: admin, primaryBranchId: primary, branches: myBranches } = res.data;
      setBranches(myBranches);
      setIsAdmin(admin);
      setPrimaryBranchId(primary);

      setActiveBranchIdState((current) => {
        if (admin) {
          // Admin: keep a persisted selection only if it's still a valid branch, else "All Branches".
          if (current && myBranches.some((b) => b.branch_id === current)) {
            return current;
          }
          setActiveBranchId(null);
          return null;
        }
        // Non-admin: must always be one of their own branches, never null/mixed.
        if (current && myBranches.some((b) => b.branch_id === current)) {
          return current;
        }
        setActiveBranchId(primary);
        return primary;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.user_id]);

  const setActiveBranch = useCallback(
    (branchId: number | null) => {
      if (!isAdmin && branchId === null) return;
      setActiveBranchId(branchId);
      setActiveBranchIdState(branchId);
    },
    [isAdmin]
  );

  const value: BranchContextType = {
    isAdmin,
    primaryBranchId,
    branches,
    activeBranchId,
    setActiveBranch,
  };

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (context === undefined) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
}
