import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk, useAuth } from '@clerk/react';
import { enUS } from '@clerk/localizations';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Btn } from '@/components/kit';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Shell } from '@/components/shell';
import { WorkspaceProvider } from '@/lib/store';
import { I18nProvider, useI18n, type Locale } from '@/lib/i18n';
import {
  Route,
  Redirect,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
const Dashboard = lazy(() => import('@/pages/dashboard'));
const Assistant = lazy(() => import('@/pages/assistant'));
const Documents = lazy(() => import('@/pages/documents'));
const Builder = lazy(() => import('@/pages/builder'));
const Assets = lazy(() => import('@/pages/assets'));
const Tokenize = lazy(() => import('@/pages/tokenize'));
const Settings = lazy(() => import('@/pages/settings'));
const Knowledge = lazy(() => import('@/pages/knowledge'));
const LaunchpadAnalytics = lazy(() =>
  import('@/pages/launchpad').then((module) => ({ default: module.LaunchpadAnalytics })),
);
const LaunchpadCreate = lazy(() =>
  import('@/pages/launchpad').then((module) => ({ default: module.LaunchpadCreate })),
);
const LaunchpadExplore = lazy(() =>
  import('@/pages/launchpad').then((module) => ({ default: module.LaunchpadExplore })),
);
const LaunchpadGuide = lazy(() =>
  import('@/pages/launchpad').then((module) => ({ default: module.LaunchpadGuide })),
);
const LaunchpadHistory = lazy(() =>
  import('@/pages/launchpad').then((module) => ({ default: module.LaunchpadHistory })),
);
const LaunchpadOverview = lazy(() =>
  import('@/pages/launchpad').then((module) => ({ default: module.LaunchpadOverview })),
);
const LaunchpadTokenDetail = lazy(() =>
  import('@/pages/launchpad').then((module) => ({ default: module.LaunchpadTokenDetail })),
);
const LaunchpadTokens = lazy(() =>
  import('@/pages/launchpad').then((module) => ({ default: module.LaunchpadTokens })),
);
const ContractStudio = lazy(() => import('@/pages/contract-studio'));
const Web3Contracts = lazy(() => import('@/pages/web3-contracts'));
const DataTokenization = lazy(() => import('@/pages/data-tokenization'));
const Payments = lazy(() => import('@/pages/payments'));
const PaymentAdmin = lazy(() => import('@/pages/payment-admin'));
const MainnetPreparation = lazy(() => import('@/pages/mainnet-preparation'));
const LaunchpadWalletProvider = lazy(() =>
  import('@/lib/launchpad-wallet').then((module) => ({ default: module.LaunchpadWalletProvider })),
);
const WalletControl = lazy(() =>
  import('@/components/wallet-control').then((module) => ({ default: module.WalletControl })),
);
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const clerkLocalizations = {
  en: enUS,
} satisfies Record<Locale, typeof enUS>;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY. Configure Clerk before running TINANAI.');
}

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#39c8d4',
    colorForeground: '#e7edf4',
    colorMutedForeground: '#9aabba',
    colorDanger: '#f87171',
    colorBackground: '#0b1728',
    colorInput: '#101e31',
    colorInputForeground: '#edf4f9',
    colorNeutral: '#344a60',
    fontFamily: 'Manrope, sans-serif',
    borderRadius: '0.7rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#0b1728] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-slate-100 font-bold tracking-tight',
    headerSubtitle: 'text-slate-300',
    socialButtonsBlockButtonText: 'text-slate-100 font-semibold',
    formFieldLabel: 'text-slate-200 font-semibold',
    footerActionLink: 'text-cyan-200 font-semibold',
    footerActionText: 'text-slate-300',
    dividerText: 'text-slate-400',
    identityPreviewEditButton: 'text-cyan-200',
    formFieldSuccessText: 'text-emerald-300',
    alertText: 'text-rose-200',
    logoBox: 'mb-1',
    logoImage: 'max-h-12',
    socialButtonsBlockButton: 'border-slate-600 bg-slate-900/70 hover:bg-slate-800',
    formButtonPrimary: 'bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-bold',
    formFieldInput: 'bg-slate-900 border-slate-600 text-slate-100',
    footerAction: 'text-slate-300',
    dividerLine: 'bg-slate-700',
    alert: 'border-rose-400/30 bg-rose-950/40',
    otpCodeFieldInput: 'bg-slate-900 border-slate-600 text-slate-100',
    formFieldRow: 'text-slate-200',
    main: 'text-slate-100',
  },
};

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Loading workspace…</p>}>
        <Switch>
          <Route path="/" component={PublicHome} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/assistant" component={Assistant} />
          <Route path="/documents" component={Documents} />
          <Route path="/builder" component={Builder} />
          <Route path="/assets" component={Assets} />
          <Route path="/tokenize" component={Tokenize} />
          <Route path="/contracts" component={Web3Contracts} />
          <Route path="/mainnet-preparation" component={MainnetPreparation} />
          <Route path="/payments/admin" component={PaymentAdmin} />
          <Route path="/payments" component={Payments} />
          <Route path="/data-tokenization" component={DataTokenization} />
          <Route path="/launchpad/token/:id" component={LaunchpadTokenDetail} />
          <Route path="/launchpad/create" component={LaunchpadCreate} />
          <Route path="/launchpad/contracts" component={ContractStudio} />
          <Route path="/launchpad/explore" component={LaunchpadExplore} />
          <Route path="/launchpad/tokens" component={LaunchpadTokens} />
          <Route path="/launchpad/analytics" component={LaunchpadAnalytics} />
          <Route path="/launchpad/history" component={LaunchpadHistory} />
          <Route path="/launchpad/guide" component={LaunchpadGuide} />
          <Route path="/launchpad" component={LaunchpadOverview} />
          <Route path="/settings" component={Settings} />
          <Route path="/knowledge" component={Knowledge} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </RoutedErrorBoundary>
  );
}

