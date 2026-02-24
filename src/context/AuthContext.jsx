import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../services/api";

const AuthContext = createContext();
const USERNAME_KEY = "dinosocial_username";

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(api.hasSession());
  const [username, setUsername] = useState(() => localStorage.getItem(USERNAME_KEY) || "");
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    setLoading(true);

    try {
      const hasSession = await api.bootstrapAuth();
      if (!hasSession) {
        setIsAuthenticated(false);
        setUsername("");
        localStorage.removeItem(USERNAME_KEY);
        return false;
      }

      await api.getMe();
      setIsAuthenticated(true);
      return true;
    } catch {
      setIsAuthenticated(false);
      setUsername("");
      localStorage.removeItem(USERNAME_KEY);
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
      setUsername("");
      localStorage.removeItem(USERNAME_KEY);
    });

    return () => {
      api.setUnauthorizedHandler(null);
    };
  }, []);

  const login = async (username, password) => {
    await api.login({ username, password });
    setIsAuthenticated(true);
    setUsername(username);
    localStorage.setItem(USERNAME_KEY, username);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore server-side logout failures and force local logout.
    }
    setIsAuthenticated(false);
    setUsername("");
    localStorage.removeItem(USERNAME_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        username,
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
