import { z } from "zod";
import { mainFileProblem } from "./paths.js";

/** GET /api/health */
export const healthResponse = z.object({
  /** "draining" while the copy shuts down: it still answers, but takes no new requests. */
  status: z.enum(["ok", "draining"]),
  database: z.enum(["ok", "unavailable"]),
  /** "off" when this copy runs without Redis (REDIS_URL unset). */
  redis: z.enum(["ok", "unavailable", "off"]),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponse>;

/**
 * The plan sets the limits of the online services: storage, compile time a day and active
 * review links. Every plan has every service; Plus and Pro are paid. Plus also has a student price,
 * which gives the same plan.
 */
export const plan = z.enum(["free", "plus", "pro"]);
export type Plan = z.infer<typeof plan>;
export const paidPlan = z.enum(["plus", "pro"]);
export type PaidPlan = z.infer<typeof paidPlan>;

/** GET /api/me: the signed-in user. 401 without a session. */
/** A language the account pages and emails can be in. */
export const accountLanguage = z.enum(["en", "de", "es", "fr", "nl"]);
export type AccountLanguage = z.infer<typeof accountLanguage>;

export const meResponse = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  createdAt: z.iso.datetime(),
  plan,
  /** Profile photo from Google, Apple or Microsoft sign-in (a URL or a data: URL); null for email accounts. */
  image: z.string().nullable(),
  /** The interface language chosen for the account pages and emails; null follows the browser. */
  language: accountLanguage.nullable().optional(),
  /** The account's username, which addresses its published sites; null until it has one. */
  username: z.string().nullable().optional(),
});
export type MeResponse = z.infer<typeof meResponse>;

/** Body of every non-2xx response from /api routes outside /api/auth. */
export const errorResponse = z.object({
  error: z.string(),
  message: z.string(),
});
export type ErrorResponse = z.infer<typeof errorResponse>;

// Desktop sign-in: authorization code with PKCE (S256) and a loopback redirect (RFC 8252).
// The services app asks the signed-in user to allow the desktop app, then sends the browser
// to the editor's loopback listener with a one-time code; the editor trades it for a token.

/** PKCE code challenge: base64url SHA-256 of the verifier, no padding. */
export const codeChallenge = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** PKCE code verifier (RFC 7636): 43 to 128 unreserved characters. */
export const codeVerifier = z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/);

/**
 * The editor's loopback redirect: plain http to 127.0.0.1 or [::1] with an explicit port,
 * a plain path, no credentials, query or fragment. "localhost" is refused, as RFC 8252 advises.
 */
export const loopbackRedirectUri = z
  .string()
  .max(200)
  .regex(
    /^http:\/\/(?:127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})\/[A-Za-z0-9._~/-]*$/,
    "must be http://127.0.0.1:<port>/… or http://[::1]:<port>/…",
  )
  .refine(
    (value) => Number(/\]?:(\d+)\//.exec(value)?.[1]) <= 65535,
    "port out of range",
  );

/** POST /api/desktop/authorize (browser session): body. */
export const desktopAuthorizeRequest = z.object({
  codeChallenge,
  redirectUri: loopbackRedirectUri,
  state: z.string().min(16).max(200),
  /** The desktop app that asks (the sign-in page's client=…); Polemic when left out. */
  app: z.enum(["polemic", "cursive", "binder"]).optional(),
});
export type DesktopAuthorizeRequest = z.infer<typeof desktopAuthorizeRequest>;

/** POST /api/desktop/authorize: where to send the browser (the loopback URI with code and state). */
export const desktopAuthorizeResponse = z.object({ redirectTo: z.url() });
export type DesktopAuthorizeResponse = z.infer<typeof desktopAuthorizeResponse>;

/** POST /api/desktop/token: body. */
export const desktopTokenRequest = z.object({
  code: z.string().min(1).max(200),
  codeVerifier,
  redirectUri: loopbackRedirectUri,
  /** Shown on the account page next to the session, e.g. the computer's name. */
  deviceName: z.string().trim().max(100).optional(),
});
export type DesktopTokenRequest = z.infer<typeof desktopTokenRequest>;

/** POST /api/desktop/token: a bearer token for the API, revoked with DELETE /api/desktop/session. */
export const desktopTokenResponse = z.object({
  token: z.string(),
  /** Slides forward while the token is used. */
  expiresAt: z.iso.datetime(),
  user: meResponse,
});
export type DesktopTokenResponse = z.infer<typeof desktopTokenResponse>;

// Sessions: the browser sessions and desktop tokens of the signed-in user, listed on the
// account page. Tokens never leave the server; sessions are addressed by id.

