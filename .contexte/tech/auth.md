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
| password | VARCHAR(255) | nullable (null tant que le user n'a pas setup son mdp) |
| account_type | ENUM(user, admin) | default: user |
| refresh_token | VARCHAR(500) | hashed, nullable |
| is_verified | BOOLEAN | default: false, passe a true apres setup-password |
| deleted_at | TIMESTAMP | nullable (soft delete) |
| created_at | TIMESTAMP | auto |
| updated_at | TIMESTAMP | auto |

### verifications
| Champ | Type | Description |
|---|---|---|
| id | UUID | PK, auto-generated |
| user_id | UUID | FK -> users.id |
| type | ENUM | email_verification, password_reset, account_setup |
| value | VARCHAR(500) | token crypto random |
| expires_at | TIMESTAMP | expiration |
| used_at | TIMESTAMP | nullable, marked when consumed |
| created_at | TIMESTAMP | auto |

## Flow d'inscription

1. Admin se connecte et cree un user via `POST /admin/users` (juste l'email)
2. Un token `account_setup` est cree dans la table verifications (expire 24h)
3. Un email est envoye avec un lien `/setup-password?token=xxx`
4. Le user clique et definit son mot de passe via `POST /auth/setup-password`
5. Le compte passe a `isVerified: true` et `password` est defini
6. Le user peut se connecter normalement

## Routes

### Publiques
| Route | Method | Body | Description |
|---|---|---|---|
| /auth/login | POST | email, password | Connexion, retourne user + tokens |
| /auth/refresh-token | POST | refreshToken | Renouvelle access + refresh token |
| /auth/setup-password | POST | token, password | Definit le mot de passe (premier acces) |
| /auth/forgot-password | POST | email | Envoie un email avec token de reset |
| /auth/reset-password | POST | token, password | Reset le mot de passe |

### Protegees (Authorization: Bearer token)
| Route | Method | Body | Description |
|---|---|---|---|
| /auth/change-password | POST | currentPassword, newPassword | Changer son mot de passe |
| /auth/logout | POST | - | Supprime le refresh token |
| /auth/delete-account | DELETE | - | Soft delete du compte |

### Admin (Authorization: Bearer token, role admin)
| Route | Method | Body | Description |
|---|---|---|---|
| /admin/users | POST | email | Creer un user + envoi email setup |
| /admin/users | GET | - | Lister tous les users |

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
- Account setup via token crypto random (expire 24h)
- Les tokens sont single-use (marques `usedAt` apres consommation)
- Pas de mot de passe temporaire en clair — le user definit son propre mdp via un lien
- Soft delete : les users supprimes ne peuvent plus se connecter
- Le userId des routes protegees vient du JWT, pas du body
- Login refuse si le password est null (compte pas encore setup)

## Emails
- nodemailer avec fallback jsonTransport si SMTP non configure
- Templates via builder `buildMailHtml()` avec blocs : title, text, button, divider
- Emails : account setup, reset password

## Tests
- 20 tests d'integration dans `app/tests/auth/`
- Serveur demarre automatiquement sur port aleatoire
- Base recree a chaque lancement, nettoyee entre chaque test