function PublicHome() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <Dashboard />;
  return isSignedIn ? <Redirect to="/dashboard" /> : <Dashboard />;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function SignInPage() {
  return (
    <div className="relative isolate flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_35%,rgba(22,112,145,.22),transparent_55%)]" />
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="relative isolate flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_35%,rgba(22,112,145,.22),transparent_55%)]" />
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) client.clear();
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function AppRoutes() {
  const [, setLocation] = useLocation();
  const { locale } = useI18n();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={clerkLocalizations[locale]}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkQueryClientCacheInvalidator />
      <Switch>
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route component={RoutedApplication} />
      </Switch>
    </ClerkProvider>
  );
}

function RoutedApplication() {
  const [location] = useLocation();
  const [walletEnabled, setWalletEnabled] = useState(false);
  const [openWalletOnActivation, setOpenWalletOnActivation] = useState(false);
  const routeNeedsWallet = walletRouteNeedsProvider(stripBase(location));

  useEffect(() => {
    if (routeNeedsWallet) setWalletEnabled(true);
  }, [routeNeedsWallet]);

  const walletControl = walletEnabled || routeNeedsWallet
    ? <WalletControl autoOpen={openWalletOnActivation} />
    : <WalletActivator onActivate={() => {
        setOpenWalletOnActivation(true);
        setWalletEnabled(true);
      }} />;
  const application = (
    <Shell walletControl={walletControl}>
      <Router />
    </Shell>
  );

  if (!walletEnabled && !routeNeedsWallet) return application;
  return (
    <Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Loading wallet tools…</p>}>
      <LaunchpadWalletProvider>{application}</LaunchpadWalletProvider>
    </Suspense>
  );
}

function WalletActivator({ onActivate }: { onActivate: () => void }) {
  return (
    <Btn size="sm" variant="gold" onClick={onActivate} data-testid="button-connect-wallet">
      Connect Wallet
    </Btn>
  );
}

function walletRouteNeedsProvider(path: string) {
  return path === '/payments'
    || path.startsWith('/payments/')
    || path === '/contracts'
    || path === '/launchpad'
    || path.startsWith('/launchpad/');
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <I18nProvider>
          <WouterRouter base={basePath}>
            <WorkspaceProvider>
              <AppRoutes />
            </WorkspaceProvider>
          </WouterRouter>
          <Toaster />
        </I18nProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
