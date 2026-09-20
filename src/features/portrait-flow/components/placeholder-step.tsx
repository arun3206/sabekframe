import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { MobilePageContainer } from "@/components/layout/mobile-page-container";
import { StickyBottomAction } from "@/components/layout/sticky-bottom-action";
import { Card } from "@/components/ui/card";
import { StepProgress } from "@/components/ui/step-progress";

export function PlaceholderStep({
  step,
  title,
  nextHref,
}: {
  step: number;
  title: string;
  nextHref?: string;
}) {
  return (
    <>
      <AppHeader />
      <MobilePageContainer>
        <StepProgress current={step} total={5} />
        <Card>
          <p className="eyebrow">Step {step} of 5</p>
          <h1>{title}</h1>
          <p className="muted">
            This route is ready for its dedicated feature implementation.
          </p>
        </Card>
        {nextHref ? (
          <StickyBottomAction>
            <Link className="button" href={nextHref}>
              Continue
            </Link>
          </StickyBottomAction>
        ) : null}
      </MobilePageContainer>
    </>
  );
}
