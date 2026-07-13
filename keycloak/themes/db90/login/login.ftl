<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Welcome to Aixle Insights</title>
    <style>
        /* Aixle Insights Keycloak Login Theme */
        /* Using exact OKLCH values from packages/web/src/index.css dark theme */

        :root {
            --background: oklch(0.12 0.01 260);
            --foreground: oklch(0.95 0 0);
            --card: oklch(0.16 0.015 260);
            --card-foreground: oklch(0.95 0 0);
            --primary: oklch(0.65 0.25 260);
            --primary-foreground: oklch(0.12 0 0);
            --muted-foreground: oklch(0.65 0 0);
            --border: oklch(1 0 0 / 12%);
            --input: oklch(1 0 0 / 15%);
            --ring: oklch(0.65 0.25 260);
            --destructive: oklch(0.65 0.22 25);
        }

        *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        html, body {
            height: 100%;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: var(--background);
            color: var(--foreground);
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        /* Main container */
        .db90-login-container {
            display: flex;
            min-height: 100vh;
            width: 100%;
        }

        /* LEFT PANEL - bg-primary/5 */
        .db90-left-panel {
            display: none;
            width: 50%;
            background-color: oklch(from var(--primary) l c h / 5%);
            padding: 3rem;
            flex-direction: column;
            justify-content: space-between;
        }

        @media (min-width: 1024px) {
            .db90-left-panel {
                display: flex;
            }
        }

        /* Brand */
        .db90-brand {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        /* Logo - bg-gradient-to-br from-primary to-primary/70 */
        .db90-logo {
            display: flex;
            width: 2.5rem;
            height: 2.5rem;
            align-items: center;
            justify-content: center;
            border-radius: 0.5rem;
            background: linear-gradient(to bottom right, var(--primary), oklch(from var(--primary) l c h / 70%));
        }

        /* Logo text - text-primary-foreground */
        .db90-logo-text {
            font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
            font-size: 1.125rem;
            font-weight: 700;
            color: var(--primary-foreground);
        }

        .db90-brand-text {
            display: flex;
            flex-direction: column;
        }

        .db90-brand-title {
            font-size: 1.25rem;
            font-weight: 600;
            letter-spacing: -0.025em;
            color: var(--foreground);
            line-height: 1.2;
        }

        .db90-brand-subtitle {
            font-size: 0.75rem;
            color: var(--muted-foreground);
            line-height: 1.4;
        }

        /* Hero */
        .db90-hero {
            margin-top: auto;
            margin-bottom: 2rem;
        }

        .db90-hero-title {
            font-size: 1.875rem;
            font-weight: 700;
            letter-spacing: -0.025em;
            color: var(--foreground);
            line-height: 1.2;
            margin-bottom: 0.5rem;
        }

        .db90-hero-description {
            font-size: 1.125rem;
            color: var(--muted-foreground);
            line-height: 1.75;
        }

        /* Features */
        .db90-features {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .db90-feature {
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
        }

        /* Feature icon - bg-primary/10 text-primary */
        .db90-feature-icon {
            display: flex;
            width: 2rem;
            height: 2rem;
            flex-shrink: 0;
            align-items: center;
            justify-content: center;
            border-radius: 0.5rem;
            background-color: oklch(from var(--primary) l c h / 10%);
            color: var(--primary);
        }

        .db90-feature-icon svg {
            width: 1rem;
            height: 1rem;
        }

        .db90-feature-content {
            display: flex;
            flex-direction: column;
        }

        .db90-feature-title {
            font-size: 0.875rem;
            font-weight: 500;
            color: var(--foreground);
            line-height: 1.4;
        }

        .db90-feature-description {
            font-size: 0.75rem;
            color: var(--muted-foreground);
            line-height: 1.4;
        }

        /* Footer */
        .db90-footer {
            margin-top: auto;
        }

        .db90-footer p {
            font-size: 0.75rem;
            color: var(--muted-foreground);
        }

        /* RIGHT PANEL */
        .db90-right-panel {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1.5rem;
            background-color: var(--background);
        }

        @media (min-width: 1024px) {
            .db90-right-panel {
                width: 50%;
            }
        }

        /* Card */
        .db90-login-card {
            width: 100%;
            max-width: 28rem;
            background-color: var(--card);
            border: 1px solid var(--border);
            border-radius: 0.75rem;
            padding: 1.5rem;
        }

        /* Card header */
        .db90-card-header {
            text-align: center;
            margin-bottom: 1.5rem;
        }

        /* Mobile logo */
        .db90-mobile-logo {
            display: flex;
            width: 3rem;
            height: 3rem;
            margin: 0 auto 1rem;
            align-items: center;
            justify-content: center;
            border-radius: 0.75rem;
            background: linear-gradient(to bottom right, var(--primary), oklch(from var(--primary) l c h / 70%));
        }

        @media (min-width: 1024px) {
            .db90-mobile-logo {
                display: none;
            }
        }

        .db90-mobile-logo-text {
            font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
            font-size: 1.25rem;
            font-weight: 700;
            color: var(--primary-foreground);
        }

        .db90-card-title {
            font-size: 1.5rem;
            font-weight: 600;
            color: var(--card-foreground);
            margin-bottom: 0.5rem;
        }

        .db90-card-subtitle {
            font-size: 0.875rem;
            color: var(--muted-foreground);
            line-height: 1.5;
        }

        /* Card content */
        .db90-card-content {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        /* Alert */
        .db90-alert {
            padding: 1rem;
            border-radius: 0.5rem;
            font-size: 0.875rem;
        }

        .db90-alert-error {
            background-color: oklch(from var(--destructive) l c h / 10%);
            border: 1px solid oklch(from var(--destructive) l c h / 50%);
            color: var(--destructive);
        }

        .db90-alert p {
            margin: 0;
        }

        /* Social button - outline variant */
        .db90-social-providers {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        /* Button outline variant: dark:bg-input/30 dark:border-input rounded-md h-10 (size lg) */
        /* --input is oklch(1 0 0 / 15%), Tailwind /30 multiplies alpha: 15% × 30% = 4.5% */
        .db90-social-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            width: 100%;
            height: 2.5rem;
            padding: 0.5rem 1rem;
            background-color: oklch(1 0 0 / 4.5%);
            border: 1px solid oklch(1 0 0 / 15%);
            border-radius: 0.375rem;
            color: var(--foreground);
            font-size: 0.875rem;
            font-weight: 500;
            text-decoration: none;
            cursor: pointer;
            white-space: nowrap;
            box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
            transition: all 0.2s;
            outline: none;
        }

        .db90-social-button:hover {
            background-color: oklch(1 0 0 / 7.5%);
            text-decoration: none;
            color: var(--foreground);
        }

        .db90-social-button:focus {
            border-color: var(--ring);
            box-shadow: 0 0 0 3px oklch(from var(--ring) l c h / 50%);
        }

        .db90-google-icon {
            width: 1.25rem;
            height: 1.25rem;
            flex-shrink: 0;
        }

        /* Divider */
        .db90-divider {
            position: relative;
            display: flex;
            align-items: center;
            text-align: center;
        }

        .db90-divider::before,
        .db90-divider::after {
            content: "";
            flex: 1;
            height: 1px;
            background-color: var(--border);
        }

        .db90-divider span {
            padding: 0 0.5rem;
            font-size: 0.75rem;
            text-transform: uppercase;
            color: var(--muted-foreground);
            white-space: nowrap;
            background-color: var(--card);
        }

        /* Form */
        .db90-form {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .db90-form-group {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .db90-label {
            font-size: 0.875rem;
            font-weight: 500;
            color: var(--foreground);
        }

        .db90-input-wrapper {
            position: relative;
            display: flex;
            align-items: center;
        }

        /* Input icons - text-muted-foreground */
        .db90-input-icon {
            position: absolute;
            left: 0.75rem;
            width: 1rem;
            height: 1rem;
            color: var(--muted-foreground);
            pointer-events: none;
        }

        /* Input - dark:bg-input/30 border-input shadow-xs rounded-md h-9 */
        /* --input is oklch(1 0 0 / 15%), Tailwind /30 multiplies alpha: 15% × 30% = 4.5% */
        .db90-input-wrapper input {
            width: 100%;
            height: 2.25rem;
            padding: 0.25rem 0.75rem 0.25rem 2.5rem;
            background-color: oklch(1 0 0 / 4.5%);
            border: 1px solid oklch(1 0 0 / 15%);
            border-radius: 0.375rem;
            color: var(--foreground);
            font-size: 0.875rem;
            outline: none;
            box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
            transition: color 0.2s, box-shadow 0.2s;
        }

        .db90-input-wrapper input::placeholder {
            color: var(--muted-foreground);
        }

        /* Focus - focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] */
        .db90-input-wrapper input:focus {
            border-color: var(--ring);
            box-shadow: 0 0 0 3px oklch(from var(--ring) l c h / 50%);
        }

        /* Remember me */
        .db90-remember-me {
            display: none;
        }

        /* Form actions */
        .db90-form-actions {
            margin-top: 0.5rem;
        }

        /* Button - bg-primary text-primary-foreground */
        .db90-submit-button {
            width: 100%;
            height: 2.25rem;
            padding: 0.5rem 1rem;
            background-color: var(--primary);
            border: none;
            border-radius: 0.375rem;
            color: var(--primary-foreground);
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s;
        }

        .db90-submit-button:hover {
            background-color: oklch(from var(--primary) l c h / 90%);
        }

        .db90-submit-button:focus {
            outline: none;
            box-shadow: 0 0 0 3px oklch(from var(--ring) l c h / 50%);
        }

        /* Links */
        a {
            color: var(--primary);
            text-decoration: none;
        }

        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body class="db90-custom-login">
    <div class="db90-login-container">
        <!-- Left Panel -->
        <div class="db90-left-panel">
            <div class="db90-brand">
                <div class="db90-logo">
                    <span class="db90-logo-text">90</span>
                </div>
                <div class="db90-brand-text">
                    <h1 class="db90-brand-title">Aixle Insights</h1>
                    <p class="db90-brand-subtitle">AI Tool Analytics</p>
                </div>
            </div>

            <div class="db90-hero">
                <h2 class="db90-hero-title">Monitor, Analyze, Optimize</h2>
                <p class="db90-hero-description">Track AI tool usage across your organization with comprehensive analytics and security monitoring.</p>
            </div>

            <div class="db90-features">
                <div class="db90-feature">
                    <div class="db90-feature-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                        </svg>
                    </div>
                    <div class="db90-feature-content">
                        <h3 class="db90-feature-title">Real-time Analytics</h3>
                        <p class="db90-feature-description">Monitor usage, costs, and performance across all AI tools</p>
                    </div>
                </div>
                <div class="db90-feature">
                    <div class="db90-feature-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                    </div>
                    <div class="db90-feature-content">
                        <h3 class="db90-feature-title">Security Compliance</h3>
                        <p class="db90-feature-description">Automatic detection and sanitization of sensitive data</p>
                    </div>
                </div>
                <div class="db90-feature">
                    <div class="db90-feature-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                    </div>
                    <div class="db90-feature-content">
                        <h3 class="db90-feature-title">Enterprise Ready</h3>
                        <p class="db90-feature-description">Role-based access, audit logs, and SSO integration</p>
                    </div>
                </div>
            </div>

            <div class="db90-footer">
                <p>&copy; 2026 Dualboot Partners, LLC. All rights reserved.</p>
            </div>
        </div>

        <!-- Right Panel -->
        <div class="db90-right-panel">
            <div class="db90-login-card">
                <div class="db90-card-header">
                    <div class="db90-mobile-logo">
                        <span class="db90-mobile-logo-text">90</span>
                    </div>
                    <h2 class="db90-card-title">Welcome to Aixle Insights</h2>
                    <p class="db90-card-subtitle">Sign in to access your organization's AI tool analytics</p>
                </div>

                <div class="db90-card-content">
                    <#if message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                        <div class="db90-alert db90-alert-${message.type}">
                            <p>${kcSanitize(message.summary)?no_esc}</p>
                        </div>
                    </#if>

                    <#if realm.password && social.providers??>
                        <div class="db90-social-providers">
                            <#list social.providers as p>
                                <a id="social-${p.alias}" class="db90-social-button" href="${p.loginUrl}">
                                    <svg class="db90-google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                    </svg>
                                    <span>Continue with Google</span>
                                </a>
                            </#list>
                        </div>

                        <div class="db90-divider">
                            <span>Or continue with email</span>
                        </div>
                    </#if>

                    <#if realm.password>
                        <form id="kc-form-login" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post" class="db90-form">
                            <div class="db90-form-group">
                                <label for="username" class="db90-label">Email</label>
                                <div class="db90-input-wrapper">
                                    <svg class="db90-input-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <rect width="20" height="16" x="2" y="4" rx="2"/>
                                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                                    </svg>
                                    <input tabindex="1" id="username" name="username" value="${(login.username!'')}" type="text" autofocus autocomplete="email" placeholder="you@company.com" />
                                </div>
                            </div>

                            <div class="db90-form-group">
                                <label for="password" class="db90-label">Password</label>
                                <div class="db90-input-wrapper">
                                    <svg class="db90-input-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="7.5" cy="15.5" r="5.5"/>
                                        <path d="m21 2-9.6 9.6"/>
                                        <path d="m15.5 7.5 3 3L22 7l-3-3"/>
                                    </svg>
                                    <input tabindex="2" id="password" name="password" type="password" autocomplete="current-password" placeholder="••••••••" />
                                </div>
                            </div>

                            <#if realm.rememberMe && !usernameEditDisabled??>
                                <div class="db90-remember-me">
                                    <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox" <#if login.rememberMe??>checked</#if>>
                                    <label for="rememberMe">Remember me</label>
                                </div>
                            </#if>

                            <div class="db90-form-actions">
                                <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>
                                <button tabindex="4" name="login" id="kc-login" type="submit" class="db90-submit-button">Sign in</button>
                            </div>
                        </form>
                    </#if>

                </div>
            </div>
        </div>
    </div>
</body>
</html>
