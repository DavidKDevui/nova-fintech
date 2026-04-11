import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { setupTestServer, cleanTestDb, teardownTestServer, getBaseUrl } from "../setup";
import { db } from "../../db";
import { users, verifications } from "../../db/schema";
import { eq } from "drizzle-orm";

beforeAll(async () => {
  await setupTestServer();
});

afterAll(async () => {
  await teardownTestServer();
});

beforeEach(async () => {
  await cleanTestDb();
});

async function request(path: string, options: RequestInit = {}) {
  const { headers, ...rest } = options;
  const res = await fetch(`${getBaseUrl()}/auth${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers as Record<string, string>),
    },
  });
  const data = await res.json();
  return { status: res.status, data };
}

function withAuth(token: string): RequestInit {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// ─── REGISTER ────────────────────────────────────────

describe("POST /auth/register", () => {
  test("should register a new user", async () => {
    const { status, data } = await request("/register", {
      method: "POST",
      body: JSON.stringify({ email: "test@test.com", password: "Password123!" }),
    });

    expect(status).toBe(201);
    expect(data.user.email).toBe("test@test.com");
    expect(data.user.accountType).toBe("user");
    expect(data.user.isVerified).toBe(false);
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
  });

  test("should fail with duplicate email", async () => {
    await request("/register", {
      method: "POST",
      body: JSON.stringify({ email: "test@test.com", password: "Password123!" }),
    });

    const { status, data } = await request("/register", {
      method: "POST",
      body: JSON.stringify({ email: "test@test.com", password: "Password456!" }),
    });

    expect(status).toBe(409);
    expect(data.error).toBe("Email already exists");
  });

  test("should fail without email or password", async () => {
    const { status } = await request("/register", {
      method: "POST",
      body: JSON.stringify({ email: "test@test.com" }),
    });

    expect(status).toBe(400);
  });

  test("should create a verification code", async () => {
    const { data } = await request("/register", {
      method: "POST",
      body: JSON.stringify({ email: "test@test.com", password: "Password123!" }),
    });

    const [verification] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.userId, data.user.id));

    expect(verification).toBeDefined();
    expect(verification.type).toBe("email_verification");
  });
});

// ─── LOGIN ───────────────────────────────────────────

describe("POST /auth/login", () => {
  const email = "login@test.com";
  const password = "Password123!";

  beforeEach(async () => {
    await request("/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  });

  test("should login with valid credentials", async () => {
    const { status, data } = await request("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    expect(status).toBe(200);
    expect(data.user.email).toBe(email);
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
  });

  test("should fail with wrong password", async () => {
    const { status, data } = await request("/login", {
      method: "POST",
      body: JSON.stringify({ email, password: "wrong" }),
    });

    expect(status).toBe(401);
    expect(data.error).toBe("Invalid credentials");
  });

  test("should fail with non-existent email", async () => {
    const { status } = await request("/login", {
      method: "POST",
      body: JSON.stringify({ email: "nope@test.com", password }),
    });

    expect(status).toBe(401);
  });
});

// ─── REFRESH TOKEN ───────────────────────────────────

describe("POST /auth/refresh-token", () => {
  test("should return new tokens", async () => {
    const { data: registerData } = await request("/register", {
      method: "POST",
      body: JSON.stringify({ email: "refresh@test.com", password: "Password123!" }),
    });

    const { status, data } = await request("/refresh-token", {
      method: "POST",
      body: JSON.stringify({ refreshToken: registerData.refreshToken }),
    });

    expect(status).toBe(200);
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
  });

  test("should fail with invalid token", async () => {
    const { status } = await request("/refresh-token", {
      method: "POST",
      body: JSON.stringify({ refreshToken: "invalid" }),
    });

    expect(status).toBe(401);
  });
});

// ─── VERIFY EMAIL ────────────────────────────────────

describe("POST /auth/verify-email", () => {
  test("should verify email with valid code", async () => {
    const { data: registerData } = await request("/register", {
      method: "POST",
      body: JSON.stringify({ email: "verify@test.com", password: "Password123!" }),
    });

    const [verification] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.userId, registerData.user.id));

    const { status, data } = await request("/verify-email", {
      method: "POST",
      body: JSON.stringify({ code: verification.value }),
      ...withAuth(registerData.accessToken),
    });

    expect(status).toBe(200);
    expect(data.message).toBe("Email verified");

    const [user] = await db.select().from(users).where(eq(users.id, registerData.user.id));
    expect(user.isVerified).toBe(true);
  });

  test("should fail with wrong code", async () => {
    const { data: registerData } = await request("/register", {
      method: "POST",
      body: JSON.stringify({ email: "verify2@test.com", password: "Password123!" }),
    });

    const { status } = await request("/verify-email", {
      method: "POST",
      body: JSON.stringify({ code: "000000" }),
      ...withAuth(registerData.accessToken),
    });

    expect(status).toBe(400);
  });

  test("should fail without auth token", async () => {
    const { status } = await request("/verify-email", {
      method: "POST",
      body: JSON.stringify({ code: "123456" }),
    });

    expect(status).toBe(401);
  });
});

// ─── FORGOT PASSWORD ─────────────────────────────────

describe("POST /auth/forgot-password", () => {
  test("should return success even if email doesn't exist", async () => {
    const { status, data } = await request("/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "noone@test.com" }),
    });

    expect(status).toBe(200);
    expect(data.message).toContain("If this email exists");
  });

  test("should create a reset token for existing user", async () => {
    const { data: registerData } = await request("/register", {
      method: "POST",
      body: JSON.stringify({ email: "forgot@test.com", password: "Password123!" }),
    });

    await request("/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "forgot@test.com" }),
    });

    const resetVerifications = await db
      .select()
      .from(verifications)
      .where(eq(verifications.type, "password_reset"));

    expect(resetVerifications.length).toBe(1);
    expect(resetVerifications[0].userId).toBe(registerData.user.id);
  });
});

// ─── RESET PASSWORD ──────────────────────────────────

describe("POST /auth/reset-password", () => {
  test("should reset password with valid token", async () => {
    await request("/register", {
      method: "POST",
      body: JSON.stringify({ email: "reset@test.com", password: "OldPassword123!" }),
    });

    await request("/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "reset@test.com" }),
    });

    const [resetVerification] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.type, "password_reset"));

    const { status } = await request("/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: resetVerification.value, password: "NewPassword123!" }),
    });

    expect(status).toBe(200);

    const { status: loginStatus } = await request("/login", {
      method: "POST",
      body: JSON.stringify({ email: "reset@test.com", password: "NewPassword123!" }),
    });

    expect(loginStatus).toBe(200);
  });

  test("should fail with invalid token", async () => {
    const { status } = await request("/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: "invalid", password: "NewPassword123!" }),
    });

    expect(status).toBe(400);
  });
});

// ─── LOGOUT ──────────────────────────────────────────

describe("POST /auth/logout", () => {
  test("should logout and invalidate refresh token", async () => {
    const { data: registerData } = await request("/register", {
      method: "POST",
      body: JSON.stringify({ email: "logout@test.com", password: "Password123!" }),
    });

    const { status } = await request("/logout", {
      method: "POST",
      ...withAuth(registerData.accessToken),
    });

    expect(status).toBe(200);

    const { status: refreshStatus } = await request("/refresh-token", {
      method: "POST",
      body: JSON.stringify({ refreshToken: registerData.refreshToken }),
    });

    expect(refreshStatus).toBe(401);
  });

  test("should fail without auth token", async () => {
    const { status } = await request("/logout", {
      method: "POST",
    });

    expect(status).toBe(401);
  });
});

// ─── DELETE ACCOUNT ──────────────────────────────────

describe("DELETE /auth/delete-account", () => {
  test("should soft delete account", async () => {
    const { data: registerData } = await request("/register", {
      method: "POST",
      body: JSON.stringify({ email: "delete@test.com", password: "Password123!" }),
    });

    const { status } = await request("/delete-account", {
      method: "DELETE",
      ...withAuth(registerData.accessToken),
    });

    expect(status).toBe(200);

    const [user] = await db.select().from(users).where(eq(users.id, registerData.user.id));
    expect(user.deletedAt).not.toBeNull();

    const { status: loginStatus } = await request("/login", {
      method: "POST",
      body: JSON.stringify({ email: "delete@test.com", password: "Password123!" }),
    });

    expect(loginStatus).toBe(401);
  });

  test("should fail without auth token", async () => {
    const { status } = await request("/delete-account", {
      method: "DELETE",
    });

    expect(status).toBe(401);
  });
});
