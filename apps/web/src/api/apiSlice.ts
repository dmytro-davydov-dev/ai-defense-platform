import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import type { RootState } from "../app/store";
import { loggedOut, selectCurrentToken } from "../features/auth/authSlice";
import type {
  AuditLogEntry,
  AuthResponse,
  CreateMissionRequest,
  CreateUploadUrlRequest,
  Detection,
  LoginRequest,
  Mission,
  RegisterRequest,
  SignedUrlResponse,
  TransitionMissionRequest,
  UpdateMissionMetadataRequest,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = selectCurrentToken(getState() as RootState);
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
    return headers;
  },
});

/**
 * REQ-6.7/6.8: a 401 anywhere means the token is missing/expired/invalid
 * — there's no refresh-token flow (stateless JWT, per
 * Security_Baseline.md), so the only recovery is a fresh login. Wrapping
 * `fetchBaseQuery` here means every endpoint below gets this for free,
 * instead of each caller checking `error.status` itself.
 */
const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status === 401) {
    api.dispatch(loggedOut());
  }
  return result;
};

/**
 * REQ-6.6: the RTK Query API layer — see types.ts's header comment for
 * why this is hand-written rather than `@rtk-query/codegen-openapi`
 * output in this sandbox. `apiSlice` is the single `createApi` instance
 * the whole app shares (RTK Query's recommended pattern), injected into
 * `app/store.ts`.
 */
export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Mission", "Detections", "AuditLog"],
  endpoints: (builder) => ({
    // --- Auth (REQ-6.7) ---
    login: builder.mutation<AuthResponse, LoginRequest>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
    }),
    register: builder.mutation<AuthResponse, RegisterRequest>({
      query: (body) => ({ url: "/auth/register", method: "POST", body }),
    }),

    // --- Missions (REQ-6.9/6.10) ---
    listMissions: builder.query<Mission[], void>({
      query: () => "/missions",
      providesTags: (result) =>
        result
          ? [
              ...result.map((mission) => ({
                type: "Mission" as const,
                id: mission.id,
              })),
              { type: "Mission" as const, id: "LIST" },
            ]
          : [{ type: "Mission" as const, id: "LIST" }],
    }),
    getMission: builder.query<Mission, string>({
      query: (id) => `/missions/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Mission", id }],
    }),
    createMission: builder.mutation<Mission, CreateMissionRequest>({
      query: (body) => ({ url: "/missions", method: "POST", body }),
      invalidatesTags: [{ type: "Mission", id: "LIST" }],
    }),
    updateMissionMetadata: builder.mutation<
      Mission,
      { id: string; body: UpdateMissionMetadataRequest }
    >({
      query: ({ id, body }) => ({
        url: `/missions/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: "Mission", id }],
    }),
    transitionMission: builder.mutation<Mission, { id: string; body: TransitionMissionRequest }>({
      query: ({ id, body }) => ({
        url: `/missions/${id}/transition`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "Mission", id },
        { type: "AuditLog", id },
      ],
    }),
    createMissionUploadUrl: builder.mutation<
      SignedUrlResponse,
      { id: string; body: CreateUploadUrlRequest }
    >({
      query: ({ id, body }) => ({
        url: `/missions/${id}/upload-url`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: "Mission", id }],
    }),

    // --- Detections (REQ-6.2/6.13/6.15) ---
    listDetections: builder.query<Detection[], string>({
      query: (missionId) => `/missions/${missionId}/detections`,
      providesTags: (_result, _error, missionId) => [{ type: "Detections", id: missionId }],
    }),

    // --- Audit trail (REQ-6.3/6.16) ---
    listAuditLog: builder.query<AuditLogEntry[], string>({
      query: (missionId) => `/missions/${missionId}/audit-log`,
      providesTags: (_result, _error, missionId) => [{ type: "AuditLog", id: missionId }],
    }),

    // --- Storage (REQ-6.4 — already existed, generic download URL) ---
    getDownloadUrl: builder.query<SignedUrlResponse, string>({
      query: (objectKey) => `/storage/download-url?objectKey=${encodeURIComponent(objectKey)}`,
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useListMissionsQuery,
  useGetMissionQuery,
  useCreateMissionMutation,
  useUpdateMissionMetadataMutation,
  useTransitionMissionMutation,
  useCreateMissionUploadUrlMutation,
  useListDetectionsQuery,
  useListAuditLogQuery,
  useLazyGetDownloadUrlQuery,
} = apiSlice;