/** One session of the signed-in user. */
export const sessionInfo = z.object({
  id: z.string(),
  client: z.enum(["browser", "desktop"]),
  /** The name the desktop app sent when it signed in; null for browsers and unnamed devices. */
  deviceName: z.string().nullable(),
  /** The desktop app the session belongs to; null for browsers. */
  app: z.enum(["polemic", "cursive", "binder"]).nullable(),
  userAgent: z.string().nullable(),
  /** Where the session was created. */
  ipAddress: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** Last use, to within a day. */
  lastActiveAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  /** The session making this request. */
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof sessionInfo>;

/** GET /api/sessions (browser session): current session first, then most recently used. */
export const sessionsResponse = z.object({ sessions: z.array(sessionInfo) });
export type SessionsResponse = z.infer<typeof sessionsResponse>;

// Sign in with Google, Apple and Microsoft, next to email and password.

export const socialProvider = z.enum(["google", "apple", "microsoft"]);
export type SocialProvider = z.infer<typeof socialProvider>;

/** GET /api/sign-in-methods (public): the providers this server has turned on, in display order. */
export const signInMethodsResponse = z.object({ providers: z.array(socialProvider) });
export type SignInMethodsResponse = z.infer<typeof signInMethodsResponse>;

/** A passkey on the account page. */
export const passkeyInfo = z.object({
  id: z.string(),
  /** Where it is kept, e.g. "iCloud Keychain"; null when unknown. */
  name: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
});
export type PasskeyInfo = z.infer<typeof passkeyInfo>;

/** GET /api/account/sign-in (browser session): how this account signs in. */
export const accountSignInResponse = z.object({
  /** True when the account has a password. */
  password: z.boolean(),
  /** Providers linked to the account. */
  providers: z.array(socialProvider),
  /** When this browser session signed in; without a password, deleting needs a recent one. */
  signedInAt: z.iso.datetime(),
  /** Two-step verification; null when it is off. */
  twoStep: z
    .object({
      /** When the authenticator app was added. */
      since: z.iso.datetime(),
      /** Unused recovery codes. */
      recoveryCodesLeft: z.number().int().nonnegative(),
    })
    .nullable(),
  passkeys: z.array(passkeyInfo),
  /** Until when this browser skips the code step; null when it isn't trusted. */
  trustedUntil: z.iso.datetime().nullable(),
});
export type AccountSignInResponse = z.infer<typeof accountSignInResponse>;

// Your data: an export of everything the account holds, and deleting the account.

/** Without a password, deleting the account needs a session at most this old. */
export const RECENT_SIGN_IN_MS = 10 * 60_000;

/**
 * POST /api/account/delete (browser session, same Origin). An account with a password confirms
 * with it; one without types its email address after signing in again (RECENT_SIGN_IN_MS).
 */
export const deleteAccountRequest = z.union([
  z.object({ password: z.string().min(1).max(1024) }),
  z.object({ email: z.string().min(1).max(320) }),
]);
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequest>;

// Billing: Plus and Pro subscriptions. The subscription's price decides the plan; without
// one the user is on Free.

export const billingInterval = z.enum(["month", "year"]);
export type BillingInterval = z.infer<typeof billingInterval>;

/** Subscription statuses. The API maps the provider's own statuses to these. */
export const subscriptionStatus = z.enum([
  "on_trial",
  "active",
  "paused",
  "past_due",
  "unpaid",
  "cancelled",
  "expired",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatus>;

/** GET /api/billing (browser session or desktop token). */
export const billingResponse = z.object({
  /** False when this server runs without billing: every account has Pro (self-hosted, development). */
  enabled: z.boolean(),
  /** True when this server offers Plus's student price at checkout. */
  studentPrice: z.boolean(),
  plan,
  /** A plan given by Polemic until a date, outside Stripe; null when none is running. */
  grant: z
    .object({ plan: paidPlan, endsAt: z.iso.datetime() })
    .nullable()
    .default(null),
  /** The subscription that decides the plan, or the latest one; null if the user never subscribed. */
  subscription: z
    .object({
      status: subscriptionStatus,
      /** Null when the plan's price is no longer configured on this server. */
      interval: billingInterval.nullable(),
      /** The plan the subscription's price gives; null when the price is no longer configured on this server. */
      plan: paidPlan.nullable(),
      /** On Plus's student price. */
      student: z.boolean(),
      renewsAt: z.iso.datetime().nullable(),
      endsAt: z.iso.datetime().nullable(),
      trialEndsAt: z.iso.datetime().nullable(),
    })
    .nullable(),
});
export type BillingResponse = z.infer<typeof billingResponse>;

/** POST /api/billing/checkout (browser session): body. */
export const checkoutRequest = z
  .object({
    plan: paidPlan,
    interval: billingInterval,
    /** Plus only, for the student price: the university or college the user studies at. Not verified. */
    student: z
      .object({
        institution: z
          .string()
          .trim()
          .min(1, "Enter your university or college")
          .max(200),
      })
      .optional(),
  })
  .refine((body) => !body.student || body.plan === "plus", {
    message: "The student price is for Plus only",
    path: ["student"],
  });
export type CheckoutRequest = z.infer<typeof checkoutRequest>;

/** POST /api/billing/checkout and POST /api/billing/portal: where to send the browser. */
export const billingRedirectResponse = z.object({ url: z.url() });
export type BillingRedirectResponse = z.infer<typeof billingRedirectResponse>;

/**
 * GET /api/usage (browser session or desktop token): the plan and what the user has used of it.
 * Compile time is counted per UTC day: the time each compile held a compile slot, failed ones too.
 */
export const usageResponse = z.object({
  plan,
  storage: z.object({
    usedBytes: z.number().int().nonnegative(),
    limitBytes: z.number().int().positive(),
  }),
  compile: z.object({
    /** Share of today's compile time used, rounded to the nearest whole percent, at most 100. */
    usedPercent: z.number().int().min(0).max(100),
    /** Start of the next UTC day. */
    resetsAt: z.iso.datetime(),
  }),
  reviewLinks: z.object({
    /** Unexpired review links across the user's projects. */
    count: z.number().int().nonnegative(),
    /** Null: unlimited. */
    limit: z.number().int().positive().nullable(),
  }),
});
export type UsageResponse = z.infer<typeof usageResponse>;

/**
 * GET /api/plans (public): what the website says about the plans. Compile time is given only as
 * how many times Free's daily amount each plan gets, rounded to the nearest whole number, so the
 * minutes stay on the server.
 */
export const plansResponse = z.object({
  compileMultiple: z.object({
    free: z.number().int().positive(),
    plus: z.number().int().positive(),
    pro: z.number().int().positive(),
  }),
});
export type PlansResponse = z.infer<typeof plansResponse>;

// Projects (phase 5): a local folder published from the desktop app. Its text files sync as one
// Yjs document over the WebSocket at SYNC_PATH or the document routes below (Hocuspocus; the document name is the project
// id, the token a desktop bearer token); binary assets go through the asset routes by hash.

/** Hocuspocus endpoint, on the services app's origin (ws: or wss:). */
export const SYNC_PATH = "/api/sync";

/** What a user may do in a project. Owners and editors write while the owner's storage has room. */
export const projectRole = z.enum(["owner", "editor", "commenter", "viewer"]);
export type ProjectRole = z.infer<typeof projectRole>;

/** Roles a review link can grant. */
export const linkRole = z.enum(["commenter", "viewer"]);
export type LinkRole = z.infer<typeof linkRole>;

export const projectName = z.string().trim().min(1).max(200);

/**
 * Where a project is edited. "desktop": a folder published one way from the desktop app, which
 * stays its source of truth, so the browser only reads it. "online": made in the browser and
 * edited there. "linked": a desktop folder that syncs both ways (phase 5b), so the browser edits
 * it too; the desktop app switches a "desktop" project to it.
 */
export const projectSource = z.enum(["desktop", "online", "linked"]);
export type ProjectSource = z.infer<typeof projectSource>;

/** The signed-in user's server storage: assets, Yjs documents and snapshots of the projects they own. limitBytes follows the plan. */
export const storageUsage = z.object({
  usedBytes: z.number().int().nonnegative(),
  limitBytes: z.number().int().positive(),
});
export type StorageUsage = z.infer<typeof storageUsage>;

/**
 * The app a project belongs to: "polemic", a LaTeX project of the editor, "cursive", a folder of
 * Markdown pages, or "binder", a research binder (Markdown items with their PDFs and kept pages).
 * All keep their files in the same document layout and sync the same way.
 */
export const projectApp = z.enum(["polemic", "cursive", "binder"]);
export type ProjectApp = z.infer<typeof projectApp>;

export const projectInfo = z.object({
  id: z.string(),
  name: z.string(),
  /** Servers before Cursive leave it out. */
  app: projectApp.default("polemic"),
  role: projectRole,
  owner: z.object({ id: z.string(), name: z.string() }),
  source: projectSource,
  /** False for commenters and viewers, and in the browser for projects published one way from the desktop app. */
  writable: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ProjectInfo = z.infer<typeof projectInfo>;

/**
 * GET /api/projects: projects the user owns or is a member of, newest first. ?app=cursive lists
 * Cursive's projects, ?app=binder Binder's and ?app=all every app's; without it the editor's, so
 * an editor from before Cursive never lists a project it can't open.
 */
export const projectsQuery = z.object({
  app: z.enum([...projectApp.options, "all"]).default("polemic"),
});

export const projectsResponse = z.object({
  projects: z.array(projectInfo),
  storage: storageUsage,
});
export type ProjectsResponse = z.infer<typeof projectsResponse>;

/**
 * POST /api/projects: body. Answers with a ProjectInfo. Desktop apps before linked projects leave
 * out source; newer ones send "linked".
 */
export const createProjectRequest = z.object({
  name: projectName,
  source: projectSource.default("desktop"),
  app: projectApp.default("polemic"),
});
export type CreateProjectRequest = z.infer<typeof createProjectRequest>;

/**
 * PATCH /api/projects/:id (owner): body. source "linked" turns a "desktop" project into a linked
 * one, once the desktop app syncs it both ways; other projects keep their source.
 */
export const updateProjectRequest = z
  .object({ name: projectName.optional(), source: z.literal("linked").optional() })
  .refine(
    (body) => body.name !== undefined || body.source !== undefined,
    "Send a name or a source",
  );
export type UpdateProjectRequest = z.infer<typeof updateProjectRequest>;

// Usernames: an account's name in the addresses of its published sites, <SITES_URL>/@<username>/.
// An account gets one the first time it publishes, made from its name, and can change it. The
// old name then leads to the new one for USERNAME_REDIRECT_DAYS, and nobody else can take it.

/** Names nobody can take: our products, and names people could mistake for us. */
export const RESERVED_USERNAMES = [
  "about",
  "abuse",
  "account",
  "admin",
  "administrator",
  "api",
  "app",
  "binder",
  "blog",
  "cursive",
  "dwarsbit",
  "help",
  "info",
  "legal",
  "mail",
  "moderator",
  "official",
  "polemic",
  "postmaster",
  "privacy",
  "root",
  "scholarkit",
  "security",
  "sites",
  "staff",
  "status",
  "support",
  "system",
  "team",
  "terms",
  "webmaster",
  "www",
] as const;

/** How long an old username leads to the new one after a change. */
export const USERNAME_REDIRECT_DAYS = 90;

/** A username: 3 to 30 lowercase letters, digits and hyphens, a letter or digit at each end. */
export const username = z
  .string()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/,
    "Use 3 to 30 lowercase letters, digits and hyphens, with a letter or digit at each end",
  )
  .refine(
    (name) => !(RESERVED_USERNAMES as readonly string[]).includes(name),
    "This username is reserved",
  );

/**
 * GET /api/account/username: the account's username, the address of its page of published
 * sites (null while publishing is off or it has no username), and the old usernames that still
 * lead to it.
 */
export const usernameResponse = z.object({
  username: z.string().nullable(),
  pageUrl: z.url().nullable(),
  previous: z.array(
    z.object({
      username: z.string(),
      /** When the old name stops leading here and anyone can take it. */
      until: z.iso.datetime(),
    }),
  ),
});
export type UsernameResponse = z.infer<typeof usernameResponse>;

/**
 * PUT /api/account/username (browser session): changes the username and answers with a
 * UsernameResponse. 409 "username_taken"; 429 "rate_limited" after too many changes.
 */
export const setUsernameRequest = z.object({ username });
export type SetUsernameRequest = z.infer<typeof setUsernameRequest>;

// Sites: a Cursive project published as a website, at <SITES_URL>/@<username>/<slug>/, where the
// username is the owner's. The server renders the project's Markdown pages when the owner
// publishes; publishing again replaces them. <SITES_URL>/@<username> lists the owner's sites.

/** Names a site can't take. */
export const RESERVED_SITE_SLUGS = [
  "about",
  "account",
  "admin",
  "api",
  "app",
  "assets",
  "blog",
  "cursive",
  "docs",
  "help",
  "home",
  "legal",
  "login",
  "polemic",
  "pricing",
  "privacy",
  "projects",
  "robots",
  "settings",
  "sign-in",
  "sign-up",
  "sites",
  "static",
  "status",
  "support",
  "terms",
  "www",
] as const;

/** A site's name: 3 to 40 lowercase letters, digits and hyphens, a letter or digit at each end. */
export const siteSlug = z
  .string()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/,
    "Use 3 to 40 lowercase letters, digits and hyphens, with a letter or digit at each end",
  )
  .refine(
    (slug) => !(RESERVED_SITE_SLUGS as readonly string[]).includes(slug),
    "This address is reserved",
  );

/**
 * The looks a site can take. "default" is Cursive's own; the others bring their colors,
 * typefaces and shapes to every page, slide and quiz of the site.
 */
export const SITE_THEMES = [
  "default",
  "journal",
  "plum",
  "blueprint",
  "midnight",
  "poster",
] as const;
export const siteTheme = z.enum(SITE_THEMES);
export type SiteTheme = z.infer<typeof siteTheme>;

/** A site's address below SITES_URL, without the @: "<username>/<slug>". */
export const siteAddress = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]\/[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/);

export const siteInfo = z.object({
  slug: z.string(),
  /** <SITES_URL>/@<username>/<slug>/ */
  url: z.url(),
  title: z.string(),
  pages: z.number().int().nonnegative(),
  theme: siteTheme,
  /** When the pages were last published. */
  publishedAt: z.iso.datetime(),
});
export type SiteInfo = z.infer<typeof siteInfo>;

/**
 * GET /api/projects/:id/site (any role): the published site, or null; a free name made from the
 * project's name; the owner's username, or the one the first publish will give them; and what
 * the owner's site addresses start with, <SITES_URL>/@<username>/.
 */
export const siteResponse = z.object({
  site: siteInfo.nullable(),
  suggestedSlug: z.string(),
  username: z.string(),
  /** Whether the owner has the username yet; false until their first publish. */
  usernameSaved: z.boolean(),
  baseUrl: z.url(),
  /** <SITES_URL>/@<username>: the page that lists the owner's sites. */
  ownerPageUrl: z.url(),
  /**
   * The themes the owner's plan gives: every theme on Plus and Pro, only "default" on Free. A
   * server from before plan themes leaves it out: every theme.
   */
  themes: z.array(siteTheme).optional(),
});
export type SiteResponse = z.infer<typeof siteResponse>;

/**
 * POST /api/projects/:id/site (owner): body. Publishes the project's pages as they are on the
 * server now and answers with the SiteInfo. An owner without a username gets one first. slug sets or changes the address; without it the
 * site keeps its address, or takes the suggested one the first time. 409 "slug_taken". theme sets
 * the site's look; without it the site keeps the one it has, or takes "default" the first time.
 * Themes other than "default" come with Plus and Pro: 403 "theme_unavailable" for another one on
 * Free, and a site that has one from an earlier plan gets "default" when it is published again.
 */
export const publishSiteRequest = z.object({
  slug: siteSlug.optional(),
  theme: siteTheme.optional(),
});
export type PublishSiteRequest = z.infer<typeof publishSiteRequest>;

// Learners: readers of a published tutorial (a site with quizzes or assignments). They start
// anonymous, with their progress in the browser. Signing in with a Scholarkit account keeps the
// progress on the server and lets them hand in assignments; the site's owner sees their name,
// email address, progress and work.

/** A page's address in a site, as site_page.path has it: "" for the home page. */
export const sitePagePath = z
  .string()
  .max(600)
  .regex(/^(?:[^/\s][^\s]*)?$/, "Not a page of a site");

/** GET /api/learn/site?site=<username>/<slug> (public): what the sign-in page says about the site. */
export const learnSiteResponse = z.object({
  /** The site's address now: "<username>/<slug>". */
  address: siteAddress,
  title: z.string(),
  url: z.url(),
  author: z.string(),
});
export type LearnSiteResponse = z.infer<typeof learnSiteResponse>;

/**
 * POST /api/learn/authorize (browser session, from the services app only): signs the user in to
 * one site as a learner. Answers with where to send the browser: the page they came from, with a
 * token for that site in the fragment. 403 "learner_accounts_unavailable" when the owner's plan
 * has no learner accounts.
 */
export const learnAuthorizeRequest = z.object({
  site: siteAddress,
  returnPath: sitePagePath.default(""),
});
export type LearnAuthorizeRequest = z.infer<typeof learnAuthorizeRequest>;
export const learnAuthorizeResponse = z.object({ redirectTo: z.url() });
export type LearnAuthorizeResponse = z.infer<typeof learnAuthorizeResponse>;

/** What an assignment is graded on: one row of its rubric. */
export const rubricCriterion = z.object({
  criterion: z.string(),
  points: z.number().int().nonnegative(),
});
export type RubricCriterion = z.infer<typeof rubricCriterion>;

/** The author's grade for handed-in work. */
export const learnerGrade = z.object({
  score: z.number().int().nonnegative(),
  /** The points per criterion, in the order of the rubric the work was graded on; empty without one. */
  criteria: z.array(z.number().int().nonnegative()),
  feedback: z.string(),
  gradedAt: z.iso.datetime(),
});
export type LearnerGrade = z.infer<typeof learnerGrade>;

export const learnerSubmissionInfo = z.object({
  page: z.string(),
  pageTitle: z.string(),
  assignment: z.string(),
  title: z.string(),
  text: z.string(),
  /** A file handed in with the text. GET /api/projects/:id/learners/:userId/file?page=…&assignment=… sends it. */
  file: z
    .object({
      name: z.string(),
      size: z.number().int().nonnegative(),
      contentType: z.string(),
    })
    .nullable(),
  /** The assignment as the published site has it now: null when the site no longer has it. */
  points: z.number().int().nonnegative().nullable(),
  rubric: z.array(rubricCriterion),
  grade: learnerGrade.nullable(),
  submittedAt: z.iso.datetime(),
});
export type LearnerSubmissionInfo = z.infer<typeof learnerSubmissionInfo>;

export const learnerInfo = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  /** Pages of the published site they marked complete. */
  pagesDone: z.number().int().nonnegative(),
  /** Points from quizzes answered correctly and from graded assignments. */
  points: z.number().int().nonnegative(),
  lastActiveAt: z.iso.datetime(),
  submissions: z.array(learnerSubmissionInfo),
});
export type LearnerInfo = z.infer<typeof learnerInfo>;

/** GET /api/projects/:id/learners (owner): everyone signed in to the project's site, by name. */
export const learnersResponse = z.object({
  /** What the published site has now: its pages and the points its quizzes and assignments give. */
  pages: z.number().int().nonnegative(),
  points: z.number().int().nonnegative(),
  learners: z.array(learnerInfo),
});
export type LearnersResponse = z.infer<typeof learnersResponse>;

/** The longest feedback on handed-in work. */
export const MAX_FEEDBACK_CHARS = 10_000;

/**
 * PUT /api/projects/:id/learners/:userId/grade (owner): grades what a learner handed in and
 * answers with the LearnerGrade. With a rubric, `criteria` holds the points per criterion and the
 * score is their sum; without one, `score` is the grade. Points above what the assignment gives
 * are refused. 404 "no_such_submission". DELETE with the same query takes the grade away.
 */
export const gradeRequest = z.object({
  page: sitePagePath,
  assignment: z.string().min(1).max(40),
  score: z.number().int().min(0).max(100_000).optional(),
  criteria: z.array(z.number().int().min(0).max(1000)).max(100).optional(),
  feedback: z.string().max(MAX_FEEDBACK_CHARS).default(""),
});
export type GradeRequest = z.infer<typeof gradeRequest>;

/** A review link. Its token is shown only once, in CreateReviewLinkResponse. */
export const reviewLinkInfo = z.object({
  id: z.string(),
  role: linkRole,
  /** Null: the link works until it is deleted. */
  expiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  /**
   * False when the owner's plan has fewer active review links than the owner has links: only the
   * newest unexpired ones work, the others answer 403 "link_inactive" until the owner deletes
   * links or upgrades.
   */
  active: z.boolean(),
});
export type ReviewLinkInfo = z.infer<typeof reviewLinkInfo>;

/** GET /api/projects/:id/links (owner). */
export const reviewLinksResponse = z.object({ links: z.array(reviewLinkInfo) });
export type ReviewLinksResponse = z.infer<typeof reviewLinksResponse>;

/**
 * POST /api/projects/:id/links (owner): body. 409 "review_link_limit" when the owner's plan has
 * no active review link left (Free has one, across all projects).
 */
export const createReviewLinkRequest = z.object({
  role: linkRole,
  expiresInDays: z.number().int().min(1).max(365).optional(),
});
export type CreateReviewLinkRequest = z.infer<typeof createReviewLinkRequest>;

/** A review link's code in a short address, <SITES_URL>/<code>: 10 letters and digits. */
export const reviewLinkCode = z.string().regex(/^[A-Za-z0-9]{10}$/);

/**
 * POST /api/projects/:id/links: the new link with its URL (<PUBLIC_URL>/r/<token>) and, when the
 * server has a sites host, the same link as a short address (<SITES_URL>/<token>).
 */
export const createReviewLinkResponse = reviewLinkInfo.extend({
  url: z.url(),
  shortUrl: z.url().optional(),
});
export type CreateReviewLinkResponse = z.infer<typeof createReviewLinkResponse>;

/** GET /api/review/:token (no session needed): what the link opens. 404 when unknown or expired. */
export const reviewLinkResponse = z.object({
  project: z.object({ id: z.string(), name: z.string() }),
  role: linkRole,
  /** The latest published version, which the review page shows; null before the first publish. */
  snapshot: z.object({ id: z.string(), createdAt: z.iso.datetime() }).nullable(),
});
export type ReviewLinkResponse = z.infer<typeof reviewLinkResponse>;

// Members and invites (phase 5b). The owner invites people by email; the invite page signs them
// up or in, then adds the project to their account. Editors write with a free account, and what
// they add counts against the owner's storage. Only the owner invites and manages members.

/**
 * Roles an invite grants. A Polemic project takes editor or commenter; Cursive and Binder have no
 * comments, so theirs take editor or viewer (inviteRolesFor).
 */
export const inviteRole = z.enum(["editor", "commenter", "viewer"]);
export type InviteRole = z.infer<typeof inviteRole>;

/** The roles an invite to a project of this app can grant, and a member of it can be given. */
export const inviteRolesFor = (app: ProjectApp): readonly InviteRole[] =>
  app === "polemic" ? ["editor", "commenter"] : ["editor", "viewer"];

/** Roles a member can have; viewer only on members from before invites. */
export const memberRole = projectRole.exclude(["owner"]);
export type MemberRole = z.infer<typeof memberRole>;

export const projectMemberInfo = z.object({
  userId: z.string(),
  name: z.string(),
  /** Only the owner sees members' addresses. */
  email: z.string().optional(),
  role: memberRole,
  addedAt: z.iso.datetime(),
});
export type ProjectMemberInfo = z.infer<typeof projectMemberInfo>;

/** An invite not yet accepted. Its token is only in the email. */
export const projectInviteInfo = z.object({
  id: z.string(),
  email: z.string(),
  role: inviteRole,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type ProjectInviteInfo = z.infer<typeof projectInviteInfo>;

/**
 * GET /api/projects/:id/members: members, oldest first, and open invites, newest first. Members
 * see each other's names and roles; addresses and invites are for the owner.
 */
export const projectMembersResponse = z.object({
  members: z.array(projectMemberInfo),
  invites: z.array(projectInviteInfo),
});
export type ProjectMembersResponse = z.infer<typeof projectMembersResponse>;

/**
 * POST /api/projects/:id/invites (owner): body. Emails the invite and answers with a
 * ProjectInviteInfo (201). The role is one of inviteRolesFor the project's app. Inviting an
 * address again sends a new email with a new link and role.
 * 409 "already_member" for someone in the project, 429 "too_many_invites" past the hourly limit.
 */
export const createInviteRequest = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  role: inviteRole,
});
export type CreateInviteRequest = z.infer<typeof createInviteRequest>;

/** PATCH /api/projects/:id/members/:userId (owner): body, a role of inviteRolesFor. Answers with the ProjectMemberInfo. */
export const updateMemberRequest = z.object({ role: inviteRole });
export type UpdateMemberRequest = z.infer<typeof updateMemberRequest>;

/** GET /api/invites/:token (no session needed): what the invite opens. 404 when unknown or expired. */
export const inviteResponse = z.object({
  project: z.object({ id: z.string(), name: z.string() }),
  /** The app the project opens in. */
  app: projectApp.default("polemic"),
  /** Null when the account that sent it is gone. */
  invitedBy: z.string().nullable(),
  role: inviteRole,
  /** The address the invite went to; any signed-in account can accept it. */
  email: z.string(),
  expiresAt: z.iso.datetime(),
});
export type InviteResponse = z.infer<typeof inviteResponse>;

/** POST /api/invites/:token/accept (signed in): adds the project and answers with its ProjectInfo. */

/** An asset's address: SHA-256 of its bytes, lowercase hex. */
export const assetHash = z.string().regex(/^[0-9a-f]{64}$/);

export const assetInfo = z.object({
  hash: assetHash,
  size: z.number().int().nonnegative(),
  contentType: z.string(),
  createdAt: z.iso.datetime(),
});
export type AssetInfo = z.infer<typeof assetInfo>;

/**
 * GET /api/projects/:id/assets (any role): the stored assets, so the desktop app uploads only
 * missing ones. PUT /api/projects/:id/assets/:hash (writable) takes the raw bytes and answers
 * 201 with an AssetInfo, or 200 when the asset was already stored; GET .../assets/:hash serves them.
 */
export const assetsResponse = z.object({ assets: z.array(assetInfo) });
export type AssetsResponse = z.infer<typeof assetsResponse>;

// The document over HTTP, for the desktop app's Publish (phase 5a): the editor keeps its own copy
// of the Yjs document and exchanges updates with the server's, as a WebSocket client would.
// Updates applied here reach the WebSocket clients of the same document.

/**
 * POST /api/projects/:id/document/sync (any role): body. The state vector of the caller's copy
 * (Y.encodeStateVector), base64; an empty copy sends the vector of an empty document.
 */
export const documentSyncRequest = z.object({ stateVector: z.base64() });
export type DocumentSyncRequest = z.infer<typeof documentSyncRequest>;

/** POST /api/projects/:id/document/sync: what the caller's copy lacks, and the server's vector. */
export const documentSyncResponse = z.object({
  /** Y.encodeStateAsUpdate(server, stateVector), base64. */
  update: z.base64(),
  /** The server's state vector, base64: the caller sends Y.encodeStateAsUpdate(copy, it). */
  stateVector: z.base64(),
});
export type DocumentSyncResponse = z.infer<typeof documentSyncResponse>;

// POST /api/projects/:id/document/update (writable) takes a Yjs update as the raw body
// (application/octet-stream) and answers 204; 400 invalid_update, 413 update_too_large or
// quota_exceeded.

/** A published version: the document as it was, and the PDF and SyncTeX compiled from it. */
export const snapshotInfo = z.object({
  id: z.string(),
  /** The main .tex file, project-relative. */
  main: z.string().nullable(),
  /** Asset hashes of the PDF and its .synctex.gz; null when the owner published without them. */
  pdf: assetHash.nullable(),
  synctex: assetHash.nullable(),
  /** Bytes of the stored document state. */
  size: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type SnapshotInfo = z.infer<typeof snapshotInfo>;

/**
 * POST /api/projects/:id/snapshots (owner): body. Publishes the server's document
 * as it is now; upload the PDF and SyncTeX as assets first. Answers 201 with a SnapshotInfo, or
 * 409 snapshot_assets_missing when an asset is not stored.
 */
export const publishSnapshotRequest = z.object({
  main: z
    .string()
    .refine(
      (path) => mainFileProblem(path) === null,
      "main must be a project-relative .tex file",
    )
    .optional(),
  pdf: assetHash.optional(),
  synctex: assetHash.optional(),
});
export type PublishSnapshotRequest = z.infer<typeof publishSnapshotRequest>;

export const snapshotAssetsMissing = errorResponse.extend({
  error: z.literal("snapshot_assets_missing"),
  missing: z.array(assetHash),
});
export type SnapshotAssetsMissing = z.infer<typeof snapshotAssetsMissing>;

/** GET /api/projects/:id/snapshots (any role): newest first. */
export const snapshotsResponse = z.object({ snapshots: z.array(snapshotInfo) });
export type SnapshotsResponse = z.infer<typeof snapshotsResponse>;

// Snapshots (phase 5b): the project's history. While the project changes, the server keeps its
// document once an hour; older ones are thinned out. Any member can look back at them, and the
// owner and editors can restore the whole project or single files. A restore is an edit like
// any other: it reaches every copy of the project, and the project as it was just before is kept
// as a snapshot too.

/** published: for review links; hourly: taken while the project changes; restore: just before a restore. */
export const snapshotKind = z.enum(["published", "hourly", "restore"]);
export type SnapshotKind = z.infer<typeof snapshotKind>;

export const historySnapshot = z.object({
  id: z.string(),
  kind: snapshotKind,
  /** Bytes of the stored document state. */
  size: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type HistorySnapshot = z.infer<typeof historySnapshot>;

/** GET /api/projects/:id/history (any role): every kind, newest first. */
export const historyResponse = z.object({ snapshots: z.array(historySnapshot) });
export type HistoryResponse = z.infer<typeof historyResponse>;

/** GET /api/projects/:id/history/:snapshotId (any role): the project's files as the snapshot holds them. */
export const historyFilesResponse = z.object({
  snapshot: historySnapshot,
  files: z.array(z.object({ path: z.string(), text: z.string() })),
  assets: z.array(
    z.object({
      path: z.string(),
      hash: assetHash,
      size: z.number().int().nonnegative(),
      type: z.string(),
    }),
  ),
});
export type HistoryFilesResponse = z.infer<typeof historyFilesResponse>;

/**
 * POST /api/projects/:id/history/:snapshotId/restore (owner and editors): body. Without paths the
 * whole project goes back to the snapshot, except comments, which stay as they are; with paths
 * only those files do (a path the snapshot lacks is deleted). Answers 204.
 */
export const restoreSnapshotRequest = z.object({
  paths: z.array(z.string().min(1).max(1024)).min(1).max(1000).optional(),
});
export type RestoreSnapshotRequest = z.infer<typeof restoreSnapshotRequest>;

// The review page (phase 5a step 4): a review link's holder reads the latest snapshot, its PDF
// and SyncTeX, and the project's comments, and a commenter link adds comments. Comments are
// files in the document (.polemic/comments/<id>.json), as the desktop app keeps them on disk.

/** Where the project's comments live, one JSON file per comment. */
export const COMMENTS_DIR = ".polemic/comments";

/** The categories the desktop app knows; it shows anything else as a note. */
export const commentCategory = z.enum([
  "change",
  "source",
  "question",
  "wording",
  "verify",
  "note",
]);
export type CommentCategory = z.infer<typeof commentCategory>;

/** The anchored text and its 1-based line when the comment was made; the text is the truth. */
export const commentAnchor = z.object({
  text: z.string().min(1).max(10_000),
  line: z.number().int().positive(),
});
export type CommentAnchor = z.infer<typeof commentAnchor>;

/** Who wrote a comment from the review page: an account's name, or a name the reviewer typed. */
export const commentAuthor = z.object({
  name: z.string(),
  /** False for a typed name: anyone with the link could have written it. */
  verified: z.boolean(),
});
export type CommentAuthor = z.infer<typeof commentAuthor>;

/** A comment file as the desktop app writes it, plus what the review page adds. */
export const projectComment = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  /** Project-relative path of the file it is about. */
  file: z.string(),
  category: z.string(),
  text: z.string(),
  /** Milliseconds since 1970. */
  createdAt: z.number().int().nonnegative(),
  resolved: z.boolean(),
  /** Null: about the whole file. */
  anchor: commentAnchor.nullable(),
  /** Absent for the owner's own comments. */
  author: commentAuthor.optional(),
  /** The comment this one answers. */
  replyTo: z.string().optional(),
  /** A reply to a suggestion's note (the desktop app's key for it). */
  suggestion: z.string().optional(),
});
export type ProjectComment = z.infer<typeof projectComment>;

/** A text file of a snapshot. */
export const reviewFile = z.object({ path: z.string(), text: z.string() });
export type ReviewFile = z.infer<typeof reviewFile>;

/**
 * GET /api/review/:token/snapshot (no session needed): the latest published version as files.
 * The PDF and SyncTeX are at /api/review/:token/pdf and .../synctex when `pdf` and `synctex` say so.
 * 404 before the first publish.
 */
export const reviewSnapshotResponse = z.object({
  snapshot: z.object({
    id: z.string(),
    main: z.string().nullable(),
    pdf: z.boolean(),
    synctex: z.boolean(),
    createdAt: z.iso.datetime(),
  }),
  /** Text files by path, comment files left out. */
  files: z.array(reviewFile),
  /** Binary files by path; the review page lists them but does not serve them. */
  assets: z.array(
    z.object({
      path: z.string(),
      size: z.number().int().nonnegative(),
      type: z.string(),
    }),
  ),
});
export type ReviewSnapshotResponse = z.infer<typeof reviewSnapshotResponse>;

/** GET /api/review/:token/comments (no session needed): the project's comments now, oldest first. */
export const reviewCommentsResponse = z.object({ comments: z.array(projectComment) });
export type ReviewCommentsResponse = z.infer<typeof reviewCommentsResponse>;

/**
 * POST /api/review/:token/comments (commenter links): body. Signed-in reviewers comment under
 * their account's name; others give `name`, shown as unverified. Answers 201 with the comment.
 */
export const createReviewCommentRequest = z.object({
  file: z.string().min(1).max(1024),
  anchor: commentAnchor.nullable(),
  text: z.string().trim().min(1).max(10_000),
  category: commentCategory.default("note"),
  name: z.string().trim().min(1).max(80).optional(),
  replyTo: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,100}$/)
    .optional(),
});
export type CreateReviewCommentRequest = z.infer<typeof createReviewCommentRequest>;

// Compile service (phase 6, internal: only the API calls it). POST /jobs?main=<path>&engine=<engine>
// takes a tar of the project's files and answers with a tar: result.json first, then one entry
// per output file under outputs/<kind>. Nothing about a job is kept after the answer.

/** The engines latexmk may drive; anything else is refused. */
export const texEngine = z.enum(["pdflatex", "xelatex", "lualatex"]);
export type TexEngine = z.infer<typeof texEngine>;

export const compileStatus = z.enum(["success", "failure", "timeout"]);
export type CompileStatus = z.infer<typeof compileStatus>;

/** What a compile leaves in build/ that the editor uses: <stem>.pdf, .synctex.gz, .log, .blg. */
export const compileOutputKind = z.enum(["pdf", "synctex", "log", "blg"]);
export type CompileOutputKind = z.infer<typeof compileOutputKind>;

/** result.json in the compile service's answer. */
export const compileJobResult = z.object({
  status: compileStatus,
  engine: texEngine,
  durationMs: z.number().int().nonnegative(),
  /** latexmk's own output (stdout, then stderr), with job folder paths made project-relative. */
  output: z.string(),
  /** The output files that follow in the tar, in this order. */
  outputs: z.array(
    z.object({ kind: compileOutputKind, size: z.number().int().nonnegative() }),
  ),
});
export type CompileJobResult = z.infer<typeof compileJobResult>;

/** GET /health on the compile service. */
export const compileServiceHealth = z.object({
  status: z.literal("ok"),
  slots: z.number().int().positive(),
  free: z.number().int().nonnegative(),
  /** E.g. "TeX Live 2026". */
  texlive: z.string(),
});
export type CompileServiceHealth = z.infer<typeof compileServiceHealth>;

// Cloud compile (phase 6): the editor sends a manifest of the project's files by
// SHA-256, uploads those the server has not cached, and gets the outputs as links.
//   1. POST /api/compile with a CompileRequest.
//   2. 409 CompileFilesMissing: PUT each missing file's bytes to /api/compile/files/:hash
//      (201, or 200 when already cached; 400 hash_mismatch), then send step 1 again.
//   3. 200 CompileResponse once the job ran. The request stays open while it runs; dropping it
//      kills the job, and a newer compile from the same user answers this one 409 superseded.
// Other answers: 413 project_too_large, 429 rate_limited and 503 compile_busy (both with
// Retry-After), 429 compile_limit once today's compile time is used (Retry-After: seconds to
// the next UTC day), 502 compile_unavailable, 404 compile_disabled when the server has no compile.

/** One file of the project to compile. Paths are project-relative and "/"-separated (projectPathProblem). */
export const compileFile = z.object({
  path: z.string(),
  hash: assetHash,
  size: z.number().int().nonnegative(),
});
export type CompileFile = z.infer<typeof compileFile>;

/** POST /api/compile: body. main is one of the files and ends in .tex. */
export const compileRequest = z.object({
  main: z.string(),
  engine: texEngine,
  files: z.array(compileFile),
});
export type CompileRequest = z.infer<typeof compileRequest>;

/** POST /api/projects/:id/compile: body. The server compiles the project's stored files. */
export const compileProjectRequest = z.object({
  main: z.string(),
  engine: texEngine,
});
export type CompileProjectRequest = z.infer<typeof compileProjectRequest>;

/** POST /api/projects/:id/compile: 409 when the document names assets the server doesn't have. */
export const compileAssetsMissing = errorResponse.extend({
  error: z.literal("assets_missing"),
  /** Project-relative paths whose bytes were never uploaded. */
  missing: z.array(z.string()),
});
export type CompileAssetsMissing = z.infer<typeof compileAssetsMissing>;

/** POST /api/compile: 409 when files are not in the user's compile cache. */
export const compileFilesMissing = errorResponse.extend({
  error: z.literal("files_missing"),
  /** Hashes to upload, each once. */
  missing: z.array(assetHash),
});
export type CompileFilesMissing = z.infer<typeof compileFilesMissing>;

/** PUT /api/compile/files/:hash: the cached file. */
export const compileFileInfo = z.object({
  hash: assetHash,
  size: z.number().int().nonnegative(),
});
export type CompileFileInfo = z.infer<typeof compileFileInfo>;

/** POST /api/compile: the finished job. status "failure" and "timeout" are answers too, with the log. */
export const compileResponse = z.object({
  id: z.string(),
  status: compileStatus,
  engine: texEngine,
  durationMs: z.number().int().nonnegative(),
  /** latexmk's own output, naming project-relative files. */
  output: z.string(),
  /**
   * Where to fetch each output (GET, same user, until expiresAt), to write as build/<stem>.pdf,
   * .synctex.gz, .log and .blg. Only the user's latest compile is kept.
   */
  outputs: z.array(
    z.object({
      kind: compileOutputKind,
      size: z.number().int().nonnegative(),
      url: z.url(),
    }),
  ),
  expiresAt: z.iso.datetime(),
});
export type CompileResponse = z.infer<typeof compileResponse>;

// Admin portal (/admin): accounts named in ADMIN_EMAILS see every account, its plan and usage.
// Browser sessions only, from a sign-in at most ADMIN_SIGN_IN_MAX_AGE_MS old (403 sign_in_again
// otherwise) that passed two-step verification or used a passkey (403 two_step_required);
// everyone else gets 404. Admins see account details and sizes, never project files.

/** An admin's browser session must come from a sign-in at most this old. */
export const ADMIN_SIGN_IN_MAX_AGE_MS = 12 * 60 * 60_000;

/** How an account signs in: a password or a provider. */
export const signInMethod = z.enum(["password", "google", "apple", "microsoft"]);
export type SignInMethod = z.infer<typeof signInMethod>;

/** GET /api/admin/session: the signed-in admin. */
export const adminSessionResponse = z.object({
  email: z.email(),
  /** When this browser session signed in; the portal closes ADMIN_SIGN_IN_MAX_AGE_MS later. */
  signedInAt: z.iso.datetime(),
});
export type AdminSessionResponse = z.infer<typeof adminSessionResponse>;

export const adminUserState = z.enum(["verified", "unverified", "suspended"]);
export type AdminUserState = z.infer<typeof adminUserState>;

export const adminUserSort = z.enum(["signed_up", "last_active", "storage"]);
export type AdminUserSort = z.infer<typeof adminUserSort>;

/** GET /api/admin/users: query. Every filter is optional; newest first by default. */
export const adminUsersQuery = z.object({
  /** Part of the email or name, without case. */
  q: z.string().trim().max(320).optional(),
  plan: plan.optional(),
  state: adminUserState.optional(),
  method: signInMethod.optional(),
  sort: adminUserSort.default("signed_up"),
  page: z.coerce.number().int().positive().default(1),
});
export type AdminUsersQuery = z.input<typeof adminUsersQuery>;

export const ADMIN_USERS_PAGE_SIZE = 50;

/** One account in the admin list. */
export const adminUserRow = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  plan,
  signInMethods: z.array(signInMethod),
  createdAt: z.iso.datetime(),
  /** The latest use of any of the account's sessions, to within a day; null with no session left. */
  lastActiveAt: z.iso.datetime().nullable(),
  storageBytes: z.number().int().nonnegative(),
  storageLimitBytes: z.number().int().positive(),
  /** Cloud compile time today (UTC). */
  compileSecondsToday: z.number().int().nonnegative(),
  suspended: z.boolean(),
});
export type AdminUserRow = z.infer<typeof adminUserRow>;

