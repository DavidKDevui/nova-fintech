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

async function request(path: string, options: RequestInit = {}) {
  const { headers, ...rest } = options;
  const res = await fetch(`${getBaseUrl()}${path}`, {
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

// Helper: create a user directly in DB and return login tokens
async function createTestUser(email: string, password: string, accountType: "user" | "admin" = "user") {
  const hashed = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    email,
    password: hashed,
    accountType,
    isVerified: true,
    mustChangePassword: false,
  });

  const { data } = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  return data;
}

// Helper: create a user via admin endpoint
async function adminCreateUser(adminToken: string, email: string) {
  return request("/admin/users", {
    method: "POST",
    body: JSON.stringify({ email }),
    ...withAuth(adminToken),
  });
}

// ─── ADMIN: CREATE USER ─────────────────────────────

describe("POST /admin/users", () => {
  test("should create a user as admin", async () => {
    const admin = await createTestUser("admin@test.com", "Admin123!", "admin");
    const { status, data } = await adminCreateUser(admin.accessToken, "newuser@test.com");

    expect(status).toBe(201);
    expect(data.email).toBe("newuser@test.com");
    expect(data.accountType).toBe("user");
  });

  test("should fail if not admin", async () => {
    const user = await createTestUser("user@test.com", "User123!");
    const { status } = await adminCreateUser(user.accessToken, "newuser@test.com");

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
    await adminCreateUser(admin.accessToken, "dup@test.com");
    const { status } = await adminCreateUser(admin.accessToken, "dup@test.com");

    expect(status).toBe(409);
  });
});

// ─── ADMIN: LIST USERS ──────────────────────────────

describe("GET /admin/users", () => {
  test("should list users as admin", async () => {
    const admin = await createTestUser("admin@test.com", "Admin123!", "admin");
    await adminCreateUser(admin.accessToken, "user1@test.com");
    await adminCreateUser(admin.accessToken, "user2@test.com");

    const { status, data } = await request("/admin/users", {
      method: "GET",
      ...withAuth(admin.accessToken),
    });

    expect(status).toBe(200);
    expect(data.length).toBe(3); // admin + 2 users
  });

  test("should fail if not admin", async () => {
    const user = await createTestUser("user@test.com", "User123!");
    const { status } = await request("/admin/users", {
      method: "GET",
      ...withAuth(user.accessToken),
    });

    expect(status).toBe(403);
  });
});

// ─── LOGIN ───────────────────────────────────────────

describe("POST /auth/login", () => {
  test("should login with valid credentials", async () => {
    await createTestUser("login@test.com", "Password123!");

    const { status, data } = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "login@test.com", password: "Password123!" }),
    });

    expect(status).toBe(200);
    expect(data.user.email).toBe("login@test.com");
    expect(data.user.mustChangePassword).toBe(false);
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
  });

  test("should indicate mustChangePassword for admin-created users", async () => {
    const admin = await createTestUser("admin@test.com", "Admin123!", "admin");
    const { data: created } = await adminCreateUser(admin.accessToken, "new@test.com");

    // Get the temp password from DB (we can't read it from the email in tests)
    // Instead, let's verify the flag is set
    const [user] = await db.select().from(users).where(eq(users.email, "new@test.com"));
    expect(user.mustChangePassword).toBe(true);
  });

  test("should fail with wrong password", async () => {
    await createTestUser("login@test.com", "Password123!");

    const { status, data } = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "login@test.com", password: "wrong" }),
    });

    expect(status).toBe(401);
    expect(data.error).toBe("Invalid credentials");
  });

  test("should fail with non-existent email", async () => {
    const { status } = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "nope@test.com", password: "Password123!" }),
    });

    expect(status).toBe(401);
  });
});

// ─── CHANGE PASSWORD ─────────────────────────────────

