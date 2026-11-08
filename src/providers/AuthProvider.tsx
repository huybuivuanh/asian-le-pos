import { onAuthStateChanged, signOut, User } from "firebase/auth";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getBusinessId, loadSavedBusiness, setBusiness } from "../lib/business";
import { auth } from "../lib/firebaseConfig";
import { loadCachedCustomers, useCustomersStore } from "../stores/useCustomersStore";
import { loadCachedMenu, useMenuStore } from "../stores/useMenuStore";
import { loadCachedStaff, useStaffStore } from "../stores/useStaffStore";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  /** Why the last sign-in was refused (no POS access), or null. */
  accessError: string | null;
  logout: () => Promise<void>;
};

export const useAuth = () => useContext(AuthContext);

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  accessError: null,
  logout: async () => {},
});

// Who can use the POS: staff and admins (custom claim `role`). Customers have no role.
const POS_ROLES = ["staff", "admin"];

type Access = { ok: true; businessId: string } | { ok: false; message: string };

async function checkAccess(user: User): Promise<Access> {
  try {
    const { claims } = await user.getIdTokenResult();
    const businessId = claims.businessId;
    if (
      typeof businessId === "string" &&
      businessId &&
      typeof claims.role === "string" &&
      POS_ROLES.includes(claims.role)
    ) {
      return { ok: true, businessId };
    }
    return {
      ok: false,
      message: "This account doesn't have POS access. Ask an admin to set it up.",
    };
  } catch {
    // Offline with an expired token: trust the business saved for this same account
    // on this device. The security rules check the real claims once online.
    const saved = await loadSavedBusiness();
    if (saved?.uid === user.uid) return { ok: true, businessId: saved.businessId };
    return {
      ok: false,
      message: "Couldn't check this account. Connect to the internet and try again.",
    };
  }
}

/** Swaps the startup caches (loaded for the previously saved business) for the new one. */
function reloadBusinessCaches() {
  useMenuStore.setState({ categories: [], menuItems: [], optionGroups: [], options: [], loading: true });
  useCustomersStore.setState({ customers: [] });
  useStaffStore.setState({ staff: [] });
  void loadCachedMenu();
  void loadCachedCustomers();
  void loadCachedStaff();
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    // Auth events can overlap (the access check is async); only the latest one counts.
    let latest = 0;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const run = ++latest;
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      const access = await checkAccess(firebaseUser);
      if (run !== latest) return;
      if (!access.ok) {
        setAccessError(access.message);
        await signOut(auth); // fires the listener again with null
        return;
      }

      const previous = getBusinessId();
      await setBusiness(firebaseUser.uid, access.businessId);
      if (run !== latest) return;
      if (previous !== access.businessId) reloadBusinessCaches();
      // Re-check the remote menu version for this business. Keeps cached menu data
      // so the UI doesn't blank out waiting for Firestore on startup.
      useMenuStore.getState().resetVersionCache();
      setAccessError(null);
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, accessError, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
