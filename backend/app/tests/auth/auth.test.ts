import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { setupTestServer, cleanTestDb, teardownTestServer, getBaseUrl } from "../setup";
import { db } from "../../db";
import { users, verifications } from "../../db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

beforeAll(async () => {
  await setupTestServer();
});

afterAll(async () => {
  await teardownTestServer();
});

beforeEach(async () => {
  await cleanTestDb();
});

// Extract cookies from Set-Cookie headers
function extractCookies(res: Response): string {
  const setCookies = res.headers.getSetCookie();
  return setCookies
    .map((header) => header.split(";")[0])
    .join("; ");
}

async function rawRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const { headers, ...rest } = options;
  return fetch(`${getBaseUrl()}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers as Record<string, string>),
    },
  });
}

async function request(path: string, options: RequestInit = {}): Promise<{ status: number; data: any; cookies: string }> {
  const res = await rawRequest(path, options);
  const data = await res.json();
  const cookies = extractCookies(res);
  return { status: res.status, data, cookies };
}

function withCookies(cookies: string): RequestInit {
  return { headers: { Cookie: cookies } };
}

// Helper: create a user with password directly in DB and return cookies
async function createTestUser(email: string, password: string, accountType: "user" | "admin" = "user"): Promise<{ data: any; cookies: string }> {
  const hashed = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    email,
    password: hashed,
    accountType,
    isVerified: true,
  });

  const { data, cookies } = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  return { data, cookies };
}

// ─── ADMIN: CREATE USER ─────────────────────────────

describe("POST /admin/users", () => {
  test("should create a user as admin", async () => {
    const admin = await createTestUser("admin@test.com", "Admin123!", "admin");
    const { status, data } = await request("/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: "newuser@test.com" }),
      ...withCookies(admin.cookies),
    });

    expect(status).toBe(201);
    expect(data.email).toBe("newuser@test.com");
  });

  test("should create an account_setup verification", async () => {
    const admin = await createTestUser("admin@test.com", "Admin123!", "admin");
    const { data } = await request("/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: "setup@test.com" }),
      ...withCookies(admin.cookies),
    });

    const [verification] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.userId, data.id));

    expect(verification).toBeDefined();
    expect(verification!.type).toBe("account_setup");
  });

  test("should fail if not admin", async () => {
    const user = await createTestUser("user@test.com", "User123!");
    const { status } = await request("/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: "newuser@test.com" }),
      ...withCookies(user.cookies),
    });

    expect(status).toBe(403);
  });

  test("should fail if not authenticated", async () => {
    const { status } = await request("/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: "newuser@test.com" }),
    });

    expect(status).toBe(401);
  });

  test("should fail with duplicate email", async () => {
    const admin = await createTestUser("admin@test.com", "Admin123!", "admin");
    await request("/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: "dup@test.com" }),
      ...withCookies(admin.cookies),
    });
    const { status } = await request("/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: "dup@test.com" }),
      ...withCookies(admin.cookies),
    });

    expect(status).toBe(409);
  });
});

// ─── ADMIN: LIST USERS ──────────────────────────────

describe("GET /admin/users", () => {
  test("should list users as admin", async () => {
    const admin = await createTestUser("admin@test.com", "Admin123!", "admin");
    await request("/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: "user1@test.com" }),
      ...withCookies(admin.cookies),
    });

    const { status, data } = await request("/admin/users", {
      method: "GET",
      ...withCookies(admin.cookies),
    });

    expect(status).toBe(200);
    expect(data.length).toBe(2);
  });
});

// ─── SETUP PASSWORD ─────────────────────────────────

describe("POST /auth/setup-password", () => {
  test("should set password with valid token", async () => {
    const admin = await createTestUser("admin@test.com", "Admin123!", "admin");
    await request("/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: "new@test.com" }),
      ...withCookies(admin.cookies),
    });

    const [verification] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.type, "account_setup"));

    const { status } = await request("/auth/setup-password", {
      method: "POST",
      body: JSON.stringify({ token: verification!.value, password: "MyPassword123!" }),
    });

    expect(status).toBe(200);

    const { status: loginStatus, data } = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "new@test.com", password: "MyPassword123!" }),
    });

    expect(loginStatus).toBe(200);
    expect(data.user.isVerified).toBe(true);
  });

  test("should fail with invalid token", async () => {
    const { status } = await request("/auth/setup-password", {
      method: "POST",
      body: JSON.stringify({ token: "invalid", password: "MyPassword123!" }),
    });

    expect(status).toBe(400);
  });

  test("should fail if token already used", async () => {
    const admin = await createTestUser("admin@test.com", "Admin123!", "admin");
    await request("/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: "once@test.com" }),
      ...withCookies(admin.cookies),
    });

    const [verification] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.type, "account_setup"));

    await request("/auth/setup-password", {
      method: "POST",
      body: JSON.stringify({ token: verification!.value, password: "First123!" }),
    });

    const { status } = await request("/auth/setup-password", {
      method: "POST",
      body: JSON.stringify({ token: verification!.value, password: "Second123!" }),
    });

    expect(status).toBe(400);
  });
});

// ─── LOGIN ───────────────────────────────────────────

describe("POST /auth/login", () => {
  test("should login and set cookies", async () => {
    const { data, cookies } = await createTestUser("login@test.com", "Password123!");

    expect(data.user.email).toBe("login@test.com");
    expect(cookies).toContain("accessToken=");
    expect(cookies).toContain("refreshToken=");
  });

  test("should not return tokens in body", async () => {
    const { data } = await createTestUser("login@test.com", "Password123!");

    expect(data.accessToken).toBeUndefined();
    expect(data.refreshToken).toBeUndefined();
  });

  test("should fail if password not set yet", async () => {
    const admin = await createTestUser("admin@test.com", "Admin123!", "admin");
    await request("/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: "nopass@test.com" }),
      ...withCookies(admin.cookies),
    });

    const { status } = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "nopass@test.com", password: "anything" }),
    });

    expect(status).toBe(401);
  });

  test("should fail with wrong password", async () => {
    await createTestUser("login@test.com", "Password123!");

    const { status } = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "login@test.com", password: "wrong" }),
    });

    expect(status).toBe(401);
  });
});

// ─── ME ──────────────────────────────────────────────

describe("GET /auth/me", () => {
  test("should return user from cookies", async () => {
    const { cookies } = await createTestUser("me@test.com", "Password123!");

    const { status, data } = await request("/auth/me", {
      method: "GET",
      ...withCookies(cookies),
    });

    expect(status).toBe(200);
    expect(data.user.email).toBe("me@test.com");
  });

  test("should fail without cookies", async () => {
    const { status } = await request("/auth/me", { method: "GET" });
    expect(status).toBe(401);
  });
});

// ─── CHANGE PASSWORD ─────────────────────────────────

describe("POST /auth/change-password", () => {
  test("should change password", async () => {
    const { cookies } = await createTestUser("change@test.com", "OldPass123!");

    const { status } = await request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: "OldPass123!", newPassword: "NewPass123!" }),
      ...withCookies(cookies),
    });

    expect(status).toBe(200);

    const { status: loginStatus } = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "change@test.com", password: "NewPass123!" }),
    });

    expect(loginStatus).toBe(200);
  });

  test("should fail with wrong current password", async () => {
    const { cookies } = await createTestUser("change@test.com", "OldPass123!");

    const { status } = await request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: "wrong", newPassword: "NewPass123!" }),
      ...withCookies(cookies),
    });

    expect(status).toBe(401);
  });
});

// ─── REFRESH TOKEN ───────────────────────────────────

describe("POST /auth/refresh-token", () => {
  test("should refresh tokens via cookies", async () => {
    const { cookies } = await createTestUser("refresh@test.com", "Password123!");

    const { status, cookies: newCookies } = await request("/auth/refresh-token", {
      method: "POST",
      ...withCookies(cookies),
    });

    expect(status).toBe(200);
    expect(newCookies).toContain("accessToken=");
    expect(newCookies).toContain("refreshToken=");
  });

  test("should fail without cookies", async () => {
    const { status } = await request("/auth/refresh-token", {
      method: "POST",
    });

    expect(status).toBe(401);
  });
});

// ─── FORGOT / RESET PASSWORD ─────────────────────────

describe("POST /auth/forgot-password + reset-password", () => {
  test("should reset password with valid token", async () => {
    await createTestUser("reset@test.com", "OldPassword123!");

    await request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "reset@test.com" }),
    });

    const [resetVerification] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.type, "password_reset"));

    const { status } = await request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: resetVerification!.value, password: "NewPassword123!" }),
    });

    expect(status).toBe(200);

    const { status: loginStatus } = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "reset@test.com", password: "NewPassword123!" }),
    });

    expect(loginStatus).toBe(200);
  });

  test("should return success even if email doesn't exist", async () => {
    const { status } = await request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "noone@test.com" }),
    });

    expect(status).toBe(200);
  });
});

// ─── LOGOUT ──────────────────────────────────────────

describe("POST /auth/logout", () => {
  test("should logout and clear cookies", async () => {
    const { cookies } = await createTestUser("logout@test.com", "Password123!");

    const res = await rawRequest("/auth/logout", {
      method: "POST",
      ...withCookies(cookies),
    });

    expect(res.status).toBe(200);

    // Cookies should be cleared
    const setCookies = res.headers.getSetCookie();
    const cleared = setCookies.filter((c) => c.includes("Max-Age=0") || c.includes("max-age=0") || c.includes("Expires=Thu, 01 Jan 1970"));
    expect(cleared.length).toBeGreaterThan(0);
  });
});

// ─── DELETE ACCOUNT ──────────────────────────────────

describe("DELETE /auth/delete-account", () => {
  test("should soft delete account and clear cookies", async () => {
    const { data, cookies } = await createTestUser("delete@test.com", "Password123!");

    const res = await rawRequest("/auth/delete-account", {
      method: "DELETE",
      ...withCookies(cookies),
    });

    expect(res.status).toBe(200);

    const [user] = await db.select().from(users).where(eq(users.id, data.user.id));
    expect(user!.deletedAt).not.toBeNull();

    const { status: loginStatus } = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "delete@test.com", password: "Password123!" }),
    });

    expect(loginStatus).toBe(401);
  });
});