/** GET /api/admin/users */
export const adminUsersResponse = z.object({
  users: z.array(adminUserRow),
  /** Accounts matching the filters, across all pages. */
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type AdminUsersResponse = z.infer<typeof adminUsersResponse>;

/** GET /api/admin/users/:id: one account in full, without project contents. */
export const adminUserResponse = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    createdAt: z.iso.datetime(),
    signInMethods: z.array(signInMethod),
    /** Two-step verification is on. */
    twoStep: z.boolean(),
    /** How many passkeys the account has. */
    passkeys: z.number().int().nonnegative(),
  }),
  plan,
  /** False when this server runs without billing: every account has Pro. */
  billing: z.boolean(),
  /** Null when the account is not suspended. */
  suspension: z
    .object({
      since: z.iso.datetime(),
      /** Null: until an admin lifts it. */
      until: z.iso.datetime().nullable(),
      reason: z.string(),
    })
    .nullable(),
  /** The running plan grant, if any. */
  grant: z
    .object({
      id: z.string(),
      plan: paidPlan,
      endsAt: z.iso.datetime(),
      note: z.string().nullable(),
      grantedBy: z.string(),
      createdAt: z.iso.datetime(),
    })
    .nullable(),
  /** The account is listed in ADMIN_EMAILS: it can't be suspended, signed out or deleted here. */
  admin: z.boolean(),
  /** The latest admin actions on this account, newest first. */
  history: z.array(z.lazy(() => adminActionEntry)),
  /** Latest first. */
  subscriptions: z.array(
    z.object({
      id: z.string(),
      plan: paidPlan,
      /** On Plus's student price. */
      student: z.boolean(),
      interval: billingInterval.nullable(),
      status: subscriptionStatus,
      /** Student price: the university or college given at checkout. */
      institution: z.string().nullable(),
      renewsAt: z.iso.datetime().nullable(),
      endsAt: z.iso.datetime().nullable(),
      trialEndsAt: z.iso.datetime().nullable(),
      testMode: z.boolean(),
      createdAt: z.iso.datetime(),
      /** The subscription that decides the plan. */
      deciding: z.boolean(),
      /** The customer in the Stripe dashboard. */
      stripeUrl: z.url(),
    }),
  ),
  usage: z.object({
    storage: z.object({
      usedBytes: z.number().int().nonnegative(),
      limitBytes: z.number().int().positive(),
    }),
    compile: z.object({
      /** The plan's daily allowance; admins see the minutes. */
      limitSeconds: z.number().int().positive(),
      /** The last 30 UTC days, oldest first, days without compiles included. */
      days: z.array(
        z.object({
          day: z.iso.date(),
          seconds: z.number().int().nonnegative(),
          compiles: z.number().int().nonnegative(),
        }),
      ),
    }),
    reviewLinks: z.object({
      count: z.number().int().nonnegative(),
      limit: z.number().int().positive().nullable(),
    }),
  }),
  /** Projects the account owns, most recently changed first. */
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      source: projectSource,
      sizeBytes: z.number().int().nonnegative(),
      /** People invited besides the owner. */
      members: z.number().int().nonnegative(),
      /** Unexpired review links. */
      reviewLinks: z.number().int().nonnegative(),
      createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
    }),
  ),
  /** Other people's projects the account was invited to. */
  memberOf: z.number().int().nonnegative(),
  /** Unexpired sessions, most recently used first. No IP addresses. */
  sessions: z.array(
    z.object({
      id: z.string(),
      client: z.enum(["browser", "desktop"]),
      deviceName: z.string().nullable(),
      app: projectApp.nullable(),
      userAgent: z.string().nullable(),
      createdAt: z.iso.datetime(),
      lastActiveAt: z.iso.datetime(),
      expiresAt: z.iso.datetime(),
    }),
  ),
});
export type AdminUserResponse = z.infer<typeof adminUserResponse>;

