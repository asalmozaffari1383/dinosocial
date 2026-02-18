import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../services/api";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(api.hasSession());
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    setLoading(true);

    try {
      const hasSession = await api.bootstrapAuth();
      if (!hasSession) {
        setIsAuthenticated(false);
        return false;
      }

      await api.getMe();
      setIsAuthenticated(true);
      return true;
    } catch {
      setIsAuthenticated(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      setIsAuthenticated(false);
    });

    return () => {
      api.setUnauthorizedHandler(null);
    };
  }, []);

  const login = async (username, password) => {
    await api.login({ username, password });
    setIsAuthenticated(true);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore server-side logout failures and force local logout.
    }
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        login,
        logout,
        checkAuth,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
