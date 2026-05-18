import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import {
  clearStoredSession,
  getStoredSessionUser,
  getStoredToken,
  persistSession,
  type SessionUser,
} from '@/lib/storage';
import { loginRequest } from '@/services/auth';

type AuthState = {
  isAuthenticated: boolean;
  sessionUser: SessionUser;
  isBootstrapping: boolean;
};

const initialState: AuthState = {
  isAuthenticated: Boolean(getStoredToken()),
  sessionUser: getStoredSessionUser(),
  isBootstrapping: true,
};

export const bootstrapSession = createAsyncThunk(
  'auth/bootstrapSession',
  async () => {
    const token = getStoredToken();

    if (!token) {
      return null;
    }

    // Offline-first: keep the local session on startup and let later API calls
    // decide whether the token is still valid.
    return getStoredSessionUser();
  },
);

export const signIn = createAsyncThunk(
  'auth/signIn',
  async (
    payload: {
      username: string;
      password: string;
      category: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const result = await loginRequest(payload);
      const nextSessionUser = {
        username: result.user.displayName || result.user.username || payload.username,
        category: result.user.category || payload.category,
      };

      persistSession(result.accessToken, nextSessionUser);

      return nextSessionUser;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to sign in right now.',
      );
    }
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signOut(state) {
      clearStoredSession();
      state.isAuthenticated = false;
      state.sessionUser = { username: 'Administrator', category: 'FF28' };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapSession.fulfilled, (state, action) => {
        if (action.payload) {
          state.isAuthenticated = true;
          state.sessionUser = action.payload;
        } else {
          state.isAuthenticated = false;
        }
        state.isBootstrapping = false;
      })
      .addCase(bootstrapSession.rejected, (state) => {
        clearStoredSession();
        state.isAuthenticated = false;
        state.isBootstrapping = false;
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.isAuthenticated = true;
        state.sessionUser = action.payload;
      });
  },
});

export const { signOut } = authSlice.actions;
export const authReducer = authSlice.reducer;