// Admin actions: POST /api/admin/users/:id/<action> (admin browser session, same Origin). Each
// one is written to the audit log; 204 when done. Admin accounts can't be suspended, signed out
// or deleted (409 admin_account).

export const adminActionName = z.enum([
  "suspend",
  "unsuspend",
  "sign_out",
  "resend_verification",
  "send_password_reset",
  "mark_verified",
  "grant_plan",
  "end_grant",
  "turn_off_two_step",
  "delete",
]);
export type AdminActionName = z.infer<typeof adminActionName>;

/** POST …/suspend: ends every session and pauses the account's review links until lifted or `until`. */
export const suspendRequest = z.object({
  reason: z.string().trim().min(1, "Give a reason").max(500),
  /** Unset or null: until an admin lifts it. */
  until: z.iso.datetime().nullish(),
});
export type SuspendRequest = z.infer<typeof suspendRequest>;

/** POST …/grant-plan: Plus or Pro without Stripe until the end of `endsOn` (UTC). Replaces a running grant. */
export const grantPlanRequest = z.object({
  plan: paidPlan,
  endsOn: z.iso.date(),
  note: z.string().trim().max(500).optional(),
});
export type GrantPlanRequest = z.infer<typeof grantPlanRequest>;

/** POST …/delete: the account's email, typed to confirm. */
export const adminDeleteRequest = z.object({ email: z.string().min(1).max(320) });
export type AdminDeleteRequest = z.infer<typeof adminDeleteRequest>;

