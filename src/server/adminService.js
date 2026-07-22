const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const {
    AppError,
    constantTimeEqual,
    generateToken,
    parseCookies,
    tokenDigest,
} = require('./security');

const ROLE_LEVEL = Object.freeze({ viewer: 1, admin: 2, owner: 3 });

class AdminService {
    constructor({ db, config, logger = console, verifyGoogleToken = null }) {
        this.db = db;
        this.config = config;
        this.logger = logger;
        this.googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;
        this.verifyGoogleToken = verifyGoogleToken || ((token) => this.verifyGoogle(token));
    }

    digest(value) {
        return tokenDigest(value, this.config.tokenPepper);
    }

    async verifyGoogle(idToken) {
        if (!this.googleClient || !this.config.googleClientId) {
            throw new AppError('google_not_configured', 'Google admin sign-in is not configured', 503);
        }
        const ticket = await this.googleClient.verifyIdToken({ idToken, audience: this.config.googleClientId });
        const payload = ticket.getPayload();
        if (!payload?.sub || !payload.email || payload.email_verified !== true) {
            throw new AppError('invalid_google_identity', 'A verified Google email is required', 401);
        }
        return { subject: payload.sub, email: payload.email.toLowerCase(), displayName: payload.name || null };
    }

    createBootstrapCode() {
        if (this.db.ownerCount() > 0) throw new AppError('bootstrap_closed', 'An owner already exists', 409);
        const code = generateToken(24);
        const now = Date.now();
        this.db.createBootstrapCode({
            id: crypto.randomUUID(),
            codeHash: this.digest(code),
            createdAt: now,
            expiresAt: now + this.config.bootstrapTtlMs,
        });
        return { code, expiresAt: now + this.config.bootstrapTtlMs };
    }

    async loginWithGoogle({ idToken, bootstrapCode, inviteCode }) {
        if (typeof idToken !== 'string' || idToken.length > 10000) throw new AppError('invalid_login', 'Google credential is required', 400);
        let identity;
        try {
            identity = await this.verifyGoogleToken(idToken);
        } catch (error) {
            if (error instanceof AppError) throw error;
            this.logger.warn(`[WARN] Google token verification failed: ${error.message}`);
            throw new AppError('invalid_google_identity', 'Google sign-in could not be verified', 401);
        }

        let user = this.db.adminIdentity('google', identity.subject);
        if (!user) {
            let role;
            if (this.db.ownerCount() === 0) {
                if (!bootstrapCode || !this.db.consumeBootstrapCode(this.digest(bootstrapCode))) {
                    throw new AppError('bootstrap_required', 'A valid one-time bootstrap code is required', 403);
                }
                role = 'owner';
            } else {
                if (!inviteCode) throw new AppError('invite_required', 'An administrator invitation is required', 403);
                const invite = this.db.consumeAdminInvite(this.digest(inviteCode), identity.email);
                if (!invite) throw new AppError('invalid_invite', 'Administrator invitation is invalid or expired', 403);
                role = invite.role;
            }
            user = this.db.createAdminWithIdentity({
                id: crypto.randomUUID(),
                email: identity.email,
                displayName: identity.displayName,
                role,
                provider: 'google',
                subject: identity.subject,
            });
            this.db.audit(user.id, role === 'owner' ? 'owner_bootstrapped' : 'admin_invite_accepted', 'admin_user', user.id, { provider: 'google' });
        } else if (!user.enabled) {
            throw new AppError('admin_disabled', 'This administrator account is disabled', 403);
        }

        this.db.touchAdminLogin(user.id);
        const session = this.createSession(user.id);
        this.db.audit(user.id, 'login', 'admin_session', session.id, { provider: 'google' });
        return { user: this.publicUser(user), ...session };
    }

    createSession(userId) {
        const token = generateToken();
        const csrfToken = generateToken();
        const now = Date.now();
        const id = crypto.randomUUID();
        this.db.createAdminSession({
            id,
            userId,
            tokenHash: this.digest(token),
            csrfTokenHash: this.digest(csrfToken),
            createdAt: now,
            expiresAt: now + this.config.adminSessionTtlMs,
        });
        return { id, token, csrfToken, expiresAt: now + this.config.adminSessionTtlMs };
    }

    authenticate(req, { role = 'viewer', csrf = false, recentAuth = false } = {}) {
        const token = parseCookies(req.headers.cookie).ytkt_admin_session;
        if (!token) throw new AppError('admin_unauthorized', 'Administrator sign-in required', 401);
        const session = this.db.adminSession(this.digest(token));
        if (!session) throw new AppError('admin_unauthorized', 'Administrator session is invalid or expired', 401);
        if ((ROLE_LEVEL[session.role] || 0) < ROLE_LEVEL[role]) throw new AppError('admin_forbidden', 'Insufficient administrator permissions', 403);
        if (recentAuth && Date.now() - session.created_at > 15 * 60 * 1000) {
            throw new AppError('reauth_required', 'Please sign in again before changing administrator access', 403);
        }
        if (csrf) {
            const provided = req.headers['x-csrf-token'];
            if (!provided || !constantTimeEqual(this.digest(provided), session.csrf_token_hash)) {
                throw new AppError('csrf_failed', 'CSRF validation failed', 403);
            }
        }
        return session;
    }

    logout(req) {
        const token = parseCookies(req.headers.cookie).ytkt_admin_session;
        if (!token) return false;
        const session = this.db.adminSession(this.digest(token));
        const revoked = this.db.revokeAdminSession(this.digest(token));
        if (session) this.db.audit(session.admin_user_id, 'logout', 'admin_session', session.id);
        return Boolean(revoked);
    }

    createInvite(actor, { email, role = 'viewer' }) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new AppError('invalid_email', 'A valid email is required');
        if (!ROLE_LEVEL[role]) throw new AppError('invalid_role', 'Invalid administrator role');
        if (role === 'owner' && actor.role !== 'owner') throw new AppError('admin_forbidden', 'Only an owner can invite another owner', 403);
        const code = generateToken(24);
        const now = Date.now();
        const id = crypto.randomUUID();
        this.db.createAdminInvite({
            id,
            email: normalizedEmail,
            role,
            codeHash: this.digest(code),
            createdBy: actor.admin_user_id,
            createdAt: now,
            expiresAt: now + 24 * 60 * 60 * 1000,
        });
        this.db.audit(actor.admin_user_id, 'admin_invited', 'admin_invite', id, { email: normalizedEmail, role });
        return { code, email: normalizedEmail, role, expiresAt: now + 24 * 60 * 60 * 1000 };
    }

    publicUser(user) {
        return {
            id: user.id || user.admin_user_id,
            email: user.email,
            displayName: user.display_name || null,
            role: user.role,
            enabled: Boolean(user.enabled),
            lastLoginAt: user.last_login_at || null,
        };
    }
}

module.exports = { AdminService, ROLE_LEVEL };
