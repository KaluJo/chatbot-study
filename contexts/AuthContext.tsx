'use client'

import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { isDemoMode, DEMO_USER } from '@/lib/demo';

interface User {
  id: string;
  name: string;
  email?: string;
  isAdmin: boolean;
  role: 'admin' | 'user';
  accessCode: string; // Store the access code for potential re-authentication
  canGenerateSurveys: boolean;
  canUseSpeechPatterns: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (accessCode: string) => Promise<boolean>;
  logout: () => void;
  createUser: (name: string, email?: string, accessCode?: string) => Promise<{ success: boolean; message: string; generatedCode?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize authentication state from localStorage (or auto-login for demo mode)
  useEffect(() => {
    if (isDemoMode) {
      setUser(DEMO_USER);
      setIsLoading(false);
      return;
    }
    const storedUser = localStorage.getItem('value-graph-user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (err) {
        console.error('Error parsing stored user:', err);
        localStorage.removeItem('value-graph-user');
      }
    }
    setIsLoading(false);
  }, []);

  // Login with access code
  const login = async (accessCode: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      
      // Call the database function to get the user by access code
      const { data, error } = await supabase.rpc('get_user_by_access_code', {
        input_code: accessCode
      });

      if (error) throw new Error(error.message);
      
      if (!data || data.length === 0) {
        setError('Invalid access code. Please try again.');
        return false;
      }

      const userData = data[0];
      
      // Set the user context in the database session
      await supabase.rpc('set_user_context', {
        user_id: userData.id,
        is_admin: userData.is_admin
      });

      // Store the user in state
      const authenticatedUser: User = {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        isAdmin: userData.is_admin,
        role: userData.is_admin ? 'admin' : 'user',
        accessCode: accessCode,
        canGenerateSurveys: userData.can_generate_surveys ?? false,
        canUseSpeechPatterns: userData.can_use_speech_patterns ?? false,
      };

      setUser(authenticatedUser);
      
      // Store in localStorage for persistence
      localStorage.setItem('value-graph-user', JSON.stringify(authenticatedUser));
      
      return true;
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Logout
  const logout = () => {
    setUser(null);
    localStorage.removeItem('value-graph-user');
    
    // Reset database session
    try {
      const supabase = createClient();
      // Fire and forget - we don't need to await the result for logout
      supabase.rpc('set_user_context', {
        user_id: '00000000-0000-0000-0000-000000000000',
        is_admin: false
      });
      console.log('Logout: Session context reset requested');
    } catch (err) {
      console.error('Error creating Supabase client during logout:', err);
    }
  };

  // Create a new user (admin only)
  const createUser = async (name: string, email?: string, accessCode?: string): Promise<{ success: boolean; message: string; generatedCode?: string }> => {
    if (!user || !user.isAdmin) {
      return { success: false, message: 'Only admins can create users' };
    }

    try {
      const supabase = createClient();
      
      const { data, error } = await supabase.rpc('create_user', {
        admin_access_code: user.accessCode,
        new_user_name: name,
        new_user_email: email || null,
        new_user_access_code: accessCode || null
      });

      if (error) throw new Error(error.message);
      
      if (!data || !data[0].success) {
        return { 
          success: false, 
          message: data && data[0].message ? data[0].message : 'Failed to create user'
        };
      }

      return { 
        success: true, 
        message: 'User created successfully',
        generatedCode: data[0].user_access_code
      };
    } catch (err) {
      console.error('Error creating user:', err);
      return { 
        success: false, 
        message: err instanceof Error ? err.message : 'An unknown error occurred'
      };
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      error,
      login,
      logout,
      createUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}; 