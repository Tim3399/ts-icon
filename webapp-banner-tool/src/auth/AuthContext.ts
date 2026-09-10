import { createContext, useContext } from "react";
export interface AuthContextType {
  authenticated: boolean;
  token: string | undefined;
  username: string | undefined;
  roles: string[];
  logout: () => void;
  getToken: () => Promise<string | undefined>;
}

export const AuthContext = createContext<AuthContextType>({
  authenticated: false,
  token: undefined,
  username: undefined,
  roles: [],
  logout: () => {},
  getToken: async () => undefined,
});

export const useAuth = () => useContext(AuthContext);
