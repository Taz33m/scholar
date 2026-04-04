import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canRequestStudentAccessMock,
  createSupabaseServerClientMock,
  provisionStudentAccessMock,
  signInWithOtpMock,
  signOutMock,
  supabaseClient,
  verifyOtpMock,
} = vi.hoisted(() => {
  const signInWithOtp = vi.fn();
  const verifyOtp = vi.fn();
  const signOut = vi.fn();
  const client = {
    auth: {
      signInWithOtp,
      signOut,
      verifyOtp,
    },
  };

  return {
    canRequestStudentAccessMock: vi.fn(),
    createSupabaseServerClientMock: vi.fn(async () => client),
    provisionStudentAccessMock: vi.fn(),
    signInWithOtpMock: signInWithOtp,
    signOutMock: signOut,
    supabaseClient: client,
    verifyOtpMock: verifyOtp,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/lib/student-access/provisioning", () => ({
  canRequestStudentAccess: canRequestStudentAccessMock,
  provisionStudentAccess: provisionStudentAccessMock,
}));

import { GET as callbackGet } from "@/app/auth/callback/route";
import { POST as requestLinkPost } from "@/app/auth/request-link/route";

describe("student auth routes", () => {
  beforeEach(() => {
    signInWithOtpMock.mockReset();
    signOutMock.mockReset();
    verifyOtpMock.mockReset();
    canRequestStudentAccessMock.mockReset();
    createSupabaseServerClientMock.mockClear();
    provisionStudentAccessMock.mockReset();

    signInWithOtpMock.mockResolvedValue({ error: null });
    verifyOtpMock.mockResolvedValue({
      data: {
        user: {
          email: "student@example.com",
          id: "user-1",
          user_metadata: {},
        },
      },
      error: null,
    });
    provisionStudentAccessMock.mockResolvedValue({ hasAccess: true });
  });

  it("returns generic success and sends a magic link for allowlisted JSON requests", async () => {
    canRequestStudentAccessMock.mockResolvedValue(true);

    const response = await requestLinkPost(
      new Request("http://localhost/auth/request-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "Student@Example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(canRequestStudentAccessMock).toHaveBeenCalledWith(supabaseClient, "student@example.com");
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "student@example.com",
      options: {
        emailRedirectTo: "http://localhost/auth/callback",
      },
    });
  });

  it("returns generic success without sending a magic link for non-allowlisted JSON requests", async () => {
    canRequestStudentAccessMock.mockResolvedValue(false);

    const response = await requestLinkPost(
      new Request("http://localhost/auth/request-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "student@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it("redirects form submissions to the check-email state", async () => {
    canRequestStudentAccessMock.mockResolvedValue(false);
    const body = new URLSearchParams({ email: "student@example.com" });

    const response = await requestLinkPost(
      new Request("http://localhost/auth/request-link", {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login?status=check-email");
  });

  it("redirects successful callbacks to the ready state", async () => {
    const response = await callbackGet(
      new Request("http://localhost/auth/callback?token_hash=token&type=email"),
    );

    expect(verifyOtpMock).toHaveBeenCalledWith({
      token_hash: "token",
      type: "email",
    });
    expect(provisionStudentAccessMock).toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login?status=ready");
  });

  it("signs the user out and redirects when provisioning finds no access", async () => {
    provisionStudentAccessMock.mockResolvedValue({ hasAccess: false });

    const response = await callbackGet(
      new Request("http://localhost/auth/callback?token_hash=token&type=email"),
    );

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login?error=no-access");
  });
});
