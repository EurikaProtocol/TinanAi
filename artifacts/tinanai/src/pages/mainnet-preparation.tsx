import { MainnetDeploymentAdmin } from '@/components/mainnet-preparation';

/** Independent of payment-admin: no payment account/catalog initialization. */
export default function MainnetPreparation() {
  return <div className="mx-auto max-w-5xl space-y-4">
    <h1 className="text-2xl font-semibold">New token Mainnet preparation</h1>
    <p className="text-sm text-muted-foreground">Read-only preparation, separate from billing. No deployment or simulation controls are enabled.</p>
    <MainnetDeploymentAdmin />
  </div>;
}
