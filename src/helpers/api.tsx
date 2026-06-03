import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { toast } from "sonner";
import { clearStoredAuthState, hasRefreshToken, refreshAuthSession } from "@/utils/authSession";

export const baseURL =
  (import.meta.env.VITE_API_BASE as string | undefined) ||
  "https://www.warmchats.com/api";

const axiosApi = axios.create({
  baseURL: baseURL,
  // Auth tokens live in HttpOnly cookies; send them with every request.
  // Same-origin (VITE_API_BASE=/api) sends them automatically, but this also
  // covers a cross-origin API base.
  withCredentials: true,
});

// Endpoints where a 401 means "credentials are bad" (not "access token expired").
// Refreshing on these would loop or mask the real error.
const AUTH_ENDPOINTS_SKIP_REFRESH = [
  "/auth/login",
  "/auth/register",
  "/auth/google-login",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/confirm-email",
  "/auth/resend-confirmation",
  "/auth/accept-invite",
  "/auth/refresh",
  "/auth/logout",
];

type RetryConfig = InternalAxiosRequestConfig & { _retriedAfterRefresh?: boolean };

axiosApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const config = error.config as RetryConfig | undefined;

    if (status !== 401 || !config || typeof window === "undefined") {
      return Promise.reject(error);
    }

    const url = config.url || "";
    if (AUTH_ENDPOINTS_SKIP_REFRESH.some((p) => url.includes(p))) {
      clearStoredAuthState();
      return Promise.reject(error);
    }

    // Access token expired mid-session: try to rotate via the refresh cookie,
    // then replay the original request once. Axios uses XHR so it does NOT
    // hit the window.fetch interceptor in App.tsx - refresh must happen here.
    if (!config._retriedAfterRefresh && hasRefreshToken()) {
      config._retriedAfterRefresh = true;
      const refreshed = await refreshAuthSession(baseURL);
      if (refreshed) {
        return axiosApi.request(config);
      }
    }

    clearStoredAuthState();
    return Promise.reject(error);
  },
);

type AxiosLikeError = {
  response?: { data?: { message?: string; msg?: string } };
  message?: string;
};

const getErrorMessage = (error: unknown): string => {
  const e = error as AxiosLikeError;
  return (
    e?.response?.data?.message ||
    e?.response?.data?.msg ||
    e?.message ||
    "Something went wrong!"
  );
};

type ApiPayload = Record<string, unknown>;

const updateRequest = (url: string, data: ApiPayload) => {
  axiosApi.defaults.headers.common["Content-Type"] = "application/json";
  const variables = url.match(/:[a-zA-Z]+/g);
  if (variables?.length) {
    variables.forEach((variable) => {
      const key = variable.replace(":", "");
      url = url.replace(variable, String(data[key]));
      delete data[key];
    });
  }
  return { url, data };
};

export async function get(url: string, params = {}, config = {}) {
  const response = await axiosApi.get(url, { ...config, params });
  return response.data;
}

export async function post(
  url: string,
  data: ApiPayload,
  config = {},
  showAlert = true,
  isReturnError = false,
) {
  const { url: newUrl, data: newData } = updateRequest(url, data);
  try {
    const response = await axiosApi.post(newUrl, newData, { ...config });
    return { ...(response.data as Record<string, unknown>), success: true };
  } catch (error) {
    if (isReturnError) throw error;
    if (showAlert) toast.error(getErrorMessage(error));
  }
}

// async function postAxiosMultipart(url: string, data: any, config = {}) {
//   try {
//     const response = await axiosApi.post(url, data, {
//       ...config,
//       headers: { "Content-Type": "multipart/form-data" },
//     });
//     return { ...(response.data as Record<string, any>), success: true };
//   } catch (error) {
//     toast.error(getErrorMessage(error));
//   }
// }

// async function patchAxiosMultipart(
//   url: string,
//   data: any,
//   config = {},
// ) {
//   try {
//     const response = await axiosApi.patch(url, data, {
//       ...config,
//       headers: { "Content-Type": "multipart/form-data" },
//     });
//     return { ...(response.data as Record<string, any>), success: true };
//   } catch (error) {
//     toast.error(getErrorMessage(error));
//   }
// }

export async function patch(
  url: string,
  data: ApiPayload,
  config = {},
  isReturnError = false,
) {
  const { url: newUrl, data: newData } = updateRequest(url, data);
  try {
    const response = await axiosApi.patch(newUrl, newData, { ...config });
    return { ...(response.data as Record<string, unknown>), success: true };
  } catch (error) {
    if (isReturnError) throw error;
    toast.error(getErrorMessage(error));
  }
}

export async function put(
  url: string,
  data: ApiPayload,
  config = {},
  isReturnError = false,
) {
  const { url: newUrl, data: newData } = updateRequest(url, data);
  try {
    const response = await axiosApi.put(newUrl, newData, { ...config });
    return { ...(response.data as Record<string, unknown>), success: true };
  } catch (error) {
    if (isReturnError) throw error;
    toast.error(getErrorMessage(error));
  }
}

export async function del(url: string, config = {}, isReturnError = false) {
  try {
    const response = await axiosApi.delete(url, { ...config });
    return { ...(response.data as Record<string, unknown>), success: true };
  } catch (error) {
    if (isReturnError) throw error;
    toast.error(getErrorMessage(error));
  }
}