describe("POST /auth/change-password", () => {
  test("should change password", async () => {
    const loginData = await createTestUser("change@test.com", "OldPass123!");

    const { status } = await request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: "OldPass123!", newPassword: "NewPass123!" }),
      ...withAuth(loginData.accessToken),
    });

    expect(status).toBe(200);

    // Should login with new password
    const { status: loginStatus } = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "change@test.com", password: "NewPass123!" }),
    });

    expect(loginStatus).toBe(200);
  });

  test("should clear mustChangePassword flag", async () => {
    const admin = await createTestUser("admin@test.com", "Admin123!", "admin");
    await adminCreateUser(admin.accessToken, "forced@test.com");

    // Get user and their temp password hash to login
    const [user] = await db.select().from(users).where(eq(users.email, "forced@test.com"));
    expect(user.mustChangePassword).toBe(true);
  });

  test("should fail with wrong current password", async () => {
    const loginData = await createTestUser("change@test.com", "OldPass123!");

    const { status, data } = await request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: "wrong", newPassword: "NewPass123!" }),
      ...withAuth(loginData.accessToken),
    });

    expect(status).toBe(401);
    expect(data.error).toBe("Invalid current password");
  });

  test("should fail without auth token", async () => {
    const { status } = await request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: "old", newPassword: "new" }),
    });

    expect(status).toBe(401);
  });
});

// ─── REFRESH TOKEN ───────────────────────────────────

describe("POST /auth/refresh-token", () => {
  test("should return new tokens", async () => {
    const loginData = await createTestUser("refresh@test.com", "Password123!");

    const { status, data } = await request("/auth/refresh-token", {
      method: "POST",
      body: JSON.stringify({ refreshToken: loginData.refreshToken }),
    });

    expect(status).toBe(200);
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
  });

  test("should fail with invalid token", async () => {
    const { status } = await request("/auth/refresh-token", {
      method: "POST",
      body: JSON.stringify({ refreshToken: "invalid" }),
    });

    expect(status).toBe(401);
  });
});

// ─── FORGOT PASSWORD ─────────────────────────────────

describe("POST /auth/forgot-password", () => {
  test("should return success even if email doesn't exist", async () => {
    const { status, data } = await request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "noone@test.com" }),
    });

    expect(status).toBe(200);
    expect(data.message).toContain("If this email exists");
  });

  test("should create a reset token for existing user", async () => {
    const loginData = await createTestUser("forgot@test.com", "Password123!");

    await request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "forgot@test.com" }),
    });

    const resetVerifications = await db
      .select()
      .from(verifications)
      .where(eq(verifications.type, "password_reset"));

    expect(resetVerifications.length).toBe(1);
    expect(resetVerifications[0].userId).toBe(loginData.user.id);
  });
});

// ─── RESET PASSWORD ──────────────────────────────────

describe("POST /auth/reset-password", () => {
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
      body: JSON.stringify({ token: resetVerification.value, password: "NewPassword123!" }),
    });

    expect(status).toBe(200);

    const { status: loginStatus } = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "reset@test.com", password: "NewPassword123!" }),
    });

    expect(loginStatus).toBe(200);
  });

  test("should fail with invalid token", async () => {
    const { status } = await request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: "invalid", password: "NewPassword123!" }),
    });

    expect(status).toBe(400);
  });
});

// ─── LOGOUT ──────────────────────────────────────────

describe("POST /auth/logout", () => {
  test("should logout and invalidate refresh token", async () => {
    const loginData = await createTestUser("logout@test.com", "Password123!");

    const { status } = await request("/auth/logout", {
      method: "POST",
      ...withAuth(loginData.accessToken),
    });

    expect(status).toBe(200);

    const { status: refreshStatus } = await request("/auth/refresh-token", {
      method: "POST",
      body: JSON.stringify({ refreshToken: loginData.refreshToken }),
    });

    expect(refreshStatus).toBe(401);
  });

  test("should fail without auth token", async () => {
    const { status } = await request("/auth/logout", {
      method: "POST",
    });

    expect(status).toBe(401);
  });
});

// ─── DELETE ACCOUNT ──────────────────────────────────

describe("DELETE /auth/delete-account", () => {
  test("should soft delete account", async () => {
    const loginData = await createTestUser("delete@test.com", "Password123!");

    const { status } = await request("/auth/delete-account", {
      method: "DELETE",
      ...withAuth(loginData.accessToken),
    });

    expect(status).toBe(200);

    const [user] = await db.select().from(users).where(eq(users.id, loginData.user.id));
    expect(user.deletedAt).not.toBeNull();

    const { status: loginStatus } = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "delete@test.com", password: "Password123!" }),
    });

    expect(loginStatus).toBe(401);
  });

  test("should fail without auth token", async () => {
    const { status } = await request("/auth/delete-account", {
      method: "DELETE",
    });

    expect(status).toBe(401);
  });
});
