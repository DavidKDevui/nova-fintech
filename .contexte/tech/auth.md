# Auth

## Stack
- Express + Bun + TypeScript
- PostgreSQL via Drizzle ORM
- JWT (access token 15min + refresh token 7j)
- bcrypt pour le hashing des mots de passe
- nodemailer pour l'envoi d'emails

## Tables

### users
| Champ | Type | Description |
|---|---|---|
| id | UUID | PK, auto-generated |
| email | VARCHAR(255) | unique, not null |
| password | VARCHAR(255) | bcrypt hash |
| account_type | ENUM(user, admin) | default: user |
| refresh_token | VARCHAR(500) | hashed, nullable |
| is_verified | BOOLEAN | default: false |
| deleted_at | TIMESTAMP | nullable (soft delete) |
| created_at | TIMESTAMP | auto |
| updated_at | TIMESTAMP | auto |

### verifications
| Champ | Type | Description |
|---|---|---|
| id | UUID | PK, auto-generated |
| user_id | UUID | FK -> users.id |
| type | ENUM | email_verification, password_reset |
| value | VARCHAR(500) | code (6 digits) ou token (hex) selon le type |
| expires_at | TIMESTAMP | expiration |
| used_at | TIMESTAMP | nullable, marked when consumed |
| created_at | TIMESTAMP | auto |

## Routes

### Publiques
| Route | Method | Body | Description |
|---|---|---|---|
| /auth/register | POST | email, password | Inscription + envoi code verif email |
| /auth/login | POST | email, password | Connexion, retourne user + tokens |
| /auth/refresh-token | POST | refreshToken | Renouvelle access + refresh token |
| /auth/forgot-password | POST | email | Envoie un email avec token de reset |
| /auth/reset-password | POST | token, password | Reset le mot de passe |

### Protegees (Authorization: Bearer token)
| Route | Method | Body | Description |
|---|---|---|---|
| /auth/verify-email | POST | code | Verifie l'email avec le code 6 digits |
| /auth/resend-verification | POST | - | Renvoie un code de verification |
| /auth/logout | POST | - | Supprime le refresh token |
| /auth/delete-account | DELETE | - | Soft delete du compte |

## Middleware

### authMiddleware
- Verifie le header `Authorization: Bearer <token>`
- Decode le JWT, verifie que le user existe et n'est pas soft-deleted
- Injecte `userId` et `accountType` dans la request

### adminMiddleware
- Verifie que `accountType === 'admin'`
- A utiliser apres authMiddleware

## Securite
- Mots de passe hashes avec bcrypt (10 rounds)
- Refresh token stocke hashe en base
- Reset password via token crypto random (expire 1h)
- Verification email via code 6 digits (expire 15min)
- Les tokens sont single-use (marques `usedAt` apres consommation)
- Soft delete : les users supprimes ne peuvent plus se connecter
- Le userId des routes protegees vient du JWT, pas du body

## Emails
- nodemailer avec fallback jsonTransport si SMTP non configure
- Templates via builder `buildMailHtml()` avec blocs : title, text, button, divider
- Emails existants : reset password, email verification

## Tests
- 20 tests d'integration dans `app/tests/auth/`
- Serveur demarre automatiquement sur port aleatoire
- Base nettoyee entre chaque test
