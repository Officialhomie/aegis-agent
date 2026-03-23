import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ControlLandingPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Aeg-control</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Policy-governed agent sponsorship console on top of OpenClaw + Aegis. Define which
          commands may trigger sponsored execution, enforce caps, revoke instantly, and read
          human-readable execution summaries with full audit linkage.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Infrastructure (existing)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="list-inside list-disc space-y-1">
              <li>OpenClaw NL → typed commands (`POST /api/openclaw`)</li>
              <li>Aegis Observe → Reason → Policy → Execute</li>
              <li>Delegation, MDF, paymaster sponsorship rules</li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Product layer (Aeg-control)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="list-inside list-disc space-y-1">
              <li>Guided onboarding + session ↔ protocol binding</li>
              <li>`POST /api/control/execute` policy gate before execution</li>
              <li>Sponsored-method catalog, caps, premium tier mock</li>
              <li>Product execution records + OpenClaw audit correlation</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/control/onboarding">Start onboarding</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/control/chat">Open gated chat</Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Judges: see <code className="rounded bg-muted px-1">docs/HACKATHON_PRODUCT_SCOPE.md</code> for
        an honest split of infra vs hackathon work. Use the Policy page to allowlist `sponsor`,
        `cycle`, and `campaign` before running sponsored commands from Chat.
      </p>
    </div>
  );
}
