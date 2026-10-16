import { SignInButton } from "@clerk/clerk-react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { aiUsesLabel } from "./aiUsesLabel";

// Display only. What people are actually charged is the Stripe price behind
// STRIPE_PRICE_* on the Convex deployment, so keep the two in step.
const PLANS = [
  {
    kind: "monthly",
    name: "Pro monthly",
    price: "$4 / month",
    detail: "Full stats, custom topics, 300 AI uses a month.",
  },
  {
    kind: "yearly",
    name: "Pro yearly",
    price: "$36 / year",
    detail: "Same as monthly, three months free.",
  },
  {
    kind: "pack",
    name: "Lifetime pack",
    price: "$100 once",
    detail: "Full stats and custom topics for good, plus 1000 AI uses that never expire.",
  },
];

const TIER_LABELS = {
  free: "Free",
  pro: "Pro",
  comped: "Pro (comped)",
  lifetime: "Lifetime",
};

/** Convex wraps thrown messages as "[CONVEX A(...)] ... Uncaught Error: <msg>". */
const readableError = (err) =>
  String(err?.message ?? err).split("Uncaught Error: ").pop().split("\n")[0];

/**
 * A button that opens the plans dialog. Self-contained (reads the account
 * itself), so any screen can offer an upgrade without threading props.
 */
export function UpgradeButton({ className = "btn", children = "Upgrade" }) {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.entitlements.me, isAuthenticated ? {} : "skip");
  const createCheckout = useAction(api.stripe.createCheckout);
  const createPortal = useAction(api.stripe.createPortal);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  if (!isAuthenticated) {
    return (
      <SignInButton mode="modal">
        <button className={className}>{children}</button>
      </SignInButton>
    );
  }

  const go = async (key, call) => {
    setBusy(key);
    setError("");
    try {
      window.location.assign(await call());
    } catch (err) {
      setError(readableError(err) || "Something went wrong. Try again.");
      setBusy(null);
    }
  };

  return (
    <Dialog onOpenChange={() => setError("")}>
      <DialogTrigger asChild>
        <button className={className}>{children}</button>
      </DialogTrigger>
      {/* Pinned to the app palette: the shadcn tokens are the light set here. */}
      <DialogContent className="bg-[var(--bg-card)] border-[#2e2e2e] text-[var(--text-primary)]">
        <DialogHeader>
          <DialogTitle>Plans</DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)]">
            {me
              ? `You're on ${TIER_LABELS[me.tier]}. ${aiUsesLabel(me)}.`
              : "Loading your plan..."}{" "}
            Prices are in AUD and just cover running costs.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {PLANS.map((plan) => {
            const alreadyHave =
              plan.kind !== "pack" && (me?.tier === "pro" || me?.tier === "comped");
            return (
              <div
                key={plan.kind}
                className="flex items-center justify-between gap-4 rounded-md border border-[#2e2e2e] bg-[var(--bg-input)] p-3"
              >
                <div className="text-left">
                  <div className="font-semibold">
                    {plan.name}{" "}
                    <span className="text-[var(--accent-primary)]">{plan.price}</span>
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">{plan.detail}</div>
                </div>
                <button
                  className="btn btn-primary shrink-0"
                  disabled={busy !== null || alreadyHave || !me}
                  onClick={() => go(plan.kind, () => createCheckout({ kind: plan.kind }))}
                >
                  {busy === plan.kind ? "Opening..." : alreadyHave ? "Current" : "Choose"}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <p role="alert" className="text-sm text-[var(--color-error)]">
            {error}
          </p>
        )}

        {me?.hasBillingAccount && (
          <button
            className="btn self-start"
            disabled={busy !== null}
            onClick={() => go("portal", () => createPortal({}))}
          >
            {busy === "portal" ? "Opening..." : "Manage billing"}
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