/** One row of the audit log. */
export const adminActionEntry = z.object({
  id: z.string(),
  createdAt: z.iso.datetime(),
  adminEmail: z.string(),
  action: adminActionName,
  targetUserId: z.string().nullable(),
  /** Null once the account was deleted. */
  targetEmail: z.string().nullable(),
  details: z.record(z.string(), z.string().nullable()).nullable(),
});
export type AdminActionEntry = z.infer<typeof adminActionEntry>;

/** GET /api/admin/audit?page=: newest first, 50 a page. */
export const adminAuditResponse = z.object({
  entries: z.array(adminActionEntry),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type AdminAuditResponse = z.infer<typeof adminAuditResponse>;

/** A number now and a week earlier, for the Insights page's top row. */
export const insightsTotal = z.object({
  value: z.number(),
  previous: z.number(),
});
export type InsightsTotal = z.infer<typeof insightsTotal>;

/** One line or stack of a weekly chart: a name (app, method) and a count per week. */
export const insightsSeries = z.object({
  name: z.string(),
  counts: z.array(z.number().nonnegative()),
});
export type InsightsSeries = z.infer<typeof insightsSeries>;

export const INSIGHTS_WEEKS = [4, 12, 52] as const;

/** GET /api/admin/insights?weeks=4|12|52: the product statistics, counts only. */
export const adminInsightsResponse = z.object({
  weeks: z.number().int().positive(),
  /** The Monday (UTC) each week of the charts starts on, oldest first; the last week is this one. */
  weekStarts: z.array(z.string()),
  totals: z.object({
    accounts: insightsTotal,
    weeklyActive: insightsTotal,
    newAccounts: insightsTotal,
    /** Share (0 to 1) of the accounts made 7 to 35 days ago with a project in their first week. */
    activation: insightsTotal,
    /** Null while billing is off. */
    paying: insightsTotal.nullable(),
  }),
  /** By sign-in method. */
  signUps: z.array(insightsSeries),
  /** Accounts active in each week, by app. */
  weeklyActive: z.array(insightsSeries),
  /** By app. */
  projectsCreated: z.array(insightsSeries),
  planChanges: z.object({
    upgrades: z.array(z.number().nonnegative()),
    cancellations: z.array(z.number().nonnegative()),
  }),
  /** The last eight weekly sign-up cohorts, oldest first. */
  retention: z.array(
    z.object({
      weekStart: z.string(),
      size: z.number().int().nonnegative(),
      /** Share active again in week 1 to 8 after signing up; null for weeks still to come. */
      shares: z.array(z.number().nullable()),
    }),
  ),
  /** Update checks per day over the last 7 full days, by app, version and system. */
  updateChecks: z.array(
    z.object({
      app: z.string(),
      version: z.string(),
      os: z.string(),
      perDay: z.number().nonnegative(),
    }),
  ),
});
export type AdminInsightsResponse = z.infer<typeof adminInsightsResponse>;

/**
 * A clip from the Binder browser extension (`apps/binder/clipper`): a web page
 * saved into a binder, with the highlights made on it. The extension hands this
 * to the Binder web app over window.postMessage; the app validates it with this
 * schema before it writes anything. It is not an HTTP payload.
 */

/** The highlight categories, as Binder writes them in the highlights file. */
export const clipCategory = z.enum([
  "claim",
  "definition",
  "method",
  "finding",
  "quote",
]);
export type ClipCategory = z.infer<typeof clipCategory>;

export const clipHighlight = z.object({
  /** The highlight's id in the page, unique per page. */
  id: z.string().min(1).max(16),
  category: clipCategory,
  /** The highlighted text, on one line. */
  text: z.string().min(1).max(2000),
});
export type ClipHighlight = z.infer<typeof clipHighlight>;

/** The largest page HTML a clip carries, in characters. */
export const CLIP_MAX_HTML = 4_000_000;

/** A web address a clip may carry: http or https, nothing else. */
const clipUrl = z
  .string()
  .max(4096)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Only web addresses can be clipped.");

export const clipPayload = z.object({
  /** "page" keeps the page's article; "selection" saves the chosen text as a highlight. */
  kind: z.enum(["page", "selection"]),
  /** The page's address, as the clipping tab ended up at it. */
  url: clipUrl,
  /** The page's title. */
  title: z.string().max(300),
  /** The page's byline, when it has one. */
  author: z.string().max(300).optional(),
  /** The page's HTML as the clipping tab had it; the app keeps the article it holds. */
  html: z.string().max(CLIP_MAX_HTML).optional(),
  /** The selected text, when kind is "selection". */
  text: z.string().max(20_000).optional(),
  /** The highlights made on the page so far, including the selection when kind is "selection". */
  highlights: z.array(clipHighlight).max(500),
  /** The binder (project) the clip goes to. */
  binder: z.uuid(),
  /** When the clip was made. */
  at: z.iso.datetime().optional(),
});
export type ClipPayload = z.infer<typeof clipPayload>;

export * from "./paths.js";

// ---------- Lookups ----------

/**
 * What GET /api/lookup/work looks a work up by: a DOI (Crossref, then DataCite), an ISBN
 * (Open Library), an arXiv ID (DataCite, by the DOI arXiv gives every preprint) or a PubMed ID
 * (PubMed; `PMC…` for PubMed Central). The apps never ask those services themselves.
 */
export const lookupKind = z.enum(["doi", "isbn", "arxiv", "pubmed", "openalex"]);
export type LookupKind = z.infer<typeof lookupKind>;

export const LOOKUP_IDS: Record<LookupKind, RegExp> = {
  doi: /^10\.\d{4,9}\/[!-~]{1,200}$/,
  isbn: /^(?:\d{9}[\dX]|97[89]\d{10})$/,
  arxiv: /^(?:\d{4}\.\d{4,5}|[a-z]+(?:-[a-z]+)?(?:\.[A-Z]{2})?\/\d{7})$/,
  pubmed: /^(?:\d{1,9}|PMC\d{1,9})$/,
  /** A work's OpenAlex ID, as paper search gives it: needs OPENALEX_API_KEY. */
  openalex: /^W\d{1,12}$/,
};

/** GET /api/lookup/work?kind=…&id=… */
export const lookupWorkQuery = z.object({
  kind: lookupKind,
  id: z.string().min(1).max(220),
});
export type LookupWorkQuery = z.infer<typeof lookupWorkQuery>;

/** A work as a lookup found it, the fields the apps' references have; empty when unknown. */
export const lookedUpWork = z.object({
  type: z.enum([
    "article",
    "book",
    "chapter",
    "conference",
    "thesis",
    "report",
    "webpage",
    "other",
  ]),
  /** Names as "Family, Given"; an organization as its name. */
  author: z.array(z.string()),
  editor: z.array(z.string()),
  title: z.string(),
  year: z.string(),
  /** The journal, the book a chapter is in, the proceedings, or "arXiv". */
  container: z.string(),
  publisher: z.string(),
  place: z.string(),
  volume: z.string(),
  issue: z.string(),
  pages: z.string(),
  doi: z.string(),
  url: z.string(),
  isbn: z.string(),
  /** The arXiv ID, without its version. */
  arxiv: z.string(),
  /** The PubMed ID. */
  pmid: z.string(),
});
export type LookedUpWork = z.infer<typeof lookedUpWork>;

/** GET /api/lookup/work: 404 not_found when the source knows no such work. */
export const lookupWorkResponse = z.object({ work: lookedUpWork });
export type LookupWorkResponse = z.infer<typeof lookupWorkResponse>;

/** GET /api/lookup/open-access?doi=…: free PDFs of the work with this DOI, as Unpaywall knows them. */
export const openAccessQuery = z.object({ doi: z.string().min(1).max(220) });
export type OpenAccessQuery = z.infer<typeof openAccessQuery>;

/** Links to free PDFs, best first; empty when Unpaywall knows none or doesn't know the DOI. */
export const openAccessResponse = z.object({ pdfs: z.array(z.string()) });
export type OpenAccessResponse = z.infer<typeof openAccessResponse>;

/**
 * GET /api/lookup/search?q=…: papers whose title or authors match the words, from OpenAlex. It
 * runs on Scholarkit's key for Pro, or on the caller's own key: sent as an `OpenAlex-Key` header
 * (also without an account) or kept with the account. Without either: 403 pro_needed.
 */
export const paperSearchQuery = z.object({ q: z.string().trim().min(3).max(200) });
export type PaperSearchQuery = z.infer<typeof paperSearchQuery>;

/** A paper search found: the work as a lookup has it, and whether a free PDF of it is known. */
export const foundPaper = lookedUpWork.extend({
  /** OpenAlex's ID, e.g. W2741809807. */
  openAlexId: z.string(),
  freePdf: z.boolean(),
  /**
   * False when the search found only the title, authors and DOI (Plus): the apps look the work
   * up by its OpenAlex ID (`kind=openalex`) before adding it.
   */
  detailed: z.boolean(),
});
export type FoundPaper = z.infer<typeof foundPaper>;

export const paperSearchResponse = z.object({ works: z.array(foundPaper) });
export type PaperSearchResponse = z.infer<typeof paperSearchResponse>;

/** GET /api/account/openalex-key: whether the account keeps an own key, and how it ends. */
export const openAlexKeyResponse = z.object({
  saved: z.boolean(),
  /** The key's last four characters. */
  ending: z.string().nullable(),
});
export type OpenAlexKeyResponse = z.infer<typeof openAlexKeyResponse>;

/** PUT /api/account/openalex-key: checked with OpenAlex once, then kept encrypted. */
export const openAlexKeyRequest = z.object({ key: z.string().trim().min(8).max(200) });
export type OpenAlexKeyRequest = z.infer<typeof openAlexKeyRequest>;
